'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const stack=require('../src/architect-custom-fullstack');
const pair={frontend:{relative:'ReactTS_Frontend',kind:'npm',role:'frontend',framework:'React / Vite',mockable:true,runnable:true},
 backend:{relative:'NestJS_Backend',kind:'npm',role:'backend',framework:'NestJS',mockable:false,runnable:true}};
const inspection={sha:'a'.repeat(40),targets:[pair.backend,pair.frontend]};
test('detects Vite and NestJS pair despite the backend listing first',()=>{
 assert.deepEqual(stack.detectPair(inspection),pair);
 assert.equal(stack.detectPair({targets:[pair.backend]}),null);
});
test('live mode requires verified configuration and never silently downgrades explicit live',()=>{
 assert.equal(stack.modeForPair(pair,false,'auto'),'preview');
 assert.equal(stack.modeForPair(pair,true,'auto'),'live');
 assert.equal(stack.modeForPair(pair,true,'preview'),'preview');
 assert.throws(()=>stack.modeForPair(pair,false,'live'),/requires/);
});
test('rejects synthetic API response when checking real PostgreSQL readiness',()=>{
 const res={ok:true,status:200,headers:{get:name=>name==='x-atgv-mock-data'?'true':null}};
 assert.throws(()=>stack.assertRealHealth(res,{status:'mock',database:'simulated'}),/synthetic/);
 assert.doesNotThrow(()=>stack.assertRealHealth({...res,headers:{get:()=>null}},{status:'ok',database:'up'}));
 assert.throws(()=>stack.assertRealHealth({...res,headers:{get:()=>null}},{status:'ok',database:'simulated'}),/real PostgreSQL/);
});
test('manages and stops both backend and frontend with distinct URLs and logs',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-v060-'));
 const backend=path.join(root,'NestJS_Backend');const frontend=path.join(root,'ReactTS_Frontend');
 fs.mkdirSync(backend);fs.mkdirSync(frontend);fs.writeFileSync(path.join(backend,'.env'),'DB_HOST=example.invalid\n');
 const children=[];
 let pid=10000;
 function spawnImpl(bin,args,options){
  const child=new EventEmitter();child.pid=++pid;child.exitCode=null;child.signalCode=null;
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  child.kill=()=>{child.exitCode=0;child.emit('exit',0,null);};
  children.push({bin,args,options,child});process.nextTick(()=>child.emit('spawn'));return child;
 }
 const response=(status,type,body)=>({ok:status===200,status,headers:{get:name=>name==='content-type'?type:null},
  json:async()=>body,text:async()=>body});
 const fetchImpl=async url=>url.includes('/health')?response(200,'application/json',{status:'ok',database:'up'}):
  response(200,'text/html','<html><div id="root"></div><script src="/src/main.tsx"></script></html>');
 try{
  const result=await stack.run(root,{inspection,pair,driver:{localLogs:()=>({running:false})},spawnImpl,fetchImpl,checkPort:async()=>true});
  assert.equal(result.mode,'live');assert.equal(result.mockDatabase,false);
  assert.match(result.frontendUrl,/5173/);assert.match(result.apiUrl,/3000/);
  assert.equal(children.length,2);assert.match(children[0].options.cwd,/NestJS_Backend/);
  assert.match(children[1].options.cwd,/ReactTS_Frontend/);
  assert.equal(stack.log().processes.length,2);
  assert.equal(stack.isActive(),true);
  const stopped=await stack.stop();assert.equal(stopped.stopped,true);
  assert.equal(stack.hasManagedSession(),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
