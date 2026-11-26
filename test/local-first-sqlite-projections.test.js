'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const {KnowledgeStore}=require('../src/knowledge');
const sync=require('../src/connected-sync-store');
async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-local-first-'));
 try{
  await fs.mkdir(path.join(root,'.atgv'));
  await fs.writeFile(path.join(root,'.atgv','atgv.workspace.json'),JSON.stringify({schema:1,managedBy:'aia-my.atgv-aiatech-assist'}));
  const registry=new ProjectRegistry(root);
  await registry.create({id:'demo',name:'Demo'});
  await registry.create({id:'other',name:'Other'});
  await run({root,registry,projectId:'demo'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const doc=(id,provider)=>({id,provider,title:id,text:'sample '+id});
test('managed knowledge migrates JSON once and concurrent provider replacements persist without losing each other',()=>fixture(async({root,registry,projectId})=>{
 const folder=path.join(root,'legacy-index');await fs.mkdir(folder);
 const legacy=JSON.stringify({schema:1,documents:[doc('old-jira','Jira'),doc('old-confluence','Confluence')]});
 await fs.writeFile(path.join(folder,'knowledge.json'),legacy);
 const binding={registry,projectId},a=new KnowledgeStore(folder,binding),b=new KnowledgeStore(folder,binding);
 await a.load();await b.load();
 assert.equal(a.docs.length,2);
 await Promise.all([a.replace('Jira',[doc('new-jira','Jira')]),b.replace('GitHub',[doc('repo','GitHub')])]);
 const reopened=new KnowledgeStore(folder,binding);await reopened.load();
 assert.deepEqual(reopened.docs.map(x=>x.id).sort(),['new-jira','old-confluence','repo']);
 assert.equal(await fs.readFile(path.join(folder,'knowledge.json'),'utf8'),legacy);
 const db=sync.open(registry,projectId);
 try{assert.equal(db.db.prepare('SELECT count(*) AS n FROM knowledge_cache_documents').get().n,3);}
 finally{db.db.close();}
 await reopened.clear();await reopened.load();assert.equal(reopened.docs.length,0,'cleared cache must not reimport legacy JSON');
}));
test('SQLite role views are isolated by project and binding, expire, and reject older writes',()=>fixture(async({registry,projectId})=>{
 const scope='role-jira-issues',binding=sync.fingerprint('configured-account-A'),other=sync.fingerprint('configured-account-B');
 const write=(value,now)=>sync.writeProjection(registry,projectId,{scope,binding,value,now});
 write({items:[{key:'TC-1',status:'Done'}]},100000);
 write({items:[{key:'TC-1',status:'To Do'}]},99999);
 assert.equal(sync.readProjection(registry,projectId,{scope,binding,now:100001}).value.items[0].status,'Done');
 assert.equal(sync.readProjection(registry,projectId,{scope,binding,now:100001}).fresh,true);
 assert.equal(sync.readProjection(registry,projectId,{scope,binding,now:130001}).fresh,false);
 assert.equal(sync.readProjection(registry,projectId,{scope,binding:other}),null);
 assert.equal(sync.readProjection(registry,'other',{scope,binding}),null);
}));
test('runtime uses SQLite before the routine Jira role scan and preserves explicit remote refresh',async()=>{
 const runtime=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const role=runtime.slice(runtime.indexOf("case 'roleJiraIssues':{"),runtime.indexOf("case 'roleJiraAssign':"));
 assert.ok(role.indexOf('connectedSync.readProjection')>=0);
 assert.ok(role.indexOf('connectedSync.readProjection')<role.indexOf('jiraProjectInventory.scanProject'));
 assert.match(role,/if\(cached\.fresh\|\|openingOffline\)break/);
 assert.match(role,/if\(msg\.force&&pending\)/);
 assert.match(role,/connectedSync.writeProjection/);
 assert.match(runtime,/new KnowledgeStore\(base,\{registry,projectId:project\.id\}\)/);
 const refresh=runtime.slice(runtime.indexOf('async function refreshLiveRemoteData('),runtime.indexOf('async function syncGithub(',runtime.indexOf('async function refreshLiveRemoteData(')));
 assert.match(refresh,/await Promise\.allSettled\(\[/);
});
