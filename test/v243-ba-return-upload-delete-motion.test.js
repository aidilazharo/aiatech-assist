'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const workflow=fs.readFileSync(path.join(root,'src/br-workflow.js'),'utf8');

function recoverable(state){
 const section=ui.match(/function baHasRecoverableBR\(state\)\{[\s\S]*?\n\}/);
 assert.ok(section,'Expected resumable BR predicate');
 return vm.runInNewContext(`${section[0]};baHasRecoverableBR(state)`,{state});
}
test('in-progress visibility is deferred until leaving and returning to Business Requirements Start',()=>{
 assert.match(ui,/if\(view==='discovery'&&next!=='discovery'\)\{\s*baResumeCardReady=baHasRecoverableBR\(brState\)/);
 assert.match(ui,/else if\(next==='discovery'&&view!=='discovery'&&baResumeCardReady\)\{\s*baViewedStep='start'/);
 assert.match(ui,/const unfinished=baResumeCardReady&&started&&baHasRecoverableBR\(brState\)/);
 assert.match(ui,/panel\.classList\.toggle\('hidden',!unfinished\|\|displayed!=='start'\)/);
 assert.match(ui,/if\(m\.type==='discoveryRestarted'\)\{baPreflightInfo=null;mappingFailurePhase='';baResumeCardReady=false/);
});
test('new uploaded source reveals Step 2 and its documents area after upload completes',()=>{
 const event=ui.slice(ui.indexOf("if(m.type==='discoveryUploadDone')"),ui.indexOf("if(m.type==='discoverySaved')"));
 assert.match(event,/baViewedStep='upload'/);
 assert.match(event,/renderDiscoverySummary\(\)/);
 assert.match(event,/\.source-documents-panel:not\(\.hidden\)/);
 assert.match(ui,/const showSources=displayed==='upload'/);
});
test('in-progress deletion removes the card after authoritative register update',()=>{
 assert.equal(!!recoverable({sourceDocuments:[{digest:'abc'}]}),true);
 assert.equal(!!recoverable({restartPending:true,sourceDocuments:[],brs:[]}),true);
 assert.equal(!!recoverable({sourceDocuments:[],brs:[{status:'draft'}]}),true);
 assert.equal(!!recoverable({sourceDocuments:[],brs:[],restartPending:false}),false);
 assert.equal(!!recoverable({sourceDocuments:[],brs:[{status:'retired'}],restartPending:false}),false);
 assert.match(ui,/if\(!baHasRecoverableBR\(brState\)\)\{\s*baResumeCardReady=false/);
 assert.match(ui,/\$\('baUncompletedPanel'\)\.classList\.add\('hidden'\)/);
 assert.match(workflow,/Deleting the final in-progress source discards the empty cycle/);
});
test('circular progress animation differentiates selected, completed and reduced-motion states',()=>{
 assert.match(css,/@keyframes atgvBAStagePulse/);
 assert.match(css,/@keyframes atgvBAStageCheck/);
 assert.match(css,/\.workflow-step\.current:not\(\[data-status="success"\]\) \.milestone-circle::after/);
 assert.match(css,/#discoveryView \.discovery-workflow::after\{transition:width/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/animation:none!important/);
});
