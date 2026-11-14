'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');

test('RED gate detects brittle literal Delete-button JSX/source regex as in BR-007 log',()=>{
 const content=String.raw`const html=readFileSync('src/App.jsx','utf8'); assert.match(html, /<button\b[^>]*>\s*delete\s*<\/button>/i);`;
 assert.deepEqual(tdd.fragileMarkupTestPaths([{path:'server/br-007-red.test.mjs',content}]),['server/br-007-red.test.mjs']);
 const meaningfulJsx='<button onClick={() => remove(id)} aria-label="Delete person"><TrashIcon/>Delete</button>';
 assert.doesNotMatch(meaningfulJsx,/<button\b[^>]*>\s*delete\s*<\/button>/i,'source-level matcher falsely rejects valid JSX');
});
test('RED gate rejects brittle combined ul/ol/table and saved-name source regex',()=>{
 const content=String.raw`assert.match(html, /<(?:ul|ol|table)\b[\s\S]*?(?:saved\s+names|person\s+names|people|persons)[\s\S]*?<\/(?:ul|ol|table)>/i);`;
 assert.deepEqual(tdd.fragileMarkupTestPaths([{path:'server/list.test.mjs',content}]),['server/list.test.mjs']);
});
test('RED gate accepts executable API assertions and actual accessibility role queries',()=>{
 const files=[{path:'server/api.test.mjs',content:"test('save name', async()=>{assert.equal((await fetch('http://localhost/api/names')).status,201)})"},
  {path:'src/ui.test.jsx',content:"expect(screen.getByRole('button',{name:/delete/i})).toBeVisible()"}];
 assert.deepEqual(tdd.fragileMarkupTestPaths(files),[]);
});
test('RED quality screening occurs before generated files are written',()=>{
 assert.match(host,/const fragileMarkup=developerTdd\.fragileMarkupTestPaths\(redManifest\.files\)/);
 assert.ok(host.indexOf('const fragileMarkup=developerTdd.fragileMarkupTestPaths')<host.indexOf('const beforeRed=await developerTdd.snapshotBeforeChanges(run.worktree,redManifest.files)'));
 assert.match(host,/brittle UI-source assertions detected/);
 assert.match(host,/lockedTestSources:cycleTests\|\|\[\]/);
});
test('GREEN gets precise, complete read-only criterion tests in addition to source snapshots',()=>{
 const prompt=tdd.greenPrompt({brText:'Names',brId:'BR-007',revision:1,stackId:'React',source:{files:[],previews:[]},redEvidence:[],criterion:{id:'AC-01',description:'Delete a name',acceptance:'Removes selected name'},lockedTestSources:[{relative:'server/br-007-delete.test.mjs',content:'assert.equal(result.status, 204)'}]});
 assert.match(prompt,/EXACT LOCKED RED TEST SOURCE FOR THIS CRITERION/);
 assert.match(prompt,/server\/br-007-delete.test.mjs/);
 assert.match(prompt,/assert.equal\(result.status, 204\)/);
 assert.match(prompt,/read.only/i);
});
test('planning splits CRUD actions into independent criteria',()=>{
 const prompt=tdd.planningPrompt({brText:'Manage names',brId:'BR-007',revision:1,stackId:'React',source:{files:[],previews:[]}});
 assert.match(prompt,/separate adding, listing, editing, deleting, and validation/);
});
