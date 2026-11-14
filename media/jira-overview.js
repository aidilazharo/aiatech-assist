/* Jira issue overview from the active project's durable BR publication index.
 * This is NOT a Jira search or a live issue-status feed. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.ATGVJiraOverview=api;
})(typeof globalThis!=='undefined'?globalThis:undefined,function(){
 'use strict';
 const keyPattern=/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/;
 function browseUrl(base,key){
  if(!keyPattern.test(String(key||'')))return null;
  try{
   const u=new URL(String(base||''));
   if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return null;
   if(u.username||u.password||u.search||u.hash)return null;
   return u.origin+u.pathname.replace(/\/$/,'')+'/browse/'+encodeURIComponent(key);
  }catch{return null;}
 }
 function summarize(synced){
  const issues=new Map();
  for(const entry of Object.values(synced&&typeof synced==='object'&&!Array.isArray(synced)?synced:{})){
   if(!entry||typeof entry!=='object'||!keyPattern.test(String(entry.key||'')))continue;
   const key=String(entry.key),kind=String(entry.issueType||entry.kind||'Issue').trim().slice(0,60)||'Issue';
   if(!issues.has(key))issues.set(key,{key,title:String(entry.title||'Untitled issue').slice(0,220),kind});
  }
  const byType={};for(const issue of issues.values())byType[issue.kind]=(byType[issue.kind]||0)+1;
  return {count:issues.size,byType,issues:[...issues.values()].sort((a,b)=>a.key.localeCompare(b.key))};
 }
 return Object.freeze({summarize,browseUrl});
});
