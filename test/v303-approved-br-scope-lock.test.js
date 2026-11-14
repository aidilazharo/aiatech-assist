'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const extension=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const personBr='BR-009: Single-screen person-name management with persistent accessible CRUD. Jira Tasks were published for implementation.';

test('BR scope rejects unrelated task demo even when source is a stack starter',()=>{
 const files=[{path:'src/App.tsx',content:"export default function App(){return <><h1>New Task</h1><button>New Task</button></>}"},
              {path:'server/routes.js',content:"app.get('/api/tasks', listTasks)"}];
 assert.deepEqual(tdd.unrelatedPersonFixturePaths(files,personBr),[
  {path:'src/App.tsx',reasons:['unrelated task fixture']},
  {path:'server/routes.js',reasons:['unrelated task fixture']}
 ]);
});

test('BR scope rejects accented café example and keeps legitimate personal names',()=>{
 const violations=tdd.unrelatedPersonFixturePaths([{path:'src/Name.jsx',content:"const name='Café'"}],personBr);
 assert.deepEqual(violations,[{path:'src/Name.jsx',reasons:['unrelated cafe fixture']}]);
 assert.deepEqual(tdd.unrelatedPersonFixturePaths([{path:'src/Name.jsx',content:"const name='José Alvarez'; const label='Person name'"}],personBr),[]);
});

test('Non-person BRs are not accidentally denied their own approved task features',()=>{
 const files=[{path:'src/App.tsx',content:"const label='New Task'; const url='/api/tasks'"}];
 assert.deepEqual(tdd.unrelatedPersonFixturePaths(files,'Approved task-list management with create, edit and delete.'),[]);
});

test('GREEN prompt explicitly says approved BR outranks scaffold and includes rejected-output guidance',()=>{
 const prompt=tdd.greenPrompt({brText:personBr,brId:'BR-009',revision:1,stackId:'react',source:{files:[],previews:[]},
  criterion:{id:'AC-01',description:'Add a person name',acceptance:'Persist and show new name'},redEvidence:[],
  rejectedManifestFeedback:'Generated source contains unrelated task fixture in src/App.tsx'});
 assert.match(prompt,/approved BR is the ONLY authority/);
 assert.match(prompt,/not a BR requirement/i);
 assert.match(prompt,/PREVIOUS SOURCE MANIFEST WAS REJECTED/);
 assert.match(prompt,/unrelated task fixture/);
});

test('Rejected GREEN manifests are corrected before consuming another GREEN test attempt',()=>{
 assert.match(extension,/for\(let manifestPass=0;manifestPass<3;manifestPass\+\+\)/);
 assert.match(extension,/rejectedManifestFeedback/);
 assert.match(extension,/if\(!result\)\{\s*greenFailures\.push\(rejectedManifestFeedback\);/);
 assert.match(extension,/const scopeReminder=/);
});
