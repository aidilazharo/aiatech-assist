'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const reports=require('../src/architect-error-logs');
const processDiagnostic=require('../src/stack-process-diagnostics');
const workflow=require('../src/architect-simple-workflow');
const developer=require('../src/developer-git');
const server=require('../src/architect-server');

const ref='atgv-test-'+process.pid;
test('Error report saves multiple stages and masks credentials',()=>{
 reports.begin(ref,'save');
 reports.append(ref,'save','Stage: npm install\n//registry.npmjs.org/:_authToken=abc123exampletoken\nAuthorization: Bearer ABCD123456789000');
 reports.append(ref,'save',processDiagnostic.capture({stage:'npm install',bin:'npm',args:['install','--ignore-scripts'],cwd:'/project/apps/web',stderr:'npm ERR! ECONNRESET',exitCode:1}));
 reports.store({projectId:ref,kind:'save',stackId:'react',error:Error('Install failed'),details:'https://username:token@example.com/private?token=12345'});
 const content=reports.get(ref,'save').content;
 for(const expected of ['npm install','ECONNRESET','Exit code: 1','Install failed','[REDACTED]'])assert.ok(content.includes(expected),expected);
 for(const secret of ['abc123exampletoken','ABCD123456789000','username:token','token=12345'])assert.ok(!content.includes(secret),secret);
 assert.equal(reports.get(ref,'test'),null);
 assert.match(reports.filename(ref,'save'),/\.log$/);
 reports.clear(ref,'save');assert.equal(reports.get(ref,'save'),null);
});

test('Supported log kinds include Save, Reset, Test, Server, approval and catalog failures',()=>{
 for(const kind of ['save','reset','test','server','approval','catalog']){
  reports.begin(ref,kind);
  reports.store({projectId:ref,kind,error:'failure from '+kind});
  assert.match(reports.get(ref,kind).content,new RegExp('failure from '+kind));
  reports.clear(ref,kind);
 }
 assert.throws(()=>reports.store({projectId:ref,kind:'other',error:'bad'}),/Unknown/);
});

test('npm installation failure captures npm stdout, stderr, command and exit code',async t=>{
 if(process.platform==='win32')return t.skip('POSIX mock npm executable');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v189-npm-'));
 try{
  const repo=path.join(folder,'repo'),bin=path.join(folder,'bin');
  await fs.mkdir(repo);await fs.mkdir(bin);await fs.mkdir(path.join(repo,'apps','web'),{recursive:true});
  execFileSync('git',['init','-b','main',repo],{stdio:'ignore'});
  const script=path.join(bin,'npm');
  await fs.writeFile(script,'#!/bin/sh\nprintf "npm-check stdout\\n"\nprintf "npm ERR! simulated registry failure\\n" >&2\nexit 17\n',{mode:0o755});
  const original=process.env.PATH;
  let output='';
  try{
   process.env.PATH=bin+path.delimiter+original;
   await assert.rejects(workflow.installNodeDependencies(repo,'apps/web',{onDiagnostic:chunk=>{output+=chunk;}}),err=>{
    assert.match(err.message,/npm install failed/);
    assert.match(err.diagnosticLogs,/npm ERR! simulated registry failure/);
    return true;
   });
  }finally{process.env.PATH=original;}
  for(const item of ['Command: npm install --ignore-scripts','npm-check stdout','npm ERR! simulated registry failure','Exit code: 17'])assert.ok(output.includes(item),item);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('Test & Run diagnostics include npm test failure stdout stderr and exit status',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v189-test-'));
 try{
  execFileSync('git',['init','-b','main',folder],{stdio:'ignore'});
  await fs.writeFile(path.join(folder,'package.json'),JSON.stringify({name:'atgv-demo',version:'1.0.0',scripts:{test:'node fail.js',build:'node fail.js',dev:'node fail.js'}}));
  await fs.writeFile(path.join(folder,'fail.js'),"console.log('test stdout info');console.error('test stderr info');process.exit(23);\n");
  await fs.mkdir(path.join(folder,'node_modules'));
  let trace='';
  const result=await developer.executeLocal(folder,{operation:'test',onDiagnostic:chunk=>{trace+=chunk;}});
  assert.equal(result.passed,false);
  assert.match(trace,/Command: [^\r\n]*npm(?:-cli\.js)? run test/);
  for(const item of ['test stdout info','test stderr info','Exit code: 23'])assert.ok(trace.includes(item),item);
  assert.equal(result.diagnosticLogs,trace);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('UI exposes downloadable log for Save Stack, Test & Run, Run and Stop Server',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const frontend=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(host,/id="architectDownloadUnifiedLog"/);
 assert.match(frontend,/architectDownloadUnifiedLog/);
 for(const id of ['architectDownloadStackLog','architectDownloadTestLog','architectDownloadServerLog']){
  assert.ok(!host.includes('id="'+id+'"'),id+' must not appear');
  assert.ok(!frontend.includes("$('"+id+"')"),id+' should have no listener');
 }
 for(const cmd of ['architectSaveStack','architectTestStack','architectRunServer','architectStopServer'])assert.match(host,new RegExp(cmd+":'(?:save|test|server)'"));
 assert.match(host,/showSaveDialog/);
 assert.match(host,/workspace\.fs\.writeFile/);
 assert.match(host,/const kind='all'/);
});

test('unified report preserves chronological redacted errors after successful retries',()=>{
 const project=ref+'-unified',other=project+'-other';
 for(const [kind,message] of [['save','Port 5173 occupied'],['test','Build script failed'],['server','HTTP health timeout'],['catalog','Catalog fetch failed']]){
  reports.begin(project,kind);
  reports.append(project,kind,'Stage: '+message);
  reports.store({projectId:project,kind,stackId:'react',error:Error(message+' access_token=secret1')});
  reports.clear(project,kind);
 }
 reports.begin(other,'save');
 reports.store({projectId:other,kind:'save',error:'Unrelated project failure'});
 const combined=reports.get(project,'all');
 assert.ok(combined);
 assert.equal(combined.count,4);
 assert.equal(reports.count(project),4);
 for(const word of ['Port 5173 occupied','Build script failed','HTTP health timeout','Catalog fetch failed'])
  assert.ok(combined.content.includes(word),word);
 assert.ok(!combined.content.includes('Unrelated project failure'));
 assert.ok(!combined.content.includes('secret1'));
 assert.ok(combined.content.indexOf('Port 5173 occupied')<combined.content.indexOf('Catalog fetch failed'));
 assert.match(reports.filename(project,'all'),/unified-errors-/);
 assert.equal(reports.get('missing-project','all'),null);
});

test('port conflict is reported in server stage, not a build failure',()=>{
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const bootstrap=require('node:fs').readFileSync(path.join(__dirname,'../src/architect-stack-bootstrap.js'),'utf8');
 assert.match(bootstrap,/Build checks passed; checking application server preview port/);
 assert.match(ui,/checking application server preview port/);
 assert.match(ui,/live\.failed=msg\.failedStep\|\|live\.active/);
});



test('Run Server reports captured npm startup errors and exit metadata',async()=>{
 let running=false;
 const driver={
  catalogStackConfig:async()=>({previewUrl:'http://127.0.0.1:5173/'}),
  inspectScripts:async()=>({repo:{root:'/tmp/atgv-diagnostics',branch:'bootstrap/react-initial',clean:true},targets:[{relative:'',kind:'npm',installed:true,scripts:['dev','build','test']}]}),
  localLogs:()=>({running,cwd:'/tmp/atgv-diagnostics',command:'npm run dev',logs:'[stderr] npm ERR! startup failure',exitCode:18,signal:null}),
  runLocal:async()=>{running=true;},stopLocal:async()=>{running=false;}
 };
 await assert.rejects(server.start({root:'/tmp/atgv-diagnostics',stackId:'react',prepared:{root:'/tmp/atgv-diagnostics',stackId:'react',branch:'bootstrap/react-initial'},driver,effects:{portAvailable:async()=>true,waitForHttp:async()=>{throw Error('HTTP readiness timed out');}}}),error=>{
  assert.match(error.message,/HTTP readiness timed out/);
  for(const item of ['npm ERR! startup failure','npm run dev','Exit code: 18','http://127.0.0.1:5173/'])assert.ok(error.diagnosticLogs.includes(item),item);
  return true;
 });
 assert.equal(running,false,'Only project-owned server is stopped after failure');
});
