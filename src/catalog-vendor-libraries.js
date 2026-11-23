'use strict';
// Executable webview libraries must be both published in the verified SDLC
// Catalog Git snapshot and pinned by the trusted extension. Never require()
// downloaded JS in the extension host, and never execute unverified assets.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execFileAsync=promisify(execFile);
const lock=require('./vendor-library-lock.json');
const MANIFEST='shared/libraries/webview/manifest.json';
const MAX_ASSETS=40, MAX_TOTAL=4*1024*1024;
const HASH=/^[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{40}$/;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=lock.assets;
function validName(name){
 if(typeof name!=='string'||!name||name.length>200||name.includes('\\')||name.startsWith('/')||name.split('/').some(x=>!x||x==='.'||x==='..'||!/^[a-z0-9._-]+$/i.test(x)))throw Error('Invalid webview library asset path.');
 return name;
}
function verifyManifest(source){
 if(!source||source.schema!==1||source.id!=='atgv-approved-webview-libraries'||source.version!==lock.version||!Array.isArray(source.assets)||source.assets.length!==files.length||files.length>MAX_ASSETS)throw Error('Unapproved webview library manifest or version.');
 const pins=new Map(files.map(x=>[x.path,x]));let total=0;
 for(const row of source.assets){
  const expected=pins.get(validName(row.path));
  if(!expected||row.bytes!==expected.bytes||row.sha256!==expected.sha256||!HASH.test(row.sha256))throw Error('Webview library is not approved by this extension: '+row.path);
  total+=row.bytes;pins.delete(row.path);
 }
 if(pins.size||total>MAX_TOTAL)throw Error('Missing or oversized webview library assets.');
 return source.assets;
}
async function noSymlinkFile(base,relative){
 const segments=validName(relative).split('/');let cur=base;
 for(const [index,segment] of segments.entries()){cur=path.join(cur,segment);const st=await fs.lstat(cur);if(st.isSymbolicLink())throw Error('Symlinked webview library path is forbidden: '+relative);if(index<segments.length-1&&!st.isDirectory())throw Error('Invalid webview library directory: '+relative);}
 const stat=await fs.lstat(cur);if(!stat.isFile())throw Error('Invalid webview library file: '+relative);
 return cur;
}
async function verifyFiles(root){
 for(const entry of files){const file=await noSymlinkFile(root,entry.path);const st=await fs.stat(file);if(st.size!==entry.bytes||hash(await fs.readFile(file))!==entry.sha256)throw Error('Webview library checksum mismatch: '+entry.path);}
 return {dir:root,version:lock.version};
}
// On Windows, Git may materialize text assets with CRLF even though the pinned
// Git blob in the approved commit uses LF. Read the immutable Git object bytes
// if the checkout copy disagrees. The content still has to pass the extension's
// length/SHA-256 lock; never trust a modified checkout or Git attributes.
async function verifiedGitBlob({catalogRoot,commit,relative,expected}){
 if(!SHA.test(String(commit||''))||!expected||expected.path!==relative)throw Error('Invalid pinned Git blob lookup.');
 const object=commit+':shared/libraries/webview/assets/'+validName(relative);
 const candidates=require('./github-sdlc-catalog').catalogGitExecutables(process.env);
 for(const exe of candidates){
  try{
   const {stdout}=await execFileAsync(exe,['-C',catalogRoot,'cat-file','blob',object],{
    encoding:'buffer',maxBuffer:Math.max(expected.bytes+4096,1024*1024),timeout:15000,
    windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}
   });
   if(Buffer.isBuffer(stdout)&&stdout.length===expected.bytes&&hash(stdout)===expected.sha256)return stdout;
   break; // Git returned bytes but they do not match the approved lock.
  }catch(e){
   if(!['ENOENT','ENOTDIR'].includes(e.code)||e.stderr)break;
  }
 }
 throw Error('Unverified downloaded library: '+relative+'. The pinned Git blob also failed verification.');
}
function cacheBase(storageRoot){if(!storageRoot||!path.isAbsolute(storageRoot))throw Error('Invalid VS Code global storage path.');return path.join(storageRoot,'verified-webview-libraries');}
async function cached({storageRoot}){
 try{
  const base=cacheBase(storageRoot),active=JSON.parse(await fs.readFile(path.join(base,'current.json'),'utf8'));
  if(!SHA.test(active.commit)||active.version!==lock.version||active.source!=='git')return null;
  const dir=path.join(base,active.commit);
  const st=await fs.lstat(dir);if(!st.isDirectory()||st.isSymbolicLink())return null;
  return {...await verifyFiles(dir),commit:active.commit,source:active.source||'git',fromCache:true};
 }catch{return null;}
}
async function installVerified({catalogRoot,storageRoot,commit}){
 if(!SHA.test(String(commit||'')))
  throw Error('A verified Git commit is required for webview assets.');
 const manifestPath=path.join(catalogRoot,...MANIFEST.split('/'));
 let manifest;
 try{manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));}
 catch(e){throw Error('The GitHub catalog does not yet publish approved webview libraries. Publish shared/libraries/webview and sync again.');}
 verifyManifest(manifest);
 const base=cacheBase(storageRoot),dir=path.join(base,commit);
 await fs.mkdir(base,{recursive:true});
 try{await verifyFiles(dir);}catch{
  // Never overwrite or delete an unverified existing directory.
  const existing=await fs.lstat(dir).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(existing){
   // An interrupted install or a corrupt prior cache must not block recovery.
   // Preserve the previous bytes for inspection; never execute them.
   const quarantine=path.join(base,'.invalid-'+commit+'-'+crypto.randomUUID());
   await fs.rename(dir,quarantine).catch(error=>{throw Error('Unverified webview cache could not be quarantined: '+error.message);});
  }
  const stage=path.join(base,'.stage-'+crypto.randomUUID());
  await fs.mkdir(stage,{recursive:false});
  try{
   const source=path.join(catalogRoot,'shared','libraries','webview','assets');
   for(const item of files){
    const from=await noSymlinkFile(source,item.path);let raw=await fs.readFile(from);
    if(raw.length!==item.bytes||hash(raw)!==item.sha256){
     // Git may materialize CRLF files; recover only from an immutable pinned blob.
     raw=await verifiedGitBlob({catalogRoot,commit,relative:item.path,expected:item});
    }
    const target=path.join(stage,...item.path.split('/'));
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,raw,{flag:'wx'});
   }
   await verifyFiles(stage);
   await fs.rename(stage,dir);
  }finally{await fs.rm(stage,{force:true,recursive:true}).catch(()=>{});}
 }
 const current=path.join(base,'current.json'),tmp=path.join(base,'.current-'+crypto.randomUUID());
 await fs.writeFile(tmp,JSON.stringify({commit,version:lock.version,source:'git'})+'\n',{flag:'wx'});
 try{await fs.rename(tmp,current);}catch(e){
  if(!['EPERM','EEXIST','EACCES'].includes(e.code))throw e;
  // Windows can reject replacement of an existing current.json. Rename its
  // existing entry aside, then restore it if promotion fails.
  const st=await fs.lstat(current).catch(err=>err.code==='ENOENT'?null:Promise.reject(err));
  if(st?.isSymbolicLink()||(st&&!st.isFile()))throw Error('Unsafe webview library cache marker.');
  const backup=current+'.previous-'+crypto.randomUUID();
  if(st)await fs.rename(current,backup);
  try{await fs.rename(tmp,current);if(st)await fs.rm(backup,{force:true});}
  catch(error){if(st)await fs.rename(backup,current).catch(()=>{});throw error;}
 }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
 return {dir,version:lock.version,commit,source:'git',fromCache:false};
}
async function install(args){
 if(!SHA.test(String(args?.commit||'')))throw Error('A verified 40-character GitHub commit is required for webview library download.');
 return installVerified(args);
}
module.exports={MANIFEST,files,verifyManifest,verifyFiles,verifiedGitBlob,install,cached};
