'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const root=path.join(__dirname,'..');
const extension=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
test('RED passing, no evidence, and legitimate failing tests are distinguished',()=>{
 assert.equal(tdd.redTestsUnexpectedlyPassed([{passed:true,logs:'tests passed'}]),true);
 assert.equal(tdd.redTestsUnexpectedlyPassed([{passed:true},{passed:false,logs:'assert mismatch'}]),false);
 assert.throws(()=>tdd.redTestsUnexpectedlyPassed([]),/evidence/);
 assert.throws(()=>tdd.verifyRed([{passed:true}]),/unexpectedly passed/);
 assert.equal(tdd.verifyRed([{passed:false,logs:'AssertionError: expected 200 but got 404'}])[0].redVerified,true);
});
test('RED retry prompt includes actual passed-test feedback without weakening safeguards',()=>{
 const feedback=tdd.redPassRetryFeedback([{passed:true,target:'.',logs:'2 passing'}],[{path:'tests/br-007-new.test.js'}]);
 assert.match(feedback,/2 passing/);
 assert.match(feedback,/br-007-new/);
 const prompt=tdd.testsOnlyPrompt({brText:'Add names',brId:'BR-007',revision:1,stackId:'react',source:{files:[],previews:[]},attempt:1,retryFeedback:feedback});
 assert.match(prompt,/RETRY 2/);
 assert.match(prompt,/2 passing/);
 assert.match(prompt,/Do not create a fake failure/);
});
test('RED uses bounded retry with rollback before regenerating GREEN',()=>{
 const start=extension.indexOf('async function runDeveloperBrAutomation('),end=extension.indexOf('async function runDeveloperDeliveryChecks(',start);
 const generation=extension.slice(start,end);
 assert.match(generation,/for\(let redAttempt=0;redAttempt<3;redAttempt\+\+\)/);
 assert.match(generation,/developerTdd\.redTestsUnexpectedlyPassed\(red\)/);
 assert.match(generation,/developerTdd\.restoreChanges\(beforeRed\)/);
 assert.ok(generation.indexOf('if(!verifiedRed)throw Error')<generation.indexOf("await progress('green'"));
});
test('only the tabbed work area and delivery controls hide before BR selection',()=>{
 const detail=extension.indexOf('id="developerBrDetails"');
 const stages=extension.indexOf('id="developerBrSteps"',detail);
 const workArea=extension.indexOf('id="developerBrWorkArea"',detail);
 const tabs=extension.indexOf('class="developer-br-output-tabs"',workArea);
 const delivery=extension.indexOf('id="developerDeliveryPanel"',workArea);
 assert.ok(detail>0&&stages>detail&&workArea>stages&&tabs>workArea&&delivery>tabs);
 assert.match(ui,/developerBrWorkArea'\)\.classList\.toggle\('hidden',!hasSelectedBr\)/);
 assert.match(ui,/developerBrDetails'\)\.classList\.remove\('hidden'\)/);
});
test('rejected RED test files are removed without touching existing baseline tests',async()=>{
 const folder=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-red-retry-'));
 try{
  await fsp.mkdir(path.join(folder,'tests'));
  const existing=path.join(folder,'tests','baseline.test.js');
  await fsp.writeFile(existing,'baseline tests');
  const trial=[{path:'tests/br-007-red.test.js'}];
  const before=await tdd.snapshotBeforeChanges(folder,trial);
  await fsp.writeFile(path.join(folder,trial[0].path),'passing but irrelevant tests');
  await tdd.restoreChanges(before);
  await assert.rejects(fsp.readFile(path.join(folder,trial[0].path)),{code:'ENOENT'});
  assert.equal(await fsp.readFile(existing,'utf8'),'baseline tests');
 }finally{await fsp.rm(folder,{recursive:true,force:true});}
});
