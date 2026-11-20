'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const wf=require('../src/br-workflow');
const ui=fs.readFileSync(path.join(__dirname,'..','media/start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'..','test/generated/extension-source.txt'),'utf8');
const digest='a'.repeat(64);
async function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atgv137-'));try{const registry=new ProjectRegistry(dir);await registry.create({id:'audit',name:'Audit'});let x=await wf.load(registry,'audit');x=await wf.imported(registry,'audit',x.revision,{name:'gate.pdf',digest,documents:[{name:'gate.pdf',digest}]});x=await wf.selectSources(registry,'audit',x.revision,[digest]);x=await wf.completeSourceMapping(registry,'audit',x.revision,{digests:[digest],proposals:[{filename:'gate.pdf',answers:{}}]});x=await wf.discoverySaved(registry,'audit',x.revision,'disc-one',{answers:{questions:'NONE'}});return await run(registry,x);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('repeated AI review requires explicit human acknowledgment and records versioned evidence',async()=>fixture(async(registry,x)=>{
 const warning={readiness:'Needs attention',summary:'Rules need clarification',suggestions:[{key:'scope',severity:'High',issue:'Approval path unclear',suggestedAnswer:''},{key:'rules',severity:'Critical',issue:'Finance gate missing',suggestedAnswer:''}]};
 x=await wf.reviewed(registry,'audit',x.revision,{discoveryRevision:'disc-one',text:JSON.stringify(warning)});
 await assert.rejects(()=>wf.confirmReview(registry,'audit',x.revision,{discoveryRevision:'disc-one',actor:'BA'}),/Explicitly acknowledge/);
 x=await wf.confirmReview(registry,'audit',x.revision,{discoveryRevision:'disc-one',actor:'BA',acknowledgeRisks:true});
 assert.equal(x.reviewRiskAccepted.revision,'disc-one');assert.equal(x.reviewRiskAccepted.findings.length,2);
 assert.equal(JSON.parse(x.reviewText).suggestions.length,2);
 x=await wf.reviewed(registry,'audit',x.revision,{discoveryRevision:'disc-one',text:JSON.stringify({...warning,summary:'Re-review documented'})});
 assert.equal(x.reviewRiskAccepted,null,'rerunning must invalidate acknowledgment');
 assert.equal(x.reviewHistory.length,1,'old review retained');
 await assert.rejects(()=>wf.confirmReview(registry,'audit',x.revision,{discoveryRevision:'disc-one',actor:'BA'}),/Explicitly acknowledge/);
}));
test('review with no unresolved risk does not accept an unnecessary risk acknowledgment',async()=>fixture(async(registry,x)=>{
 x=await wf.reviewed(registry,'audit',x.revision,{discoveryRevision:'disc-one',text:JSON.stringify({readiness:'Ready',summary:'Clear',suggestions:[]})});
 await assert.rejects(()=>wf.confirmReview(registry,'audit',x.revision,{discoveryRevision:'disc-one',actor:'BA',acknowledgeRisks:true}),/No unresolved/);
 x=await wf.confirmReview(registry,'audit',x.revision,{discoveryRevision:'disc-one',actor:'BA'});
 assert.equal(JSON.parse(x.reviewText).confirmed,true);assert.equal(x.reviewRiskAccepted,null);
}));
test('Quill approval explains all blockers and does not bypass independent Business Owner decision',()=>{
 assert.match(ui,/Question 12 records unresolved decisions/);
 assert.match(ui,/Independent Business Owner approval is pending/);
 assert.match(ui,/Approval blocked: /);
 assert.match(ui,/reviewRiskAccepted/);
 assert.match(host,/Approve AI Review & Continue|acknowledgeRisks:unresolved/);
 assert.match(ui,/finish\.classList\.toggle\('hidden',!reviewCurrent\|\|baReviewFinalized\(\)&&!unresolvedFindings\)/);
});
test('ownership action is inline beside ownership pill and not relegated to overflow',()=>{
 assert.match(ui,/meta\.append\(brElement\('span','br-state ownership-state-text/);
 assert.match(ui,/assign\.classList\.add\('br-owner-inline-action'\);\s*meta\.append\(assign\)/);
 assert.doesNotMatch(ui,/assign\.addEventListener\('click',\(\)=>baAction\('ba-br-'\+br\.id,operation\)\);actions\.append\(assign\)/);
});
