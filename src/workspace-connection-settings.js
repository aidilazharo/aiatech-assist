'use strict';
// Shared, non-secret Start/Settings configuration. The workspace SQLite
// database is authoritative once ATGV has initialized .atgv/memory.
// Provider credentials live only in the encrypted credentials.sqlite vault.
const path=require('node:path');
const fs=require('node:fs');
const {memoryDirectory,databaseSync}=require('./workspace-memory');
const {normalizeExtensionSettings}=require('./projects');
const {normalizeConfig}=require('./github-sdlc-catalog');
const KEYS=Object.freeze({
 extension:'atgvAssist.extensionSettings',
 library:'atgvAssist.sdlcCatalog',
 onboarding:'atgvAssist.startupSetup.completed'
});
const ALLOWED=new Set(Object.values(KEYS));
function canonical(key,value){
 if(!ALLOWED.has(key))throw Error('Unsupported ATGV SQLite settings key.');
 if(key===KEYS.extension)return normalizeExtensionSettings(value||{});
 if(key===KEYS.library)return normalizeConfig(value||{});
 if(typeof value!=='boolean')throw Error('Startup completion must be a boolean.');
 return value;
}
function safeFile(file){
 let st;try{st=fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return;throw e;}
 if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe ATGV settings SQLite file.');
}
function open(workspace){
 if(!workspace)return null;
 const base=path.resolve(workspace);
 const marker=path.join(base,'.atgv','atgv.workspace.json');
 // Never initialize workspace folders implicitly from the Settings screen:
 // users can test connections before they choose/initialize a project.
 try{if(!fs.statSync(marker).isFile())return null;}
 catch(e){if(e.code==='ENOENT')return null;throw e;}
 const dir=memoryDirectory(base),file=path.join(dir,'settings.sqlite');
 safeFile(file);
 const Database=databaseSync(),db=new Database(file);
 try{
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; CREATE TABLE IF NOT EXISTS connection_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated TEXT NOT NULL);');
  try{fs.chmodSync(file,0o600);}catch{}
  return db;
 }catch(e){db.close();throw e;}
}
function readRow(db,key){
 const row=db.prepare('SELECT value FROM connection_settings WHERE key=?').get(key);
 if(!row)return undefined;
 if(Buffer.byteLength(row.value,'utf8')>32768)throw Error('Oversized saved ATGV connection settings.');
 return canonical(key,JSON.parse(row.value));
}
function writeRow(db,key,value){
 const data=JSON.stringify(canonical(key,value));
 if(Buffer.byteLength(data,'utf8')>32768)throw Error('ATGV connection settings exceed the local size limit.');
 db.prepare('INSERT INTO connection_settings(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(key,data,new Date().toISOString());
}
function hydrate(workspace,legacy={}){
 const db=open(workspace);
 if(!db)return {...legacy,sqlite:false};
 try{
  const result={sqlite:true};
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const key of ALLOWED){
    const stored=readRow(db,key);
    if(stored!==undefined)result[key]=stored;
    else if(legacy[key]!==undefined){
     const value=canonical(key,legacy[key]);
     writeRow(db,key,value);result[key]=value;
    }
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return result;
 }finally{db.close();}
}
async function save(workspace,values,legacyState){
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid ATGV settings update.');
 const changes=Object.entries(values).map(([key,value])=>[key,canonical(key,value)]);
 const db=open(workspace);
 if(db){
  try{
   db.exec('BEGIN IMMEDIATE');
   try{for(const [key,value] of changes)writeRow(db,key,value);db.exec('COMMIT');}
   catch(e){db.exec('ROLLBACK');throw e;}
  }finally{db.close();}
 }
 // Compatibility mirror for older settings readers and initial setup before
 // .atgv is created; SQLite wins when the workspace is subsequently opened.
 if(legacyState?.update)for(const [key,value] of changes)await legacyState.update(key,value);
 return {sqlite:!!db,keys:changes.map(([key])=>key)};
}
module.exports={KEYS,canonical,hydrate,save};
