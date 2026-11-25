'use strict';
/**
 * Read-only audit of active, published BR -> Jira identity and hierarchy.
 * The Jira key is a mutable display identifier; issueId is the permanent
 * numeric identity when available. Never reparent, unlink, create, or delete.
 */
const MAX_LINKS=1000;
const own=(path,id)=>path===id||path.startsWith(id+'/');
function mappedRows(register){
 const active=new Set((register?.brs||[]).filter(br=>!br.archivedFromRestart&&br.approvedContent).map(br=>br.id));
 return Object.entries(register?.synced||{})
  .filter(([path,row])=>active.has(path.split('/')[0])&&row?.key)
  .map(([path,row])=>({path,key:String(row.key),issueId:String(row.issueId||''),parentIssueId:String(row.parentIssueId||'')}));
}
async function audit({register,projectKey,readIssue,verify,signal}={}){
 if(typeof readIssue!=='function'||typeof verify!=='function')throw Error('Jira mapping audit needs verified read and identity callbacks.');
 if(!/^[A-Z][A-Z0-9_]{1,20}$/.test(String(projectKey||'')))throw Error('Jira project key is not verified.');
 const rows=mappedRows(register);
 if(rows.length>MAX_LINKS)throw Error('Jira mapping identity audit exceeds '+MAX_LINKS+' active links. Review the project in smaller BR groups; no Jira changes were made.');
 const conflicts=[],verified=[],knownKeys=new Map(),knownIds=new Map();
 for(const row of rows){
  if(knownKeys.has(row.key)&&knownKeys.get(row.key)!==row.path)
   conflicts.push('Jira '+row.key+' is mapped to multiple BR paths ('+knownKeys.get(row.key)+' and '+row.path+').');
  else knownKeys.set(row.key,row.path);
  if(row.issueId){
   if(!/^\d+$/.test(row.issueId))conflicts.push(row.path+': saved permanent Jira issue ID is invalid.');
   if(knownIds.has(row.issueId)&&knownIds.get(row.issueId)!==row.path)
    conflicts.push('Jira numeric ID '+row.issueId+' is mapped to multiple BR paths.');
   else knownIds.set(row.issueId,row.path);
  }
 }
 // Small bounded batches; no write calls, retry-on-404, or automatic link repair.
 for(let i=0;i<rows.length;i+=5){
  signal?.throwIfAborted?.();
  const results=await Promise.all(rows.slice(i,i+5).map(async row=>{
   if(!row.key.startsWith(projectKey+'-'))return {row,error:'saved key belongs to another project'};
   try{
    const remote=await readIssue(row.key);
    verify(row.path,remote);
    return {row,remote};
   }catch(error){
    const detail=String(error?.message||error).slice(0,300);
    return {row,error:/\bHTTP 404\b/.test(detail)?'HTTP 404 (deleted or not visible to this Jira account); do not unlink automatically':detail};
   }
  }));
  for(const result of results){
   const {row,remote,error}=result;
   if(error)conflicts.push(row.path+' ('+row.key+'): '+error);
   else verified.push({path:row.path,key:remote.key,issueId:String(remote.id||''),
    parentKey:String(remote.fields?.parent?.key||''),parentIssueId:String(remote.fields?.parent?.id||'')});
  }
 }
 return {checked:rows.length,verified,conflicts,readOnly:true};
}
module.exports={MAX_LINKS,mappedRows,audit,own};
