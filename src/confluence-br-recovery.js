'use strict';
// Restore a Jira-only Business Requirement from a verified Confluence Source
// Vault. Never infer ownership from creator, title or unverified child links.
const crypto=require('node:crypto');
const {getConfluenceSpace}=require('./clients');
const brWorkflow=require('./br-workflow');
const {ConfluenceSourceVault,validateManifest,validDocument}=require('./confluence-source-vault');
const {jiraReadIssue,validProjectKey}=require('./remote-actions');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const belongs=(path,id)=>path===id||path.startsWith(id+'/');
const ownership=require('./br-ownership');
const approved=br=>br?.status==='approved'&&!br.needsRefresh&&!br.externalReviewRequired&&!br.roleReviewRequired&&!br.dependencyReviewRequired&&!!br.approvedContent&&!!br.approvedRevision;
function compatibleExisting(local,remote){
 return !!local?.approvedContent&&!!remote?.approvedContent&&
  !['retired','retire-proposed','cancelled','canceled','rejected'].includes(local.status)&&
  Number(local.approvedRevision)===Number(remote.approvedRevision)&&
  JSON.stringify(local.approvedContent)===JSON.stringify(remote.approvedContent);
}
function assignedCandidates(remote,current,issues,accountId,roleId='software-developer'){
 const mine=new Map((issues||[]).filter(issue=>accountId&&issue.assigneeId===accountId).map(issue=>[issue.key,issue]));
 const existing=new Map((current.brs||[]).map(br=>[br.id,br]));
 const deleted=new Set((current.deletedRequirements||[]).map(br=>br.id));
 const result=[];
 for(const br of remote.brs||[]){
  if((!approved(br)&&!ownership.publishedSnapshot(remote,br))||deleted.has(br.id))continue;
  const local=existing.get(br.id);
  if(local&&!compatibleExisting(local,br))continue;
  let scope;try{scope=ownership.roleTree(remote,br.id,roleId);}catch{continue;}
  const assigned=scope.entries.filter(entry=>mine.has(entry.key)&&ownership.matchesRoleTask(entry,mine.get(entry.key)));
  if(!assigned.length)continue;
  if(local&&current.synced?.[br.id]?.key===scope.rootKey&&assigned.every(entry=>current.synced?.[entry.path]?.key===entry.key||current.roleTaskMappings?.[entry.path]?.key===entry.key))continue;
  result.push({brId:br.id,jiraKey:scope.rootKey});
 }
 return result;
}
async function readManifest({registry,projectId,config,token}){
 const vault=new ConfluenceSourceVault({registry,projectId,config,token});
 const space=await getConfluenceSpace(config,token),page=await vault.page(space,false);
 if(!page)throw Error('No Confluence Source Vault exists. Jira alone cannot reconstruct the original BR.');
 const attachments=await vault.attachments(String(page.id));
 const file='ATGV-project-'+projectId+'-source-state.json';
 const matches=attachments.filter(a=>a.title===file);
 if(matches.length!==1)throw Error('Source Vault has no unique verifiable project manifest.');
 const bytes=await vault.download(String(page.id),matches[0]);
 if(bytes.length>20*1024*1024)throw Error('Confluence source manifest is too large.');
 const manifest=validateManifest(JSON.parse(bytes.toString('utf8')),projectId,space.id);
 return {vault,space,page,attachments,bytes,manifest};
}
async function recover({registry,projectId,config,token,brId,jiraKey,snapshot=null,assignment=null}){
 const id=String(brId||''),key=String(jiraKey||'').toUpperCase();
 if(!/^BR-[0-9]{1,8}$/.test(id)||!/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(key))
  throw Error('Select a valid Jira-only Business Requirement and Epic.');
 const projectKey=validProjectKey(config.get('jira.projectKey'));
 if(!key.startsWith(projectKey+'-'))throw Error('Epic is not part of this Jira project.');
 const {vault,space,page,attachments,bytes,manifest}=snapshot||await readManifest({registry,projectId,config,token});
 const remote=manifest.register,br=remote.brs.find(x=>x.id===id);
 const mapping=remote.synced?.[id];
 if(!br||mapping?.key!==key||!mapping?.marker)
  throw Error('Confluence cannot prove this BR maps to the selected Jira Epic.');
 const issue=await jiraReadIssue(config,token,key);
 if(issue?.fields?.project?.key!==projectKey||String(issue.fields?.issuetype?.name||'').toLowerCase()!=='epic')
  throw Error('Jira Epic identity changed or is outside the selected project.');
 const linked=Object.entries(remote.synced||{}).filter(([p])=>belongs(p,id));
 const roleLinked=Object.entries(remote.roleTaskMappings||{}).filter(([p])=>belongs(p,id));
 if(linked.some(([p,x])=>!x?.key||!x?.marker)||new Set(linked.map(([,x])=>x.key)).size!==linked.length)
  throw Error('Confluence has incomplete or duplicate Jira ownership markers.');
 const current=await brWorkflow.load(registry,projectId);
 const local=current.brs.find(x=>x.id===id);
 if(current.deletedRequirements?.some(x=>x.id===id)||local&&(!assignment||!compatibleExisting(local,br)))
  throw Error('BR differs locally or was deliberately deleted. Manual reconciliation required.');
 const existingMappings=[...Object.entries(current.synced||{}),...Object.entries(current.roleTaskMappings||{})];
 const inUse=new Set(existingMappings.filter(([p])=>!belongs(p,id)).map(([,x])=>x?.key).filter(Boolean));
 const combined=new Map(linked);
 for(const [p,x] of roleLinked){
  if(combined.has(p)&&combined.get(p).key!==x?.key)throw Error('Conflicting Jira role mapping in Confluence.');
  if(!combined.has(p))combined.set(p,x);
 }
 if(existingMappings.some(([p,x])=>belongs(p,id)&&combined.has(p)&&x?.key!==combined.get(p).key)||
    [...combined.values()].some(x=>!x?.key||!x?.marker||inUse.has(x.key))||new Set([...combined.values()].map(x=>x.key)).size!==combined.size)
  throw Error('A linked Jira issue is unverified, duplicated or belongs to another local BR.');
 if(assignment){
  if(!approved(br)&&!ownership.publishedSnapshot(remote,br))throw Error('The shared BR has no approved published snapshot.');
  const scope=ownership.roleTree(remote,id,assignment.roleId||'software-developer');
  const developerKeys=new Map(scope.entries.map(entry=>[entry.key,entry]));
  let owned=false;
  for(const [p,x] of combined){
   if(!assignment.shouldContinue())throw Error('Project changed during BR recovery.');
   const live=p===id?issue:await jiraReadIssue(config,token,x.key);
   if(live.key!==x.key||live.fields?.project?.key!==projectKey||!live.fields?.labels?.includes(x.marker))throw Error('Jira identity changed for '+x.key);
   if(remote.synced?.[p])assignment.verify(remote,p,live);
   if(remote.roleTaskMappings?.[p]){
    const role=remote.roleTaskMappings[p];
    if(!role.parentKey||live.fields?.parent?.key!==role.parentKey||!role.roleLabel||!live.fields?.labels?.includes(role.roleLabel))throw Error('Jira role or parent changed for '+x.key);
   }
   const entry=developerKeys.get(x.key);
   if(entry&&ownership.matchesRoleTask(entry,live)&&live.fields?.assignee?.accountId===assignment.accountId)owned=true;
  }
  if(!owned)throw Error('No verified task for the selected role is assigned to this account.');
 }
 const docs=[...(remote.sourceDocuments||[]),...(remote.archivedSources||[])].filter(x=>validDocument(x));
 // Role work needs the verified published BR snapshot and Jira links, not an
 // overwrite of conflicting BA discovery/source files. Manual full recovery
 // still restores and checks those files. Automatic recovery leaves them alone.
 const restored=assignment?{downloaded:0,conflicts:[]}:await vault.restore(manifest,sha(bytes),space,String(page.id),attachments,{allowRegister:false});
 if(restored.conflicts.length)throw Error('Confluence recovery blocked: '+restored.conflicts.slice(0,3).join('; '));
 await brWorkflow.write(registry,projectId,current.revision,next=>{
  const savedLocal=next.brs.find(x=>x.id===id);
  if(next.deletedRequirements?.some(x=>x.id===id)||savedLocal&&(!assignment||!compatibleExisting(savedLocal,br))||assignment&&!assignment.shouldContinue())throw Error('BR or project changed while recovering.');
  if(!savedLocal)next.brs.push(structuredClone(br));
  if(remote.baPublishedBRs?.[id]){next.baPublishedBRs=next.baPublishedBRs||{};if(!next.baPublishedBRs[id])next.baPublishedBRs[id]=remote.baPublishedBRs[id];}
  for(const [p,x] of linked)if(!next.synced[p])next.synced[p]=structuredClone(x);
  if(remote.roleTaskMappings){
   next.roleTaskMappings=next.roleTaskMappings||{};
   for(const [p,x] of Object.entries(remote.roleTaskMappings))if(belongs(p,id)&&!next.roleTaskMappings[p])next.roleTaskMappings[p]=structuredClone(x);
  }
  next.archivedSources=next.archivedSources||[];
  for(const doc of assignment?[]:docs){
   if(br.source?.digest!==doc.digest&&br.sourceDigest!==doc.digest)continue;
   if(![...(next.sourceDocuments||[]),...next.archivedSources].some(x=>x.digest===doc.digest))
    next.archivedSources.push(structuredClone(doc));
  }
  const remoteLink=remote.links?.entries?.['approved-brs/'+id+'.md'];
  if(remoteLink&&!assignment){
   next.links.entries=next.links.entries||{};
   if(!next.links.entries['approved-brs/'+id+'.md'])
    next.links.entries['approved-brs/'+id+'.md']=structuredClone(remoteLink);
  }
  for(const cycle of remote.completedCycles||[]){
   const requirements=(cycle.requirements||[]).filter(x=>x.id===id);
   if(!requirements.length)continue;
   next.completedCycles=next.completedCycles||[];
   if(!next.completedCycles.some(x=>x.id===cycle.id))
    next.completedCycles.push({...structuredClone(cycle),requirements:structuredClone(requirements)});
  }
  next.events=(next.events||[]).concat({at:new Date().toISOString(),action:'recover-br-from-confluence',
   brId:id,jiraKey:key,verifiedPage:String(page.id)}).slice(-200);
 });
 return {brId:id,jiraKey:key,restoredDocuments:restored.downloaded,linkedIssues:linked.length,
  warning:'Other local discovery answers were preserved. Review evidence before deleting anything.'};
}
async function recoverAssigned({registry,projectId,config,token,issues,accountId,roleId='software-developer',verify,shouldContinue=()=>true}){
 const snapshot=await readManifest({registry,projectId,config,token});
 const current=await brWorkflow.load(registry,projectId);
 const candidates=assignedCandidates(snapshot.manifest.register,current,issues,accountId,roleId);
 const recovered=[],warnings=[];
 for(const candidate of candidates){
  if(!shouldContinue())break;
  try{
   const result=await recover({registry,projectId,config,token,...candidate,snapshot,assignment:{accountId,roleId,verify,shouldContinue}});
   recovered.push(result.brId);
  }catch(error){warnings.push(candidate.brId+': '+String(error.message||error).slice(0,240));}
 }
 return {recovered,warnings};
}
module.exports={recover,belongs,recoverAssigned,assignedCandidates};
