'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const republish=require('../src/ba-jira-republish');
const reg={synced:{'BR-001/T-001':{key:'TC-123'}}};
const read=async()=>({key:'TC-123',fields:{status:{name:'Open',id:'1'},assignee:{accountId:'owner'},updated:'v1'}});
const verify=()=>{},transitions=async()=>[],move=async()=>{throw Error('Must not move');};
test('Open without To Do is a warning, not a blocker',async()=>{
 const result=await republish.preview(reg,['BR-001'],{read,verify,transitions});
 assert.deepEqual(result.blocked,[]);assert.deepEqual(result.rows,[]);
 assert.equal(result.skipped.length,1);assert.equal(result.skipped[0].from,'Open');assert.equal(result.skipped[0].assigneeId,'owner');
});
test('transition lost after confirmation downgrades to preserving status',async()=>{
 const planned=await republish.preview(reg,['BR-001'],{read,verify,transitions:async()=>[{id:'2',to:'To Do'}]});
 const fresh=await republish.preview(reg,['BR-001'],{read,verify,transitions});
 const result=republish.reconcileConfirmed(planned.rows,[],fresh);
 assert.equal(result.rows.length,0);assert.equal(result.skipped.length,1);
 const applied=await republish.apply(planned.rows[0],{read,verify,transitions,move});
 assert.equal(applied.skipped.assigneeId,'owner');assert.equal(applied.skipped.from,'Open');
 assert.throws(()=>republish.reconcileConfirmed(planned.rows,[],{...fresh,skipped:[{...fresh.skipped[0],assigneeId:'other'}]}),/assignee changed/);
});
test('a newly available transition is not silently authorized for a previously skipped issue',async()=>{
 const planned=await republish.preview(reg,['BR-001'],{read,verify,transitions});
 const fresh=await republish.preview(reg,['BR-001'],{read,verify,transitions:async()=>[{id:'2',to:'To Do'}]});
 const result=republish.reconcileConfirmed([],planned.skipped,fresh);
 assert.equal(result.rows.length,0);assert.equal(result.skipped.length,1);
});
test('identity verification failure remains a blocker',async()=>{
 const result=await republish.preview(reg,['BR-001'],{read,transitions,verify:()=>{throw Error('Invalid identity');}});
 assert.equal(result.skipped.length,0);assert.equal(result.blocked.length,1);
});
