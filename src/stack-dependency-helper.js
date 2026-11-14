'use strict';
// Dependency repair for activated GitHub catalog applications. No stack-specific
// package versions or scaffolds are embedded here: read the project's own
// manifest and use its native package manager. Never install system SDKs,
// execute npm lifecycle hooks, or change source manifests without consent.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const diagnostic=require('./stack-process-diagnostics');
const {npmCommand}=require('./platform-process');
const execute=promisify(execFile);
const ALLOWED=new Set(['','apps/web','services/api']);
const LIMIT=8*1024*1024;
function commandFor(name,args){return name==='npm'?npmCommand(args):{bin:name,args};}
async function isFile(file){const st=await fs.lstat(file).catch(()=>null);return Boolean(st?.isFile()&&!st.isSymbolicLink());}
async function directory(root,relative){
 if(!ALLOWED.has(relative)||relative.includes('..'))throw Error('Unsupported application directory.');
 const base=await fs.realpath(root),cwd=path.resolve(base,relative),st=await fs.lstat(cwd);
 if(!st.isDirectory()||st.isSymbolicLink()||!(cwd===base||cwd.startsWith(base+path.sep)))throw Error('Unsafe application directory.');
 return cwd;
}
async function npmManifest(cwd){
 if(!await isFile(path.join(cwd,'package.json')))throw Error('Missing application package.json.');
 const pkg=JSON.parse(await fs.readFile(path.join(cwd,'package.json'),'utf8'));
 const names=[...new Set([...Object.keys(pkg.dependencies||{}),...Object.keys(pkg.devDependencies||{})])];
 if(names.some(name=>!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)))throw Error('Package manifest has an invalid dependency name.');
 return names;
}
async function missingNpmPackages(cwd){
 const dependencies=await npmManifest(cwd);
 const missing=[];
 for(const name of dependencies){
  const file=path.join(cwd,'node_modules',...name.split('/'),'package.json');
  if(!await isFile(file))missing.push(name);
 }
 return missing;
}
// Native optional packages such as @esbuild and @libsql are OS/CPU-specific.
// A node_modules directory copied from a Mac must not be trusted on Windows
// or Linux just because npm ls --depth=0 reports all top-level packages.
async function nativePlatformMismatch(cwd,{platform=process.platform,arch=process.arch}={}){
 const scopes={ '@esbuild':'', '@libsql':'', '@rollup':'rollup-', '@swc':'core-' };
 for(const [scope,prefix] of Object.entries(scopes)){
  const entries=await fs.readdir(path.join(cwd,'node_modules',scope)).catch(()=>[]);
  const platforms=entries.filter(name=>/^(?:rollup-|core-)?(?:darwin|linux|win32|freebsd|android)-/.test(name));
  if(!platforms.length)continue;
  if(!platforms.some(name=>name.startsWith(prefix+platform+'-'+arch)))return true;
 }
 return false;
}
const RUN_TIMEOUT=6*60*1000;
async function run({stage,bin,args,cwd,runner=execute,onDiagnostic=async()=>{},env={}}){
 const command=commandFor(bin,args),cmd=command.bin,commandArgs=command.args,options={cwd,timeout:RUN_TIMEOUT,maxBuffer:LIMIT,windowsHide:true,shell:false,
  env:{...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0',...env}};
 try{
  const {stdout='',stderr=''}=await runner(cmd,commandArgs,options);
  await onDiagnostic(diagnostic.capture({stage,bin:cmd,args:commandArgs,cwd,stdout,stderr,exitCode:0}));
  return {stdout,stderr};
 }catch(error){
  const record=diagnostic.capture({stage,bin:cmd,args:commandArgs,cwd,stdout:error.stdout,stderr:error.stderr,error});
  await onDiagnostic(record);
  let message=stage+' failed. Download the error log for command output.';
  if(error.code==='ENOENT')message=cmd+' was not found. Install its official runtime/SDK, restart VS Code, and retry. No system software was installed automatically.';
  const failure=Error(message);failure.diagnosticLogs=record;
  // npm's global cache can contain root-owned files on macOS. Restrict
  // fallback to that exact error; never bypass general filesystem permissions.
  const output=String(error.stderr||'')+'\n'+String(error.message||'');
  failure.npmCachePermission=bin==='npm'&&/EACCES|EPERM/i.test(output)&&/(?:cache folder|_cacache|[\\/]\.npm[\\/])/i.test(output);
  throw failure;
 }
}
// Keep recovery caches outside the Git checkout: installs may later be committed
// on a clean bootstrap branch, and a cache inside it would be unrelated work.
async function isolatedNpmCache(cwd){
 // npm's cache is content-addressed: reusing it across isolated BR worktrees
 // avoids downloading the same packages for each fresh development run.
 // Keep each OS/arch/Node major separate to avoid confusing native artifacts.
 await fs.realpath(cwd);
 const home=os.homedir();
 const base=path.join(home,'.atgv-aiatech-assist','npm-cache');
 const cache=path.join(base,`${process.platform}-${process.arch}-node${process.versions.node.split('.')[0]}`);
 // Reject pre-existing symlinks instead of allowing a redirected cache.
 for(const item of [path.join(home,'.atgv-aiatech-assist'),base,cache]){
  const stat=await fs.lstat(item).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw Error('Unsafe ATGV npm cache directory: '+item);
  if(!stat)await fs.mkdir(item,{recursive:false,mode:0o700});
 }
 return cache;
}
// npm ci respects an approved lockfile and creates the correct optional native
// binaries/shims for *this* OS. Without a lockfile, use a clean npm install,
// but never write a new manifest into the approved Git checkout.
async function npmInstallPlan(cwd){
 const lock=await isFile(path.join(cwd,'package-lock.json'));
 const args=lock?['ci','--ignore-scripts','--include=optional','--include=dev','--no-audit','--no-fund']:
  ['install','--ignore-scripts','--include=optional','--include=dev','--no-audit','--no-fund','--package-lock=false'];
 return {args,stage:lock?'npm ci (locked, platform-specific)':'npm install (platform-specific)'};
}
async function installNpmWithCacheRecovery(options,onProgress){
 const {args,stage}=await npmInstallPlan(options.cwd);
 let cache;
 try{cache=await isolatedNpmCache(options.cwd);}
 catch(error){
  const failure=Error('Cannot use the dedicated ATGV npm cache in your home directory. Verify the directory is writable: '+String(error.message||error));
  failure.diagnosticLogs=String(error.stack||error);throw failure;
 }
 await onProgress('Using the shared ATGV npm cache for '+process.platform+'/'+process.arch+'; no sudo or changes to the system npm cache…');
 // Never first attempt a known-unwritable ~/.npm cache. npm uses the same
 // private content-addressed cache across fresh worktrees on this machine.
 // Explicitly setting both forms prevents npm inheriting a stale global cache.
 const env={...(options.env||{}),npm_config_cache:cache,NPM_CONFIG_CACHE:cache};
 return run({...options,stage,bin:'npm',args,env});
}
// Validation is independent of npm ls: it catches package trees copied from
// a different OS (notably libsql) and launch shims copied from macOS (Vite).
function nativeTriple({platform=process.platform,arch=process.arch,libc}={}){
 if(platform==='win32')return `win32-${arch}-msvc`;
 if(platform==='darwin')return `darwin-${arch}`;
 if(platform==='linux')return `linux-${arch}-${libc||(process.report?.getReport?.().header?.glibcVersionRuntime?'gnu':'musl')}`;
 return '';
}
async function verifyPlatformPackages(cwd,{platform=process.platform,arch=process.arch,libc,runner=execute,onDiagnostic=async()=>{}}={}){
 const packages=await npmManifest(cwd);
 const result={platform,arch,vite:false,libsql:false};
 // libsql is a transitive dependency of @libsql/client and selects a native
 // optional dependency at runtime; npm ls --depth=0 does not validate it.
 if(packages.includes('libsql')||packages.includes('@libsql/client')){
  const libsqlFile=path.join(cwd,'node_modules','libsql','package.json');
  if(await isFile(libsqlFile)){
   const packageName='@libsql/'+nativeTriple({platform,arch,libc});
   const nativeFile=path.join(cwd,'node_modules',...packageName.split('/'),'package.json');
   if(!await isFile(nativeFile))throw Error(`Incorrect libSQL installation: missing ${packageName}. Install project dependencies with npm on ${platform}/${arch} (including optional dependencies); do not copy node_modules between operating systems.`);
   result.libsql=packageName;
   // Also prove the compiled .node binary actually loads, where the current
   // host matches the selected target. Avoid executing cross-OS binaries.
   if(platform===process.platform&&arch===process.arch){
    // libsql exports its Database constructor as the *default* export,
    // not as `libsql.Database`. Both CJS and transpiled default exports are
    // supported. A constructor-shape error must not be reported as a broken
    // native binary or trigger a destructive reinstall of valid dependencies.
    const probe=`const entry=require('libsql');const Database=typeof entry==='function'?entry:entry.default;if(typeof Database!=='function')throw Error('libsql default Database export is unavailable');const db=new Database(':memory:');try{const row=db.prepare('SELECT 1 AS ok').get();if(!row||Number(row.ok)!==1)throw Error('libsql in-memory SQL smoke test returned an unexpected result');}finally{db.close();}`;
    await run({stage:'libSQL native binary smoke check',bin:process.execPath,args:['-e',probe],cwd,runner,onDiagnostic});
   }
  }
 }
 if(packages.includes('vite')){
  const cli=path.join(cwd,'node_modules','vite','bin','vite.js');
  if(!await isFile(cli))throw Error('Vite installation is incomplete: node_modules/vite/bin/vite.js is missing.');
  const shim=path.join(cwd,'node_modules','.bin',platform==='win32'?'vite.cmd':'vite');
  const stat=await fs.lstat(shim).catch(()=>null);
  if(!stat||(platform!=='win32'&&!stat.isSymbolicLink()&&!stat.isFile()))throw Error('Vite npm launcher is missing. Install dependencies with npm on the current OS; do not copy node_modules from another computer.');
  if(platform!=='win32'){
   try{const target=await fs.realpath(shim);if(target!==await fs.realpath(cli))throw Error('Unexpected Vite launcher target.');}
   catch{throw Error('Vite launcher is broken or points to another installation. Reinstall packages in this isolated worktree.');}
  }
  if(platform===process.platform&&arch===process.arch){
   await run({stage:'Vite CLI smoke check',bin:process.execPath,args:[cli,'--version'],cwd,runner,onDiagnostic});
  }
  result.vite=true;
 }
 return result;
}

async function ensureForTarget(root,target,{runner=execute,onDiagnostic=async()=>{},onProgress=async()=>{},installMode='auto'}={}){
 if(!target||!['npm','dotnet','maven'].includes(target.kind))throw Error('Unsupported project dependency manager.');
 const cwd=await directory(root,target.relative||'');
 const options={cwd,runner,onDiagnostic};
 if(target.kind==='npm'){
  if(!['auto','fresh'].includes(installMode))throw Error('Unsupported npm dependency installation mode.');
  const nodeModulesPath=path.join(cwd,'node_modules');
  const nodeModules=await fs.lstat(nodeModulesPath).catch(()=>null);
  const missing=await missingNpmPackages(cwd);
  const wrongPlatform=nodeModules?.isDirectory()?await nativePlatformMismatch(cwd):false;
  let invalidNativeOrCli=false;
  let needsInstall=installMode==='fresh'||!nodeModules?.isDirectory()||missing.length>0||wrongPlatform;
  if(!needsInstall){
   try{await verifyPlatformPackages(cwd,{runner,onDiagnostic});}
   catch{invalidNativeOrCli=true;needsInstall=true;}
  }
  if(!needsInstall){
   try{await run({stage:'npm dependency validation',bin:'npm',args:['ls','--depth=0','--json'],...options});}
   catch{needsInstall=true;}
  }
  if(needsInstall){
   // The fresh mode is used only in ATGV-owned isolated Git worktrees. Never
   // delete dependencies from the user's original checkout. npm ci also
   // creates the correct native optional packages and executable shims.
   if(nodeModules&&(installMode==='fresh'||wrongPlatform||invalidNativeOrCli)){
    await fs.rm(nodeModulesPath,{recursive:true,force:true});
   }
   await onProgress('Installing dependencies for '+process.platform+'/'+process.arch+' with npm'+(missing.length?' (missing: '+missing.join(', ')+')':'')+'…');
   await installNpmWithCacheRecovery(options,onProgress);
   const remaining=await missingNpmPackages(cwd);
   if(remaining.length){
    const err=Error('npm installation completed but required packages are still missing: '+remaining.join(', '));
    err.diagnosticLogs=diagnostic.capture({stage:'npm post-install verification',cwd,bin:'npm',args:['install'],stderr:err.message,exitCode:1});
    await onDiagnostic(err.diagnosticLogs);throw err;
   }
   await run({stage:'npm post-install validation',bin:'npm',args:['ls','--depth=0','--json'],...options});
  }else await onProgress('npm dependencies verified for this operating system.');
  const runtime=await verifyPlatformPackages(cwd,{runner,onDiagnostic});
  return {kind:'npm',cwd,installed:needsInstall,verified:true,runtime};
 }
 if(target.kind==='dotnet'){
  await onProgress('Restoring NuGet packages for .NET…');
  await run({stage:'.NET SDK check',bin:'dotnet',args:['--version'],...options});
  await run({stage:'dotnet restore',bin:'dotnet',args:['restore'],...options});
  return {kind:'dotnet',cwd,installed:true,verified:true};
 }
 await onProgress('Resolving Maven dependencies for Spring Boot…');
 await run({stage:'Java runtime check',bin:'java',args:['-version'],...options});
 await run({stage:'Maven runtime check',bin:'mvn',args:['--version'],...options});
 await run({stage:'Maven dependency resolution',bin:'mvn',args:['-B','-ntp','dependency:go-offline'],...options});
 return {kind:'maven',cwd,installed:true,verified:true};
}
async function ensureAll(root,targets,{onProgress=async()=>{},...options}={}){
 if(!Array.isArray(targets)||!targets.length)throw Error('No supported application targets. Save a stack from the GitHub catalog first.');
 const output=[];
 for(const target of targets){
  await onProgress('Checking dependencies: '+(target.relative||'repository root')+' ('+target.kind+')…');
  output.push(await ensureForTarget(root,target,{...options,onProgress}));
 }
 return output;
}
module.exports={ensureForTarget,ensureAll,missingNpmPackages,npmManifest,directory,isolatedNpmCache,installNpmWithCacheRecovery,npmInstallPlan,nativePlatformMismatch,nativeTriple,verifyPlatformPackages};
