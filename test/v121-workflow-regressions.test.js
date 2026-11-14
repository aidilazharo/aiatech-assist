"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assessPlan,binding}=require('../src/jira-change-control');
const impact=require('../src/design-impact-plan');
const load=key=>fs.readFileSync(path.join(__dirname,'..',key),'utf8');
const started=async()=>({known:true,started:true,reason:'Issue has started'});

test('approved multi-issue change request survives individual pre-write verification',async()=>{
 const items=[{path:'BR-1',action:'update',key:'AIA-1',hash:'h1'},{path:'BR-2',action:'update',key:'AIA-2',hash:'h2'}];
 const state={synced:{'BR-1':{key:'AIA-1'},'BR-2':{key:'AIA-2'}},changeRequests:[{id:'CR-200',state:'approved',planHash:binding(items),actions:items.map(({path,action,hash})=>({path,action,hash}))}]};
 const whole=await assessPlan(state,items,started);
 assert.equal(whole.blocked.length,0);
 const single=await assessPlan(state,[items[0]],started,{approvedPlan:items});
 assert.equal(single.blocked.length,0);
 assert.equal(single.protection[0].crId,'CR-200');
 // Without full-plan binding the partial subset must *not* be allowed.
 const subset=await assessPlan(state,[items[0]],started);
 assert.equal(subset.blocked.length,1);
});

test('multi-issue approval fails closed for unauthorized action or unknown history',async()=>{
 const items=[{path:'BR-1',action:'update',key:'AIA-1',hash:'h1'},{path:'BR-2',action:'update',key:'AIA-2',hash:'h2'}];
 const state={synced:{'BR-1':{key:'AIA-1'},'BR-2':{key:'AIA-2'}},changeRequests:[{id:'CR-200',state:'approved',planHash:binding(items),actions:items.map(({path,action,hash})=>({path,action,hash}))}]};
 const altered=await assessPlan(state,[{...items[0],hash:'new-unauthorized-hash'}],started,{approvedPlan:items});
 assert.equal(altered.blocked.length,1);
 assert.match(altered.blocked[0].reason,/not in the approved/);
 const unknown=await assessPlan(state,[items[0]],async()=>({known:false,started:true,reason:'History unreadable'}),{approvedPlan:items});
 assert.equal(unknown.blocked.length,1);
});

test('selective design regeneration does not infer dependencies from unrelated approved BRs',()=>{
 const register={brs:[{id:'BR-UI',approvedRevision:1,status:'approved'},{id:'BR-BILLING',approvedRevision:3,status:'approved'}]};
 const designs={designs:{api:[{number:1,status:'approved',sourceBusinessRequirements:[{id:'BR-UI',revision:1}]}]}};
 const assessment=impact.plan(register,designs);
 assert.equal(assessment.candidates.length,0);
 assert.equal(assessment.skipped.find(x=>x.kind==='api').reason,'Source requirements unchanged');
 register.brs[0].approvedRevision=2;
 const changed=impact.plan(register,designs);
 assert.deepEqual(changed.candidates.map(x=>x.kind),['api']);
});

test('Business Requirements uses nine-step navigator, saved AI evidence, and one icon decorator',()=>{
 const host=load('test/generated/extension-source.txt'),ui=load('media/start.js'),css=load('media/start.css');
 assert.match(host,/<div class="ba-detailed-steps" id="baDetailedSteps">/);
 assert.doesNotMatch(host,/id="baPhaseNav"|id="baNextActionButton"/);
 for(const id of ['discoveryStepUpload','discoveryStepMap','discoveryStepReview','discoveryStepGenerate','discoveryStepSaveBr','discoveryStepApprove','discoveryStepJiraPreview','discoveryStepJiraApprove','discoveryStepPublish'])assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(host,/id="baReviewEvidence"/);
 assert.match(ui,/function renderSavedReviewEvidence\(review,current\)/);
 assert.match(ui,/baReviewCurrent\(\)/);
 assert.match(ui,/currentMilestone\?\.label/);
 assert.match(ui,/function decorateBAActionButtons\(\)\{[\s\S]*?atgvDecorateControls/);
 assert.equal((ui.match(/function decorateBAActionButtons/g)||[]).length,1);
 assert.match(css,/\.ba-review-evidence-grid/);
 assert.match(ui,/function atgvMoreActionsSummary\(label\)/);
 assert.match(ui,/advanced\.append\(atgvMoreActionsSummary\(br.id\),actions\)/);
});
