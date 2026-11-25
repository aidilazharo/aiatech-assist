'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {once}=require('node:events');
const {execFileSync}=require('node:child_process');
const workflow=require('../src/architect-custom-workflow');
const custom=require('../src/architect-custom-stack');

test('the Node API mock starts and serves HTTP independently of the extension host executable',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv mock api '));
 const developer=require('../src/developer-git'),repair=require('../src/architect-custom-repair');
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init','-b','main');
  git('config','user.name','ATGV Test');
  git('config','user.email','atgv@example.invalid');
  await fs.writeFile(path.join(root,'package.json'),'{"name":"atgv-test-api","scripts":{"start":"node api.js"},"dependencies":{"express":"^5"}}\n');
  git('add','package.json');git('commit','-m','Create API fixture');
  const sha=git('rev-parse','HEAD');
  await repair.createFixBranch(root,{expectedSha:sha});
  const socket=net.createServer();
  const listening=once(socket,'listening');
  socket.listen(0,'127.0.0.1');
  await listening;
  const url='http://127.0.0.1:'+socket.address().port+'/api/v1/health';
  await new Promise((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
  const original=process.execPath;
  process.execPath=path.join(root,'unusable-extension-host');
  try{await developer.runMockServices(root,{previewUrl:url});}
  finally{process.execPath=original;}
  let response;
  for(let attempt=0;attempt<30&&!response;attempt++){
   response=await fetch(url,{signal:AbortSignal.timeout(1000)}).catch(()=>null);
   if(!response)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(response?.ok,developer.localLogs().logs||'Mock API did not answer');
  assert.equal(response.headers.get('x-atgv-mock-data'),'true');
  const health=await response.json();
  assert.equal(health.status,'mock');
  assert.equal(health.database,'simulated');
  assert.equal(developer.localLogs().previewUrl,url);
  assert.equal(git('rev-parse','main'),sha);
 }finally{
  await developer.stopLocal();
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});

test('Install & Run performs ordered scan, local commit, dependency check and verified synthetic preview',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-install-run-'));
 let sha='a'.repeat(40),branch='main',running=false;
 const actions=[],progress=[];
 const target={relative:'web',kind:'npm',role:'frontend',framework:'React / Vite',mockable:true,runnable:true,
   previewUrl:'http://127.0.0.1:5173/'};
 const driver={
  localLogs:()=>({running}),
  inspectScripts:async()=>({targets:[{relative:'web',kind:'npm',scripts:['dev']}]}),
  stopLocal:async()=>{running=false;}
 };
 const stack={
  scan:async()=>{actions.push('scan');return {root,sha,branch,clean:true,targets:[target]};},
  loopbackPreview:custom.loopbackPreview,
  run:async(_root,options)=>{
   actions.push('preview');
   assert.equal(options.mock,true);
   assert.equal(options.mockDatabase,true);
   running=true;
   return {running:true,url:options.previewUrl,mockPreview:true,mockDatabase:true};
  }
 };
 const repairs={
  analyse:async()=>({inventory:[],observations:[]}),
  branches:async()=>({current:branch,items:['main',branch]}),
  createFixBranch:async()=>{
   actions.push('branch-and-commit');
   branch='fix/atgv-custom-stack-'+sha.slice(0,10);sha='b'.repeat(40);
   await fs.mkdir(path.join(root,'atgv-preview'));
   await fs.writeFile(path.join(root,'atgv-preview','README.md'),'SYNTHETIC DATA');
   await fs.writeFile(path.join(root,'atgv-preview','mock-services.mjs'),require('../src/architect-custom-repair').PREVIEW_SERVICE);
   await fs.writeFile(path.join(root,'atgv-preview','mock-database.json'),'{"synthetic":true}');
   return {branch};
  }
 };
 const dependencies={ensureForTarget:async()=>{actions.push('dependencies');return {verified:true};}};
 try{
  const result=await workflow.installAndRun(root,{expectedSha:'a'.repeat(40),relative:'web',
   stack,repairs,driver,dependencies,onAiReview:async()=>({summary:'Advisory only'}),
   onProgress:async entry=>progress.push(entry)});
  assert.equal(result.running,true);
  assert.equal(result.branch,branch);
  assert.equal(result.steps.length,6);
  assert.equal(result.inspection.analysis.modelReview.summary,'Advisory only');
  assert.deepEqual(actions.filter(x=>x!=='scan'),['branch-and-commit','dependencies','preview']);
  assert.deepEqual([...new Set(progress.map(x=>x.step))],[1,2,3,4,5,6]);
  assert.ok(progress.some(x=>x.ai===true));
  assert.equal(workflow.isPending(root),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Dirty checkout and an unsupported target fail before any branch modification',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-install-blocked-'));
 let touched=false;
 const driver={localLogs:()=>({running:false})};
 const repairs={createFixBranch:async()=>{touched=true;}};
 try{
  await assert.rejects(workflow.installAndRun(root,{
   stack:{scan:async()=>({sha:'c'.repeat(40),clean:false,targets:[]})},
   driver,repairs
  }),/No runnable Vite frontend detected/);
  assert.equal(touched,false);
  assert.equal(workflow.isPending(root),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Consolidated UI keeps only one visible Install & Run execution control',async()=>{
 const html=await fs.readFile(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const host=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(html,/id="architectCustomSteps"/);
 assert.match(html,/id="architectCustomAiWave"/);
 // Scan is discovery-only; keep it visible while execution stays consolidated.
 assert.match(html,/id="architectCustomScan" class="secondary" type="button">Scan Repository<\/button>/);
 assert.equal((html.match(/id="architectCustomRun"/g)||[]).length,1);
 assert.match(html,/id="architectCustomRun" type="button" disabled>Install &amp; Run<\/button>/);
 assert.match(ui,/send\('architectCustomScan',\{projectId:activeId,scanId:\+\+architectCustomScanSequence\}\)/);
 for(const id of ['architectCustomPull','architectCustomMockRun','architectCustomStop'])
  assert.match(html,new RegExp('id="'+id+'" class="secondary hidden"'));
 assert.match(ui,/singleRun\.textContent=stopMode\?'Stop':'Install & Run'/);
 assert.match(ui,/send\('architectCustomInstallRun'/);
 assert.match(host,/case 'architectCustomInstallRun':\{/);
 assert.match(host,/workflow\.cancel\(root\)/);
});
