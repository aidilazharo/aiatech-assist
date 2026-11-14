'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const root=path.join(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');

test('emoji policy rejects pictographic sample data but preserves Unicode-letter names',()=>{
 assert.deepEqual(tdd.emojiManifestPaths([{path:'tests/people.test.js',content:"expect(name).toBe('Café 👩‍🚀')"}]),['tests/people.test.js']);
 assert.deepEqual(tdd.emojiManifestPaths([{path:'tests/people.test.js',content:"expect(name).toBe('José Alvarez')"}]),[]);
 assert.deepEqual(tdd.emojiManifestPaths([{path:'src/name.js',content:"const name = 'Alice Smith';"}]),[]);
});

test('RED prompt keeps examples and Unicode tests strictly inside the BR and disallows emoji',()=>{
 const prompt=tdd.testsOnlyPrompt({brText:'CRUD person names with 1 to 80 Unicode letters',brId:'BR-001',revision:1,stackId:'react',source:{files:[],previews:[]},criterion:{id:'AC-01',description:'Create a person name',acceptance:'Name saved'},discovery:{targets:[]}});
 assert.match(prompt,/Do not generate emoji/);
 assert.match(prompt,/ordinary accented PERSON names/);
 assert.match(prompt,/additional product capabilities or acceptance requirements/);
});

test('GREEN prompt forbids emoji and preserves rejection of invalid control characters',()=>{
 const prompt=tdd.greenPrompt({brText:'CRUD person name',brId:'BR-001',revision:1,stackId:'react',source:{files:[],previews:[]},redEvidence:[],criterion:{id:'AC-01',description:'Save name',acceptance:'Saved name'}});
 assert.match(prompt,/Do not add emoji to source/);
 assert.match(prompt,/Reject control characters such as U\+0085/);
});

test('Developer hides resume hero and restart button while retaining repair history and the main Start Development action',()=>{
 const extension=source('test/generated/extension-source.txt');
 const webview=source('media/start.js');
 assert.match(extension,/const startFreshFromStaleRecord=hasFailedRecord/);
 assert.match(extension,/const selectedRecoveryModel=String\(target\.label/);
 assert.match(extension,/record\.modelHistory=/);
 assert.doesNotMatch(extension,/id="developerBrStartFresh"/);
 assert.doesNotMatch(webview,/developerBrStartFresh/);
 assert.doesNotMatch(webview,/Previous AI model:/);
 assert.doesNotMatch(extension,/id="developerBrRecoveryTitle"/);
 assert.match(extension,/data-developer-br-group="history"[^>]*aria-label="History"/);
 assert.match(extension,/data-developer-br-group="activity"[^>]*aria-label="Activity"/);
 assert.doesNotMatch(extension,/<details><summary>History<\/summary>/);
 assert.match(extension,/aria-label="Activity" title="Activity"/);
 assert.match(webview,/developerBrRecoveryHistory/);
 assert.match(extension,/id="developerBrStart"/);
});
