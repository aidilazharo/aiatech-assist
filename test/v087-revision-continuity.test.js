'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const reopen=require('../src/ba-jira-republish');
const baseline=require('../src/developer-revision-baseline');
const design=require('../src/developer-design-handoff');
const tdd=require('../src/developer-tdd');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
test('revision baseline inherits verified implementation and refuses silent reset',()=>{
 const stack='a'.repeat(40),app='b'.repeat(40);
 assert.equal(baseline.choose(null,stack),stack);
 assert.equal(baseline.choose({approvalSha:stack,completedCommit:app},stack),app);
 assert.throws(()=>baseline.choose({approvalSha:stack},stack),/no verified source commit/);
 assert.throws(()=>baseline.choose({approvalSha:app,completedCommit:app},stack),/different approved stack/);
});
test('previous completed revision survives failed newer run',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-revision-'));
 try{
  const one=tdd.newRecord({projectId:'demo',brId:'BR-001',revision:1});one.status='complete';one.completedCommit='b'.repeat(40);await tdd.saveRecord(root,one);
  const two=tdd.newRecord({projectId:'demo',brId:'BR-001',revision:2});two.status='failed';await tdd.saveRecord(root,two);
  assert.equal((await tdd.lastCompletedRecord(root,'demo','BR-001',3)).runId,one.runId);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('mapped UX work requires approved current design',()=>{
 const reg={synced:{'BR-001/ROLE-UX-DESIGNER':{key:'DEMO-1'}}};
 assert.throws(()=>design.requireMappedDesign(reg,'BR-001',null),/Current approved UI\/UX design/);
 assert.equal(design.requireMappedDesign(reg,'BR-001',[{screens:[{name:'Cat CRUD'}]}]),true);
 assert.equal(design.requireMappedDesign(reg,'BR-002',null),true);
});
test('reopen verifies original assignee including custom statuses',async()=>{
 let status={name:'Ready for Review',id:'4',statusCategory:{key:'new'}},owner='dev-1',moves=0;
 const reg={synced:{'BR-001':{key:'DEMO-1'}}};
 const services={read:async()=>({fields:{status,assignee:{accountId:owner}}}),verify:()=>{},transitions:async()=>[{id:'2',to:'To Do'}],move:async()=>{moves++;status={name:'To Do',id:'1'};}};
 const plan=await reopen.preview(reg,['BR-001'],services);
 assert.equal(plan.rows.length,1);assert.equal(plan.rows[0].assigneeId,'dev-1');
 owner='dev-2';await assert.rejects(reopen.apply(plan.rows[0],services),/assignee changed/);assert.equal(moves,0);
 owner='dev-1';await reopen.apply(plan.rows[0],services);assert.equal(moves,1);assert.equal(owner,'dev-1');
 const repeated=await reopen.preview(reg,['BR-001'],services);assert.equal(repeated.rows.length,0);
});
test('transition changing owner is detected rather than reported successful',async()=>{
 let status={name:'Done',id:'4'},owner='dev-1';
 const services={read:async()=>({fields:{status,assignee:{accountId:owner}}}),verify:()=>{},transitions:async()=>[{id:'2',to:'To Do'}],move:async()=>{status={name:'To Do',id:'1'};owner='dev-2';}};
 const plan=await reopen.preview({synced:{'BR-001':{key:'DEMO-1'}}},['BR-001'],services);
 await assert.rejects(reopen.apply(plan.rows[0],services),/assignee changed during status reset/);
});
