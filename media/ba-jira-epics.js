'use strict';
// Read-only discovery of Jira Epics whose approval evidence is not present in
// the active ATGV BR register. Never infer approval, publish, or mutate mappings.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVBAJiraEpics=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const keyPattern=/^[A-Z][A-Z0-9_]{0,15}-[1-9][0-9]*$/;
 function brFromSummary(summary){
  const match=/^\s*(BR-[0-9]+)\s*(?:[:·.\-–—]|\s|$)/i.exec(String(summary||''));
  return match?match[1].toUpperCase():'';
 }
 function unlinkedEpics(items,linkedKeys=[],projectKey=''){
  const keyPrefix=String(projectKey||'').trim().toUpperCase();
  if(!/^[A-Z][A-Z0-9_]{0,15}$/.test(keyPrefix))return [];
  const linked=new Set([...linkedKeys].map(value=>String(value||'').toUpperCase()));
  const seen=new Set(),issues=[];
  for(const raw of Array.isArray(items)?items:[]){
   const key=String(raw?.key||'').toUpperCase();
   if(!keyPattern.test(key)||!key.startsWith(keyPrefix+'-')||seen.has(key))continue;
   seen.add(key);
   issues.push({key,type:String(raw.type||''),summary:String(raw.summary||'').slice(0,250),status:String(raw.status||'').slice(0,80),
    parentKey:String(raw.parentKey||'').toUpperCase(),sourceStoryKey:String(raw.sourceStoryKey||'').toUpperCase()});
  }
  const children=new Map();
  for(const issue of issues){
   for(const parent of new Set([issue.parentKey,issue.sourceStoryKey].filter(Boolean))){
    if(!children.has(parent))children.set(parent,[]);
    children.get(parent).push(issue.key);
   }
  }
  function descendants(key){
   const visited=new Set([key]),queue=[key];
   for(let i=0;i<queue.length&&i<20000;i++){
    for(const child of children.get(queue[i])||[]){if(visited.has(child))continue;visited.add(child);queue.push(child);}
   }
   return visited.size-1;
  }
  return issues.filter(issue=>issue.type.trim().toLowerCase()==='epic'&&!linked.has(issue.key)).map(issue=>({
   key:issue.key,summary:issue.summary,status:issue.status,brId:brFromSummary(issue.summary),linkedIssueCount:descendants(issue.key)
  })).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
 }
 return {brFromSummary,unlinkedEpics};
});
