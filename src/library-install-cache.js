'use strict';
// Disposable VS Code GLOBAL caches only. Never delete workspace .atgv checkouts,
// source evidence, project files, offline ZIP imports or secure credentials.
const fs=require('node:fs/promises');
const path=require('node:path');
const SIGNATURE_KEY='atgvAssist.cacheCleanedInstallationSignature';
const CACHE_DIRS=Object.freeze(['sdlc-catalog','verified-webview-libraries','updates']);
async function clearOnReinstall({storageRoot,signature,globalState}={}){
 if(!storageRoot||!path.isAbsolute(storageRoot))throw Error('Trusted absolute VS Code global storage path required.');
 if(typeof signature!=='string'||!signature.trim()||signature.length>1200)throw Error('Invalid extension installation fingerprint.');
 if(!globalState||typeof globalState.get!=='function'||typeof globalState.update!=='function')throw Error('Missing VS Code global state.');
 if(globalState.get(SIGNATURE_KEY,'')===signature)return {changed:false,removed:[]};
 const stat=await fs.lstat(storageRoot).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw Error('Unsafe VS Code global storage directory.');
 const candidates=[];
 if(stat)for(const name of CACHE_DIRS){
  const target=path.join(storageRoot,name);
  const found=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!found)continue;
  if(!found.isDirectory()||found.isSymbolicLink())throw Error('Unsafe cache folder '+name+'. No caches cleared.');
  candidates.push({name,target});
 }
 // Validate every target BEFORE deleting any cache; never follow symlinks.
 for(const item of candidates)await fs.rm(item.target,{recursive:true,force:false});
 await globalState.update(SIGNATURE_KEY,signature);
 await globalState.update('atgvAssist.updates.promptedLibrary',undefined);
 return {changed:true,removed:candidates.map(item=>item.name)};
}
module.exports={clearOnReinstall,CACHE_DIRS,SIGNATURE_KEY};
