'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const repo=require('../src/architect-repository');
test('Scan Folder remembers per-project selection, explicit scan permits changing it',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-project-scan-'));
 const memory=new Map(),state={get:key=>memory.get(key),update:async(key,value)=>memory.set(key,value)};
 try{
  const parent=path.join(root,'repository'),a=path.join(parent,'app-a'),b=path.join(parent,'app-b');
  await fs.mkdir(path.join(a,'.git'),{recursive:true});
  await fs.mkdir(path.join(b,'.git'),{recursive:true});
  const first=await repo.chooseCustomFolder(state,'one',{projectRoot:root,forceChoose:true,chooseFolder:async folders=>{
   assert.deepEqual(folders.map(x=>x.label),['app-a','app-b']);return b;
  }});
  assert.equal(first,b);
  assert.equal(await repo.chooseCustomFolder(state,'one',{projectRoot:root}),b);
  assert.equal(await repo.chooseCustomFolder(state,'one',{projectRoot:root,forceChoose:true,chooseFolder:async(folders,previous)=>{assert.equal(previous,b);return a;}}),a);
  await assert.rejects(repo.chooseCustomFolder(state,'one',{projectRoot:root,forceChoose:true,chooseFolder:async()=>undefined}),/cancelled/);
  assert.equal(await repo.chooseCustomFolder(state,'one',{projectRoot:root}),a);
  await assert.rejects(repo.chooseCustomFolder(state,'two',{projectRoot:root}),/More than one/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
