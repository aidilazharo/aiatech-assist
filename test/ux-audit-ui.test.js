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
 const start=ba.indexOf(' function canPublishPrepared(');
 const end=ba.indexOf(' // Percentages describe verified section evidence',start);
 assert.ok(start>=0&&end>start);
 const register={sourceDocuments:[{digest:'source1'}],mappingCompleted:{sourceDigests:['source1']},discoveryRevision:1,reviewRevision:1,discoveryAnswers:Object.fromEntries(Array.from({length:12},(_,i)=>['q'+i,'answer']))};
 const brs=[{id:'BR-001',status:'draft'}];
 const ctx={brState:register,state:{preview:{reopenSkipped:[]}},requirements:()=>brs,currentJiraPreview:()=>true,busy:()=>false,baBusyTask:false};
 const can=vm.runInNewContext(ba.slice(start,end)+'\ncanPublishPrepared',ctx);
 assert.equal(can('ready',false),true);
 register.sourceDocuments.push({digest:'source2'});assert.equal(can('ready',false),false);register.sourceDocuments.pop();
 register.reviewRevision=0;assert.equal(can('ready',false),false);register.reviewRevision=1;
 ctx.state.preview.reopenSkipped=['JIRA-1'];assert.equal(can('ready',false),false);ctx.state.preview.reopenSkipped=[];
 assert.equal(can('ready',true),false);
 ctx.currentJiraPreview=()=>false;assert.equal(can('ready',false),false);
});

test('UX audit: disabled controls and role scope expose useful visible feedback',()=>{
 assert.match(ba,/Publication blocked: /);
 assert.match(ui,/Assign My Role Tasks/);
 assert.match(ui,/Release My Role Tasks/);
 assert.match(ui,/start\.setAttribute\('aria-describedby',reason\.id\)/);
 assert.match(ui,/if\(attention&&panel\.dataset\.attention!=='true'\)panel\.open=true/);
 assert.match(css,/\.role-circle-step:focus-visible\s*\{\s*outline:2px solid var\(--atgv-consistency-focus\)!important/);
});
