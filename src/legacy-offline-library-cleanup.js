'use strict';
// One-time retirement of the obsolete ATGV-managed ZIP snapshot. This is
// a narrow migration, not an offline ZIP import or activation API.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {compareVersions}=require('./library-semver');
const MAX_FILES=600,MAX_TOTAL_BYTES=24*1024*1024;
const SHA=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const location=workspace=>path.join(workspace,'.atgv','offline-sdlc-library');
async function retire(workspace,{verifiedGit=null}={}){
 if(!workspace||!path.isAbsolute(workspace))throw Error('Expected an absolute ATGV workspace path.');
 const target=location(workspace);
 const base=path.dirname(target);
 const parent=await fs.lstat(base).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!parent)return {removed:false,reason:'not-present'};
 if(!parent.isDirectory()||parent.isSymbolicLink())return {removed:false,reason:'unsafe-parent'};
 const root=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!root)return {removed:false,reason:'not-present'};
 if(!root.isDirectory()||root.isSymbolicLink())return {removed:false,reason:'unsafe-root'};
 if(!GIT_SHA.test(String(verifiedGit?.sha||''))||!verifiedGit?.version||!verifiedGit?.checkout)
  return {removed:false,reason:'verified-git-required'};
 const entries=(await fs.readdir(target)).sort();
 if(entries.join(',')!=='files,state.json')return {removed:false,reason:'unexpected-snapshot-entries'};
 const statePath=path.join(target,'state.json');
 const stat=await fs.lstat(statePath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)return {removed:false,reason:'unsafe-snapshot-state'};
 let state;
 try{state=JSON.parse(await fs.readFile(statePath,'utf8'));}catch{return {removed:false,reason:'invalid-snapshot-state'};}
 if(state?.schema!==1||state.source!=='zip'||!SHA.test(String(state.archiveHash||''))||
  !state.assets||typeof state.assets!=='object'||Array.isArray(state.assets)||
  Object.keys(state.assets).length>MAX_FILES)return {removed:false,reason:'invalid-snapshot-manifest'};
 const filesDir=path.join(target,'files');
 const folder=await fs.lstat(filesDir);
 if(!folder.isDirectory()||folder.isSymbolicLink())return {removed:false,reason:'unsafe-snapshot-files'};
 const expected=Object.keys(state.assets);
 let count=0,total=0;
 async function check(dir,prefix=''){
  for(const item of await fs.readdir(dir,{withFileTypes:true})){
   const relative=prefix+item.name;
   if(item.isSymbolicLink()||!/^[-a-zA-Z0-9_.\/]+$/.test(relative)||relative.split('/').some(s=>s==='..'||s==='.'))
    throw Error('Unsafe offline Library entry.');
   const full=path.join(dir,item.name);
   if(item.isDirectory()){await check(full,relative+'/');continue;}
   if(!item.isFile()||!Object.hasOwn(state.assets,relative)||!SHA.test(String(state.assets[relative])))
    throw Error('Offline Library contains unexpected files.');
   const stat=await fs.lstat(full);
   if(stat.isSymbolicLink()||stat.size>1024*1024||++count>MAX_FILES||(total+=stat.size)>MAX_TOTAL_BYTES)
    throw Error('Offline Library exceeds safe cleanup limits.');
   if(hash(await fs.readFile(full))!==state.assets[relative])throw Error('Offline Library contains modified files.');
  }
 }
 try{await check(filesDir);}catch{return {removed:false,reason:'modified-or-unsafe-files'};}
 if(count!==expected.length)return {removed:false,reason:'missing-snapshot-files'};
 const currentVersion=String(await fs.readFile(path.join(filesDir,'VERSION'),'utf8')).trim();
 const manifest=JSON.parse(await fs.readFile(path.join(filesDir,'catalog.json'),'utf8'));
 if(manifest?.version!==currentVersion)return {removed:false,reason:'invalid-snapshot-version'};
 if(compareVersions(verifiedGit.version,currentVersion)<0)return {removed:false,reason:'newer-zip-preserved'};
 // Neither workspace files nor the installed Git SDLC Catalog is touched.
 await fs.rm(target,{recursive:true,force:false});
 return {removed:true,reason:'retired-verified-legacy-snapshot'};
}
module.exports={retire,location};
