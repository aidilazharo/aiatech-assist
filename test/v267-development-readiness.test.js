'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const pipeline=require('../src/developer-br-pipeline');
const handoff=require('../src/developer-design-handoff');
const {spawnSync}=require('node:child_process');
const env={...process.env};delete env.NODE_TEST_CONTEXT;

test('safely expands a fixed-file Node command in isolated worktree only; approved baseline stays unchanged',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv267-'));
 const original=path.join(folder,'approved'),worktree=path.join(folder,'worktree');
 const prior=pipeline.attachDependencies;
 try{
  for(const root of [original,worktree]){
   await fs.mkdir(path.join(root,'server'),{recursive:true});
   await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'app',scripts:{test:'node --test server/api.test.mjs'},dependencies:{react:'19.0.0'}},null,2));
   await fs.writeFile(path.join(root,'server','api.test.mjs'),'import test from "node:test";test("baseline",()=>{});\n');
  }
  pipeline.attachDependencies=async()=>({targets:[{relative:'',kind:'npm',scripts:['test']} ]});
  assert.equal(tdd.repairableFixedNodeTestCommand('node --test server/api.test.mjs'),'node --test server/*.test.mjs');
  assert.equal(tdd.repairableFixedNodeTestCommand('node --test server/*.test.mjs'),null);
  assert.equal(tdd.repairableFixedNodeTestCommand('vitest run src/fixed.test.ts'),null);
  assert.equal(tdd.repairableFixedNodeTestCommand('node --test server/api.test.mjs && echo skipped'),null);
  assert.equal(tdd.repairableFixedNodeTestCommand('node --test ../secret.test.mjs'),null);
  const repairs=await tdd.repairFixedFileTestCommands(worktree,original);
  assert.equal(repairs.length,1);
  assert.deepEqual(repairs[0],{target:'root',before:'node --test server/api.test.mjs',after:'node --test server/*.test.mjs',path:'package.json'});
  assert.equal(JSON.parse(await fs.readFile(path.join(original,'package.json'),'utf8')).scripts.test,'node --test server/api.test.mjs');
  assert.equal(JSON.parse(await fs.readFile(path.join(worktree,'package.json'),'utf8')).scripts.test,'node --test server/*.test.mjs');
  assert.equal(await fs.readFile(path.join(worktree,'server/api.test.mjs'),'utf8'),await fs.readFile(path.join(original,'server/api.test.mjs'),'utf8'));
  assert.equal((await tdd.repairFixedFileTestCommands(worktree,original)).length,0);
  const discover=await tdd.discoverTestConfiguration(worktree,original);
  assert.deepEqual(discover.targets[0].globs,['server/*.test.mjs']);
  assert.deepEqual(tdd.allowedDiscoveredPaths([{path:'server/br-007-ac01.test.mjs'}],discover),[]);
  assert.ok(tdd.discoveryInstructions(discover)[0].installedDependencies.includes('react'));
  await fs.writeFile(path.join(worktree,'server/br-007-ac01.test.mjs'),'import test from "node:test";test("RED",()=>{throw Error("missing behavior")});\n');
  const runner=spawnSync('npm',['test'],{cwd:worktree,encoding:'utf8',timeout:20000,env});
  assert.notEqual(runner.status,0);
  assert.match(runner.stdout+'\n'+runner.stderr,/RED/);
  await assert.rejects(()=>tdd.repairFixedFileTestCommands(original,original),/isolated worktree/);
 }finally{pipeline.attachDependencies=prior;await fs.rm(folder,{recursive:true,force:true});}
});

test('unsupported fixed-file commands remain blocked rather than rewritten',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv267-unsupported-'));
 const original=path.join(folder,'approved'),worktree=path.join(folder,'worktree');
 const prior=pipeline.attachDependencies;
 try{
  for(const root of [original,worktree]){
   await fs.mkdir(path.join(root,'server'),{recursive:true});
   await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{test:'vitest run server/api.test.mjs'}}));
   await fs.writeFile(path.join(root,'server/api.test.mjs'),'// preserved');
  }
  pipeline.attachDependencies=async()=>({targets:[{relative:'',kind:'npm',scripts:['test']} ]});
  assert.deepEqual(await tdd.repairFixedFileTestCommands(worktree,original),[]);
  await assert.rejects(()=>tdd.discoverTestConfiguration(worktree,original),/fixed-file test command/);
 }finally{pipeline.attachDependencies=prior;await fs.rm(folder,{recursive:true,force:true});}
});

test('RED infrastructure classification rejects missing feature-module imports without claiming a valid failure',()=>{
 const missing=[{passed:false,logs:"Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/project/server/names.mjs'",target:''}];
 assert.equal(tdd.redInfrastructureFailure(missing),true);
 assert.throws(()=>tdd.verifyRed(missing),/invalid test or environment/);
 const assertion=[{passed:false,logs:'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 404 !== 201',target:''}];
 assert.equal(tdd.redInfrastructureFailure(assertion),false);
 assert.equal(tdd.verifyRed(assertion)[0].redVerified,true);
 const prompt=tdd.testsOnlyPrompt({brId:'BR-007',revision:1,stackId:'react',brText:'Name management',source:{files:['server/index.mjs']},criterion:{id:'AC-01',description:'Create name',acceptance:'POST returns 201'}});
 assert.match(prompt,/Import only modules or public entry points that already exist/);
});

test('only approved design revisions linked to the specific BR are sent to Developer AI',()=>{
 const reg={designs:{mockup:[
  {number:1,status:'draft',sourceBusinessRequirements:[{id:'BR-007',revision:1}],design:{title:'Draft',screens:[]}},
  {number:2,status:'approved',sourceBusinessRequirements:[{id:'BR-007',revision:1}],design:{title:'Approved names',screens:[{name:'Names',purpose:'CRUD',components:['input','add'],interactions:['submit saves']}]}}
 ],design:[{number:1,status:'approved',sourceBusinessRequirements:[{id:'BR-008',revision:1}],design:{title:'Wrong BR',screens:[]}}]}};
 const selected=handoff.forBr(reg,'BR-007',1);
 assert.equal(selected.length,1);assert.equal(selected[0].title,'Approved names');
 assert.equal(handoff.forBr(reg,'BR-007',2),null);
 const prompt=tdd.planningPrompt({brText:'Names',brId:'BR-007',revision:1,stackId:'react',source:{files:[],previews:[]},approvedDesignHandoff:selected});
 assert.match(prompt,/Approved names/);
});

test('pipeline repairs scripts before AI generates RED and retries rejected RED imports',()=>{
 const extension=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const begin=extension.indexOf('async function runDeveloperBrAutomation(');
 const end=extension.indexOf('async function runDeveloperDeliveryChecks(',begin);
 const run=extension.slice(begin,end);
 assert.ok(run.indexOf('verifyBaseline(baseline)')<run.indexOf('repairFixedFileTestCommands('));
 assert.ok(run.indexOf('repairFixedFileTestCommands(')<run.indexOf('discoverTestConfiguration('));
 assert.ok(run.indexOf('discoverTestConfiguration(')<run.indexOf('testsOnlyPrompt('));
 assert.ok(run.indexOf('redInfrastructureFailure(red)')<run.indexOf('verifyRed(red)'));
 assert.match(run,/approvedDesignHandoff/);
});
