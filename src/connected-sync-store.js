'use strict';
// Private, per-project sync metadata. Remote providers remain authoritative.
// This ledger never stores credentials, source files or automatic write grants.
const crypto=require('node:crypto');
const jiraStore=require('./jira-local-store');
const PROVIDERS=new Set(['jira','confluence','github']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_./:@-]{0,199}$/;
const SHA=/^[a-f0-9]{64}$/;
const timestamp=()=>new Date().toISOString();
function validateProvider(value){
 const provider=String(value||'').toLowerCase();
 if(!PROVIDERS.has(provider))throw Error('Unsupported synchronization provider.');
 return provider;
}
function validateOrigin(provider,value){
 let parsed;try{parsed=new URL(String(value||''));}catch{throw Error('Invalid synchronization origin.');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||parsed.search||parsed.hash)
  throw Error('Synchronization origin must be a clean HTTPS origin.');
 const host=parsed.hostname.toLowerCase();
 if(provider==='github'?!['github.com','api.github.com'].includes(host):!/^[-a-z0-9.]+\.atlassian\.net$/.test(host))
  throw Error('Synchronization origin does not match the provider.');
 return parsed.origin.toLowerCase();
}
function safeId(value,label='resource'){
 const s=String(value||'');
 if(!ID.test(s)||s.includes('..'))throw Error('Invalid '+label+' identity.');
 return s;
}
function safeRevision(value){
 const s=String(value||'').trim();if(s.length>100||/[\x00-\x1f]/.test(s))throw Error('Invalid remote revision.');
 return s;
}
function safeMeta(value){
 const allowed=['key','status','branch','scope','kind'];
 const out={};
 for(const key of allowed){
  const s=String(value?.[key]||'').trim();
  if(s&&s.length<=120&&!/[\x00-\x1f]/.test(s))out[key]=s;
 }
 return JSON.stringify(out);
}
function fingerprint(value){
 return crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value??null)).digest('hex');
}
function open(registry,projectId){
 const store=jiraStore.open(registry,projectId);
 if(!store)return null;
 try{
  store.db.exec(`CREATE TABLE IF NOT EXISTS connected_sync_resources (
   provider TEXT NOT NULL, origin TEXT NOT NULL, resource_id TEXT NOT NULL,
   remote_revision TEXT NOT NULL, remote_hash TEXT NOT NULL, metadata TEXT NOT NULL,
   seen_at TEXT NOT NULL, PRIMARY KEY(provider,origin,resource_id)
  );
  CREATE TABLE IF NOT EXISTS connected_sync_cursors (
   provider TEXT NOT NULL, origin TEXT NOT NULL, scope TEXT NOT NULL,
   last_success_at TEXT NOT NULL DEFAULT '', last_attempt_at TEXT NOT NULL DEFAULT '',
   last_error TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL DEFAULT 0,
   complete INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(provider,origin,scope)
  );
  CREATE TABLE IF NOT EXISTS connected_sync_outbox (
   id TEXT PRIMARY KEY, provider TEXT NOT NULL, origin TEXT NOT NULL,
   resource_id TEXT NOT NULL, base_revision TEXT NOT NULL,
   local_hash TEXT NOT NULL, approval_ref TEXT NOT NULL,
   state TEXT NOT NULL CHECK(state IN ('pending','conflict','verified','cancelled')),
   queued_at TEXT NOT NULL, verified_at TEXT NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX IF NOT EXISTS sync_pending_resource
   ON connected_sync_outbox(provider,origin,resource_id) WHERE state='pending';
  CREATE TABLE IF NOT EXISTS connected_sync_conflicts (
   id TEXT PRIMARY KEY, provider TEXT NOT NULL, origin TEXT NOT NULL,
   resource_id TEXT NOT NULL, local_revision TEXT NOT NULL,
   remote_revision TEXT NOT NULL, reason TEXT NOT NULL, detected_at TEXT NOT NULL,
   resolved_at TEXT NOT NULL DEFAULT ''
  );`);
  return store;
 }catch(error){store.db.close();throw error;}
}
function transaction(db,fn){
 db.exec('BEGIN IMMEDIATE');
 try{const value=fn();db.exec('COMMIT');return value;}
 catch(error){db.exec('ROLLBACK');throw error;}
}
function observeMany(registry,projectId,{provider,origin,resources}){
 provider=validateProvider(provider);origin=validateOrigin(provider,origin);
 if(!Array.isArray(resources)||resources.length>1000)throw Error('Invalid sync resource batch.');
 const batch=resources.map(item=>{
  const id=safeId(item.id),revision=safeRevision(item.revision);
  const hash=item.hash||fingerprint(item.value??{id,revision});
  if(!SHA.test(hash))throw Error('Invalid resource fingerprint.');
  return {id,revision,hash,metadata:safeMeta(item.metadata)};
 });
 const store=open(registry,projectId);if(!store)return {stored:0,legacy:true,conflicts:0};
 try{return transaction(store.db,()=>{
  const previous=store.db.prepare('SELECT remote_revision FROM connected_sync_resources WHERE provider=? AND origin=? AND resource_id=?');
  const pending=store.db.prepare("SELECT id,base_revision FROM connected_sync_outbox WHERE provider=? AND origin=? AND resource_id=? AND state='pending'");
  const put=store.db.prepare(`INSERT INTO connected_sync_resources
   (provider,origin,resource_id,remote_revision,remote_hash,metadata,seen_at)
   VALUES(?,?,?,?,?,?,?) ON CONFLICT(provider,origin,resource_id) DO UPDATE SET
   remote_revision=excluded.remote_revision,remote_hash=excluded.remote_hash,
   metadata=excluded.metadata,seen_at=excluded.seen_at`);
  const conflict=store.db.prepare(`INSERT OR IGNORE INTO connected_sync_conflicts
   (id,provider,origin,resource_id,local_revision,remote_revision,reason,detected_at)
   VALUES(?,?,?,?,?,?,?,?)`);
  const mark=store.db.prepare("UPDATE connected_sync_outbox SET state='conflict' WHERE id=? AND state='pending'");
  let stored=0,conflicts=0;
  for(const row of batch){
   const old=previous.get(provider,origin,row.id);
   if(provider==='jira'&&old?.remote_revision&&row.revision&&row.revision<old.remote_revision)continue;
   if(provider==='confluence'&&/^\d+$/.test(row.revision)&&/^\d+$/.test(old?.remote_revision||'')&&
      Number(row.revision)<Number(old.remote_revision))continue;
   const intent=pending.get(provider,origin,row.id);
   if(intent&&row.revision!==intent.base_revision){
    const id=fingerprint([provider,origin,row.id,intent.id,row.revision]);
    conflict.run(id,provider,origin,row.id,intent.base_revision,row.revision,
     'Remote version changed after the locally approved revision; manual review required.',timestamp());
    mark.run(intent.id);conflicts++;
   }
   put.run(provider,origin,row.id,row.revision,row.hash,row.metadata,timestamp());stored++;
  }
  return {stored,conflicts};
 });}finally{store.db.close();}
}
function checkpoint(registry,projectId,{provider,origin,scope='default',count=0,complete=false,error='' }){
 provider=validateProvider(provider);origin=validateOrigin(provider,origin);scope=safeId(scope,'sync scope');
 const store=open(registry,projectId);if(!store)return {legacy:true};
 try{
  const issue=String(error||'').slice(0,180).replace(/[\r\n\t]/g,' ');
  const ok=!issue;
  store.db.prepare(`INSERT INTO connected_sync_cursors
   (provider,origin,scope,last_success_at,last_attempt_at,last_error,count,complete)
   VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider,origin,scope) DO UPDATE SET
   last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error,
   last_success_at=CASE WHEN excluded.last_error='' THEN excluded.last_success_at ELSE connected_sync_cursors.last_success_at END,
   count=CASE WHEN excluded.last_error='' THEN excluded.count ELSE connected_sync_cursors.count END,
   complete=CASE WHEN excluded.last_error='' THEN excluded.complete ELSE connected_sync_cursors.complete END`)
   .run(provider,origin,scope,ok?timestamp():'',timestamp(),issue,Math.max(0,Number(count)||0),complete?1:0);
  return {recorded:true};
 }finally{store.db.close();}
}
// Write intents are audit-only and can be created ONLY after a server-side
// approval. No background worker may replay them without remote revalidation.
function queueApproved(registry,projectId,{provider,origin,id,baseRevision,hash,approvalRef}){
 provider=validateProvider(provider);origin=validateOrigin(provider,origin);
 id=safeId(id);baseRevision=safeRevision(baseRevision);approvalRef=safeId(approvalRef,'approval');
 if(!baseRevision||!SHA.test(hash))throw Error('Approved change requires base version and content fingerprint.');
 const store=open(registry,projectId);if(!store)return {legacy:true};
 try{
  const jobId=fingerprint([provider,origin,id,baseRevision,hash,approvalRef]);
  store.db.prepare(`INSERT OR IGNORE INTO connected_sync_outbox
   (id,provider,origin,resource_id,base_revision,local_hash,approval_ref,state,queued_at)
   VALUES(?,?,?,?,?,?,?,'pending',?)`).run(jobId,provider,origin,id,baseRevision,hash,approvalRef,timestamp());
  return {id:jobId};
 }finally{store.db.close();}
}
function reportConflict(registry,projectId,{provider,origin,id,localRevision='',remoteRevision='',reason}){
 provider=validateProvider(provider);origin=validateOrigin(provider,origin);id=safeId(id);
 localRevision=safeRevision(localRevision);remoteRevision=safeRevision(remoteRevision);
 const message=String(reason||'Remote content conflicts with an approved local revision.').replace(/[\r\n\t]/g,' ').slice(0,160);
 const store=open(registry,projectId);if(!store)return {legacy:true};
 try{
  const key=fingerprint([provider,origin,id,localRevision,remoteRevision]);
  store.db.prepare(`INSERT OR IGNORE INTO connected_sync_conflicts
   (id,provider,origin,resource_id,local_revision,remote_revision,reason,detected_at)
   VALUES(?,?,?,?,?,?,?,?)`).run(key,provider,origin,id,localRevision,remoteRevision,message,timestamp());
  return {id:key};
 }finally{store.db.close();}
}
function snapshot(registry,projectId){
 const store=open(registry,projectId);
 if(!store)return {legacy:true,providers:[],conflicts:[],outbox:[]};
 try{
  const providers=store.db.prepare(`SELECT provider,origin,scope,last_success_at,last_attempt_at,
   last_error,count,complete FROM connected_sync_cursors ORDER BY provider,scope`).all();
  const conflicts=store.db.prepare(`SELECT provider,origin,resource_id,local_revision,remote_revision,
   reason,detected_at FROM connected_sync_conflicts WHERE resolved_at='' ORDER BY detected_at DESC LIMIT 60`).all();
  const outbox=store.db.prepare(`SELECT provider,origin,resource_id,state,queued_at
   FROM connected_sync_outbox WHERE state IN ('pending','conflict') ORDER BY queued_at DESC LIMIT 60`).all();
  return {providers,conflicts,outbox};
 }finally{store.db.close();}
}
module.exports={open,observeMany,checkpoint,queueApproved,reportConflict,snapshot,fingerprint,validateOrigin};
