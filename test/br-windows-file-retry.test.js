'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {replaceFileWithRetry}=require('../src/file-lock');
const error=code=>Object.assign(new Error(code),{code});
test('Windows rename retries the same atomic replacement without deleting the existing register',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-lock-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const target=path.join(dir,'br-register.json'),temp=target+'.tmp';
 await fs.writeFile(target,'old');await fs.writeFile(temp,'new');
 let calls=0,checks=0;const waited=[];
 await replaceFileWithRetry(temp,target,{check:async()=>{checks++;assert.equal(await fs.readFile(target,'utf8'),'old');},
  rename:async(a,b)=>{calls++;if(calls<4)throw error(['EPERM','EBUSY','EACCES'][calls-1]);await fs.rename(a,b);},
  wait:async ms=>waited.push(ms)});
 assert.equal(calls,4);assert.equal(checks,4);assert.deepEqual(waited,[50,100,200]);
 assert.equal(await fs.readFile(target,'utf8'),'new');
 await assert.rejects(fs.stat(temp),{code:'ENOENT'});
});
test('persistent lock fails safely with the existing register intact',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-lock-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const target=path.join(dir,'br-register.json'),temp=target+'.tmp';
 await fs.writeFile(target,'old');await fs.writeFile(temp,'new');
 let calls=0;
 await assert.rejects(replaceFileWithRetry(temp,target,{rename:async()=>{calls++;throw error('EPERM');},wait:async()=>{},delays:[1,2]}),/existing file was preserved/);
 assert.equal(calls,3);assert.equal(await fs.readFile(target,'utf8'),'old');assert.equal(await fs.readFile(temp,'utf8'),'new');
});
test('revision changes and permanent non-lock errors are never retried',async()=>{
 let calls=0;
 await assert.rejects(replaceFileWithRetry('temp','target',{check:async()=>{if(calls)throw Error('BR register changed while saving.');},rename:async()=>{calls++;throw error('EBUSY');},wait:async()=>{}}),/BR register changed/);
 assert.equal(calls,1);
 calls=0;
 await assert.rejects(replaceFileWithRetry('temp','target',{rename:async()=>{calls++;throw error('ENOSPC');},wait:async()=>{throw Error('should not retry');}}),{code:'ENOSPC'});
 assert.equal(calls,1);
});
