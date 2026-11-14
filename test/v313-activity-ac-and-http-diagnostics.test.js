'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=part=>fs.readFileSync(path.join(root,part),'utf8');
const host=read('test/generated/extension-source.txt');
const webview=read('media/start.js');
const tdd=require('../src/developer-tdd');

test('Activity renders newest events above earlier events without reversing saved repair History',()=>{
 assert.match(webview,/developerBrTab==='logs'\)text=developerBrActivity\.length\?developerBrActivity\.slice\(\)\.reverse\(\)\.join/);
 assert.match(webview,/if\(developerBrTab==='logs'\)output\.scrollTop=0/);
 assert.match(webview,/\$\('developerBrRecoveryHistory'\)\.textContent=show\?/);
 assert.match(webview,/developerBrActivity\.push\(new Date\(\)\.toLocaleTimeString\(\)/);
});
test('active AC label replaces Found/Resolved/Open without removing Jira link or internal issue counters',()=>{
 const live=host.slice(host.indexOf('class="developer-br-live-meta"'),host.indexOf('id="developerBrWorkArea"'));
 assert.match(live,/id="developerBrCurrentJira"/);
 assert.match(live,/id="developerBrCriterionProgress">AC —/);
 assert.doesNotMatch(live,/>Found |id="developerBrIssueFound"|>Resolved |id="developerBrIssueOpen"/);
 assert.match(webview,/developerBrCycleTotal>0&&index>0\?criterion\+' \('\+index\+'\/'\+developerBrCycleTotal\+'\)'/);
 assert.match(webview,/renderDeveloperCriterionProgress\(\);/);
 assert.match(webview,/Diagnostic issues:/);
});
test('route extraction prefers known POST method over repeated UNKNOWN reference to same test path',()=>{
 const content="const result = await request(app).post('/api/people').send({name:'Ada'}); const url = '/api/people';";
 const evidence=tdd.httpContractEvidence([{relative:'test/people.test.js',content}],{previews:[]});
 assert.deepEqual(evidence.testRoutes.map(x=>x.method+' '+x.url),['POST /api/people']);
 assert.match(evidence.summary,/No matching explicit route declaration/);
});
test('missing explicit handler is only advisory because routers may be dynamically mounted',()=>{
 const evidence=tdd.httpContractEvidence([{relative:'test/people.test.js',content:"request(app).post('/api/people')"}],{previews:[{path:'server/index.mjs',content:"app.post('/api/tasks', handler)"}]});
 assert.match(evidence.summary,/No matching explicit route declaration is visible/);
 assert.match(evidence.summary,/not proof of absence/);
 assert.deepEqual(evidence.sourceRoutes.map(x=>x.method+' '+x.url),['POST /api/tasks']);
});
test('source syntax parse errors do not get treated as missing API routes',()=>{
 const parse=tdd.diagnoseGreenFailure("RollupError: Parse failure: Expected '(', got '[' | server/index.mjs:34");
 assert.equal(parse.kind,'source-parse-failure');
 assert.match(parse.advice,/reported line/);
 const missing=tdd.diagnoseGreenFailure('actual: 404\nexpected: 201');
 assert.equal(missing.kind,'http-route-not-found');
 assert.match(missing.advice,/exact app returned by makeApp/);
});
test('AC create-route repair prompt targets same test factory and preserves locked assertions',()=>{
 const prompt=tdd.greenPrompt({brText:'Approved Person Name CRUD',brId:'BR-1',revision:1,stackId:'react',source:{files:['server/index.mjs'],previews:[]},criterion:{id:'AC-03',description:'Create person',acceptance:'Valid names can be created'},lockedTestSources:[{relative:'test/people.test.js',content:"request(app).post('/api/people')"}],httpContractTrace:'POST /api/people'});
 assert.match(prompt,/very Express app constructed and returned by the server factory/);
 assert.match(prompt,/middleware ordering/);
 assert.match(prompt,/Never change locked tests|never change locked tests/);
});
