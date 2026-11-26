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
const {npmCommand,mavenCommand}=require('./platform-process');
const recovery=require('./dependency-recovery');
const policyRecovery=require('./npm-policy-recovery');
const windowsBundle=require('./windows-dependency-bundle');
const libraryOffline=require('./library-offline-dependencies');
const execute=promisify(execFile);
const LIMIT=8*1024*1024;
function commandFor(name,args){return name==='npm'?npmCommand(args):name==='mvn'?mavenCommand(args):{bin:name,args};}
async function isFile(file){const st=await fs.lstat(file).catch(()=>null);return Boolean(st?.isFile()&&!st.isSymbolicLink());}
async function directory(root,relative){
 if(typeof relative!=='string'||relative.length>180||
   relative.split('/').length>3||relative.split('/').some(part=>part==='.'||part==='..'||part.startsWith('.')||part&&!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(part))||
   relative.startsWith('/')||relative.includes('\\')||relative.includes('//'))throw Error('Unsupported application directory.');
 const base=await fs.realpath(root),cwd=path.resolve(base,relative),st=await fs.lstat(cwd);
 if(!st.isDirectory()||st.isSymbolicLink()||!(cwd===base||cwd.startsWith(base+path.sep)))throw Error('Unsafe application directory.');
 const real=await fs.realpath(cwd);
 if(real!==base&&!real.startsWith(base+path.sep))throw Error('Unsafe application directory (symlink escape).');
 return real;
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
async function run({stage,bin,args,cwd,runner=execute,onDiagnostic=async()=>{},env={},signal}){
 const command=commandFor(bin,args),cmd=command.bin,commandArgs=command.args,options={cwd,timeout:RUN_TIMEOUT,maxBuffer:LIMIT,windowsHide:true,shell:false,
  signal,env:{...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0',...env}};
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
  failure.cancelled=error.name==='AbortError'||error.code==='ABORT_ERR'||signal?.aborted===true;
  if(failure.cancelled)failure.message='Dependency installation stopped. Recorded failed versions will be avoided when you retry.';
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
 const manifest=JSON.parse(await fs.readFile(path.join(options.cwd,'package.json'),'utf8'));
 const declared={...(manifest.dependencies||{}),...(manifest.devDependencies||{}),...(manifest.optionalDependencies||{})};
 const selected=Object.create(null),scopes=new Map(),policySelections=new Map();
 const policy=await policyRecovery.readPolicy(options.historyFile||recovery.defaultFile());
 const candidateOptions={cwd:options.cwd,runner:options.runner||execute,env,signal:options.signal};
 const scope=async name=>{
  if(!scopes.has(name))scopes.set(name,await policyRecovery.scopeFor(policy,name,declared[name],candidateOptions));
  return scopes.get(name);
 };
 const choose=async name=>{
  const failed=await recovery.failedVersions('npm',name,{file:options.historyFile});
  const list=await recovery.npmCandidates(name,declared[name],candidateOptions);
  const candidate=list.find(v=>!failed.has(v));
  if(!candidate)throw Error('No unfailed version of '+name+' matches the approved package range '+declared[name]+'. Review the dependency or registry; no incompatible version was selected.');
  selected[name]=candidate;await onProgress('Trying '+name+'@'+candidate+' (latest compatible version not recorded as failed).');
 };
 const choosePolicy=async(ctx,original)=>{
  const list=await recovery.npmCandidates(ctx.name,declared[ctx.name],candidateOptions);
  const ordinaryFailures=await recovery.failedVersions('npm',ctx.name,{file:options.historyFile});
  const next=policyRecovery.candidates(ctx,list.filter(v=>!ordinaryFailures.has(v)),await policyRecovery.history(ctx),original)[0];
  if(!next)throw Error('No approved same-major version of '+ctx.name+' within '+declared[ctx.name]+' remains. Review the lockfile or request IT/architecture approval; registry and security settings unchanged.');
  selected[ctx.name]=next;policySelections.set(ctx.name,{ctx,version:next});
  await onProgress('Trying approved '+ctx.name+'@'+next+' (same module; scoped version history applied).');
 };
 // Only a matching unexpired administrator-approved local policy can permit
 // 403 recovery. Otherwise the original failure is returned without retries.
 let lock=null;
 if(policy&&args[0]==='ci')lock=JSON.parse(await fs.readFile(path.join(options.cwd,'package-lock.json'),'utf8'));
 for(const name of Object.keys(declared)){
  const ctx=await scope(name);
  if(ctx){
   const rows=await policyRecovery.history(ctx);
   const original=lock?(lock.packages?.['node_modules/'+name]?.version||lock.dependencies?.[name]?.version):rows.find(r=>r.outcome==='rejected')?.version;
   if(original&&rows.some(r=>r.version===original&&r.outcome==='rejected')){await choosePolicy(ctx,original);continue;}
   // Do not use the legacy version retry path to select an unapproved version
   // of a package covered by the explicit corporate policy.
   const legacy=await recovery.failedVersions('npm',name,{file:options.historyFile});
   const known=original&&legacy.has(original)?original:!lock?[...legacy][0]:null;
   if(known){await choosePolicy(ctx,known);continue;}
   continue;
  }
  if((await recovery.failedVersions('npm',name,{file:options.historyFile})).size)await choose(name);
 }
 for(let attempt=0;attempt<12;attempt++){
  if(options.signal?.aborted)throw Error('Dependency installation stopped.');
  if(policySelections.size&&policy.expiresAt<=Date.now())throw Error('Approved npm version policy expired; recovery stopped.');
  const override=Object.entries(selected).map(([name,version])=>name+'@'+version);
  const plan=override.length?['install','--no-save','--package-lock=false','--ignore-scripts','--include=optional','--include=dev','--no-audit','--no-fund',...override]:args;
  try{
   const result=await run({...options,stage:override.length?'npm install (compatible recovery)':stage,bin:'npm',args:plan,env});
   return {...result,policySelections:[...policySelections.values()]};
  }
  catch(error){
   if(error.cancelled||options.signal?.aborted)throw error;
   const details=String(error.diagnosticLogs||error.message||error),denial=policyRecovery.parse403(details);
   if(denial&&Object.prototype.hasOwnProperty.call(declared,denial.package)){
    const ctx=await scope(denial.package);
    if(policyRecovery.matches(ctx,denial)){
     await policyRecovery.record(ctx,denial.version,'rejected');
     await onProgress('Recorded version-specific npm rejection '+denial.package+'@'+denial.version+'; checking approved same-module versions.');
     await choosePolicy(ctx,denial.version);continue;
    }
   }
   const failure=recovery.parseFailure('npm',details);
   await recovery.record({manager:'npm',package:failure?.package||'',version:failure?.version||'',kind:failure?'version':'failure',error:details},{file:options.historyFile});
   if(!failure||!Object.prototype.hasOwnProperty.call(declared,failure.package))throw error;
   const ctx=await scope(failure.package);
   if(ctx){await policyRecovery.record(ctx,failure.version,'rejected');await choosePolicy(ctx,failure.version);}
   else{await onProgress('Recorded npm failure '+failure.package+'@'+failure.version+'; looking for another compatible version.');await choose(failure.package);}
  }
 }
 throw Error('Dependency recovery stopped after 12 attempts. Review the recorded errors and approved dependency ranges.');
}

async function restoreNativeWithRecovery(root,target,options,{onProgress,allowManifestRecovery=false}={}){
 const manager=target.kind;
 const choose=async item=>{
  if(!allowManifestRecovery)throw Error('A failed '+manager+' dependency version is recorded. Automatic manifest changes require a verified ATGV starter; review '+item.name+' manually.');
  const failed=await recovery.failedVersions(manager,item.name,{file:options.historyFile});
  const major=item.version.split('.')[0];
  const available=manager==='dotnet'
   ?await recovery.nugetCandidates(item.name,{cwd:options.cwd,runner:options.runner,signal:options.signal})
   :await recovery.mavenCandidates(item.name,major,{cwd:options.cwd,runner:options.runner,signal:options.signal});
  const candidate=available.find(v=>v.split('.')[0]===major&&!failed.has(v));
  if(!candidate)throw Error('No unfailed '+manager+' version in major '+major+' is available for '+item.name+'. Review the dependency and configured registry.');
  await recovery.applyNativeResolution(root,item,candidate,manager);
  await onProgress('Trying '+item.name+' '+candidate+' (latest available in the approved major version).');
 };
 // Resume from persistent history before invoking a known-bad version again.
 for(const item of await recovery.nativeManifests(options.cwd,manager)){
  const failed=await recovery.failedVersions(manager,item.name,{file:options.historyFile});
  if(failed.has(item.version))await choose(item);
 }
 for(let attempt=0;attempt<12;attempt++){
  try{
   if(manager==='dotnet'){
    await run({stage:'dotnet restore',bin:'dotnet',args:['restore'],...options});
    const manifests=await recovery.nativeManifests(options.cwd,manager);
    const projects=[...new Set(manifests.map(x=>x.file).filter(file=>/(?:^|[\\/])tests?[\\/]/i.test(file)))];
    for(const file of projects)await run({stage:'dotnet test project restore',bin:'dotnet',args:['restore',file],...options});
   }else await run({stage:'Maven dependency resolution',bin:'mvn',args:['-B','-ntp','dependency:go-offline'],...options});
   return;
  }catch(error){
   if(error.cancelled||options.signal?.aborted)throw error;
   const details=String(error.diagnosticLogs||error.message||error),failure=recovery.parseFailure(manager,details);
   await recovery.record({manager,package:failure?.package||'',version:failure?.version||'',kind:failure?'version':'failure',error:details},{file:options.historyFile});
   if(!failure)throw error;
   const manifests=await recovery.nativeManifests(options.cwd,manager);
   const item=manifests.find(x=>x.name.toLowerCase()===failure.package.toLowerCase()&&x.version===failure.version);
   if(!item)throw Error('Recorded '+failure.package+' '+failure.version+' failure. The failed package is not an explicit version in a managed starter; review the dependency manually.');
   await onProgress('Recorded '+failure.package+' '+failure.version+' failure; checking another version.');await choose(item);
  }
 }
 throw Error('Dependency recovery stopped after 12 attempts. Review the recorded failures.');
}
async function nativeToolCheck(manager,stage,bin,args,options){
 try{return await run({stage,bin,args,...options});}
 catch(error){if(!error.cancelled&&!options.signal?.aborted)await recovery.record({manager,kind:'failure',error:String(error.diagnosticLogs||error.message||error)},{file:options.historyFile});throw error;}
}
// Validation is independent of npm ls: it catches package trees copied from
// a different OS (notably libsql) and launch shims copied from macOS (Vite).
function nativeTriple({platform=process.platform,arch=process.arch,libc}={}){
 if(platform==='win32')return `win32-${arch}-msvc`;
 if(platform==='darwin')return `darwin-${arch}`;
 if(platform==='linux')return `linux-${arch}-${libc||(process.report?.getReport?.().header?.glibcVersionRuntime?'gnu':'musl')}`;
 return '';
}
async function verifyPlatformPackages(cwd,{platform=process.platform,arch=process.arch,libc,runner=execute,onDiagnostic=async()=>{},runtimeNode=process.execPath}={}){
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
    await run({stage:'libSQL native binary smoke check',bin:runtimeNode,args:['-e',probe],cwd,runner,onDiagnostic});
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
   await run({stage:'Vite CLI smoke check',bin:runtimeNode,args:[cli,'--version'],cwd,runner,onDiagnostic});
  }
  result.vite=true;
 }
 return result;
}

async function ensureForTarget(root,target,{runner=execute,onDiagnostic=async()=>{},onProgress=async()=>{},installMode='auto',signal,historyFile,allowManifestRecovery=false}={}){
 if(!target||!['npm','dotnet','maven'].includes(target.kind))throw Error('Unsupported project dependency manager.');
 const cwd=await directory(root,target.relative||'');
 const options={cwd,runner,onDiagnostic,signal,historyFile};
 const pack=await libraryOffline.locate(root,cwd);
 if(pack){
  if(pack.kind!==target.kind)throw Error('Offline Library package does not match application type.');
  const env=libraryOffline.env(pack);
  await onProgress('Using offline Library dependencies for '+pack.id+'…');
  if(target.kind==='npm'){
   const runtimeNode=await libraryOffline.restoreNpm(pack,cwd,{runner,signal});
   const missing=await missingNpmPackages(cwd);
   if(missing.length||await nativePlatformMismatch(cwd))throw Error('Offline Library modules incomplete or incompatible; import a verified package.');
   await run({stage:'Offline Library npm validation',bin:'npm',args:['ls','--all','--json','--offline'],...options,env});
   const runtime=await verifyPlatformPackages(cwd,{runner,onDiagnostic,runtimeNode});
   return {kind:'npm',cwd,installed:false,verified:true,runtime,offline:true};
  }
  if(target.kind==='dotnet'){
   await run({stage:'Offline NuGet restore',bin:'dotnet',args:['restore','Api.csproj','--source',env.NUGET_PACKAGES,'-p:NuGetAudit=false'],...options,env});
   await run({stage:'Offline NuGet test restore',bin:'dotnet',args:['restore','tests/Atgv.Tests/Atgv.Tests.csproj','--source',env.NUGET_PACKAGES,'-p:NuGetAudit=false'],...options,env});
  }else await run({stage:'Offline Maven resolution',bin:'mvn',args:['-o','-B','-ntp','test-compile'],...options,env});
  return {kind:target.kind,cwd,installed:true,verified:true,offline:true};
 }
 if(target.kind==='npm'){
  if(!['auto','fresh'].includes(installMode))throw Error('Unsupported npm dependency installation mode.');
  let bundled=await windowsBundle.prepare(root,cwd,{runner,onProgress,signal});
   if(bundled){
    let incomplete=(await missingNpmPackages(cwd)).length>0||await nativePlatformMismatch(cwd);
    if(incomplete&&!bundled.restored){
     await onProgress('Cached offline dependencies incomplete; restoring verified archive again (no npm install)…');
     bundled=await windowsBundle.prepare(root,cwd,{runner,onProgress,signal,force:true});
     incomplete=(await missingNpmPackages(cwd)).length>0||await nativePlatformMismatch(cwd);
    }
    if(incomplete)throw Error('Bundled Windows dependencies are incomplete or incompatible. Restore the published bundle; npm installation is disabled.');
   await run({stage:'Bundled npm dependency validation (read-only)',bin:'npm',args:['ls','--all','--json','--offline'],...options,env:await windowsBundle.offlineEnv(root,cwd)});
   const runtime=await verifyPlatformPackages(cwd,{runner,onDiagnostic,runtimeNode:bundled.node});
   await onProgress('Verified bundled Windows dependencies; npm install and npm ci skipped.');
   return {kind:'npm',cwd,installed:false,restored:bundled.restored,verified:true,runtime};
  }
  const nodeModulesPath=path.join(cwd,'node_modules');
  const nodeModules=await fs.lstat(nodeModulesPath).catch(()=>null);
  const missing=await missingNpmPackages(cwd);
  const wrongPlatform=nodeModules?.isDirectory()?await nativePlatformMismatch(cwd):false;
  const previouslyFailed=[];
  if(nodeModules?.isDirectory())for(const name of await npmManifest(cwd)){
   const manifest=path.join(nodeModulesPath,...name.split('/'),'package.json');
   if(!await isFile(manifest))continue;
   let installed;try{installed=JSON.parse(await fs.readFile(manifest,'utf8'));}catch{previouslyFailed.push(name+' (invalid installed manifest)');continue;}
   if(installed.version&&(await recovery.failedVersions('npm',name,{file:historyFile})).has(installed.version))previouslyFailed.push(name+'@'+installed.version);
  }
  let invalidNativeOrCli=false,installation=null;
  let needsInstall=installMode==='fresh'||!nodeModules?.isDirectory()||missing.length>0||wrongPlatform||previouslyFailed.length>0;
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
   await onProgress('Installing dependencies for '+process.platform+'/'+process.arch+' with npm'+(missing.length?' (missing: '+missing.join(', ')+')':'')+(previouslyFailed.length?' (replacing recorded failures: '+previouslyFailed.join(', ')+')':'')+'…');
   installation=await installNpmWithCacheRecovery(options,onProgress);
   const remaining=await missingNpmPackages(cwd);
   if(remaining.length){
    const err=Error('npm installation completed but required packages are still missing: '+remaining.join(', '));
    err.diagnosticLogs=diagnostic.capture({stage:'npm post-install verification',cwd,bin:'npm',args:['install'],stderr:err.message,exitCode:1});
    await onDiagnostic(err.diagnosticLogs);throw err;
   }
   await run({stage:'npm post-install validation',bin:'npm',args:['ls','--depth=0','--json'],...options});
  }else await onProgress('npm dependencies verified for this operating system.');
  const runtime=await verifyPlatformPackages(cwd,{runner,onDiagnostic});
  // A successful npm process is not sufficient. Confirm actual installed
  // versions, npm ls and platform checks before writing positive memory.
  for(const {ctx,version} of installation?.policySelections||[]){
   const file=path.join(cwd,'node_modules',...ctx.name.split('/'),'package.json');
   if(!await isFile(file)||JSON.parse(await fs.readFile(file,'utf8')).version!==version)throw Error('Approved recovery version could not be verified: '+ctx.name+'@'+version);
   if(ctx.policy.expiresAt<=Date.now())throw Error('Approved npm version policy expired before verification.');
   await policyRecovery.record(ctx,version,'dependency-verified');
   await onProgress('Remembered dependency-verified '+ctx.name+'@'+version+'; application startup validation remains separate.');
  }
  return {kind:'npm',cwd,installed:needsInstall,verified:true,runtime};
 }
 if(target.kind==='dotnet'){
  await onProgress('Restoring NuGet packages for .NET…');
  await nativeToolCheck('dotnet','.NET SDK check','dotnet',['--version'],options);
  await restoreNativeWithRecovery(root,target,options,{onProgress,allowManifestRecovery});
  return {kind:'dotnet',cwd,installed:true,verified:true};
 }
 await onProgress('Resolving Maven dependencies for Spring Boot…');
 await nativeToolCheck('maven','Java runtime check','java',['-version'],options);
 await nativeToolCheck('maven','Maven runtime check','mvn',['--version'],options);
 await restoreNativeWithRecovery(root,target,options,{onProgress,allowManifestRecovery});
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
module.exports={ensureForTarget,ensureAll,missingNpmPackages,npmManifest,directory,isolatedNpmCache,installNpmWithCacheRecovery,restoreNativeWithRecovery,npmInstallPlan,nativePlatformMismatch,nativeTriple,verifyPlatformPackages};
