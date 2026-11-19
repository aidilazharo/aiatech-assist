"use strict";
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ATGVJiraWorkflowTables=api;})(typeof window!=="undefined"?window:globalThis,function(){
 function getNextStep(progress,displayed,busy){
  if(busy)return null;
  const index=progress.findIndex(step=>step.key===displayed);
  if(index<0||!progress[index].complete||index>=progress.length-1)return null;
  const next=progress[index+1];return next?.selectable?{key:next.key,label:next.label,index:index+1}:null;
 }
 // Visual readiness follows the actual next action, not only the completed
 // milestone. The confirm-review action can stand alone without a next step.
 function nextActionReady({next=null,complete=false,canConfirm=false,previewReady=true,approvalReady=true}={}){
  return !!canConfirm||!!(next&&complete&&previewReady&&approvalReady);
 }
 function publishedRows({plan=[],confirmed={},synced={},activeIds=[],completed=false}={}){
  const rootIds=new Set(activeIds);
  const source=plan.length?plan.map(item=>({path:item.path,action:item.action||'create',kind:item.kind,title:item.title,key:item.key||'',fromPlan:true})):
   Object.entries(synced).filter(([path,item])=>item?.key&&rootIds.has(path.split('/')[0])).map(([path,item])=>({path,action:'published',kind:item.issueType||item.kind,title:item.title,key:item.key,fromPlan:false}));
  return source.map(item=>{
   const persisted=synced[item.path];const verified=confirmed[item.path];
   const confirmedKey=verified?.key||((completed||!item.fromPlan)?persisted?.key:'');
   const confirmedStatus=verified?verified.action==='retire'?'Retired':'Confirmed':completed?(item.action==='retire'||!persisted?.key?'Needs reconciliation':'Confirmed'):item.fromPlan?'Awaiting confirmation':'Published';
   return {path:item.path||'',action:String(item.action||'').toUpperCase(),type:item.kind||'Issue',title:item.title||persisted?.title||'',key:confirmedKey||item.key||'—',status:confirmedStatus};
  });
 }
 return {getNextStep,nextActionReady,publishedRows};
});
