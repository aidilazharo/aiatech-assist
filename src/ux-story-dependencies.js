'use strict';
// Prepare a publishable, reproducible npm dependency set in a disposable Story
// Git worktree. Never install into or mutate the approved shared checkout.
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {npmCommand}=require('./platform-process');
const dependencyHelper=require('./stack-dependency-helper');
const exec=promisify(execFile);
const TIMEOUT=6*60*1000;
async function regular(file){const st=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));return Boolean(st?.isFile()&&!st.isSymbolicLink());}
async function runNpm(worktree,args,{runner=exec,env={},onProgress=async()=>{}}={}){
 const cmd=npmCommand(args),cache=await dependencyHelper.isolatedNpmCache(worktree);
 await onProgress(`Preparing locked Story dependencies with npm on ${process.platform}/${process.arch}…`);
 try{
  return await runner(cmd.bin,cmd.args,{cwd:worktree,timeout:TIMEOUT,maxBuffer:5*1024*1024,windowsHide:true,shell:false,env:{...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0',npm_config_cache:cache,NPM_CONFIG_CACHE:cache,...env}});
 }catch(error){
  const details=String(error.stderr||error.stdout||error.message||error).slice(-1600);
  throw Error('Unable to generate a reproducible Story package-lock.json. npm '+args[0]+' failed: '+details);
 }
}
function validateLockfile(lock,pkg){
 if(!lock||typeof lock!=='object'||!Number.isInteger(lock.lockfileVersion)||lock.lockfileVersion<2||!lock.packages||!lock.packages[''])throw Error('The Story package-lock.json is not a valid npm lockfile (v2+).');
 const declared=lock.packages[''];
 for(const field of ['dependencies','devDependencies','optionalDependencies']){
  const expected=pkg[field]||{},actual=declared[field]||{};
  if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(actual).sort()))throw Error('Story package-lock.json does not match the approved '+field+' in package.json.');
 }
}
async function prepareStoryDependencies(worktree,{runner=exec,onProgress=async()=>{},onDiagnostic=async()=>{},env={}}={}){
 const cwd=await fs.realpath(worktree),pkgPath=path.join(cwd,'package.json'),lockPath=path.join(cwd,'package-lock.json');
 if(!await regular(pkgPath))throw Error('Approved Story checkout is missing a regular package.json.');
 const pkg=JSON.parse(await fs.readFile(pkgPath,'utf8'));
 if(!pkg.scripts?.build||!pkg.scripts?.test)throw Error('Story must provide npm build and test scripts before publishing.');
 const npmDeps=Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies});
 if(!npmDeps.length)throw Error('Story package.json does not declare application dependencies.');
 const lockExisting=await fs.lstat(lockPath).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(lockExisting&&(!lockExisting.isFile()||lockExisting.isSymbolicLink()))throw Error('Unsafe Story package-lock.json; refusing to replace a symlink or non-file.');
 const nodeModules=await fs.lstat(path.join(cwd,'node_modules')).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(nodeModules?.isSymbolicLink()||(nodeModules&&!nodeModules.isDirectory()))throw Error('Unsafe Story node_modules. Worktree dependencies must be installed locally, never symlinked from another checkout.');
 if(!lockExisting){
  await onProgress('Generating package-lock.json in the isolated Story worktree (approved package.json unchanged)…');
  await runNpm(cwd,['install','--package-lock-only','--ignore-scripts','--include=dev','--include=optional','--no-audit','--no-fund'],{runner,env,onProgress});
 }
 if(!await regular(lockPath))throw Error('npm did not generate a reproducible Story package-lock.json. Publication blocked.');
 const lock=JSON.parse(await fs.readFile(lockPath,'utf8'));
 validateLockfile(lock,pkg);
 // Always use npm ci for a clean, lockfile-controlled dependency tree and
 // native packages appropriate to the current OS. The helper verifies Vite,
 // libSQL and other configured platform-sensitive packages.
 await onProgress('Installing the locked Story dependency tree with npm ci…');
 await dependencyHelper.ensureForTarget(cwd,{kind:'npm',relative:''},{installMode:'fresh',onProgress,onDiagnostic});
 if(!await fs.lstat(path.join(cwd,'node_modules')).then(st=>st.isDirectory(),()=>false))throw Error('npm ci did not create the Story node_modules directory.');
 if(!await regular(lockPath))throw Error('Story lockfile disappeared during dependency installation.');
 validateLockfile(JSON.parse(await fs.readFile(lockPath,'utf8')),pkg);
 return {passed:true,lockfileCreated:!lockExisting,dependencyFiles:lockExisting?[]:['package-lock.json']};
}
module.exports={prepareStoryDependencies,validateLockfile};
