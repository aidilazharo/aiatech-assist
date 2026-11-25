'use strict';
// Consume user-imported, platform-specific Library packs, never execute Library scripts.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {nodeExecutable}=require('./platform-process');
const exec=promisify(execFile);
const ids={react:'npm',angular:'npm',nestjs:'npm',dotnet:'dotnet','spring-boot':'maven'};
const files={react:['package.json','package-lock.json'],angular:['package.json','package-lock.json'],nestjs:['package.json','package-lock.json'],dotnet:['Api.csproj','tests/Atgv.Tests/Atgv.Tests.csproj'],'spring-boot':['pom.xml']};
async function json(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function locate(root,cwd,{platform=process.platform,arch=process.arch}={}){
 if(platform!=='win32'||arch!=='x64')return null;
 const marker=await json(path.join(root,'atgv.bootstrap.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(marker?.source!=='github-main-catalog'||marker?.stacks?.length!==1)return null;
 const id=marker.stacks[0],version=String(marker.catalogVersion||'');
 if(!Object.hasOwn(ids,id)||!/^\d+\.\d+\.\d+$/.test(version))return null;
 const [major,minor,patch]=version.split('.').map(Number);
 if(major===0&&minor===0&&patch<11)return null;
 if(path.resolve(cwd)!==path.resolve(root))return null;
 let base=process.env.ATGV_OFFLINE_LIBRARY||'';
 if(!base){
  const starts=[root];
  try{const {stdout}=await exec('git',['-C',root,'rev-parse','--path-format=absolute','--git-common-dir'],{windowsHide:true,timeout:10000});starts.push(path.dirname(stdout.trim()));}catch{}
  for(let start of starts){
   for(let i=0;i<15;i++){
    const candidate=path.join(start,'.atgv','offline','windows-x64');
    if(await fs.stat(candidate).then(x=>x.isDirectory(),()=>false)){base=candidate;break;}
    const parent=path.dirname(start);if(parent===start)break;start=parent;
   }
   if(base)break;
  }
 }
 if(!base)throw Error('Offline Library packages not imported. Import the Windows x64 package for '+id+'; online dependency installation is disabled.');
 const folder=path.resolve(base,id),manifest=await json(path.join(folder,'manifest.json')).catch(e=>{throw Error('Offline Library package missing for '+id+': '+e.message);});
 if(manifest.schema!==1||manifest.stack!==id||manifest.platform!=='win32'||manifest.arch!=='x64'||manifest.catalogVersion!==version||manifest.nodeMajor!==24)throw Error('Offline Library package version or platform mismatch for '+id+'. Import version '+version+'.');
 for(const file of files[id]){
  const actual=crypto.createHash('sha256').update((await fs.readFile(path.join(cwd,file),'utf8')).replace(/\r\n/g,'\n')).digest('hex');
  if(actual!==manifest.fingerprints?.[file])throw Error('Offline Library package does not match '+file+'. Online installation is disabled.');
 }
 return {id,kind:ids[id],folder,manifest};
}
async function restoreNpm(pack,cwd,{runner=exec,signal}={}){
 const node=nodeExecutable();
 const {stdout}=await runner(node,['-p','process.platform+" "+process.arch+" "+process.versions.node'],{cwd,windowsHide:true,timeout:10000,signal});
 if(!/^win32 x64 24\./.test(String(stdout).trim()))throw Error('Offline Library npm stacks require Windows x64 Node.js 24.');
 const source=path.join(pack.folder,'node_modules'),nm=path.join(cwd,'node_modules');
 const st=await fs.lstat(source);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Offline module tree missing or unsafe.');
 const previous=await fs.lstat(nm).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(previous&&(!previous.isDirectory()||previous.isSymbolicLink()))throw Error('Unsafe existing node_modules.');
 const tag=crypto.createHash('sha256').update(JSON.stringify(pack.manifest)).digest('hex');
 if(previous&&await fs.readFile(path.join(nm,'.atgv-library-bundle'),'utf8').catch(()=>null)===tag)return node;
 const stage=await fs.mkdtemp(path.join(cwd,'.atgv-offline-')),copy=path.join(stage,'node_modules'),backup=path.join(stage,'previous');
 let preserve=false;
 try{
  await fs.cp(source,copy,{recursive:true,errorOnExist:true,force:false});
  await fs.writeFile(path.join(copy,'.atgv-library-bundle'),tag);
  if(previous)await fs.rename(nm,backup);
  try{await fs.rename(copy,nm);}catch(e){if(previous){try{await fs.rename(backup,nm);}catch{preserve=true;throw Error('Original dependencies preserved at '+backup);}}throw e;}
 }finally{if(!preserve)await fs.rm(stage,{recursive:true,force:true});}
 return node;
}
function env(pack){
 if(!pack)return {};
 if(pack.kind==='npm')return {npm_config_offline:'true',NPM_CONFIG_OFFLINE:'true',npm_config_audit:'false',npm_config_fund:'false'};
 if(pack.kind==='dotnet')return {NUGET_PACKAGES:path.join(pack.folder,'nuget'),RestoreSources:path.join(pack.folder,'nuget'),NuGetAudit:'false'};
 const repo=path.join(pack.folder,'maven');
 if(/["%\r\n]/.test(repo))throw Error('Unsafe offline Maven repository path.');
 return {MAVEN_OPTS:(process.env.MAVEN_OPTS||'')+' -Dmaven.repo.local="'+repo+'"'};
}
module.exports={locate,restoreNpm,env};
