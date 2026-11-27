'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {withLock,lockFile}=require('../src/file-lock');
const error=code=>Object.assign(new Error(code),{code});
test('transient exclusive-open and removal failures are retried without losing the lock',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-lock-retry-'));
 const file=path.join(dir,'document.json'),name=file+'.lock';
 const open=fs.open,rm=fs.rm;
 let opens=0,removes=0;
 const a=t.mock.method(fs,'open',async(...args)=>{
  if(args[0]===name&&++opens===1)throw error('EPERM');
  return open(...args);
 });
 const b=t.mock.method(fs,'rm',async(...args)=>{
  if(args[0]===name&&++removes===1)throw error('EBUSY');
  return rm(...args);
 });
 try{
  await withLock(file,async()=>{assert.ok(JSON.parse(await fs.readFile(name,'utf8')).token);});
  assert.equal(opens,2);assert.equal(removes,2);
  await assert.rejects(fs.stat(name),{code:'ENOENT'});
 }finally{a.mock.restore();b.mock.restore();await fs.rm(dir,{recursive:true,force:true});}
});
test('permanent non-contention filesystem errors are not hidden',async t=>{
 const a=t.mock.method(fs,'open',async()=>{throw error('EINVAL');});
 try{await assert.rejects(lockFile('unused'),{code:'EINVAL'});assert.equal(a.mock.callCount(),1);}
 finally{a.mock.restore();}
});
