'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const recovery=require('../media/developer-recovery');
const {create}=require('../media/recovery-controller');
const job={project:'p',br:'BR-009',revision:2,stage:'needs-attention',error:'Assertion failed'};
const current={...job,eligible:true};
const info={available:true,criterion:'AC-07',lastError:'AssertionError: expected 1 got 2'};
test('developer recovery requires current assigned BR and persisted available checkpoint',()=>{
 assert.equal(recovery.evidence(info,job,current).fingerprint,'AC-07');
 for(const change of [{project:'q'},{br:'BR-010'},{revision:3},{eligible:false}])assert.equal(recovery.evidence(info,job,{...current,...change}),null);
 for(const change of [{available:false},{requiresNewRevision:true},{criterion:'unknown'},{lastError:'Locked test checksum mismatch'},{lastError:'Permission denied'},{lastError:'invalid test harness'}])assert.equal(recovery.evidence({...info,...change},job,current),null);
});
test('ordinary failures retry only when known transient and checkpoint is available',()=>{
 assert.equal(recovery.evidence(info,{...job,stage:'failed'},current),null);
 assert.ok(recovery.evidence({...info,lastError:'AI timeout'},{...job,stage:'failed'},current));
});
test('recovery counts checkpoint advancement and stops repeated criterion failures',()=>{
 const c=create({maxStagnant:2,maxActions:8});
 const proof=recovery.evidence(info,job,current);
 assert.equal(c.begin('p',proof),true);assert.equal(c.begin('p',proof),false);c.finish('p');
 assert.equal(c.begin('p',proof),true);c.finish('p');
 const next=recovery.evidence({...info,criterion:'AC-08'},job,current);
 assert.ok(next.remaining<proof.remaining);assert.equal(c.begin('p',next),true);c.finish('p');
 assert.equal(c.begin('p',next),true);c.finish('p');assert.equal(c.begin('p',next),false);
});
