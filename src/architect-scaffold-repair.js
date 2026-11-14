'use strict';
// Explicit Save Stack recovery for a *known, byte-identical* legacy catalog
// test on an uncommitted ATGV starter branch. Never touch tracked files, edited
// code or unrelated scaffold content. Store originals in Git metadata so they
// cannot be accidentally staged, committed or pushed.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const skeleton=require('./project-skeleton');

function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
const legacySqliteTests=new Set([
 '64263a3d2a08098155f7a0f35ce47ee1550846463bd985724f1295f3d747df88', // old deployed React/Angular starter
 '2dd7beef1b0e1214ccd768a4183f2c322b9326c2c6332705f4c7fd62e3a2e7e7', // previous bundled starter
]);
function checkInventory(meta,files){
 const generated=meta?.generatedFiles;
 if(!Array.isArray(generated)||!generated.length)throw Error('Starter manifest generatedFiles is missing or empty. ATGV cannot safely commit it.');
 if(generated.some(s=>typeof s!=='string'||!s||s.includes('\\')||s.startsWith('/')||s.split('/').some(p=>p===''||p==='.'||p==='..')))
  throw Error('Starter manifest has unsafe generated-file paths. No files were changed.');
 if(new Set(generated).size!==generated.length)throw Error('Starter manifest has duplicate generated-file entries. No files were changed.');
 if(!generated.includes('atgv.bootstrap.json'))throw Error('Starter manifest must include atgv.bootstrap.json. No files were changed.');
 const unknown=generated.filter(s=>!Object.hasOwn(files,s));
 if(unknown.length)throw Error('Starter manifest lists files absent from the active catalog: '+unknown.slice(0,8).join(', ')+'. No files were changed. Review the manifest and catalog versions.');
 return generated;
}
async function git(root,...args){return (await exec('git',['-C',root,...args],{windowsHide:true,timeout:45000,maxBuffer:1024*1024})).stdout.trim();}
async function regularFile(root,relative){
 let cursor=root;
 for(const part of relative.split('/').slice(0,-1)){
  cursor=path.join(cursor,part);
  const dir=await fs.lstat(cursor);
  if(dir.isSymbolicLink()||!dir.isDirectory())throw Error('Unsafe ATGV starter directory: '+relative);
 }
 const target=path.join(root,relative);
 const st=await fs.lstat(target);
 if(st.isSymbolicLink()||!st.isFile())throw Error('Unsafe ATGV starter file: '+relative);
 return target;
}
async function isTracked(root,relative){
 try{await git(root,'ls-files','--error-unmatch','--',relative);return true;}
 catch(error){if(error.code===1)return false;throw error;}
}
async function repair({root,stackIds,onProgress=async()=>{}}){
 if(!Array.isArray(stackIds)||stackIds.length!==1||!['react','angular'].includes(stackIds[0]))return {repaired:false,reason:'unsupported-stack'};
 const marker=path.join(root,'atgv.bootstrap.json');
 const stats=await fs.lstat(marker).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stats)return {repaired:false,reason:'no-starter-manifest'};
 if(stats.isSymbolicLink()||!stats.isFile())throw Error('Unsafe ATGV starter manifest.');
 const meta=JSON.parse(await fs.readFile(marker,'utf8'));
 if(meta.schema!==1||meta.status!=='draft'||meta.source!=='github-main-catalog'||JSON.stringify(meta.stacks)!==JSON.stringify(stackIds))
  return {repaired:false,reason:'not-a-draft-catalog-starter'};
 const files=await skeleton.skeletonFiles(stackIds,root);
 const generated=checkInventory(meta,files);
 const relative='server/api.test.mjs';
 if(!generated.includes(relative))return {repaired:false,reason:'not-a-generated-test'};
 const target=await regularFile(root,relative);
 const actual=await fs.readFile(target),expected=files[relative];
 if(actual.equals(expected))return {repaired:false,reason:'already-current'};
 // Exact known template content, allowing Windows CRLF normalization only.
 const normalizedSha=sha(Buffer.from(actual.toString('utf8').replace(/\r\n/g,'\n')));
 if(!legacySqliteTests.has(sha(actual))&&!legacySqliteTests.has(normalizedSha))
  throw Error('SQLite starter test differs from the catalog but is not an exact, recognized legacy template. ATGV preserved the file; review '+relative+' manually.');
 if(!expected.toString('utf8').includes('await client.close()')||!expected.toString('utf8').includes('maxRetries'))
  throw Error('Active catalog does not contain the corrected SQLite test. Pull the latest verified SDLC Catalog before Save Stack.');
 // Only untracked, ATGV-generated draft files may be repaired. Never modify a
 // Git-tracked source file or any user-edited/replaced scaffold component.
 if(await isTracked(root,relative)||await isTracked(root,'atgv.bootstrap.json'))
  throw Error('Legacy SQLite test or manifest is Git-tracked. ATGV will not rewrite committed application files; review the change manually.');
 for(const name of generated){
  const file=await regularFile(root,name);
  if(name==='atgv.bootstrap.json')continue;
  const current=await fs.readFile(file);
  if(name!==relative&&!current.equals(files[name]))
   throw Error('Catalog and existing starter differ at '+name+'. ATGV will not replace unrelated or edited files. Review catalog migration manually.');
  if(await isTracked(root,name))throw Error('Starter file is already Git-tracked: '+name+'. No automated repair was applied.');
 }
 // Do not modify a starter if anything else is staged, edited, or untracked.
 // This also prevents repairing files that are silently ignored by Git.
 const status=(await exec('git',['-C',root,'status','--porcelain','-z','--untracked-files=all'],
  {windowsHide:true,timeout:45000,maxBuffer:1024*1024})).stdout.split('\0').filter(Boolean);
 const seen=new Set();
 for(const row of status){
  const code=row.slice(0,2),name=row.slice(3);
  if(code!=='??'||!generated.includes(name))
   throw Error('Repository has non-starter or staged changes ('+name+'). ATGV will not auto-repair the SQLite test.');
  seen.add(name);
 }
 if(seen.size!==generated.length)
  throw Error('Some generated starter files are ignored or already tracked. ATGV will not auto-repair an unverifiable starter.');
 const gitDir=await git(root,'rev-parse','--absolute-git-dir');
 if(!path.isAbsolute(gitDir))throw Error('Cannot locate Git metadata for safe starter backup.');
 // Save originals before updating either file; Git ignores its metadata tree.
 const backupDir=await fs.mkdtemp(path.join(gitDir,'atgv-scaffold-repair-'));
 const oldManifest=await fs.readFile(marker);
 await fs.writeFile(path.join(backupDir,'api.test.mjs.before'),actual,{flag:'wx',mode:0o600});
 await fs.writeFile(path.join(backupDir,'atgv.bootstrap.json.before'),oldManifest,{flag:'wx',mode:0o600});
 const expectedMeta=JSON.parse(files['atgv.bootstrap.json'].toString('utf8'));
 const updatedMeta={...meta,catalogVersion:expectedMeta.catalogVersion,templateDigest:expectedMeta.templateDigest};
 const newManifest=Buffer.from(JSON.stringify(updatedMeta,null,2)+'\n');
 let testWasWritten=false,manifestWasWritten=false;
 try{
  // Recheck source bytes just before writing, to avoid overwriting concurrent edits.
  if(!actual.equals(await fs.readFile(target))||!oldManifest.equals(await fs.readFile(marker)))throw Error('Starter changed during recovery; no repair was applied.');
  testWasWritten=true;
  await fs.writeFile(target,expected,{flag:'w'});
  manifestWasWritten=true;
  await fs.writeFile(marker,newManifest,{flag:'w'});
 }catch(error){
  if(testWasWritten)await fs.writeFile(target,actual).catch(()=>{});
  if(manifestWasWritten)await fs.writeFile(marker,oldManifest).catch(()=>{});
  throw error;
 }
 await fs.writeFile(path.join(backupDir,'repair.json'),JSON.stringify({schema:1,action:'restore-known-legacy-sqlite-test',at:new Date().toISOString(),stack:stackIds[0],file:relative,previousSha256:sha(actual),updatedSha256:sha(expected),manifestPreviousSha256:sha(oldManifest),manifestUpdatedSha256:sha(newManifest),catalogVersion:expectedMeta.catalogVersion},null,2)+'\n',{flag:'wx'});
 await onProgress('Repaired verified legacy SQLite starter test; original and manifest backed up in '+backupDir+'.');
 return {repaired:true,files:[relative,'atgv.bootstrap.json'],backupDir};
}
module.exports={repair,checkInventory,legacySqliteTests};
