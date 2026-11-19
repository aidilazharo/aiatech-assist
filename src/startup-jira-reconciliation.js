'use strict';

// Jira returns the same 404 for deleted and invisible issues. Move unavailable
// published data out of the active register, retaining a recoverable copy, and
// restore it when Jira can see the same issue again. Never mutate remote Jira.
const crypto=require('node:crypto');
const {requestJson,baseAtlassian}=require('./clients');
const {jiraReadIssue,validIssueKey,validProjectKey}=require('./remote-actions');
const workflow=require('./br-workflow');
const AUTO_REASON='startup-jira-not-found-or-not-visible';
const MAX_ISSUES=250;
const is404=error=>/^HTTP 404\b/.test(String(error?.message||error||''));
const own=(p,id)=>p===id||p.startsWith(id+'/');
const empty=()=>({schema:1,brs:{},links:{}});
const copy=x=>structuredClone(x);

function stateOf(register){
 const s=register.startupJiraReconciliation;
 if(!s)return empty();
 if(s.schema!==1||!s.brs||!s.links||typeof s.brs!=='object'||typeof s.links!=='object')throw Error('Invalid saved startup Jira reconciliation state.');
 return s;
}
function idFor(brId,key){return brId+'|'+key;}
function entriesFor(register,id,meta){
 const rows=new Map();
 const excluded=new Set((register.jiraLinkReconciliations||[]).filter(x=>x.brId===id&&x.reason!==AUTO_REASON).flatMap(x=>(x.rows||[]).map(r=>r.key)));
 const add=(key,nodePath)=>{
  if(!key||excluded.has(key))return;
  key=validIssueKey(key);nodePath=String(nodePath||'');
  if(!own(nodePath,id))throw Error('Invalid saved Jira path for '+key+'.');
  if(rows.has(key)&&rows.get(key).nodePath!==nodePath)throw Error('Conflicting saved paths for Jira '+key+'.');
  rows.set(key,{key,nodePath});
 };
 for(const map of [register.synced||{},register.roleTaskMappings||{}])for(const [p,v] of Object.entries(map))if(own(p,id)&&v?.key)add(v.key,p);
 for(const collection of [register.completedIndex||[],...(register.completedCycles||[]).map(c=>c.requirements||[])])for(const br of collection){
  if(br.id!==id)continue;
  if(br.jiraKey)add(br.jiraKey,id);
  for(const issue of br.jiraIssues||[])if(issue?.key)add(issue.key,issue.path||id);
 }
 for(const item of Object.values(meta.links||{}))if(item.brId===id)add(item.key,item.nodePath);
 return [...rows.values()];
}
function candidates(register,{site,projectKey}){
 const meta=stateOf(register),result=[];
 const owners=new Map();
 const registerOwner=(id,key)=>{if(!key)return;const set=owners.get(key)||new Set();set.add(id);owners.set(key,set);};
 for(const map of [register.synced||{},register.roleTaskMappings||{}])for(const [p,v] of Object.entries(map))registerOwner(p.split('/')[0],v?.key);
 for(const collection of [register.completedIndex||[],...(register.completedCycles||[]).map(c=>c.requirements||[])])for(const br of collection){
  registerOwner(br.id,br.jiraKey);for(const issue of br.jiraIssues||[])registerOwner(br.id,issue?.key);
 }
 for(const item of Object.values(meta.links))registerOwner(item.brId,item.key);
 for(const item of Object.values(meta.brs))for(const row of item.rows||[])registerOwner(item.brId,row.key);
 for(const br of register.brs||[]){
  if(!/^BR-[0-9]+$/.test(br.id||'')||br.status!=='approved'||!br.approvedContent||br.needsRefresh)continue;
  if([register.pending||{},register.roleTaskPending||{}].some(map=>Object.keys(map).some(p=>own(p,br.id))))continue;
  if(Object.values(meta.links).some(x=>x.brId===br.id&&(x.site!==site||x.projectKey!==projectKey)))continue;
  const rows=entriesFor(register,br.id,meta);
  const historicRoots=rows.filter(x=>x.nodePath===br.id);
  const root=register.synced?.[br.id]?.key||Object.values(meta.links).find(x=>x.brId===br.id&&x.nodePath===br.id)?.key||(historicRoots.length===1?historicRoots[0].key:'');
  if(!root||!rows.some(x=>x.key===root&&x.nodePath===br.id))continue;
  if(rows.some(x=>x.key.split('-')[0]!==projectKey||(owners.get(x.key)?.size||0)>1))continue;
  result.push({brId:br.id,root,rows,archived:false});
 }
 for(const saved of Object.values(meta.brs)){
  if(saved.site!==site||saved.projectKey!==projectKey||!Array.isArray(saved.rows)||!saved.rows.length)continue;
  if(saved.rows.some(x=>x.key.split('-')[0]!==projectKey||(owners.get(x.key)?.size||0)>1))continue;
  result.push({brId:saved.brId,root:saved.root,rows:copy(saved.rows),archived:true});
 }
 return result;
}
async function inspect({register,config,token,request=requestJson,readIssue=jiraReadIssue,shouldContinue=()=>true}){
 if(!token)throw Error('Jira authentication is required for startup reconciliation.');
 const site=baseAtlassian(config),projectKey=validProjectKey(config.get('jira.projectKey'));
 const items=candidates(register,{site,projectKey});
 if(!items.length)return {site,projectKey,items:[],status:new Map()};
 const keys=[...new Set(items.flatMap(x=>x.rows.map(r=>r.key)))];
 if(keys.length>MAX_ISSUES)throw Error('Startup reconciliation exceeds the 250-issue safety limit.');
 const auth={token,basicEmail:String(config.get('jira.email')||'').trim()};
 const project=await request(site+'/rest/api/3/project/'+encodeURIComponent(projectKey),auth);
 if(project?.key!==projectKey)throw Error('Jira project identity changed; startup reconciliation stopped.');
 const perms=await request(site+'/rest/api/3/mypermissions?projectKey='+encodeURIComponent(projectKey)+'&permissions=BROWSE_PROJECTS',auth);
 if(perms?.permissions?.BROWSE_PROJECTS?.havePermission!==true)throw Error('Jira Browse Projects permission is required for startup reconciliation.');
 const status=new Map();let index=0;
 const worker=async()=>{while(index<keys.length){
  if(!shouldContinue())throw Error('Project changed during startup Jira reconciliation.');
  const key=keys[index++];
  try{
   const issue=await readIssue(config,token,key);
   if(issue?.key!==key||issue?.fields?.project?.key!==projectKey)throw Error('Jira identity changed for '+key+'.');
   status.set(key,'available');
  }catch(error){if(!is404(error))throw error;status.set(key,'unavailable');}
 }};
 await Promise.all(Array.from({length:Math.min(5,keys.length)},worker));
 // Recheck missing issues before changing any local state.
 const missing=keys.filter(k=>status.get(k)==='unavailable');index=0;
 const recheck=async()=>{while(index<missing.length){
  if(!shouldContinue())throw Error('Project changed during startup Jira reconciliation.');
  const key=missing[index++];
  try{
   const issue=await readIssue(config,token,key);
   if(issue?.key!==key||issue?.fields?.project?.key!==projectKey)throw Error('Jira identity changed for '+key+'.');
   status.set(key,'available');
  }catch(error){if(!is404(error))throw error;}
 }};
 await Promise.all(Array.from({length:Math.min(5,missing.length)},recheck));
 return {site,projectKey,items,status};
}
function takeScoped(map,id){const saved={};for(const [p,v] of Object.entries(map||{}))if(own(p,id)){saved[p]=v;delete map[p];}return saved;}
function archiveBR(next,item,plan,meta){
 const id=item.brId,index=next.brs.findIndex(b=>b.id===id);
 if(index<0)throw Error('BR changed during startup reconciliation.');
 const saved={schema:1,brId:id,root:item.root,site:plan.site,projectKey:plan.projectKey,rows:copy(item.rows),at:new Date().toISOString(),br:next.brs[index],maps:{},cycles:[],index:[]};
 for(const name of ['synced','links','roleTaskMappings','jiraIssueDetails','retirementApprovals'])saved.maps[name]=takeScoped(next[name],id);
 saved.index=(next.completedIndex||[]).filter(x=>x.id===id);
 next.completedIndex=(next.completedIndex||[]).filter(x=>x.id!==id);
 for(const cycle of next.completedCycles||[]){
  const requirements=(cycle.requirements||[]).filter(x=>x.id===id);
  const docs=takeScoped(cycle.relatedDocuments,id);
  if(!requirements.length&&!Object.keys(docs).length)continue;
  if(!cycle.startupArchiveId)cycle.startupArchiveId=crypto.randomUUID();
  const base=copy(cycle);base.requirements=[];base.relatedDocuments={};
  saved.cycles.push({id:cycle.startupArchiveId,base,requirements,docs});
  cycle.requirements=(cycle.requirements||[]).filter(x=>x.id!==id);
 }
 saved.workHistory={};
 for(const {key} of item.rows)if(Object.hasOwn(next.jiraWorkHistory||{},key)){saved.workHistory[key]=next.jiraWorkHistory[key];delete next.jiraWorkHistory[key];}
 next.brs.splice(index,1);
 next.lastBrSequence=Math.max(Number(next.lastBrSequence||0),Number(id.slice(3))||0);
 meta.brs[id]=saved;
}
function canRestore(next,saved){
 if((next.brs||[]).some(b=>b.id===saved.brId))return false;
 for(const [name,entries] of Object.entries(saved.maps||{}))for(const p of Object.keys(entries))if(Object.hasOwn(next[name]||{},p))return false;
 return true;
}
function restoreBR(next,saved,meta){
 if(!canRestore(next,saved))return false;
 next.brs.push(saved.br);
 for(const [name,entries] of Object.entries(saved.maps||{})){next[name]=next[name]||{};Object.assign(next[name],entries);}
 next.completedIndex=(next.completedIndex||[]).concat(saved.index||[]);
 for(const part of saved.cycles||[]){
  let cycle=(next.completedCycles||[]).find(x=>x.startupArchiveId===part.id);
  if(!cycle){cycle=copy(part.base);next.completedCycles=(next.completedCycles||[]).concat(cycle);}
  cycle.requirements=(cycle.requirements||[]).concat(part.requirements||[]);
  cycle.relatedDocuments={...(cycle.relatedDocuments||{}),...(part.docs||{})};
 }
 next.jiraWorkHistory=next.jiraWorkHistory||{};
 for(const [key,value] of Object.entries(saved.workHistory||{}))if(!Object.hasOwn(next.jiraWorkHistory,key))next.jiraWorkHistory[key]=value;
 delete meta.brs[saved.brId];
 return true;
}
function archiveLink(next,brId,row,plan,meta){
 const id=idFor(brId,row.key);if(meta.links[id])return false;
 const saved={brId,key:row.key,nodePath:row.nodePath,site:plan.site,projectKey:plan.projectKey,at:new Date().toISOString(),maps:{}};
 for(const name of ['synced','roleTaskMappings']){
  const value=next[name]?.[row.nodePath];
  if(value?.key===row.key){saved.maps[name]=value;delete next[name][row.nodePath];}
 }
 if(Object.hasOwn(next.jiraWorkHistory||{},row.key)){saved.workHistory=next.jiraWorkHistory[row.key];delete next.jiraWorkHistory[row.key];}
 meta.links[id]=saved;
 next.jiraLinkReconciliations=(next.jiraLinkReconciliations||[]).concat({at:saved.at,actor:'ATGV Start',brId,site:plan.site,projectKey:plan.projectKey,reason:AUTO_REASON,rows:[{key:row.key,nodePath:row.nodePath}]});
 return true;
}
function restoreLink(next,saved,meta){
 for(const [name,value] of Object.entries(saved.maps||{}))if(next[name]?.[saved.nodePath]&&next[name][saved.nodePath].key!==value.key)return false;
 for(const [name,value] of Object.entries(saved.maps||{})){next[name]=next[name]||{};next[name][saved.nodePath]=value;}
 if(saved.workHistory!==undefined&&!Object.hasOwn(next.jiraWorkHistory||{},saved.key)){next.jiraWorkHistory=next.jiraWorkHistory||{};next.jiraWorkHistory[saved.key]=saved.workHistory;}
 next.jiraLinkReconciliations=(next.jiraLinkReconciliations||[]).filter(entry=>!(entry.reason===AUTO_REASON&&entry.brId===saved.brId&&(entry.rows||[]).some(row=>row.key===saved.key)));
 delete meta.links[idFor(saved.brId,saved.key)];
 return true;
}
function apply(next,plan){
 const meta=next.startupJiraReconciliation=copy(stateOf(next));
 const result={brsRemoved:0,linksRemoved:0,brsRestored:0,linksRestored:0,conflicts:0};
 for(const item of plan.items){
  if(item.archived){
   const saved=meta.brs[item.brId];
   if(saved&&item.rows.some(row=>plan.status.get(row.key)==='available')){
    if(!restoreBR(next,saved,meta)){result.conflicts++;continue;}
    result.brsRestored++;
    for(const row of item.rows){
     const old=meta.links[idFor(item.brId,row.key)];
     if(plan.status.get(row.key)==='available'&&old){if(restoreLink(next,old,meta))result.linksRestored++;else result.conflicts++;}
     else if(plan.status.get(row.key)==='unavailable'&&!old&&archiveLink(next,item.brId,row,plan,meta))result.linksRemoved++;
    }
   }
   continue;
  }
  if(plan.status.get(item.root)==='unavailable'&&item.rows.every(row=>plan.status.get(row.key)==='unavailable')){
   archiveBR(next,item,plan,meta);result.brsRemoved++;continue;
  }
  for(const row of item.rows){
   const old=meta.links[idFor(item.brId,row.key)];
   if(plan.status.get(row.key)==='available'&&old){if(restoreLink(next,old,meta))result.linksRestored++;else result.conflicts++;}
   else if(plan.status.get(row.key)==='unavailable'&&!old&&archiveLink(next,item.brId,row,plan,meta))result.linksRemoved++;
  }
 }
 if(result.brsRemoved||result.linksRemoved||result.brsRestored||result.linksRestored){
  next.events=(next.events||[]).concat({at:new Date().toISOString(),action:'startup-jira-unavailable-reconciled',...result}).slice(-200);
 }
 return result;
}
async function run({registry,projectId,config,token,request,readIssue,shouldContinue=()=>true}){
 const register=await workflow.load(registry,projectId);
 const plan=await inspect({register,config,token,request,readIssue,shouldContinue});
 if(!shouldContinue())return {cancelled:true};
 // Calculate against a clone first so a clean scan does not churn the register.
 const preview=apply(copy(register),plan);
 if(!preview.brsRemoved&&!preview.linksRemoved&&!preview.brsRestored&&!preview.linksRestored)return {...preview,changed:false};
 let result;
 const updated=await workflow.write(registry,projectId,register.revision,next=>{
  if(!shouldContinue())throw Error('Project changed during startup Jira reconciliation.');
  result=apply(next,plan);
 });
 return {...result,changed:true,register:updated};
}
module.exports={AUTO_REASON,MAX_ISSUES,candidates,inspect,apply,run};
