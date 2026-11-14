'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const deps=require('../src/stack-dependency-helper');
const pipeline=require('../src/developer-br-pipeline');

test('GREEN error summary surfaces actual assertion instead of opaque retry count',()=>{
 const logs='test 1/1\nnot ok 1 - saving a person name\nAssertionError: expected 200, received 404\n';
 assert.match(tdd.summarizeGreenFailure(logs),/not ok 1/);
 assert.match(tdd.summarizeGreenFailure('x\nTypeError: names.map is not a function\ny'),/TypeError: names.map/);
 assert.equal(tdd.summarizeGreenFailure('oops',3),'oop');
});
test('GREEN repairs use only the current criterion failure and preserve locked tests',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/const greenFailures=\[\]/);
 assert.match(host,/greenFailures\.slice\(recovering\?-4:-2\)/);
 assert.doesNotMatch(host,/repairLog:attempt\?run\.evidence\.filter\(x=>x\.phase==='GREEN'/);
 assert.match(host,/await developerTdd\.assertLockedTests\(lockedTests\)/);
 assert.match(host,/Last test failure:/);
});
test('New progress stylesheet always uses 9 columns and flexible connectors',async()=>{
 const css=await fs.readFile(path.join(__dirname,'../media/start.css'),'utf8');
 const start=css.indexOf('/* v0.2.71: All nine TDD milestones');
 const end=css.indexOf('/* v0.2.74',start);
 const newCSS=css.slice(start,end>start?end:undefined);
 assert.ok(newCSS.length>500);
 assert.match(newCSS,/grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
 assert.match(newCSS,/grid-auto-flow:column/);
 assert.match(newCSS,/width:calc\(100% - var\(--atgv-tdd-circle\)\)/);
 assert.match(newCSS,/display:block;/);
 assert.doesNotMatch(newCSS,/grid-template-columns:repeat\([23],/);
});
test('Private OS-specific npm cache is stable across worktrees and never inside a checkout',async()=>{
 const one=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-npm-cache-one-'));
 const two=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-npm-cache-two-'));
 try{
  const a=await deps.isolatedNpmCache(one),b=await deps.isolatedNpmCache(two);
  assert.equal(a,b,'different project worktrees share the content-addressed npm cache');
  assert.ok(a.includes(`${process.platform}-${process.arch}-node`));
  assert.ok(!a.startsWith(one)&&!b.startsWith(two));
  assert.ok((await fs.lstat(a)).isDirectory());
 }finally{await fs.rm(one,{recursive:true,force:true});await fs.rm(two,{recursive:true,force:true});}
});
test('BR worktree dependency preparation verifies existing installs instead of forcibly reinstalling on restart',async()=>{
 const js=await fs.readFile(path.join(__dirname,'../src/developer-br-pipeline.js'),'utf8');
 assert.match(js,/installMode:'auto'/);
 assert.match(js,/preparedNpmTargets\.has\(key\)/);
 assert.doesNotMatch(js,/installMode:'fresh'/);
});
