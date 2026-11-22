'use strict';
// One user-approved local Custom Stack workflow. Never pushes or modifies main.
const fs=require('node:fs/promises');
const path=require('node:path');
const {setTimeout:sleep}=require('node:timers/promises');
const custom=require('./architect-custom-stack');
const repair=require('./architect-custom-repair');
const developer=require('./developer-git');
const dependency=require('./stack-dependency-helper');
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
function cancelled(state){
 if(state.controller.signal.aborted)throw Error('Custom Stack Install & Run cancelled. Local branch and committed mock fixtures are preserved.');
}
async function assertPreviewScaffold(root){
 for(const name of ['README.md','mock-services.mjs','mock-database.json']){
  const file=path.join(root,'atgv-preview',name);
  const stat=await fs.lstat(file).catch(()=>null);
  if(!stat?.isFile()||stat.isSymbolicLink())throw Error('Existing fix branch has missing or unsafe ATGV preview fixture '+name+'. Repair manually; no files were overwritten.');
 }
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
 driver=developer,stack=custom,repairs=repair,dependencies=dependency,onAiReview=null}={}){
 const key=path.resolve(root);
 if(running.has(key))throw Error('Custom Stack Install & Run is already in progress.');
 const state={controller:new AbortController(),started:false};
 running.set(key,state);
 const report=async(percent,step,message,ai=false)=>onProgress({percent,step,message,ai});
 try{
  await report(7,1,'1/6 Scanning verified Git repository and detecting application targets…');
  const inspection=await stack.scan(key,{driver});
  cancelled(state);
  if(expectedSha&&inspection.sha!==expectedSha)throw Error('Git revision changed since the previous scan. Nothing was modified; retry after refreshing the repository.');
  if(!inspection.clean)throw Error('Local checkout has uncommitted changes. Preserve or commit them before Install & Run.');
  if(driver.localLogs().running)throw Error('Stop the currently managed application before Install & Run.');
  const chosen=inspection.targets.find(x=>x.relative===relative&&x.runnable)||(!relative?inspection.targets.find(x=>x.runnable):null);
  if(!chosen)throw Error('No runnable application was detected for the selected Custom Stack target.');
  if(!chosen.mockable&&!/NestJS/i.test(chosen.framework))
   throw Error('Automated synthetic service preview currently supports detected Vite and NestJS applications. No incomplete mock runner was started.');
  const url=stack.loopbackPreview(relative===chosen.relative&&previewUrl?previewUrl:chosen.previewUrl);
  if(!chosen.mockable&&new URL(url).pathname!=='/api/v1/health')
   throw Error('NestJS synthetic API preview must use /api/v1/health.');
  const analysis=await repairs.analyse(key,inspection);
  if(typeof onAiReview==='function'){
   await report(17,1,'1/6 AI reviewing application architecture and blockers (advisory only)…',true);
   try{analysis.modelReview=await onAiReview(inspection,analysis);}
   catch{await report(19,1,'AI advisory unavailable; verified manifest analysis remains authoritative.',false);}
   await report(21,1,'1/6 Repository analysis finished. Continuing with verified local actions…');
  }
  cancelled(state);
  await report(24,2,'2/6 Creating isolated local fix branch; main remains untouched…');
  let branch=inspection.branch;
  if(/^fix\/atgv-custom-stack-[a-f0-9]{10}$/.test(branch)){
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
  if(after.branch!==branch||!after.clean)throw Error('Fix-branch verification failed. No service was started.');
  await assertPreviewScaffold(key);
  await report(56,4,'4/6 Installing and validating application dependencies…');
  const inspected=await driver.inspectScripts(key);
  const dependencyTarget=inspected.targets.find(x=>x.relative===chosen.relative&&x.kind===chosen.kind);
  if(!dependencyTarget)throw Error('Application target changed after creating the local fix branch.');
  await dependencies.ensureForTarget(key,dependencyTarget,{signal:state.controller.signal,
   onProgress:async message=>{cancelled(state);await report(61,4,message);}});
  cancelled(state);
  await report(76,5,'5/6 Launching isolated mock services with synthetic database fixtures…');
  let result;
  if(chosen.mockable){
   result=await stack.run(key,{sha:after.sha,relative:chosen.relative,previewUrl:url,mock:true,mockDatabase:true,driver,
    onProgress:async message=>{cancelled(state);await report(82,5,message);}});
   state.started=true;
  }else{
   await driver.runMockServices(key,{relative:chosen.relative,previewUrl:url});
   state.started=true;
   result={running:true,url,mockPreview:true,mockDatabase:true,relative:chosen.relative,framework:chosen.framework,sha:after.sha};
  }
  cancelled(state);
  await report(93,6,'6/6 Verifying ATGV-owned localhost mock preview…');
  if(!chosen.mockable)await verifyMock(url,driver,key,chosen.relative,state);
  else if(!driver.localLogs().running)throw Error('Vite mock preview exited during verification.');
  cancelled(state);
  const updated=await stack.scan(key,{driver});
  updated.analysis=await repairs.analyse(key,updated);
  if(analysis.modelReview)updated.analysis.modelReview=analysis.modelReview;
  updated.branches=await repairs.branches(key,{driver});
  await report(100,6,'Mock preview verified. All six steps complete; use Stop to terminate it.');
  return {...result,running:true,url,branch,inspection:updated,
   message:'MOCK DATA ONLY · Local preview running on '+branch+' at '+url+'. Synthetic database, not real PostgreSQL; external integrations unverified. No push to GitHub.',
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
module.exports={installAndRun,beginConsent,endConsent,cancel,isPending,steps};
