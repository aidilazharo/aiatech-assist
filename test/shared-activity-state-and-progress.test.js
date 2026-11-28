'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const code=ui.slice(ui.indexOf('function atgvActivityName('),ui.indexOf('function renderAtgvJobs('));
const api=new Function(code+'\nreturn {name:atgvActivityName,matches:atgvActivityMatches,progress:atgvActivityProgress,resume:atgvActivityCanResume,scoped:atgvActivityScopedItems,summary:atgvActivitySummary}')();
test('activity uses explicit status names and correctly groups recovery states',()=>{
 assert.equal(api.name('running'),'In progress');
 assert.equal(api.name('repairing'),'Automatically repairing');
 assert.equal(api.name('review-required'),'Review required');
 assert.equal(api.name('constructor'),'Constructor');
 assert.equal(api.matches({status:'repairing'},'active'),true);
 assert.equal(api.matches({status:'blocked'},'attention'),true);
 assert.equal(api.matches({status:'cancelled'},'finished'),true);
 assert.equal(api.matches({status:'ready'},'finished'),false);
});
test('a numerical percentage alone cannot establish measurable progress',()=>{
 assert.equal(api.progress({status:'running',progress:97}),null);
 assert.equal(api.progress({metadata:{totalUnits:0,completedUnits:0}}),null);
 assert.equal(api.progress({metadata:{totalUnits:10,completedUnits:11}}),null);
 assert.equal(api.progress({metadata:{totalUnits:10,completedUnits:'2'}}),null);
 assert.deepEqual(api.progress({metadata:{totalUnits:10,completedUnits:0}}),{total:10,completed:0});
 assert.deepEqual(api.progress({metadata:{totalUnits:10,completedUnits:3}}),{total:10,completed:3});
});
test('resume is offered only to interrupted or failed retryable read or AI jobs',()=>{
 for(const kind of ['write','install','local','external'])assert.equal(api.resume({kind,retryable:true,status:'failed'}),false);
 assert.equal(api.resume({kind:'ai',retryable:true,status:'reconcile-required'}),false);
 assert.equal(api.resume({kind:'ai',retryable:false,status:'failed'}),false);
 assert.equal(api.resume({kind:'ai',retryable:true,status:'interrupted'}),true);
 assert.equal(api.resume({kind:'read',retryable:true,status:'failed'}),true);
});
test('activity is scoped to the active project and accurately counts displayed rows',()=>{
 const rows=[{projectId:'a',status:'running'},{projectId:'b',status:'completed'},{status:'failed'}];
 assert.deepEqual(api.scoped(rows,'a','b'),[]);
 assert.deepEqual(api.scoped(rows,'a',''),[]);
 assert.deepEqual(api.scoped(rows,'a','a'),[rows[0],rows[2]]);
 assert.equal(api.summary(Array.from({length:35},()=>({status:'running'})),'all','a'),'30 of 35 shown · 35 active · 0 need attention');
 assert.equal(api.summary([],'all',''),'Open a project to see activity.');
 assert.match(ui,/if\(!activeId\|\|msg\.projectId!==activeId\)return;/);
 assert.match(ui,/if\(previousActivityProject!==activeId\)resetAtgvActivity\(\);/);
});
