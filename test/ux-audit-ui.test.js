'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ba=read('media/ba-automatic-ui.js');
const ui=read('media/start.js');
const css=read('media/atgv-consistency.css');

test('UX audit: new attention opens a panel without overriding a manual collapse on repeated renders',()=>{
 const panel={dataset:{},open:false,hidden:true};
 const start=ba.indexOf(' function setReadyPanel(');
 const end=ba.indexOf(' // A verified automatic Jira projection',start);
 assert.ok(start>=0&&end>start);
 const set=vm.runInNewContext(ba.slice(start,end)+'\nsetReadyPanel',{get:()=>panel,dirty:()=>false});
 set('requirements','needs-attention');assert.equal(panel.open,true);
 panel.open=false;set('requirements','needs-attention');assert.equal(panel.open,false);
 set('requirements','ready');assert.equal(panel.open,false);
 set('requirements','needs-attention');assert.equal(panel.open,true);
});

test('UX audit: publication remains gated by source coverage, discovery and valid Jira preview',()=>{
 const start=ba.indexOf(' function currentJiraPreview(');
 const end=ba.indexOf(' // Percentages describe verified section evidence',start);
 assert.ok(start>=0&&end>start);
 const register={revision:'r1',sourceDocuments:[{digest:'source1'}],mappingCompleted:{sourceDigests:['source1']},discoveryRevision:1,reviewRevision:1,discoveryAnswers:Object.fromEntries(Array.from({length:12},(_,i)=>['q'+i,'answer']))};
 const brs=[{id:'BR-001',status:'draft'}];
 const preview={revision:'r1',conflicts:[],reopenSkipped:[]};
 const ctx={brState:register,activeId:'demo',state:{projectId:'demo',preview},requirements:()=>brs,busy:()=>false,baBusyTask:false};
 const can=vm.runInNewContext(ba.slice(start,end)+'\ncanPublishPrepared',ctx);
 assert.equal(can('ready',false),true);
 register.sourceDocuments.push({digest:'source2'});assert.equal(can('ready',false),false);register.sourceDocuments.pop();
 register.reviewRevision=0;assert.equal(can('ready',false),false);register.reviewRevision=1;
 preview.reopenSkipped.push({key:'JIRA-1',message:'No available transition to To Do'});
 assert.equal(can('ready',false),true);
 assert.equal(can('ready',true),false);
 preview.conflicts.push('Jira issue identity could not be verified.');
 assert.equal(can('ready',false),false);
 preview.conflicts.pop();
 preview.revision='stale';
 assert.equal(can('ready',false),false);
});

test('UX audit: disabled controls and role scope expose useful visible feedback',()=>{
 assert.match(ba,/Publication blocked: /);
 assert.match(ui,/Assign My Role Tasks/);
 assert.match(ui,/Release My Role Tasks/);
 assert.match(ui,/start\.setAttribute\('aria-describedby',reason\.id\)/);
 assert.match(ui,/if\(attention&&panel\.dataset\.attention!=='true'\)panel\.open=true/);
 assert.match(css,/\.role-circle-step:focus-visible\s*\{\s*outline:2px solid var\(--atgv-consistency-focus\)!important/);
});
