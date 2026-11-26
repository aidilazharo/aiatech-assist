'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const view=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const code=view.slice(view.indexOf('function developerStageRingModel('),view.indexOf('function renderDeveloperStageRing('));
const model=vm.runInNewContext(code+'\ndeveloperStageRingModel');
const base={stage:'idle',initial:false,preview:false,ready:false,running:false,done:false,completed:0,cycleIndex:0,cycleTotal:0};
test('initial and runtime readiness never masquerade as TDD completion',()=>{
 assert.equal(model({...base,initial:true,preview:true,ready:true}).percent,0);
 assert.equal(model({...base,initial:true,preview:true,ready:true,running:true}).title,'Application Readiness');
 assert.equal(model({...base,initial:true,preview:true,ready:true,running:true}).percent,100);
});
test('TDD progress uses completed criteria, not current index or time',()=>{
 assert.equal(model({...base,stage:'green',cycleIndex:2,cycleTotal:4}).percent,25);
 assert.equal(model({...base,stage:'red',cycleIndex:1,cycleTotal:4}).percent,0);
 assert.equal(model({...base,stage:'needs-attention',failedAt:'green',cycleIndex:2,cycleTotal:4}).color,'#dc2626');
});
test('verified development is separate from Jira delivery',()=>assert.equal(model({...base,done:true}).title,'Development verification'));
