'use strict';
// Discover the exact, existing catalog files that define an AI agent/harness.
// Never execute catalog scripts or follow arbitrary user-supplied paths.
const fs=require('node:fs/promises');
const path=require('node:path');
const AGENT=/^ai-harness\/agents\/[a-z0-9-]+\.json$/;
const WORKFLOW=/^ai-harness\/workflows\/[a-z0-9-]+\.json$/;
const HARNESS=/^ai-harness\/manifest\.json$/;
const ROLE=/^roles\/[a-z0-9-]+\/SKILL\.md$/;
const SKILL=/^ai-harness\/skills\/[a-z0-9-]+\/(?:SKILL\.md|skill\.json)$/;
const POLICY=/^ai-harness\/(?:policies\/guardrails|tools\/registry|context\/selection)\.json$/;
async function get(root,p){
 if(![AGENT,WORKFLOW,HARNESS,ROLE,SKILL,POLICY].some(r=>r.test(p)))return null;
 let cur=root;
 for(const s of p.split('/')){cur=path.join(cur,s);let st;
  try{st=await fs.lstat(cur);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(st.isSymbolicLink())return null;
 }
 const st=await fs.stat(cur);if(!st.isFile()||st.size>131072)return null;
 return fs.readFile(cur,'utf8');
}
async function relatedFiles({root,relative,content}){
 if(!AGENT.test(relative)&&!WORKFLOW.test(relative)&&!HARNESS.test(relative))return [];
 const found=new Map();
 const add=async(p,label,type,via='')=>{if(found.size>=26||found.has(p))return;const raw=await get(root,p);if(raw!==null)found.set(p,{path:p,label,type,via});};
 const json=async(p,override)=>{const raw=override===undefined?await get(root,p):override;if(!raw)return null;try{return JSON.parse(raw);}catch{return null;}};
 let agent,workflow=[];
 if(AGENT.test(relative)){
  await add(relative,'Agent · '+path.basename(relative),'agent');
  agent=await json(relative,content);
 }else if(WORKFLOW.test(relative)){
  await add(relative,'Workflow · '+path.basename(relative),'workflow');
  const val=await json(relative,content);
  if(val&&/^[a-z0-9-]+$/.test(val.agent||'')){
   const agentPath=`ai-harness/agents/${val.agent}.json`;
   await add(agentPath,'Agent · '+val.agent,'agent');if(found.has(relative))found.get(relative).via=agentPath;agent=await json(agentPath);
  }
  workflow.push({path:relative,val});
 }else{
  await add(relative,'Harness · manifest.json','harness');
  const manifest=await json(relative,content);
  for(const entry of (Array.isArray(manifest?.agents)?manifest.agents:[]).slice(0,8)){
   const p=typeof entry==='string'?entry:entry?.path;
   if(AGENT.test(p||''))await add(p,'Agent · '+path.basename(p),'agent',relative);
  }
 }
 if(agent){
  if(ROLE.test(agent.roleSkill||''))await add(agent.roleSkill,'Role · SKILL.md','role',`ai-harness/agents/${agent.id}.json`);
  for(const id of (Array.isArray(agent.workflows)?agent.workflows:[]).slice(0,8)){
   if(typeof id!=='string'||!/^[a-z0-9-]+$/.test(id))continue;
   const p=`ai-harness/workflows/${id}.json`;
   await add(p,'Workflow · '+id,'workflow',`ai-harness/agents/${agent.id}.json`);workflow.push({path:p,val:await json(p)});
  }
 }
 for(const w of workflow){
  const skillIDs=new Set();
  for(const step of Array.isArray(w.val?.steps)?w.val.steps:[])
   for(const id of Array.isArray(step.skills)?step.skills:[])if(typeof id==='string'&&/^[a-z0-9-]+$/.test(id))skillIDs.add(id);
  for(const id of skillIDs){
   await add(`ai-harness/skills/${id}/SKILL.md`,'AI · '+id,'skill',w.path);
   await add(`ai-harness/skills/${id}/skill.json`,'Version · '+id,'metadata',`ai-harness/skills/${id}/SKILL.md`);
  }
 }
 for(const [p,label] of [['ai-harness/policies/guardrails.json','Guardrails'],['ai-harness/tools/registry.json','Tool registry'],['ai-harness/context/selection.json','Context selection']]){
  // These files are important for most agents, but are explicitly allowed.
  if(await get(root,p)!==null)found.set(p,{path:p,label,type:'policy',via:relative});
 }
 return [...found.values()].slice(0,26);
}
module.exports={relatedFiles};
