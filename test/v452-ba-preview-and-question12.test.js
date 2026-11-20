'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {assess,QUESTIONS}=require('../src/ba-discovery');
const progress=require('../media/ba-progress');
const workflow=require('../media/jira-workflow-tables');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');

function generatedReadiness(brs,importDigest='source1',discoveryRevision='disc1'){
 const from=ui.indexOf(' const brs=brState?.restartPending?[]:activeBusinessRequirements(),pendingDraft=');
 const to=ui.indexOf(' const freshDraftPending=',from);
 assert.ok(from>0&&to>from,'Generation readiness extraction must remain testable');
 const snippet=ui.slice(from,to);
 const brState={restartPending:false,importDigest,discoveryRevision};
 const out=vm.runInNewContext(snippet+'\n({generatingDone,pendingDraft,staleCount:staleDrafts.length})',{brState,activeBusinessRequirements:()=>brs});
 return {...out};
}
function draft(source={digest:'source1',discoveryRevision:'disc1'}){
 return {id:'BR-001',status:'draft',needsRefresh:true,draftSavedAt:null,source};
}
test('fresh generated unsaved BRs remain eligible for Preview & Save despite needsRefresh',()=>{
 const current=generatedReadiness([draft(),{...draft(),id:'BR-002'}]);
 assert.equal(current.generatingDone,true);
 assert.equal(current.pendingDraft,true);
 assert.equal(current.staleCount,0);
 const steps=progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true,generated:true,totalBrs:2,savedBrs:0});
 assert.equal(workflow.getNextStep(steps,'generate',false)?.key,'save');
 assert.match(ui,/const canPreview=generatingDone&&displayedStage==='generate'&&pendingDraft/);
 assert.equal(ui.includes("const previewActionReady=displayed!=='generate'||!$('brNextPreviewSave').disabled"),true);
});
test('source or discovery changes still prevent stale draft preview',()=>{
 assert.equal(generatedReadiness([draft({digest:'old',discoveryRevision:'disc1'})]).generatingDone,false);
 assert.equal(generatedReadiness([draft({digest:'source1',discoveryRevision:'old'})]).generatingDone,false);
 assert.equal(generatedReadiness([({...draft(),staleReason:'Discovery answers changed'})]).generatingDone,false);
 assert.equal(generatedReadiness([{id:'BR-002',status:'approved',needsRefresh:true}]).generatingDone,false);
});
test('Question 12 does not force false None declarations to view draft or approval review',()=>{
 const answers=Object.fromEntries(QUESTIONS.map(([key])=>[key,key==='questions'?'Finance confirmation pending with an owner.':'Source-supported evidence']));
 const pending=assess(answers);
 assert.equal(pending.filled,12);
 assert.equal(pending.canReview,true);
 assert.equal(pending.needsDecision,true);
 assert.equal(pending.canApprove,false,'Final approval retains unresolved-decision safeguard');
 assert.match(ui,/const approvalActionReady=displayed!=='save'\|\|!!currentDefinition\?\.complete/);
 assert.match(ui,/You do not need to enter “None” to generate or preview drafts/);
 assert.equal(assess({...answers,questions:'None'}).needsDecision,false);
 assert.equal(assess({...answers,questions:'None except Finance confirmation'}).needsDecision,true);
});
