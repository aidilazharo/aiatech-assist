'use strict';
// Reconcile a *healthy ATGV-owned* application with the saved and tested stack.
// A visible local server is not sufficient to grant Developer approval: it must
// match the exact saved Git SHA, selected stack and successful test evidence.
const gate=require('./architect-stack-approval');
function evidenceIfHealthy(project,state,at=new Date().toISOString()){
 const prepared=project?.techStackPrepared,validated=project?.techStackValidation;
 if(!prepared||!validated||validated.status!=='tested'||!state?.running||state.healthy!==true)return null;
 if(!prepared.sha||state.sha!==prepared.sha||state.branch!==prepared.branch||!state.url||!/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(state.url))return null;
 if(prepared.stackId!==project.techStackId||validated.stackId!==project.techStackId)return null;
 if(validated.sha && validated.sha!==prepared.sha)return null;
 if((prepared.companionId||'')!==(project.techStackCompanionId||'')||(validated.companionId||'')!==(project.techStackCompanionId||''))return null;
 const proof={status:'verified',stackId:project.techStackId,companionId:project.techStackCompanionId||'',root:prepared.root,branch:prepared.branch,sha:prepared.sha,at};
 return gate.serverVerified({...project,techStackServerVerification:proof})?proof:null;
}
// A bootstrap launches the server before its final Git commit/push. Its
// verification therefore belongs AFTER the final saved revision is recorded.
// If the bootstrap-owned process exits during commit, restart only this selected
// stack through the ordinary safety-checked runner (never kill a port owner).
async function reconcileAfterSave({project,verify,start,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=4}={}){
 if(!project?.techStackPrepared||typeof verify!=='function')throw Error('A saved stack and a verification provider are required.');
 let state=null,restarted=false,lastError=null;
 for(let attempt=0;attempt<Math.max(1,Math.min(6,attempts));attempt++){
  try{
   state=await verify();
   const proof=evidenceIfHealthy(project,state);
   if(proof)return {proof,state,restarted};
   if(attempt===0&&state?.running===false&&!state?.otherRunning&&typeof start==='function'){
    // Start itself checks Git revision, checkout cleanliness and port ownership.
    // It may only launch the selected stack; it must not hand off another app.
    restarted=true;
    await start();
   }
  }catch(error){lastError=error;}
  if(attempt+1<attempts)await sleep(Math.min(1500,350*(attempt+1)));
 }
 return {proof:null,state:state||{running:false,healthy:false,message:lastError?.message||'Server unavailable'},restarted,error:lastError?.message||''};
}
// A stopped app must not erase historical verification of this exact tested
// SHA. This is a readiness record, NOT permission to approve an offline server.
function retainVerifiedEvidence(project,state){
 const checked=project?.techStackValidation,prepared=project?.techStackPrepared;
 if(checked?.status!=='tested'||checked.stackId!==project.techStackId||!prepared||
   (checked.sha&&checked.sha!==prepared.sha))return null;
 return evidenceIfHealthy(project,state)||(gate.serverVerified(project)?project.techStackServerVerification:null);
}
// Test & Run already has explicit permission to execute the selected project.
// Start automatically only when the saved SHA was actually tested and the
// managed app port is free. Never stop/hijack another running service.
async function startAfterSuccessfulTest({project,verify,start}={}){
 const prepared=project?.techStackPrepared,validated=project?.techStackValidation;
 if(!prepared||prepared.remotePushed!==true||!validated||validated.status!=='tested'||validated.sha!==prepared.sha||validated.stackId!==project.techStackId)
  return {proof:null,state:{running:false,message:'Saved GitHub branch does not match this tested commit. Save Stack before starting the app.'},started:false};
 if(typeof verify!=='function'||typeof start!=='function')throw Error('Automatic server startup requires a trusted status check and starter.');
 let state=await verify();let proof=evidenceIfHealthy(project,state),started=false;
 if(proof)return {proof,state,started};
 if(state.running||state.otherRunning)
  return {proof:null,state:{...state,message:'Another process or an unverified app owns the server. No process was stopped; inspect the server status.'},started};
 await start();started=true;
 state=await verify();proof=evidenceIfHealthy(project,state);
 return {proof,state,started};
}
module.exports={evidenceIfHealthy,reconcileAfterSave,retainVerifiedEvidence,startAfterSuccessfulTest};
