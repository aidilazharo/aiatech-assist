'use strict';
// BR is the navigation unit. My Work changes ownership of role tasks only.
const ISSUE=/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/;
const BR=/^BR-[0-9]{1,6}$/;
// An immutable approved snapshot remains usable when its exact content is
// recorded as published, even while the BA prepares a separate revision.
function publishedSnapshot(register,br){
 if(!br?.approvedContent||!br.approvedRevision||['retired','retire-proposed','cancelled','canceled','rejected'].includes(br.status))return false;
 if(!register?.synced?.[br.id]?.key||register.deletedRequirements?.some(x=>x.id===br.id))return false;
 const hash=register.baPublishedBRs?.[br.id];
 return typeof hash==='string'&&hash===require('./br-workflow').normalizedContent(br.approvedContent);
}
function tree(register,brId){
 const id=String(brId||'').toUpperCase();
 if(!BR.test(id))throw Error('Invalid Business Requirement ID.');
 const br=(register?.brs||[]).find(row=>row.id===id);
 if(!br||(!publishedSnapshot(register,br)&&(br.status!=='approved'||br.needsRefresh||!br.approvedContent)))throw Error('Assign only a current approved or previously published Business Requirement.');
 const mapped=register?.synced||{};
 if(!mapped[id]?.key)throw Error(id+' has no published Jira Epic. Publish the full BR first.');
 const entries=Object.entries(mapped).filter(([p,v])=>(p===id||p.startsWith(id+'/'))&&v?.key)
  .map(([p,v])=>({path:p,key:String(v.key).toUpperCase(),kind:String(v.kind||v.issueType||'')}))
  .sort((a,b)=>a.path.split('/').length-b.path.split('/').length||a.path.localeCompare(b.path));
 const keys=new Set();for(const entry of entries){if(!ISSUE.test(entry.key)||keys.has(entry.key))throw Error('Invalid or duplicated Jira mapping for '+id);keys.add(entry.key);}
 if(entries[0]?.path!==id)throw Error('The BR Epic must be the root of its mapped hierarchy.');
 return {brId:id,rootKey:entries[0].key,entries};
}
function developmentTree(register,brId){
 const scope=tree(register,brId);
 const entries=scope.entries.filter(item=>!/\/ROLE-(?!DEVELOPER(?:\/|$))[A-Z0-9_-]+/i.test(item.path));
 const known=new Set(entries.map(x=>x.key));
 for(const [p,row] of Object.entries(register.roleTaskMappings||{})){
  if(!p.startsWith(scope.brId+'/'))continue;
  if(String(row?.roleId||'').toLowerCase()!=='developer'&&!/\/ROLE-DEVELOPER$/i.test(p))continue;
  const key=String(row?.key||'').toUpperCase();
  if(!ISSUE.test(key)||known.has(key))continue;
  known.add(key);entries.push({path:p,key,kind:'Role'});
 }
 return {...scope,entries};
}
const {ROLES}=require('./my-work-role-prompts');
const ROLE_ALIASES=Object.freeze({ba:'business-analyst',pm:'project-manager',sa:'solution-architect',uiux:'ux-designer',developer:'software-developer',qa:'qa-engineer',uat:'uat-tester'});
function canonicalRole(value){
 const id=String(value||'').toLowerCase().replace(/^atgv-role-/,'');
 return ROLE_ALIASES[id]||(Object.hasOwn(ROLES,id)?id:'');
}
function roleTree(register,brId,roleId='software-developer'){
 const role=canonicalRole(roleId);
 if(!role)throw Error('Unsupported SDLC assignment role.');
 const scope=tree(register,brId),entries=[],seen=new Map();
 const add=(path,row)=>{
  if(!path.startsWith(scope.brId+'/')||!row?.key)return;
  const kind=String(row.kind||row.issueType||''),marker=path.match(/\/ROLE-([^/]+)$/i);
  if(/^(?:epic|br|business requirement)$/i.test(kind))return;
  const hints=[row.roleId,row.roleLabel,marker?.[1]].filter(Boolean);
  const declared=hints.map(canonicalRole);
  if(hints.length&&(declared.some(x=>!x)||new Set(declared).size!==1))return;
  const explicit=declared[0]||'';
  if(!explicit&&(!/^(?:task|subtask|sub-task|sub task)$/i.test(kind)||/\/ROLE-/i.test(path)))return;
  const taskRole=explicit||'software-developer',key=String(row.key).toUpperCase();
  if(!ISSUE.test(key))throw Error('Invalid role task mapping for '+scope.brId);
  if(scope.entries.some(item=>item.key===key&&(item.path===scope.brId||item.path!==path)))throw Error('Role task maps to a different hierarchy item: '+key);
  const prior=seen.get(key);
  if(prior&&prior!==taskRole)throw Error('Conflicting role mappings for '+key);
  if(prior)return;
  seen.set(key,taskRole);
  if(taskRole===role)entries.push({path,key,kind:kind||'Role',roleId:role,explicit:!!explicit});
 };
 for(const [path,row] of Object.entries(register.synced||{}))add(path,row);
 for(const [path,row] of Object.entries(register.roleTaskMappings||{}))add(path,row);
 return {...scope,roleId:role,entries};
}
function matchesRoleTask(entry,issue){
 const fields=issue?.fields||{};
 const type=String(fields.issuetype?.name||issue?.type||issue?.issueType||'');
 const roleParent=entry.explicit&&/^(?:feature|user story|story)$/i.test(entry.kind)&&/^(?:feature|user story|story)$/i.test(type);
 if(!roleParent&&!/^(?:task|subtask|sub-task|sub task)$/i.test(type)&&!(fields.issuetype?.subtask===true&&!/^(?:story|feature|epic)$/i.test(type)))return false;
 const labels=(fields.labels||issue?.labels||[]).filter(x=>typeof x==='string'&&x.toLowerCase().startsWith('atgv-role-'));
 const roles=new Set(labels.map(canonicalRole));
 if(roles.size)return roles.size===1&&roles.has(entry.roleId);
 return entry.explicit||entry.roleId==='software-developer';
}
function requireTask(register,issue,roleId){
 const brId=fromKey(register,issue?.key);
 const entry=brId&&roleTree(register,brId,roleId).entries.find(x=>x.key===issue.key);
 if(!entry||!matchesRoleTask(entry,issue))throw Error('This Jira issue is not a verified task for the selected SDLC role.');
 return entry;
}
function fromKey(register,key){
 const wanted=String(key||'').toUpperCase();
 for(const [p,v] of [...Object.entries(register?.synced||{}),...Object.entries(register?.roleTaskMappings||{})])if(String(v?.key||'').toUpperCase()===wanted){
  const id=p.split('/')[0].toUpperCase();if(BR.test(id))return id;
 }
 return '';
}
async function verifyOwner({register,brId,projectKey,accountId,readIssue,roleId='software-developer'}){
 if(!accountId)throw Error('Jira identity is unavailable for BR ownership verification.');
 const scope=roleTree(register,brId,roleId);
 if(!scope.entries.length)throw Error('No mapped tasks for the selected role. Publish or repair Jira role tasks first.');
 for(const entry of scope.entries){
  const issue=await readIssue(entry.key);
  if(issue?.key!==entry.key||issue?.fields?.project?.key!==projectKey)throw Error('Jira mapping changed for '+entry.key+'.');
  if(!matchesRoleTask(entry,issue))throw Error('Role or issue type changed for '+entry.key+'. Reconcile Jira before continuing.');
  if(issue?.fields?.assignee?.accountId!==accountId)throw Error('All tasks for this role in the BR must be assigned to your Jira account. '+entry.key+' is not owned by you; use Assign Entire BR first.');
 }
 return scope;
}
async function changeWholeBr({register,brId,projectKey,accountId,mode,readIssue,setAssignee,roleId='software-developer'}){
 if(!['assign','unassign'].includes(mode))throw Error('Invalid whole-BR ownership action.');
 if(!accountId||typeof readIssue!=='function'||typeof setAssignee!=='function')throw Error('Jira identity and read/write operations are required.');
 const scope=roleTree(register,brId,roleId);
 if(!scope.entries.length)throw Error('No mapped tasks for the selected role. Publish or repair Jira role tasks first.');
 // Phase 1: validate every role task BEFORE any remote mutation.
 const before=[];
 for(const entry of scope.entries){
  const issue=await readIssue(entry.key),fields=issue?.fields||{};
  if(issue?.key!==entry.key||fields.project?.key!==projectKey)throw Error('Jira mapping/project mismatch for '+entry.key+'; no assignments changed.');
  if(!matchesRoleTask(entry,issue))throw Error('Role or issue type changed for '+entry.key+'; no assignments changed.');
  const owner=String(fields.assignee?.accountId||'');
  if(mode==='assign'&&owner&&owner!==accountId)throw Error(entry.key+' is already assigned to another user. Transfer ownership in Jira first; no BR tasks were claimed.');
  if(mode==='unassign'&&owner&&owner!==accountId)throw Error(entry.key+' belongs to another user. Cannot partially release BR.');
  before.push({...entry,updated:String(fields.updated||''),owner});
 }
 if(mode==='unassign'&&!before.some(entry=>entry.owner===accountId))throw Error('Only a current role-task owner can release the BR role scope.');
 const changed=[];
 try{
  for(const entry of before){
   const target=mode==='assign'?accountId:'';
   if(entry.owner===target)continue;
   // Optimistic concurrency: check the revision and owner again just before writing.
   const current=await readIssue(entry.key);
   if(current?.key!==entry.key||current.fields?.project?.key!==projectKey||!matchesRoleTask(entry,current)||String(current.fields?.updated||'')!==entry.updated||String(current.fields?.assignee?.accountId||'')!==entry.owner)
    throw Error(entry.key+' changed during BR ownership transfer.');
   await setAssignee(entry.key,target||null);
   changed.push({...entry,target});
  }
 }catch(error){
  const failures=[];
  for(const previous of [...changed].reverse())try{
   const now=await readIssue(previous.key);
   if(now?.key===previous.key&&now.fields?.project?.key===projectKey&&matchesRoleTask(previous,now)&&String(now.fields?.assignee?.accountId||'')===previous.target)await setAssignee(previous.key,previous.owner||null);
   else failures.push(previous.key+' changed externally');
  }catch(e){failures.push(previous.key+': '+String(e.message||e));}
  throw Error('Whole-BR '+mode+' failed: '+String(error.message||error)+'. '+(failures.length?'Rollback incomplete for '+failures.join(', ')+'.':'Completed changes rolled back.'));
 }
 return {...scope,mode,count:before.length,changed:changed.length,accountId:mode==='assign'?accountId:null};
}
module.exports={publishedSnapshot,tree,developmentTree,roleTree,matchesRoleTask,requireTask,fromKey,verifyOwner,changeWholeBr};
