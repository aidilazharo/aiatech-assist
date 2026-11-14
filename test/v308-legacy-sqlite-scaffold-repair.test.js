'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const fixture=require('./catalog-fixture');
const skeleton=require('../src/project-skeleton');
const repair=require('../src/architect-scaffold-repair');
const architect=require('../src/architect-simple-workflow');
const stack=require('../src/architect-stack-bootstrap');
const oldTest=path.join(__dirname,'fixtures','legacy-sqlite-api.test.mjs');
const rel='server/api.test.mjs';
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
async function withScaffold(fn){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv308-'));
 try{
  await fixture.activate(temp);
  const root=path.join(temp,'repo');await fs.mkdir(root);
  git(root,'init','-b','main');git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');
  await skeleton.generateSkeleton(root,['react']);
  return await fn(root);
 }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
}
function read(root,file){return fs.readFile(path.join(root,file));}
async function makeLegacy(root){await fs.copyFile(oldTest,path.join(root,rel));}
test('v0.3.09 repairs exact legacy SQLite test, stores originals outside Git status and validates draft commit plan',()=>withScaffold(async root=>{
 await makeLegacy(root);
 const original=await read(root,rel);
 const oldManifest=await read(root,'atgv.bootstrap.json');
 const lines=[];
 const result=await repair.repair({root,stackIds:['react'],onProgress:message=>lines.push(message)});
 assert.equal(result.repaired,true);
 assert.ok(lines.some(message=>message.includes('Repaired')));
 assert.notDeepEqual(await read(root,rel),original);
 assert.deepEqual(await fs.readFile(path.join(result.backupDir,'api.test.mjs.before')),original);
 assert.deepEqual(await fs.readFile(path.join(result.backupDir,'atgv.bootstrap.json.before')),oldManifest);
 const state=JSON.parse(await fs.readFile(path.join(result.backupDir,'repair.json'),'utf8'));
 assert.equal(state.action,'restore-known-legacy-sqlite-test');
 assert.equal(state.file,rel);
 assert.equal((await architect.generatedCommitPlan(root,['react'])).needsCommit,true);
 assert.equal((await repair.repair({root,stackIds:['react']})).repaired,false);
 assert.doesNotMatch(git(root,'status','--porcelain'),/atgv-scaffold-repair/);
}));
test('v0.3.09 accepts the exact known legacy file with Windows CRLF line endings',()=>withScaffold(async root=>{
 await makeLegacy(root);
 const old=(await read(root,rel)).toString('utf8').replace(/\n/g,'\r\n');
 await fs.writeFile(path.join(root,rel),old);
 const result=await repair.repair({root,stackIds:['react']});
 assert.equal(result.repaired,true);
 assert.equal((await architect.generatedCommitPlan(root,['react'])).needsCommit,true);
}));
test('v0.3.09 refuses to touch legacy test when unrelated files are staged or untracked',()=>withScaffold(async root=>{
 await makeLegacy(root);
 const original=await read(root,rel);
 await fs.writeFile(path.join(root,'unrelated.txt'),'user work');
 await assert.rejects(repair.repair({root,stackIds:['react']}),/non-starter or staged changes/);
 assert.deepEqual(await read(root,rel),original);
}));
test('v0.3.09 refuses to overwrite user-edited SQLite test',()=>withScaffold(async root=>{
 await makeLegacy(root);
 await fs.appendFile(path.join(root,rel),'\n// custom application test\n');
 const before=await read(root,rel);
 await assert.rejects(repair.repair({root,stackIds:['react']}),/not an exact, recognized legacy template/);
 assert.deepEqual(await read(root,rel),before);
}));
test('v0.3.09 refuses to overwrite Git-tracked SQLite starter code',()=>withScaffold(async root=>{
 git(root,'add','.');git(root,'commit','-m','initial scaffold');
 await makeLegacy(root);
 const before=await read(root,rel);
 await assert.rejects(repair.repair({root,stackIds:['react']}),/Git-tracked/);
 assert.deepEqual(await read(root,rel),before);
}));
test('v0.3.09 preserves legacy test if unrelated scaffold file has drifted',()=>withScaffold(async root=>{
 await makeLegacy(root);
 await fs.appendFile(path.join(root,'package.json'),'\n');
 const before=await read(root,rel);
 await assert.rejects(repair.repair({root,stackIds:['react']}),/Catalog and existing starter differ at package.json/);
 assert.deepEqual(await read(root,rel),before);
}));
test('v0.3.09 reports invalid generated file list instead of modifying project',()=>withScaffold(async root=>{
 await makeLegacy(root);
 const file=path.join(root,'atgv.bootstrap.json'),meta=JSON.parse(await fs.readFile(file,'utf8'));
 meta.generatedFiles.push('unknown-from-old-catalog.txt');
 await fs.writeFile(file,JSON.stringify(meta));
 const before=await read(root,rel);
 await assert.rejects(repair.repair({root,stackIds:['react']}),/unknown-from-old-catalog.txt/);
 assert.deepEqual(await read(root,rel),before);
}));
test('v0.3.09 integrated Save Stack retry repairs a legacy test before executing checks and pushes approved starter only',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv308-bootstrap-'));
 try{
  await fixture.activate(temp);
  const remote=path.join(temp,'remote.git'),seed=path.join(temp,'seed'),root=path.join(temp,'checkout');
  execFileSync('git',['init','--bare',remote]);execFileSync('git',['init','-b','main',seed]);
  git(seed,'config','user.email','atgv@example.invalid');git(seed,'config','user.name','ATGV Test');
  await fs.writeFile(path.join(seed,'README.md'),'# Base\n');
  git(seed,'add','.');git(seed,'commit','-m','base');git(seed,'remote','add','origin',remote);git(seed,'push','-u','origin','main');
  execFileSync('git',['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/main']);
  execFileSync('git',['clone',remote,root]);git(root,'config','user.email','atgv@example.invalid');git(root,'config','user.name','ATGV Test');
  const actions=[];
  const effects={
   install:async()=>{await fs.mkdir(path.join(root,'node_modules'),{recursive:true});},
   execute:async(_root,{operation})=>{actions.push(operation);return {relative:'',operation,passed:operation!=='test',logs:'legacy fail'};},
   portAvailable:async()=>true,
  };
  await assert.rejects(stack.bootstrap({root,stackId:'react',effects}),/test failed/);
  await makeLegacy(root);
  const good={...effects,execute:async(_root,{operation})=>{actions.push(operation);if(operation==='test'){
   const now=await read(root,rel);assert.ok(now.includes(Buffer.from('await client.close()')));
  }return {relative:'',operation,passed:true,logs:'ok'};},
  launch:async()=>{},waitHealth:async()=>{},isRunning:()=>true};
  const messages=[];
  const done=await stack.bootstrap({root,stackId:'react',effects:good,onProgress:m=>messages.push(m),openBrowser:async()=>true});
  assert.equal(done.pushed,true);
  assert.ok(messages.some(m=>m.includes('Repaired verified legacy SQLite starter test')));
  assert.equal(git(root,'status','--porcelain'),'');
  assert.equal(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'),done.repo.sha);
 }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
