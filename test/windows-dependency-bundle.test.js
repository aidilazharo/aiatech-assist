'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const bundle=require('../src/windows-dependency-bundle');
test('Windows bundle policy blocks missing publication instead of invoking npm',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-bundle-test-'));
 try{
  const cwd=path.join(root,'ReactTS_Frontend'),dir=path.join(root,'vendor','windows-x64');
  await fs.mkdir(cwd);await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'bundle-policy.json'),JSON.stringify({schema:1,platform:'win32',arch:'x64',nodeMajor:24,required:true,applications:['ReactTS_Frontend']}));
  let calls=0;const runner=async()=>{calls++;throw Error('Unexpected process');};
  assert.equal(await bundle.prepare(root,cwd,{platform:'linux',arch:'x64',runner}),null);
  await assert.rejects(bundle.prepare(root,cwd,{platform:'win32',arch:'x64',runner}),/not published/);
  assert.equal(calls,0);
  const file=path.join(cwd,'package.json');
  await fs.writeFile(file,'{"name":"example"}\n');const hash=await bundle.fingerprint(file);
  await fs.writeFile(file,'{\r\n  "name": "example"\r\n}\r\n');
  assert.equal(await bundle.fingerprint(file),hash);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
