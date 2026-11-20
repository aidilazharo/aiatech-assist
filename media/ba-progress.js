'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVBAProgress=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const guidance=Object.freeze({
  start:'AI understands the requested outcome; user approves the starting scope.',
  upload:'AI verifies and generalizes the uploaded source; original bytes remain unchanged.',
  mapping:'AI maps the source to all 12 discovery answers for review.',
  review:'AI improves the proposal until you approve it or request regeneration.',
  generate:'AI generates complete, testable BR drafts for your review.',
  save:'Review or regenerate drafts while preserving earlier versions.',
  approve:'Approve the exact verified draft; unknown decisions remain provisional.',
  jiraPreview:'AI maps the approved BR to Jira and checks AC and DoD against approved templates.',
  jiraApprove:'Approve the verified Jira preview; no remote changes before approval.',
  publish:'Only approved, reconciled Jira changes may be published.'
 });
 const guidanceFor=key=>guidance[key]||'';
 const definitions=[
  ['start','discoveryStepStart','Start'],
  ['upload','discoveryStepUpload','Upload'],
  ['mapping','discoveryStepMap','Map & Save 12'],
  ['review','discoveryStepReview','AI Review'],
  ['generate','discoveryStepGenerate','Generate Requirements'],
  ['save','discoveryStepSaveBr','Preview & Save'],
  ['approve','discoveryStepApprove','Approve Requirements'],
  ['jiraPreview','discoveryStepJiraPreview','Jira Preview'],
  ['jiraApprove','discoveryStepJiraApprove','Approve Preview'],
  ['publish','discoveryStepPublish','Publish Jira']
 ];
 function savedAnswersReady(data,register,dirty,proposalPending){
  return !!data?.updatedAt&&!!data?.revision&&register?.discoveryRevision===data.revision&&!dirty&&!proposalPending;
 }
 function derive(input){
  const x=input||{};
  const published=!!x.published;
  const total=Math.max(0,Number(x.totalBrs)||0);
  const saved=total>0&&Number(x.savedBrs)>=total;
  const sources=!!x.hasSources, mapped=sources&&!!x.mappingDone&&!!x.savedDiscovery, reviewed=mapped&&!!x.reviewFinalized, generated=reviewed&&!!x.generated, persisted=generated&&saved, approved=persisted&&!!x.allApproved;
  const started=!!x.started||sources;
  const completed=[started,sources,mapped,reviewed,generated,persisted,approved,approved&&(!!x.jiraPreview||published),approved&&(!!x.jiraApproved||published),approved&&published];
  const activeIndex=completed.findIndex(done=>!done);
  const currentIndex=activeIndex<0?9:activeIndex;
  return definitions.map(([key,id,label],i)=>{
   let state=completed[i]?'success':i===currentIndex?'warning':'pending';
   // An approved AI Review should not remain in a warning state merely
   // because an explicitly recorded provisional business assumption exists.
   if(i===3&&completed[i]&&x.reviewWarnings&&!x.reviewFinalized)state='warning';
   if(i===6&&!completed[i]&&!!x.generated&&x.approvalBlocked)state='warning';
   if(key===x.failedStep)state='failure';
   return {key,id,label,index:i,state,complete:completed[i],current:i===currentIndex,selectable:completed[i]||i===currentIndex||state==='failure',guidance:guidanceFor(key)};
  });
 }
 return {definitions,derive,savedAnswersReady,guidanceFor};
});
