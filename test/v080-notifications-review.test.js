'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const host=read('test/generated/extension-source.txt'),ui=read('media/start.js'),css=read('media/start.css');
const {parseReviewResponse}=require('../src/discovery-review');

test('notification fills viewport width, left aligns message, pushes action buttons right',()=>{
 assert.match(css,/\.top-notification\{width:100%;max-width:none;justify-content:flex-start;align-self:stretch;margin:0\}/);
 assert.match(css,/\.top-notification-text\{flex:1 1 auto;max-width:none;text-align:left;min-width:0\}/);
 assert.match(css,/\.top-notification-actions\{margin-left:auto;justify-content:flex-end\}/);
});
test('review renders explicit no replacement message and exposes Generate BR with valid review revision',()=>{
 const review=parseReviewResponse(JSON.stringify({readiness:'Needs attention',summary:'Manual review needed',suggestions:[{key:'problem',severity:'High',issue:'Ambiguous scope',suggestedAnswer:''}]}));
 assert.equal(review.suggestions[0].suggestedAnswer,'');
 assert.ok(ui.includes('Clarification required — no evidence-supported replacement is available.'));
 assert.ok(ui.includes('No evidence-supported replacements are available.'));
 assert.ok(ui.includes('complete the unanswered questions and save, then re-run AI Review'));
 assert.ok(ui.includes('const reviewGood=reviewCurrent&&baMappingComplete()&&baReviewFinalized();'));
 assert.ok(ui.includes('const reviewReady=!!(brState?.reviewRevision&&brState.reviewRevision===brState.discoveryRevision&&!discoveryDirty);'));
 assert.ok(host.includes('baGeneralization.generationGuard(register,review)'),'generation must honor the saved human approval and never show a second generic warning');
 assert.ok(host.includes('acknowledgeRisks:unresolved'),'explicit BA review approval persists source-bound provisional assumptions');
});
test('review Apply has stop and retry controls, guarded cancellation and completion messages',()=>{
 assert.ok(host.includes('id="baReviewApplyStop"'));
 assert.ok(host.includes('id="baReviewRetry"'));
 assert.ok(ui.includes("send('stopApplyDiscoveryReview')"));
 assert.ok(ui.includes("send('applyDiscoveryReview',reviewApplyRetry)"));
 assert.ok(host.includes("case 'stopApplyDiscoveryReview':"));
 assert.ok(host.includes("if(active.phase==='preparing'){active.controller.abort()"));
 assert.ok(host.includes("run.phase='saving'"));
 assert.ok(host.includes("type:'baReviewApplyStopped'"));
 assert.ok(host.includes("type:'baReviewApplyCompleted'"));
});
test('skip is available after an existing unapplied review, and advances toward BR creation',()=>{
 assert.ok(!ui.includes("baReviewSkip:baBusyTask==='review'?false:!!baBusyTask||!mine||!imported||!saved||!current.canReview||discoveryDirty||reviewCurrent"));
 assert.ok(host.includes("if(prior?.applied)throw Error('Applied suggestions have already been saved."));
 assert.ok(ui.includes("if(task==='skipReview'&&view==='discovery')requestAnimationFrame"));
});

test('an unapplied AI review can be skipped without losing the saved BR workflow',async()=>{
 const promises=require('node:fs/promises'),os=require('node:os');
 const {ProjectRegistry}=require('../src/projects');
 const workflow=require('../src/br-workflow');
 const root=await promises.mkdtemp(path.join(os.tmpdir(),'atgv080-review-'));
 try{
  const registry=new ProjectRegistry(root);await registry.create({id:'test',name:'Test'});
  let state=await workflow.load(registry,'test');
  state=await workflow.imported(registry,'test',state.revision,{name:'requirements.pdf',digest:'a'.repeat(64)});
  state=await workflow.discoverySaved(registry,'test',state.revision,'D1');
  state=await workflow.reviewed(registry,'test',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Needs attention',summary:'No replacement suggested',suggestions:[{key:'scope',severity:'High',issue:'Needs clarification',suggestedAnswer:''}]})});
  state=await workflow.skipReview(registry,'test',state.revision,{discoveryRevision:'D1',actor:'BA'});
  const result=JSON.parse(state.reviewText);
  assert.equal(result.skipped,true);
  assert.equal(state.reviewRevision,'D1');
  state=await workflow.generated(registry,'test',state.revision,{discoveryRevision:'D1',requirements:[{title:'Claims',objective:'Validate claim',scope:'All users',acceptanceCriteria:'Claim rules verified',features:[]}]});
  assert.equal(state.brs.length,1);
 }finally{await promises.rm(root,{recursive:true,force:true});}
});
