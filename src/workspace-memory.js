'use strict';
// ATGV v0.0.70: workspace-owned, private SQLite stores. Never put shared
// secrets, project memory, or mutable state inside the Git Library checkout.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ID=/^[a-z][a-z0-9-]{0,48}$/;
const OWNER='aia-my.atgv-aiatech-assist';
const KEY_PREFIX='atgvAssist.memory.key.';
const entry=name=>{try{return fs.lstatSync(name);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
function normalFolder(folder,{create=false}={}){
 const st=entry(folder);
 if(st&&(!st.isDirectory()||st.isSymbolicLink()))throw Error('Unsafe ATGV memory directory: '+folder);
 if(!st&&create)fs.mkdirSync(folder,{recursive:false,mode:0o700});
 if(create)try{fs.chmodSync(folder,0o700);}catch{}
 return !!st||create;
}
function memoryDirectory(workspace,{create=true}={}){
 const dir=path.resolve(workspace),base=path.join(dir,'.atgv');
 if(!normalFolder(base))throw Error('Initialize ATGV workspace before using shared memory.');
 let marker;try{marker=JSON.parse(fs.readFileSync(path.join(base,'atgv.workspace.json'),'utf8'));}catch{throw Error('ATGV workspace marker required for memory storage.');}
 if(marker?.managedBy!==OWNER)throw Error('ATGV memory owner mismatch.');
 const folder=path.join(base,'memory');
 if(normalFolder(folder,{create})){
  const ignore=path.join(folder,'.gitignore');
  if(!entry(ignore))fs.writeFileSync(ignore,'*.sqlite*\n*.db\n*.bak\nlegacy-backups/\n',{flag:'wx',mode:0o600});
 }
 return folder;
}
function projectLocation(projectRoot){
 const root=path.resolve(projectRoot);
 if(path.basename(path.dirname(root))!=='projects'||!ID.test(path.basename(root)))return null;
 const workspace=path.dirname(path.dirname(root)),marker=path.join(workspace,'.atgv','atgv.workspace.json');
 if(!entry(marker))return null;
 const descriptor=path.join(root,'atgv.project.json');
 let project,ownership;
 try{project=JSON.parse(fs.readFileSync(descriptor,'utf8'));ownership=JSON.parse(fs.readFileSync(marker,'utf8'));}catch{return null;}
 if(project.id!==path.basename(root)||ownership?.managedBy!==OWNER)return null;
 return {workspace,projectId:project.id,root};
}
function databaseSync(){
 try{return require('node:sqlite').DatabaseSync;}catch{
  throw Error('Shared SQLite memory requires Node.js 22.13+ with node:sqlite.');
 }
}
function safeSqliteFile(file){
 const st=entry(file);
 if(st&&(!st.isFile()||st.isSymbolicLink()))throw Error('Unsafe SQLite database file: '+path.basename(file));
 return st;
}
function sqliteSnapshot(source,target,Database=databaseSync()){
 // VACUUM INTO creates a consistent SQLite snapshot even if the source is in WAL mode.
 // It never executes scripts from project content and never overwrites a target.
 if(!safeSqliteFile(source))return false;
 if(safeSqliteFile(target))return false;
 const temp=target+'.migrating-'+crypto.randomUUID(),original=new Database(source);
 try{
  original.exec('VACUUM INTO '+"'"+temp.replace(/'/g,"''")+"'");
 }finally{original.close();}
 try{
  const verify=new Database(temp,{readOnly:true});
  try{if(verify.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite migration integrity check failed.');}
  finally{verify.close();}
  if(entry(target))throw Error('SQLite target appeared during migration. Original preserved.');
  fs.renameSync(temp,target);
  try{fs.chmodSync(target,0o600);}catch{}
  return true;
 }finally{if(entry(temp))fs.rmSync(temp,{force:true});}
}
function extensionMemoryPath(workspace){
 const folder=memoryDirectory(workspace),file=path.join(folder,'ai-memory.sqlite');
 safeSqliteFile(file);
 const Database=databaseSync(),db=new Database(file);
 try{
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; CREATE TABLE IF NOT EXISTS agent_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS project_memory_index (project_id TEXT PRIMARY KEY, sqlite_file TEXT NOT NULL, updated TEXT NOT NULL);');
  try{fs.chmodSync(file,0o600);}catch{}
 }finally{db.close();}
 return file;
}
function indexProjectMemory(workspace,projectId,file){
 // Metadata pointer only. No project prompts, private content or API tokens.
 if(!ID.test(projectId))throw Error('Unsafe project identity in memory index.');
 const Database=databaseSync(),db=new Database(extensionMemoryPath(workspace));
 try{db.prepare('INSERT INTO project_memory_index(project_id,sqlite_file,updated) VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET sqlite_file=excluded.sqlite_file,updated=excluded.updated').run(projectId,path.basename(file),new Date().toISOString());}
 finally{db.close();}
}
function projectDatabasePath(projectRoot){
 const loc=projectLocation(projectRoot);
 if(!loc)return path.join(path.resolve(projectRoot),'knowledge','ai-memory.sqlite'); // stand-alone/legacy callers
 const dir=memoryDirectory(loc.workspace),target=path.join(dir,'ai-memory-'+loc.projectId+'.sqlite');
 safeSqliteFile(target);
 const source=path.join(loc.root,'knowledge','ai-memory.sqlite');
 if(!entry(target)&&safeSqliteFile(source)){
  sqliteSnapshot(source,target);
  // Keep the original as a rollback backup. If a live process holds WAL files,
  // leave the original in place rather than tearing a journal away from it.
  if(!entry(source+'-wal')&&!entry(source+'-shm')){
   const backups=path.join(dir,'legacy-backups');
   normalFolder(backups,{create:true});
   const backup=path.join(backups,'ai-memory-'+loc.projectId+'-'+crypto.randomUUID()+'.sqlite.bak');
   try{fs.renameSync(source,backup);}catch{} // no data loss if archiving is blocked
  }
 }
 indexProjectMemory(loc.workspace,loc.projectId,target);
 return target;
}
// Before initialization, use only a folder-specific SecretStorage slot.
// Never import unbound legacy credentials: their original owner is unknown.
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function workspaceScope(workspace){
 return workspace?digest(path.resolve(workspace)):null;
}
function pendingSecretName(workspace,name){
 const scope=workspaceScope(workspace);
 if(!scope)throw Error('Open an ATGV workspace folder before saving credentials.');
 return 'atgvAssist.memory.pending.'+scope+'.'+digest(name);
}
const SCOPED_SETTINGS=new Set([
 'atgvAssist.extensionSettings','atgvAssist.sdlcCatalog','atgvAssist.startupSetup.completed',
 'atgvAssist.serviceUrl','atgvAssist.coordinationProvider','atgvAssist.localMemberId'
]);
function scopedSettingsKey(workspace,name){
 return 'atgvAssist.workspaceSettings.'+workspaceScope(workspace)+'.'+name;
}
function workspaceSettingsBridge({state,workspaceRoot}){
 return {
  get(name,fallback){
   if(!SCOPED_SETTINGS.has(name))return state.get(name,fallback)??fallback;
   const ws=workspaceRoot();
   return ws?(state.get(scopedSettingsKey(ws,name))??fallback):fallback;
  },
  async update(name,value){
   if(!SCOPED_SETTINGS.has(name))return state.update(name,value);
   const ws=workspaceRoot();
   if(!ws)throw Error('Open an ATGV workspace folder before saving connection settings.');
   return state.update(scopedSettingsKey(ws,name),value);
  },
  keys(){return typeof state.keys==='function'?state.keys():[];}
 };
}
function secretStorageBridge({secrets,workspaceRoot}={}){
 if(!secrets||typeof secrets.get!=='function'||typeof secrets.store!=='function'||typeof workspaceRoot!=='function')throw Error('SecretStorage and workspace resolver required.');
 function dbForWorkspace(ws){
  if(!ws)return null;
  try{
   const folder=memoryDirectory(ws);
   const Database=databaseSync(),dbFile=path.join(folder,'credentials.sqlite');
   safeSqliteFile(dbFile);
   const db=new Database(dbFile);
   try{
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL, tag BLOB NOT NULL, updated TEXT NOT NULL);');
    try{fs.chmodSync(dbFile,0o600);}catch{}
    return db;
   }catch(error){db.close();throw error;}
  }catch(e){
   if(/Initialize ATGV workspace|workspace marker required/.test(e.message))return null;
   throw e;
  }
 }
 const keyName=ws=>KEY_PREFIX+workspaceScope(ws);
 // Serialize first key creation across VS Code extension hosts with an
 // exclusive directory lock. Never overwrite an existing key or vault.
 async function master(ws,create){
  let raw=await secrets.get(keyName(ws));
  if(!raw&&create){
   const lock=path.join(memoryDirectory(ws),'credentials-key.lock');
   const deadline=Date.now()+8000;
   while(true){
    try{fs.mkdirSync(lock,{mode:0o700});break;}
    catch(error){
     if(error.code!=='EEXIST')throw error;
     if(Date.now()>=deadline)throw Error('Credential vault key initialization is busy. Retry or inspect the workspace lock.');
     await new Promise(resolve=>setTimeout(resolve,50));
    }
   }
   try{
    raw=await secrets.get(keyName(ws));
    if(!raw){
     const db=dbForWorkspace(ws);
     try{if(db.prepare('SELECT 1 FROM credentials LIMIT 1').get())throw Error('Encrypted credentials cannot be opened because the VS Code SecretStorage key is missing.');}
     finally{db.close();}
     raw=crypto.randomBytes(32).toString('base64');await secrets.store(keyName(ws),raw);
    }
   }finally{fs.rmdirSync(lock);}
  }
  if(!raw)return null;
  const key=Buffer.from(raw,'base64');
  if(key.length!==32)throw Error('Credential vault encryption key is invalid.');
  return key;
 }
 async function write(ws,db,name,value){
  const id=digest(name),key=await master(ws,true),nonce=crypto.randomBytes(12);
  const enc=crypto.createCipheriv('aes-256-gcm',key,nonce);
  enc.setAAD(Buffer.from(id));
  const cipher=Buffer.concat([enc.update(Buffer.from(value,'utf8')),enc.final()]);
  db.prepare('INSERT INTO credentials(id,nonce,ciphertext,tag,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,ciphertext=excluded.ciphertext,tag=excluded.tag,updated=excluded.updated').run(id,nonce,cipher,enc.getAuthTag(),new Date().toISOString());
 }
 return {
  async get(name){
   const ws=workspaceRoot();if(!ws)return undefined;
   const pending=pendingSecretName(ws,name),db=dbForWorkspace(ws);
   if(!db)return secrets.get(pending);
   try{
    const id=digest(name),row=db.prepare('SELECT nonce,ciphertext,tag FROM credentials WHERE id=?').get(id);
    if(row){
     const key=await master(ws,false);
     if(!key)throw Error('Encrypted credentials cannot be opened because the VS Code SecretStorage key is missing.');
     const dec=crypto.createDecipheriv('aes-256-gcm',key,row.nonce);
     dec.setAAD(Buffer.from(id));dec.setAuthTag(row.tag);
     return Buffer.concat([dec.update(row.ciphertext),dec.final()]).toString('utf8');
    }
    const staged=await secrets.get(pending);
    if(staged!==undefined){
     await write(ws,db,name,staged);await secrets.delete?.(pending);
    }
    return staged;
   }finally{db.close();}
  },
  async store(name,value){
   if(typeof value!=='string')throw Error('Credential value must be a string.');
   const ws=workspaceRoot(),pending=pendingSecretName(ws,name),db=dbForWorkspace(ws);
   if(!db)return secrets.store(pending,value);
   try{await write(ws,db,name,value);}finally{db.close();}
   await secrets.delete?.(pending);
  },
  async delete(name){
   const ws=workspaceRoot();if(!ws)return;
   const db=dbForWorkspace(ws);
   if(db){try{db.prepare('DELETE FROM credentials WHERE id=?').run(digest(name));}finally{db.close();}}
   await secrets.delete?.(pendingSecretName(ws,name));
  }
 };
}
module.exports={memoryDirectory,extensionMemoryPath,indexProjectMemory,projectLocation,projectDatabasePath,sqliteSnapshot,secretStorageBridge,databaseSync,workspaceSettingsBridge,scopedSettingsKey,pendingSecretName};
