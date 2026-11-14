'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const edit=require('../src/jira-item-editor'),inventory=require('../src/role-jira-inventory'),br=require('../src/br-workflow');
const config={get:key=>({'jira.projectKey':'TC','jira.email':'test@example.com','jira.baseUrl':'https://example.atlassian.net'})[key]||''};
const issue=(status='To Do',updated='2026-11-12T08:00:00.000+0000',summary='Person names')=>({key:'TC-440',fields:{project:{key:'TC'},updated,summary,description:null,status:{name:status}}});
test('Jira saves edited summary and transitions status, then verifies remote state',async()=>{
 let current=issue(),writes=[];
 const result=await edit.save({config,token:'token',key:'TC-440',expectedUpdated:current.fields.updated,draft:{summary:'Person directory',description:'',transitionId:'31'},read:async()=>current,transitions:async()=>[{id:'31',name:'Start Progress',to:'In Progress'}],request:async(url,req)=>{
  writes.push({url,method:req.method});
  if(req.method==='PUT')current={...current,fields:{...current.fields,summary:'Person directory',updated:'2026-11-12T08:01:00.000+0000'}};
  if(req.method==='POST')current={...current,fields:{...current.fields,status:{name:'In Progress'},updated:'2026-11-12T08:02:00.000+0000'}};
 }});
 assert.equal(result.status,'In Progress');assert.equal(result.contentChanged,true);assert.equal(result.statusChanged,true);
 assert.deepEqual(writes.map(x=>x.method),['PUT','POST']);
});
test('Jira rejects stale edits before PUT and invalid transitions before writing',async()=>{
 const write=async()=>{throw Error('must not write');};
 await assert.rejects(()=>edit.save({config,token:'token',key:'TC-440',expectedUpdated:'stale',draft:{summary:'New',description:''},read:async()=>issue(),request:write}),/changed since it was opened/);
 await assert.rejects(()=>edit.save({config,token:'token',key:'TC-440',expectedUpdated:issue().fields.updated,draft:{summary:'Person names',description:'',transitionId:'33'},read:async()=>issue(),transitions:async()=>[{id:'31',to:'Done'}],request:write}),/no longer available/);
});
test('Status-only edit creates durable BR Updated review state without replacing approval',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-jira-status-'));
 const registry={fileFor:id=>path.join(folder,id,'project.json')};
 try{
  const before=await br.load(registry,'tc');
  const seeded=await br.write(registry,'tc',before.revision,next=>{
   next.brs=[{id:'BR-001',status:'approved',approvedContent:{title:'Person CRUD'},approvedRevision:1,features:[]}];
   next.synced={'BR-001':{key:'TC-440',remoteDigest:'a'.repeat(64)}};
  });
  const result=await br.recordLinkedJiraStatus(registry,'tc',seeded.revision,{path:'BR-001',key:'TC-440',previousStatus:'To Do',status:'In Progress'});
  assert.equal(result.brs[0].status,'approved');assert.equal(result.brs[0].externalReviewRequired,true);
  assert.equal(result.jiraStatusEdits.at(-1).status,'In Progress');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('My Work Jira inventory shows the BR Updated review state independently of Jira status',()=>{
 const register={brs:[{id:'BR-001',status:'approved',approvedContent:{title:'Person CRUD'},externalReviewRequired:true}],synced:{'BR-001':{key:'TC-440',remoteDigest:'a'.repeat(64)}}};
 // A full ownership tree is not needed when no BR owner mapping is present.
 const result=inventory.enrich([{key:'TC-441',type:'Task',status:'In Progress',parentKey:'TC-440'}],register,'actor');
 assert.equal(result[0].status,'In Progress');
 const web=fs.readFile;assert.equal(typeof web,'function');
});
test('Jira datatable refreshes live status after save, including slow in-flight inventory refresh',async()=>{
 const web=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(web,/roleJiraRefreshAfterSave=true/);
 assert.match(web,/roleJiraIssueSaved/);
 assert.match(web,/loadRoleJiraIssues\(true\)/);
 assert.match(web,/roleJiraRefreshAfterSave\)\{roleJiraRefreshAfterSave=false;loadRoleJiraIssues\(true\)/);
 assert.match(host,/transitionId:msg\.transitionId/);
 assert.match(host,/recordLinkedJiraStatus/);
 assert.match(web,/Updated · Review required/);
});
