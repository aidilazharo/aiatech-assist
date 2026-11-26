'use strict';
// Restore only the explicitly opted-in, lockfile-bound Windows dependency bundle.
// No network, npm installation, manifest changes, or global PATH changes.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {nodeExecutable}=require('./platform-process');
const execute=promisify(execFile);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fingerprint=async file=>hash(JSON.stringify(JSON.parse(await fs.readFile(file,'utf8'))));
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const pending=new Map();
// Windows 11 ships libarchive tar.exe, also used by the bundle producer.
// Never extract before validating names, types, sizes and duplicate paths.
function validateTarListings(namesOutput,detailsOutput){
 const lines=value=>String(value||'').split(/\r?\n/).filter(Boolean);
 const names=lines(namesOutput),details=lines(detailsOutput);
 if(!names.length||names.length>250000||names.length!==details.length)throw Error('Invalid dependency archive entry count.');
 const seen=new Set();let total=0;
 for(let i=0;i<names.length;i++){
  const name=names[i],key=name.endsWith('/')?name.slice(0,-1):name;
  if(key!=='node_modules'&&!key.startsWith('node_modules/'))throw Error('Unexpected dependency archive path.');
  for(const segment of key.split('/')){
   if(!segment||segment==='.'||segment==='..'||/[\\<>:"|?*\x00-\x1f]/.test(segment)||/[. ]$/.test(segment)||/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)(\.|$)/i.test(segment))throw Error('Unsafe dependency archive path.');
  }
  const folded=key.toLowerCase();if(seen.has(folded))throw Error('Duplicate dependency archive path.');seen.add(folded);
  const detail=details[i],suffix=' '+name;
  if(!detail.endsWith(suffix))throw Error('Dependency archive listings disagree.');
  const meta=detail.slice(0,-suffix.length);
  const match=/^([d-])\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+/.exec(meta);
  if(!match)throw Error('Unsupported dependency archive entry type or metadata.');
  const bytes=Number(match[2]);
  if(!Number.isSafeInteger(bytes)||bytes<0||key==='node_modules'&&match[1]!=='d'||name.endsWith('/')&&match[1]!=='d')throw Error('Invalid dependency archive entry.');
  total+=bytes;if(total>4294967296)throw Error('Dependency archive expansion exceeds limit.');
 }
}
async function regular(file){
 const st=await fs.lstat(file);
 if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe bundle file: '+path.basename(file));
 return st;
}
async function readJson(file){await regular(file);return JSON.parse(await fs.readFile(file,'utf8'));}
async function restore(cwd,dir,entry,app,policy,{runner,onProgress,signal,force,checkExisting}){
 const node=nodeExecutable();
 const probe=await runner(node,['-p','process.platform+" "+process.arch+" "+process.versions.node'],{cwd,signal,windowsHide:true,timeout:10000});
 if(!new RegExp('^win32 x64 '+policy.nodeMajor+'\\.').test(String(probe.stdout||'').trim()))throw Error('ATGV Windows bundle requires Windows x64 Node.js '+policy.nodeMajor+' on PATH.');
 if(!entry||!hex(entry.archiveSha256)||!Array.isArray(entry.chunks)||entry.chunks.length<1||entry.chunks.length>64)throw Error('Windows dependency bundle missing or invalid for '+app+'. Pull a published bundle from main.');
 if(entry.packageSha256!==await fingerprint(path.join(cwd,'package.json'))||entry.lockSha256!==await fingerprint(path.join(cwd,'package-lock.json')))throw Error('Windows bundle does not match '+app+' manifests. Pull an updated bundle; npm installation is disabled.');
 const nm=path.join(cwd,'node_modules'),marker=path.join(nm,'.atgv-bundle.json');
 const previous=await fs.lstat(nm).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(previous&&(!previous.isDirectory()||previous.isSymbolicLink()))throw Error('Unsafe existing node_modules folder.');
 if(previous&&!force){
  // A manually restored tree can be reused after dependency/runtime checks.
  // This is a health check, not a claim that the installed bytes match the archive.
  if(checkExisting){if(await checkExisting(node))return {node,restored:false};}
  else{
   const old=await readJson(marker).catch(()=>null);
   if(old?.archiveSha256===entry.archiveSha256&&old?.nodeMajor===policy.nodeMajor)return {node,restored:false};
  }
 }
 await onProgress('Restoring verified Windows dependencies for '+app+' (no npm install)…');
 const stage=await fs.mkdtemp(path.join(cwd,'.atgv-deps-'));
 const archive=path.join(stage,'bundle.zip');
 let preserveStage=false;
 try{
  const digest=crypto.createHash('sha256'),output=await fs.open(archive,'wx');
  try{
   for(let i=0;i<entry.chunks.length;i++){
    if(signal?.aborted)throw Error('Dependency restoration cancelled.');
    const chunk=entry.chunks[i],expected=app+'.'+String(i+1).padStart(3,'0')+'.zip.part';
    if(chunk.file!==expected||!hex(chunk.sha256)||!Number.isSafeInteger(chunk.bytes)||chunk.bytes<1||chunk.bytes>32*1024*1024)throw Error('Invalid bundle chunk metadata.');
    const file=path.join(dir,expected),st=await regular(file);
    if(st.size!==chunk.bytes)throw Error('Bundle chunk size mismatch: '+expected);
    const data=await fs.readFile(file);
    if(hash(data)!==chunk.sha256)throw Error('Bundle chunk checksum mismatch: '+expected);
    digest.update(data);await output.writeFile(data);
   }
  }finally{await output.close();}
  if(digest.digest('hex')!==entry.archiveSha256)throw Error('Windows dependency archive checksum mismatch.');
  const extracted=path.join(stage,'extract');await fs.mkdir(extracted);
  const tarOptions={cwd,windowsHide:true,timeout:600000,signal,maxBuffer:64*1024*1024};
  const names=await runner('tar.exe',['-tf',archive],tarOptions);
  const details=await runner('tar.exe',['-tvf',archive],tarOptions);
  validateTarListings(names.stdout,details.stdout);
  await runner('tar.exe',['-xf',archive,'-C',extracted],tarOptions);
  const source=path.join(extracted,'node_modules');
  if(!(await fs.lstat(source)).isDirectory())throw Error('Bundle did not contain node_modules.');
  await fs.writeFile(path.join(source,'.atgv-bundle.json'),JSON.stringify({archiveSha256:entry.archiveSha256,nodeMajor:policy.nodeMajor}));
  const backup=path.join(stage,'previous');
  if(previous)await fs.rename(nm,backup);
  try{await fs.rename(source,nm);}catch(error){
   if(previous){try{await fs.rename(backup,nm);}catch{preserveStage=true;throw Error('Could not restore original node_modules. Preserved backup at '+backup);}}
   throw error;
  }
  return {node,restored:true};
 }finally{if(!preserveStage)await fs.rm(stage,{recursive:true,force:true});}
}
async function prepare(root,cwd,{runner=execute,onProgress=async()=>{},signal,platform=process.platform,arch=process.arch,force=false,checkExisting=null}={}){
 if(platform!=='win32'||arch!=='x64')return null;
 const base=await fs.realpath(root),dir=path.join(base,'vendor','windows-x64'),policyFile=path.join(dir,'bundle-policy.json');
 const exists=await fs.lstat(policyFile).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!exists){
  const entries=await fs.readdir(dir).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
  if(entries.some(n=>n==='manifest.json'||/\.zip\.part$/i.test(n)))throw Error('Windows offline archives found but bundle-policy.json is missing. Pull the complete configured repository; npm installation is disabled.');
  return null;
 }
 if(await fs.realpath(dir)!==dir)throw Error('Unsafe Windows bundle directory.');
 const policy=await readJson(policyFile);
 if(policy.schema!==1||policy.platform!=='win32'||policy.arch!=='x64'||policy.required!==true||policy.nodeMajor!==24||!Array.isArray(policy.applications))throw Error('Invalid required Windows dependency bundle policy.');
 const app=path.relative(base,cwd).split(path.sep).join('/');
 if(!policy.applications.includes(app))return null;
 if(!/^[a-zA-Z0-9_-]+$/.test(app))throw Error('Unsupported bundled application path.');
 const manifest=await readJson(path.join(dir,'manifest.json')).catch(e=>{throw Error('Windows dependency bundle not published. Pull main after bundle publication; npm installation is disabled. '+e.message);});
 if(manifest.schema!==1||manifest.platform!==policy.platform||manifest.arch!==policy.arch||manifest.nodeMajor!==policy.nodeMajor)throw Error('Windows dependency bundle platform mismatch.');
 if(pending.has(cwd))return pending.get(cwd);
 const job=restore(cwd,dir,manifest.applications?.[app],app,policy,{runner,onProgress,signal,force,checkExisting});
 pending.set(cwd,job);
 try{return await job;}finally{pending.delete(cwd);}
}
async function offlineEnv(root,cwd,{platform=process.platform,arch=process.arch}={}){
 if(platform!=='win32'||arch!=='x64')return {};
 const policyFile=path.join(root,'vendor','windows-x64','bundle-policy.json');
 const stat=await fs.lstat(policyFile).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return {};
 const policy=await readJson(policyFile),app=path.relative(root,cwd).split(path.sep).join('/');
 if(policy.schema!==1||policy.required!==true||policy.platform!=='win32'||policy.arch!=='x64'||!Array.isArray(policy.applications))throw Error('Invalid required Windows dependency bundle policy.');
 return policy.applications.includes(app)?{npm_config_offline:'true',NPM_CONFIG_OFFLINE:'true',npm_config_audit:'false',npm_config_fund:'false'}:{};
}
module.exports={prepare,fingerprint,offlineEnv,validateTarListings};
