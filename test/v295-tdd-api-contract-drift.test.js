'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const personBr='BR-009: Create a simple web application to add, list, edit and delete person names. Store unique ID and name; display saved records.';
const criterion={id:'AC-02',description:'Add a person name',acceptance:'Ada Lovelace appears in the list after saving.'};
const mocked=[{path:'test/br-009-ac02.test.jsx',content:`import {expect,vi} from 'vitest'; test('saves', async()=>{expect(fetchSpy).toHaveBeenCalledWith('/api/tasks')})`}];

test('RED rejects invented exact mocked API URLs not approved by BR or existing app',()=>{
 assert.deepEqual(tdd.unsupportedMockApiContractPaths(mocked,criterion,personBr,{previews:[{path:'src/App.jsx',content:'export default function App() {}'}]}),[{path:mocked[0].path,routes:['/api/tasks']}]);
 const prompt=tdd.testsOnlyPrompt({brId:'BR-009',revision:1,stackId:'react',brText:personBr,source:{files:[],previews:[]},criterion});
 assert.match(prompt,/Do not hard-code a mocked fetch\/spy calledWith URL/);
 assert.match(host,/developerTdd\.unsupportedMockApiContractPaths\(redManifest\.files,criterion,brText,cycleSource\)/);
 assert.match(host,/unsupported mocked API contract; regenerating behavior tests/);
});

test('allow a mocked URL when expressly approved or present in existing application code',()=>{
 assert.deepEqual(tdd.unsupportedMockApiContractPaths(mocked,criterion,personBr+' The API endpoint is /api/tasks.',{previews:[]}),[]);
 assert.deepEqual(tdd.unsupportedMockApiContractPaths(mocked,criterion,personBr,{previews:[{path:'src/server.js',content:"app.post('/api/tasks', createPerson)"}]}),[]);
});

test('do not reject real HTTP behavior tests or hard-coded URLs unrelated to spy assertions',()=>{
 const files=[{path:'test/valid.test.js',content:"const response = await fetch('/api/tasks'); expect(response.ok).toBe(true);"}];
 assert.deepEqual(tdd.unsupportedMockApiContractPaths(files,criterion,personBr,{previews:[]}),[]);
});

test('GREEN invalidates undocumented spy assertions after reaching the mocked code path',()=>{
 const failure=[{passed:false,logs:`AssertionError: expected "spy" to be called with arguments: [ '/api/tasks' ]`}];
 const context={criterion,brText:personBr,source:{previews:[]}};
 const locked=mocked.map(file=>({relative:file.path,content:file.content}));
 assert.equal(tdd.invalidLockedTestHarnessEvidence(failure,locked,context).kind,'unapproved-api-contract');
 assert.equal(tdd.invalidLockedTestHarnessEvidence(failure,locked,{...context,brText:personBr+' Use /api/tasks'}),null);
 assert.equal(tdd.invalidLockedTestHarnessEvidence([{passed:false,logs:'TestingLibraryElementError: Unable to find an element with the text: Ada Lovelace'}],locked,context),null);
 assert.match(host,/invalidLockedTestHarnessEvidence\(failed,cycleTests,\{criterion,brText,source:cycleSource\}\)/);
 assert.match(host,/await developerTdd\.restoreChanges\(cycleRedBefore\)/);
});

test('a missing displayed person name remains a real GREEN defect, with diagnostic guidance',()=>{
 const expected='TestingLibraryElementError: Unable to find an element with the text: Ada Lovelace';
 const sources=[{content:"await user.type(input, 'Ada Lovelace'); expect(screen.getByText('Ada Lovelace')).toBeVisible();"}];
 assert.equal(tdd.invalidLockedTestHarnessEvidence([{passed:false,logs:expected}],sources,{criterion,brText:personBr,source:{previews:[]}}),null);
 const prompt=tdd.greenPrompt({brId:'BR-009',revision:1,stackId:'react',brText:personBr,source:{files:[],previews:[]},criterion,lockedTestSources:sources.map((x,i)=>({...x,relative:'test/current.test.js'})),repairLog:expected});
 assert.match(prompt,/create -> persist -> fetch -> render/);
 assert.match(prompt,/hard-coding example text/);
});
