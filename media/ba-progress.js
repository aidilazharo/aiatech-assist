'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVBAProgress=api;
})(typeof window!=='undefined'?window:globalThis,function(){
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
   if(i===3&&completed[i]&&x.reviewWarnings)state='warning';
   if(i===6&&!completed[i]&&!!x.generated&&x.approvalBlocked)state='warning';
   if(key===x.failedStep)state='failure';
   return {key,id,label,index:i,state,complete:completed[i],current:i===currentIndex,selectable:completed[i]||i===currentIndex||state==='failure'};
  });
 }
 return {definitions,derive};
});
