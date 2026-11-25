'use strict';
const {logicalCommand}=require('./portable-command-fixture');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const helper=require('../src/stack-dependency-helper');
const pipeline=require('../src/developer-br-pipeline');
async function temp(fn){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v269-native-'));try{return await fn(folder);}finally{await fs.rm(folder,{recursive:true,force:true});}}
async function write(file,content){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof content==='string'?content:JSON.stringify(content));}
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();}
async function prepareRepo(root){execFileSync('git',['init','-q',root]);git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');}

// Controlled synthetic native installation. Test against actual libSQL/Vite on
// the developer's machine occurs during ensureForTarget with the npm registry.
test('Linux BR TDD installs its own native packages and a valid Vite launcher; never links Mac dependencies',async()=>temp(async root=>{
 const original=path.join(root,'approved'),worktree=path.join(root,'br-worktree');
 await fs.mkdir(original);await prepareRepo(original);
 await write(path.join(original,'package.json'),{scripts:{test:'node --test server/api.test.mjs',build:'vite build'},dependencies:{'@libsql/client':'^0.15.0'},devDependencies:{vite:'^7.0.0'}});
 await write(path.join(original,'server/api.test.mjs'),"import test from 'node:test';test('baseline',()=>{});");
 // Deliberately poison original checkout with macOS-only libSQL and a broken shim.
 await write(path.join(original,'node_modules/@libsql/darwin-arm64/package.json'),{name:'@libsql/darwin-arm64'});
 await write(path.join(original,'node_modules/.bin/vite'),'../vite/bin/vite.js');
 await write(path.join(original,'node_modules/libsql/package.json'),{name:'libsql'});
 await write(path.join(original,'node_modules/@libsql/client/package.json'),{name:'@libsql/client'});
 await write(path.join(original,'node_modules/vite/package.json'),{name:'vite'});
 await write(path.join(original,'node_modules/vite/bin/vite.js'),'console.log("fake original Vite launcher");');
 git(original,'add','package.json','server/api.test.mjs');git(original,'commit','-qm','approved');
 await fs.mkdir(worktree);git(original,'worktree','add','--quiet','-b','feature/br-001-linux',worktree,'HEAD');
 // Older release may already have linked original dependency folder: safely unlink it.
 await fs.symlink(path.join(original,'node_modules'),path.join(worktree,'node_modules'));
 let installs=0;const progress=[];
 const originalEnsure=helper.ensureForTarget;
 helper.ensureForTarget=async (_root,target,options)=>{
  assert.equal(target.kind,'npm');assert.equal(options.installMode,'auto');installs++;
  const nm=path.join(worktree,'node_modules');assert.equal(await fs.lstat(nm).then(()=>true,()=>false),false);
  await write(path.join(nm,'@libsql/client/package.json'),{name:'@libsql/client'});
  await write(path.join(nm,'libsql/package.json'),{name:'libsql'});
  await write(path.join(nm,'@libsql/linux-x64-gnu/package.json'),{name:'@libsql/linux-x64-gnu'});
  await write(path.join(nm,'vite/package.json'),{name:'vite'});
  await write(path.join(nm,'vite/bin/vite.js'),'console.log("synthetic Linux Vite");');
  await fs.mkdir(path.join(nm,'.bin'),{recursive:true});await fs.symlink('../vite/bin/vite.js',path.join(nm,'.bin/vite'));
  await options.onProgress('Native package installed for '+process.platform);
  return {verified:true};
 };
 try{
  const prepared=await pipeline.attachDependencies(worktree,original,{onProgress:m=>progress.push(m)});
  assert.equal(prepared.targets.length,1);
  assert.equal(installs,1);
  assert.ok(progress.some(p=>p.includes('Native package')));
  const nm=path.join(worktree,'node_modules');
  assert.ok((await fs.lstat(nm)).isDirectory());
  assert.equal(await helper.nativePlatformMismatch(worktree,{platform:'linux',arch:'x64'}),false);
  const runtime=await helper.verifyPlatformPackages(worktree,{platform:'linux',arch:'x64',libc:'gnu',runner:async()=>({stdout:'ok'})});
  assert.equal(runtime.libsql,'@libsql/linux-x64-gnu');assert.equal(runtime.vite,true);
  assert.equal(await fs.readFile(path.join(original,'node_modules/.bin/vite'),'utf8'),'../vite/bin/vite.js');
  assert.equal(await fs.lstat(path.join(original,'node_modules/@libsql/darwin-arm64/package.json')).then(()=>true),true);
  await pipeline.attachDependencies(worktree,original);assert.equal(installs,1,'already installed worktree is reused');
 }finally{helper.ensureForTarget=originalEnsure;}
}));

test('libSQL native verification rejects wrong-OS copied binary before RED',async()=>temp(async root=>{
 await write(path.join(root,'package.json'),{dependencies:{'@libsql/client':'^0.15'}});
 await write(path.join(root,'node_modules/libsql/package.json'),{name:'libsql'});
 await write(path.join(root,'node_modules/@libsql/darwin-arm64/package.json'),{name:'@libsql/darwin-arm64'});
 await assert.rejects(helper.verifyPlatformPackages(root,{platform:'linux',arch:'x64',libc:'gnu',runner:async()=>({stdout:'ok'})}),/missing @libsql\/linux-x64-gnu/);
}));

test('Vite verification rejects copied text shim and missing executable',async()=>temp(async root=>{
 await write(path.join(root,'package.json'),{devDependencies:{vite:'^7'}});
 await write(path.join(root,'node_modules/vite/bin/vite.js'),'console.log("vite")');
 await write(path.join(root,'node_modules/.bin/vite'),'../vite/bin/vite.js');
 await assert.rejects(helper.verifyPlatformPackages(root,{platform:'linux',arch:'x64',runner:async()=>({stdout:'ok'})}),/Vite launcher is broken/);
}));

test('npm ci is preferred when lockfile exists; fresh npm install includes native optional packages',async()=>temp(async root=>{
 await write(path.join(root,'package.json'),{name:'test-project',version:'1.0.0'});
 const one=await helper.npmInstallPlan(root);
 assert.equal(one.args[0],'install');assert.ok(one.args.includes('--include=optional'));
 await write(path.join(root,'package-lock.json'),{lockfileVersion:3});
 const two=await helper.npmInstallPlan(root);
 assert.equal(two.args[0],'ci');assert.ok(two.args.includes('--include=optional'));
}));

// This test uses the real npm executable but only local file: packages,
// making Linux shim/native selection reproducible without npm registry access.
test('actual Linux npm install creates a working Vite shim and runs tests/build offline', {skip:process.platform!=='linux'},async()=>temp(async root=>{
 const original=path.join(root,'approved'),worktree=path.join(root,'isolated');
 await fs.mkdir(original);await prepareRepo(original);
 const vendor=path.join(original,'vendor');
 await write(path.join(vendor,'vite/package.json'),{name:'vite',version:'0.0.1',bin:{vite:'bin/vite.js'}});
 await write(path.join(vendor,'vite/bin/vite.js'),"#!/usr/bin/env node\nif(process.argv.includes('build')){require('node:fs').mkdirSync('dist',{recursive:true});console.log('synthetic build ok');}else console.log('synthetic vite/0.0.1');");
 await write(path.join(vendor,'libsql/package.json'),{name:'libsql',version:'0.0.1'});
 await write(path.join(vendor,'libsql/index.js'),"module.exports=class {prepare(){return {get(){return {ok:1}}}}close(){}};");
 await write(path.join(vendor,'client/package.json'),{name:'@libsql/client',version:'0.0.1'});
 await write(path.join(vendor,'native/package.json'),{name:'@libsql/linux-x64-gnu',version:'0.0.1',os:['linux'],cpu:['x64']});
 const packageJSON={name:'atgv-offline-linux-tdd',version:'0.0.1',scripts:{test:'node --test test/*.test.mjs',build:'vite build'},dependencies:{'@libsql/client':'file:vendor/client',libsql:'file:vendor/libsql'},optionalDependencies:{'@libsql/linux-x64-gnu':'file:vendor/native'},devDependencies:{vite:'file:vendor/vite'}};
 await write(path.join(original,'package.json'),packageJSON);
 await write(path.join(original,'test/smoke.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';test('app baseline',()=>assert.equal(1,1));");
 git(original,'add','.');git(original,'commit','-qm','approved');
 await fs.mkdir(worktree);git(original,'worktree','add','--quiet','-b','feature/br-001-linux',worktree,'HEAD');
 const checks=[];
 const prepared=await pipeline.attachDependencies(worktree,original,{onProgress:m=>checks.push(m)});
 assert.equal(prepared.targets[0].installed,true);
 const native=path.join(worktree,'node_modules/@libsql/linux-x64-gnu/package.json');
 assert.equal((await fs.lstat(native)).isFile(),true);
 const shim=path.join(worktree,'node_modules/.bin/vite');assert.equal((await fs.lstat(shim)).isSymbolicLink(),true);
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const npmTest=execFileSync('npm',['test'],{cwd:worktree,encoding:'utf8',env});assert.match(npmTest,/pass 1/);
 const npmBuild=execFileSync('npm',['run','build'],{cwd:worktree,encoding:'utf8'});assert.match(npmBuild,/synthetic build ok/);
 assert.equal(await fs.readFile(path.join(original,'package.json'),'utf8'),JSON.stringify(packageJSON));
 assert.ok(checks.some(x=>x.includes('Installing dependencies for linux/')));
}));

test('Solution Architect clears a cross-OS node_modules tree before installing the current platform native optional modules',async()=>temp(async root=>{
 const currentNative=helper.nativeTriple();
 const foreignNative=process.platform==='darwin'?'linux-x64-gnu':'darwin-arm64';
 await write(path.join(root,'package.json'),{dependencies:{'@libsql/client':'^0.15'},devDependencies:{vite:'^7'}});
 await write(path.join(root,'node_modules','@libsql',foreignNative,'package.json'),{name:'@libsql/'+foreignNative});
 await write(path.join(root,'node_modules/libsql/package.json'),{name:'libsql'});
 await write(path.join(root,'node_modules/vite/package.json'),{name:'vite'});
 await write(path.join(root,'node_modules/@libsql/client/package.json'),{name:'@libsql/client'});
 let cleared=false;
 const runner=async(bin,args)=>{[bin,args]=logicalCommand(bin,args);
  if(args[0]==='install'){
   cleared=!(await fs.stat(path.join(root,'node_modules')).catch(()=>null));
   await write(path.join(root,'node_modules/@libsql/client/package.json'),{name:'@libsql/client'});
   await write(path.join(root,'node_modules/libsql/package.json'),{name:'libsql'});
   await write(path.join(root,'node_modules','@libsql',currentNative,'package.json'),{name:'@libsql/'+currentNative});
   await write(path.join(root,'node_modules/vite/package.json'),{name:'vite'});
   await write(path.join(root,'node_modules/vite/bin/vite.js'),'console.log("vite")');
   await fs.mkdir(path.join(root,'node_modules/.bin'),{recursive:true});if(process.platform==='win32')await write(path.join(root,'node_modules/.bin/vite.cmd'),'@echo off\r\n');else await fs.symlink('../vite/bin/vite.js',path.join(root,'node_modules/.bin/vite'));
  }
  return {stdout:'ok',stderr:''};
 };
 const result=await helper.ensureForTarget(root,{kind:'npm',relative:''},{runner});
 assert.equal(cleared,true,'foreign dependency tree removed before host-native npm installation');
 assert.equal(result.verified,true);assert.equal(result.runtime.libsql,'@libsql/'+currentNative);
}));
