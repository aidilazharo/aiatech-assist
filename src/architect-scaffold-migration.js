'use strict';
// Migrate a previously generated *pristine, untracked draft* starter when its
// inventory changes in the activated GitHub catalog (e.g. JSX -> TSX).
// The old bootstrap templateDigest is a complete content checksum. Do not
// guess old content, replace user code, migrate Git-tracked files, or skip tests.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const skeleton=require('./project-skeleton');

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=files=>hash(Object.keys(files).sort().map(name=>name+'\0'+hash(files[name])).join('\n'));
function validateInventory(meta){
 const names=meta?.generatedFiles;
 if(!Array.isArray(names)||!names.length||names.length>150||!names.includes('atgv.bootstrap.json'))
  throw Error('Legacy starter manifest has an invalid generatedFiles inventory. No files were changed.');
 if(names.some(name=>typeof name!=='string'||name.length>450||!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||name.endsWith('/')||name.split('/').some(segment=>!segment||segment==='.'||segment==='..'))||new Set(names).size!==names.length)
  throw Error('Legacy starter manifest has duplicate or unsafe generated-file paths. No files were changed.');
 return names;
}
async function git(root,...args){
 return (await exec('git',['-C',root,...args],{timeout:45000,maxBuffer:2*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}})).stdout;
}
async function safePath(root,relative,{mustExist=false}={}){
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
async function migrate({root,stackIds,onProgress=async()=>{}}){
 if(!Array.isArray(stackIds)||stackIds.length!==1||!['react','angular'].includes(stackIds[0]))return {migrated:false,reason:'unsupported-stack'};
 const marker=path.join(root,'atgv.bootstrap.json');
 const s=await fs.lstat(marker).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!s)return {migrated:false,reason:'no-manifest'};
 if(!s.isFile()||s.isSymbolicLink())throw Error('Unsafe ATGV starter manifest. No files were changed.');
 const originalManifest=await fs.readFile(marker);
 let meta;
 try{meta=JSON.parse(originalManifest.toString('utf8'));}catch{throw Error('Invalid ATGV starter manifest JSON. No files were changed.');}
 if(meta.schema!==1||meta.status!=='draft'||meta.source!=='github-main-catalog'||JSON.stringify(meta.stacks)!==JSON.stringify(stackIds))
  return {migrated:false,reason:'not-a-draft-catalog-starter'};
 const oldNames=validateInventory(meta);
 const currentFiles=await skeleton.skeletonFiles(stackIds,root);
 // ATGV may have preserved a pre-existing company .gitignore or README.
 // These were never generated and must not be treated as catalog additions.
 const oldSet=new Set(oldNames);
 const preserved=new Set(['README.md','.gitignore','.env.example','.github/workflows/ci.yml']);
 const excluded=[];
 for(const name of Object.keys(currentFiles)){
  if(!oldSet.has(name)&&preserved.has(name)&&(await safePath(root,name)).exists)excluded.push(name);
 }
 const newNames=Object.keys(currentFiles).filter(name=>!excluded.includes(name)).sort();
 const newSet=new Set(newNames);
 const removed=oldNames.filter(name=>!newSet.has(name));
 const added=newNames.filter(name=>!oldSet.has(name));
 if(!removed.length&&!added.length)return {migrated:false,reason:'inventory-unchanged'};
 if(!/^[a-f0-9]{64}$/i.test(meta.templateDigest||''))
  throw Error('Legacy starter has no valid templateDigest. Cannot verify original files; migration stopped without changes.');
 // The old generated-file bytes must exactly match the hash recorded when ATGV
 // copied them from the old catalog. This also catches manually repaired tests.
 const originals=new Map(),oldTemplate={};
 for(const name of oldNames){
  const {target}=await safePath(root,name,{mustExist:true});
  const bytes=await fs.readFile(target);originals.set(name,bytes);
  if(name!=='atgv.bootstrap.json')oldTemplate[name]=bytes;
 }
 if(!originals.get('atgv.bootstrap.json').equals(originalManifest))throw Error('Starter manifest changed during migration preflight.');
 // The digest was recorded for the entire old catalog, including files
 // preserved from the company's base checkout. Use only identical current
 // catalog bytes for those omitted paths; otherwise decline migration.
 for(const name of excluded)oldTemplate[name]=currentFiles[name];
 if(digest(oldTemplate)!==meta.templateDigest)
  throw Error('Legacy scaffold does not match its recorded templateDigest (edited or previously repaired files). ATGV preserved every file; reconcile the project manually.');
 // Never change a committed file, staged file, or a checkout with unrelated work.
 const status=(await git(root,'status','--porcelain','-z','--untracked-files=all')).split('\0').filter(Boolean);
 const seen=new Set();
 for(const row of status){
  const code=row.slice(0,2),name=row.slice(3);
  if(code!=='??'||!oldSet.has(name))throw Error('Legacy scaffold migration blocked by Git-tracked, staged or unrelated changes ('+name+'). No files were changed.');
  seen.add(name);
 }
 if(seen.size!==oldSet.size)throw Error('Some legacy starter files are tracked, ignored or missing. ATGV cannot safely migrate this checkout. No files were changed.');
 // Never overwrite an unrelated file at a newly introduced catalog path.
 for(const name of added){if((await safePath(root,name)).exists)throw Error('New catalog starter path already exists: '+name+'. No files were changed.');}
 // The active catalog is the sole source of new starter content.
 for(const name of newNames)await safePath(root,name,{mustExist:oldSet.has(name)});
 const gitDir=(await git(root,'rev-parse','--absolute-git-dir')).trim();
 if(!path.isAbsolute(gitDir))throw Error('Cannot verify Git metadata directory; no migration was attempted.');
 const backupDir=await fs.mkdtemp(path.join(gitDir,'atgv-scaffold-migration-'));
 // Journal all original source bytes before the first write. Kept outside worktree.
 for(const [name,bytes] of originals){
  const backup=path.join(backupDir,'original',...name.split('/'));
  await fs.mkdir(path.dirname(backup),{recursive:true});
  await fs.writeFile(backup,bytes,{flag:'wx',mode:0o600});
 }
 const desired=new Map();
 for(const name of newNames){
  if(name==='atgv.bootstrap.json')continue;
  desired.set(name,currentFiles[name]);
 }
 const updatedMeta={...meta,catalogVersion:JSON.parse(currentFiles['atgv.bootstrap.json'].toString('utf8')).catalogVersion,
  templateDigest:JSON.parse(currentFiles['atgv.bootstrap.json'].toString('utf8')).templateDigest,generatedFiles:newNames};
 desired.set('atgv.bootstrap.json',Buffer.from(JSON.stringify(updatedMeta,null,2)+'\n'));
 await fs.writeFile(path.join(backupDir,'migration.json'),JSON.stringify({schema:1,action:'upgrade-pristine-draft-scaffold',stack:stackIds[0],from:meta.catalogVersion,to:updatedMeta.catalogVersion,added,removed,oldDigest:meta.templateDigest,newDigest:updatedMeta.templateDigest,at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 const touched=[];
 try{
  // Verify source bytes again immediately before changing the worktree.
  for(const [name,bytes] of originals)if(!bytes.equals(await fs.readFile(path.join(root,...name.split('/')))))throw Error('Starter changed concurrently; migration aborted.');
  for(const name of added)if((await fs.lstat(path.join(root,...name.split('/'))).catch(e=>e.code==='ENOENT'?null:Promise.reject(e))))throw Error('New catalog file appeared concurrently: '+name);
  // Create additions before replacing common files; manifest written last.
  for(const name of added){
   const target=path.join(root,...name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});
   await fs.writeFile(target,desired.get(name),{flag:'wx',mode:0o600});touched.push(name);
  }
  for(const name of newNames.filter(name=>oldSet.has(name)&&name!=='atgv.bootstrap.json')){
   const bytes=desired.get(name),existing=originals.get(name);
   if(bytes.equals(existing))continue;
   touched.push(name);await fs.writeFile(path.join(root,...name.split('/')),bytes);
  }
  for(const name of removed){touched.push(name);await fs.unlink(path.join(root,...name.split('/')));}
  touched.push('atgv.bootstrap.json');await fs.writeFile(marker,desired.get('atgv.bootstrap.json'));
 }catch(error){
  // Attempt to restore each source from the journal (including deleted files),
  // and delete newly introduced paths. Keep journal for manual recovery.
  const restoreFailures=[];
  for(const name of added)try{await fs.rm(path.join(root,...name.split('/')),{force:true});}catch(e){restoreFailures.push(name+': '+e.message);}
  for(const [name,bytes] of originals)try{
   const target=path.join(root,...name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
  }catch(e){restoreFailures.push(name+': '+e.message);}
  if(restoreFailures.length)throw Error('Scaffold migration failed and rollback was incomplete. Original copies are in '+backupDir+'. '+restoreFailures.join('; '));
  throw Error('Scaffold migration was rolled back; backups remain in '+backupDir+'. '+error.message);
 }
 await onProgress('Migrated verified pristine '+stackIds[0]+' starter from '+(meta.catalogVersion||'unknown')+' to '+updatedMeta.catalogVersion+' ('+removed.length+' removed, '+added.length+' added). Originals backed up in Git metadata.');
 return {migrated:true,backupDir,added,removed,files:newNames};
}
module.exports={migrate,validateInventory,digest};
