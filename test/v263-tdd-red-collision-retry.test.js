'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const root=path.join(__dirname,'..');
test('RED detects path collisions before writing and matches filename case on macOS',()=>{
 const existing=['server/api.test.mjs','src/__tests__/people.test.tsx','src/app.jsx'];
 const generated=[{path:'server/API.test.mjs',content:'test("bad",()=>assert(false))'}, {path:'tests/br-007-person-name-red.test.js',content:'test("new",()=>assert(false))'}];
 assert.deepEqual(tdd.collidingTestPaths(generated,existing),['server/API.test.mjs']);
 assert.deepEqual(tdd.collidingTestPaths([generated[1]],existing),[]);
});
test('RED retries explicitly prohibit replacement of existing tests',()=>{
 const prompt=tdd.testsOnlyPrompt({brText:'Manage people',brId:'BR-007',revision:1,stackId:'react',source:{files:['server/api.test.mjs','src/app.jsx'],previews:[]},collisions:['server/api.test.mjs'],attempt:1});
 assert.match(prompt,/EVERY returned file path MUST BE NEW/);
 assert.match(prompt,/server\/api\.test\.mjs/);
 assert.match(prompt,/RETRY 2/);
 const extension=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
 const generation=extension.slice(extension.indexOf('async function runDeveloperBrAutomation('),extension.indexOf('async function runDeveloperDeliveryChecks('));
 assert.match(generation,/redCollisions=developerTdd\.collidingTestPaths/);
 assert.match(generation,/after 3 attempts/);
 assert.ok(generation.indexOf('collidingTestPaths(redManifest.files,source.files)')<generation.indexOf('writeGenerated(run.worktree,redManifest.files)'));
});
test('TDD progress callbacks use stage and message, rather than object coercion',()=>{
 const a=fs.readFileSync(path.join(root,'src/developer-tdd.js'),'utf8');
 const b=fs.readFileSync(path.join(root,'src/developer-br-pipeline.js'),'utf8');
 assert.match(a,/await onUpdate\(phase,`/);
 assert.doesNotMatch(a,/onUpdate\(\{stage:phase/);
 assert.match(b,/await onUpdate\(operation===/);
 assert.doesNotMatch(b,/onUpdate\(\{stage:operation/);
});
