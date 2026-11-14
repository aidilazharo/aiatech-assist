'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');

const waitForError='TypeError: (0 , waitFor) is not a function';

test('RED treats unavailable waitFor as an invalid test and never locks it',()=>{
 const evidence=[{passed:false,logs:`FAIL example.test.jsx\n${waitForError}\nAssertionError: expected Ada Lovelace` }];
 assert.equal(tdd.redInfrastructureFailure(evidence),true);
 assert.throws(()=>tdd.verifyRed(evidence),/invalid test or environment/);
 assert.equal(tdd.redInfrastructureFailure([{passed:false,logs:'AssertionError: expected Ada Lovelace, received empty content'}]),false);
});

test('GREEN detects invalid current-criterion waitFor test, not unrelated test',()=>{
 const evidence=[{passed:false,logs:waitForError}];
 const current=[{relative:'tests/br-008-ac03.test.jsx',content:"import {waitFor} from '@testing-library/user-event'; test('create',async()=>{await waitFor(()=>{expect(true).toBe(true)})})"}];
 assert.equal(tdd.invalidLockedTestHarnessEvidence(evidence,current).kind,'waitFor');
 assert.equal(tdd.invalidLockedTestHarnessEvidence(evidence,[{content:'test(\"create\",()=>{expect(true).toBe(true)})'}]),null);
 assert.equal(tdd.invalidLockedTestHarnessEvidence([{passed:false,logs:'Unable to find text: Ada Lovelace'}],current),null);
 assert.equal(tdd.invalidLockedTestHarnessEvidence([{passed:true,logs:waitForError}],current),null);
});

test('clearly unsupported waitFor imports are rejected, supported import and findByText are allowed',()=>{
 assert.deepEqual(tdd.invalidWaitForImportPaths([{path:'tests/one.test.jsx',content:"import {waitFor} from '@testing-library/user-event';"},{path:'tests/two.test.js',content:"const { waitFor } = require('node:test');"}]),['tests/one.test.jsx','tests/two.test.js']);
 assert.deepEqual(tdd.invalidWaitForImportPaths([{path:'tests/valid.test.jsx',content:"import {waitFor, render} from '@testing-library/react';"},{path:'tests/valid-dom.test.jsx',content:"import { waitFor } from '@testing-library/dom'"},{path:'tests/valid-query.test.jsx',content:'await screen.findByText(\"Ada Lovelace\");'}]),[]);
});

test('workflow has a strictly bounded RED regeneration path that checks locked tests',()=>{
 assert.match(host,/criterionCycle:\s*for\(let cycleIndex=/);
 assert.match(host,/const redHarnessRegenerations=new Map\(\)/);
 assert.match(host,/developerTdd\.invalidLockedTestHarnessEvidence\(failed,cycleTests,\{criterion,brText,source:cycleSource\}\)/);
 assert.match(host,/const limit=2/);
 assert.match(host,/cycleRedBefore\.every\(row=>row\.exists===false\)/);
 assert.match(host,/await developerTdd\.assertLockedTests\(lockedTests\);\s*await developerTdd\.restoreChanges\(cycleRedBefore\)/);
 assert.match(host,/lockedTests\.splice\(lockedTests\.length-cycleTests\.length,cycleTests\.length\)/);
 assert.match(host,/record\.testFiles=record\.testFiles\.filter/);
 assert.match(host,/cycleIndex--;continue criterionCycle/);
 assert.match(host,/blocked\.code='TDD_REPAIR_BLOCKED'/);
 const source=host.slice(host.indexOf('const rejected=new Set((criterion.testFiles'),host.indexOf('cycleIndex--;continue criterionCycle'));
 assert.doesNotMatch(source,/run\.worktree\s*=|repoRoot\s*=|await developerBR\.writeGenerated/);
});

test('safe red-test regeneration removes only new criterion tests and protects prior tests',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv289-red-harness-'));
 try{
  const previous=path.join(root,'tests','previous.test.js');
  const generated=path.join(root,'tests','current.test.js');
  await fs.mkdir(path.dirname(previous),{recursive:true});
  await fs.writeFile(previous,'// previously verified locked test\n');
  const before=await tdd.snapshotBeforeChanges(root,[{path:'tests/current.test.js'}]);
  assert.equal(before[0].exists,false);
  await fs.writeFile(generated,'// invalid generated test\n');
  const old=await tdd.snapshotBeforeChanges(root,[{path:'tests/previous.test.js'}]);
  await tdd.assertLockedTests([old[0]]);
  await tdd.restoreChanges(before);
  await assert.rejects(fs.access(generated),/ENOENT/);
  assert.equal(await fs.readFile(previous,'utf8'),'// previously verified locked test\n');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
