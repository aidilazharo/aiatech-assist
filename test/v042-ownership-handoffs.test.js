'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {OwnershipRegistry,transitionOwnership}=require('../src/ownership');
const {JiraConfluenceCoordination}=require('../src/atlassian-coordination');
const {createServer,hash}=require('../service/server');
const ui=fss.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const extension=fss.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const html=extension.slice(extension.indexOf('function html(webview,{resumeLibrary=false}={}){'),extension.indexOf('async function dashboardState()'));
const temp=async()=>fs.mkdtemp(path.join(os.tmpdir(),'atgv-ownership-v042-'));
test('pending transfer can only be cancelled by the requester and retains current owner',()=>{
 let r=transitionOwnership(null,{actor:'alice',action:'claim',expectedRevision:0});
 r=transitionOwnership(r,{actor:'bob',action:'request-transfer',expectedRevision:1});
 assert.throws(()=>transitionOwnership(r,{actor:'eve',action:'cancel-transfer',expectedRevision:2}),/Only the requesting/);
 assert.throws(()=>transitionOwnership(r,{actor:'bob',action:'cancel-transfer',expectedRevision:1}),/revision conflict/);
 assert.throws(()=>transitionOwnership(r,{actor:'alice',action:'cancel-transfer',expectedRevision:2}),/Only the requesting/);
 const cancelled=transitionOwnership(r,{actor:'bob',action:'cancel-transfer',expectedRevision:2});
 assert.equal(cancelled.ownerId,'alice');assert.equal(cancelled.pending,null);assert.equal(cancelled.revision,3);
 const fresh=transitionOwnership(cancelled,{actor:'carol',action:'request-transfer',expectedRevision:3});
 assert.equal(transitionOwnership(fresh,{actor:'alice',action:'approve-transfer',expectedRevision:4}).ownerId,'carol');
});
test('local ownership locks serialize distinct registry instances and reject conflicting claims',async()=>{
 const root=await temp();try{
  const file=path.join(root,'ownership.json');
  const first=new OwnershipRegistry(file),second=new OwnershipRegistry(file);
  const result=await Promise.allSettled([
   first.act({project:'proj',document:'handoff-solution-architect-BR-001',actor:'alice',action:'claim',expectedRevision:0}),
   second.act({project:'proj',document:'handoff-solution-architect-BR-001',actor:'bob',action:'claim',expectedRevision:0})
  ]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(result.filter(x=>x.status==='rejected').length,1);
  const owner=(await first.list('proj'))[0];assert.equal(owner.revision,1);
  assert.ok(['alice','bob'].includes(owner.ownerId));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('multiple local registry instances reject stale transfer revision after concurrent requests',async()=>{
 const root=await temp();try{
  const file=path.join(root,'owners.json'),a=new OwnershipRegistry(file),b=new OwnershipRegistry(file);
  await a.act({project:'proj',document:'handoff-project-manager-project',actor:'alice',action:'claim',expectedRevision:0});
  const result=await Promise.allSettled([
   a.act({project:'proj',document:'handoff-project-manager-project',actor:'bob',action:'request-transfer',expectedRevision:1}),
   b.act({project:'proj',document:'handoff-project-manager-project',actor:'carol',action:'request-transfer',expectedRevision:1})
  ]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(result.filter(x=>x.status==='rejected').length,1);
  assert.equal((await b.list('proj'))[0].revision,2);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Coordination Service honors transfer requester cancellation with authenticated identity',async()=>{
 const root=await temp(),alice='alice-test-token-long-123456',bob='bob-test-token-long-123456';
 const server=createServer({root,users:{[hash(alice)]:{id:'alice'},[hash(bob)]:{id:'bob'}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/v1/projects/proj/ownership/doc`;
  const send=async(token,action,expectedRevision)=>{
   const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,expectedRevision})});return {status:response.status,body:await response.json()};
  };
  assert.equal((await send(alice,'claim',0)).status,200);
  assert.equal((await send(bob,'request-transfer',1)).status,200);
  assert.equal((await send(alice,'cancel-transfer',2)).status,400);
  const cancelled=await send(bob,'cancel-transfer',2);
  assert.equal(cancelled.status,200);assert.equal(cancelled.body.document.ownerId,'alice');assert.equal(cancelled.body.document.pending,null);
  assert.equal((await send(bob,'claim',3)).status,409);
 }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}
});
test('Approvals & Handoffs includes automatic refresh and safe action-state controls',()=>{
 assert.match(html,/id="opsCancel"/);
 assert.match(ui,/if\(destination==='operations'\).*send\('refreshOwners'\)/);
 assert.match(ui,/opsOwnerLoaded&&!opsOwnerBusy/);
 for(const action of ['opsClaim','opsTransfer','opsApprove','opsReject','opsCancel'])assert.match(ui,new RegExp("'"+action+"'"));
 assert.match(ui,/button\.disabled=!enabled\|\|!visible/);
 assert.match(ui,/m\.type==='ownerList'.*opsOwnerMe=m\.me/);
 assert.doesNotMatch(ui,/values\.set\('ba-discovery'/);
 assert.match(ui,/values\.set\(id,\{label:'Handoff — '/);
});
test('Handoff ownership transfer stays manageable for completed and blocked items',()=>{
 assert.doesNotMatch(extension,/if\(!item\|\|item\.status==='blocked'\)throw Error\('This role handoff is not ready/);
 assert.match(extension,/if\(!item\)throw Error\('This role handoff no longer exists/);
 assert.match(ui,/const actions=\[presentation\.primary,presentation\.secondary\]\.filter\(Boolean\)/);
 assert.match(ui,/ATGVOwnershipPresentation\.actionLabel\(operation\)/);
 assert.match(ui,/handoffOwnerBusy=null;handoffOwnership=m/);
});
test('BA Work enables first local claim and lets a requester cancel transfer',()=>{
 assert.match(ui,/baOwnerState\?\.scope!=='local'/);
 assert.match(ui,/record\.pending\?\.to===baOwnerState\.me\?'cancel-transfer'/);
 assert.match(ui,/const ownershipDisplay=ATGVOwnershipPresentation\.display/);
 assert.match(extension,/async function postAllOwnership\(/);
 assert.match(extension,/case 'baOwnerAction'/);
});
