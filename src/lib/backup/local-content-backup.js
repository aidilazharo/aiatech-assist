'use strict';
// Local-only workspace backup. Never read VS Code SecretStorage/globalState or
// contact remote services. Files inside project repositories may themselves
// contain credentials; the UI explicitly warns users to protect the archive.
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {Transform,Writable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const MAGIC=Buffer.from('ATGVBK01');
const TAIL=Buffer.from('ATGVEND1');
const MAX_MANIFEST=64*1024*1024;
const MAX_ENTRIES=200000;
const MAX_FILE=20*1024*1024*1024;
const MAX_TOTAL=100*1024*1024*1024;
const forbiddenState=/token|password|secret|credential|api.?key|oauth|authorization/i;
const ephemeralState=/startAfterWindowReload|restartAfterWindowReload|pendingStartAfterReload/i;
function safeStateKey(key){return typeof key==='string'&&key.startsWith('atgvAssist.')&&!forbiddenState.test(key)&&!ephemeralState.test(key);}
function snapshotState(state){
 const out={};
 for(const key of typeof state?.keys==='function'?state.keys():[]){
  if(!safeStateKey(key))continue;
  const value=state.get(key);
  try{const json=JSON.stringify(value);if(json!==undefined&&Buffer.byteLength(json)<1_000_000)out[key]=JSON.parse(json);}catch{}
 }
 return out;
}
function validateRelative(value){
 if(typeof value!=='string'||!value||value.length>4096||value.includes('\\')||value.includes('\0')||value.startsWith('/')||/^[a-zA-Z]:/.test(value))throw Error('Invalid backup entry path.');
 const parts=value.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||p.includes(':')))throw Error('Unsafe backup entry path.');
 if(!(['workspace','.atgv'].includes(parts[0])||parts[0]==='cache'))throw Error('Unsupported backup entry prefix.');
 const allowed=value==='workspace/projects'||value.startsWith('workspace/projects/')||value==='workspace/.atgv'||value.startsWith('workspace/.atgv/')||value==='cache/projects'||value.startsWith('cache/projects/');
 if(!allowed)throw Error('Backup attempts to access a non-ATGV location.');
 return value;
}
function rootSpecs(workspace,storageRoot,workspaceHash){
 if(!/^[0-9a-f]{16}$/.test(workspaceHash))throw Error('Invalid ATGV workspace cache identity.');
 return [
  {name:'workspace/projects',target:path.join(workspace,'projects')},
  {name:'workspace/.atgv',target:path.join(workspace,'.atgv')},
  {name:'cache/projects',target:path.join(storageRoot,'projects',workspaceHash)}
 ];
}
function protectedTarget(target,roots){
 const resolved=path.resolve(target);
 for(const root of roots){const base=path.resolve(root.target);if(resolved===base||resolved.startsWith(base+path.sep))throw Error('Save the backup outside the ATGV-managed project and cache folders.');}
}
async function inspectRoot(root){
 const stat=await fs.lstat(root).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return false;
 if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Refusing to access a non-directory or symbolic-link ATGV root: '+root);
 return true;
}
async function collect(roots){
 const entries=[],present=[];
 async function visit(full,rel,rootBase){
  if(entries.length>=MAX_ENTRIES)throw Error('Too many files for a single backup.');
  const st=await fs.lstat(full);
  if(!st.isDirectory()&&!st.isFile()&&!st.isSymbolicLink())throw Error('Backup cannot safely include special filesystem entry: '+rel);
  const kind=st.isDirectory()?'directory':st.isSymbolicLink()?'symlink':'file';
  let linkTarget;
  if(kind==='symlink'){
   linkTarget=await fs.readlink(full);
   const resolved=path.resolve(path.dirname(full),linkTarget);
   if(path.isAbsolute(linkTarget)||/^[a-zA-Z]:/.test(linkTarget)||!(resolved===rootBase||resolved.startsWith(rootBase+path.sep)))
    throw Error('Refusing to back up a symbolic link pointing outside its ATGV root: '+rel);
  }
  if(kind==='file'&&st.size>MAX_FILE)throw Error('File exceeds the backup file-size limit: '+rel);
  entries.push({path:validateRelative(rel),kind,size:kind==='file'?st.size:0,mode:st.mode&0o777,mtimeMs:Math.round(st.mtimeMs),...(linkTarget?{linkTarget}:{}),source:full});
  if(kind==='directory')for(const name of (await fs.readdir(full)).sort())await visit(path.join(full,name),rel+'/'+name,rootBase);
 }
 for(const root of roots)if(await inspectRoot(root.target)){present.push(root.name);await visit(root.target,root.name,path.resolve(root.target));}
 if(!present.length)throw Error('No local ATGV content was found in this workspace.');
 return {entries,present};
}
async function writeAll(handle,data,position){let done=0;while(done<data.length){const {bytesWritten}=await handle.write(data,done,data.length-done,position+done);if(!bytesWritten)throw Error('Backup write failed.');done+=bytesWritten;}return done;}
function sha256(){return crypto.createHash('sha256');}
async function createBackup({workspace,storageRoot,workspaceHash,workspaceState,extensionVersion,destination}){
 const roots=rootSpecs(workspace,storageRoot,workspaceHash);
 protectedTarget(destination,roots);
 const {entries,present}=await collect(roots);
 const tmp=destination+'.atgv-writing-'+crypto.randomBytes(6).toString('hex');
 let handle,pos=0,total=0;
 try{
  handle=await fs.open(tmp,'wx',0o600);
  await writeAll(handle,MAGIC,pos);pos+=MAGIC.length;
  for(const entry of entries){
   if(entry.kind!=='file'){delete entry.source;continue;}
   const st=await fs.lstat(entry.source);
   if(!st.isFile()||st.isSymbolicLink())throw Error('File changed during backup: '+entry.path);
   const digest=sha256();let size=0,compressed=0;
   entry.offset=pos;
   const reader=fsSync.createReadStream(entry.source);
   const hashStream=new Transform({transform(chunk,_enc,cb){size+=chunk.length;digest.update(chunk);cb(null,chunk);}});
   const sink=new Writable({write(chunk,_enc,cb){writeAll(handle,chunk,pos).then(()=>{pos+=chunk.length;compressed+=chunk.length;cb();},cb);}});
   await pipeline(reader,hashStream,zlib.createGzip({level:zlib.constants.Z_BEST_SPEED}),sink);
   const after=await fs.lstat(entry.source);
   if(size!==entry.size||after.size!==entry.size||Math.round(after.mtimeMs)!==entry.mtimeMs)throw Error('File was modified while creating the backup: '+entry.path);
   entry.sha256=digest.digest('hex');entry.compressedSize=compressed;total+=size;
   if(total>MAX_TOTAL)throw Error('Workspace content exceeds the backup size limit.');
   delete entry.source;
  }
  const manifest={format:'atgv-local-backup',schema:1,createdAt:new Date().toISOString(),extensionVersion:String(extensionVersion||''),workspacePath:path.resolve(workspace),workspaceHash,roots:present,entries,workspaceState:snapshotState(workspaceState),fileCount:entries.filter(e=>e.kind==='file').length,totalBytes:total};
  const data=Buffer.from(JSON.stringify(manifest));if(data.length>MAX_MANIFEST)throw Error('Backup metadata too large.');
  const metaOffset=pos;
  await writeAll(handle,data,pos);pos+=data.length;
  const footer=Buffer.alloc(24);TAIL.copy(footer,0);footer.writeBigUInt64LE(BigInt(metaOffset),8);footer.writeBigUInt64LE(BigInt(data.length),16);
  await writeAll(handle,footer,pos);pos+=footer.length;
  await handle.sync();await handle.close();handle=null;
  // Never silently overwrite an existing backup. Atomic rename fails on Windows
  // when destination exists, so the selected file must be new.
  if(await fs.stat(destination).then(()=>true).catch(e=>e.code==='ENOENT'?false:Promise.reject(e)))throw Error('Backup file already exists; choose a different name.');
  await fs.rename(tmp,destination);
  return {destination,fileCount:manifest.fileCount,totalBytes:total,createdAt:manifest.createdAt};
 }catch(error){if(handle)await handle.close().catch(()=>{});await fs.rm(tmp,{force:true}).catch(()=>{});throw error;}
}
async function readExactly(fd,size,offset){const b=Buffer.alloc(size);let pos=0;while(pos<size){const {bytesRead}=await fd.read(b,pos,size-pos,offset+pos);if(!bytesRead)throw Error('Backup archive is truncated.');pos+=bytesRead;}return b;}
async function inspectBackup({source,workspace,workspaceHash}){
 const fd=await fs.open(source,'r');
 try{
  const st=await fd.stat();if(st.size<32)throw Error('Not an ATGV backup file.');
  if(!(await readExactly(fd,8,0)).equals(MAGIC))throw Error('Invalid ATGV backup header.');
  const trailer=await readExactly(fd,24,st.size-24);
  if(!trailer.subarray(0,8).equals(TAIL))throw Error('Invalid ATGV backup trailer.');
  const offset=Number(trailer.readBigUInt64LE(8)),length=Number(trailer.readBigUInt64LE(16));
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||length<2||length>MAX_MANIFEST||offset<8||offset+length!==st.size-24)throw Error('Backup metadata bounds are invalid.');
  let m;try{m=JSON.parse((await readExactly(fd,length,offset)).toString('utf8'));}catch{throw Error('ATGV backup manifest is invalid.');}
  if(m.format!=='atgv-local-backup'||m.schema!==1||!Array.isArray(m.entries)||m.entries.length>MAX_ENTRIES||!Array.isArray(m.roots))throw Error('Unsupported ATGV backup format.');
  if(path.resolve(m.workspacePath)!==path.resolve(workspace)||m.workspaceHash!==workspaceHash)throw Error('This backup belongs to another workspace. Open the original workspace to restore its local content.');
  const allowedRoots=new Set(['workspace/projects','workspace/.atgv','cache/projects']);
  if(m.roots.length<1||new Set(m.roots).size!==m.roots.length||m.roots.some(r=>!allowedRoots.has(r)))throw Error('Invalid backup root manifest.');
  const names=new Set();let pos=8,total=0,count=0;
  for(const entry of m.entries){
   const rel=validateRelative(entry.path);
   if(names.has(rel))throw Error('Duplicate backup path: '+rel);names.add(rel);
   if(!m.roots.some(r=>rel===r||rel.startsWith(r+'/')))throw Error('Entry outside declared backup roots.');
   if(!['file','directory','symlink'].includes(entry.kind))throw Error('Unsupported backup entry kind.');
   if(entry.kind==='symlink'){
    if(typeof entry.linkTarget!=='string'||!entry.linkTarget||path.isAbsolute(entry.linkTarget)||/^[a-zA-Z]:/.test(entry.linkTarget))throw Error('Unsafe backup symbolic link.');
    const root=m.roots.find(r=>rel===r||rel.startsWith(r+'/'));
    const resolved=path.posix.resolve(path.posix.dirname('/'+rel),entry.linkTarget.replace(/\\/g,'/'));
    if(!(resolved==='/'+root||resolved.startsWith('/'+root+'/')))throw Error('Backup symbolic link escapes ATGV root.');
   }
   if(entry.kind==='file'){
    if(!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>MAX_FILE||!Number.isSafeInteger(entry.compressedSize)||entry.compressedSize<1||!Number.isSafeInteger(entry.offset)||entry.offset!==pos||!/^[0-9a-f]{64}$/.test(entry.sha256||''))throw Error('Invalid entry metadata: '+rel);
    pos+=entry.compressedSize;total+=entry.size;count++;
    if(pos>offset||total>MAX_TOTAL)throw Error('Backup data exceeds validated bounds.');
   }
  }
  if(pos!==offset||count!==m.fileCount||total!==m.totalBytes)throw Error('Backup manifest totals do not match the file data.');
  if(!m.workspaceState||typeof m.workspaceState!=='object'||Array.isArray(m.workspaceState))throw Error('Invalid workspace state in backup.');
  for(const key of Object.keys(m.workspaceState))if(!safeStateKey(key))throw Error('Backup contains a forbidden workspace state key.');
  return {manifest:m,source};
 }finally{await fd.close();}
}
async function extractFile(source,entry,target){
 await fs.mkdir(path.dirname(target),{recursive:true});
 const hasher=sha256();let written=0;
 const checker=new Transform({transform(chunk,_enc,cb){written+=chunk.length;if(written>entry.size)return cb(Error('Backup file exceeds declared size: '+entry.path));hasher.update(chunk);cb(null,chunk);}});
 await pipeline(fsSync.createReadStream(source,{start:entry.offset,end:entry.offset+entry.compressedSize-1}),zlib.createGunzip(),checker,fsSync.createWriteStream(target,{flags:'wx',mode:0o600}));
 if(written!==entry.size||hasher.digest('hex')!==entry.sha256)throw Error('Backup checksum verification failed: '+entry.path);
 await fs.chmod(target,entry.mode&0o777).catch(()=>{});
}
async function restoreBackup({source,workspace,storageRoot,workspaceHash,workspaceState,confirm}){
 const {manifest}=await inspectBackup({source,workspace,workspaceHash});
 const roots=rootSpecs(workspace,storageRoot,workspaceHash);
 const byName=new Map(roots.map(r=>[r.name,r]));
 const wStage=await fs.mkdtemp(path.join(workspace,'.atgv-restore-stage-'));
 const cacheParent=path.join(storageRoot,'projects');await fs.mkdir(cacheParent,{recursive:true});
 const cStage=await fs.mkdtemp(path.join(cacheParent,'.atgv-restore-stage-'));
 const tempMap={'workspace/projects':path.join(wStage,'projects'),'workspace/.atgv':path.join(wStage,'.atgv'),'cache/projects':path.join(cStage,'cache')};
 const previous=[];let committed=false;
 try{
  // Stage and validate all data before asking to replace anything.
  for(const root of manifest.roots)await fs.mkdir(tempMap[root],{recursive:true});
  for(const entry of manifest.entries){
   const root=manifest.roots.find(r=>entry.path===r||entry.path.startsWith(r+'/'));
   const rel=entry.path===root?'':entry.path.slice(root.length+1);
   const target=path.join(tempMap[root],...rel.split('/').filter(Boolean));
   if(entry.kind==='directory')await fs.mkdir(target,{recursive:true});
   else if(entry.kind==='file')await extractFile(source,entry,target);
  }
  for(const entry of manifest.entries.filter(e=>e.kind==='symlink')){
   const root=manifest.roots.find(r=>entry.path===r||entry.path.startsWith(r+'/'));
   const rel=entry.path.slice(root.length+1);
   const target=path.join(tempMap[root],...rel.split('/'));
   await fs.mkdir(path.dirname(target),{recursive:true});
   await fs.symlink(entry.linkTarget,target);
  }
  for(const entry of manifest.entries.filter(e=>e.kind==='directory').reverse()){
   const root=manifest.roots.find(r=>entry.path===r||entry.path.startsWith(r+'/'));
   const rel=entry.path===root?'':entry.path.slice(root.length+1);
   await fs.chmod(path.join(tempMap[root],...rel.split('/').filter(Boolean)),entry.mode&0o777).catch(()=>{});
  }
  if(manifest.roots.includes('workspace/.atgv')){
   let marker;
   try{marker=JSON.parse(await fs.readFile(path.join(tempMap['workspace/.atgv'],'atgv.workspace.json'),'utf8'));}catch{throw Error('Backup .atgv workspace ownership marker is missing or invalid.');}
   if(marker.managedBy!=='aia-my.atgv-aiatech-assist')throw Error('Backup .atgv directory is not ATGV-managed.');
  }
  if(confirm){const allowed=await confirm(manifest);if(!allowed)return {cancelled:true};}
  // Nothing from a remote Jira, Confluence or Git provider is touched.
  for(const root of roots){
   await fs.mkdir(path.dirname(root.target),{recursive:true});
   const exists=await inspectRoot(root.target);
   const old=root.target+'.atgv-pre-restore-'+crypto.randomBytes(6).toString('hex');
   if(exists)await fs.rename(root.target,old);
   const staged=manifest.roots.includes(root.name)?tempMap[root.name]:null;
   try{if(staged)await fs.rename(staged,root.target);}catch(error){if(exists)await fs.rename(old,root.target).catch(()=>{});throw error;}
   previous.push({root,old,exists,replaced:!!staged});
  }
  // Restoring local UI selections only. Extension-wide configuration, secrets,
  // provider credentials, and cross-workspace global state are untouched.
  const oldState=snapshotState(workspaceState);
  try{
   if(workspaceState){
    for(const key of Object.keys(oldState))await workspaceState.update(key,undefined);
    for(const [key,value] of Object.entries(manifest.workspaceState))await workspaceState.update(key,value);
   }
  }catch(error){
   for(const key of Object.keys(manifest.workspaceState))await workspaceState.update(key,undefined).catch(()=>{});
   for(const [key,value] of Object.entries(oldState))await workspaceState.update(key,value).catch(()=>{});
   throw error;
  }
  committed=true;
  for(const {old,exists} of previous)if(exists)await fs.rm(old,{recursive:true,force:true}).catch(()=>{});
  return {fileCount:manifest.fileCount,totalBytes:manifest.totalBytes,createdAt:manifest.createdAt};
 }catch(error){
  if(!committed){
   const failures=[];
   for(const item of previous.reverse()){
    try{if(item.replaced)await fs.rm(item.root.target,{recursive:true,force:true});if(item.exists)await fs.rename(item.old,item.root.target);}catch(e){failures.push(item.old+': '+e.message);}
   }
   if(failures.length)throw Error('Restore failed and automatic rollback was incomplete. Preserved recovery folders: '+failures.join('; ')+'. Cause: '+error.message);
  }
  throw error;
 }finally{
  await fs.rm(wStage,{recursive:true,force:true}).catch(()=>{});
  await fs.rm(cStage,{recursive:true,force:true}).catch(()=>{});
 }
}
module.exports={createBackup,inspectBackup,restoreBackup,snapshotState,safeStateKey,validateRelative};
