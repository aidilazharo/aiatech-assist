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
const ps=String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=[IO.Path]::GetFullPath($env:ATGV_BUNDLE_STAGE)
$prefix=$root.TrimEnd('\')+'\'
$zip=[IO.Compression.ZipFile]::OpenRead($env:ATGV_BUNDLE_ZIP)
$seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$total=[long]0
try {
 if($zip.Entries.Count -gt 250000){throw 'Too many archive entries'}
 foreach($entry in $zip.Entries){
  $name=$entry.FullName.Replace('\','/')
  $isDir=$name.EndsWith('/')
  $name=$name.TrimEnd('/')
  if($name -ne 'node_modules' -and !$name.StartsWith('node_modules/')){throw 'Unexpected archive path'}
  foreach($segment in $name.Split('/')){
   if(!$segment -or $segment -eq '.' -or $segment -eq '..' -or $segment -match '[<>:"|?*\x00-\x1f]' -or $segment.EndsWith('.') -or $segment.EndsWith(' ') -or $segment -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)'){throw 'Unsafe archive path'}
  }
  if(!$seen.Add($name)){throw 'Duplicate archive path'}
  $dest=[IO.Path]::GetFullPath([IO.Path]::Combine($root,$name.Replace('/','\')))
  if(!$dest.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive escapes staging folder'}
  if($isDir){[IO.Directory]::CreateDirectory($dest)|Out-Null;continue}
  $total+=$entry.Length
  if($total -gt 4294967296){throw 'Archive expansion exceeds limit'}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null
  $input=$entry.Open()
  try {
   $output=[IO.File]::Open($dest,[IO.FileMode]::CreateNew)
   try {$input.CopyTo($output)} finally {$output.Dispose()}
  } finally {$input.Dispose()}
 }
} finally {$zip.Dispose()}
`;
async function regular(file){
 const st=await fs.lstat(file);
 if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe bundle file: '+path.basename(file));
 return st;
}
async function readJson(file){await regular(file);return JSON.parse(await fs.readFile(file,'utf8'));}
async function restore(cwd,dir,entry,app,policy,{runner,onProgress,signal}){
 const node=nodeExecutable();
 const probe=await runner(node,['-p','process.platform+" "+process.arch+" "+process.versions.node'],{cwd,signal,windowsHide:true,timeout:10000});
 if(!new RegExp('^win32 x64 '+policy.nodeMajor+'\\.').test(String(probe.stdout||'').trim()))throw Error('ATGV Windows bundle requires Windows x64 Node.js '+policy.nodeMajor+' on PATH.');
 if(!entry||!hex(entry.archiveSha256)||!Array.isArray(entry.chunks)||entry.chunks.length<1||entry.chunks.length>64)throw Error('Windows dependency bundle missing or invalid for '+app+'. Pull a published bundle from main.');
 if(entry.packageSha256!==await fingerprint(path.join(cwd,'package.json'))||entry.lockSha256!==await fingerprint(path.join(cwd,'package-lock.json')))throw Error('Windows bundle does not match '+app+' manifests. Pull an updated bundle; npm installation is disabled.');
 const nm=path.join(cwd,'node_modules'),marker=path.join(nm,'.atgv-bundle.json');
 const previous=await fs.lstat(nm).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(previous&&(!previous.isDirectory()||previous.isSymbolicLink()))throw Error('Unsafe existing node_modules folder.');
 if(previous){
  const old=await readJson(marker).catch(()=>null);
  if(old?.archiveSha256===entry.archiveSha256&&old?.nodeMajor===policy.nodeMajor)return {node,restored:false};
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
  await runner('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{cwd,windowsHide:true,timeout:600000,signal,maxBuffer:1024*1024,env:{...process.env,ATGV_BUNDLE_STAGE:extracted,ATGV_BUNDLE_ZIP:archive}});
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
async function prepare(root,cwd,{runner=execute,onProgress=async()=>{},signal,platform=process.platform,arch=process.arch}={}){
 if(platform!=='win32'||arch!=='x64')return null;
 const base=await fs.realpath(root),dir=path.join(base,'vendor','windows-x64'),policyFile=path.join(dir,'bundle-policy.json');
 const exists=await fs.lstat(policyFile).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!exists)return null;
 if(await fs.realpath(dir)!==dir)throw Error('Unsafe Windows bundle directory.');
 const policy=await readJson(policyFile);
 if(policy.schema!==1||policy.platform!=='win32'||policy.arch!=='x64'||policy.required!==true||policy.nodeMajor!==24||!Array.isArray(policy.applications))throw Error('Invalid required Windows dependency bundle policy.');
 const app=path.relative(base,cwd).split(path.sep).join('/');
 if(!policy.applications.includes(app))return null;
 if(!/^[a-zA-Z0-9_-]+$/.test(app))throw Error('Unsupported bundled application path.');
 const manifest=await readJson(path.join(dir,'manifest.json')).catch(e=>{throw Error('Windows dependency bundle not published. Pull main after bundle publication; npm installation is disabled. '+e.message);});
 if(manifest.schema!==1||manifest.platform!==policy.platform||manifest.arch!==policy.arch||manifest.nodeMajor!==policy.nodeMajor)throw Error('Windows dependency bundle platform mismatch.');
 if(pending.has(cwd))return pending.get(cwd);
 const job=restore(cwd,dir,manifest.applications?.[app],app,policy,{runner,onProgress,signal});
 pending.set(cwd,job);
 try{return await job;}finally{pending.delete(cwd);}
}
module.exports={prepare,fingerprint};
