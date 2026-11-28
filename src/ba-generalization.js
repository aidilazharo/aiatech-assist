'use strict';
// AI generalization applies to all ten BA milestones, but never implies that
// provisional business assumptions are approved or that Jira may be published.
const STEPS=Object.freeze([
 ['start','Understand the user goal using approved project context; identify essential source evidence.'],
 ['upload','Verify the original upload, extract facts, retain provenance and flag source contradictions.'],
 ['mapping','Generalize evidence-backed discovery answers for all twelve questions and preserve unknown decisions.'],
 ['review','Generate evidence-backed corrections and options, then ask the BA to approve or regenerate.'],
 ['generate','Generate complete BR drafts and testable AC; mark missing facts as provisional, not verified.'],
 ['save','Preserve editable drafts, prior revisions and user feedback when regenerating.'],
 ['approve','Compare source evidence and draft revisions; require verified BA/Business Owner approval.'],
 ['jiraPreview','Map approved BRs to Jira fields, source-backed AC and approved DoD templates.'],
 ['jiraApprove','Revalidate Jira identities and the exact plan; require human approval.'],
 ['publish','Publish only the approved plan; reconcile and resume without duplicate issues.']
]);
const GUIDANCE=new Map(STEPS);
function guidanceFor(step){const value=GUIDANCE.get(step);if(!value)throw Error('Unknown BA step: '+String(step));return value;}
function reviewState(register,review){
 const sourceFindings=(register?.mappingCompleted?.preflights||[]).some(item=>item?.status==='needs-review');
 const flagged=review?.readiness==='Needs attention'||(review?.suggestions||[]).some(item=>item.severity==='Critical')||sourceFindings;
 const acknowledged=!!register?.reviewRiskAccepted&&register.reviewRiskAccepted.revision===register.discoveryRevision&&register.reviewRiskAccepted.sourceFingerprint===String(register.importDigest||'');
 return {flagged:!!flagged,acknowledged,confirmed:!!(review?.confirmed||review?.skipped||review?.applied),
  ready:!flagged||acknowledged,needsApproval:!!flagged&&!acknowledged,
  proposedCorrections:(review?.suggestions||[]).filter(item=>!!item.suggestedAnswer).length};
}
function generationGuard(register,review){
 const state=reviewState(register,review);
 if(state.needsApproval)throw Error('AI has proposed improvements or identified open business decisions. Review the findings and choose Approve AI Review & Continue, or regenerate the proposal. No BR or Jira changes were made.');
 return state;
}
const PRINCIPLES=Object.freeze([
 'Generalize based on verified source, approved project knowledge and relevant standards; preserve provenance.',
 'Improve clarity, completeness, consistency, testability and traceability before showing the proposed result.',
 'Never fabricate source facts, budgets, thresholds, access rules, legal compliance or approvals.',
 'When evidence is missing, suggest a provisional option or explicit decision instead of silently inventing policy.',
 'During recovery, prefer the narrowest evidence-backed generalization. When source rules conflict, propose concrete conditional rules or configurable defaults using best practices; explicitly label the proposal and rationale for BA final approval. Retain mandatory controls, measurable outcomes and existing work item identities. Never remove a constraint just to pass validation.',
 'Regeneration preserves original source, history, existing IDs and published Jira records.',
 'Only an approved requirement and separately reviewed Jira plan may advance to final publication.'
]);
function promptFor(step){return ['ATGV AI GENERALIZATION ('+step+'):',guidanceFor(step),...PRINCIPLES].join('\n');}
module.exports={STEPS,guidanceFor,reviewState,generationGuard,promptFor,PRINCIPLES};
