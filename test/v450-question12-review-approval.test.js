'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const discovery=require('../src/ba-discovery');
const source=relative=>fs.readFileSync(path.join(__dirname,'..',relative),'utf8');
const ui=source('media/start.js');
const host=source('src/lib/runtime/extension-runtime.js');

function readiness(answers){
 const begin=ui.indexOf('function noOpenDecisions(value){');
 const end=ui.indexOf('function refreshDiscoveryGroupCounts(){',begin);
 assert.ok(begin>=0&&end>begin);
 const $=id=>id==='discoveryQuestions'?{children:[{}]}:{value:answers[id.slice(3)]??''};
 return vm.runInNewContext(ui.slice(begin,end)+'\ncurrentDiscoveryReadiness()',
 {$,BA_QUESTIONS:discovery.QUESTIONS,discoveryDirty:true,discoveryData:null});
}
const answers=Object.fromEntries(discovery.QUESTIONS.map(([key])=>[key,key==='questions'?'No open decisions':'Confirmed source requirement']));
test('Question 12 blank is missing, not silently interpreted as no decisions',()=>{
 const missing={...answers,questions:''};
 assert.equal(discovery.assess(missing).filled,11);
 assert.equal(discovery.assess(missing).canReview,false);
 assert.equal(readiness(missing).canReview,false);
});
test('Question 12 with outstanding decisions is 12/12 and can enter AI Review',()=>{
 const pending={...answers,questions:'TRM synchronization decision is pending. Owner: Finance. Date: unconfirmed.'};
 const backend=discovery.assess(pending),frontend=readiness(pending);
 assert.equal(backend.filled,12);
 assert.equal(backend.canReview,true);
 assert.equal(backend.needsDecision,true);
 assert.equal(backend.canApprove,false);
 assert.equal(frontend.canReview,true);
 assert.equal(frontend.needsDecision,true);
 assert.equal(frontend.canApprove,false);
});
test('Checkbox-confirmed no decisions and legacy NONE both support review and approval readiness',()=>{
 for(const value of ['No open decisions','NONE','NONE.','No unresolved decisions','N/A']){
  const candidate={...answers,questions:value};
  const server=discovery.assess(candidate),webview=readiness(candidate);
  assert.equal(server.canReview,true,value);
  assert.equal(server.canApprove,true,value);
  assert.equal(server.needsDecision,false,value);
  assert.equal(webview.canReview,true,value);
  assert.equal(webview.needsDecision,false,value);
 }
});
test('Explicit choice cannot overwrite an unresolved decision and does not auto-save',()=>{
 assert.match(ui,/noDecisionCheckbox\.checked&&area\.value\.trim\(\)&&!noOpenDecisions\(area\.value\)/);
 assert.match(ui,/noDecisionCheckbox\.checked=false/);
 assert.match(ui,/area\.value='No open decisions'/);
 assert.match(ui,/area\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
 assert.match(ui,/Manual Save is still required/);
 assert.match(ui,/if\(readiness\.filled!==readiness\.total\)/);
 assert.match(ui,/else if\(readiness\.needsDecision\)/);
});
test('Host permits full Discovery for AI Review and blocks both final approval paths when decisions remain',()=>{
 const confirm=host.slice(host.indexOf("case 'confirmDiscoveryReview':{"),host.indexOf("case 'applyDiscoveryReview':{"));
 assert.match(confirm,/saved\.readiness\.filled!==saved\.readiness\.total/);
 assert.doesNotMatch(confirm,/saved\.readiness\.needsDecision/);
 for(const [start,end] of [["case 'brSaveAndApprove':{","case 'brApprove':{"],["case 'brApprove':{","case 'brBusinessOwnerReview':{"]]){
  const body=host.slice(host.indexOf(start),host.indexOf(end,host.indexOf(start)+start.length));
  assert.match(body,/savedDiscovery\.readiness\.canReview/);
  assert.match(body,/savedDiscovery\.readiness\.needsDecision/);
  assert.ok(body.indexOf('savedDiscovery.readiness.needsDecision')<body.indexOf('uiWarning('),'Must fail before human approval and mutations');
 }
});
