'use strict';
const ownership = require('./br-ownership');
// Shared parent rows are navigation only. Role-task ownership is separate.
const {ROLES}=require('./my-work-role-prompts');
// Published Jira approval is a read-access fact, not an assignment or
// permission to edit an unpublished local revision.
function publishedRoots(issues,register,{projectKey='',verifyMarker=()=>false}={}){
 const prefix=String(projectKey||'').toUpperCase();
 if(!/^[A-Z][A-Z0-9_]{0,19}$/.test(prefix))return [];
 const live=new Map((issues||[]).filter(x=>typeof x.key==='string'&&x.key.startsWith(prefix+'-')&&/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(x.key)).map(x=>[x.key,x]));
 const known=new Map(),deleted=new Set((register?.deletedRequirements||[]).map(x=>x.id));
 for(const [id,row] of Object.entries(register?.synced||{})){
  if(!/^BR-[0-9]{1,8}$/.test(id)||!row?.key||deleted.has(id))continue;
  const epic=live.get(row.key);
  if(!epic||String(epic.type).toLowerCase()!=='epic'||(row.issueId&&String(row.issueId)!==String(epic.id)))continue;
  if(row.marker?!epic.labels?.includes(row.marker):!verifyMarker(id,epic))continue;
  known.set(epic.key,{id,key:epic.key,source:'mapping'});
 }
 for(const epic of live.values()){
  if(known.has(epic.key)||String(epic.type).toLowerCase()!=='epic')continue;
  const id=/^\s*(BR-[0-9]{1,8})(?:[:·.\-–—]|\s|$)/i.exec(epic.summary||'')?.[1]?.toUpperCase();
  if(!id||deleted.has(id)||register?.synced?.[id]?.key||!verifyMarker(id,epic))continue;
  known.set(epic.key,{id,key:epic.key,source:'jira'});
 }
 const children=new Map();
 for(const row of live.values())if(row.parentKey&&live.has(row.parentKey)&&row.parentKey!==row.key){
  if(!children.has(row.parentKey))children.set(row.parentKey,[]);
  children.get(row.parentKey).push(row.key);
 }
 const result=[];
 for(const root of known.values()){
  const keys=new Set([root.key]),queue=[root.key];
  for(let n=0;n<queue.length;n++)for(const key of children.get(queue[n])||[]){
   if(keys.has(key)||String(live.get(key)?.type).toLowerCase()==='epic')continue;
   keys.add(key);queue.push(key);
  }
  result.push({...root,keys:[...keys]});
 }
 return result;
}
function enrich(issues,register,accountId,options={}){
 const mapped=new Map(), roots=new Map(), brStatuses=new Map(), taskRoles=new Map();
 const byKey=new Map((issues||[]).map(issue=>[issue.key,issue]));
 for(const br of register?.brs||[]){
  if(!ownership.publishedSnapshot(register,br)&&(br.status!=='approved'||br.needsRefresh||!br.approvedContent))continue;
  brStatuses.set(br.id,br.externalReviewRequired?'Updated':'Completed');
  let scope;try{scope=ownership.tree(register,br.id);}catch{continue;}
  const roleScopes={};
  for(const roleId of Object.keys(ROLES)){
   let role;try{role=ownership.roleTree(register,br.id,roleId);}catch{continue;}
   if(!role.entries.length)continue;
   const tasks=role.entries.map(entry=>({entry,issue:byKey.get(entry.key)}));
   const verified=tasks.filter(({entry,issue})=>issue&&ownership.matchesRoleTask(entry,issue));
   for(const {entry} of verified){mapped.set(entry.key,br.id);taskRoles.set(entry.key,roleId);}
   const complete=verified.length===tasks.length;
   if(!complete)continue;
   const mine=tasks.every(({issue})=>!!accountId&&issue.assigneeId===accountId);
   const available=tasks.every(({issue})=>!issue.assigneeId||issue.assigneeId===accountId);
   roleScopes[roleId]={count:tasks.length,mine,available,keys:tasks.map(({entry})=>entry.key)};
  }
  roots.set(scope.rootKey,{brId:br.id,descendantCount:scope.entries.length-1,roleScopes});
  for(const entry of scope.entries)mapped.set(entry.key,br.id);
 }
 const published=new Map(),ambiguous=new Set();
 for(const root of publishedRoots(issues,options.discoveryRegister||register,options)){
  for(const key of root.keys){
   if(published.has(key)&&published.get(key).key!==root.key)ambiguous.add(key);
   else published.set(key,root);
  }
 }
 return (issues||[]).map(issue=>{
  const root=roots.get(issue.key);
  const publishedBR=ambiguous.has(issue.key)?null:published.get(issue.key);
  const brId=mapped.get(issue.key)||mapped.get(issue.parentKey)||publishedBR?.id||'';
  const br=register?.brs?.find(row=>row.id===brId);
  const snapshotReady=!!br?.approvedContent&&!!br.approvedRevision&&(ownership.publishedSnapshot(register,br)||(br.status==='approved'&&!br.needsRefresh&&!br.externalReviewRequired&&!br.roleReviewRequired&&!br.dependencyReviewRequired));
  const labels=[...new Set((issue.labels||[]).filter(x=>typeof x==='string'&&/^atgv-role-/i.test(x)).map(x=>require('./jira-role-routing').normalizeRole(x.slice(10))))];
  // Live labels on a verified published tree allow discovery, not execution
  // or bulk assignment before canonical mappings have been recovered.
  const inProject=!!options.projectKey&&issue.key?.startsWith(String(options.projectKey).toUpperCase()+'-');
  const discoveredRole=(publishedBR||inProject&&issue.assigneeId===accountId&&!!accountId)&&!taskRoles.has(issue.key)&&/^(task|subtask|sub-task|sub task|story|user story|feature)$/i.test(issue.type)&&labels.length===1&&Object.hasOwn(ROLES,labels[0])?labels[0]:'';
  const assigneeId=String(issue.assigneeId||'');
  return {...issue,issueType:issue.type||'Unknown',brId,brStatus:publishedBR?'Approved & Published':brStatuses.get(brId)||'',publishedApproval:!!publishedBR,publishedRootKey:publishedBR?.key||'',brRoot:!!root,
   descendantCount:root?.descendantCount||0,roleScopes:root?.roleScopes||{},taskRole:taskRoles.get(issue.key)||discoveredRole,roleMappingVerified:taskRoles.has(issue.key),publishedSnapshotReady:snapshotReady,
   mine:!!assigneeId&&assigneeId===accountId,unassigned:!assigneeId,
   scopeSummary:root?`${root.descendantCount+1} linked Jira issues in entire BR`:''};
 });
}
module.exports={enrich,publishedRoots};
