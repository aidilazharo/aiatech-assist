'use strict';
const ownership = require('./br-ownership');
// Shared parent rows are navigation only. Role-task ownership is separate.
const {ROLES}=require('./my-work-role-prompts');
function enrich(issues,register,accountId){
 const mapped=new Map(), roots=new Map(), brStatuses=new Map(), taskRoles=new Map();
 const byKey=new Map((issues||[]).map(issue=>[issue.key,issue]));
 for(const br of register?.brs||[]){
  if(br.status!=='approved'||br.needsRefresh||!br.approvedContent)continue;
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
 return (issues||[]).map(issue=>{
  const root=roots.get(issue.key);
  const brId=mapped.get(issue.key)||mapped.get(issue.parentKey)||'';
  const assigneeId=String(issue.assigneeId||'');
  return {...issue,issueType:issue.type||'Unknown',brId,brStatus:brStatuses.get(brId)||'',brRoot:!!root,
   descendantCount:root?.descendantCount||0,roleScopes:root?.roleScopes||{},taskRole:taskRoles.get(issue.key)||'',
   mine:!!assigneeId&&assigneeId===accountId,unassigned:!assigneeId,
   scopeSummary:root?`${root.descendantCount+1} linked Jira issues in entire BR`:''};
 });
}
module.exports={enrich};
