'use strict';
// One user-approved local Custom Stack workflow. Never pushes or modifies main.
const fs=require('node:fs/promises');
const path=require('node:path');
const {setTimeout:sleep}=require('node:timers/promises');
const custom=require('./architect-custom-stack');
const repair=require('./architect-custom-repair');
const developer=require('./developer-git');
const dependency=require('./stack-dependency-helper');
const fullstack=require('./architect-custom-fullstack');
const running=new Map();
const awaitingConsent=new Map();
const steps=Object.freeze([
 'Scan repository',
 'Create local branch',
 'Update code and commit locally',
 'Install dependencies',
 'Create and run mock services and database',
 'Verify local preview'
]);
// Install & Run is a visual application preview when a runnable Vite frontend
// exists. A previously selected API target must not silently replace the UI.
function selectPreviewTarget(inspection,relative){
 const targets=inspection?.targets||[];
 const requested=targets.find(x=>x.relative===relative&&x.runnable&&x.mockable&&x.role==='frontend');
 // Install & Run is an application preview, not a JSON health-check viewer.
 // Never fall back to NestJS/API-only when a frontend was requested or expected.
 return requested||targets.find(x=>x.runnable&&x.mockable&&x.role==='frontend')||null;
}
function cancelled(state){
 if(state.controller.signal.aborted)throw Error('Custom Stack Install & Run cancelled. Local branch and committed mock fixtures are preserved.');
}
async function assertPreviewScaffold(root){
 for(const name of ['README.md','mock-services.mjs','mock-database.json']){
  const file=path.join(root,'atgv-preview',name);
  const stat=await fs.lstat(file).catch(()=>null);
  if(!stat?.isFile()||stat.isSymbolicLink())throw Error('Existing fix branch has missing or unsafe ATGV preview fixture '+name+'. Repair manually; no files were overwritten.');
 }
 const source=await fs.readFile(path.join(root,'atgv-preview','mock-services.mjs'),'utf8');
 if(source!==repair.PREVIEW_SERVICE)throw Error('ATGV preview runner differs from the trusted mock template. Refusing to execute modified code.');
 const fixture=JSON.parse(await fs.readFile(path.join(root,'atgv-preview','mock-database.json'),'utf8'));
 if(fixture.synthetic!==true)throw Error('Preview fixture is not marked synthetic. Refusing to run it.');
}
async function verifyMock(url,driver,root,relative,state){
 for(let attempt=0;attempt<30;attempt++){
  cancelled(state);
  const info=driver.localLogs();
  if(!info.running)throw Error('ATGV mock service process stopped before the preview became healthy.');
  if(path.resolve(info.cwd||'')!==path.resolve(root,relative))throw Error('A different application owns the managed mock service.');
  try{
   const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(1200)});
   if(response.ok&&response.headers.get('x-atgv-mock-data')==='true'){
    const body=await response.json();
    if(body.status==='mock'&&body.database==='simulated')return;
   }
   if(response.ok)throw Error('The preview URL responded, but it is not the ATGV synthetic mock API.');
  }catch(error){
   if(error.message?.includes('not the ATGV'))throw error;
  }
  await sleep(350);
 }
 throw Error('The mock service did not pass localhost health verification.');
}
async function installAndRun(root,{expectedSha='',relative,previewUrl='',onProgress=async()=>{},
 driver=developer,stack=custom,repairs=repair,dependencies=dependency,onAiReview=null,fullStack=fullstack,fullStackMode='auto',prepareBaseline=null}={}){
 const key=path.resolve(root);
 if(running.has(key))throw Error('Custom Stack Install & Run is already in progress.');
 const state={controller:new AbortController(),started:false};
 running.set(key,state);
 const report=async(percent,step,message,ai=false)=>onProgress({percent,step,message,ai});
 try{
  await report(7,1,'1/6 Scanning verified Git repository and detecting application targets…');
  let inspection=await stack.scan(key,{driver});
  cancelled(state);
  if(typeof prepareBaseline==='function'){
   if(inspection.sha||expectedSha)throw Error('Git revision changed since initial-commit review; rescan and retry.');
   if(driver.localLogs().running)throw Error('Stop the currently managed application before creating the initial commit.');
   if(!selectPreviewTarget(inspection,relative))throw Error('No runnable Vite frontend detected.');
   await report(8,1,'Creating the reviewed first local Git commit…');
   expectedSha=await prepareBaseline(state.controller.signal);
   cancelled(state);
   inspection=await stack.scan(key,{driver});
   cancelled(state);
   if(!expectedSha||inspection.sha!==expectedSha)throw Error('Initial Git revision changed after commit; rescan and retry.');
  }
  if(!/^[a-f0-9]{40,64}$/i.test(String(inspection.sha||'')))throw Error('Git repository has no initial commit. Review and commit project source before Install & Run.');
  if(expectedSha&&inspection.sha!==expectedSha)throw Error('Git revision changed since the previous scan. Nothing was modified; retry after refreshing the repository.');
  // Local application edits are valid development state: do not stash, reset,
  // switch branches or commit them behind the user's back. Run in-place instead.
  const dirty=inspection.clean!==true;
  // Bundled Windows projects use the normal checkout and ephemeral mock overlay;
  // do not switch away from the branch that receives dependency bundles.
  const bundlePolicy=process.platform==='win32'&&process.arch==='x64'?await fs.readFile(path.join(key,'vendor','windows-x64','bundle-policy.json'),'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return null;throw error;}):null;
  const preserveCheckout=bundlePolicy?.schema===1&&bundlePolicy.required===true&&bundlePolicy.platform==='win32'&&bundlePolicy.arch==='x64';
  if(driver.localLogs().running)throw Error('Stop the currently managed application before Install & Run.');
  const chosen=selectPreviewTarget(inspection,relative);
  if(!chosen){
   const detected=(inspection.targets||[]).filter(x=>x.runnable).map(x=>x.relative+': '+x.framework).join(', ');
   // Older ATGV starter branches have a root-level package and do not contain
   // TechCockpit's independently deployable frontend and backend.  Never
   // silently replace a dirty repository or run the starter as TechCockpit.
   const rootManifest=await fs.readFile(path.join(key,'package.json'),'utf8').then(JSON.parse,()=>null);
   if(rootManifest?.name==='atgv-react-api-sqlite' && path.basename(key)==='tech-cockpit')
     throw Error('This local tech-cockpit checkout is an obsolete ATGV starter, NOT the current TechCockpit monorepo. Your changes are preserved. Back up the checkout, clone GitHub main into the configured repository folder, and retry Save Stack. The current source must contain ReactTS_Frontend/package.json, ReactTS_Frontend/vite.config.ts, and NestJS_Backend/package.json.');
   throw Error('No runnable Vite frontend detected. Install & Run will not open an API-only /api/v1/health page. Detected: '+(detected||'none')+'. Verify the frontend package.json dev script and vite.config.ts.');
  }
  // Explicit live mode must fail before creating preview fixtures or changing Git.
  if(fullStackMode==='live'){
   const requestedPair=fullStack.detectPair(inspection);
   fullStack.modeForPair(requestedPair,requestedPair?await fullStack.hasEnvironment(key,requestedPair.backend):false,'live');
  }
  // Discard stale manually selected API URLs. The browser must always open
  // the detected frontend root, never the NestJS health endpoint.
  const selectedUrl=relative===chosen.relative&&previewUrl?stack.loopbackPreview(previewUrl):null;
  const url=selectedUrl&&new URL(selectedUrl).pathname==='/'&&new URL(selectedUrl).port===new URL(chosen.previewUrl).port?selectedUrl:stack.loopbackPreview(chosen.previewUrl);
  const analysis=await repairs.analyse(key,inspection);
  if(typeof onAiReview==='function'){
   await report(17,1,'1/6 AI reviewing application architecture and blockers (advisory only)…',true);
   try{analysis.modelReview=await onAiReview(inspection,analysis);}
   catch{await report(19,1,'AI advisory unavailable; verified manifest analysis remains authoritative.',false);}
   await report(21,1,'1/6 Repository analysis finished. Continuing with verified local actions…');
  }
  cancelled(state);
  await report(24,2,preserveCheckout?'2/6 Keeping the project Git branch for future pulls…':dirty?'2/6 Preserving local edits and running in-place (no stash, reset, branch switch, or commit)…':'2/6 Preparing isolated local fix branch; main remains untouched…');
  let branch=inspection.branch;
  if(preserveCheckout){
   await report(45,3,'3/6 Using current Git checkout and ephemeral preview overlay; no local fix branch.');
  }else if(dirty){
   await report(45,3,'3/6 Existing uncommitted files are preserved. No Git operations will modify this checkout.');
  }else if(/^fix\/atgv-custom-stack-[a-f0-9]{10}$/.test(branch)){
   await assertPreviewScaffold(key);
   await report(40,3,'3/6 Reusing existing verified local mock code and commit on '+branch+'…');
  }else{
   if(!inspection.branch)throw Error('Detached Git checkout cannot be fixed automatically.');
   const result=await repairs.createFixBranch(key,{expectedSha:inspection.sha,driver,
    report:async message=>report(35,2,message)});
   branch=result.branch;
   await report(45,3,'3/6 Mock-service code and synthetic database committed locally on '+branch+'. No GitHub push.');
  }
  cancelled(state);
  const after=await stack.scan(key,{driver});
  if(after.branch!==branch||!after.sha||(!dirty&&!after.clean)||
     (dirty&&after.sha!==inspection.sha)||(!dirty&&branch===inspection.branch&&after.sha!==inspection.sha))
   throw Error('Local branch/revision verification failed. No service was started.');
  if(!dirty&&!preserveCheckout)await assertPreviewScaffold(key);
  const fullStackPair=fullStack.detectPair(after);
  const hasBackendEnv=fullStackPair ? await fullStack.hasEnvironment(key,fullStackPair.backend) : false;
  let runMode=fullStack.modeForPair(fullStackPair,hasBackendEnv,fullStackMode);
  let backendFallback=false;
  await report(56,4,runMode==='live'?'4/6 Checking existing frontend and backend dependencies…':'4/6 Checking existing application dependencies…');
  const inspected=await driver.inspectScripts(key);
  const dependencyTarget=inspected.targets.find(x=>x.relative===chosen.relative&&x.kind===chosen.kind);
  if(!dependencyTarget)throw Error('Application target changed after creating the local fix branch.');
  await dependencies.ensureForTarget(key,dependencyTarget,{signal:state.controller.signal,
   onProgress:async message=>{cancelled(state);await report(61,4,message);}});
  if(runMode==='live'||(preserveCheckout&&fullStackPair)){
   try{
    const backendTarget=inspected.targets.find(x=>x.relative===fullStackPair.backend.relative&&x.kind===fullStackPair.backend.kind);
    if(!backendTarget)throw Error('NestJS backend disappeared during install.');
    await dependencies.ensureForTarget(key,backendTarget,{signal:state.controller.signal,
     onProgress:async message=>{cancelled(state);await report(67,4,'Backend: '+message);}});
   }catch(error){
    cancelled(state);
    if(preserveCheckout||fullStackMode!=='auto')throw error;
    runMode='preview';backendFallback=true;
    await report(69,4,'Real backend dependencies were unavailable. Continuing with Vite frontend and clearly marked synthetic API; no real database claim.');
   }
  }
  cancelled(state);
  await report(76,5,runMode==='live'?'5/6 Starting real NestJS API and Vite frontend…':'5/6 Launching Vite frontend with isolated mock API/database fixtures…');
  let result;
  if(runMode==='live'){
   try{
    result=await fullStack.run(key,{inspection:after,pair:fullStackPair,driver,
     onProgress:async message=>{cancelled(state);await report(82,5,message);}});
    state.started=true;
   }catch(error){
    cancelled(state);
    if(fullStackMode!=='auto')throw error;
    // Full-stack runner cleans up its own child processes after failure.
    // Show the actual UI using isolated mock handlers instead of a dead API page.
    runMode='preview';backendFallback=true;
    await report(83,5,'Real NestJS/PostgreSQL health did not verify. Starting Vite with synthetic API instead; real backend is NOT running.');
   }
  }
  if(runMode==='preview'){
   result=await stack.run(key,{sha:after.sha,relative:chosen.relative,previewUrl:url,mock:true,mockDatabase:true,driver,
    onProgress:async message=>{cancelled(state);await report(84,5,message);}});
   state.started=true;
  }
  cancelled(state);
  await report(93,6,runMode==='live'?'6/6 Verifying real NestJS/PostgreSQL and Vite frontend…':'6/6 Verifying ATGV-owned localhost mock preview…');
  if(runMode==='live'){
   if(!fullStack.isActive())throw Error('Real frontend or backend exited during full-stack verification.');
  }else if(!driver.localLogs().running)throw Error('Vite mock preview exited during verification.');
  cancelled(state);
  const updated=await stack.scan(key,{driver});
  updated.analysis=await repairs.analyse(key,updated);
  if(analysis.modelReview)updated.analysis.modelReview=analysis.modelReview;
  updated.branches=await repairs.branches(key,{driver});
  await report(100,6,runMode==='live'?'Real frontend, backend and PostgreSQL health verified.':'Frontend and mock API preview verified. All six steps complete; use Stop to terminate it.');
  const runningUrl=runMode==='live'?result.frontendUrl:url;
  if(new URL(runningUrl).pathname!=='/' || !runningUrl)throw Error('Frontend URL verification failed; refusing to open an API endpoint.');
  return {...result,relative:chosen.relative,sha:updated.sha,running:true,url:runningUrl,frontendUrl:runningUrl,
   apiUrl:runMode==='live'?result.apiUrl:new URL('/api/v1/health',url).toString(),branch,inspection:updated,mode:runMode,
   localChangesPreserved:dirty,backendFallback,
   message:runMode==='live'?result.message+' Local branch: '+branch+(dirty?' (uncommitted changes preserved).':'.'):
    'MOCK DATA ONLY · Vite frontend and simulated API running on '+branch+' at '+runningUrl+'. Synthetic database, not real PostgreSQL; external integrations unverified. No GitHub push.'+
    (backendFallback?' Real backend could not start; Vite mock preview was used instead.':'')+
    (dirty?' Uncommitted changes preserved; development handoff remains blocked until committed.':''),
   steps:steps.slice()};
 }catch(error){
  if(state.started)await driver.stopLocal().catch(()=>{});
  throw error;
 }finally{
  if(running.get(key)===state)running.delete(key);
 }
}
function beginConsent(root){
 const key=path.resolve(root);
 if(awaitingConsent.has(key)||running.has(key))throw Error('Custom Stack workflow already pending.');
 awaitingConsent.set(key,false);
}
function endConsent(root){
 const key=path.resolve(root),cancelled=awaitingConsent.get(key)===true;
 awaitingConsent.delete(key);
 return cancelled;
}
function cancel(root){
 const key=path.resolve(root),state=running.get(key);
 if(state){state.controller.abort();return true;}
 if(awaitingConsent.has(key)){awaitingConsent.set(key,true);return true;}
 return false;
}
function isPending(root){return running.has(path.resolve(root));}
module.exports={installAndRun,selectPreviewTarget,beginConsent,endConsent,cancel,isPending,steps};
