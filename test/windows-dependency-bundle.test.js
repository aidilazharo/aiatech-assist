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

test('tar preflight rejects unsafe archive entries',()=>{
 const details=(type,size,name)=>type+'rw-r--r--  0 0 0 '+size+' Nov 26 10:00 '+name;
 const file='node_modules/pkg/index.js',dir='node_modules/';
 bundle.validateTarListings(dir+'\n'+file+'\n',details('d',0,dir)+'\n'+details('-',20,file)+'\n');
 for(const name of ['../escape','node_modules/../escape','node_modules/CON.txt','node_modules/pkg\\escape','node_modules/x:stream']){
  assert.throws(()=>bundle.validateTarListings(name+'\n',details('-',1,name)+'\n'),/archive path/i);
 }
 assert.throws(()=>bundle.validateTarListings(file+'\n',details('l',1,file)+'\n'),/entry type/);
 assert.throws(()=>bundle.validateTarListings(file+'\n'+file.toUpperCase()+'\n',details('-',1,file)+'\n'+details('-',1,file.toUpperCase())+'\n'),/path/i);
 assert.throws(()=>bundle.validateTarListings(file+'\n',details('-',4294967297,file)+'\n'),/expansion/);
});
test('partial offline publication fails closed when policy file is missing',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-partial-bundle-'));
 try{
  const cwd=path.join(root,'ReactTS_Frontend'),dir=path.join(root,'vendor','windows-x64');
  await fs.mkdir(cwd);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'manifest.json'),'{}');
  const runner=async()=>{throw Error('Unexpected process');};
  await assert.rejects(bundle.prepare(root,cwd,{platform:'win32',arch:'x64',runner}),/npm installation is disabled/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('healthy existing Windows modules skip archive extraction even without an ATGV marker',async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'atgv-bundle-existing-')));
 try{
  const app='ReactTS_Frontend',cwd=path.join(root,app),dir=path.join(root,'vendor','windows-x64');
  await fs.mkdir(path.join(cwd,'node_modules'),{recursive:true});await fs.mkdir(dir,{recursive:true});
  for(const name of ['package.json','package-lock.json'])await fs.writeFile(path.join(cwd,name),'{}');
  const digest='a'.repeat(64),fingerprint=await bundle.fingerprint(path.join(cwd,'package.json'));
  const policy={schema:1,platform:'win32',arch:'x64',required:true,nodeMajor:24,applications:[app]};
  await fs.writeFile(path.join(dir,'bundle-policy.json'),JSON.stringify(policy));
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({...policy,applications:{[app]:{archiveSha256:digest,packageSha256:fingerprint,lockSha256:fingerprint,chunks:[{}]}}}));
  let probes=0,checks=0;
  const options={platform:'win32',arch:'x64',runner:async(bin,args)=>{probes++;assert.equal(args[0],'-p');return {stdout:'win32 x64 24.0.0'};},checkExisting:async()=>{checks++;return true;}};
  const result=await bundle.prepare(root,cwd,options);
  assert.equal(result.restored,false);assert.equal(probes,1);assert.equal(checks,1);
  await assert.rejects(bundle.prepare(root,cwd,{...options,checkExisting:async()=>false}),/Invalid bundle chunk metadata/);
  await fs.writeFile(path.join(cwd,'package-lock.json'),'{"changed":true}');
  await assert.rejects(bundle.prepare(root,cwd,options),/does not match/);
  assert.equal(checks,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
