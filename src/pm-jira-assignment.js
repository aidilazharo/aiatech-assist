'use strict';
// PM Jira assignee planning and safe updates. Jira is authoritative for the
// caller's ASSIGN_ISSUES permission and the selected user's assignability.
// An Epic is shared. Assign each explicitly scoped SDLC role independently.
const KEY=/^[A-Z][A-Z0-9_]{1,20}-[1-9][0-9]*$/;
const ACCOUNT=/^[^\s<>]{1,240}$/;
function issueKey(value){const key=String(value||'').toUpperCase();if(!KEY.test(key))throw Error('Invalid Jira issue key.');return key;}
function group(type){
 const name=String(type||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
 if(/^(?:br|business requirement|business requirements)$/.test(name))return 'br';
 if(name==='epic')return 'epic';
 if(/^(?:story|stories|user story|user stories)$/.test(name))return 'story';
 if(name==='task')return 'task';
 if(/^(?:subtask|sub task)$/.test(name))return 'subtask';
 return 'other';
}
const DEV_LABEL='atgv-role-software-developer';
const ownership=require('./br-ownership');
const {ROLES}=require('./my-work-role-prompts');
const ROLE_LABELS=Object.freeze(Object.fromEntries(Object.entries(ROLES).map(([id,role])=>['atgv-role-'+id,role.name])));
function roleForIssue(issue,register){
 if(!issue||['br','epic'].includes(group(issue.type)))return '';
 const key=String(issue.key||'').toUpperCase();
 const rows=[...Object.entries(register?.synced||{}),...Object.entries(register?.roleTaskMappings||{})].filter(([,row])=>String(row?.key||'').toUpperCase()===key);
 if(rows.length&&new Set(rows.map(([path])=>path)).size!==1)return '';
 const id=mappedRole(issue,rows);
 return ROLES[id]?.name||'';
}
function rosterCandidates(rows,role){
 if(!role)return [];
 return (Array.isArray(rows)?rows:[]).filter(row=>typeof row.id==='string'&&ACCOUNT.test(row.id)&&
  Array.isArray(row.roles)&&row.roles.some(value=>String(value).trim().toLowerCase()===role.toLowerCase()))
  .map(row=>({accountId:row.id,name:String(row.name||'Jira user').slice(0,140)})).slice(0,400);
}
function excludedRole(issue){
 const labels=(Array.isArray(issue?.labels)?issue.labels:[]).map(v=>String(v).toLowerCase());
 const other=labels.find(s=>s.startsWith('atgv-role-')&&s!==DEV_LABEL);
 if(other)return other;
 const summary=String(issue?.summary||'');
 if(/^\s*(?:UI\/UX Design|UI Design|UX Design|QA Verification|Quality Assurance|User Acceptance Testing|UAT|Business Analyst|Solution Architect|Architecture Review|Project Manager|PMO|Security Review)\s*(?:[-—:|]|$)/i.test(summary))
  return 'role-specific: '+summary.slice(0,45);
 return '';
}
function developable(issue,register){
 return !!issue&&roleForIssue(issue,register)==='Developer';
}
function linkedDevelopmentKeys(register,rootKey){
 const synced=register?.synced||{},roleMappings=register?.roleTaskMappings||{};
 const root=Object.entries(synced).find(([path,item])=>/^BR-\d+$/.test(path)&&String(item?.key||'').toUpperCase()===rootKey);
 if(!root)return {keys:[],rootId:''};
 const rootId=root[0],keys=new Set();
 for(const [path,row] of Object.entries(synced)){
  if(path!==rootId&&!path.startsWith(rootId+'/'))continue;
  if(/\/ROLE-(?!DEVELOPER(?:\/|$))[A-Z0-9_-]+/i.test(path))continue;
  if(row?.key)keys.add(issueKey(row.key));
 }
 for(const [path,row] of Object.entries(roleMappings)){
  if(!path.startsWith(rootId+'/'))continue;
  if(String(row?.roleId||'').toLowerCase()!=='developer'&&!/\/ROLE-DEVELOPER$/i.test(path))continue;
  if(row?.key)keys.add(issueKey(row.key));
 }
 return {keys:[...keys],rootId};
}
const aliases={ba:'business-analyst',pm:'project-manager',sa:'solution-architect',uiux:'ux-designer',developer:'software-developer',qa:'qa-engineer',uat:'uat-tester'};
function canonicalRole(value){
 const id=String(value||'').trim().toLowerCase().replace(/^atgv-role-/,'');
 return aliases[id]||(Object.hasOwn(ROLES,id)?id:'');
}
function mappedRole(item,rows){
 const type=group(item.type),feature=/^features?$/i.test(String(item.type||''));
 if(!['task','subtask','story'].includes(type)&&!feature)return '';
 const labels=[...new Set((item.labels||[]).filter(x=>String(x).toLowerCase().startsWith('atgv-role-')).map(canonicalRole))];
 const declared=[];
 for(const [path,row] of rows){
  for(const hint of [row.roleId,row.roleLabel,path.match(/\/ROLE-([^/]+)$/i)?.[1]].filter(Boolean))declared.push(canonicalRole(hint));
 }
 const hints=[...new Set([...labels,...declared])];
 if(hints.length)return hints.length===1?hints[0]:'';
 // Shared Stories/Features are not implicitly Developer-owned. Legacy mapped implementation tasks are.
 if(!['task','subtask'].includes(type))return '';
 return rows.length>0&&rows.every(([path,row])=>! /\/ROLE-/i.test(path)&&/^(task|subtask|sub-task|sub task)$/i.test(String(row.kind||row.issueType||'')))?'software-developer':'';
}
function rolePlans({rootKey,items,projectKey,register}){
 const root=issueKey(rootKey),project=String(projectKey||'').toUpperCase();
 if(!/^[A-Z][A-Z0-9_]{1,20}$/.test(project)||!root.startsWith(project+'-'))throw Error('Selected Jira project does not match this issue.');
 if(!Array.isArray(items)||items.length>20000)throw Error('Refresh the full Jira project inventory before assigning.');
 const map=new Map();
 for(const item of items){const key=issueKey(item.key);if(!key.startsWith(project+'-')||map.has(key))throw Error('Jira inventory has duplicate or foreign-project keys.');map.set(key,{...item,key});}
 const record=map.get(root);
 if(!record||!['br','epic'].includes(group(record.type)))throw Error('Select a BR or Epic in the complete Jira inventory.');
 const brId=ownership.fromKey(register,root);
 const tree=ownership.tree(register,brId);
 if(tree.rootKey!==root)throw Error('Selected Epic is not the approved BR root.');
 const mapped=new Map(),foreign=new Set();
 for(const [path,row] of [...Object.entries(register.synced||{}),...Object.entries(register.roleTaskMappings||{})]){
  if(!row?.key)continue;
  const key=issueKey(row.key);
  if(path!==brId&&!path.startsWith(brId+'/')){foreign.add(key);continue;}
  if(!mapped.has(key))mapped.set(key,[]);
  mapped.get(key).push([path,row]);
 }
 const groups=new Map(),excluded=[];
 for(const [key,rows] of mapped){
  if(foreign.has(key))throw Error('Jira issue is mapped to more than one BR: '+key);
  if(new Set(rows.map(([path])=>path)).size!==1)throw Error('Conflicting Jira mappings: '+key);
  const item=map.get(key);
  if(!item)throw Error('Published BR issue missing from inventory: '+key+'. Refresh or reconcile before assigning.');
  const roleId=key===root?'':mappedRole(item,rows);
  if(!roleId){excluded.push({key,reason:'Shared or unverified role'});continue;}
  const parent=String(item.parentKey||'');
  const markers=[...new Set(rows.map(([,row])=>row.marker).filter(Boolean))];
  if(!markers.every(marker=>(item.labels||[]).includes(marker)))throw Error('Jira mapping marker changed for '+key);
  const expectedParents=[...new Set(rows.map(([,row])=>row.parentKey).filter(Boolean))];
  if(expectedParents.length&&(expectedParents.length!==1||expectedParents[0]!==parent))throw Error('Jira parent changed for '+key);
  if(!groups.has(roleId))groups.set(roleId,[]);
  groups.get(roleId).push({key,updated:String(item.updated||''),owner:String(item.assigneeId||''),ownerName:String(item.assignee||item.assigneeId||''),type:item.type,roleId,parentKey:parent,markers,rows});
 }
 // Count linked but unmapped descendants as excluded; never infer a role from summary alone.
 for(const item of map.values()){
  if(mapped.has(item.key))continue;
  let key=item.parentKey,seen=new Set();
  while(key){if(seen.has(key))throw Error('Cyclic Jira parent hierarchy; cannot assign.');seen.add(key);if(key===root){excluded.push({key:item.key,reason:'Unmapped Jira descendant'});break;}key=map.get(key)?.parentKey;}
 }
 const scopes=[...groups].map(([roleId,targets])=>{
  targets.sort((a,b)=>a.key.localeCompare(b.key));
  if(targets.length>500)throw Error('Role assignment exceeds 500 issues.');
  return {roleId,role:ROLES[roleId].name,rootKey:root,rootId:brId,targets,count:targets.length,excludedCount:map.size?mapped.size+excluded.filter(x=>!mapped.has(x.key)).length-targets.length:0};
 });
 return {rootKey:root,rootId:brId,rootUpdated:String(record.updated||''),scopes,excluded};
}
function plan(options){
 const all=rolePlans(options),roleId=canonicalRole(options.roleId||'software-developer');
 const scope=all.scopes.find(row=>row.roleId===roleId);
 if(!scope)throw Error('No verified Jira items for the selected SDLC role.');
 const keys=new Set(scope.targets.map(x=>x.key));
 return {...scope,excluded:[...all.excluded,...all.scopes.filter(x=>x.roleId!==roleId).flatMap(x=>x.targets.map(t=>({key:t.key,reason:'Other SDLC role'})))],rootUpdated:all.rootUpdated};
}
function verifyTarget(target,issue){
 if(!target.roleId)return;
 const fields=issue?.fields||{};
 const live={type:fields.issuetype?.name,labels:fields.labels||[]};
 if(String(live.type||'').toLowerCase()!==String(target.type||'').toLowerCase()||
    mappedRole(live,target.rows)!==target.roleId||
    String(fields.parent?.key||'')!==target.parentKey||
    !target.markers.every(marker=>live.labels.includes(marker)))
  throw Error(target.key+' role, parent, type or mapping changed. Refresh Jira before assigning.');
}
async function change({targets,projectKey,accountId,expectedUpdated,readIssue,setAssignee,rootKey=null}){
 if(!Array.isArray(targets)||!targets.length||targets.length>500)throw Error('Invalid Jira assignment scope.');
 if(accountId!==null&&(!ACCOUNT.test(String(accountId||''))||String(accountId).length>240))throw Error('Invalid Jira assignee.');
 if(typeof readIssue!=='function'||typeof setAssignee!=='function')throw Error('Jira read/write callbacks are required.');
 const validProject=String(projectKey||'').toUpperCase();
 if(rootKey){const root=await readIssue(issueKey(rootKey));if(root?.key!==rootKey||root.fields?.project?.key!==validProject||String(root.fields?.updated||'')!==String(expectedUpdated||''))throw Error('BR Epic changed. Refresh Jira before assigning.');}
 const original=[];
 const seen=new Set();
 for(const target of targets){
  const key=issueKey(target.key);
  if(seen.has(key))throw Error('Duplicate Jira assignment target.');seen.add(key);
  const issue=await readIssue(key),fields=issue?.fields||{};
  if(issue?.key!==key||fields.project?.key!==validProject)throw Error('Jira issue '+key+' changed project or identity; nothing assigned.');
  verifyTarget(target,issue);
  if(!String(target.updated||'')||String(fields.updated||'')!==String(target.updated)||!rootKey&&key===targets[0].key&&String(fields.updated||'')!==String(expectedUpdated||''))throw Error(key+' was updated after it was loaded. Refresh Jira before assigning.');
  const before=String(fields.assignee?.accountId||'');
  if(before!==String(target.owner||''))throw Error(key+' assignee changed. Refresh Jira before assigning.');
  original.push({...target,key,updated:String(fields.updated||''),owner:before});
 }
 const desired=String(accountId||'');
 const applied=[];
 try{
  for(const prior of original){
   if(prior.owner===desired)continue;
   const latest=await readIssue(prior.key);
   verifyTarget(prior,latest);
   if(latest?.key!==prior.key||latest?.fields?.project?.key!==validProject||String(latest.fields?.updated||'')!==prior.updated||String(latest.fields?.assignee?.accountId||'')!==prior.owner)
    throw Error(prior.key+' changed during assignment.');
   await setAssignee(prior.key,accountId);
   applied.push(prior);
   const verified=await readIssue(prior.key);
   verifyTarget(prior,verified);
   if(verified?.key!==prior.key||verified?.fields?.project?.key!==validProject||String(verified?.fields?.assignee?.accountId||'')!==desired)throw Error(prior.key+' assignment could not be verified.');
  }
 }catch(error){
  const rollbackErrors=[];
  for(const item of [...applied].reverse())try{
   const current=await readIssue(item.key);
   verifyTarget(item,current);
   if(current?.key===item.key&&current?.fields?.project?.key===validProject&&String(current?.fields?.assignee?.accountId||'')===desired)await setAssignee(item.key,item.owner||null);
   else rollbackErrors.push(item.key+' changed concurrently');
  }catch(rollback){rollbackErrors.push(item.key+': '+String(rollback.message||rollback));}
  throw Error('Jira assignment failed: '+String(error.message||error)+'. '+(rollbackErrors.length?'Rollback incomplete: '+rollbackErrors.join('; ')+'. Refresh Jira and reconcile.':'Completed updates rolled back.'));
 }
 return {count:original.length,changed:applied.length,accountId:accountId||null};
}
function canAssign(permissionResponse){return permissionResponse?.permissions?.ASSIGN_ISSUES?.havePermission===true;}
module.exports={group,roleForIssue,rosterCandidates,excludedRole,developable,linkedDevelopmentKeys,plan,rolePlans,change,canAssign};
