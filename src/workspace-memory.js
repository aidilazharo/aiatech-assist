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
 return target;
}
function secretStorageBridge({secrets,workspaceRoot}={}){
 if(!secrets||typeof secrets.get!=='function'||typeof secrets.store!=='function'||typeof workspaceRoot!=='function')throw Error('SecretStorage and workspace resolver required.');
 function dbForWorkspace(){
  const ws=workspaceRoot();
  if(!ws)return null;
  try{
   const folder=memoryDirectory(ws);
   const Database=databaseSync(),dbFile=path.join(folder,'credentials.sqlite');
   safeSqliteFile(dbFile);
   const db=new Database(dbFile);
   db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL, tag BLOB NOT NULL, updated TEXT NOT NULL);');
   try{fs.chmodSync(dbFile,0o600);}catch{}
   return {db,ws:path.resolve(ws)};
  }catch(e){
   if(/Initialize ATGV workspace|workspace marker required|requires Node\.js/.test(e.message))return null;
   throw e;
  }
 }
 const digest=(key)=>crypto.createHash('sha256').update(String(key)).digest('hex');
 const keyName=ws=>KEY_PREFIX+digest(ws);
 async function master(ws,create){
  let raw=await secrets.get(keyName(ws));
  if(!raw&&create){raw=crypto.randomBytes(32).toString('base64');await secrets.store(keyName(ws),raw);}
  if(!raw)return null;
  const key=Buffer.from(raw,'base64');
  if(key.length!==32)throw Error('Credential vault encryption key is invalid.');
  return key;
 }
 return {
  async get(name){
   const state=dbForWorkspace();
   if(!state)return secrets.get(name);
   try{
    const id=digest(name),row=state.db.prepare('SELECT nonce,ciphertext,tag FROM credentials WHERE id=?').get(id);
    if(row){
     const key=await master(state.ws,false);
     if(!key)throw Error('Encrypted credentials cannot be opened because the VS Code SecretStorage key is missing.');
     const dec=crypto.createDecipheriv('aes-256-gcm',key,row.nonce);
     dec.setAAD(Buffer.from(id));dec.setAuthTag(row.tag);
     return Buffer.concat([dec.update(row.ciphertext),dec.final()]).toString('utf8');
    }
   }finally{state.db.close();}
   const legacy=await secrets.get(name);
   if(legacy!==undefined){await this.store(name,legacy);await secrets.delete?.(name);}
   return legacy;
  },
  async store(name,value){
   if(typeof value!=='string')throw Error('Credential value must be a string.');
   const state=dbForWorkspace();
   if(!state)return secrets.store(name,value);
   try{
    const id=digest(name),key=await master(state.ws,true),nonce=crypto.randomBytes(12);
    const enc=crypto.createCipheriv('aes-256-gcm',key,nonce);
    enc.setAAD(Buffer.from(id));
    const cipher=Buffer.concat([enc.update(Buffer.from(value,'utf8')),enc.final()]);
    state.db.prepare('INSERT INTO credentials(id,nonce,ciphertext,tag,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,ciphertext=excluded.ciphertext,tag=excluded.tag,updated=excluded.updated').run(id,nonce,cipher,enc.getAuthTag(),new Date().toISOString());
   }finally{state.db.close();}
   await secrets.delete?.(name);
  },
  async delete(name){
   const state=dbForWorkspace();
   if(state){try{state.db.prepare('DELETE FROM credentials WHERE id=?').run(digest(name));}finally{state.db.close();}}
   await secrets.delete?.(name);
  }
 };
}
module.exports={memoryDirectory,projectLocation,projectDatabasePath,sqliteSnapshot,secretStorageBridge,databaseSync};
