(function(root){
 function display(record,me,options={}){
  if(options.loaded===false)return {text:'Checking ownership…',state:'loading',primary:null,secondary:null};
  const value=record||{};
  const mine=!!me&&value.ownerId===me;
  const owner=String(value.ownerName||value.ownerId||'the current owner');
  const pending=value.pending||null;
  const requester=String(pending?.toName||pending?.to||'Another user');
  let result;
  if(pending&&mine)result={text:requester+' requested ownership transfer',state:'incoming',primary:'approve-transfer',secondary:'reject-transfer'};
  else if(pending&&me&&pending.to===me)result={text:'You requested ownership transfer from '+owner,state:'outgoing',primary:'cancel-transfer',secondary:null};
  else if(pending)result={text:requester+' requested ownership transfer · awaiting '+owner,state:'pending',primary:null,secondary:null};
  else if(mine)result={text:'You own this document',state:'mine',primary:null,secondary:null};
  else if(value.ownerId)result={text:'Owned by '+owner,state:'other',primary:'request-transfer',secondary:null};
  else result={text:'Unassigned · available to claim',state:'unassigned',primary:'claim',secondary:null};
  if(options.cached)result={...result,text:result.text+' · Cached; changes require synchronization'};
  return result;
 }
 function actionLabel(action){return ({claim:'Assign to Me','request-transfer':'Request Transfer','approve-transfer':'Approve Transfer','reject-transfer':'Reject Transfer','cancel-transfer':'Cancel Request'})[action]||'';}
 const api={display,actionLabel};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVOwnershipPresentation=api;
})(typeof globalThis==='object'?globalThis:this);
