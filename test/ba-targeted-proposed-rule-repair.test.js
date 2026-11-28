'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ba=require('../src/ba-automatic-workflow');
const br={id:'BR-011',status:'approved',title:'Execution',objective:'Deliver project',scope:'Execution workflow',acceptanceCriteria:'PIC is optional and mandatory.',approvedContent:{acceptanceCriteria:'Original'},features:[{id:'F-001',title:'Feature',description:'Preserve',stories:[{id:'S-001',title:'Story',description:'Preserve',tasks:[{id:'T-001',title:'Task',description:'Preserve',roleId:'software-developer'}]}]}]};
const proposal={basis:'best-practice',rule:'PIC is required by default before Execution.',rationale:'Accountability while allowing configured exceptions.',edits:[{path:'acceptanceCriteria',value:'PIC is required by default before Execution; authorized exceptions follow the configured policy.'}]};
test('AI proposes a concrete default without recreating or deleting work',()=>{
 const result=ba.applyRepair(br,proposal);
 assert.deepEqual(result.updated.features,br.features);
 assert.deepEqual(result.updated.approvedContent,br.approvedContent);
 assert.equal(result.updated.acceptanceCriteria,proposal.edits[0].value);
 assert.equal(result.proposal.basis,'best-practice');
 assert.equal(br.acceptanceCriteria,'PIC is optional and mandatory.');
 assert.throws(()=>ba.applyRepair(br,{...proposal,edits:[{path:'features',value:'removed'}]}),/Unknown or repeated/);
 assert.throws(()=>ba.applyRepair(br,{...proposal,edits:[{path:'acceptanceCriteria',value:br.acceptanceCriteria}]}),/no actual change/);
 assert.throws(()=>ba.applyRepair({...br,baManualFields:{acceptanceCriteria:br.acceptanceCriteria}},proposal),/manual BA edit/);
});
test('quality review receives fingerprint-bound proposed rules',()=>{
 const {updated}=ba.applyRepair(br,proposal);
 updated.baAiResolution={...proposal,fingerprint:ba.repairFingerprint(updated)};
 assert.equal(ba.draftForReview(updated).proposedResolution.rule,proposal.rule);
 assert.match(ba.qualityPrompt([ba.draftForReview(updated)],[],''),/subject to BA approval/);
 assert.ok(ba.sourceNotes({brs:[updated]}).some(x=>x.includes('AI-proposed rule')));
 updated.acceptanceCriteria='Changed later';
 assert.equal(ba.resolutionFor(updated),null);
});
