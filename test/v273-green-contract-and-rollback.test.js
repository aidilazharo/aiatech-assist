'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const tdd=require('../src/developer-tdd');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');

const starter=`export async function makeApp(){return {app:{listen(){return {close(cb){cb();}}}},client:{close(){}}};}\n`;
const missingExport=`export const app={listen(){return {close(cb){cb();}}}};\n`;
const changedReturn=`export async function makeApp(){return {app:undefined,client:undefined};}\n`;

// Mirrors the tech-cockpit starter contract from server/api.test.mjs.
const baselineTest=`import {makeApp} from './index.mjs';\nconst {app,client}=await makeApp();const server=app.listen();await new Promise((resolve,reject)=>server.close(resolve));client.close();\n`;

test('GREEN protects the actual tech-cockpit makeApp named export before writing source',()=>{
 const before=[{relative:'server/index.mjs',exists:true,content:starter}];
 assert.deepEqual(tdd.publicContractViolations([{path:'server/index.mjs',content:missingExport}],before),['server/index.mjs no longer exports makeApp']);
 assert.deepEqual(tdd.publicContractViolations([{path:'server/index.mjs',content:changedReturn}],before),[],'return-shape mismatch is caught by baseline execution, not guessed by a regex');
 assert.deepEqual(tdd.publicContractViolations([{path:'server/people.mjs',content:'export const people=[];'}],before),[]);
});

test('named exports preserve public names including reexports and aliases',()=>{
 assert.deepEqual([...tdd.publicExports(`export async function makeApp(){}\nexport const other=1;\nexport {foo as supported};`)].sort(),['makeApp','other','supported']);
 assert.deepEqual(tdd.publicContractViolations([{path:'server/index.mjs',content:'export {makeApp};'}],[{relative:'server/index.mjs',exists:true,content:starter}]),[]);
});

test('failed GREEN candidate restores baseline source, including removing newly generated files',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-green-rollback-'));
 try{
  await fs.mkdir(path.join(tmp,'server'));
  await fs.writeFile(path.join(tmp,'server/index.mjs'),starter);
  await fs.writeFile(path.join(tmp,'server/api.test.mjs'),baselineTest);
  const files=[{path:'server/index.mjs',content:changedReturn},{path:'server/new-feature.mjs',content:'export const created=true;'}];
  const before=await tdd.snapshotBeforeChanges(tmp,files);
  await fs.writeFile(path.join(tmp,'server/index.mjs'),changedReturn);
  await fs.writeFile(path.join(tmp,'server/new-feature.mjs'),'export const created=true;');
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const failed=spawnSync(process.execPath,['--test','server/api.test.mjs'],{cwd:tmp,encoding:'utf8',env});
  assert.notEqual(failed.status,0);
  assert.match(failed.stdout+failed.stderr,/listen/);
  await tdd.restoreChanges(before);
  const passed=spawnSync(process.execPath,['--test','server/api.test.mjs'],{cwd:tmp,encoding:'utf8',env});
  assert.equal(passed.status,0,passed.stdout+passed.stderr);
  assert.equal(await fs.readFile(path.join(tmp,'server/index.mjs'),'utf8'),starter);
  await assert.rejects(fs.stat(path.join(tmp,'server/new-feature.mjs')),{code:'ENOENT'});
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});

test('GREEN production flow guards exports before writing and rolls back every failed attempt',()=>{
 const start=host.indexOf('let greenPassed=false;');
 const end=host.indexOf('if(!greenPassed){',start);
 assert.ok(start>0&&end>start);
 const block=host.slice(start,end);
 assert.match(block,/publicContractViolations\(result\.files,beforeGreen\)/);
 assert.ok(block.indexOf('publicContractViolations(result.files,beforeGreen)')<block.indexOf('writeGenerated(run.worktree,result.files)'));
 assert.match(block,/await developerTdd\.restoreChanges\(beforeGreen\)/);
 assert.match(block,/await developerTdd\.assertLockedTests\(lockedTests\)/);
 assert.match(block,/if\(!failed\.length\)\{/);
 assert.ok(block.indexOf('await developerTdd.restoreChanges(beforeGreen);',block.indexOf('const failed=green.filter'))>0);
 assert.ok(block.indexOf('run.files=[...new Set')>block.indexOf('if(!failed.length){'));
 assert.match(block,/failed source rolled back/);
 assert.doesNotMatch(block,/run\.files=\[\.\.\.new Set\(\[\.\.\.run\.files,\.\.\.await developerBR\.writeGenerated/);
});

test('GREEN prompt explicitly preserves old app factories and reruns candidates from verified baseline',()=>{
 const prompt=tdd.greenPrompt({brId:'BR-007',revision:1,stackId:'react',brText:'Add a name',source:{files:['server/index.mjs'],previews:[{path:'server/index.mjs',content:starter}]},criterion:{id:'AC-01',description:'Add name',acceptance:'Name saves'},redEvidence:[],lockedTestSources:[]});
 assert.match(prompt,/preserve EVERY existing named export/i);
 assert.match(prompt,/makeApp/);
 assert.match(prompt,/app\.listen\(\)/);
 assert.match(prompt,/client\.close\(\)/);
 assert.match(prompt,/last verified passing source/i);
});
