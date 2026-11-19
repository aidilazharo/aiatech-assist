'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
const milestones=require('../media/ba-progress');

function harness({decision=true,canClose=true,canNavigate=true,readonly=false,missing=[]}={}){
 const calls=[],panel={open:false,classList:{contains:()=>false},scrollIntoView:()=>calls.push('panel-scroll')};
 const group={open:false};
 const answer={readOnly:readonly,closest:()=>group,
  scrollIntoView:()=>calls.push('answer-scroll'),focus:()=>calls.push('answer-focus')};
 const el=id=>id==='discoveryQuestionsPanel'||id==='discoveryReviewPanel'?panel:id==='ba-questions'?answer:null;
 const globals={
  closeBREditor:()=>{calls.push('close-editor');return canClose;},
  baReopenQuestions:false,baReopenDocuments:true,
  openBAWorkflowStep:key=>{calls.push('step:'+key);return canNavigate;},
  status:msg=>calls.push('status:'+msg),
  currentDiscoveryReadiness:()=>({needsDecision:decision,missing}),
  $:el,requestAnimationFrame:callback=>callback()
 };
 const begin=source.indexOf('function openApprovalPrerequisiteStep(');
 const end=source.indexOf("$('brApprovalEditDiscovery').addEventListener('click',openDiscoveryQuestionsFromApproval);",begin);
 assert.ok(begin>0&&end>begin,'navigation helper is in BA editor code');
 const handlers=new vm.Script(source.slice(begin,end)+'\n({openDiscoveryQuestionsFromApproval,openAIReviewFromApproval})')
  .runInNewContext(globals);
 return {...handlers,calls,panel,group,answer,globals};
}

test('Resolve Discovery Questions selects the visible mapping milestone and focuses Question 12',()=>{
 const h=harness();
 assert.equal(h.openDiscoveryQuestionsFromApproval(),true);
 assert.deepEqual(h.calls,['close-editor','step:mapping','answer-scroll','answer-focus']);
 assert.equal(h.panel.open,true);
 assert.equal(h.group.open,true);
 assert.equal(h.globals.baReopenQuestions,true);
 assert.equal(h.globals.baReopenDocuments,false);
 assert.match(source,/if\(action==='brApprovalEditDiscovery'\)\{openDiscoveryQuestionsFromApproval\(\);return;\}/);
});
test('unsaved BR edits block navigation without discarding the draft',()=>{
 const h=harness({canClose:false});
 assert.equal(h.openDiscoveryQuestionsFromApproval(),false);
 assert.deepEqual(h.calls,['close-editor']);
 assert.equal(h.panel.open,false);
});
test('a failed milestone change shows actionable feedback rather than scrolling a hidden panel',()=>{
 const h=harness({canNavigate:false});
 assert.equal(h.openDiscoveryQuestionsFromApproval(),false);
 assert.deepEqual(h.calls.slice(0,2),['close-editor','step:mapping']);
 assert.ok(h.calls.some(call=>call.startsWith('status:Cannot open the')));
 assert.equal(h.panel.open,false);
});
test('Question 12 read-only state reports BA permission requirements',()=>{
 const h=harness({readonly:true});
 h.openDiscoveryQuestionsFromApproval();
 assert.ok(h.calls.some(call=>call.includes('Discovery answers are read-only')));
});
test('AI Review prerequisite opens its own milestone instead of a hidden panel',()=>{
 const h=harness();
 assert.equal(h.openAIReviewFromApproval(),true);
 assert.deepEqual(h.calls,['close-editor','step:review','panel-scroll']);
 assert.equal(h.panel.open,true);
});
test('completed mapping stays selectable for amendments after draft generation',()=>{
 const stages=milestones.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true,
  reviewFinalized:true,generated:true,totalBrs:2,savedBrs:2,allApproved:false,approvalBlocked:true});
 const mapping=stages.find(item=>item.key==='mapping');
 assert.equal(mapping.complete,true);
 assert.equal(mapping.selectable,true);
 assert.match(source,/if\(!openBAWorkflowStep\(step\)\)/);
});
