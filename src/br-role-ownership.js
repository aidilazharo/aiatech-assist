'use strict';
const {JiraConfluenceCoordination,pageTitle,encodeState}=require('./atlassian-coordination');
const {writeConfluence}=require('./clients');
const {ROLES}=require('./my-work-role-prompts');
const ownership=require('./br-ownership');
const pm=require('./pm-jira-assignment');
const KEY=/^[A-Z][A-Z0-9_]{0,19}-[1-9]\d*$/;
const ACCOUNT=/^[^\s<>\x00-\x1f]{1,240}$/;
function recordKey(epic,role){
 if(!KEY.test(epic)||!Object.hasOwn(ROLES,role))throw Error('Invalid BR role ownership identity.');
 return epic+'--'+role;
}
function validate(records){
 if(!records||typeof records!=='object'||Array.isArray(records))throw Error('Invalid BR role ownership register.');
 for(const [key,r] of Object.entries(records)){
  if(!r||key!==recordKey(r.epic,r.roleId)||!/^BR-\d{1,6}$/.test(r.brId)||!r.issueId||!/^\d+$/.test(r.issueId)||!Number.isSafeInteger(r.revision)||r.revision<1||r.ownerId!==null&&!ACCOUNT.test(r.ownerId))throw Error('Invalid shared BR role ownership record.');
 }
 return records;
}
class Store{
 constructor(config,token,projectKey){
  this.config=config;this.token=token;this.remote=new JiraConfluenceCoordination({config,token,project:'br-role-'+projectKey});
 }
 async read(){const state=await this.remote.snapshot();return {...state,documents:validate(state.documents)};}
 async save(state,documents){
  validate(documents);
  const saved=await writeConfluence(this.config,this.token,{pageId:state.page?.id,spaceId:state.space.id,title:pageTitle(this.remote.project),version:state.page?.version,bodyHtml:encodeState(documents)});
  if(!saved?.id)throw Error('Shared BR ownership save was not confirmed. Refresh before retrying.');
 }
 async set({state,epic,issueId,brId,roleId,actorId,targetId,targetName,manager=false}){
  const key=recordKey(epic,roleId),old=state.documents[key];
  if(!ACCOUNT.test(actorId)||targetId!==null&&!ACCOUNT.test(targetId))throw Error('Verified Jira account required.');
  if(old&&(old.issueId!==issueId||old.brId!==brId))throw Error('BR identity changed; reconcile shared ownership.');
  if(!manager&&(targetId!==null&&targetId!==actorId||old?.ownerId&&old.ownerId!==actorId))throw Error('Another user owns this BR role. Ask the Project Manager to transfer it.');
  const next={epic,issueId,brId,roleId,ownerId:targetId,ownerName:targetId?String(targetName||targetId).slice(0,160):'',revision:(old?.revision||0)+1,updatedAt:new Date().toISOString()};
  await this.save(state,{...state.documents,[key]:next});
  return next;
 }
}
function rootIdentity(root,projectKey,epic){
 if(root?.key!==epic||root.fields?.project?.key!==projectKey||String(root.fields?.issuetype?.name||'').toLowerCase()!=='epic'||!/^\d+$/.test(String(root.id||'')))throw Error('Verified published Jira Epic required.');
 return String(root.id);
}
// All new live descendants must carry an unambiguous role label or a verified
// canonical mapping. Never classify a shared parent or infer from title.
function candidates({items,register,epic,brId,roleId}){
 const map=new Map(items.map(x=>[x.key,x])),out=[];
 const scope=ownership.roleTree(register,brId,roleId);
 if(scope.rootKey!==epic||String(map.get(epic)?.type).toLowerCase()!=='epic')return [];
 const mapped=new Map(scope.entries.map(x=>[x.key,x]));
 for(const item of map.values()){
  if(item.key===epic)continue;
  let parent=item.parentKey,seen=new Set([item.key]),chain=[];
  while(parent&&parent!==epic&&!seen.has(parent)&&map.has(parent)){
   seen.add(parent);const ancestor=map.get(parent);
   if(String(ancestor.type).toLowerCase()==='epic')break;
   chain.push(parent);parent=ancestor.parentKey;
  }
  if(parent!==epic)continue;
  const entry=mapped.get(item.key),known=ownership.fromKey(register,item.key);
  if(known&&known!==brId)continue;
  const labelRoles=(item.labels||[]).filter(x=>typeof x==='string'&&x.toLowerCase().startsWith('atgv-role-'));
  const explicit=labelRoles.length===1&&labelRoles[0].toLowerCase()==='atgv-role-'+roleId&&/^(task|subtask|sub-task|sub task|story|user story|feature)$/i.test(item.type);
  if(entry?!ownership.matchesRoleTask(entry,item):known||!explicit)continue;
  out.push({item,entry,chain});
 }
 return out;
}
function recordFor(records,epic,roleId,issueId){
 const r=records[recordKey(epic,roleId)];
 return r&&r.issueId===String(issueId||'')?r:null;
}
async function sync({store,records,register,items,projectKey,readIssue,setAssignee,shouldContinue=()=>true,limit=100,excludeKeys=new Set()}){
 const warnings=[],changed=new Map();let attempts=0;
 for(const r of Object.values(records)){
  if(!r.ownerId||!shouldContinue())continue;
  const root=items.find(x=>x.key===r.epic);
  if(!root||String(root.id)!==r.issueId)continue;
  let targets;
  try{targets=candidates({items,register,epic:r.epic,brId:r.brId,roleId:r.roleId});}catch{continue;}
  for(const {item,entry,chain} of targets){
   if(excludeKeys.has(item.key))continue;
   if(item.assigneeId===r.ownerId)continue;
   if(item.assigneeId){warnings.push(item.key+' has a different assignee; review ownership conflict.');continue;}
   if(!shouldContinue()||attempts>=limit)return {changed,warnings};
   attempts++;
   try{
    const latest=await store.read(),current=recordFor(latest.documents,r.epic,r.roleId,r.issueId);
    if(current?.revision!==r.revision||current.ownerId!==r.ownerId)break;
    const liveRoot=await readIssue(r.epic);
    if(rootIdentity(liveRoot,projectKey,r.epic)!==r.issueId)throw Error('BR Epic identity changed.');
    const rootMarker=register.synced?.[r.brId]?.marker;
    if(rootMarker&&!(liveRoot.fields?.labels||[]).includes(rootMarker))throw Error('BR Epic marker changed.');
    const live=await readIssue(item.key),fields=live.fields||{};
    if(live.key!==item.key||fields.project?.key!==projectKey||fields.assignee?.accountId||String(fields.updated||'')!==String(item.updated||''))continue;
    if(entry?!ownership.matchesRoleTask(entry,live):!(fields.labels||[]).includes('atgv-role-'+r.roleId)||(fields.labels||[]).filter(x=>x.startsWith('atgv-role-')).length!==1||String(fields.issuetype?.name||'').toLowerCase()!==String(item.type).toLowerCase())continue;
    let parent=fields.parent?.key;
    for(const expected of chain){
     if(parent!==expected)throw Error('Jira parent changed.');
     const ancestor=await readIssue(expected);
     if(ancestor.key!==expected||ancestor.fields?.project?.key!==projectKey||String(ancestor.fields?.issuetype?.name||'').toLowerCase()==='epic')throw Error('Jira hierarchy changed.');
     parent=ancestor.fields?.parent?.key;
    }
    if(parent!==r.epic||!shouldContinue())continue;
    const final=recordFor((await store.read()).documents,r.epic,r.roleId,r.issueId);
    if(final?.revision!==r.revision||final.ownerId!==r.ownerId)break;
    const fresh=await readIssue(item.key);
    if(fresh.key!==item.key||fresh.fields?.project?.key!==projectKey||fresh.fields?.assignee?.accountId||String(fresh.fields?.updated||'')!==String(fields.updated||'')||!shouldContinue())continue;
    await setAssignee(item.key,r.ownerId);
    const verified=await readIssue(item.key);
    if(verified.fields?.assignee?.accountId!==r.ownerId)throw Error('Jira assignment not confirmed.');
    changed.set(item.key,{...item,assigneeId:r.ownerId,assignee:verified.fields.assignee.displayName||r.ownerName,updated:String(verified.fields.updated||item.updated)});
   }catch(e){warnings.push(item.key+': '+String(e.message||e).slice(0,220));}
  }
 }
 return {changed,warnings};
}
// Merge verified canonical mappings and explicitly labelled live descendants.
function scopeTargets({items,register,epic,brId,roleId,projectKey}){
 const plan=pm.rolePlans({rootKey:epic,items,projectKey,register});
 const mapped=plan.scopes.find(row=>row.roleId===roleId)?.targets||[];
 const live=candidates({items,register,epic,brId,roleId});
 const byKey=new Map(live.map(x=>[x.item.key,x]));
 for(const row of mapped)if(!byKey.has(row.key))throw Error('BR hierarchy or role changed for '+row.key);
 const targets=[...mapped],known=new Set(mapped.map(x=>x.key));
 for(const {item,entry} of live){
  if(known.has(item.key)||entry)continue;
  targets.push({key:item.key,updated:String(item.updated||''),owner:String(item.assigneeId||''),ownerName:String(item.assignee||item.assigneeId||''),type:item.type,roleId,parentKey:String(item.parentKey||''),markers:[],rows:[]});
 }
 if(targets.length>500)throw Error('Role assignment exceeds 500 issues.');
 return targets;
}
function overlay(rows,records,accountId,enabledRoles,register){
 return rows.map(row=>{
  if(!row.brRoot)return row;
  const scopes={...row.roleScopes};
  for(const roleId of enabledRoles){
   if(!Object.hasOwn(ROLES,roleId))continue;
   const old=scopes[roleId],r=recordFor(records,row.key,roleId,row.id);
   let live=[];
   if(register)try{live=candidates({items:rows,register,epic:row.key,brId:row.brId,roleId}).map(x=>x.item);}catch{}
   const mine=r?!!r.ownerId&&r.ownerId===accountId:!!old?.mine||live.length>0&&live.every(x=>x.assigneeId===accountId);
   const available=r?(!r.ownerId&&(old?.available??true)&&live.every(x=>!x.assigneeId||x.assigneeId===accountId)):(old?.available??true)&&live.every(x=>!x.assigneeId||x.assigneeId===accountId);
   const keys=[...new Set([...(old?.keys||[]),...live.map(x=>x.key)])];
   scopes[roleId]={...old,count:keys.length,keys,mine,available,ownerId:r?.ownerId||'',ownerName:r?.ownerName||'',persistent:!!r?.ownerId};
  }
  return {...row,roleScopes:scopes};
 });
}
module.exports={Store,recordKey,recordFor,rootIdentity,candidates,scopeTargets,sync,overlay,validate};
