'use strict';
// Business Analyst transfer changes Jira Epic Reporter (current BA owner).
// Jira Creator is immutable audit evidence, and development assignees are NOT modified.
const KEY=/^[A-Z][A-Z0-9_]{1,20}-[1-9][0-9]*$/;
const BR=/^BR-[0-9]{1,8}$/;
const ACCOUNT=/^[^\s<>]{1,240}$/;
const clean=(value,n=240)=>String(value||'').trim().slice(0,n);
function assertIssue(issue,projectKey,epicKey,brId='',register={}){
 const key=clean(epicKey).toUpperCase(),project=clean(projectKey).toUpperCase();
 if(!KEY.test(key)||!key.startsWith(project+'-'))throw Error('Invalid Jira Epic or project.');
 if(issue?.key!==key||issue?.fields?.project?.key!==project||String(issue?.fields?.issuetype?.name||'').toLowerCase()!=='epic')
  throw Error('Transfer requires a verified Jira Epic in the active project.');
 const id=clean(brId).toUpperCase();
 if(id&&!BR.test(id))throw Error('Invalid Business Requirement ID.');
 const root=register?.synced?.[id]?.key;
 if(root&&String(root).toUpperCase()!==key)throw Error('Jira Epic does not match the locally mapped Business Requirement.');
 // For Jira-only BRs, the BR ID must come from the real Epic summary.
 const inRegister=(register?.brs||[]).some(br=>br?.id===id);
 if(!inRegister&&id&&!root){
  const match=/^\s*(BR-[0-9]{1,8})(?:\s|:|[·.\-–—]|$)/i.exec(String(issue.fields.summary||''));
  if(!match||match[1].toUpperCase()!==id)throw Error('Jira-only BR identifier does not match its Epic.');
 }
 return {key,brId:id,updated:clean(issue.fields.updated,100),ownerId:clean(issue.fields.reporter?.accountId),creatorId:clean(issue.fields.creator?.accountId)};
}
function candidates(rows,currentOwnerId=''){
 const seen=new Set();
 return (Array.isArray(rows)?rows:[]).filter(row=>{
  const id=clean(row.id);
  if(!id||id===currentOwnerId||!ACCOUNT.test(id)||seen.has(id)||!Array.isArray(row.roles)||
    !row.roles.some(role=>String(role||'').trim().toLowerCase()==='business analyst'))return false;
  seen.add(id);return true;
 }).map(row=>({accountId:clean(row.id),name:clean(row.name,140)||'Business Analyst'})).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,300);
}
function canModifyReporter(permission){
 return permission?.permissions?.MODIFY_REPORTER?.havePermission===true &&
        permission?.permissions?.BROWSE_PROJECTS?.havePermission===true;
}
function assertActor(scope,actorId){
 if(!ACCOUNT.test(String(actorId||'')))throw Error('Unable to verify the signed-in Jira user.');
 if(actorId!==scope.ownerId&&actorId!==scope.creatorId)
  throw Error('Only the current Jira BR Reporter or original Creator may transfer this BR.');
}
async function transfer({readIssue,writeReporter,projectKey,epicKey,brId='',register={},actorId,targetId,expectedUpdated,expectedOwnerId,onProgress=()=>{}}){
 if(typeof readIssue!=='function'||typeof writeReporter!=='function')throw Error('Jira read/write operations unavailable.');
 if(!ACCOUNT.test(String(targetId||'')))throw Error('Select a verified Business Analyst.');
 onProgress('checking',20,'Verifying the current Jira BR owner…');
 const issue=await readIssue(epicKey);
 const scope=assertIssue(issue,projectKey,epicKey,brId,register);
 assertActor(scope,actorId);
 if(!scope.updated||scope.updated!==expectedUpdated||scope.ownerId!==String(expectedOwnerId||''))
  throw Error('Jira BR ownership changed. Refresh the BR and reopen Transfer BR.');
 if(scope.ownerId===targetId)throw Error('This user already owns the Business Requirement.');
 // The second read prevents a stale form being applied after another Jira edit.
 onProgress('checking',40,'Checking for concurrent Jira changes…');
 const latest=assertIssue(await readIssue(epicKey),projectKey,epicKey,brId,register);
 if(latest.updated!==scope.updated||latest.ownerId!==scope.ownerId)
  throw Error('Jira BR changed during transfer. No change was made.');
 onProgress('writing',65,'Updating the Jira Epic reporter…');
 await writeReporter(epicKey,targetId);
 try{
  onProgress('verifying',85,'Verifying the new BR owner in Jira…');
  const verified=assertIssue(await readIssue(epicKey),projectKey,epicKey,brId,register);
  if(verified.ownerId!==targetId)throw Error('Jira did not confirm the new BR owner.');
  return {epicKey,brId,ownerId:targetId,previousOwnerId:scope.ownerId,creatorId:scope.creatorId};
 }catch(error){
  // Attempt compensation only when the new owner is still present.
  let extra='';
  try{
   const current=assertIssue(await readIssue(epicKey),projectKey,epicKey,brId,register);
   if(current.ownerId===targetId){
    await writeReporter(epicKey,scope.ownerId||null);
    const restored=assertIssue(await readIssue(epicKey),projectKey,epicKey,brId,register);
    if(restored.ownerId!==scope.ownerId)extra=' Rollback could not be verified.';
   }else extra=' Reporter changed externally; rollback not attempted.';
  }catch(rollback){extra=' Rollback failed: '+String(rollback.message||rollback);}
  throw Error('BR transfer could not be verified: '+String(error.message||error)+'.'+extra);
 }
}
module.exports={assertIssue,candidates,canModifyReporter,assertActor,transfer};
