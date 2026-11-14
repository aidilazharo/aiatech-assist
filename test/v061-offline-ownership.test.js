'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {OfflineAtlassianOwnership,isConnectivityFailure}=require('../src/offline-atlassian-ownership');
const {transitionOwnership}=require('../src/ownership');
const fixture=async fn=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv061-'));try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}};
const client=(folder,project='test',site='https://team.atlassian.net')=>new OfflineAtlassianOwnership({folder,project,site,spaceKey:'DOCS',email:'me@example.org'});
const record=(documentId='ba-discovery',revision=0,ownerId=null)=>({documentId,revision,ownerId,pending:null});
const snapshot=(me='account-1',documents=[record()])=>({scope:'jira-confluence',me,meName:'Verified Account',documents});
function shared(){
 let state=snapshot();let calls=0;
 return {fetch:async()=>JSON.parse(JSON.stringify(state)),apply:async({document,action,expectedRevision})=>{
  calls++;
  const current=state.documents.find(x=>x.documentId===document)||record(document);
  const changed=transitionOwnership(current,{actor:state.me,actorName:state.meName,action,expectedRevision});
  state={...state,documents:[...state.documents.filter(x=>x.documentId!==document),{documentId:document,...changed}]};
  return {document:changed};
 },set:value=>{state=value;},get calls(){return calls;},get value(){return state;}};
}
test('Verified Atlassian identity and ownership survive restart, are project scoped and contain no credentials',async()=>fixture(async folder=>{
 const first=client(folder);await assert.rejects(first.snapshot(),/Connect to Jira \+ Confluence/);
 await first.remember(snapshot());
 const other=client(folder);const result=await other.snapshot();
 assert.equal(result.me,'account-1');assert.equal(result.cached,true);assert.equal(result.documents[0].ownerId,null);
 assert.equal(await client(folder,'another-project').load(),null);
 assert.equal(await client(folder,'test','https://other.atlassian.net').load(),null);
 const bytes=await fs.readFile(first.file,'utf8');assert.doesNotMatch(bytes,/token|password|secret/i);
}));
test('Offline claim is pending and never grants ownership until Confluence verifies the change',async()=>fixture(async folder=>{
 const cache=client(folder);const remote=shared();await cache.remember(snapshot());
 const queued=await cache.queue({document:'ba-discovery',action:'claim',expectedRevision:0});
 assert.equal(queued.status,'pending');assert.equal((await cache.snapshot()).documents[0].ownerId,null);
 const result=await cache.reconcile({fetchSnapshot:remote.fetch,apply:remote.apply});
 assert.equal(result.synchronized,1);assert.equal(remote.calls,1);assert.equal((await cache.snapshot()).documents[0].ownerId,'account-1');
 assert.equal((await cache.snapshot()).pendingOperations.length,0);
}));
test('Offline queue rejects approvals and duplicate requests are idempotent',async()=>fixture(async folder=>{
 const a=client(folder),b=client(folder);await a.remember(snapshot());
 await assert.rejects(a.queue({document:'ba-discovery',action:'approve-transfer',expectedRevision:0}),/only queue Claim or Request Transfer/);
 const requests=await Promise.all(Array.from({length:10},()=>b.queue({document:'ba-discovery',action:'claim',expectedRevision:0})));
 assert.equal(new Set(requests.map(x=>x.id)).size,1);
 assert.equal((await a.snapshot()).pendingOperations.length,1);
}));
test('Remote ownership revision conflict never overwrites another account and remains visible',async()=>fixture(async folder=>{
 const c=client(folder),remote=shared();await c.remember(snapshot());await c.queue({document:'ba-discovery',action:'claim',expectedRevision:0});
 remote.set(snapshot('account-1',[record('ba-discovery',1,'account-2')]));
 const result=await c.reconcile({fetchSnapshot:remote.fetch,apply:remote.apply});
 assert.equal(result.conflicts,1);assert.equal(remote.calls,0);
 const state=await c.snapshot();assert.equal(state.documents[0].ownerId,'account-2');assert.equal(state.conflicts.length,1);
}));
test('Uncertain POST acknowledgement is reconciled without duplicate claim',async()=>fixture(async folder=>{
 const c=client(folder),remote=shared();await c.remember(snapshot());await c.queue({document:'ba-discovery',action:'claim',expectedRevision:0});
 await remote.apply({document:'ba-discovery',action:'claim',expectedRevision:0});
 const result=await c.reconcile({fetchSnapshot:remote.fetch,apply:remote.apply});
 assert.equal(result.synchronized,1);assert.equal(remote.calls,1);
}));
test('Changing Atlassian identity blocks offline replay',async()=>fixture(async folder=>{
 const c=client(folder);await c.remember(snapshot());await c.queue({document:'ba-discovery',action:'claim',expectedRevision:0});
 await assert.rejects(c.reconcile({fetchSnapshot:async()=>snapshot('account-2'),apply:async()=>{throw Error('Must not replay');}}),/account changed/i);
 assert.equal((await c.snapshot()).pendingOperations.length,1);
}));
test('Only connectivity failures permit using the cache; permission/config errors do not',()=>{
 for(const e of ['fetch failed','connect ETIMEDOUT','getaddrinfo ENOTFOUND','HTTP 503'])assert.equal(isConnectivityFailure(Error(e)),true,e);
 for(const e of ['HTTP 404 not found','HTTP 403 forbidden','HTTP 401 bad token','version conflict HTTP 409','Invalid space config'])assert.equal(isConnectivityFailure(Error(e)),false,e);
});
test('Source enables offline cached Jira and Confluence ownership without local identity prompt fallback',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(source,/OfflineAtlassianOwnership/);assert.match(source,/sharedOwnershipSnapshot/);assert.match(source,/ownershipRetryTimer=setInterval/);
 assert.match(source,/snapshot\.cached/);assert.match(ui,/opsOwnerCached/);assert.match(ui,/Pending offline sync/);
});
