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
module.exports={evidenceIfHealthy,reconcileAfterSave};
