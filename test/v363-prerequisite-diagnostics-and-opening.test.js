'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const readiness=require('../src/lib/startup-readiness');
const diagnostics=require('../src/lib/startup-diagnostics');
const read=async file=>fs.readFile(path.join(__dirname,'..',file),'utf8');

test('Windows prerequisite scan finds a newly installed JDK even when VS Code PATH is stale',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-temurin-check-'));
 try{
  const jdk=path.join(temp,'Eclipse Adoptium','jdk-25.0.1-hotspot','bin','java.exe');
  await fs.mkdir(path.dirname(jdk),{recursive:true});
  await fs.writeFile(jdk,'');
  const env={ProgramFiles:temp,PATH:'/old-path'};
  const runner=async(command)=>{
   if(command===jdk)return {stdout:'',stderr:'openjdk version "25.0.1" 2025-10-21\n'};
   const err=new Error('Not on PATH');err.code='ENOENT';throw err;
  };
  const found=await readiness.findTrustedWindowsTool('java',{runner,env,fsApi:fs});
  assert.equal(found.installed,true);
  assert.match(found.version,/25\.0\.1/);
  assert.equal(found.discoveredPath,jdk);
  assert.equal(found.source,'trusted install path');
  assert.equal(env.JAVA_HOME,path.dirname(path.dirname(jdk)));
  assert.ok(env.PATH.includes(path.dirname(jdk)));
  const result=await readiness.check({runner,platform:'win32',env,fsApi:fs});
  assert.equal(result.tools.java.installed,true);
  assert.equal(result.stacks.find(s=>s.id==='spring-boot').components.find(c=>c.id==='java').compatible,true);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('unified startup diagnostics persist installations, failures and opening records across reads',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-unified-startup-'));
 try{
  await diagnostics.append(temp,{stage:'prerequisite-install',tool:'java',status:'command-succeeded',command:'winget install --id EclipseAdoptium.Temurin.25.JDK --exact',exitCode:0});
  await diagnostics.append(temp,{stage:'post-install-verification',tool:'java',status:'not-detected',detail:'Restart VS Code and Refresh.'});
  await diagnostics.append(temp,{stage:'project-opening',projectId:'example',status:'failed',detail:'Open an ATGV project first.'});
  const content=await diagnostics.report(temp);
  assert.match(content,/Unified Startup, Prerequisite and Project Opening Diagnostics/);
  assert.match(content,/command-succeeded/);
  assert.match(content,/not-detected/);
  assert.match(content,/project-opening/);
  assert.match(content,/Open an ATGV project first/);
  assert.ok(!content.includes('undefined'));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('troubleshooting log redact tokens and URL credentials',()=>{
 assert.match(diagnostics.safe('Authorization: abcde123'),/Authorization: \[REDACTED\]/);
 assert.match(diagnostics.safe('https://user:secret@host.example.com/path'),/https:\/\/\[REDACTED\]@host.example.com/);
});

test('host verifies installer output before reporting success and exposes download command',async()=>{
 const host=await read('src/lib/runtime/extension-runtime.js');
 assert.match(host,/case 'startupExportUnifiedLog':/);
 assert.match(host,/await exportStartupDiagnostics\(\)/);
 assert.match(host,/startupDiagnostics\.append/);
 assert.match(host,/const checked=await startupReadiness\.check\(\)/);
 assert.match(host,/status:verified\?'verified':'unverified'/);
 assert.match(host,/status:'failed',detail:error\.message,output:error\.installOutput/);
});

test('readiness and installer UI retain the selected stack modal and show the unified log',async()=>{
 const html=await read('src/lib/webview/dashboard-html.js');
 const ui=await read('media/start.js');
 const css=await read('media/start.css');
 for(const id of ['startupUnifiedLog','gateUnifiedLog','startupInstallFeedback']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(ui,/for\(const id of \['startupUnifiedLog','gateUnifiedLog'\]/);
 assert.match(ui,/status==='verified'/);
 assert.match(ui,/status==='manual'/);
 assert.match(ui,/startupLastInstalledTool/);
 assert.match(html,/id="startupStackModal"/);
 assert.match(ui,/if\(startupOpenStackId\)/);
 assert.match(css,/\.atgv-startup-footer/);
});

test('verified project transitions to open before activation refresh and rolls back on error',async()=>{
 const host=await read('src/lib/runtime/extension-runtime.js');
 const start=host.indexOf('async function openVerifiedProject()');
 const part=host.slice(start,host.indexOf('async function rememberOpened',start));
 assert.match(part,/openingFlow\.opened\(\);\s*try\{await activateProject\(p\.id\);\}/);
 assert.match(part,/openingFlow\.phase='initialized'/);
 assert.match(part,/stage:'project-opening',projectId:p\.id,status:'failed'/);
});
