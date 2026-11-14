'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {withLock,lockFile}=require('../src/file-lock');
const {workHistory,assessPlan}=require('../src/jira-change-control');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fixture=async fn=>{const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v123-lock-'));try{await fn(path.join(folder,'state'));}finally{await fs.rm(folder,{recursive:true,force:true});}};
test('local concurrent ownership writes serialize and preserve both updates',()=>fixture(async file=>{
 let count=0,active=0,peak=0;
 const one=()=>withLock(file,async()=>{active++;peak=Math.max(active,peak);const old=count;await wait(35);count=old+1;active--;});
 await Promise.all([one(),one(),one()]);
 assert.equal(count,3);assert.equal(peak,1);
 await assert.rejects(fs.access(file+'.lock'),{code:'ENOENT'});
}));
test('lock is released on handler failure without losing exclusivity',()=>fixture(async file=>{
 await assert.rejects(withLock(file,async()=>{throw new Error('intentional failure');}),/intentional failure/);
 const result=await withLock(file,async()=>42);assert.equal(result,42);
 await assert.rejects(fs.access(file+'.lock'),{code:'ENOENT'});
}));
test('active lock is not mistaken for stale lock and remains owned',()=>fixture(async file=>{
 const release=await lockFile(file);
 await assert.rejects(lockFile(file),/Document is locked by another process/);
 await release();
 const retry=await lockFile(file);await retry();
}));
test('Jira Free statuses In Progress and Done remain protection-relevant even with zero changelog events',()=>{
 for(const [key,name] of [['indeterminate','In Progress'],['done','Done']]){
  const result=workHistory({fields:{status:{statusCategory:{key},name}}},{complete:true,entries:[]});
  assert.equal(result.known,true);assert.equal(result.started,true);
 }
});
test('an approved CR cannot authorize actions outside the full plan',async()=>{
 const register={synced:{'BR-1':{key:'TC-2'}},changeRequests:[]};
 const action={path:'BR-1',action:'retire',key:'TC-2',hash:'expected'};
 const result=await assessPlan(register,[action],async()=>({known:true,started:true,reason:'Done'}),{approvedPlan:[{...action,hash:'different'}]});
 assert.equal(result.blocked.length,1);assert.match(result.blocked[0].reason,/not in the approved/);
});
test('Jira project 404 fallback uses word boundary rather than a control character',()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.ok(source.includes('/HTTP 404\\b/'));
 assert.equal(source.includes('\b'),false); // backspace control character, not regex escape
});
