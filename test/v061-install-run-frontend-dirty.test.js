'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const workflow=require('../src/architect-custom-workflow');
const custom=require('../src/architect-custom-stack');
const developer=require('../src/developer-git');
const BACKEND={relative:'NestJS_Backend',kind:'npm',runnable:true,role:'backend',framework:'NestJS',mockApi:true,previewUrl:'http://127.0.0.1:3000/api/v1/health'};
const FRONTEND={relative:'ReactTS_Frontend',kind:'npm',runnable:true,role:'frontend',framework:'React / Vite',mockable:true,previewUrl:'http://127.0.0.1:5173/'};
test('Install & Run never chooses an API-only mock when frontend is absent',()=>{
 assert.equal(workflow.selectPreviewTarget({targets:[BACKEND]},BACKEND.relative),null);
 assert.equal(workflow.selectPreviewTarget({targets:[BACKEND,FRONTEND]},BACKEND.relative),FRONTEND);
});
test('dirty repo runs existing Vite app without branch switching or committing source files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv061-dirty-'));
 const changes=[];
 const original=path.join(root,'user-working-file.ts');
 await fs.writeFile(original,'LOCAL USER WORK -- DO NOT MODIFY\n');
 let running=false;const sha='a'.repeat(40);
 const inspected={root,sha,branch:'fix/atgv-custom-stack-aabbccddee',clean:false,targets:[BACKEND,FRONTEND]};
 const stack={scan:async()=>{changes.push('scan');return {...inspected};},loopbackPreview:custom.loopbackPreview,
  run:async(_root,options)=>{changes.push('vite');running=true;
   assert.equal(options.relative,FRONTEND.relative);assert.equal(options.previewUrl,FRONTEND.previewUrl);
   return {running:true,url:options.previewUrl,relative:FRONTEND.relative,mockPreview:true,mockDatabase:true,sha};}};
 const repairs={analyse:async()=>({inventory:[],observations:[]}),branches:async()=>({current:inspected.branch,items:[inspected.branch]}),
  createFixBranch:async()=>{throw Error('MUST NOT MODIFY BRANCH');}};
 const driver={localLogs:()=>({running}),inspectScripts:async()=>({targets:[{kind:'npm',relative:FRONTEND.relative,scripts:['dev']}]}),
  stopLocal:async()=>{running=false;}};
 try{
  const result=await workflow.installAndRun(root,{expectedSha:sha,relative:BACKEND.relative,
   previewUrl:BACKEND.previewUrl,stack,repairs,driver,dependencies:{ensureForTarget:async()=>({installed:true})}});
  assert.equal(result.frontendUrl,'http://127.0.0.1:5173/');
  assert.equal(result.apiUrl,'http://127.0.0.1:5173/api/v1/health');
  assert.equal(result.localChangesPreserved,true);
  assert.equal(result.relative,FRONTEND.relative);
  assert.equal(result.inspection.clean,false);
  assert.deepEqual(changes.filter(x=>x!=='scan'),['vite']);
  assert.equal(await fs.readFile(original,'utf8'),'LOCAL USER WORK -- DO NOT MODIFY\n');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('TechCockpit monorepo detects real ReactTS_Frontend plus NestJS_Backend from separate manifests',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv061-monorepo-'));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try{
  git('init','-b','main');git('config','user.name','ATGV Test');git('config','user.email','atgv@example.invalid');
  for(const item of [BACKEND,FRONTEND])await fs.mkdir(path.join(root,item.relative));
  await fs.writeFile(path.join(root,FRONTEND.relative,'package.json'),JSON.stringify({name:'tech-cockpit-web',scripts:{dev:'vite --host 127.0.0.1'},dependencies:{react:'^19'},devDependencies:{vite:'^8'}}));
  await fs.writeFile(path.join(root,FRONTEND.relative,'vite.config.ts'),'export default {};');
  await fs.writeFile(path.join(root,BACKEND.relative,'package.json'),JSON.stringify({name:'tech-cockpit-api',scripts:{'start:dev':'nest start --watch'},dependencies:{'@nestjs/core':'^11'}}));
  git('add','.');git('commit','-m','fixture');
  const info=await custom.scan(root,{driver:developer});
  assert.equal(info.targets.length,2);
  assert.equal(info.targets[0].relative,FRONTEND.relative);
  assert.equal(info.targets[0].mockable,true);
  assert.equal(info.targets[1].relative,BACKEND.relative);
  assert.equal(info.targets[1].mockApi,true);
  assert.equal(workflow.selectPreviewTarget(info,BACKEND.relative).relative,FRONTEND.relative);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('host gates and UI open a frontend URL only; development handoff stays strict',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const start=host.indexOf("case 'architectCustomInstallRun':{");
 const end=host.indexOf("case 'architectCustomRun':{",start);
 const block=host.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(block,/if\(!inspected\.clean\)throw Error/);
 assert.match(block,/workflow\.selectPreviewTarget/);
 assert.match(block,/const frontend=String\(result\.frontendUrl/);
 assert.match(block,/eligible\?handoff\.previewEvidence/);
 assert.match(block,/local-preview-only/);
 assert.match(ui,/previewUrl:String\(m\.value\.frontendUrl\|\|''\)/);
});
test('automatic live startup failure still opens the Vite frontend with explicit synthetic fallback',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv061-live-fallback-'));
 let running=false;const sha='e'.repeat(40);
 const inspection={root,sha,branch:'fix/atgv-custom-stack-1122334455',clean:false,targets:[BACKEND,FRONTEND]};
 const pair={frontend:FRONTEND,backend:BACKEND};
 const calls=[];
 const fullStack={detectPair:()=>pair,hasEnvironment:async()=>true,modeForPair:()=> 'live',
  run:async()=>{calls.push('live-failed');throw Error('Cannot establish PostgreSQL session');},
  isActive:()=>false};
 const stack={scan:async()=>inspection,loopbackPreview:custom.loopbackPreview,
  run:async(_root,{previewUrl})=>{calls.push('mock-vite');running=true;
   return {running:true,url:previewUrl,relative:FRONTEND.relative,mockPreview:true,mockDatabase:true,sha};}};
 const driver={localLogs:()=>({running}),inspectScripts:async()=>({targets:[{kind:'npm',relative:FRONTEND.relative,scripts:['dev']},{kind:'npm',relative:BACKEND.relative,scripts:['start:dev']}]}),stopLocal:async()=>{running=false;}};
 const repairs={analyse:async()=>({inventory:[],observations:[]}),branches:async()=>({items:[inspection.branch]})};
 try{
  const result=await workflow.installAndRun(root,{expectedSha:sha,relative:BACKEND.relative,
   stack,driver,fullStack,repairs,dependencies:{ensureForTarget:async()=>({installed:true})}});
  assert.deepEqual(calls,['live-failed','mock-vite']);
  assert.equal(result.mode,'preview');assert.equal(result.backendFallback,true);
  assert.equal(result.frontendUrl,'http://127.0.0.1:5173/');
  assert.match(result.message,/Real backend could not start/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
