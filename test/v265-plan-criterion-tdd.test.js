'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const fss=require('node:fs');
const tdd=require('../src/developer-tdd');
const pipeline=require('../src/developer-br-pipeline');
const git=require('../src/developer-git');
const root=path.join(__dirname,'..');
const extension=fss.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const client=fss.readFileSync(path.join(root,'media/start.js'),'utf8');
test('plan requires distinct testable acceptance criteria with bounded counts',()=>{
 const list=[{description:'Adding a valid name persists it',acceptance:'POST creates an entry and GET returns it'},{description:'Empty names are rejected by API',acceptance:'POST with whitespace name returns status 400'}];
 const result=tdd.parsePlan(JSON.stringify({criteria:list}));
 assert.deepEqual(result.map(c=>c.id),['AC-01','AC-02']);
 assert.equal(result[0].status,'pending');
 assert.throws(()=>tdd.parsePlan('broken'),/valid JSON/);
 assert.throws(()=>tdd.parsePlan('{"criteria":[]}'),/1-12/);
 assert.throws(()=>tdd.parsePlan(JSON.stringify({criteria:[list[0],list[0]]})),/duplicate/);
 assert.throws(()=>tdd.parsePlan(JSON.stringify({criteria:Array(13).fill(list[0])})),/1-12/);
 const prompt=tdd.planningPrompt({brText:'Manage person records',brId:'BR-007',revision:1,stackId:'react',source:{files:['src/main.jsx'],previews:[]}});
 assert.match(prompt,/No markdown/);assert.match(prompt,/Do not write application code/);
 const testPrompt=tdd.testsOnlyPrompt({brText:'Manage person records',brId:'BR-007',revision:1,stackId:'react',source:{files:[],previews:[]},criterion:result[0]});
 assert.match(testPrompt,/AC-01/);assert.match(testPrompt,/Adding a valid name/);
 const green=tdd.greenPrompt({brText:'Manage person records',brId:'BR-007',revision:1,stackId:'react',source:{files:[],previews:[]},criterion:result[1],redEvidence:[]});
 assert.match(green,/AC-02/);assert.match(green,/selected acceptance criterion/);
});
test('passing tests cannot count as existing unless all new test files are discovered',async()=>{
 const worktree=await fs.mkdtemp(path.join(os.tmpdir(),'aia-plan265-'));
 const priorAttach=pipeline.attachDependencies,priorExecute=git.executeLocal;
 try{
  await fs.mkdir(path.join(worktree,'tests'));
  const paths=['tests/first.test.js','tests/second.test.js'];
  for(const p of paths)await fs.writeFile(path.join(worktree,p),'const test=()=>{};\n');
  pipeline.attachDependencies=async()=>({targets:[{relative:'.',scripts:['test']}]});
  git.executeLocal=async()=>{
   const contents=await Promise.all(paths.map(p=>fs.readFile(path.join(worktree,p),'utf8')));
   const marker=contents.map(x=>x.match(/ATGV_TDD_TEST_DISCOVERY_PROBE_\d+_[a-f0-9]+/)?.[0]).filter(Boolean)[0];
   return {passed:!marker,logs:marker?`Error: ${marker}`:'2 passed',at:'now'};
  };
  const files=paths.map(p=>({path:p}));
  assert.equal(await tdd.proveDiscoveredPassingTests({worktree,original:worktree,files,onUpdate:async()=>{},checkStopped:()=>{}}),true);
  assert.equal((await fs.readFile(path.join(worktree,paths[0]),'utf8')).includes('DISCOVERY'),false);
  git.executeLocal=async()=>({passed:true,logs:'passes but test discovery not proven'});
  assert.equal(await tdd.proveDiscoveredPassingTests({worktree,original:worktree,files,onUpdate:async()=>{},checkStopped:()=>{}}),false);
  assert.equal(await fs.readFile(path.join(worktree,paths[1]),'utf8'),'const test=()=>{};\n');
 }finally{pipeline.attachDependencies=priorAttach;git.executeLocal=priorExecute;await fs.rm(worktree,{recursive:true,force:true});}
});
test('development stage and actual workflow have planning before RED, criterion-level cycles, locked tests and final verification',()=>{
 const start=extension.indexOf('async function runDeveloperBrAutomation(');
 const end=extension.indexOf('async function runDeveloperDeliveryChecks(',start);
 const workflow=extension.slice(start,end);
 assert.match(extension,/id="developerBrStepPlan"/);
 assert.match(extension,/0 of 9 steps/);
 assert.match(client,/const developerBrStages=\['analyze','plan','red'/);
 assert.match(client,/completed\+' of 9 steps'/);
 assert.ok(workflow.indexOf("await progress('plan'")<workflow.indexOf('developerTdd.planningPrompt('));
 assert.ok(workflow.indexOf('developerTdd.parsePlan(planRaw)')<workflow.indexOf('for(let cycleIndex=0;'));
 assert.ok(workflow.indexOf('developerTdd.verifyBaseline(baseline)')<workflow.indexOf('developerTdd.testsOnlyPrompt('));
 assert.match(workflow,/for\(let cycleIndex=0;cycleIndex<criteria\.length;cycleIndex\+\+\)/);
 assert.match(workflow,/proveDiscoveredPassingTests/);
 assert.match(workflow,/already-implemented/);
 assert.match(workflow,/assertLockedTests\(lockedTests\)/);
 assert.match(workflow,/await launchGeneratedBrServer/);
});
