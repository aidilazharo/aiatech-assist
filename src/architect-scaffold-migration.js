'use strict';
// Verified catalog scaffold migration. Never rewrite main or a published
// bootstrap commit. Tracked legacy starters move to their own migration branch.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const skeleton=require('./project-skeleton');
const catalog=require('./github-sdlc-catalog');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=files=>hash(Object.keys(files).sort().map(name=>name+'\0'+hash(files[name])).join('\n'));
const toLF=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
const safeName=name=>typeof name==='string'&&name.length<=450&&!!name&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&!name.endsWith('/')&&!name.split('/').some(s=>!s||s==='.'||s==='..');
function validateInventory(meta){
 const names=meta?.generatedFiles;
 if(!Array.isArray(names)||!names.length||names.length>150||!names.includes('atgv.bootstrap.json'))throw Error('Legacy starter manifest has an invalid generatedFiles inventory. No files were changed.');
 if(names.some(name=>!safeName(name))||new Set(names).size!==names.length)throw Error('Legacy starter manifest has duplicate or unsafe generated-file paths. No files were changed.');
 return names;
}
async function git(root,...args){
 return (await exec('git',['-C',root,...args],{timeout:45000,maxBuffer:12*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}})).stdout;
}
async function safePath(root,relative,{mustExist=false}={}){
 if(!safeName(relative))throw Error('Unsafe starter path: '+relative);
 let current=root;
 for(const part of relative.split('/').slice(0,-1)){
  current=path.join(current,part);
  const s=await fs.lstat(current).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(s&&(!s.isDirectory()||s.isSymbolicLink()))throw Error('Unsafe starter directory: '+relative);
  if(!s&&!mustExist)break;
  if(!s)throw Error('Missing starter directory: '+relative);
 }
 const target=path.join(root,...relative.split('/'));
 const s=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(s&&(!s.isFile()||s.isSymbolicLink()))throw Error('Unsafe starter file: '+relative);
 if(mustExist&&!s)throw Error('Generated starter file is missing: '+relative+'. No files were changed.');
 return {target,exists:!!s};
}
async function tracked(root,name){
 const out=await git(root,'ls-files','--error-unmatch','--',name).then(()=>true,e=>{if(e.code===1)return false;throw e;});
 return out;
}
// Some company baselines supply README/.gitignore instead of generating them.
// In that case validate against the *historical* catalog, never the new bytes.
async function historicalTemplate(root,stack,version,expectedDigest){
 const workspace=await skeleton.workspaceFor(root),active=await catalog.activeRoot(workspace);
 if(!active.root || !/^[0-9a-f]{40}$/.test(String(active.sha||'')))return null;
 const file=path.join(active.root,'.git');
 if(!await fs.stat(file).then(()=>true,()=>false))return null;
 const revisions=(await git(active.root,'log','--all','-200','--format=%H','--','VERSION')).trim().split('\n').filter(Boolean);
 for(const revision of revisions){
  const oldVersion=await git(active.root,'show',revision+':VERSION').catch(()=>'');
  if(oldVersion.trim()!==version)continue;
  const prefix='tech-stacks/'+stack+'/scaffold/';
  const names=(await git(active.root,'ls-tree','-r','--name-only',revision,'--',prefix)).trim().split('\n').filter(Boolean);
  if(!names.length || names.length>150)continue;
  const originals={};
  for(const name of names){
   const relative=name.slice(prefix.length);
   if(!safeName(relative))throw Error('Historical catalog has an unsafe scaffold path.');
   originals[relative]=await gitBuffer(active.root,'show',revision+':'+name);
  }
  if(digest(originals)===expectedDigest)return {files:originals,commit:revision};
  // ATGV's known SQLite cleanup can have been applied at starter creation.
  const repaired={...originals};
  for(const [name,bytes] of Object.entries(repaired))repaired[name]=skeleton.repairSQLiteStarterTest?.(name,bytes)||bytes;
  if(digest(repaired)===expectedDigest)return {files:repaired,commit:revision};
 }
 return null;
}
async function gitBuffer(root,...args){
 const {stdout}=await exec('git',['-C',root,...args],{encoding:'buffer',timeout:45000,maxBuffer:2*1024*1024,windowsHide:true});
 return stdout;
}
function migrationBranch(stack,catalogVersion,commitSha){
 const version=String(catalogVersion||'unknown').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,26);
 const sha=String(commitSha||'').slice(0,8);
 return 'migration/'+stack+'-catalog-'+version+(sha?'-'+sha:'');
}
async function migrate({root,stackIds,onProgress=async()=>{}}){
 if(!Array.isArray(stackIds)||stackIds.length!==1||!['react','angular'].includes(stackIds[0]))return {migrated:false,reason:'unsupported-stack'};
 const marker=path.join(root,'atgv.bootstrap.json');
 const s=await fs.lstat(marker).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!s)return {migrated:false,reason:'no-manifest'};
 if(!s.isFile()||s.isSymbolicLink())throw Error('Unsafe ATGV starter manifest. No files were changed.');
 const originalManifest=await fs.readFile(marker);
 let meta;
 try{meta=JSON.parse(originalManifest.toString('utf8'));}catch{throw Error('Invalid ATGV starter manifest JSON. No files were changed.');}
 if(meta.schema!==1||meta.status!=='draft'||meta.source!=='github-main-catalog'||JSON.stringify(meta.stacks)!==JSON.stringify(stackIds))return {migrated:false,reason:'not-a-draft-catalog-starter'};
 const oldNames=validateInventory(meta),oldSet=new Set(oldNames);
 const currentFiles=await skeleton.skeletonFiles(stackIds,root);
 const preserved=new Set(['README.md','.gitignore','.env.example','.github/workflows/ci.yml']);
 const excluded=[];
 for(const name of Object.keys(currentFiles))if(!oldSet.has(name)&&preserved.has(name)&&(await safePath(root,name)).exists)excluded.push(name);
 const newNames=Object.keys(currentFiles).filter(name=>!excluded.includes(name)).sort();
 const newSet=new Set(newNames);
 const removed=oldNames.filter(name=>!newSet.has(name));
 const added=newNames.filter(name=>!oldSet.has(name));
 const expectedMeta=JSON.parse(currentFiles['atgv.bootstrap.json'].toString('utf8'));
 if(!removed.length&&!added.length&&meta.catalogVersion===expectedMeta.catalogVersion&&meta.templateDigest===expectedMeta.templateDigest)return {migrated:false,reason:'already-current'};
 if(!/^[a-f0-9]{64}$/i.test(meta.templateDigest||''))throw Error('Legacy starter has no valid templateDigest. Cannot verify original files; migration stopped without changes.');
 const originals=new Map(),oldTemplate={};
 for(const name of oldNames){
  const {target}=await safePath(root,name,{mustExist:true});
  const bytes=await fs.readFile(target);originals.set(name,bytes);
  if(name!=='atgv.bootstrap.json')oldTemplate[name]=bytes;
 }
 if(!originals.get('atgv.bootstrap.json').equals(originalManifest))throw Error('Starter manifest changed during migration preflight.');
 // Omitted company-managed files were part of the original complete digest.
 // Current catalog bytes may be included only if the resulting *entire* digest
 // equals the historical recorded SHA-256; never assume those bytes are old.
 const candidates=[oldTemplate];
 if(excluded.length){const complete={...oldTemplate};for(const name of excluded)complete[name]=currentFiles[name];candidates.push(complete);}
 const matching=candidates.find(files=>digest(files)===meta.templateDigest||digest(Object.fromEntries(Object.entries(files).map(([n,b])=>[n,toLF(b)])))===meta.templateDigest);
 const currentDigest=matching?digest(matching):digest(oldTemplate);
 const normalizedDigest=matching?digest(Object.fromEntries(Object.entries(matching).map(([n,b])=>[n,toLF(b)]))):digest(Object.fromEntries(Object.entries(oldTemplate).map(([n,b])=>[n,toLF(b)])));
 let provenance='working-files',historical=null;
 if(currentDigest!==meta.templateDigest&&normalizedDigest!==meta.templateDigest){
  historical=await historicalTemplate(root,stackIds[0],meta.catalogVersion,meta.templateDigest);
  if(!historical){
   const mismatched=Object.keys(oldTemplate).filter(n=>!currentFiles[n]||!toLF(oldTemplate[n]).equals(toLF(currentFiles[n])));
   throw Error('Legacy scaffold templateDigest cannot be verified from the recorded historical catalog. No files changed. Inspect '+mismatched.slice(0,8).join(', ')+'.');
  }
  provenance='historical-catalog-'+historical.commit;
  const modified=Object.keys(oldTemplate).filter(n=>historical.files[n]&&!toLF(oldTemplate[n]).equals(toLF(historical.files[n])));
  if(modified.length)throw Error('Legacy scaffold has genuine modifications: '+modified.slice(0,12).join(', ')+'. ATGV preserved every file.');
  for(const name of Object.keys(oldTemplate))if(!historical.files[name])throw Error('Historical catalog has no original for '+name+'. No files changed.');
 }else if(normalizedDigest===meta.templateDigest&&currentDigest!==meta.templateDigest)provenance='verified-CRLF-only';
 // Do not run migration against unrelated/staged/untracked user work.
 const status=(await git(root,'-c','status.renames=false','status','--porcelain','-z','--untracked-files=all')).split('\0').filter(Boolean);
 const trackedNames=[];
 for(const name of oldNames)if(await tracked(root,name))trackedNames.push(name);
 const trackedSet=new Set(trackedNames),fullyTracked=trackedNames.length===oldNames.length;
 if(trackedNames.length&&!fullyTracked)throw Error('Legacy starter contains a mixture of committed and uncommitted files. Complete the existing Git state first; nothing changed.');
 let branch='',sourceBranch='',baseCommit='',backupDir;
 if(fullyTracked){
  for(const row of status){
   const code=row.slice(0,2),name=row.slice(3);
   if(code!==' M'||!oldSet.has(name))throw Error('Committed starter has uncommitted, staged or unrelated changes ('+name+'). Save/stash them before migration. Nothing changed.');
   // Some Git-for-Windows configurations report a content-clean CRLF checkout
   // as modified. Accept ONLY when Git proves its index blob still matches.
   const cleanDiff=await git(root,'diff','--quiet','--',name).then(()=>true,e=>{if(e.code===1)return false;throw e;});
   const head=await gitBuffer(root,'show','HEAD:'+name);
   if(!cleanDiff||!toLF(head).equals(toLF(originals.get(name))))throw Error('Committed starter has genuine uncommitted modifications in '+name+'. No files changed.');
  }
  sourceBranch=(await git(root,'branch','--show-current')).trim();
  if(!new RegExp('^bootstrap/'+stackIds[0]+'-(?:initial|reset-[0-9]+)$').test(sourceBranch))throw Error('Migration of tracked scaffolds requires the existing bootstrap branch, not '+sourceBranch+'. Main is preserved.');
  baseCommit=(await git(root,'rev-parse','HEAD')).trim();
  for(const name of Object.keys(oldTemplate)){
   const head=await gitBuffer(root,'show','HEAD:'+name).catch(()=>null);
   if(!head||!toLF(head).equals(toLF(oldTemplate[name])))throw Error('Committed starter differs from its working-tree copy: '+name+'. No files changed.');
  }
  const workspace=await skeleton.workspaceFor(root),active=await catalog.activeRoot(workspace);
  branch=migrationBranch(stackIds[0],expectedMeta.catalogVersion,active.sha);
  const local=await git(root,'show-ref','--verify','--quiet','refs/heads/'+branch).then(()=>true,()=>false);
  if(local)throw Error('Migration branch '+branch+' already exists. Review it before retrying; no branch was overwritten.');
  const remote=await git(root,'ls-remote','--heads','origin',branch).catch(()=>null);
  if(remote&&remote.trim())throw Error('Remote migration branch '+branch+' already exists. Review it before retrying.');
 }else{
  const seen=new Set();
  for(const row of status){const code=row.slice(0,2),name=row.slice(3);if(code!=='??'||!oldSet.has(name))throw Error('Legacy scaffold migration blocked by staged or unrelated changes ('+name+'). No files were changed.');seen.add(name);}
  if(seen.size!==oldSet.size)throw Error('Some legacy starter files are tracked, ignored or missing. ATGV cannot safely migrate this checkout. No files were changed.');
 }
 // A newly introduced catalog path must never overwrite a user-created file.
 for(const name of added)if((await safePath(root,name)).exists)throw Error('New catalog starter path already exists: '+name+'. No files were changed.');
 for(const name of newNames)await safePath(root,name,{mustExist:oldSet.has(name)});
 const gitDir=(await git(root,'rev-parse','--absolute-git-dir')).trim();
 if(!path.isAbsolute(gitDir))throw Error('Cannot verify Git metadata directory; no migration was attempted.');
 backupDir=await fs.mkdtemp(path.join(gitDir,'atgv-scaffold-migration-'));
 for(const [name,bytes] of originals){
  const backup=path.join(backupDir,'original',...name.split('/'));
  await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,bytes,{flag:'wx',mode:0o600});
 }
 const desired=new Map();
 for(const name of newNames)if(name!=='atgv.bootstrap.json')desired.set(name,currentFiles[name]);
 const updatedMeta={...meta,catalogVersion:expectedMeta.catalogVersion,catalogCommit:expectedMeta.catalogCommit,
  templateDigest:expectedMeta.templateDigest,generatedFiles:newNames,fileDigests:Object.fromEntries(newNames.filter(n=>n!=='atgv.bootstrap.json').map(n=>[n,hash(currentFiles[n])]))};
 if(fullyTracked)updatedMeta.migration={schema:1,sourceBranch,baseCommit,branch,removed,added,from:meta.catalogVersion,to:expectedMeta.catalogVersion,provenance};
 desired.set('atgv.bootstrap.json',Buffer.from(JSON.stringify(updatedMeta,null,2)+'\n'));
 await fs.writeFile(path.join(backupDir,'migration.json'),JSON.stringify({schema:2,action:'verified-catalog-scaffold-migration',stack:stackIds[0],from:meta.catalogVersion,to:updatedMeta.catalogVersion,sourceBranch,baseCommit,branch,added,removed,provenance,oldDigest:meta.templateDigest,newDigest:updatedMeta.templateDigest,at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 let branchCreated=false;
 const modified=[];
 try{
  for(const [name,bytes] of originals)if(!bytes.equals(await fs.readFile(path.join(root,...name.split('/')))))throw Error('Starter changed concurrently; migration aborted.');
  for(const name of added)if((await fs.lstat(path.join(root,...name.split('/'))).catch(e=>e.code==='ENOENT'?null:Promise.reject(e))))throw Error('New catalog file appeared concurrently: '+name);
  if(fullyTracked){await git(root,'switch','-c',branch);branchCreated=true;}
  for(const name of added){const target=path.join(root,...name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,desired.get(name),{flag:'wx',mode:0o600});modified.push(name);}
  for(const name of newNames.filter(n=>oldSet.has(n)&&n!=='atgv.bootstrap.json')){
   const bytes=desired.get(name),prior=originals.get(name);if(bytes.equals(prior))continue;
   modified.push(name);await fs.writeFile(path.join(root,...name.split('/')),bytes);
  }
  for(const name of removed){modified.push(name);await fs.unlink(path.join(root,...name.split('/')));}
  modified.push('atgv.bootstrap.json');await fs.writeFile(marker,desired.get('atgv.bootstrap.json'));
 }catch(error){
  const restoreFailures=[];
  for(const name of added)try{await fs.rm(path.join(root,...name.split('/')),{force:true});}catch(e){restoreFailures.push(name+': '+e.message);}
  for(const [name,bytes] of originals)try{const target=path.join(root,...name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}catch(e){restoreFailures.push(name+': '+e.message);}
  if(branchCreated&&!restoreFailures.length)try{await git(root,'switch',sourceBranch);await git(root,'branch','-D',branch);}catch(e){restoreFailures.push('Branch cleanup: '+e.message);}
  if(restoreFailures.length)throw Error('Scaffold migration rollback incomplete. Originals backed up at '+backupDir+'. '+restoreFailures.join('; '));
  throw Error('Scaffold migration rolled back; originals remain at '+backupDir+'. '+error.message);
 }
 await onProgress('Migrated verified '+(fullyTracked?'committed':'pristine')+' '+stackIds[0]+' starter '+meta.catalogVersion+' → '+updatedMeta.catalogVersion+(branch?' on new branch '+branch:'')+'. Originals backed up in Git metadata.');
 return {migrated:true,backupDir,added,removed,files:newNames,branch,sourceBranch,baseCommit,provenance};
}
module.exports={migrate,validateInventory,digest,migrationBranch};
