'use strict';
// Custom Stack development-only handoff: validated application test/build results
// and a live ATGV-owned synthetic preview, pinned to one clean Git commit.
// No production database, identity-provider or external-service claim is made.
const path=require('node:path');
const custom=require('./architect-custom-stack');
const developer=require('./developer-git');
const dependencies=require('./stack-dependency-helper');
const SHA=/^[a-f0-9]{40}$/;
const FIX=/^fix\/atgv-custom-stack-[a-f0-9]{10}$/;
function matches(project){
 const prep=project?.techStackPrepared,preview=project?.techStackCustomPreview;
 return !!(project?.techStackId==='custom'&&prep?.stackId==='custom'&&SHA.test(prep.sha||'')&&FIX.test(prep.branch||'')&&
  prep.root&&path.isAbsolute(prep.root)&&preview?.status==='verified'&&preview.mockOnly===true&&
  preview.root===prep.root&&preview.sha===prep.sha&&preview.branch===prep.branch&&
  preview.relative!==undefined&&typeof preview.relative==='string'&&
  preview.url===prep.previewUrl&&preview.at);
}
function previewEvidence(root,result){
 const snapshot=result?.inspection;
 if(!result?.running||result.mockPreview!==true||result.mockDatabase!==true||
    !snapshot?.clean||!SHA.test(snapshot.sha||'')||!FIX.test(result.branch||'')||
    result.sha!==snapshot.sha||result.branch!==snapshot.branch||
    path.resolve(root)!==path.resolve(snapshot.root||''))
  throw Error('A clean, committed, ATGV-verified local synthetic preview is required before preparing the Custom Stack handoff.');
 const target=snapshot.targets?.find(x=>x.relative===result.relative&&x.runnable);
 if(!target||(target.mockable!==true&&target.mockApi!==true))
  throw Error('Custom Stack preview target is not a supported verified mock application.');
 const url=custom.loopbackPreview(result.url);
 return {status:'verified',stackId:'custom',root:snapshot.root,branch:snapshot.branch,sha:snapshot.sha,
  relative:target.relative,url,mockOnly:true,at:new Date().toISOString()};
}
async function verifyRuntime(project,inspection,{driver=developer,http=fetch}={}){
 if(!matches(project))throw Error('Install & Run must verify and save a clean Custom Stack mock preview before Developer handoff.');
 const prep=project.techStackPrepared,preview=project.techStackCustomPreview;
 if(inspection.root!==prep.root||inspection.sha!==prep.sha||inspection.branch!==prep.branch||inspection.clean!==true)
  throw Error('The Custom Stack checkout changed after the mock preview. Re-run Install & Run before approval.');
 const target=inspection.targets.find(x=>x.relative===preview.relative&&x.runnable);
 if(!target)throw Error('The verified Custom Stack preview target is missing. Re-run Install & Run.');
 const process=driver.localLogs();
 if(process.running!==true||process.mockPreview!==true||process.head!==prep.sha||
    path.resolve(process.cwd||'')!==path.resolve(prep.root,preview.relative)||
    process.relative!==preview.relative||custom.loopbackPreview(process.previewUrl)!==preview.url)
  throw Error('The ATGV-owned mock preview is not running at the verified Git SHA and localhost URL. Start Install & Run again.');
 const response=await http(preview.url,{redirect:'manual',signal:AbortSignal.timeout(3000)});
 if(!response?.ok||response.status>=300)
  throw Error('The ATGV-owned Custom Stack preview did not pass the current localhost HTTP smoke check.');
 if(target.mockApi&&response.headers?.get?.('x-atgv-mock-data')!=='true')
  throw Error('The backend preview did not identify itself as synthetic ATGV mock data.');
 return {target,process,url:preview.url};
}
async function validate(root,{project,driver=developer,scanner=custom,deps=dependencies,http=fetch,
 onProgress=async()=>{}}={}){
 if(!project||root!==project.techStackPrepared?.root)
  throw Error('Custom Stack handoff must use the saved project repository root.');
 const inspection=await scanner.scan(root,{driver});
 await verifyRuntime(project,inspection,{driver,http});
 const candidates=inspection.targets.filter(t=>t.runnable&&t.role!=='workspace');
 if(!candidates.length)throw Error('No runnable application targets were found for Custom Stack handoff.');
 // The handoff claims each real application has passed tests and build. Do not
 // silently skip a backend or treat "npm install" as equivalent to a test.
 for(const target of candidates){
  if(target.kind==='npm'&&(!target.scripts.includes('test')||!target.scripts.includes('build')))
   throw Error('Custom Stack handoff blocked: '+(target.relative||'repository root')+
    ' must provide both test and build scripts. A mock preview alone is not sufficient.');
 }
 const results=[];
 for(const target of candidates){
  await onProgress('Checking dependencies: '+(target.relative||'repository root'));
  const raw=await driver.inspectScripts(root);
  const current=raw.targets.find(item=>item.relative===target.relative&&item.kind===target.kind);
  if(!current||raw.repo.sha!==inspection.sha||!raw.repo.clean)
   throw Error('Git revision or application targets changed during Custom Stack validation.');
  await deps.ensureForTarget(root,current,{onProgress});
  for(const operation of ['test','build']){
   await onProgress('Running '+operation+' for '+(target.relative||'repository root')+'…');
   const result=await driver.executeLocal(root,{relative:target.relative,operation,
    onDiagnostic:async log=>onProgress(String(log||'').slice(-1200))});
   if(result?.passed!==true||result.head!==inspection.sha)
    throw Error('Custom Stack '+operation+' failed for '+(target.relative||'repository root')+
      ': '+String(result?.logs||'Command failed or revision changed').slice(-1100));
   results.push({relative:target.relative,kind:target.kind,operation,passed:true,
    head:inspection.sha,at:result.at||new Date().toISOString()});
  }
 }
 const after=await scanner.scan(root,{driver});
 await verifyRuntime(project,after,{driver,http});
 if(after.sha!==inspection.sha||!after.clean)
  throw Error('Custom Stack source changed during handoff validation. Re-run Install & Run and tests.');
 await onProgress('All runnable applications passed test/build; the synthetic preview remains healthy.');
 return {status:'tested',scope:'development-mock',stackId:'custom',root:inspection.root,
  branch:inspection.branch,sha:inspection.sha,at:new Date().toISOString(),
  previewRelative:project.techStackCustomPreview.relative,previewUrl:project.techStackCustomPreview.url,
  results,targets:candidates.map(x=>({relative:x.relative,kind:x.kind,framework:x.framework})),
  synthetic:true,liveBackendVerified:false,realDatabaseVerified:false};
}
function approval(project,validation,actor,remote,at=new Date().toISOString()){
 if(!matches(project))throw Error('Custom Stack preview evidence does not match the saved revision.');
 const prep=project.techStackPrepared;
 if(validation?.status!=='tested'||validation.scope!=='development-mock'||validation.stackId!=='custom'||
   validation.root!==prep.root||validation.sha!==prep.sha||validation.branch!==prep.branch||
   validation.previewUrl!==project.techStackCustomPreview.url||!Array.isArray(validation.targets)||!validation.targets.length||
   !Array.isArray(validation.results)||validation.results.length!==validation.targets.length*2)
  throw Error('The full Custom Stack test/build handoff evidence is required for this exact revision.');
 for(const target of validation.targets){
  for(const op of ['test','build']){
   if(!validation.results.some(row=>row.relative===target.relative&&row.operation===op&&
      row.head===prep.sha&&row.passed===true))
    throw Error('Missing successful '+op+' evidence for '+target.relative+'.');
  }
 }
 if(!String(actor||'').trim())throw Error('A verified Solution Architect identity is required for approval.');
 if(remote?.remoteVerified!==true||remote.sha!==prep.sha||!remote.branch)
  throw Error('The approved Custom Stack Git SHA must be verified on a remote handoff branch.');
 return {status:'approved',stackId:'custom',scope:'development-mock',synthetic:true,
  root:prep.root,branch:prep.branch,sha:prep.sha,remoteBranch:remote.branch,
  remoteSha:remote.sha,remoteVerified:true,approvedAt:at,approvedBy:String(actor).trim(),
  targetCount:validation.targets.length,validationAt:validation.at,
  limitations:['Synthetic mock preview only','Real database and external identity/integrations unverified','Not production deployment approval']};
}
function developerAllowed(project){
 const p=project?.techStackPrepared,v=project?.techStackValidation,a=project?.techStackApproval;
 return matches(project)&&p.remotePushed===true&&v?.status==='tested'&&v.scope==='development-mock'&&
  v.stackId==='custom'&&v.sha===p.sha&&v.branch===p.branch&&v.root===p.root&&
  a?.status==='approved'&&a.scope==='development-mock'&&a.synthetic===true&&a.stackId==='custom'&&
  a.sha===p.sha&&a.branch===p.branch&&a.root===p.root&&a.remoteVerified===true&&
  a.remoteSha===p.sha&&Boolean(a.remoteBranch&&a.approvedBy);
}
module.exports={matches,previewEvidence,verifyRuntime,validate,approval,developerAllowed};
