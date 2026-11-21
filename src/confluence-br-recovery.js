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
async function recover({registry,projectId,config,token,brId,jiraKey}){
 const id=String(brId||''),key=String(jiraKey||'').toUpperCase();
 if(!/^BR-[0-9]{1,8}$/.test(id)||!/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(key))
  throw Error('Select a valid Jira-only Business Requirement and Epic.');
 const projectKey=validProjectKey(config.get('jira.projectKey'));
 if(!key.startsWith(projectKey+'-'))throw Error('Epic is not part of this Jira project.');
 const vault=new ConfluenceSourceVault({registry,projectId,config,token});
 const space=await getConfluenceSpace(config,token),page=await vault.page(space,false);
 if(!page)throw Error('No Confluence Source Vault exists. Jira alone cannot reconstruct the original BR.');
 const attachments=await vault.attachments(String(page.id));
 const file='ATGV-project-'+projectId+'-source-state.json';
 const manifestAttachment=attachments.find(a=>a.title===file);
 if(!manifestAttachment)throw Error('Source Vault has no verifiable project manifest.');
 const bytes=await vault.download(String(page.id),manifestAttachment);
 if(bytes.length>20*1024*1024)throw Error('Confluence source manifest is too large.');
 const manifest=validateManifest(JSON.parse(bytes.toString('utf8')),projectId,space.id);
 const remote=manifest.register,br=remote.brs.find(x=>x.id===id);
 const mapping=remote.synced?.[id];
 if(!br||mapping?.key!==key||!mapping?.marker)
  throw Error('Confluence cannot prove this BR maps to the selected Jira Epic.');
 const issue=await jiraReadIssue(config,token,key);
 if(issue?.fields?.project?.key!==projectKey||String(issue.fields?.issuetype?.name||'').toLowerCase()!=='epic')
  throw Error('Jira Epic identity changed or is outside the selected project.');
 const linked=Object.entries(remote.synced||{}).filter(([p])=>belongs(p,id));
 if(linked.some(([p,x])=>!x?.key||!x?.marker)||new Set(linked.map(([,x])=>x.key)).size!==linked.length)
  throw Error('Confluence has incomplete or duplicate Jira ownership markers.');
 const current=await brWorkflow.load(registry,projectId);
 if(current.brs.some(x=>x.id===id)||current.deletedRequirements?.some(x=>x.id===id))
  throw Error('BR exists or was deliberately deleted. Manual reconciliation required.');
 const inUse=new Set([...Object.values(current.synced||{}),...Object.values(current.roleTaskMappings||{})].map(x=>x?.key).filter(Boolean));
 if(linked.some(([,x])=>inUse.has(x.key)))throw Error('A linked Jira issue belongs to another local BR.');
 const docs=[...(remote.sourceDocuments||[]),...(remote.archivedSources||[])].filter(x=>validDocument(x));
 const restored=await vault.restore(manifest,sha(bytes),space,String(page.id),attachments,{allowRegister:false});
 if(restored.conflicts.length)throw Error('Confluence recovery blocked: '+restored.conflicts.slice(0,3).join('; '));
 await brWorkflow.write(registry,projectId,current.revision,next=>{
  if(next.brs.some(x=>x.id===id))throw Error('BR changed while recovering.');
  next.brs.push(structuredClone(br));
  for(const [p,x] of linked)next.synced[p]=structuredClone(x);
  if(remote.roleTaskMappings){
   next.roleTaskMappings=next.roleTaskMappings||{};
   for(const [p,x] of Object.entries(remote.roleTaskMappings))if(belongs(p,id))next.roleTaskMappings[p]=structuredClone(x);
  }
  next.archivedSources=next.archivedSources||[];
  for(const doc of docs){
   if(br.source?.digest!==doc.digest&&br.sourceDigest!==doc.digest)continue;
   if(![...(next.sourceDocuments||[]),...next.archivedSources].some(x=>x.digest===doc.digest))
    next.archivedSources.push(structuredClone(doc));
  }
  const remoteLink=remote.links?.entries?.['approved-brs/'+id+'.md'];
  if(remoteLink){
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
module.exports={recover,belongs};
