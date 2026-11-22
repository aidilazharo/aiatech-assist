'use strict';
const CATALOG_ID=/^[a-z][a-z0-9-]{0,48}$/;
function selection(stackId, companionId='') {
  if (!CATALOG_ID.test(stackId)) throw Error('Select a supported technology stack.');
  if (companionId && (!CATALOG_ID.test(companionId)||companionId===stackId)) throw Error('Choose a different supported companion stack.');
  // Frontend/backend pairing is checked against stackType from the remote catalog during Save Stack.
  return {stackId, companionId};
}
function evidence({stackId,companionId='',repo,results,at=new Date().toISOString()}={}) {
  selection(stackId,companionId);
  if (!repo?.clean || !repo.sha || !repo.root) throw Error('Commit the reviewed skeleton and use a clean Git working tree before testing.');
  if (!Array.isArray(results)||!results.length) throw Error('A runnable application test target is required.');
  if (results.some(row=>!row||row.passed!==true||!row.relative&&row.relative!==''||!['test','build','run'].includes(row.operation))) throw Error('All test, build, and run checks must pass.');
  const targets=new Map();
  for(const row of results){if(row.head!==repo.sha)throw Error('The repository revision changed while validating the stack.');const ops=targets.get(row.relative)||new Set();ops.add(row.operation);targets.set(row.relative,ops);}
  if([...targets.values()].some(ops=>!['test','build','run'].every(x=>ops.has(x)))) throw Error('Every application target must pass test, build, and run checks.');
  return {status:'tested',stackId,companionId,root:repo.root,sha:repo.sha,at,results:results.map(({relative,operation,passed,head,at})=>({relative,operation,passed,head,at}))};
}
function serverVerified(project) {
  const proof=project?.techStackServerVerification,prepared=project?.techStackPrepared;
  return !!(proof?.status==='verified' && prepared && proof.stackId===project.techStackId &&
    (proof.companionId||'')===(project.techStackCompanionId||'') &&
    proof.sha && proof.sha===prepared.sha && proof.root===prepared.root &&
    proof.branch===prepared.branch && proof.at);
}
function requireServerVerification(project) {
  if(!serverVerified(project))throw Error('Run Server successfully for the current saved stack revision before approving it for Developers.');
  return project.techStackServerVerification;
}
function approval(project,repo,actor,at=new Date().toISOString()) {
  const proof=project?.techStackValidation;
  const stackId=project?.techStackId;
  const companionId=project?.techStackCompanionId||'';
  selection(stackId,companionId);
  if (!proof || proof.status!=='tested' || proof.stackId!==stackId || proof.companionId!==companionId) throw Error('Test & Run Stack must pass before the Solution Architect can approve it.');
  if(!repo?.clean||repo.root!==proof.root||repo.sha!==proof.sha)throw Error('The tested repository changed. Re-run stack tests and smoke check before approval.');
  requireServerVerification(project);
  if (!actor || !String(actor).trim()) throw Error('The architect identity is required for approval.');
  evidence({stackId,companionId,repo,results:proof.results});
  return {status:'approved',stackId,companionId,root:repo.root,sha:repo.sha,approvedAt:at,approvedBy:String(actor).trim()};
}
function developerAllowed(project) {
  if(project?.techStackId==='custom')return require('./architect-custom-handoff').developerAllowed(project);
  const a=project?.techStackApproval;
  return !!(a?.status==='approved'&&a.stackId&&a.stackId===project?.techStackId&&(a.companionId||'')===(project?.techStackCompanionId||'')&&a.sha&&a.approvedBy);
}
function requireDeveloperApproval(project) {
  if(!developerAllowed(project))throw Error('Solution Architect must Test & Run Stack and approve the selected technology stack before developers can use it.');
  return project.techStackApproval;
}
module.exports={selection,evidence,serverVerified,requireServerVerification,approval,developerAllowed,requireDeveloperApproval};
