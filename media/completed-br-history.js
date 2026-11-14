'use strict';
// Group immutable completed-cycle snapshots by stable Business Requirement ID.
// This is a presentation-only index: no approvals, source files or Jira mappings are modified.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVCompletedBRHistory=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 // One definition shared by the BA dashboard and the detailed BR filter.
 function discoveryStatus({unsaved=false,saved=false,filled=0,total=12}={}){
  return unsaved?'Unsaved changes':saved?'Saved · Ready':filled===0?'Not started':filled<total?`${filled} of ${total} answered`:'Answers complete · Save to continue';
 }
 function requiresAttention(br){return !!br&&(br.status!=='approved'||!!(br.needsRefresh||br.externalReviewRequired||br.roleReviewRequired||br.dependencyReviewRequired));}
 function currentlyApproved(br){return !!br&&br.status==='approved'&&!requiresAttention(br);}
 // Merge historical identities that fell out of the bounded 50-cycle snapshots.
 // Older records are presentation-only; no approval or Jira data is changed.
 function recover(records,register){
  const result=Array.isArray(records)?[...records]:[];
  const covered=new Set(result.flatMap(cycle=>(cycle.requirements||[]).map(br=>`${br.id}@${Number(br.approvedRevision||0)}`)));
  const hasId=new Set(result.flatMap(cycle=>(cycle.requirements||[]).map(br=>String(br.id||''))));
  const index=Array.isArray(register?.completedIndex)?register.completedIndex:[];
  const recovered=[];
  for(const row of index){
   if(!row?.id||covered.has(`${row.id}@${Number(row.approvedRevision||0)}`))continue;
   const canonical=(register.brs||[]).find(br=>br.id===row.id&&Number(br.approvedRevision||0)===Number(row.approvedRevision||0));
   recovered.push({...row,approvedContent:canonical?.approvedContent||null});
   covered.add(`${row.id}@${Number(row.approvedRevision||0)}`);hasId.add(row.id);
  }
  for(const br of register?.brs||[]){
   if(!br?.approvedContent||hasId.has(br.id))continue;
   // Legacy records without a full snapshot are still durable approved evidence.
   // Do not claim an unpublished draft was published to Jira.
   if(!br.archivedFromRestart&&!register?.synced?.[br.id]?.key)continue;
   const linked=Object.entries(register.synced||{}).filter(([path])=>path===br.id||path.startsWith(br.id+'/'));
   recovered.push({id:br.id,title:br.approvedContent.title||br.title||br.id,
    approvedRevision:br.approvedRevision||br.revisionNumber||1,sourceName:br.source?.name||'',approvedContent:br.approvedContent,
    jiraKey:register.synced?.[br.id]?.key||'',jiraIssues:linked.map(([path,issue])=>({path,key:issue.key,kind:issue.kind||'',title:issue.title||''})).filter(item=>item.key)});
   hasId.add(br.id);
  }
  if(recovered.length)result.push({id:'recovered-history',completedAt:'',isRecovered:true,requirements:recovered,sources:[],relatedDocuments:{},discoveryAnswers:{}});
  return result;
 }
 function titleFor(br){
  const id=String(br?.id||'').trim();
  let title=String(br?.title||br?.approvedContent?.title||'Business Requirement').trim();
  // Some historical records already include the BR ID in the stored title.
  if(id&&title.toUpperCase().startsWith(id.toUpperCase())){
   const remaining=title.slice(id.length);
   if(/^\s*[:·–—-]\s*/.test(remaining))title=remaining.replace(/^\s*[:·–—-]\s*/,'').trim()||'Business Requirement';
  }
  return id?id+' · '+title:title;
 }
 function group(records){
  const result=[],byId=new Map();
  for(const [cycleIndex,cycle] of (Array.isArray(records)?records:[]).entries()){
   for(const [index,br] of (Array.isArray(cycle?.requirements)?cycle.requirements:[]).entries()){
    if(!br)continue;
    const id=String(br.id||'').trim();
    // Missing IDs must never be silently merged with another historical requirement.
    const key=id||`missing:${cycleIndex}:${index}`;
    if(!byId.has(key)){
     const item={id,title:titleFor(br),snapshots:[]};
     byId.set(key,item);result.push(item);
    }
    const item=byId.get(key);
    item.snapshots.push({br,cycle});
   }
  }
  return result;
 }
 // Reconstruct the logical ATGV publication hierarchy from immutable node paths.
 // Native Jira parenting may differ (notably Feature/Story/Task in Jira Free).
 // Orphaned, legacy and duplicate entries must never be silently discarded.
 function jiraTree(br){
  const source=Array.isArray(br?.jiraIssues)?br.jiraIssues:[];
  const entries=source.filter(item=>item&&String(item.key||'').trim());
  if(!entries.length&&String(br?.jiraKey||'').trim())entries.push({key:br.jiraKey,kind:'Epic',title:br.title||'',path:br.id||''});
  const nodes=[],seenKeys=new Set(),paths=new Map();
  for(const entry of entries){
   const key=String(entry.key).trim();
   if(seenKeys.has(key))continue;
   seenKeys.add(key);
   const path=String(entry.path||'').trim();
   const node={key,kind:String(entry.kind||'Issue'),title:String(entry.title||''),path,children:[],descendants:0};
   nodes.push(node);
   if(path&&!paths.has(path))paths.set(path,node);
  }
  const roots=[];
  for(const node of nodes){
   const parts=node.path.split('/');let parent=null;
   while(parts.length>1&&!parent){parts.pop();const candidate=paths.get(parts.join('/'));if(candidate&&candidate!==node)parent=candidate;}
   if(parent)parent.children.push(node);else roots.push(node);
  }
  const countDescendants=node=>{
   node.descendants=node.children.reduce((total,child)=>total+1+countDescendants(child),0);
   node.searchText=[node.key,node.kind,node.title,...node.children.map(child=>child.searchText)].join(' ');
   return node.descendants;
  };
  roots.forEach(countDescendants);
  return {roots,count:nodes.length};
 }
 return {group,titleFor,jiraTree,recover,requiresAttention,currentlyApproved,discoveryStatus};
});
