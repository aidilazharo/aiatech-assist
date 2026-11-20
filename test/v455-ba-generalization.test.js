'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../src/ba-generalization');
const review=require('../src/discovery-review');
const progress=require('../media/ba-progress');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('every one of the ten BA steps has nonempty AI generalization guidance',()=>{
 assert.equal(policy.STEPS.length,10);
 assert.deepEqual(policy.STEPS.map(x=>x[0]),progress.definitions.map(x=>x[0]));
 for(const [key,guidance] of policy.STEPS){
  assert.ok(guidance.length>35,key);
  assert.ok(progress.guidanceFor(key).length>30,key);
  assert.match(policy.promptFor(key),/source|evidence|approval|provisional/i,key);
 }
 assert.throws(()=>policy.guidanceFor('unsupported'),/Unknown BA step/);
});
test('unreviewed open decisions cannot become automatically approved facts',()=>{
 const reviewData={readiness:'Needs attention',suggestions:[{key:'questions',severity:'Critical',issue:'Approver not specified',suggestedAnswer:''}]};
 const register={discoveryRevision:'rev-1',importDigest:'a'.repeat(64),mappingCompleted:{preflights:[]}};
 assert.equal(policy.reviewState(register,reviewData).needsApproval,true);
 assert.throws(()=>policy.generationGuard(register,reviewData),/Approve AI Review/);
 register.reviewRiskAccepted={revision:'rev-1',sourceFingerprint:'a'.repeat(64),by:'Verified BA'};
 assert.equal(policy.generationGuard(register,reviewData).ready,true);
 assert.equal(policy.reviewState({...register,discoveryRevision:'rev-2'},reviewData).needsApproval,true);
 assert.equal(policy.reviewState({...register,importDigest:'b'.repeat(64)},reviewData).needsApproval,true);
});
test('AI generalization respects feedback and retains unverified business decisions',()=>{
 const payload={problem:'Create a registration workflow',questions:'Approval role is undecided'};
 const prompt=review.createReviewPrompt(payload,'Use simpler approval language');
 assert.match(prompt,/Use simpler approval language/);
 assert.match(prompt,/never mark unverified proposals as resolved/);
 assert.match(prompt,/Generalize/);
 assert.match(prompt,/registration workflow/);
});
test('BA UI exposes repeatable human approval and feedback regeneration',()=>{
 const html=source('src/lib/webview/dashboard-html.js'),ui=source('media/start.js'),host=source('src/lib/runtime/extension-runtime.js');
 for(const id of ['baGeneralizationGuidance','baReviewFeedback','baReviewRegenerate','brRegenerationFeedback','brRegenerateProposal'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(ui,/send\('copilotDiscovery',\{feedback:/);
 assert.match(ui,/send\('generateBusinessRequirements',\{regenerate:true,feedback:/);
 assert.match(host,/baGeneralization\.generationGuard\(register,review\)/);
 assert.match(host,/const unresolved=baGeneralization\.reviewState\(register,review\)\.flagged/);
 assert.doesNotMatch(host,/AI Review identified unresolved requirements\. Review the findings and verify the discovery answers before generating draft BRs/);
 assert.match(host,/case 'confirmDiscoveryReview'/);
 assert.match(host,/reviewRiskAccepted|acknowledgeRisks:unresolved/);
});
test('BR draft regeneration retains approval and Jira protection rather than auto publishing',()=>{
 const workflow=source('src/br-workflow.js'),host=source('src/lib/runtime/extension-runtime.js');
 assert.match(host,/currentDrafts\.map\(b=>b\.id\)/);
 assert.match(host,/regeneration requires editable|Regeneration requires editable/);
 assert.match(workflow,/existing\.previousDrafts=/);
 assert.match(workflow,/reviewGate\(next\)/);
 assert.match(workflow,/Approved BR identities|approvedContent|Never generate a duplicate/);
 assert.match(host,/currentSaved\.revision!==saved\.revision/);
});
