'use strict';
/**
 * Explicit reconciliation for old ATGV local-only BR deletions.
 * Never infer deletion ownership from Jira creator, project key, or summary.
 * Each candidate must be present in a local deletion tombstone AND have the
 * exact ATGV marker derived from its historical node path and project.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {requestJson,baseAtlassian}=require('./clients');
const {validIssueKey,validProjectKey,jiraMarker,jiraReadIssue,remoteFingerprint}=require('./remote-actions');
const {childrenOfJira}=require('./remote-br-deletion');
const MAX_ISSUES=250;
const auth=(config,token)=>({token,basicEmail:String(config.get('jira.email')||'').trim()});
const clean=(value)=>String(value||'').slice(0,800);
function recoverableTombstones(register){
 return (register.deletedRequirements||[]).filter(t=>t?.remoteRecordsPreserved===true&&Array.isArray(t.jiraIssues)&&t.jiraIssues.some(i=>i.key));
}
function tombstoneFor(register,brId,at){
 const matches=recoverableTombstones(register).filter(t=>t.id===brId&&t.at===at);
 if(matches.length!==1)throw Error('Previously deleted Business Requirement was changed. Refresh and retry.');
 if((register.brs||[]).some(br=>br.id===brId))throw Error('This BR ID is in active use. Do not delete its Jira issues.');
 return matches[0];
}
function ownedRows(register,brId,at,config,projectId){
 const t=tombstoneFor(register,brId,at),projectKey=validProjectKey(config.get('jira.projectKey'));
 const active=new Set(Object.values(register.synced||{}).map(item=>item?.key).filter(Boolean));
 const seen=new Set(),rows=[];
 for(const item of t.jiraIssues){
  const key=validIssueKey(item.key),nodePath=String(item.path||'');
  if(!(nodePath===brId||nodePath.startsWith(brId+'/'))||!/^BR-\d+(?:\/[A-Za-z0-9_-]+)*$/.test(nodePath))throw Error(`Untrusted ATGV path for ${key}. Manual reconciliation required.`);
  if(key.split('-')[0]!==projectKey)throw Error(`${key} belongs to a different Jira project. Cleanup blocked.`);
  if(active.has(key))throw Error(`${key} is still mapped to an active Business Requirement. Cleanup blocked.`);
  if(seen.has(key))throw Error(`Duplicate historical Jira mapping for ${key}.`);
  if(recoverableTombstones(register).some(other=>other!==t&&other.jiraIssues.some(i=>i.key===key)))throw Error(`${key} is shared by multiple deleted BR histories.`);
  seen.add(key);
  rows.push({key,nodePath,marker:jiraMarker(config,nodePath,projectId),projectKey,depth:nodePath.split('/').length});
 }
 if(!rows.length||rows.length>MAX_ISSUES)throw Error('No eligible Jira issues, or cleanup exceeds the 250-issue safety limit.');
 return rows.sort((a,b)=>b.depth-a.depth||a.key.localeCompare(b.key));
}
function assertIdentity(row,issue,{checkUpdated=false}={}){
 const fields=issue?.fields||{};
 if(issue?.key!==row.key||fields.project?.key!==row.projectKey)throw Error(`Jira ${row.key} project or identity has changed.`);
 if(!Array.isArray(fields.labels)||!fields.labels.includes(row.marker))throw Error(`Jira ${row.key} has no matching historical ATGV ownership marker. Manual review required.`);
 if(checkUpdated&&(String(fields.updated||'')!==String(row.updated||'')||remoteFingerprint(issue)!==row.fingerprint))throw Error(`Jira ${row.key} changed after cleanup preview. Restart review.`);
}
async function assertPermissions(config,token,request=requestJson){
 if(!token)throw Error('Jira token is required for orphan cleanup.');
 const key=validProjectKey(config.get('jira.projectKey'));
 const url=`${baseAtlassian(config)}/rest/api/3/mypermissions?projectKey=${encodeURIComponent(key)}&permissions=BROWSE_PROJECTS%2CDELETE_ISSUES`;
 const data=await request(url,auth(config,token));
 if(data?.permissions?.BROWSE_PROJECTS?.havePermission!==true||data?.permissions?.DELETE_ISSUES?.havePermission!==true)throw Error(`Jira project ${key}: Browse Projects and Delete Issues permissions are required. No issues were deleted.`);
}
async function preflight({register,brId,at,config,token,projectId,request=requestJson,readJira=jiraReadIssue}){
 const rows=ownedRows(register,brId,at,config,projectId);
 await assertPermissions(config,token,request);
 const allowed=new Set(rows.map(row=>row.key));
 for(const row of rows){
  const issue=await readJira(config,token,row.key);
  assertIdentity(row,issue);
  if(!issue.fields?.updated)throw Error(`Jira ${row.key} cannot be safely version-checked. Review manually.`);
  row.updated=String(issue.fields.updated);
  row.fingerprint=remoteFingerprint(issue);
  row.summary=clean(issue.fields.summary);
  row.status=clean(issue.fields.status?.name);
  const children=await childrenOfJira(config,token,row.key,request);
  const unknown=children.filter(key=>!allowed.has(key));
  if(unknown.length)throw Error(`Jira ${row.key} has child issues outside the deleted BR: ${unknown.join(', ')}. No issues deleted.`);
 }
 return {schema:1,kind:'orphan-jira',projectId,brId,at,registerRevision:register.revision,site:baseAtlassian(config),projectKey:validProjectKey(config.get('jira.projectKey')),rows,createdAt:new Date().toISOString()};
}
function journalPath(registry,projectId){return path.join(path.dirname(registry.fileFor(projectId)),'documents','requirements','orphan-jira-cleanup-jobs.json');}
async function readJobs(registry,projectId){
 const p=journalPath(registry,projectId),stat=await fs.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return {schema:1,jobs:[]};
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe orphan cleanup audit file.');
 const state=JSON.parse(await fs.readFile(p,'utf8'));
 if(state.schema!==1||!Array.isArray(state.jobs))throw Error('Invalid orphan cleanup audit.');
 return state;
}
async function writeJobs(registry,projectId,state){
 const p=journalPath(registry,projectId),dir=path.dirname(p);
 await fs.mkdir(dir,{recursive:true});
 const st=await fs.lstat(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe orphan cleanup directory.');
 const tmp=p+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{await fs.writeFile(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});await fs.rename(tmp,p);}finally{await fs.rm(tmp,{force:true});}
}
function createJob(plan,actor){return {id:crypto.randomUUID(),kind:'orphan-jira',plan,actor,status:'pending',createdAt:new Date().toISOString(),results:{},lastError:''};}
async function execute({registry,projectId,job,config,token,loadRegister,finalize,request=requestJson,readJira=jiraReadIssue,onProgress=async()=>{}}){
 const state=await readJobs(registry,projectId),saved=state.jobs.find(j=>j.id===job.id&&j.kind==='orphan-jira');
 if(!saved)throw Error('Orphan cleanup job was not found. Refresh and review again.');
 if(saved.status==='completed')return saved;
 const plan=saved.plan,allowed=new Set(plan.rows.map(row=>row.key));
 const persist=()=>writeJobs(registry,projectId,state);
 const verify=async()=>{
  if(baseAtlassian(config)!==plan.site||validProjectKey(config.get('jira.projectKey'))!==plan.projectKey)throw Error('Jira destination changed after cleanup preview.');
  const reg=await loadRegister();
  if(reg.revision!==plan.registerRevision)throw Error('BR deletion history changed. Reconcile before continuing.');
  const current=ownedRows(reg,plan.brId,plan.at,config,projectId);
  if(JSON.stringify(current.map(x=>[x.key,x.nodePath,x.marker]))!==JSON.stringify(plan.rows.map(x=>[x.key,x.nodePath,x.marker])))throw Error('Historical Jira ownership mappings changed.');
  return reg;
 };
 try{
  await assertPermissions(config,token,request);
  for(const row of plan.rows){
   const previous=saved.results[row.key]?.status;
   if(previous==='deleted')continue;
   if(previous==='attempting')throw Error(`Jira ${row.key} deletion was interrupted. Verify Jira remotely before retrying; no automatic replay.`);
   await verify();
   const issue=await readJira(config,token,row.key);
   assertIdentity(row,issue,{checkUpdated:true});
   const children=await childrenOfJira(config,token,row.key,request);
   const extra=children.filter(k=>!allowed.has(k));
   if(extra.length)throw Error(`Jira ${row.key} acquired unknown children: ${extra.join(', ')}. No further deletion attempted.`);
   saved.results[row.key]={status:'attempting',at:new Date().toISOString()};await persist();
   try{await request(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(row.key)}?deleteSubtasks=false`,{...auth(config,token),method:'DELETE'});}
   catch(error){
    if(/HTTP (400|401|403|404|409|412|429)\b/.test(String(error.message||error)))saved.results[row.key]={status:'failed',reason:clean(error.message||error),at:new Date().toISOString()};
    await persist();throw error;
   }
   saved.results[row.key]={status:'deleted',at:new Date().toISOString()};await persist();
   await onProgress({key:row.key,deleted:Object.values(saved.results).filter(x=>x.status==='deleted').length,total:plan.rows.length});
  }
  await verify();
  if(!saved.finalized){await finalize(plan);saved.finalized=true;}
  saved.status='completed';saved.completedAt=new Date().toISOString();saved.lastError='';await persist();
  return saved;
 }catch(error){saved.status='partial';saved.lastError=clean(error.message||error);await persist();throw error;}
}
module.exports={recoverableTombstones,tombstoneFor,ownedRows,assertIdentity,assertPermissions,preflight,readJobs,writeJobs,createJob,execute};
