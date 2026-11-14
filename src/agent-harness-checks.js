'use strict';
// A trusted, read-only configuration check. Catalog JavaScript is never executed.
// Runtime agent-quality tests require execution traces and are NOT replaced by these checks.
const path = require('node:path');
const {validResource,validateResource} = require('./sdlc-library-studio');
const fs = require('node:fs/promises');
function item(label,status,detail){return {label,status,detail};}
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
async function catalogRead(root,relative){
 validResource(relative);
 let cursor=path.resolve(root);
 const segments=relative.split('/');
 for(const [index,part] of segments.entries()){
  cursor=path.join(cursor,part);
  const s=await fs.lstat(cursor).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!s||s.isSymbolicLink())return null;
  if(index<segments.length-1&&!s.isDirectory())return null;
  if(s.isFile()&&s.size>128*1024)return null;
 }
 const stat=await fs.lstat(cursor);
 if(!stat.isFile())return null;
 return fs.readFile(cursor,'utf8');
}
async function run({root,relative,content}){
 if(!root||typeof content!=='string')throw Error('Select a catalog resource first.');
 validResource(relative);
 if(!/^ai-harness\/(?:agents\/[^/]+\.json|workflows\/[^/]+\.json|manifest\.json)$/.test(relative))throw Error('Agent and harness configuration checks apply only to agent definitions, workflow definitions or the harness manifest.');
 const checks=[];
 let cfg=null;
 try{validateResource(relative,content);if(/\.json$/i.test(relative))cfg=JSON.parse(content);}
 catch(e){return {kind:'static',valid:false,checks:[item('Configuration','fail',e.message)],note:'These are static configuration checks only. Agent behavior and live execution traces were not tested.'};}
 if(!isObj(cfg)){
  checks.push(item('Context','pass','Skill text parses and meets the basic resource requirements.'));
  checks.push(item('Tools','not-tested','Tool selection requires an execution trace.'));
  checks.push(item('Loop','not-tested','Stalls and premature completion require an execution trace.'));
  checks.push(item('Governance','not-tested','Runtime permission enforcement requires an execution trace.'));
  return {kind:'static',valid:true,checks,note:'No AI model was run; only static skill requirements were checked.'};
 }
 const isAgent=/^ai-harness\/agents\/[^/]+\.json$/.test(relative);
 const isWorkflow=/^ai-harness\/workflows\/[^/]+\.json$/.test(relative);
 if(!isAgent&&!isWorkflow){
  checks.push(item('Context','pass','JSON syntax and basic resource validation passed.'));
  checks.push(item('Tools','not-tested','Agent tool selection requires an execution trace.'));
  checks.push(item('Loop','not-tested','Agent progress requires an execution trace.'));
  checks.push(item('Governance','not-tested','Runtime permissions require execution evidence.'));
  return {kind:'static',valid:true,checks,note:'No AI model or downloaded script was executed.'};
 }
 let workflows=[];
 if(isAgent){
  const role=typeof cfg.roleSkill==='string'&&/^roles\/[^/]+\/SKILL\.md$/.test(cfg.roleSkill)?await catalogRead(root,cfg.roleSkill):null;
  workflows=Array.isArray(cfg.workflows)?cfg.workflows:[];
  const missing=[];
  for(const id of workflows){
   if(typeof id!=='string'||!/^[a-z0-9-]+$/.test(id)){missing.push(String(id));continue;}
   const file=await catalogRead(root,`ai-harness/workflows/${id}.json`);
   if(!file){missing.push(id);continue;}
   try{const data=JSON.parse(file);if(data.id!==id||data.agent!==cfg.id)missing.push(id+' (mismatched agent)');}catch{missing.push(id+' (invalid JSON)');}
  }
  checks.push(item('Context',role&&workflows.length&&missing.length===0?'pass':'fail',
   !role?'Role skill missing or unsafe.':!workflows.length?'No referenced workflow.':missing.length?'Missing or mismatched workflows: '+missing.join(', '):'Role skill and '+workflows.length+' workflow reference(s) resolve in the catalog.'));
  const permissions=cfg.permissions;
  checks.push(item('Tools',Array.isArray(permissions)&&permissions.length&&permissions.every(p=>typeof p==='string'&&/^[a-z_]+$/.test(p))?'pass':'fail',
   'Declared capability IDs: '+(Array.isArray(permissions)?permissions.join(', '):'none')+'. Actual tool choice requires a trace.'));
  checks.push(item('Loop','not-tested','Workflow progress, retry limits and completion require a runtime trace.'));
  const git=cfg.id==='git-agent';
  const safe=!git||(cfg.execution==='atgv-core-only'&&['create_branch','commit_file','create_pull_request'].every(p=>cfg.userApprovalRequiredFor?.includes(p))&&['force_push','direct_push_main','secrets_access'].every(p=>cfg.forbidden?.includes(p)));
  checks.push(item('Governance',safe?'pass':'fail',git?(safe?'Git Agent declares trusted execution, user approval and prohibited actions.':'Git Agent lacks required approval, restricted execution or forbidden actions.'):'No obvious privileged Git Agent exception. Runtime policy enforcement not exercised.'));
 }else{
  const role=cfg.agent&&typeof cfg.agent==='string'&&/^[a-z0-9-]+$/.test(cfg.agent)?await catalogRead(root,`ai-harness/agents/${cfg.agent}.json`):null;
  const steps=Array.isArray(cfg.steps)?cfg.steps:[];
  const ids=steps.map(s=>s?.id);
  checks.push(item('Context',role&&steps.length?'pass':'fail',role?`${steps.length} workflow step(s); referenced agent exists.`:'Referenced agent is absent or invalid.'));
  let missing=[];
  for(const s of steps){for(const skill of s.skills||[]){if(typeof skill!=='string'||!/^[a-z0-9-]+$/.test(skill)||!await catalogRead(root,`ai-harness/skills/${skill}/SKILL.md`))missing.push(String(skill));}}
  checks.push(item('Tools',missing.length?'fail':'pass',missing.length?'Missing skill references: '+[...new Set(missing)].join(', '):'All declared specialist skills resolve. Tool selection itself is not exercised.'));
  const finite=steps.length>0&&steps.length<=50&&new Set(ids).size===ids.length&&ids.every(x=>typeof x==='string'&&/^[a-z0-9-]+$/.test(x));
  checks.push(item('Loop',finite?'pass':'fail',finite?'Finite unique step IDs declared; runtime retries and stalls still need trace testing.':'Workflow has missing, duplicate or excessive steps.'));
  const guards=steps.every(s=>s.guard==='atgv-core')&&cfg.execution?.runtime==='atgv-core'&&cfg.execution?.catalogScriptsAutoExecute===false&&cfg.execution?.pinRunSnapshot===true;
  const approval=steps.some(s=>s.requiresEvidence===true);
  checks.push(item('Governance',guards&&approval?'pass':'fail',guards&&approval?'Trusted core guards, pinned execution and evidence steps declared.':'Missing core guards, no-auto-execution rules, snapshot pinning, or evidence requirements.'));
 }
 return {kind:'static',valid:!checks.some(x=>x.status==='fail'),checks,note:'Static checks only. Context use, actual tool choice, stalls, permissions and completion in a live AI run require recorded execution traces.'};
}
module.exports={run};
