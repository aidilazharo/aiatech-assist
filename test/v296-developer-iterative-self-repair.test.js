'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const tdd=require('../src/developer-tdd');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');

test('quarantine patches a failed implementation through successive revisions and can roll back every touched path',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-self-repair-'));
 try{
  await fs.mkdir(path.join(root,'src'));
  await fs.writeFile(path.join(root,'src/App.js'),'module.exports = "verified";');
  const session=tdd.createGreenRepairSession();
  const first=[{path:'src/App.js',content:'module.exports = "broken";'},{path:'src/helper.js',content:'module.exports = "new";'}];
  session.remember(await tdd.snapshotBeforeChanges(root,first));
  await fs.writeFile(path.join(root,'src/App.js'),first[0].content);
  await fs.writeFile(path.join(root,'src/helper.js'),first[1].content);
  assert.equal(session.hasChanges(),true);
  const second=[{path:'src/App.js',content:'module.exports = "fixed";'},{path:'src/other.js',content:'module.exports = "another";'}];
  session.remember(await tdd.snapshotBeforeChanges(root,second));
  await fs.writeFile(path.join(root,'src/App.js'),second[0].content);
  await fs.writeFile(path.join(root,'src/other.js'),second[1].content);
  assert.deepEqual(session.files().sort(),['src/App.js','src/helper.js','src/other.js']);
  const restored=await session.rollback();
  assert.equal(restored.length,3);
  assert.equal(await fs.readFile(path.join(root,'src/App.js'),'utf8'),'module.exports = "verified";');
  await assert.rejects(fs.readFile(path.join(root,'src/helper.js'),'utf8'),{code:'ENOENT'});
  await assert.rejects(fs.readFile(path.join(root,'src/other.js'),'utf8'),{code:'ENOENT'});
  assert.equal(session.hasChanges(),false);
 }finally{await fs.rm(root,{force:true,recursive:true});}
});

test('successful quarantined source is committed only after caller verified tests',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-self-repair-'));
 try{
  await fs.writeFile(path.join(root,'app.js'),'original');
  const session=tdd.createGreenRepairSession();
  session.remember(await tdd.snapshotBeforeChanges(root,[{path:'app.js'}]));
  await fs.writeFile(path.join(root,'app.js'),'corrected');
  assert.deepEqual(session.commit(),['app.js']);
  assert.equal(session.hasChanges(),false);
  assert.equal(await fs.readFile(path.join(root,'app.js'),'utf8'),'corrected');
 }finally{await fs.rm(root,{force:true,recursive:true});}
});

test('failure diagnostics guide code repair and detect test harness issues separately',()=>{
 assert.equal(tdd.diagnoseGreenFailure('TestingLibraryElementError: Unable to find an element with the text: Ada Lovelace').kind,'ui-rendering');
 assert.equal(tdd.diagnoseGreenFailure('TypeError: (0 , waitFor) is not a function').kind,'invalid-test-harness');
 assert.equal(tdd.diagnoseGreenFailure(`AssertionError: expected "spy" to be called with arguments: [ '/api/tasks' ]`).kind,'mock-contract');
 assert.equal(tdd.diagnoseGreenFailure('TypeError: Cannot read properties of undefined').kind,'runtime');
});

test('quarantined repair instructions explicitly refer to real current code and locked tests',()=>{
 const args={brId:'BR-009',revision:1,stackId:'react',brText:'Store a person name',criterion:{id:'AC-02',description:'Add name'},source:{files:['src/App.jsx'],previews:[]},lockedTestSources:[],stagedRepair:true,repairLog:'Missing Ada Lovelace'};
 const prompt=tdd.greenRecoveryPrompt(args);
 assert.match(prompt,/current source previews INCLUDE a failed implementation/);
 assert.match(prompt,/PATCH that concrete implementation incrementally/);
 assert.match(prompt,/Quarantined code is never accepted unless all locked tests pass/);
});

test('host only keeps staged code during bounded recovery and restores on failure',()=>{
 assert.match(host,/const greenRepairSession=developerTdd\.createGreenRepairSession\(\)/);
 assert.match(host,/if\(quarantineCandidate\)greenRepairSession\.remember\(beforeGreen\)/);
 assert.match(host,/const verifiedFiles=\[\.\.\.new Set\(\[\.\.\.greenRepairSession\.commit\(\)/);
 assert.match(host,/if\(!greenPassed&&greenRepairSession\.hasChanges\(\)\)/);
 assert.match(host,/await greenRepairSession\.rollback\(\)/);
 assert.match(host,/assertLockedTests\(lockedTests\)/);
});
