'use strict';
// The host still verifies assignment, approved BR, design references and
// revision on each attempt. No retry of approval, publication or deletion.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVUxRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function classify(message){
  const text=String(message||'');
  if(/permission|forbidden|unauthori[sz]ed|credential|token|(?:HTTP\s*)?(?:401|403|404)\b|not assigned|ownership|changed|stale|reference|repository|framework|catalog|library|approval|approved BR|conflict|clarif|cancel|stop|budget|quota|billing/i.test(text))return 'blocked';
  if(/timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|temporar(?:y|ily)|HTTP\s*(?:429|502|503|504)\b|rate limit|invalid JSON|JSON parse|malformed JSON|Unexpected token.*JSON|User flow (?:must|needs|contains|connects|node)|Both design drafts must be generated|UI Mockup must include screens/i.test(text))return 'retry';
  return 'blocked';
 }
 function sameScope(job,current){
  return !!job&&!!current&&job.project===current.project&&job.key===current.key&&job.framework===current.framework&&current.eligible===true;
 }
 function reconcile(job,snapshot){
  if(!job||!snapshot||typeof snapshot!=='object'||snapshot.key!==job.key)return 'blocked';
  if(snapshot.exists&&['review','approved'].includes(snapshot.status))return 'complete';
  if(String(snapshot.revision||'')!==job.revision)return 'blocked';
  return 'retry';
 }
 return {classify,sameScope,reconcile};
});
