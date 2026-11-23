'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const sync=require('../src/connected-sync-store');
const {ProjectRegistry}=require('../src/projects');
const origin='https://example.atlassian.net';
async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-connected-sync-'));
 try{
  await fs.mkdir(path.join(root,'.atgv'));
  await fs.writeFile(path.join(root,'.atgv','atgv.workspace.json'),
   JSON.stringify({schema:1,managedBy:'aia-my.atgv-aiatech-assist'}));
  const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});
  await run({registry,projectId:'demo',root});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('Jira, Confluence and GitHub checkpoints share the existing private project SQLite database',()=>fixture(async({registry,projectId,root})=>{
 const pages=[
  {provider:'jira',origin,id:'10001',revision:'2026-11-24T00:00:00Z',value:{key:'TC-199',status:'In Progress'},metadata:{key:'TC-199',status:'In Progress'}},
  {provider:'confluence',origin,id:'123456',revision:'3',value:'<p>approved document</p>',metadata:{kind:'page'}},
  {provider:'github',origin:'https://api.github.com',id:'aiamalaysia/extension@main',
   revision:'a'.repeat(40),value:'a'.repeat(40),metadata:{key:'aiamalaysia/extension',branch:'main'}}
 ];
 for(const row of pages){
  const {provider,origin:site,id,revision,value,metadata}=row;
  assert.equal(sync.observeMany(registry,projectId,{provider,origin:site,resources:[{id,revision,value,metadata}]}).stored,1);
  sync.checkpoint(registry,projectId,{provider,origin:site,scope:provider,count:1,complete:true});
 }
 const status=sync.snapshot(registry,projectId);
 assert.equal(status.providers.length,3);
 assert.deepEqual(status.providers.map(row=>row.provider).sort(),['confluence','github','jira']);
 assert.ok(status.providers.every(row=>row.complete===1&&row.last_success_at));
 assert.equal(status.conflicts.length,0);
 const db=sync.open(registry,projectId);
 try{
  assert.equal(db.db.prepare('SELECT count(*) AS n FROM connected_sync_resources').get().n,3);
  assert.equal(db.db.prepare("SELECT metadata FROM connected_sync_resources WHERE provider='jira'").get().metadata,
   '{"key":"TC-199","status":"In Progress"}');
  assert.equal(db.db.prepare("SELECT remote_hash FROM connected_sync_resources WHERE provider='confluence'").get().remote_hash.length,64);
 }finally{db.db.close();}
 await fs.access(path.join(root,'.atgv','memory','project-demo.sqlite'));
}));
test('failed refresh retains the prior successful checkpoint and does not mark a failed scan complete',()=>fixture(async({registry,projectId})=>{
 sync.checkpoint(registry,projectId,{provider:'jira',origin,scope:'TC',count:45,complete:true});
 const first=sync.snapshot(registry,projectId).providers[0];
 sync.checkpoint(registry,projectId,{provider:'jira',origin,scope:'TC',error:'network timeout',complete:false,count:0});
 const second=sync.snapshot(registry,projectId).providers[0];
 assert.equal(second.last_success_at,first.last_success_at);
 assert.equal(second.count,45);
 assert.equal(second.complete,1);
 assert.equal(second.last_error,'network timeout');
}));
test('approved outbox is metadata-only and a remote revision change becomes an unresolved conflict',()=>fixture(async({registry,projectId})=>{
 const hash=sync.fingerprint('approved local draft');
 sync.observeMany(registry,projectId,{provider:'confluence',origin,resources:[{id:'4567',revision:'4',value:'remote v4'}]});
 const queued=sync.queueApproved(registry,projectId,{provider:'confluence',origin,id:'4567',baseRevision:'4',
  hash,approvalRef:'BR-013-revision-4'});
 assert.equal(queued.id.length,64);
 assert.equal(sync.snapshot(registry,projectId).outbox[0].state,'pending');
 const changed=sync.observeMany(registry,projectId,{provider:'confluence',origin,
  resources:[{id:'4567',revision:'5',value:'changed on another machine'}]});
 assert.equal(changed.conflicts,1);
 const status=sync.snapshot(registry,projectId);
 assert.equal(status.outbox[0].state,'conflict');
 assert.equal(status.conflicts[0].remote_revision,'5');
 assert.equal(status.conflicts[0].local_revision,'4');
 assert.ok(!JSON.stringify(status).includes('approved local draft'));
}));
test('stale Jira versions cannot roll back a newer remote observation',()=>fixture(async({registry,projectId})=>{
 sync.observeMany(registry,projectId,{provider:'jira',origin,resources:[
  {id:'10001',revision:'2026-11-24T11:00:00Z',value:'In Progress',metadata:{status:'In Progress'}}]});
 const stale=sync.observeMany(registry,projectId,{provider:'jira',origin,resources:[
  {id:'10001',revision:'2026-11-24T10:00:00Z',value:'To Do',metadata:{status:'To Do'}}]});
 assert.equal(stale.stored,0);
 const state=sync.open(registry,projectId);
 try{const row=state.db.prepare("SELECT remote_revision,metadata FROM connected_sync_resources WHERE provider='jira'").get();
  assert.match(row.remote_revision,/11:00:00/);assert.match(row.metadata,/In Progress/);
 }finally{state.db.close();}
}));
test('credentials, untrusted origins, oversized batches and invalid approvals are rejected before persistence',()=>fixture(async({registry,projectId})=>{
 assert.throws(()=>sync.observeMany(registry,projectId,{provider:'jira',origin:'http://example.atlassian.net',resources:[]}),/HTTPS/);
 assert.throws(()=>sync.observeMany(registry,projectId,{provider:'github',origin:'https://example.com',resources:[]}),/does not match/);
 assert.throws(()=>sync.observeMany(registry,projectId,{provider:'jira',origin:'https://user:secret@example.atlassian.net',resources:[]}),/clean HTTPS/);
 assert.throws(()=>sync.observeMany(registry,projectId,{provider:'jira',origin,resources:Array(1001).fill({id:'10001'})}),/batch/);
 assert.throws(()=>sync.queueApproved(registry,projectId,{provider:'jira',origin,id:'10001',baseRevision:'',
  hash:sync.fingerprint('draft'),approvalRef:'BR-013'}),/base version/);
}));
test('remote sync is read-only and has a visible reviewable SQLite status panel',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const html=await fs.readFile(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(source,/async function syncGithubMetadata\(/);
 assert.match(source,/connectedSync\.observeMany\(registry,project\.id/);
 assert.match(source,/case 'refreshSQLiteSync'/);
 assert.match(source,/case 'refreshConnectedSources'/);
 assert.match(source,/connectedSync\.checkpoint\(registry,projectId/);
 assert.match(html,/id="connectedSyncPanel"/);
 assert.match(html,/id="connectedSyncReport"/);
 assert.match(ui,/send\('refreshSQLiteSync'/);
 assert.match(ui,/data\?\.type==='connectedSyncState'/);
 const segment=source.slice(source.indexOf('async function syncGithubMetadata'),source.indexOf('async function postConnectedSyncState'));
 assert.doesNotMatch(segment,/method:'POST'|method:'PUT'|method:'PATCH'|publish|push/i);
});
