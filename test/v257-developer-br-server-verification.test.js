'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const server=require('../src/developer-br-server');
const developerGit=require('../src/developer-git');
const source=fss.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const client=fss.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const listen=()=>new Promise(resolve=>{const app=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('generated BR 007');});app.listen(0,'127.0.0.1',()=>resolve(app));});
const close=app=>new Promise(resolve=>app.close(resolve));
test('health targets are local only and optional API health is checked separately',()=>{
 assert.deepEqual(server.healthEndpoints('http://127.0.0.1:5173/','http://127.0.0.1:3001'),[
  {kind:'frontend',url:'http://127.0.0.1:5173/'},{kind:'API',url:'http://127.0.0.1:3001/api/health'}]);
 assert.equal(server.healthEndpoints('http://localhost:3000/api/health','http://localhost:3000')[0].url,'http://localhost:3000/api/health');
 for(const url of ['http://malicious.example','file:///tmp/app','http://user:pass@127.0.0.1:3000','https://127.0.0.1:5173/'])assert.equal(server.localhostUrl(url),'');
 assert.throws(()=>server.healthEndpoints('https://external.example/'),/valid localhost/);
});
test('preflight blocks port collisions to avoid verifying an unrelated application',async()=>{
 const urls=server.healthEndpoints('http://127.0.0.1:5173/','http://127.0.0.1:3001');
 let calls=0;
 await assert.rejects(()=>server.requireFreePorts(urls,{portBound:async url=>{calls++;return url.includes('3001');}}),/port 3001 is already occupied/);
 assert.equal(calls,2);
 await server.requireFreePorts(urls,{portBound:async()=>false});
});
test('HTTP verification binds a healthy endpoint to the generated BR worktree and PID',async()=>{
 const app=await listen(),address=app.address(),root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v257-health-'));
 const endpoint=[{kind:'frontend',url:`http://127.0.0.1:${address.port}/`}];
 try{
  const proof=await server.waitForGeneratedServer({endpoints:endpoint,worktree:root,pid:4321,readServer:()=>({pid:4321,cwd:root,running:true,logs:'listening'}),timeoutMs:1500,pollMs:10});
  assert.equal(proof.url,endpoint[0].url);assert.equal(proof.healthy,true);
  await assert.rejects(()=>server.waitForGeneratedServer({endpoints:endpoint,worktree:root,pid:4321,readServer:()=>({pid:4322,cwd:root,running:true,logs:'other server'}),timeoutMs:500}),/no longer matches/);
  await assert.rejects(()=>server.waitForGeneratedServer({endpoints:endpoint,worktree:root,pid:4321,readServer:()=>({pid:4321,cwd:os.tmpdir(),running:true,logs:'other repo'}),timeoutMs:500}),/no longer matches/);
 }finally{await close(app);await fs.rm(root,{recursive:true,force:true});}
});
test('short failed HTTP readiness check preserves a useful server diagnostic',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v257-fail-'));
 try{
  await assert.rejects(()=>server.waitForGeneratedServer({endpoints:[{kind:'frontend',url:'http://127.0.0.1:9/'}],worktree:root,pid:12,readServer:()=>({pid:12,cwd:root,running:true,logs:'ERR_CONNECTION_REFUSED'}),timeoutMs:250,pollMs:35}),error=>/health checks/.test(error.message)&&/ERR_CONNECTION_REFUSED/.test(error.serverLogs));
  await assert.rejects(()=>server.waitForGeneratedServer({endpoints:[{kind:'frontend',url:'http://127.0.0.1:9/'}],worktree:root,pid:12,readServer:()=>({pid:12,cwd:root,running:false,exitCode:1,logs:'EADDRINUSE'}),timeoutMs:250}),/exited before becoming healthy.*Exit code 1/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('actual BR worktree server launches the generated code and remains running until stopped',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v257-run-'));const original=path.join(base,'repo'),worktree=path.join(base,'generated');
 await fs.mkdir(original);const git=(...args)=>execFileSync('git',['-C',original,...args],{encoding:'utf8'}).trim();
 const probeApp=await listen(),port=probeApp.address().port;await close(probeApp);
 try{
  git('init','-b','main');git('config','user.email','unit@example.invalid');git('config','user.name','Unit Test');
  await fs.writeFile(path.join(original,'package.json'),JSON.stringify({name:'dev-br-verification',version:'1.0.0',scripts:{dev:'node server.js',test:'node --test',build:'node --check server.js'}},null,2));
  await fs.writeFile(path.join(original,'server.js'),"require('node:http').createServer((_req,res)=>res.end('original')).listen(Number(process.env.PREVIEW_PORT),'127.0.0.1');\n");
  git('add','package.json','server.js');git('commit','-m','approved baseline');
  git('worktree','add','-b','feature/br-007-test','--',worktree);
  await fs.mkdir(path.join(worktree,'node_modules')); // installed dependency directory is required by runLocal
  await fs.writeFile(path.join(worktree,'server.js'),"require('node:http').createServer((_req,res)=>res.end('BR-007 generated application')).listen(Number(process.env.PREVIEW_PORT),'127.0.0.1');\n");
  const url=`http://127.0.0.1:${port}/`,endpoints=server.healthEndpoints(url);
  await server.requireFreePorts(endpoints);
  const started=await developerGit.runLocal(worktree,{env:{PREVIEW_PORT:String(port)}});
  const proof=await server.waitForGeneratedServer({endpoints,worktree,pid:started.pid,readServer:developerGit.localLogs,timeoutMs:10000,pollMs:120});
  assert.equal(proof.healthy,true);
  assert.equal(await (await fetch(url)).text(),'BR-007 generated application');
  assert.equal(developerGit.localLogs().running,true);
 }finally{await developerGit.stopLocal();await fs.rm(base,{recursive:true,force:true,maxRetries:4,retryDelay:100}).catch(()=>{});}
});
test('Developer UI exposes retry, server output and completion remains separate from Jira',()=>{
 for(const marker of ['developerBrRetryLocal','data-developer-br-tab="server"','developerBrOpenPreview','developerManualTickets'])assert.match(source,new RegExp(marker));
 for(const command of ['developerBrRetryLocal','developerBrLogs','developerBrLogState'])assert.match(source,new RegExp(command));
 assert.match(client,/developerBrServerLogs/);
 assert.match(source,/launchGeneratedBrServer/);
 assert.match(source,/developerBRServer\.waitForGeneratedServer/);
});
