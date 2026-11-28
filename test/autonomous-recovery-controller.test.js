'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../media/recovery-controller');
const ev=(remaining,action='repair',fingerprint='finding')=>({eligible:true,remaining,action,fingerprint});
test('recovery continues on verified improvement and pauses repeated failures',()=>{
 const c=create();assert.equal(c.begin('p',ev(3)),true);assert.equal(c.begin('p',ev(3)),false);
 const improved=ev(2,'repair','remaining-findings');
 c.finish('p');assert.equal(c.begin('p',improved),true);c.finish('p');
 assert.equal(c.begin('p',improved),true);c.finish('p');
 assert.equal(c.begin('p',improved),false);assert.equal(c.get('p').paused,true);
 assert.equal(c.resume('p'),true);assert.equal(c.begin('p',improved),true);
});
test('cancel, failure, independent scopes and finite total budget',()=>{
 const c=create({maxActions:2});
 assert.equal(c.begin('p',ev(3)),true);c.pause('p');c.finish('p',{cancelled:true});
 assert.equal(c.begin('p',ev(2)),false);
 assert.equal(c.begin('q',ev(3)),true);c.finish('q');assert.equal(c.begin('q',ev(2)),true);c.finish('q');
 assert.equal(c.begin('q',ev(1)),false);
 assert.equal(c.begin('r',{...ev(1),eligible:false}),false);
 assert.equal(c.begin('r',ev(1)),true);c.finish('r',{failed:true});assert.equal(c.begin('r',ev(1)),false);
});
test('completed scope resets budget only after operation has finished',()=>{
 const c=create();c.begin('p',ev(1));c.complete('p');assert.equal(c.get('p').running,true);
 c.finish('p');c.complete('p');assert.equal(c.get('p').actions,0);
});
