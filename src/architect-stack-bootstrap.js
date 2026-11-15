'use strict';
// Safe, retryable one-click Git bootstrap. Never writes to main and never stages
// files it did not generate. Install/run are explicit user-requested actions.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const net=require('node:net');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const architect=require('./architect-simple-workflow');
const developer=require('./developer-git');
const gate=require('./architect-stack-approval');
const {loadStack}=require('./tech-stacks');
const skeleton=require('./project-skeleton');
const diagnostic=require('./stack-process-diagnostics');
const dependencies=require('./stack-dependency-helper');
function branchFor(id,generation=0){if(!/^[a-z][a-z0-9-]{0,48}$/.test(id))throw Error('Invalid remote catalog stack id.');if(!Number.isSafeInteger(generation)||generation<0||generation>9999)throw Error('Invalid stack generation.');return 'bootstrap/'+id+(generation?'-reset-'+generation:'-initial');}
async function stackConfig(root,id){const workspace=await skeleton.workspaceFor(root);return loadStack(id,workspace);}
function remoteHash(output,branch){const line=String(output).split('\n').find(x=>x.endsWith('\trefs/heads/'+branch));return line?line.split(/\s/)[0]:'';}
async function withAuthentication(token,callback){
 if(!token)return callback({});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-git-auth-'));
 try{
  const js=path.join(dir,'askpass.js');
  await fs.writeFile(js,"if(/username/i.test(process.argv[2]||''))process.stdout.write('x-access-token');else process.stdout.write(process.env.ATGV_GITHUB_TOKEN||'');\n",{mode:0o600});
  let askpass=path.join(dir,'askpass');
  if(process.platform==='win32'){
   askpass+='.cmd';await fs.writeFile(askpass,'@echo off\r\n"'+process.execPath+'" "'+js+'" %*\r\n',{mode:0o600});
  }else await fs.writeFile(askpass,'#!/bin/sh\nexec "'+process.execPath+'" "'+js+'" "$@"\n',{mode:0o700});
  return await callback({GIT_ASKPASS:askpass,ATGV_GITHUB_TOKEN:token,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function git(root,auth,...args){
 try{
  const {stdout}=await exec('git',['-C',root,...args],{timeout:90000,maxBuffer:2*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',...auth}});
  return stdout.trim();
 }catch(e){
  // Do not return subprocess output that may contain credentials or credential helper prompts.
  const error=String(e.stderr||e.message||'Git operation failed').replace(/https:\/\/[^\s@]+@/g,'https://***@').slice(0,450);
  const failure=Error('Git '+args[0]+' failed: '+error);
  failure.diagnosticLogs=diagnostic.capture({stage:'git '+args[0],bin:'git',args:['-C',root,...args],cwd:root,stdout:e.stdout,stderr:e.stderr,error:e});
  throw failure;
 }
}
async function portAvailable(url){
 const u=new URL(url);
 return new Promise(resolve=>{
  const server=net.createServer();server.once('error',()=>resolve(false));
  server.listen(Number(u.port),u.hostname,()=>server.close(()=>resolve(true)));
 });
}
// Probe a preferred localhost preview URL, then select an unused port without
// stopping or taking over any other process. All candidates keep the original path.
async function allocateEphemeralPort(hostname){
 return new Promise((resolve,reject)=>{
  const listener=net.createServer();
  listener.once('error',reject);
  listener.listen(0,hostname==='[::1]'?'::1':hostname,()=>{
   const port=listener.address().port;
   listener.close(error=>error?reject(error):resolve(port));
  });
 });
}
async function chooseAvailablePreviewUrl(preferred,{portAvailable:available=portAvailable,allocatePort=allocateEphemeralPort,scanLimit=64}={}){
 const original=new URL(preferred);
 if(original.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(original.hostname)||original.username||original.password)
  throw Error('Application preview must use an ordinary localhost HTTP URL.');
 const basePort=Number(original.port);
 if(!Number.isInteger(basePort)||basePort<1||basePort>65535)throw Error('Application preview must specify a valid local port.');
 const candidate=port=>{const next=new URL(original);next.port=String(port);return next.href;};
 if(await available(candidate(basePort)))return {url:candidate(basePort),changed:false,port:basePort,previousPort:basePort};
 for(let offset=1;offset<=scanLimit;offset++){
  const port=1024+((basePort-1024+offset)%(65535-1024));
  if(port===basePort)continue;
  if(await available(candidate(port)))return {url:candidate(port),changed:true,port,previousPort:basePort};
 }
 // If adjacent ports are occupied, ask the OS for a currently available port.
 for(let attempt=0;attempt<16;attempt++){
  const port=await allocatePort(original.hostname);
  if(port>0&&port!==basePort&&await available(candidate(port)))return {url:candidate(port),changed:true,port,previousPort:basePort};
 }
 throw Error('No available localhost port could be found for the application preview. No external process was stopped.');
}
async function waitForHttp(url,isRunning,timeout=60000){
 const start=Date.now();
 while(Date.now()-start<timeout){
  if(!isRunning())throw Error('Application exited before becoming ready. Inspect the local run logs.');
  try{
   const code=await new Promise((resolve,reject)=>{
    const req=http.get(url,{timeout:2000},res=>{res.resume();resolve(res.statusCode||0);});
    req.once('timeout',()=>req.destroy(Error('Local health check timed out')));req.once('error',reject);
   });
   if(code>=200&&code<400)return url;
  }catch{} // The server is still starting.
  await new Promise(resolve=>setTimeout(resolve,750));
 }
 throw Error('Application did not become healthy at '+url+' within the startup deadline.');
}
async function ensureLocalBuildExcludes(root){
 // A GitHub repository may already contain its own .gitignore. Do not rewrite
 // it; exclude generated runtime caches in the checkout-local Git metadata.
 const location=await git(root,{},'rev-parse','--git-path','info/exclude');
 const file=path.isAbsolute(location)?location:path.resolve(root,location);
 const old=await fs.readFile(file,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
 if(old.includes('# ATGV runtime-only exclusions'))return;
 await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.appendFile(file,(old.endsWith('\n')?'':'\n')+'# ATGV runtime-only exclusions\nnode_modules/\ndist/\nbuild/\ncoverage/\n.angular/\n.vite/\ntarget/\nbin/\nobj/\n*.log\n');
}
async function preflight(root,stackId,auth,generation=0,baseBranch='main'){
 const {validGithubBranch}=require('./projects');baseBranch=validGithubBranch(baseBranch)||baseBranch;
 gate.selection(stackId,'');
 const {activeManifest}=require('./github-sdlc-catalog');const workspace=await skeleton.workspaceFor(root);const manifest=await activeManifest(workspace);
 if(!manifest.techStacks.includes(stackId))throw Error('Selected stack is absent from activated GitHub catalog. Pull the catalog.');
 const repo=await developer.repository(root),branch=branchFor(stackId,generation);
 const isMigration=String(repo.branch||'').startsWith('migration/');
 let migrationMeta=null;
 if(isMigration){
  migrationMeta=await fs.readFile(path.join(root,'atgv.bootstrap.json'),'utf8').then(JSON.parse,()=>null);
  if(migrationMeta?.migration?.schema!==1||migrationMeta.migration.branch!==repo.branch||
    migrationMeta.stacks?.length!==1||migrationMeta.stacks[0]!==stackId||
    migrationMeta.migration.sourceBranch!==branch)throw Error('Unknown migration branch or starter manifest. No automatic changes allowed.');
 }
 if(!repo.remote)throw Error('Configure a GitHub origin in Settings before saving the stack.');
 if(!repo.clean && repo.branch!==branch&&!isMigration)throw Error('Uncommitted work in the checkout. Save or stash it before creating the bootstrap branch.');
 if(repo.branch!==baseBranch&&repo.branch!==branch&&!isMigration)throw Error('Save Stack requires the base branch, bootstrap branch, or verified migration recovery branch. Currently on '+(repo.branch||'an unnamed branch')+'.');
 const heads=await git(root,auth,'ls-remote','--heads','origin');
 const baseSha=remoteHash(heads,baseBranch),publishedSha=remoteHash(heads,isMigration?repo.branch:branch);
 if(!baseSha&&heads.trim())throw Error('GitHub has other branches but no base branch. Configure and review base before bootstrapping.');
 if(repo.branch===baseBranch){
  if(!repo.clean)throw Error('The base branch has local changes. Commit or stash them before Save Stack.');
  const detected=await developer.inspectScripts(root);
  const names=await git(root,auth,'ls-files');
  const applicationFiles=names.split('\n').filter(f=>f&&(/(^|\/)(package\.json|pom\.xml|angular\.json|[^/]+\.csproj)$/.test(f)||f.startsWith('src/')));
  if(detected.targets.length||applicationFiles.length)throw Error('The '+baseBranch+' branch already contains application files. Save Stack will not overwrite or replace them. Use the existing app or choose an empty repository.');
  if(baseSha){
   await git(root,auth,'fetch','--no-tags','origin',baseBranch);
   if(repo.sha!==baseSha)throw Error('Local base and GitHub base differ. Fetch/reconcile base before Save Stack; no branch was created.');
  }else if(repo.sha)throw Error('Local base has commits but GitHub has no base branch. Review the repository before publishing.');
  // A failed or interrupted Save may have already created this branch.
  // Reuse it only when its committed manifest and provenance match exactly.
  const localSha=await git(root,auth,'rev-parse','--verify','--quiet','refs/heads/'+branch).catch(()=>'');
  if(localSha||publishedSha){
   if(localSha&&publishedSha&&localSha!==publishedSha)throw Error('Existing local '+branch+' differs from GitHub. Review both revisions manually; ATGV will not reset or overwrite either branch.');
   let candidate=localSha?('refs/heads/'+branch):'FETCH_HEAD';
   if(!localSha){
    await git(root,auth,'fetch','--no-tags','origin',branch);
    const fetched=await git(root,auth,'rev-parse','FETCH_HEAD');
    if(fetched!==publishedSha)throw Error('Remote bootstrap branch changed during recovery. Retry after reviewing GitHub.');
   }
   let marker;
   try{marker=JSON.parse(await git(root,auth,'show',candidate+':atgv.bootstrap.json'));}
   catch{throw Error('Existing bootstrap branch '+branch+' has no valid committed ATGV starter manifest. Review it manually; it will not be overwritten.');}
   if(marker.schema!==1||!Array.isArray(marker.stacks)||marker.stacks.length!==1||marker.stacks[0]!==stackId||marker.status!=='draft')
    throw Error('Existing bootstrap branch '+branch+' does not match the selected '+stackId+' starter. Review it manually; it will not be overwritten.');
   if(baseSha){
    const origin=await git(root,auth,'merge-base',baseBranch,candidate).catch(()=>'');
    if(origin!==baseSha)throw Error('Existing bootstrap branch '+branch+' is not based on the current approved base revision. Review Git ancestry before retrying.');
   }
   if(localSha)await git(root,auth,'switch',branch);
   else await git(root,auth,'switch','-c',branch,'FETCH_HEAD');
  }else await git(root,auth,'switch','-c',branch);
 }else{
  // Retry after failed install/test/push; verified migration branches are recoverable.
  if(publishedSha&&repo.sha!==publishedSha)throw Error('Local bootstrap/migration branch differs from GitHub. Review both revisions; no force push or reset is allowed.');
  if(!await fs.stat(path.join(root,'atgv.bootstrap.json')).then(s=>s.isFile(),()=>false))throw Error('Bootstrap branch does not contain an ATGV starter manifest. Review this branch manually before running application code.');
  if(isMigration){
   const existing=await git(root,auth,'rev-parse',branch).catch(()=>null);
   if(existing!==migrationMeta.migration.baseCommit)throw Error('Migration source branch has changed. Preserve work and reconcile manually.');
   await architect.generatedCommitPlan(root,[stackId]);
  }
  if(baseSha){
   const ancestor=await git(root,auth,'merge-base',baseBranch,'HEAD').catch(()=>null);
   if(ancestor&&ancestor!==baseSha)throw Error('Bootstrap branch is based on a different base revision. Review before continuing.');
  }
 }
 return {branch:isMigration?repo.branch:branch,baseBranch,baseSha,publishedSha};
}
function describePushFailure(error,branch,baseBranch='main'){
 const detail=String(error?.message||'Git push failed.');
 const lower=detail.toLowerCase();
 let guidance='Check the GitHub PAT repository Contents: write permission, organization branch rules, and the destination origin URL.';
 if(/non-fast-forward|fetch first|rejected.*fetch|stale info/.test(lower))guidance='A different remote commit exists. Fetch and reconcile the branch; ATGV will never force-push.';
 else if(/protected branch|repository rule|ruleset|gh006|gh013|pre-receive hook|push declined/.test(lower))guidance='GitHub branch protection or an organization ruleset rejected this branch. Ask an administrator to allow the ATGV branch prefix; do not bypass main protection.';
 else if(/permission|403|denied|not allowed|write access|access rights|authentication|401/.test(lower))guidance='The authenticated account may not have permission to create this branch. Verify the GitHub PAT and repository write access.';
 else if(/could not resolve|timed out|network|connection|unable to access/.test(lower))guidance='GitHub was unreachable. Check network, proxy or VPN, then retry without resetting the local branch.';
 const failure=Error('Could not push the verified ATGV branch '+branch+' to origin. '+baseBranch+' was not modified. '+guidance+' Git reported: '+detail);
 failure.diagnosticLogs=[error?.diagnosticLogs||'','Branch: '+branch,'Protected base (unchanged): '+baseBranch,'Recovery: '+guidance].filter(Boolean).join('\n\n');
 return failure;
}
async function publish(root,branch,baseSha,auth,baseBranch='main'){
 const heads=await git(root,auth,'ls-remote','--heads','origin');
 if(remoteHash(heads,baseBranch)!==baseSha)throw Error('Remote base branch changed while preparing the stack. Nothing was pushed. Reconcile the branch manually.');
 const repo=await developer.repository(root);
 if(repo.branch!==branch||!repo.sha||!repo.clean)throw Error('Only a clean, committed bootstrap branch can be pushed.');
 const remote=remoteHash(heads,branch);
 if(remote&&remote!==repo.sha)throw Error('The remote bootstrap branch differs from the local branch. Refusing to overwrite it.');
 if(remote===repo.sha)return {repo,pushed:false};
 try{await git(root,auth,'push','--set-upstream','origin',branch);}
 catch(error){throw describePushFailure(error,branch,baseBranch);}
 const after=await git(root,auth,'ls-remote','--heads','origin');
 if(remoteHash(after,branch)!==repo.sha)throw Error('Git push returned without the expected remote branch revision. Verify GitHub manually.');
 return {repo,pushed:true};
}
async function bootstrap({root,stackId,generation=0,baseBranch='main',token='',openBrowser=async()=>false,onProgress=async()=>{},effects={}}={}){
 if(!root)throw Error('Select the configured local Git checkout.');
 gate.selection(stackId,'');
 const trace=[];
 const remember=line=>{trace.push(String(line));if(trace.length>60)trace.shift();};
 try{return await withAuthentication(token,async auth=>{
  const progress=async stage=>{remember('Stage: '+stage);await onProgress(stage);};
  await progress('Checking GitHub base branch '+baseBranch+' and existing application files…');
  const base=await preflight(root,stackId,auth,generation,baseBranch);
  await progress('Preparing '+base.branch+' and copying the '+stackId+' skeleton…');
  const prepared=await architect.save(root,[stackId]);
  await ensureLocalBuildExcludes(root);
  // Upgrade verified legacy drafts, including committed starters, on a distinct branch.
  const migrated=await require('./architect-scaffold-migration').migrate({root,stackIds:[stackId],onProgress:progress});
  if(migrated.migrated){
   if(migrated.branch)base.branch=migrated.branch;
   remember('Verified legacy '+stackId+' starter migrated to current SDLC Catalog without overwriting user work.');
  }
  // Only known, byte-identical untracked legacy SQLite tests may be repaired.
  // The originals are backed up in Git metadata, and user edits are protected.
  const repaired=await require('./architect-scaffold-repair').repair({root,stackIds:[stackId],onProgress:progress});
  if(repaired.repaired)remember('Legacy SQLite test safely reconciled with the activated SDLC Catalog.');
  const inspect=await developer.inspectScripts(root);
  if(inspect.targets.length!==1)throw Error('Expected one runnable application target in the selected stack.');
  const target=inspect.targets[0];
  if(!['test','build'].every(s=>target.scripts.includes(s))||!['dev','start','run'].some(s=>target.scripts.includes(s)))throw Error('Stack must define test, build and run commands.');
  // Prove generated files are precisely the allowed untracked scaffold before
  // executing any external install, build or start script.
  await architect.generatedCommitPlan(root,[stackId]);
  await progress('Checking and preparing application dependencies…');
  if(effects.install){
   // Existing bootstrap test adapters may supply a simulated npm installer.
   if(target.kind==='npm')await effects.install(root,target.relative,{onDiagnostic:remember});
  }else await dependencies.ensureAll(root,[target],{onProgress:progress,onDiagnostic:remember});
  const results=[];
  for(const operation of ['test','build']){
   await progress('Running '+operation+' checks…');
   const result=await (effects.execute||developer.executeLocal)(root,{relative:target.relative,operation,onDiagnostic:remember});
   if(!result.passed){
    remember(result.diagnosticLogs||('Operation '+operation+' failed: '+String(result.logs||'No output.')));
    throw Error(operation+' failed in '+(target.relative||'repository root')+'. Download All Error Logs for full stdout/stderr.');
   }
   results.push(result);
  }
  await progress('Build checks passed; checking application server preview port…');
  const config=await stackConfig(root,stackId);
  if(!config.previewUrl)throw Error('The selected technology does not have a configured localhost preview.');
  const prior=developer.localLogs(),sameProcess=prior.running&&prior.cwd===path.join(root,target.relative);
  const choice=sameProcess?{url:prior.previewUrl||config.previewUrl,changed:false}:
   await chooseAvailablePreviewUrl(config.previewUrl,{portAvailable:effects.portAvailable||portAvailable,allocatePort:effects.allocatePort||allocateEphemeralPort});
  const url=choice.url;
  if(choice.changed)await progress('Preview port '+choice.previousPort+' is occupied. Using available application address: '+url);
  await progress((sameProcess?'Reusing':'Launching')+' application and checking '+url+'…');
  let opened=false,launched=false;
  try{
   if(!sameProcess){
    await (effects.launch||developer.runLocal)(root,{relative:target.relative,env:{},previewUrl:url});
    launched=true;
   }
   await (effects.waitHealth||waitForHttp)(url,effects.isRunning||(()=>developer.localLogs().running));
   await progress('Opening the running application in your external browser…');
   const visible=await openBrowser(url);
   if(visible===false)throw Error('Could not open the external browser. No commit or push was performed.');
   opened=true;
   // Recheck every generated file before staging. A modified or unrelated file
   // must not be silently committed on behalf of the user.
   const plan=await architect.generatedCommitPlan(root,[stackId]);
   await progress('Committing verified starter files on '+base.branch+'…');
   if(plan.needsCommit)await architect.commitGenerated(plan);
   const current=await developer.repository(root);
   if(!current.clean||!current.sha||current.branch!==base.branch)throw Error('Checkout changed during execution. No push was performed.');
   await progress('Pushing bootstrap branch to GitHub ('+base.baseBranch+' stays unchanged)…');
   const published=await publish(root,base.branch,base.baseSha,auth,base.baseBranch);
   const evidence=results.map(r=>({relative:r.relative,operation:r.operation,passed:true,head:published.repo.sha,at:r.at||new Date().toISOString()}));
   evidence.push({relative:target.relative,operation:'run',passed:true,head:published.repo.sha,at:new Date().toISOString()});
   return {...published,prepared,branch:base.branch,previewUrl:url,validation:gate.evidence({stackId,repo:published.repo,results:evidence})};
  }catch(error){
   const current=developer.localLogs();
   if(current.cwd&&path.resolve(current.cwd)===path.resolve(path.join(root,target.relative))){
    remember(diagnostic.capture({stage:'application startup / health',bin:current.command||'application run',cwd:current.cwd,logs:current.logs,exitCode:current.exitCode,signal:current.signal}));
   }
   if(launched&&!opened)await (effects.stop||developer.stopLocal)().catch(()=>{});
   throw error;
  }
 });}catch(error){
  error.diagnosticLogs=[...trace,error.diagnosticLogs||''].filter(Boolean).join('\n\n');
  throw error;
 }
}
module.exports={bootstrap,preflight,publish,describePushFailure,stackConfig,branchFor,remoteHash,waitForHttp,portAvailable,allocateEphemeralPort,chooseAvailablePreviewUrl,ensureLocalBuildExcludes};
