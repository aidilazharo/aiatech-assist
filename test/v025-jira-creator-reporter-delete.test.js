'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const deletion=require('../src/jira-owner-br-deletion');
const source=require('node:fs').readFileSync;
const root=path.join(__dirname,'..');
const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net',
 'jira.email':'signed-in@example.com','jira.projectKey':'TC'}[key]||'')};
const brId='BR-004',epicKey='TC-834',projectId='demo';
function issue(key,parentKey='',type='Story',creator='account-creator',reporter='account-reporter'){
 return {id:key.replace('TC-',''),key,fields:{
  project:{key:'TC'},summary:key===epicKey?'BR-004: Reproducible Verification and Delivery':'Work '+key,
  description:{type:'doc',version:1,content:[]},issuetype:{name:key===epicKey?'Epic':type},
  parent:parentKey?{key:parentKey}:undefined,
  status:{name:'To Do'},updated:'2026-11-21T12:00:00.000+0000',
  creator:{accountId:creator},reporter:{accountId:reporter},labels:[]
 }};
}
function harness({actor='account-creator',creator='account-creator',reporter='account-reporter',
 deleteAllowed=true,mode='valid'}={}){
 const map=new Map([
  [epicKey,issue(epicKey,'','Epic',creator,reporter)],
  ['TC-835',issue('TC-835',epicKey,'Story')],
  ['TC-836',issue('TC-836','TC-835','Task')],
  ['TC-837',issue('TC-837','TC-836','Subtask')]
 ]);
 const deleted=[],requests=[];
 const request=async(url,opts={})=>{
  requests.push([url,opts.method||'GET']);
  if(url.endsWith('/rest/api/3/myself'))return {accountId:actor};
  if(url.includes('/mypermissions'))return {permissions:{
   BROWSE_PROJECTS:{havePermission:true},
   DELETE_ISSUES:{havePermission:deleteAllowed}
  }};
  if(url.endsWith('/rest/api/3/search/jql')){
   const parent=opts.data?.jql?.match(/^parent = (TC-\d+)$/)?.[1];
   if(!parent)throw Error('Untrusted Jira parent search');
   const matches=[...map.values()].filter(x=>x.fields.parent?.key===parent).map(x=>({key:x.key}));
   if(mode==='cross-project'&&parent===epicKey)matches.push({key:'ABC-99'});
   return {issues:matches,isLast:true};
  }
  if(opts.method==='DELETE'){
   const key=url.match(/\/issue\/(TC-\d+)\?deleteSubtasks=false$/)?.[1];
   if(!key)throw Error('Unsafe Jira deletion endpoint');
   if(!map.has(key))throw Error('Already deleted');
   if([...map.values()].some(x=>x.fields.parent?.key===key))throw Error('Parent still has child');
   map.delete(key);deleted.push(key);return {};
  }
  throw Error('Unexpected request '+url);
 };
 const read=async(_config,_token,key)=>{
  const row=map.get(key);
  if(!row)throw Error('HTTP 404');
  return structuredClone(row);
 };
 return {map,request,read,requests,deleted,actor};
}
function register(){return {revision:'revision-1',brs:[],synced:{},roleTaskMappings:{},pending:{},deletedRequirements:[]};}
async function plan(h,reg=register()){
 return deletion.preflight({register:reg,brId,epicKey,projectId,config,token:'token',request:h.request,read:h.read});
}
test('Jira Creator account ID matches and the entire Epic hierarchy is previewed deepest-first',async()=>{
 const h=harness(),p=await plan(h);
 assert.equal(p.actorId,'account-creator');assert.equal(p.eligibility.match,'Creator');
 assert.deepEqual(p.rows.map(row=>row.key),['TC-837','TC-836','TC-835','TC-834']);
 const v=deletion.preview(p);
 assert.match(v.detail,/TC-837/);assert.match(v.detail,/TC-834/);
 assert.match(v.summary,/PERMANENT AND IRREVERSIBLE/);
 assert.equal(h.deleted.length,0,'Preflight must never delete Jira issues');
});
test('Reporter match is independently eligible even when Creator differs',async()=>{
 const h=harness({actor:'account-reporter'}),p=await plan(h);
 assert.equal(p.eligibility.match,'Reporter');assert.equal(h.deleted.length,0);
});
test('nonmatching Creator and Reporter cannot request deletion',async()=>{
 const h=harness({actor:'unrelated-account'});
 await assert.rejects(plan(h),/matching BR Epic Creator or Reporter/);
 assert.equal(h.deleted.length,0);
});
test('Jira Delete Issues permission is mandatory even for the Creator',async()=>{
 const h=harness({deleteAllowed:false});
 await assert.rejects(plan(h),/Browse Projects and Delete Issues/);
 assert.equal(h.deleted.length,0);
});
test('conflicting local BRs and mapped Jira items are protected',async()=>{
 const h=harness();
 await assert.rejects(plan(h,{...register(),brs:[{id:brId}]}),/exists locally/);
 await assert.rejects(plan(h,{...register(),synced:{other:{key:'TC-836'}}}),/another local BR mapping/);
 const own=await plan(h,{...register(),synced:{'BR-004':{key:'TC-834'},'BR-004/story':{key:'TC-835'}}});
 assert.equal(own.rows.length,4,'a missing local BR may retain its original Jira mappings');
 await assert.rejects(plan(h,{...register(),synced:{'BR-004/unrelated':{key:'TC-999'}}}),/outside the selected Epic hierarchy/);
 assert.equal(h.deleted.length,0);
});
test('cross-project or unexpected Jira child blocks deletion before any remote writes',async()=>{
 const h=harness({mode:'cross-project'});
 await assert.rejects(plan(h),/cross-project child/);
 assert.equal(h.deleted.length,0);
});
test('changed or wrong BR Epic title is never treated as owned',async()=>{
 const h=harness();h.map.get(epicKey).fields.summary='BR-999: Another requirement';
 await assert.rejects(plan(h),/does not contain the selected BR identifier/);
});
test('journaled deletion runs deepest-first with no implicit Jira subtasks or Confluence deletion',async t=>{
 const h=harness(),p=await plan(h);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-owned-epic-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const registry={fileFor:()=>path.join(dir,'documents','requirements','br-register.json')};
 const job=deletion.createJob(p);
 await deletion.saveJobs(registry,projectId,{schema:1,jobs:[job]});
 const completed=[];
 const result=await deletion.execute({registry,projectId,job,config,token:'token',request:h.request,read:h.read,
  loadRegister:async()=>register(),finalize:async plan=>{completed.push(plan.brId);}});
 assert.equal(result.status,'completed');
 assert.deepEqual(h.deleted,['TC-837','TC-836','TC-835','TC-834']);
 assert.deepEqual(completed,['BR-004']);
 assert.ok(h.requests.filter(x=>x[1]==='DELETE').every(x=>x[0].includes('?deleteSubtasks=false')));
 assert.ok(h.requests.every(x=>!x[0].includes('/wiki/')));
});
test('changed issue content after approval stops all deletion',async t=>{
 const h=harness(),p=await plan(h);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-owned-epic-drift-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const registry={fileFor:()=>path.join(dir,'documents','requirements','br-register.json')};
 const job=deletion.createJob(p);
 await deletion.saveJobs(registry,projectId,{schema:1,jobs:[job]});
 h.map.get('TC-837').fields.summary='Changed since approval';
 await assert.rejects(deletion.execute({registry,projectId,job,config,token:'token',request:h.request,
  read:h.read,loadRegister:async()=>register(),finalize:async()=>{}}),/content changed after preview/);
 assert.equal(h.deleted.length,0);
});
test('new child Story discovered after preview stops deletion before any remote DELETE',async t=>{
 const h=harness(),p=await plan(h);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-owned-epic-newchild-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const registry={fileFor:()=>path.join(dir,'documents','requirements','br-register.json')};
 const job=deletion.createJob(p);
 await deletion.saveJobs(registry,projectId,{schema:1,jobs:[job]});
 h.map.set('TC-838',issue('TC-838',epicKey,'Story'));
 await assert.rejects(deletion.execute({
  registry,projectId,job,config,token:'token',request:h.request,read:h.read,
  loadRegister:async()=>register(),finalize:async()=>{}
 }),/hierarchy changed after deletion preview/);
 assert.equal(h.deleted.length,0);
});
test('user interface offers deletion review and runtime requires typed confirmation plus Creator/Reporter checks',()=>{
 const ui=source(path.join(root,'media/start.js'),'utf8');
 const host=source(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 const section=ui.slice(ui.indexOf('function renderBAJiraBackedEpics(){'),ui.indexOf('function renderBACompletedRecords(){'));
 assert.match(section,/Delete Jira BR/);assert.match(section,/send\('deleteJiraOnlyBROwned'/);
 assert.match(host,/case 'deleteJiraOnlyBROwned':/);
 assert.match(host,/DELETE BR '\+plan\.brId\+' '\+plan\.epicKey/);
 assert.match(host,/creator-reporter-jira-only-deleted/);
});
