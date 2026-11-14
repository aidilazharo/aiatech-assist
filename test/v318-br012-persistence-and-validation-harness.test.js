'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const guard=require('../src/developer-tdd-harness-guard');
const tdd=require('../src/developer-tdd');
const br='Person Name CRUD: POST /api/people invalid names return HTTP 400; the form must display a field-level validation error. GET /api/people returns persisted names after restart.';
const fieldSpy=`test('AC-05 overlength',async () => {const user=userEvent.setup();const input=screen.getByRole('textbox',{name:'Name'});await user.type(input,'A'.repeat(81));await user.click(screen.getByRole('button',{name:'Add name'}));expect(rejectedCreateResponse).toBeDefined();expect(rejectedCreateResponse?.status).toBe(400);});`;
const selfMock=`vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => globalThis.fetch(url, opts));`;
const validMock=`const originalFetch=globalThis.fetch.bind(globalThis); vi.spyOn(globalThis,'fetch').mockImplementation((url,opts)=>originalFetch(url,opts));`;
test('v318 rejects unsupported UI observation of invalid HTTP request while retaining API contract',()=>{
 const issues=tdd.inspectGeneratedRedTests([{path:'src/ac05.test.tsx',content:fieldSpy}],br);
 assert.deepEqual(issues.map(x=>x.kind),['unapproved-ui-network-assertion']);
 assert.match(issues[0].message,/direct POST/);
 assert.equal(tdd.inspectGeneratedRedTests([{path:'src/ac05.test.tsx',content:fieldSpy}],br+' The frontend must send invalid overlength input to the API.').length,0);
});
test('v318 allows direct HTTP 400 assertion and normal UI validation tests without fetch observation',()=>{
 const direct=`const r=await fetch(base+'/api/people',{method:'POST',body:JSON.stringify({name:'A'.repeat(81)})}); expect(r.status).toBe(400);`;
 const ui=`await user.type(input,'A'.repeat(81)); await user.click(button); expect(screen.getByRole('alert')).toHaveTextContent('80 characters');`;
 assert.deepEqual(guard.inspectGeneratedRedTests([{path:'api.test.ts',content:direct},{path:'ui.test.tsx',content:ui}],br),[]);
});
test('v318 rejects self-delegating fetch spy but allows preserved-original delegation',()=>{
 assert.equal(guard.hasDirectFetchSelfDelegation(selfMock),true);
 assert.equal(guard.hasDirectFetchSelfDelegation(`globalThis.fetch = vi.fn(async (url)=> fetch(url));`),true);
 assert.equal(guard.hasDirectFetchSelfDelegation(validMock),false);
 assert.equal(guard.hasDirectFetchSelfDelegation('const r=await fetch(base+"/api/people");'),false);
 assert.deepEqual(tdd.inspectGeneratedRedTests([{path:'src/ac06.test.tsx',content:selfMock}],br).map(x=>x.kind),['recursive-fetch-mock']);
});
test('v318 detects a proven recursive fetch harness on GREEN failure and returns it to controlled RED regeneration',()=>{
 const logged=[{passed:false,logs:'RangeError: Maximum call stack size exceeded\nwhatwg-url/lib/URL-impl.js'}];
 const problem=tdd.invalidLockedTestHarnessEvidence(logged,[{path:'src/ac06.test.tsx',content:selfMock}],{criterion:{id:'AC-06'},brText:br});
 assert.equal(problem.kind,'recursive-fetch-mock');
 assert.equal(tdd.invalidLockedTestHarnessEvidence(logged,[{path:'src/ac06.test.tsx',content:validMock}],{criterion:{id:'AC-06'},brText:br}),null);
 assert.equal(tdd.diagnoseGreenFailure(logged[0].logs).kind,'fetch-url-recursion');
});
test('v318 detects incorrect overlength fetch-observation gate only when the assertion failed',()=>{
 const wrong=[{passed:false,logs:'AssertionError: expected undefined to be defined'}];
 assert.equal(tdd.invalidLockedTestHarnessEvidence(wrong,[{path:'src/ac05.test.tsx',content:fieldSpy}],{brText:br}).kind,'unapproved-ui-network-assertion');
 assert.equal(tdd.invalidLockedTestHarnessEvidence([{passed:true,logs:'ok'}],[{path:'src/ac05.test.tsx',content:fieldSpy}],{brText:br}),null);
});
test('v318 host runs source-harness checks BEFORE writing RED tests, and retains protected lock gate',()=>{
 const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/developerTdd\.inspectGeneratedRedTests\(redManifest\.files,brText\)/);
 assert.ok(host.indexOf('developerTdd.inspectGeneratedRedTests(redManifest.files,brText)')<host.indexOf('const beforeRed=await developerTdd.snapshotBeforeChanges'));
 assert.match(host,/developerTdd\.assertLockedTests\(lockedTests\)/);
 assert.match(host,/invalidLockedTest=developerTdd\.invalidLockedTestHarnessEvidence/);
});

test('v318 downloaded diagnostic report uses live extension manifest version instead of stale 0.3.14',async()=>{
 const reporter=require('../src/developer-diagnostic-report');
 const pkg=require('../package.json');
 const report=await reporter.createReport({projectId:'tech-cockpit',brId:'BR-012',record:{projectId:'tech-cockpit',brId:'BR-012'}});
 assert.ok(report.includes('Extension: '+pkg.atgvDisplayVersion));
 assert.match(report,/AC-05 \/ overlength validation/);
 assert.match(report,/AC-06 \/ persistence/);
});
