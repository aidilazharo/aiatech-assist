'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../media/recovery-controller');
const evidence=(action,remaining,fingerprint)=>({eligible:true,action,remaining,fingerprint});
function attempt(c,scope,e){const allowed=c.begin(scope,e);if(allowed)c.finish(scope);return allowed;}
test('alternating repair and preview cannot reset duplicate recovery budgets',()=>{
 const c=create({maxStagnant:2,maxActions:12});
 const repair=evidence('repair',5,'same-findings'),preview=evidence('preview',1,'same-revision');
 assert.equal(attempt(c,'p',repair),true);
 assert.equal(attempt(c,'p',preview),true);
 assert.equal(attempt(c,'p',repair),true);
 assert.equal(attempt(c,'p',preview),true);
 assert.equal(attempt(c,'p',repair),false);
 assert.equal(c.get('p').paused,true);
});
test('only improvement against the best evidence for that action resets stagnation',()=>{
 const c=create();
 assert.equal(attempt(c,'p',evidence('repair',5,'a')),true);
 assert.equal(attempt(c,'p',evidence('repair',7,'b')),true);
 assert.equal(attempt(c,'p',evidence('repair',6,'c')),false);
 const d=create();
 assert.equal(attempt(d,'p',evidence('repair',5,'a')),true);
 assert.equal(attempt(d,'p',evidence('repair',5,'a')),true);
 assert.equal(attempt(d,'p',evidence('repair',4,'b')),true);
 assert.equal(attempt(d,'p',evidence('repair',4,'b')),true);
 assert.equal(attempt(d,'p',evidence('repair',4,'b')),false);
});
test('unchanged fingerprint cannot claim progress and scopes remain isolated',()=>{
 const c=create();
 assert.equal(attempt(c,'p',evidence('repair',5,'a')),true);
 assert.equal(attempt(c,'p',evidence('repair',4,'a')),true);
 assert.equal(attempt(c,'p',evidence('repair',3,'a')),false);
 assert.equal(attempt(c,'q',evidence('repair',5,'a')),true);
 assert.equal(c.resume('p'),true);
 assert.equal(attempt(c,'p',evidence('repair',5,'a')),true);
});
test('in-flight, cancellation, completion and total budget protections remain intact',()=>{
 const c=create({maxActions:2});const e=evidence('repair',5,'a');
 assert.equal(c.begin('p',e),true);assert.equal(c.begin('p',e),false);
 c.complete('p');assert.equal(c.resume('p'),false);
 c.finish('p',{cancelled:true});assert.equal(c.begin('p',e),false);
 assert.equal(c.resume('p'),true);assert.equal(attempt(c,'p',e),true);
 assert.equal(attempt(c,'p',evidence('repair',4,'b')),true);
 assert.equal(attempt(c,'p',evidence('repair',3,'c')),false);
 c.complete('p');assert.equal(attempt(c,'p',e),true);
});
