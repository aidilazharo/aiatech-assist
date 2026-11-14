'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const cleanup=require('../src/orphaned-jira-cleanup');
const {jiraMarker}=require('../src/remote-actions');
const projectId='test-project',site='https://example.atlassian.net',at='2026-11-04T12:00:00Z';
const config={get(key){return {'jira.baseUrl':site,'jira.projectKey':'TC','jira.email':'test@example.com'}[key]||'';}};
function fixture(){
 const markerFor=p=>jiraMarker(config,p,projectId);
 const issue=(key,marker,parent='',updated='2026-11-05T08:00:00Z')=>({key,fields:{project:{key:'TC'},summary:'ATGV managed '+key,description:null,labels:[marker],updated,parent:parent?{key:parent}:null,status:{name:'To Do'}}});
 const issues={
  'TC-100':issue('TC-100',markerFor('BR-001')),
  'TC-101':issue('TC-101',markerFor('BR-001/F-001'),'TC-100'),
  'TC-999':issue('TC-999',markerFor('BR-999')),
 };
 const register={revision:'rev-1',brs:[{id:'BR-999'}],synced:{'BR-999':{key:'TC-999'}},deletedRequirements:[{id:'BR-001',title:'Old requirement',at,remoteRecordsPreserved:true,jiraIssues:[{key:'TC-100',path:'BR-001'},{key:'TC-101',path:'BR-001/F-001'}]}]};
 let permission=true,unknownChild=false,denyDelete='',calls=[];
 const request=async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET'});
  if(url.includes('mypermissions'))return {permissions:{BROWSE_PROJECTS:{havePermission:permission},DELETE_ISSUES:{havePermission:permission}}};
  if(url.endsWith('/search/jql')){
   const key=opts.data.jql.match(/parent = (TC-\d+)/)?.[1];
   const children=Object.values(issues).filter(i=>i.fields.parent?.key===key).map(i=>({key:i.key}));
   if(unknownChild&&key==='TC-100')children.push({key:'TC-777'});
   return {issues:children,isLast:true};
  }
  if(opts.method==='DELETE'){
   const key=url.match(/\/issue\/(TC-\d+)/)?.[1];
   if(key===denyDelete)throw Error('HTTP 403 Permission denied');
   delete issues[key];return {};
  }
  throw Error('Unexpected URL '+url);
 };
 const readJira=async(c,t,key)=>{if(!issues[key])throw Error('HTTP 404');return structuredClone(issues[key]);};
 return {register,issues,request,readJira,calls,setPermission:b=>permission=b,setUnknownChild:b=>unknownChild=b,setDeny:k=>denyDelete=k};
}
const createRegistry=root=>({fileFor:id=>path.join(root,id,'project.json')});
async function temp(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-orphan-'));try{return await fn(createRegistry(root));}finally{await fs.rm(root,{recursive:true,force:true});}}
test('historical cleanup uses tombstones, not all Jira project issues or creator identity',async()=>{
 const f=fixture();const plan=await cleanup.preflight({register:f.register,brId:'BR-001',at,config,token:'FAKE',projectId,request:f.request,readJira:f.readJira});
 assert.deepEqual(plan.rows.map(r=>r.key),['TC-101','TC-100']);
 assert.ok(!plan.rows.some(r=>r.key==='TC-999'));
 assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
});
test('rejects missing marker, wrong project, active keys, changed child links and denied delete permission',async()=>{
 const f=fixture(),opts={register:f.register,brId:'BR-001',at,config,token:'FAKE',projectId,request:f.request,readJira:f.readJira};
 f.issues['TC-101'].fields.labels=['not-atgv'];await assert.rejects(cleanup.preflight(opts),/ownership marker/);
 f.issues['TC-101'].fields.labels=[jiraMarker(config,'BR-001/F-001',projectId)];
 f.register.synced['BR-999/F-001']={key:'TC-101'};await assert.rejects(cleanup.preflight(opts),/still mapped/);delete f.register.synced['BR-999/F-001'];
 f.setUnknownChild(true);await assert.rejects(cleanup.preflight(opts),/child issues outside/);f.setUnknownChild(false);
 f.setPermission(false);await assert.rejects(cleanup.preflight(opts),/Delete Issues permissions/);
});
test('cleanup validates against later Jira changes before deleting and keeps active Jira untouched',()=>temp(async registry=>{
 const f=fixture(),opts={register:f.register,brId:'BR-001',at,config,token:'FAKE',projectId,request:f.request,readJira:f.readJira};
 const plan=await cleanup.preflight(opts),job=cleanup.createJob(plan,'Test user');
 await cleanup.writeJobs(registry,projectId,{schema:1,jobs:[job]});
 f.issues['TC-101'].fields.updated='2026-11-06T00:00:00Z';
 await assert.rejects(cleanup.execute({registry,projectId,job,config,token:'FAKE',request:f.request,readJira:f.readJira,loadRegister:async()=>f.register,finalize:async()=>{}}),/changed after cleanup preview/);
 assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
 assert.ok(f.issues['TC-999']);
}));
test('cleanup deletes descendants first and records a partial job if Jira rejects deletion',()=>temp(async registry=>{
 const f=fixture(),opts={register:f.register,brId:'BR-001',at,config,token:'FAKE',projectId,request:f.request,readJira:f.readJira};
 const plan=await cleanup.preflight(opts),job=cleanup.createJob(plan,'Test user');
 await cleanup.writeJobs(registry,projectId,{schema:1,jobs:[job]});
 f.setDeny('TC-100');let finalized=false;
 await assert.rejects(cleanup.execute({registry,projectId,job,config,token:'FAKE',request:f.request,readJira:f.readJira,loadRegister:async()=>f.register,finalize:async()=>{finalized=true;}}),/HTTP 403/);
 assert.equal(finalized,false);assert.equal(f.issues['TC-101'],undefined);
 assert.ok(f.issues['TC-100']);assert.ok(f.issues['TC-999']);
 let state=await cleanup.readJobs(registry,projectId);
 assert.equal(state.jobs[0].status,'partial');assert.equal(state.jobs[0].results['TC-101'].status,'deleted');
 f.setDeny('');
 await cleanup.execute({registry,projectId,job,config,token:'FAKE',request:f.request,readJira:f.readJira,loadRegister:async()=>f.register,finalize:async()=>{finalized=true;}});
 state=await cleanup.readJobs(registry,projectId);
 assert.equal(state.jobs[0].status,'completed');assert.equal(finalized,true);
 assert.equal(f.issues['TC-100'],undefined);assert.ok(f.issues['TC-999']);
 assert.deepEqual(f.calls.filter(c=>c.method==='DELETE').map(c=>c.url.match(/TC-\d+/)[0]),['TC-101','TC-100','TC-100']);
}));
test('BA workflow exposes a separate explicit cleanup action without changing the existing Delete Everywhere flow',async()=>{
 const ext=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8'),ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(ext,/reviewPreviouslyDeletedJira/);assert.match(ext,/DELETE HISTORICAL JIRA/);
 assert.match(ext,/case 'deleteBREverywhere'/);assert.match(ui,/baReviewDeletedJira/);
});
