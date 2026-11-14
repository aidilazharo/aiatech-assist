'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');
const tdd=require('../src/developer-tdd');
const pipeline=require('../src/developer-br-pipeline');

test('GREEN reports the actual Node TAP assertion mismatch for empty-name validation',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v275-assert-'));
 try{
  const file=path.join(root,'validation.test.cjs');
  await fs.writeFile(file,`const t=require('node:test');const a=require('node:assert/strict');t('whitespace-only name returns 400',()=>a.strictEqual(201,400));`);
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--test',file],{cwd:root,encoding:'utf8',env});
  assert.equal(result.status,1,result.stderr);
  const text=result.stdout+'\n'+result.stderr;
  const details=tdd.extractGreenFailureDetails(text);
  assert.match(details,/whitespace-only name returns 400/);
  assert.match(details,/expected=400/);
  assert.match(details,/actual=201/);
  assert.match(details,/operator=strictEqual/);
  const short=tdd.summarizeGreenFailure(text);
  assert.match(short,/expected=400/);
  assert.match(short,/actual=201/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('GREEN keeps several failed assertions distinct and does not lose the precise values',()=>{
 const logs=`not ok 1 - rejects empty body\n  ---\n  error: |-\n    Expected values to be strictly equal:\n  expected: 400\n  actual: 201\n  operator: strictEqual\n  ...\nnot ok 2 - rejects whitespace body\n  ---\n  error: |-\n    Expected values to be strictly equal:\n  expected: 400\n  actual: 204\n  operator: strictEqual\n  ...`;
 const details=tdd.extractGreenFailureDetails(logs);
 assert.match(details,/not ok 1 - rejects empty body[^\n]*actual=201/);
 assert.match(details,/not ok 2 - rejects whitespace body[^\n]*actual=204/);
 assert.equal(details.split('\n').length,2);
});

test('GREEN fallback retains runtime errors and short original output',()=>{
 assert.match(tdd.summarizeGreenFailure('x\nTypeError: client.close is not a function\ny'),/client\.close/);
 assert.equal(tdd.summarizeGreenFailure('oops',3),'oop');
 assert.match(tdd.summarizeGreenFailure('root: not ok - whitespace failed | expected=400 | actual=200'),/expected=400/);
});

test('GREEN retries show rejected source changes without applying them',()=>{
 const baseline=`export const addName=(name)=>name.trim();\n`;
 const bad=`export const addName=(name)=>name.trim();\nexport const validate=()=>true;\n`;
 const summary=tdd.rejectedGreenCandidate([{path:'server/people.mjs',content:bad}],[{relative:'server/people.mjs',exists:true,content:baseline}]);
 assert.match(summary,/server\/people\.mjs/);
 assert.match(summary,/validate=\(\)=>true/);
 assert.match(summary,/first change at line 2/);
});

test('GREEN source previews include implementation entrypoints despite many newly generated RED tests',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v275-snapshot-'));
 try{
  execFileSync('git',['init','-q',root]);
  await fs.mkdir(path.join(root,'server'));
  await fs.mkdir(path.join(root,'src'));
  await fs.writeFile(path.join(root,'package.json'),'{"scripts":{"test":"node --test server/*.test.mjs"}}');
  await fs.writeFile(path.join(root,'server','index.mjs'),'export async function makeApp(){return {app:{},client:{}}}\n'+'// existing application source\n'.repeat(480)+'export function rejectBlankName(name){return !!String(name).trim()}');
  await fs.writeFile(path.join(root,'src','main.jsx'),'export const Form = () => null');
  for(let i=1;i<=25;i++)await fs.writeFile(path.join(root,'server',`br-007-ac${String(i).padStart(2,'0')}.test.mjs`),`import test from 'node:test';test('AC-${i}',()=>{});`);
  const source=await pipeline.snapshotSource(root,8);
  assert.equal(source.previews.length,8);
  const top=source.previews.slice(0,3).map(x=>x.path);
  assert.ok(top.includes('server/index.mjs'),JSON.stringify(top));
  assert.ok(top.includes('src/main.jsx'),JSON.stringify(top));
  assert.ok(top.includes('package.json'),JSON.stringify(top));
  const prompt=tdd.greenPrompt({brId:'BR-007',revision:1,stackId:'react',brText:'Reject blank names',source,criterion:{id:'AC-04',description:'Reject whitespace-only names',acceptance:'HTTP 400, no database insert'},redEvidence:[],lockedTestSources:[{relative:'server/br-007-ac04.test.mjs',content:'assert.equal(res.status,400)'}]});
  assert.match(prompt,/makeApp/);
  assert.match(prompt,/rejectBlankName/,'source preview includes the tail of a long backend module');
  assert.match(prompt,/Form/);
  assert.match(prompt,/rejecting invalid data/i);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('GREEN execution preserves assertion diagnostics through logs, rejected candidate, and prompt',async()=>{
 const code=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const git=await fs.readFile(path.join(__dirname,'../src/developer-git.js'),'utf8');
 assert.match(code,/row\.failureDetails\|\|developerTdd\.extractGreenFailureDetails/);
 assert.match(code,/developerTdd\.rejectedGreenCandidate\(result\.files,beforeGreen/);
 assert.match(code,/failed source rolled back/);
 assert.match(git,/\.slice\(-96000\)/);
});
