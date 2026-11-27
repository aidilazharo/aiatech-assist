'use strict';
// Shared bounded recovery policy. Adapters supply current evidence and trusted
// operations; this controller never grants permission, publishes, or approves.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVRecoveryController=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function create({maxStagnant=2,maxActions=12}={}){
  const scopes=new Map();
  const get=scope=>{
   if(!scopes.has(scope))scopes.set(scope,{paused:false,running:false,actions:0,stagnant:0,last:null,reason:''});
   return scopes.get(scope);
  };
  function pause(scope,reason='Paused by user.'){const s=get(scope);s.paused=true;s.reason=reason;return s;}
  function resume(scope){const s=get(scope);if(s.running)return false;scopes.delete(scope);get(scope);return true;}
  function begin(scope,evidence){
   const s=get(scope);
   if(s.paused||s.running||!evidence?.eligible||!evidence.action)return false;
   const current={action:evidence.action,fingerprint:String(evidence.fingerprint||''),remaining:Number(evidence.remaining)};
   if(!current.fingerprint||!Number.isFinite(current.remaining)||current.remaining<0)return false;
   if(s.last){
    if(current.remaining<s.last.remaining)s.stagnant=0;
    else if(current.action===s.last.action)s.stagnant++;
    else s.stagnant=0;
   }
   if(s.stagnant>=maxStagnant||s.actions>=maxActions){
    pause(scope,'AI recovery paused: no sufficient verified improvement. Review remaining findings and resume.');return false;
   }
   s.running=true;s.actions++;s.last=current;return true;
  }
  function finish(scope,{failed=false,cancelled=false,reason}={}){
   const s=get(scope);s.running=false;
   if(failed||cancelled)pause(scope,reason||(cancelled?'Recovery stopped.':'Recovery failed; review the diagnostic log.'));
   return s;
  }
  function complete(scope){const s=get(scope);if(!s.running)scopes.delete(scope);}
  return {get,begin,finish,pause,resume,complete};
 }
 return {create};
});
