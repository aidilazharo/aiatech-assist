'use strict';
// BR is the only assignable ATGV unit. Jira Epic/Feature/Story/Subtask
// records remain intact and are assigned together, never claimed separately.
const ISSUE=/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/;
const BR=/^BR-[0-9]{1,6}$/;
function tree(register,brId){
 const id=String(brId||'').toUpperCase();
 if(!BR.test(id))throw Error('Invalid Business Requirement ID.');
 const br=(register?.brs||[]).find(row=>row.id===id);
 if(!br||br.status!=='approved'||br.needsRefresh||!br.approvedContent)throw Error('Assign only a current approved Business Requirement.');
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
function fromKey(register,key){
 const wanted=String(key||'').toUpperCase();
 for(const [p,v] of Object.entries(register?.synced||{}))if(String(v?.key||'').toUpperCase()===wanted){
  const id=p.split('/')[0].toUpperCase();if(BR.test(id))return id;
 }
 return '';
}
async function verifyOwner({register,brId,projectKey,accountId,readIssue}){
 if(!accountId)throw Error('Jira identity is unavailable for BR ownership verification.');
 const scope=developmentTree(register,brId);
 for(const entry of scope.entries){
  const issue=await readIssue(entry.key);
  if(issue?.key!==entry.key||issue?.fields?.project?.key!==projectKey)throw Error('Jira mapping changed for '+entry.key+'.');
  if(issue?.fields?.assignee?.accountId!==accountId)throw Error('Entire BR must be assigned to your Jira account. '+entry.key+' is not owned by you; use Assign Entire BR first.');
 }
 return scope;
}
async function changeWholeBr({register,brId,projectKey,accountId,mode,readIssue,setAssignee}){
 if(!['assign','unassign'].includes(mode))throw Error('Invalid whole-BR ownership action.');
 if(!accountId||typeof readIssue!=='function'||typeof setAssignee!=='function')throw Error('Jira identity and read/write operations are required.');
 const scope=developmentTree(register,brId);
 // Phase 1: validate the complete published hierarchy BEFORE any remote mutation.
 const before=[];
 for(const entry of scope.entries){
  const issue=await readIssue(entry.key),fields=issue?.fields||{};
  if(issue?.key!==entry.key||fields.project?.key!==projectKey)throw Error('Jira mapping/project mismatch for '+entry.key+'; no assignments changed.');
  const owner=String(fields.assignee?.accountId||'');
  if(mode==='assign'&&owner&&owner!==accountId)throw Error(entry.key+' is already assigned to another user. Transfer ownership in Jira first; no BR tasks were claimed.');
  if(mode==='unassign'&&owner&&owner!==accountId)throw Error(entry.key+' belongs to another user. Cannot partially release BR.');
  before.push({...entry,updated:String(fields.updated||''),owner});
 }
 if(mode==='unassign'&&before[0].owner!==accountId)throw Error('Only the current BR Epic owner can release the entire BR.');
 const changed=[];
 try{
  for(const entry of before){
   const target=mode==='assign'?accountId:'';
   if(entry.owner===target)continue;
   // Optimistic concurrency: check the revision and owner again just before writing.
   const current=await readIssue(entry.key);
   if(String(current.fields?.updated||'')!==entry.updated||String(current.fields?.assignee?.accountId||'')!==entry.owner)
    throw Error(entry.key+' changed during BR ownership transfer.');
   await setAssignee(entry.key,target||null);
   changed.push({...entry,target});
  }
 }catch(error){
  const failures=[];
  for(const previous of [...changed].reverse())try{
   const now=await readIssue(previous.key);
   if(String(now.fields?.assignee?.accountId||'')===previous.target)await setAssignee(previous.key,previous.owner||null);
   else failures.push(previous.key+' changed externally');
  }catch(e){failures.push(previous.key+': '+String(e.message||e));}
  throw Error('Whole-BR '+mode+' failed: '+String(error.message||error)+'. '+(failures.length?'Rollback incomplete for '+failures.join(', ')+'.':'Completed changes rolled back.'));
 }
 return {...scope,mode,count:before.length,changed:changed.length,accountId:mode==='assign'?accountId:null};
}
module.exports={tree,developmentTree,fromKey,verifyOwner,changeWholeBr};
