'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const pipeline=require('../src/developer-br-pipeline');

// Production resume calls test discovery after a verified checkpoint. Both
// preparation helpers must accept dependency progress without referring to
// callback identifiers that exist only inside runTests().
test('resumed TDD test discovery forwards dependency progress without undefined onUpdate',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv301-resume-'));
 const approved=path.join(root,'approved'),worktree=path.join(root,'worktree');
 const originalAttach=pipeline.attachDependencies;
 const messages=[];
 try{
  for(const dir of [approved,worktree]){
   await fs.mkdir(path.join(dir,'server'),{recursive:true});
   await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test server/api.test.mjs'}}));
   await fs.writeFile(path.join(dir,'server','api.test.mjs'),'const test=require("node:test");test("baseline",()=>{});\n');
  }
  pipeline.attachDependencies=async (_worktree,_original,{onProgress}={})=>{
   await onProgress('Dependency preflight completed');
   return {targets:[{kind:'npm',relative:'',scripts:['test']}]};
  };
  const fix=await tdd.repairFixedFileTestCommands(worktree,approved,{onProgress:message=>messages.push(message)});
  assert.equal(fix.length,1);
  const discovered=await tdd.discoverTestConfiguration(worktree,approved,{onProgress:message=>messages.push(message)});
  assert.deepEqual(discovered.targets[0].globs,['server/*.test.mjs']);
  assert.deepEqual(messages,['Dependency preflight completed','Dependency preflight completed']);
  // Older callers may omit progress: resume must still continue normally.
  assert.equal((await tdd.repairFixedFileTestCommands(worktree,approved)).length,0);
  assert.equal((await tdd.discoverTestConfiguration(worktree,approved)).targets.length,1);
 }finally{pipeline.attachDependencies=originalAttach;await fs.rm(root,{recursive:true,force:true});}
});

test('real dependency failures retain their cause rather than reporting missing onUpdate',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv301-deps-'));
 const approved=path.join(root,'approved'),worktree=path.join(root,'worktree');
 const previous=pipeline.attachDependencies;
 try{
  await fs.mkdir(approved);await fs.mkdir(worktree);
  pipeline.attachDependencies=async (_a,_b,{onProgress})=>{
   await onProgress('Installing approved dependencies');
   throw Error('npm registry temporarily unreachable');
  };
  const messages=[];
  await assert.rejects(()=>tdd.discoverTestConfiguration(worktree,approved,{onProgress:m=>messages.push(m)}),/npm registry temporarily unreachable/);
  await assert.rejects(()=>tdd.repairFixedFileTestCommands(worktree,approved),/npm registry temporarily unreachable/);
  assert.deepEqual(messages,['Installing approved dependencies']);
 }finally{pipeline.attachDependencies=previous;await fs.rm(root,{recursive:true,force:true});}
});

test('extension forwards progress from readiness helpers during resume without resetting AC state',()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(source,/discoverTestConfiguration\(run\.worktree,repoRoot,\{onProgress:message=>progress\(resuming\?'repair':'plan',message\)\}\)/);
 assert.match(source,/repairFixedFileTestCommands\(run\.worktree,repoRoot,\{onProgress:message=>progress\('plan',message\)\}\)/);
 assert.match(source,/if\(resuming\)\{\s*criteria=record\.criteria/);
});
