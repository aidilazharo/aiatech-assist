'use strict';
// A retry is a request to the existing host TDD resume path, never a bypass.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVDeveloperRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function sameScope(job,current){
  return !!job&&!!current&&current.eligible===true&&job.project===current.project&&job.br===current.br&&String(job.revision)===String(current.revision);
 }
 function evidence(info,job,current){
  if(!sameScope(job,current)||!info||info.available!==true||info.requiresNewRevision||!info.criterion)return null;
  const error=String(info.lastError||job.error||'');
  // Unknown or unsafe failures are not a reason to rebase or replace tests.
  if(/permission|forbidden|unauthori[sz]ed|credential|(?:access|api|personal) token|HTTP\s*(?:401|403|404)\b|ownership|not assigned|checkpoint.*(?:changed|mismatch|missing|unsafe)|locked test.*(?:changed|checksum|mismatch|tamper)|review.required|requires.new.revision|invalid.test.harness|harness.*(?:defect|review|invalid)|conflict|quota|billing|cancel|abort|stopped|dirty.worktree|uncommitted/i.test(error))return null;
  if(job.stage!=='needs-attention'&&!/timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|HTTP\s*(?:429|502|503|504)\b|rate limit/i.test(error))return null;
  const match=/^AC-(\d+)$/i.exec(String(info.criterion));
  if(!match)return null;
  const index=Number(match[1]);
  if(!Number.isSafeInteger(index)||index<1)return null;
  // Ordinal improvement reflects advancing the verified checkpoint, not logs
  // or elapsed time. Host revalidates the exact checkpoint on each resume.
  return {eligible:true,action:'resume-tdd',remaining:Math.max(0,1000000-index),fingerprint:String(info.criterion)};
 }
 return {sameScope,evidence};
});
