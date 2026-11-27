'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const recovery=require('../media/ux-recovery');
const {create}=require('../media/recovery-controller');
const job={project:'p',key:'TC-1',framework:'aia-qi',revision:'r1'};
test('UX recovery retries transient and malformed-generation errors only',()=>{
 for(const m of ['AI timed out','HTTP 503','Invalid JSON','Unexpected token in JSON','User flow connects to a missing node.'])assert.equal(recovery.classify(m),'retry',m);
 for(const m of ['HTTP 403 timeout','Connect the configured GitHub project repository','Missing design reference','Approved BR changed','Unknown error','quota exceeded'])assert.equal(recovery.classify(m),'blocked',m);
});
test('UX recovery requires same verified project, assignment and framework',()=>{
 assert.equal(recovery.sameScope(job,{...job,eligible:true}),true);
 for(const delta of [{project:'q'},{key:'TC-2'},{framework:'other'},{eligible:false}])assert.equal(recovery.sameScope(job,{...job,eligible:true,...delta}),false);
});
test('reconciliation prevents duplicate generation and refuses changed revisions',()=>{
 assert.equal(recovery.reconcile(job,{key:job.key,exists:false,revision:'r1'}),'retry');
 assert.equal(recovery.reconcile(job,{key:job.key,exists:true,status:'review',revision:'r2'}),'complete');
 assert.equal(recovery.reconcile(job,{key:job.key,exists:true,status:'approved',revision:'r2'}),'complete');
 assert.equal(recovery.reconcile(job,{key:job.key,exists:true,status:'rejected',revision:'r2'}),'blocked');
 assert.equal(recovery.reconcile(job,{key:'TC-2',revision:'r1'}),'blocked');
});
test('shared controller stops duplicate attempts and repeated stagnant retries',()=>{
 const c=create({maxStagnant:2,maxActions:6}),e={eligible:true,action:'generate',remaining:5,fingerprint:'r1'};
 assert.equal(c.begin('p',e),true);assert.equal(c.begin('p',e),false);c.finish('p');
 assert.equal(c.begin('p',e),true);c.finish('p');assert.equal(c.begin('p',e),false);
});
