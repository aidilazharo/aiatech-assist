'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const env={...process.env};delete env.NODE_TEST_CONTEXT;
const tdd=require('../src/developer-tdd');
const pipeline=require('../src/developer-br-pipeline');
const git=require('../src/developer-git');

test('extracts actual approved shell test glob, and distinguishes matched / unmatched generated test paths',()=>{
 const command='node --test server/*.test.mjs';
 assert.deepEqual(tdd.testCommandGlobs(command),['server/*.test.mjs']);
 assert.ok(tdd.globRegex('server/*.test.mjs').test('server/br-007-ac01.test.mjs'));
 assert.equal(tdd.globRegex('server/*.test.mjs').test('src/__tests__/person.test.js'),false);
 assert.ok(tdd.globRegex('src/**/*.test.ts').test('src/people.test.ts'));
 assert.ok(tdd.globRegex('src/**/*.test.ts').test('src/units/people.test.ts'));
 const config={targets:[{relative:'',kind:'npm',command,globs:tdd.testCommandGlobs(command),existing:['server/api.test.mjs']}]};
 assert.deepEqual(tdd.allowedDiscoveredPaths([{path:'server/br-007-ac01.test.mjs'}],config),[]);
 assert.deepEqual(tdd.allowedDiscoveredPaths([{path:'src/__tests__/br-007.test.js'}],config),['src/__tests__/br-007.test.js']);
 const prompt=tdd.testsOnlyPrompt({brText:'Manage person names',brId:'BR-007',revision:1,stackId:'react',source:{files:['server/api.test.mjs'],previews:[]},criterion:{id:'AC-01',description:'Names can be added',acceptance:'POST succeeds'},discovery:config});
 assert.match(prompt,/APPROVED TEST-DISCOVERY CONFIGURATION/);
 assert.match(prompt,/server\/\*\.test\.mjs/);
 assert.match(prompt,/server\/br-007-ac01\.test\.mjs/);
});

test('preflight catches fixed-file test scripts before AI generates new tests',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv266-fixed-'));
 const old=pipeline.attachDependencies;
 try{
  await fs.writeFile(path.join(folder,'package.json'),JSON.stringify({scripts:{test:'node --test server/api.test.mjs'}}));
  pipeline.attachDependencies=async()=>({targets:[{relative:'',kind:'npm',scripts:['test']} ]});
  await assert.rejects(()=>tdd.discoverTestConfiguration(folder,folder),/fixed-file test command/);
 }finally{pipeline.attachDependencies=old;await fs.rm(folder,{recursive:true,force:true});}
});

test('preflight identifies supported glob and prompt examples from the real project script',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv266-glob-'));
 const old=pipeline.attachDependencies;
 try{
  await fs.mkdir(path.join(folder,'server'));
  await fs.writeFile(path.join(folder,'package.json'),JSON.stringify({scripts:{test:'node --test server/*.test.mjs'}}));
  await fs.writeFile(path.join(folder,'server','api.test.mjs'),'import test from "node:test";test("baseline",()=>{});');
  pipeline.attachDependencies=async()=>({targets:[{relative:'',kind:'npm',scripts:['test']} ]});
  const result=await tdd.discoverTestConfiguration(folder,folder);
  assert.deepEqual(result.targets[0].globs,['server/*.test.mjs']);
  assert.ok(result.targets[0].existing.includes('server/api.test.mjs'));
  assert.deepEqual(tdd.allowedDiscoveredPaths([{path:'server/br-007-ac01.test.mjs'}],result),[]);
  assert.deepEqual(tdd.allowedDiscoveredPaths([{path:'tests/br-007-ac01.test.mjs'}],result),['tests/br-007-ac01.test.mjs']);
 }finally{pipeline.attachDependencies=old;await fs.rm(folder,{recursive:true,force:true});}
});

test('real Node test runner proves generated test discovery and restores original file exactly',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv266-probe-'));
 const oldAttach=pipeline.attachDependencies,oldExec=git.executeLocal;
 try{
  await fs.mkdir(path.join(folder,'server'));
  const baseline='import test from "node:test"; test("baseline",()=>{});\n';
  const generated='import test from "node:test"; test("feature",()=>{});\n';
  await fs.writeFile(path.join(folder,'server','api.test.mjs'),baseline);
  await fs.writeFile(path.join(folder,'server','br-007-ac01.test.mjs'),generated);
  pipeline.attachDependencies=async()=>({targets:[{relative:'',scripts:['test']} ]});
  git.executeLocal=async()=>{
   const p=spawnSync(process.execPath,['--test','server/api.test.mjs','server/br-007-ac01.test.mjs'],{cwd:folder,encoding:'utf8',timeout:30000,env});
   return {passed:p.status===0,logs:p.stdout+'\n'+p.stderr,at:new Date().toISOString()};
  };
  assert.equal(await tdd.proveDiscoveredPassingTests({worktree:folder,original:folder,files:[{path:'server/br-007-ac01.test.mjs'}],onUpdate:async()=>{},checkStopped:()=>{}}),true);
  assert.equal(await fs.readFile(path.join(folder,'server','br-007-ac01.test.mjs'),'utf8'),generated);
  // A missing imported feature must not mask test-file discovery. The parser
  // sees the temporary marker before ESM dependency resolution fails.
  const missingImport='import { feature } from "../src/not-yet-written.mjs"; test("feature",()=>feature());\n';
  await fs.writeFile(path.join(folder,'server','br-007-ac01.test.mjs'),missingImport);
  assert.equal(await tdd.proveDiscoveredPassingTests({worktree:folder,original:folder,files:[{path:'server/br-007-ac01.test.mjs'}],onUpdate:async()=>{},checkStopped:()=>{}}),true);
  assert.equal(await fs.readFile(path.join(folder,'server','br-007-ac01.test.mjs'),'utf8'),missingImport);
  await fs.writeFile(path.join(folder,'server','br-007-ac01.test.mjs'),generated);
  git.executeLocal=async()=>{
   const p=spawnSync(process.execPath,['--test','server/api.test.mjs'],{cwd:folder,encoding:'utf8',timeout:30000,env});
   return {passed:p.status===0,logs:p.stdout+'\n'+p.stderr,at:new Date().toISOString()};
  };
  assert.equal(await tdd.proveDiscoveredPassingTests({worktree:folder,original:folder,files:[{path:'server/br-007-ac01.test.mjs'}],onUpdate:async()=>{},checkStopped:()=>{}}),false);
  assert.equal(await fs.readFile(path.join(folder,'server','br-007-ac01.test.mjs'),'utf8'),generated);
 }finally{pipeline.attachDependencies=oldAttach;git.executeLocal=oldExec;await fs.rm(folder,{recursive:true,force:true});}
});

test('extension validates generated paths and proves execution before accepting RED failure or pass',()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const start=source.indexOf('async function runDeveloperBrAutomation(');
 const end=source.indexOf('async function runDeveloperDeliveryChecks(',start);
 const run=source.slice(start,end);
 assert.ok(run.indexOf('discoverTestConfiguration(')<run.indexOf('testsOnlyPrompt('));
 assert.ok(run.indexOf('allowedDiscoveredPaths(')<run.indexOf('snapshotBeforeChanges(run.worktree,redManifest.files)'));
 assert.ok(run.indexOf('proveDiscoveredPassingTests(')<run.indexOf('developerTdd.verifyRed(red)'));
 assert.match(run,/const undiscoveredPaths/);
});
