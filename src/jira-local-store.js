'use strict';
// Non-authoritative, per-project Jira cache and identity/mapping index.
// No API credentials and no remote mutations belong in this database.
// The BR register remains authoritative until a separate validated migration.
const fs=require('node:fs');
const path=require('node:path');
const {memoryDirectory,projectLocation,databaseSync}=require('./workspace-memory');
const {validIssueKey,validProjectKey}=require('./remote-actions');
const SITE=/^https:\/\/[a-z0-9.-]+\.atlassian\.net$/i;
function open(registry,projectId){
 if(!registry||typeof registry.fileFor!=='function')throw Error('Project registry required for Jira cache.');
 const root=path.dirname(registry.fileFor(projectId)),loc=projectLocation(root);
 if(!loc||loc.projectId!==projectId)return null; // A legacy/unmanaged workspace is never modified.
 const file=path.join(memoryDirectory(loc.workspace),'project-'+projectId+'.sqlite');
 let existing=null;
 try{existing=fs.lstatSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(existing&&(!existing.isFile()||existing.isSymbolicLink()))throw Error('Unsafe Jira project cache.');
 const Database=databaseSync(),db=new Database(file);
 try{
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS jira_issues (
    site TEXT NOT NULL, jira_id TEXT NOT NULL, issue_key TEXT NOT NULL,
    project_key TEXT NOT NULL, parent_key TEXT NOT NULL DEFAULT '',
    parent_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '',
    jira_updated TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL, seen_at TEXT NOT NULL,
    PRIMARY KEY(site,jira_id), UNIQUE(site,issue_key)
   );
   CREATE INDEX IF NOT EXISTS jira_issues_project ON jira_issues(site,project_key,seen_at);
   CREATE TABLE IF NOT EXISTS jira_mappings (
    site TEXT NOT NULL, project_id TEXT NOT NULL, node_path TEXT NOT NULL,
    issue_key TEXT NOT NULL, jira_id TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL CHECK(active IN (0,1)),
    recorded_at TEXT NOT NULL, PRIMARY KEY(site,project_id,node_path)
   );
   CREATE INDEX IF NOT EXISTS jira_mappings_issue ON jira_mappings(site,issue_key,active);
   CREATE TABLE IF NOT EXISTS jira_sync_state (
    site TEXT NOT NULL, project_key TEXT NOT NULL, last_scan_at TEXT NOT NULL,
    scanned_count INTEGER NOT NULL, completed INTEGER NOT NULL CHECK(completed IN (0,1)),
    PRIMARY KEY(site,project_key)
   );`);
  try{fs.chmodSync(file,0o600);}catch{}
  return {db,file};
 }catch(e){db.close();throw e;}
}
function atomic(db,fn){
 db.exec('BEGIN IMMEDIATE');
 try{const value=fn();db.exec('COMMIT');return value;}
 catch(error){db.exec('ROLLBACK');throw error;}
}
function canonicalSite(value){
 const site=String(value||'').trim().replace(/\/$/,'').toLowerCase();
 if(!SITE.test(site))throw Error('Invalid Jira Cloud site for local cache.');
 return site;
}
function saveIssuePage(registry,projectId,{site,projectKey,issues}){
 const origin=canonicalSite(site),project=validProjectKey(projectKey);
 if(!Array.isArray(issues)||issues.length>100)throw Error('Invalid Jira cache page.');
 const store=open(registry,projectId);if(!store)return {stored:0,legacy:true};
 try{return atomic(store.db,()=>{
  const put=store.db.prepare(`INSERT INTO jira_issues
   (site,jira_id,issue_key,project_key,parent_key,parent_id,status,jira_updated,payload,seen_at)
   VALUES(?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(site,jira_id) DO UPDATE SET issue_key=excluded.issue_key,
    project_key=excluded.project_key,parent_key=excluded.parent_key,
    parent_id=excluded.parent_id,status=excluded.status,jira_updated=excluded.jira_updated,
    payload=excluded.payload,seen_at=excluded.seen_at`);
  let stored=0;
  for(const row of issues){
   const jiraId=String(row?.id||'');
   if(!/^\d{1,30}$/.test(jiraId))continue; // Old fixtures may not provide a remote ID.
   const key=validIssueKey(row.key);
   if(key.split('-')[0]!==project)throw Error('Cross-project Jira issue cannot enter project cache.');
   const payload=JSON.stringify(row);
   if(Buffer.byteLength(payload,'utf8')>40000)throw Error('Jira issue cache row is oversized.');
   put.run(origin,jiraId,key,project,String(row.parentKey||'').slice(0,80),
     String(row.parentId||'').slice(0,30),String(row.status||'').slice(0,100),
     String(row.updated||'').slice(0,55),payload,new Date().toISOString());stored++;
  }
  return {stored,file:store.file};
 });}finally{store.db.close();}
}
function saveMappings(registry,projectId,{site,register}){
 const origin=canonicalSite(site),store=open(registry,projectId);
 if(!store)return {stored:0,legacy:true};
 try{return atomic(store.db,()=>{
  const now=new Date().toISOString(),put=store.db.prepare(`INSERT INTO jira_mappings
   (site,project_id,node_path,issue_key,jira_id,active,recorded_at) VALUES(?,?,?,?,?,1,?)
   ON CONFLICT(site,project_id,node_path) DO UPDATE SET issue_key=excluded.issue_key,
    jira_id=excluded.jira_id,active=1,recorded_at=excluded.recorded_at`);
  const lookup=store.db.prepare('SELECT jira_id FROM jira_issues WHERE site=? AND issue_key=?');
  store.db.prepare('UPDATE jira_mappings SET active=0 WHERE site=? AND project_id=?').run(origin,projectId);
  let stored=0;
  for(const map of [register?.synced||{},register?.roleTaskMappings||{}]){
   for(const [nodePath,value] of Object.entries(map)){
    if(!value?.key||!nodePath.startsWith('BR-'))continue;
    const key=validIssueKey(value.key),jiraId=lookup.get(origin,key)?.jira_id||'';
    put.run(origin,projectId,nodePath.slice(0,500),key,jiraId,now);stored++;
   }
  }
  return {stored,file:store.file};
 });}finally{store.db.close();}
}
function finishScan(registry,projectId,{site,projectKey,count,completed}){
 const origin=canonicalSite(site),project=validProjectKey(projectKey);
 const store=open(registry,projectId);if(!store)return {legacy:true};
 try{store.db.prepare(`INSERT INTO jira_sync_state
 (site,project_key,last_scan_at,scanned_count,completed) VALUES(?,?,?,?,?)
 ON CONFLICT(site,project_key) DO UPDATE SET last_scan_at=excluded.last_scan_at,
 scanned_count=excluded.scanned_count,completed=excluded.completed`).run(origin,project,
 new Date().toISOString(),Math.max(0,Number(count)||0),completed?1:0);
 return {file:store.file};}finally{store.db.close();}
}
function snapshot(registry,projectId,site,projectKey){
 const origin=canonicalSite(site),project=validProjectKey(projectKey);
 const store=open(registry,projectId);if(!store)return {issues:[],mappings:[],state:null,legacy:true};
 try{
  const issues=store.db.prepare('SELECT payload FROM jira_issues WHERE site=? AND project_key=? ORDER BY jira_updated DESC').all(origin,project).map(r=>JSON.parse(r.payload));
  const mappings=store.db.prepare('SELECT node_path,issue_key,jira_id,active FROM jira_mappings WHERE site=? AND project_id=?').all(origin,projectId);
  const state=store.db.prepare('SELECT * FROM jira_sync_state WHERE site=? AND project_key=?').get(origin,project)||null;
  return {issues,mappings,state};
 }finally{store.db.close();}
}
function publishedSnapshots(registry,projectId,{site,projectKey,snapshots}){
 const origin=canonicalSite(site),project=validProjectKey(projectKey),store=open(registry,projectId);
 if(!store)return {};
 try{
  store.db.exec("CREATE TABLE IF NOT EXISTS jira_published_br (site TEXT NOT NULL,project_key TEXT NOT NULL,epic TEXT NOT NULL,revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,verified_at TEXT NOT NULL,PRIMARY KEY(site,project_key,epic,revision))");
  if(snapshots)atomic(store.db,()=>{
   const put=store.db.prepare("INSERT INTO jira_published_br VALUES(?,?,?,?,?,?,?) ON CONFLICT(site,project_key,epic,revision) DO UPDATE SET payload=excluded.payload,verified_at=excluded.verified_at WHERE fingerprint=excluded.fingerprint");
   for(const row of snapshots){
    if(!row.epic.startsWith(project+'-')||!Number.isSafeInteger(row.revision)||!/^[a-f0-9]{64}$/.test(row.fingerprint))throw Error('Invalid published BR snapshot.');
    const data=JSON.stringify(row);if(Buffer.byteLength(data)>8*1024*1024)throw Error('Published snapshot too large.');
    put.run(origin,project,row.epic,row.revision,row.fingerprint,data,row.verifiedAt);
   }
  });
  const rows=store.db.prepare("SELECT payload FROM jira_published_br WHERE site=? AND project_key=? ORDER BY revision DESC").all(origin,project);
  const latest={};
  for(const row of rows){const data=JSON.parse(row.payload);if(!Object.hasOwn(latest,data.epic))latest[data.epic]=data;}
  return latest;
 }finally{store.db.close();}
}
module.exports={open,saveIssuePage,saveMappings,finishScan,snapshot,canonicalSite,publishedSnapshots};
