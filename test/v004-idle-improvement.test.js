'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,readdir,rm}=require('node:fs/promises');
const path=require('node:path'),os=require('node:os');
const m=require('../src/idle-improvement');
const repo={name:'aidilazharo/aiatech-assist',owner:'aidilazharo',repo:'aiatech-assist'};
function state(){const data=new Map();return {get:(k,d)=>data.get(k)??d,update:async(k,v)=>{data.set(k,v);}};}
function api({write=true,reported=false}={}){
 const calls=[],request=async(_repo,_token,method,suffix,body)=>{
  calls.push({method,suffix,body});
  if(method==='GET'&&suffix==='')return {status:200,body:{full_name:repo.name,default_branch:'main',permissions:{push:true}}};
  if(method==='GET'&&suffix.startsWith('/git/ref/'))return {status:200,body:{object:{sha:'a'.repeat(40)}}};
  if(method==='POST'&&suffix==='/git/refs')return {status:write?201:403,body:{}};
  if(method==='DELETE'&&suffix.startsWith('/git/refs/'))return {status:204,body:null};
  if(method==='GET'&&suffix.startsWith('/issues?'))return {status:200,body:reported?[{number:45,title:'Error in ATGV',html_url:'https://github.com/aidilazharo/aiatech-assist/issues/45',body:'Known failure'}]:[]};
  throw Error('Unexpected API call: '+method+' '+suffix);
 };return {request,calls};
}
test('local time slot obeys Malaysia noon and UTC difference',()=>{
 assert.equal(m.localSlot(new Date('2026-11-21T04:15:00Z'),'Asia/Kuala_Lumpur').hour,12);
 assert.equal(m.localSlot(new Date('2026-11-21T05:00:00Z'),'Asia/Kuala_Lumpur').hour,13);
 assert.equal(m.localSlot(new Date('2026-11-21T04:15:00Z'),'UTC').hour,4);
});
test('unified .atgv/src/error-logs captures and redacts runtime failures',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atgv-errors-'));
 try{
  const layout=await m.ensureLayout(root);
  assert.equal(layout.logs,path.join(root,'.atgv','src','error-logs'));
  assert.equal(layout.extension,path.join(root,'.atgv','src','extension'));
  assert.equal(layout.library,path.join(root,'.atgv','src','library'));
  await m.captureRuntimeError(root,'GitHub','GitHub API failed with token: github_pat_demo_test_token_12345');
  await m.captureRuntimeError(root,'Jira','Jira request failed: HTTP 403');
  await m.captureRuntimeError(root,'AI','AI model returned an exception');
  await m.captureRuntimeError(root,'Developer','Developer tests failed');
  await m.captureRuntimeError(root,'BA','BR mapping failed');
  assert.equal((await m.readLogs(layout.logs)).length,5);
  const names=await readdir(layout.logs);
  assert.equal(names.length,5);
  const raws=await Promise.all(names.map(n=>require('node:fs/promises').readFile(path.join(layout.logs,n),'utf8')));
  assert.ok(raws.some(x=>x.includes('[REDACTED]')));
  assert.ok(raws.every(x=>!x.includes('github_pat_demo_test_token_12345')));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('read/write PAT test creates and deletes a probe ref',async()=>{
 const mock=api(),res=await m.probePat(repo,'dummy-secret-not-real',{request:mock.request,random:()=> 'unit-test'});
 assert.equal(res.ok,true);
 assert.deepEqual(mock.calls.map(x=>x.method),['GET','GET','POST','DELETE']);
 assert.equal(mock.calls[2].body.ref,'refs/heads/atgv-permission-check-unit-test');
});
test('PAT read-only disables automatic processing and retains error evidence',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atgv-maint-')),s=state(),mock=api({write:false});
 try{
  const layout=await m.ensureLayout(root);
  await m.writeLog(root,{target:'extension',category:'error',title:'Error in ATGV',observed:'New failure'});
  let changed=false;const manager={run:async()=>{changed=true},store:{add:async()=>{changed=true}}};
  const args={workspace:root,manager,getRepository:async()=> 'https://github.com/aidilazharo/aiatech-assist',
   getToken:async()=> 'dummy-secret-not-real',isIdle:async()=>true,globalState:s,zone:'Asia/Kuala_Lumpur',
   now:()=>new Date('2026-11-21T04:15:00Z'),request:mock.request};
  assert.equal((await m.runWindow(args)).status,'disabled-read-only');
  assert.equal(changed,false);assert.equal((await m.readLogs(layout.logs)).length,1);
  assert.equal((await m.runWindow(args)).status,'disabled-read-only');
  assert.equal(mock.calls.filter(x=>x.method==='POST').length,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('already reported GitHub issue deletes only matching log',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atgv-maint-')),s=state(),mock=api({reported:true});
 try{
  const layout=await m.ensureLayout(root);await m.writeLog(root,{target:'extension',title:'Error in ATGV',observed:'Known failure'});
  let changed=false;const manager={run:async()=>{changed=true},store:{add:async()=>{changed=true}}};
  const result=await m.runWindow({workspace:root,manager,getRepository:async()=> 'https://github.com/aidilazharo/aiatech-assist',
   getToken:async()=> 'dummy-secret-not-real',isIdle:async()=>true,globalState:s,zone:'Asia/Kuala_Lumpur',
   now:()=>new Date('2026-11-21T04:15:00Z'),request:mock.request});
  assert.equal(result.duplicates,1);assert.equal(changed,false);assert.deepEqual(await readdir(layout.logs),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('outside noon window and busy process do not touch GitHub',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atgv-maint-')),s=state(),mock=api();
 try{
  const args={workspace:root,manager:{},getRepository:async()=>{throw Error('GitHub must not be contacted');},
   getToken:async()=>'',isIdle:async()=>false,globalState:s,zone:'Asia/Kuala_Lumpur',request:mock.request};
  assert.equal((await m.runWindow({...args,now:()=>new Date('2026-11-21T03:15:00Z')})).status,'outside-window');
  assert.equal((await m.runWindow({...args,now:()=>new Date('2026-11-21T04:15:00Z')})).status,'busy');
  assert.equal(mock.calls.length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('new errors are checked after an earlier empty noon scan',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atgv-noon-')),s=state(),mock=api({reported:true});
 try{
  const manager={run:async()=>{throw Error('Coding should not run')},store:{add:async()=>{throw Error('Coding should not run')}}};
  const opts={workspace:root,manager,getRepository:async()=> 'https://github.com/aidilazharo/aiatech-assist',
   getToken:async()=> 'dummy-secret-not-real',isIdle:async()=>true,globalState:s,
   zone:'Asia/Kuala_Lumpur',now:()=>new Date('2026-11-21T04:15:00Z'),request:mock.request};
  assert.equal((await m.runWindow(opts)).status,'empty');
  await m.writeLog(root,{target:'extension',category:'error',title:'Error in ATGV',observed:'Known failure'});
  const result=await m.runWindow(opts);
  assert.equal(result.status,'complete');
  assert.equal(result.duplicates,1);
  assert.equal((await m.readLogs(path.join(root,'.atgv','src','error-logs'))).length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
