'use strict';
// Runs the approved application without switching the shared Developer checkout.
const path=require('node:path');
const developer=require('./developer-git');
const bootstrap=require('./architect-stack-bootstrap');
const diagnostic=require('./stack-process-diagnostics');
const dependencies=require('./stack-dependency-helper');
const preview=require('./architect-preview-worktree');
const previewRoots=new Map();
const previewUrls=new Map();
const identity=(root,stackId)=>path.resolve(root)+'|'+stackId;
async function targetFor(root,stackId,driver=developer){
 const config=driver.catalogStackConfig?await driver.catalogStackConfig(stackId):await bootstrap.stackConfig(root,stackId);
 const url=config.previewUrl;
 if(!url)throw Error('No localhost preview is configured for this technology stack.');
 const inspection=await driver.inspectScripts(root);
 if(inspection.targets.length!==1)throw Error('Expected exactly one application target in the selected project repository.');
 const target=inspection.targets[0];
 if(!['dev','start','run'].some(script=>target.scripts?.includes(script)))throw Error('The application has no runnable script.');
 return {url,inspection,target,cwd:path.join(inspection.repo.root,target.relative)};
}
async function status({root,stackId,driver=developer}={}){
 if(!root||!stackId)return {running:false,message:'Save a stack to enable the application server.'};
 const source=previewRoots.get(identity(root,stackId))||root;
 const entry=driver.localLogs();
 // No checkout switch or preview creation for a read-only status query.
 if(!entry.running)return {running:false,message:'App server stopped'};
 let target;
 try{target=await targetFor(source,stackId,driver);}catch{return {running:false,message:'App server unavailable'};}
 const running=path.resolve(entry.cwd||'')===path.resolve(target.cwd);
 const actualUrl=running?(entry.previewUrl||previewUrls.get(identity(root,stackId))||target.url):target.url;
 return {running,otherRunning:!running,url:actualUrl,sha:target.inspection.repo.sha||'',branch:target.inspection.repo.branch||'',relative:target.target.relative,message:running?'App server running · '+actualUrl:'Another ATGV-managed app server is running. Run Server can switch to this stack.'};
}
async function start({root,stackId,prepared,driver=developer,openBrowser=async()=>true,allowManagedHandoff=false,effects={}}={}){
 if(!prepared||prepared.stackId!==stackId||path.resolve(prepared.root||'')!==path.resolve(root||''))throw Error('Save the selected technology stack in this project repository first.');
 const baseline=await driver.inspectScripts(root);
 let launchRoot=root,isolated=false;
 if(baseline.repo.branch!==prepared.branch){
  // The approved branch is materialized at its verified commit in a separate worktree.
  // The currently selected Developer branch, staged files and untracked files are untouched.
  const makePreview=effects.prepareWorktree||preview.prepare;
  const result=await makePreview({root,branch:prepared.branch,sha:prepared.sha});
  launchRoot=result.root;isolated=true;
 }else if(!baseline.repo.clean)throw Error('The approved stack checkout contains uncommitted changes. Run the approved revision from an isolated preview instead.');
 const {url:configuredUrl,inspection,target,cwd}=await targetFor(launchRoot,stackId,driver);
 let url=prepared.previewUrl||configuredUrl;
 if(!isolated&&inspection.repo.branch!==prepared.branch)throw Error('The current checkout changed during server startup. Retry.');
 if(driver===developer)await (effects.ensureDependencies||dependencies.ensureForTarget)(launchRoot,target,{onDiagnostic:effects.onDiagnostic||(async()=>{}),onProgress:effects.onProgress||(async()=>{})});
 else if(!target.installed)throw Error('Dependencies are missing. Save Stack automatically installs the approved dependencies; complete Save Stack first.');
 let prior=driver.localLogs(),handedOff=false;
 if(prior.running&&path.resolve(prior.cwd||'')!==path.resolve(cwd)){
  if(!allowManagedHandoff)throw Error('A different app server is running. Confirm switching the ATGV-managed server before starting this stack.');
  // Only stop the exact ATGV-tracked child that was visible at handoff time;
  // never enumerate/kill processes by port, and never touch unrelated services.
  const latest=driver.localLogs();
  if(!latest.running||path.resolve(latest.cwd||'')!==path.resolve(prior.cwd||'')||latest.pid!==prior.pid)
   throw Error('The existing app server changed while preparing the handoff. Retry Run Server.');
  await driver.stopLocal();
  if(driver.localLogs().running)throw Error('The previous ATGV-managed server is still stopping. Retry after it exits.');
  handedOff=true;prior=driver.localLogs();
 }
 let started=false;
 try{
  if(!prior.running){
   const portAvailable=effects.portAvailable||bootstrap.portAvailable;
   let available=await portAvailable(url);
   if(!available&&handedOff){
    const waitForPortRelease=effects.waitForPortRelease||(async()=>{
     for(let attempt=0;attempt<8;attempt++){
      await new Promise(resolve=>setTimeout(resolve,250));
      if(await portAvailable(url))return true;
     }
     return false;
    });
    available=await waitForPortRelease(url);
   }
   if(!available){
    const choice=await bootstrap.chooseAvailablePreviewUrl(url,{portAvailable,allocatePort:effects.allocatePort||bootstrap.allocateEphemeralPort});
    url=choice.url;
   }
   await driver.runLocal(launchRoot,{relative:target.relative,env:{},previewUrl:url});started=true;
  }else url=prior.previewUrl||previewUrls.get(identity(root,stackId))||url;
  await (effects.waitForHttp||bootstrap.waitForHttp)(url,()=>driver.localLogs().running);
  if(await openBrowser(url)===false)throw Error('The app started but VS Code could not open an external browser.');
  previewRoots.set(identity(root,stackId),launchRoot);
  previewUrls.set(identity(root,stackId),url);
  return {...await status({root,stackId,driver}),url,healthy:true,message:'App server running · '+url+(url!==configuredUrl?' · alternate available port selected':'')+(handedOff?' · switched from previous ATGV-managed app':'')+(isolated?' · isolated approved-revision preview (Developer branch unchanged)':'')};
 }catch(error){
  const latest=driver.localLogs();
  if(latest?.cwd&&path.resolve(latest.cwd)===path.resolve(cwd))error.diagnosticLogs=[error.diagnosticLogs||'','Preview URL: '+url,diagnostic.capture({stage:'application startup / health',bin:latest.command||'application',cwd,logs:latest.logs,exitCode:latest.exitCode,signal:latest.signal})].filter(Boolean).join('\n\n');
  if(started)await driver.stopLocal().catch(()=>{});
  throw error;
 }
}
async function verify({root,stackId,driver=developer,effects={}}={}){
 const state=await status({root,stackId,driver});
 if(!state.running||!state.url)return {...state,healthy:false};
 try{
  await (effects.waitForHttp||bootstrap.waitForHttp)(state.url,()=>driver.localLogs().running,3500);
  // A second read prevents racing a server exit, checkout change or another
  // process acquiring the port while the HTTP probe was in flight.
  const checked=await status({root,stackId,driver});
  if(!checked.running||checked.sha!==state.sha||checked.branch!==state.branch||checked.url!==state.url)return {...checked,healthy:false,message:'App server changed during verification.'};
  return {...checked,healthy:true};
 }catch(error){return {...state,healthy:false,message:'Application server verification failed: '+error.message};}
}
async function stop({root,stackId,driver=developer}={}){
 const source=previewRoots.get(identity(root,stackId))||root;
 const entry=driver.localLogs();
 if(!entry.running)return {running:false,message:'App server is already stopped.'};
 const target=await targetFor(source,stackId,driver);
 if(path.resolve(entry.cwd||'')!==path.resolve(target.cwd))throw Error('Another project owns the running server. It was not stopped.');
 await driver.stopLocal();
 return {running:false,url:entry.previewUrl||previewUrls.get(identity(root,stackId))||target.url,message:'App server stopped.'};
}
module.exports={targetFor,status,verify,start,stop};
