'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const workflow=require('../src/br-workflow');
const sync=require('../src/startup-jira-reconciliation');
const config={get:key=>({'jira.projectKey':'TC','jira.email':'test@example.test','jira.baseUrl':'https://example.atlassian.net'})[key]||''};
const approved=id=>({id,title:id,objective:'Goal',scope:'Scope',acceptanceCriteria:'Works',features:[],status:'approved',approvedRevision:1,approvedContent:{title:id,objective:'Goal',scope:'Scope',acceptanceCriteria:'Works',features:[]}});
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-startup-reconcile-'));
 try{
  const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});
  let state=await workflow.load(registry,'demo');
  state=await workflow.write(registry,'demo',state.revision,next=>{
   next.brs=[approved('BR-001'),approved('BR-002'),{id:'BR-003',title:'Draft',status:'draft'}];
   next.synced={'BR-001':{key:'TC-100',kind:'Epic'},'BR-001/F-1':{key:'TC-101',kind:'Feature'},'BR-002':{key:'TC-200',kind:'Epic'}};
   next.links={'BR-001':'retained evidence','BR-002':'other evidence'};
   next.jiraWorkHistory={'TC-100':{status:'Done'},'TC-101':{status:'Done'},'TC-200':{status:'To Do'}};
   next.completedCycles=[{id:'C1',requirements:[{id:'BR-001',jiraKey:'TC-100',jiraIssues:[{path:'BR-001',key:'TC-100'},{path:'BR-001/F-1',key:'TC-101'}]},{id:'BR-002',jiraKey:'TC-200',jiraIssues:[{path:'BR-002',key:'TC-200'}]}],relatedDocuments:{'BR-001':'evidence','BR-002':'other'}}];
   next.completedIndex=[{id:'BR-001',jiraKey:'TC-100'},{id:'BR-002',jiraKey:'TC-200'}];
  });
  const request=async url=>url.includes('/mypermissions')?{permissions:{BROWSE_PROJECTS:{havePermission:true}}}:{key:'TC'};
  const read=available=>async(_config,_token,key)=>available.includes(key)?{key,fields:{project:{key:'TC'}}}:Promise.reject(Error('HTTP 404: not found or not visible'));
  await fn({registry,request,read});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('Jira 404 preserves published BR records and links until verified',()=>fixture(async({registry,request,read})=>{
 const opts={registry,projectId:'demo',config,token:'test',request};
 const missing=await sync.run({...opts,readIssue:read(['TC-200'])});
 assert.equal(missing.brsRemoved,0);assert.equal(missing.linksRemoved,0);
 assert.deepEqual(missing.register.brs.map(x=>x.id),['BR-001','BR-002','BR-003']);
 assert.equal(missing.register.synced['BR-001'].key,'TC-100');
 assert.equal(missing.register.synced['BR-001/F-1'].key,'TC-101');
 assert.equal(missing.register.jiraWorkHistory['TC-100'].status,'Done');
 assert.equal(missing.register.startupJiraReconciliation.verification['BR-001|TC-100'].status,'verification-required');
 assert.equal(missing.pendingVerification,2);
 const revision=missing.register.revision;
 const unchanged=await sync.run({...opts,readIssue:read(['TC-200'])});
 assert.equal(unchanged.changed,false);
 assert.equal((await workflow.load(registry,'demo')).revision,revision);
 const restored=await sync.run({...opts,readIssue:read(['TC-100','TC-101','TC-200'])});
 assert.equal(restored.verificationCleared,2);
 assert.deepEqual(restored.register.startupJiraReconciliation.verification,{});
 assert.equal(restored.register.synced['BR-001'].key,'TC-100');
}));
test('an unavailable child stays linked and cannot be re-created by accident',()=>fixture(async({registry,request,read})=>{
 const opts={registry,projectId:'demo',config,token:'test',request};
 const missing=await sync.run({...opts,readIssue:read(['TC-100','TC-200'])});
 assert.equal(missing.linksRemoved,0);
 assert.equal(missing.register.synced['BR-001/F-1'].key,'TC-101');
 assert.equal(workflow.plan(missing.register).some(x=>x.path==='BR-001/F-1'&&x.action==='create'),false);
 const restored=await sync.run({...opts,readIssue:read(['TC-100','TC-101','TC-200'])});
 assert.equal(restored.verificationCleared,1);
 assert.equal(restored.register.synced['BR-001/F-1'].key,'TC-101');
}));

test('authorization, network and project failures leave the register unchanged',()=>fixture(async({registry,request,read})=>{
 const opts={registry,projectId:'demo',config,token:'test'};
 const before=await workflow.load(registry,'demo');
 await assert.rejects(sync.run({...opts,request:async url=>url.includes('/mypermissions')?{permissions:{BROWSE_PROJECTS:{havePermission:false}}}:{key:'TC'},readIssue:read([])}),/Browse Projects/);
 await assert.rejects(sync.run({...opts,request,readIssue:async()=>{throw Error('HTTP 403 forbidden');}}),/403/);
 await assert.rejects(sync.run({...opts,request,readIssue:async()=>{throw Error('Network timeout');}}),/timeout/);
 await assert.rejects(sync.run({...opts,request:async()=>({key:'OTHER'}),readIssue:read([])}),/identity changed/);
 assert.equal((await workflow.load(registry,'demo')).revision,before.revision);
}));
test('pending publication and changed project prevent automatic removal',()=>fixture(async({registry,request,read})=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.write(registry,'demo',state.revision,next=>{next.pending['BR-001/F-1']={action:'create'};});
 const result=await sync.run({registry,projectId:'demo',config,token:'test',request,readIssue:read(['TC-200'])});
 assert.equal(result.brsRemoved,0);assert.ok((await workflow.load(registry,'demo')).brs.some(x=>x.id==='BR-001'));
 const before=await workflow.load(registry,'demo');
 await assert.rejects(sync.run({registry,projectId:'demo',config,token:'test',request,readIssue:read([]),shouldContinue:()=>false}),/Project changed/);
 assert.equal((await workflow.load(registry,'demo')).revision,before.revision);
}));
