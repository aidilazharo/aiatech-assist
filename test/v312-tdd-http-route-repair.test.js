'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const criterion={id:'AC-02',description:'Create person name',acceptance:'Person name is saved and listed'};
const br='Approved person-name CRUD, create a named person with identifier and validation';
const locked=[{relative:'tests/br-person-ac02.test.js',content:`import { makeApp } from '../server/index.mjs';
const { app } = await makeApp('file:test.db');
const base = 'http://127.0.0.1:3001';
const response = await fetch(base + '/api/person-names', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ name:'Ada Lovelace' })});
assert.equal(response.status,201);`}];

test('extracts method and endpoint from actual locked HTTP test and source handlers, without reading credentials',()=>{
 const source={previews:[{path:'server/index.mjs',content:`app.use('/api', router);\nrouter.post('/api/tasks', taskHandler);`},{path:'test/other.test.js',content:`app.post('/api/not-an-app-route', fn)`}]};
 const trace=tdd.httpContractEvidence(locked,source);
 assert.deepEqual(trace.testRoutes.map(r=>[r.method,r.url]),[['POST','/api/person-names']]);
 assert.ok(trace.sourceRoutes.some(r=>r.method==='USE'&&r.url==='/api'));
 assert.ok(trace.sourceRoutes.some(r=>r.method==='POST'&&r.url==='/api/tasks'));
 assert.ok(!trace.sourceRoutes.some(r=>r.url==='/api/not-an-app-route'));
 assert.match(trace.summary,/POST \/api\/person-names/);
 assert.match(trace.summary,/router\/ entry point|server\/router entry point/);
});

test('does not hallucinate method when route appears in computed URL and request options are unknown',()=>{
 const trace=tdd.httpContractEvidence([{relative:'a.test.js',content:"const path='/api/people'; const result=await helper(path);"}],{previews:[]});
 assert.equal(trace.testRoutes[0].method,'UNKNOWN');
 assert.equal(trace.sourceRoutes.length,0);
 assert.match(trace.summary,/No API route declarations/);
});

test('captures direct supertest .post calls as POST without assuming server registration',()=>{
 const trace=tdd.httpContractEvidence([{relative:'a.test.js',content:"const response = await request(app).post('/api/people').send({name:'Ada'});"}],{previews:[]});
 assert.equal(trace.testRoutes[0].method,'POST');
 assert.equal(trace.testRoutes[0].url,'/api/people');
});

test('classifies 404 instead of 201 distinctly and provides route-specific repair direction',()=>{
 const log="AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\nactual: 404\nexpected: 201\noperator: strictEqual";
 const diagnosis=tdd.diagnoseGreenFailure(log);
 assert.equal(diagnosis.kind,'http-route-not-found');
 assert.match(diagnosis.advice,/server factory/);
 assert.match(diagnosis.advice,/Preserve existing handlers and locked tests/);
 assert.equal(tdd.diagnoseGreenFailure('actual: 400\nexpected: 201').kind,'http-contract');
});

test('supplies concrete route evidence to ordinary and quarantined AI repair prompts while protecting locked tests',()=>{
 const trace=tdd.httpContractEvidence(locked,{previews:[{path:'server/index.mjs',content:"app.post('/api/tasks', handler)"}]}).summary;
 const args={brText:br,brId:'BR-PERSON',revision:1,stackId:'react',source:{files:['server/index.mjs'],previews:[]},criterion,lockedTestSources:locked,httpContractTrace:trace,repairLog:'actual: 404 expected: 201'};
 const basic=tdd.greenPrompt(args);
 const recovery=tdd.greenRecoveryPrompt({...args,stagedRepair:true});
 for(const prompt of [basic,recovery]){
  assert.match(prompt,/HTTP ROUTE CONTRACT TRACE/);
  assert.match(prompt,/POST \/api\/person-names/);
  assert.match(prompt,/keep|Keep baseline routes/);
  assert.match(prompt,/Never change locked tests|never change locked tests/);
 }
});

test('host adds current route inventory to recovery and Activity logs but never edits locked RED assertions',()=>{
 assert.match(host,/developerTdd\.httpContractEvidence\(cycleTests\|\|\[\],codeSource\)/);
 assert.match(host,/httpContractTrace,stagedRepair/);
 assert.match(host,/locked test route:/);
 assert.match(host,/developerTdd\.assertLockedTests\(lockedTests\)/);
 assert.match(host,/if\(!greenPassed&&greenRepairSession\.hasChanges\(\)\)/);
});
