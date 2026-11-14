'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pipeline=require('../src/developer-br-pipeline');
const extension=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const implementation={summary:'Feature implemented',files:[{path:'src/persons.ts',content:'export const addPerson=(name:string)=>name.trim();'}]};
const unit={summary:'Focused tests',files:[{path:'src/__tests__/persons.test.ts',content:'import {addPerson} from "../persons";test("trims names",()=>{expect(addPerson(" Alice ")).toBe("Alice");});'}]};
const json=obj=>JSON.stringify(obj);
const context={brId:'BR-007',revision:1,stackId:'react',brText:'Manage person names',source:{files:['src/persons.ts','package.json'],previews:[]}};

test('missing unit tests trigger exactly one separate test-only AI prompt before files are accepted',async()=>{
 let calls=0;
 const result=await pipeline.completeFileResponse(json(implementation),{context,requestTests:async prompt=>{
  calls++;
  assert.match(prompt,/Generate ONLY actual unit-test source files/);
  assert.match(prompt,/Manage person names/);
  assert.match(prompt,/src\/persons.ts/);
  return json(unit);
 }});
 assert.equal(calls,1);
 assert.equal(result.testRetryUsed,true);
 assert.equal(result.summary,'Feature implemented');
 assert.deepEqual(result.files.map(x=>x.path),['src/persons.ts','src/__tests__/persons.test.ts']);
 assert.equal(pipeline.hasUnitTest(result.files),true);
});
test('initial manifest with recognized executable tests skips retry',async()=>{
 const result=await pipeline.completeFileResponse(json({...implementation,files:[...implementation.files,...unit.files]}),{context,requestTests:()=>{throw Error('unnecessary retry');}});
 assert.equal(result.testRetryUsed,false);
});
test('second response without a test still fails safely before any write',async()=>{
 await assert.rejects(()=>pipeline.completeFileResponse(json(implementation),{context,requestTests:async()=>json({files:[{path:'README.md',content:'No actual tests'}]})}),/unit-test file/);
 await assert.rejects(()=>pipeline.completeFileResponse(json(implementation),{context,requestTests:async()=>'{invalid json'}),/valid JSON/);
});
test('follow-up cannot overwrite implementation files or escape the workspace',async()=>{
 const same={files:[{path:'SRC/PERSONS.TS',content:'test("oops",()=>{ expect(true).toBe(true); });'},...unit.files]};
 await assert.rejects(()=>pipeline.completeFileResponse(json(implementation),{context,requestTests:async()=>json(same)}),/duplicated an implementation/);
 await assert.rejects(()=>pipeline.completeFileResponse(json(implementation),{context,requestTests:async()=>json({files:[{path:'../outside.test.ts',content:'test("bad",()=>{expect(true).toBe(true)});'}]})}),/Unsafe generated file path/);
});
test('recognizes real test source across React, Java, Python, C#, Go and PHP without accepting documentation',()=>{
 const cases=[
  {path:'src/__tests__/people.spec.tsx',content:'import {test,expect} from "vitest"; test("person",()=>{expect(1).toBe(1);});'},
  {path:'src/test/java/com/example/PeopleTest.java',content:'@Test public void peopleWorks(){assertEquals(1, 1);}'},
  {path:'test_people.py',content:'def test_people():\n    assert 1 == 1\n'},
  {path:'PeopleTests.cs',content:'[Fact] public void PeopleTest(){ Assert.True(true); }'},
  {path:'people_test.go',content:'func TestPeople(t *testing.T){ t.Fatal("check") }'},
  {path:'tests/PeopleTest.php',content:'public function testPeople(){ $this->assertSame(1, 1); }'}
 ];
 for(const row of cases)assert.equal(pipeline.isUnitTestFile(row),true,row.path);
 for(const row of [{path:'tests/README.md',content:'Run unit test here'}, {path:'tests/data.json',content:'{"test":"true"}'},{path:'src/foo.test.ts',content:'// test only'}, {path:'src/foo.ts',content:'test("foo",()=>{});'}])assert.equal(pipeline.isUnitTestFile(row),false,row.path);
});
test('extension generator uses strict test-first TDD rather than post-implementation tests',()=>{
 assert.match(extension,/developerTdd\.testsOnlyPrompt/);
 assert.match(extension,/developerTdd\.verifyRed\(red\)/);
 assert.match(extension,/developerTdd\.greenPrompt/);
 assert.match(extension,/developerTdd\.refactorPrompt/);
 assert.match(extension,/developerTdd\.assertLockedTests\(lockedTests\)/);
 const prompt=pipeline.generationPrompt({...context});
 assert.match(prompt,/ALWAYS include at least one executable unit-test source file/);
});
