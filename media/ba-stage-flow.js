'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVBAStageFlow=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 function select(input){
  const hasSources=!!input.hasSources;
  const mapped=hasSources&&!!input.mappingDone;
  const proposal=mapped&&!!input.mappingProposal;
  const saved=mapped&&!!input.savedDiscovery;
  const reviewed=saved&&!!input.reviewCurrent;
  const finalized=reviewed&&!!input.reviewFinalized;
  const generated=finalized&&!!input.generated;
  const approved=generated&&!!input.allApproved;
  const published=approved&&!!input.publishedCurrent;
  const stage=!hasSources?'upload':!mapped?'upload':proposal?'mapping':!saved||!!input.reopenQuestions?'questions':!finalized?'review':!generated||!approved||!!input.reopenDocuments?'documents':!published?'jira':'complete';
  return {
   stage,
   showStart:!hasSources,
   showSources:hasSources&&!mapped&&!proposal,
   showMapping:proposal,
   showQuestions:mapped&&!proposal&&(!saved||!!input.reopenQuestions),
   showReview:saved&&!proposal&&!finalized&&!input.reopenQuestions,
   showDocuments:finalized&&(!approved||!!input.reopenDocuments)&&!input.reopenQuestions,
   showJira:approved&&!published&&!input.reopenDocuments&&!input.reopenQuestions,
   showJiraInbound:approved&&!input.reopenQuestions&&!input.reopenDocuments&&!!input.pendingJiraInbound,
   showChangeResolution:generated&&!!input.pendingChangeResolution,
   activeSteps:{upload:!hasSources,sourceSelection:hasSources&&!mapped,mapping:proposal,questions:mapped&&!proposal&&!saved,review:saved&&!finalized,documents:finalized&&!approved,jira:approved&&!published,complete:published}
  };
 }
 return {select};
});
