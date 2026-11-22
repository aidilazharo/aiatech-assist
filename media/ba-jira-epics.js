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
    reporter:String(raw.reporter||''),reporterId:String(raw.reporterId||''),
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
   key:issue.key,summary:issue.summary,status:issue.status,brId:brFromSummary(issue.summary),
   reporter:issue.reporter,reporterId:issue.reporterId,linkedIssueCount:descendants(issue.key)
  })).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
 }
 // Merge the local BR register with Jira's actual project inventory for display.
 // A local approval is linked only by stored Jira keys and verified parent links;
 // a BR-looking Jira summary alone never associates it with local evidence.
 function combine(items,groups,projectKey){
  const issues=Array.isArray(items)?items:[],records=Array.isArray(groups)?groups:[];
  const normalized=value=>String(value||'').trim().toUpperCase();
  const refs=[],roots=new Map(),known=new Set(),children=new Map(),byKey=new Map();
  const rows=issues.map(issue=>({...issue,_isJiraIssue:true,_brRefs:[],_brRoots:[],brLabel:''}));
  for(const row of rows){
   const key=normalized(row.key);if(!key)continue;if(!byKey.has(key))byKey.set(key,row);
   for(const parent of new Set([normalized(row.parentKey),normalized(row.sourceStoryKey)].filter(Boolean))){
    if(parent===key)continue;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(key);
   }
  }
  function addRoot(key,ref){if(!key)return;if(!roots.has(key))roots.set(key,[]);roots.get(key).push(ref);}
  for(const [index,group] of records.entries()){
   const id=String(group?.id||'').trim(),snapshots=Array.isArray(group?.snapshots)?group.snapshots:[];
   const rootKeys=new Set(),allKeys=new Set();
   for(const {br} of snapshots){
    const key=normalized(br?.jiraKey);if(key){rootKeys.add(key);allKeys.add(key);}
    for(const issue of br?.jiraIssues||[]){
     const issueKey=normalized(issue?.key);if(!issueKey)continue;allKeys.add(issueKey);
     if((id&&String(issue.path||'')===id)||String(issue.kind||'').toLowerCase()==='epic')rootKeys.add(issueKey);
    }
   }
   for(const key of allKeys)known.add(key);
   const latest=snapshots[0]?.br||{},latestKeys=new Set((latest.jiraIssues||[]).map(item=>normalized(item?.key)).filter(Boolean));
   if(!latestKeys.size&&latest.jiraKey)latestKeys.add(normalized(latest.jiraKey));
   const ref={kind:'local',id,scopeId:id||'local-index:'+index,label:id||'Local BR without ID',title:String(group?.title||id||'Business Requirement'),
    hasAnswers:snapshots.some(s=>Object.keys(s.cycle?.discoveryAnswers||{}).length>0),linkedIssueCount:latestKeys.size,rootKey:normalized(latest.jiraKey),rootKeys:[...rootKeys],keys:[...allKeys]};
   refs.push(ref);for(const key of rootKeys)addRoot(key,ref);
  }
  // Jira-only Epics retain their own identity and cannot inherit local answers.
  const unlinked=unlinkedEpics(issues,known,projectKey);
  for(const epic of unlinked){
   const ref={kind:'jira',id:epic.brId,scopeId:'jira:'+epic.key,label:epic.brId||'Jira-only Epic',title:epic.summary,
    hasAnswers:false,linkedIssueCount:epic.linkedIssueCount,rootKey:epic.key,keys:[epic.key]};
   refs.push(ref);addRoot(epic.key,ref);
  }
  const assigned=new Map(),queue=[];
  for(const ref of refs)for(const key of ref.keys)queue.push([key,ref]);
  for(let i=0;i<queue.length;i++){
   const [key,ref]=queue[i];if(!assigned.has(key))assigned.set(key,new Set());const found=assigned.get(key);
   if(found.has(ref))continue;found.add(ref);
   for(const child of children.get(key)||[])queue.push([child,ref]);
  }
  for(const row of rows){
   const key=normalized(row.key);row._brRefs=[...(assigned.get(key)||[])];row._brRoots=roots.get(key)||[];
   row.brLabel=row._brRefs.map(ref=>ref.label).join(', ');
   row.brSearch=row._brRefs.map(ref=>ref.title).join(' ');
  }
  const localOnly=[];
  for(const ref of refs.filter(item=>item.kind==='local')){
   const visible=ref.rootKeys.some(key=>byKey.has(key));
   if(!visible)localOnly.push({key:ref.rootKey,type:'Business Requirement',summary:ref.title,status:'Approved locally',creator:'',created:'',
    _isJiraIssue:false,_brRefs:[ref],_brRoots:[ref],brLabel:ref.label,brSearch:ref.title});
  }
  return {rows:[...localOnly,...rows],refs,unlinked};
 }
 return {brFromSummary,unlinkedEpics,combine};
});
