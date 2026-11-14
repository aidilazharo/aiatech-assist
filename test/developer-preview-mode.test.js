'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeProjectInput}=require('../src/projects');
const preview=require('../src/developer-preview-mode');

test('project preview defaults off and is strictly project scoped',()=>{
 const a=normalizeProjectInput({name:'Alpha',settings:{development:{previewWithoutTests:true}}});
 const b=normalizeProjectInput({name:'Beta'});
 assert.equal(preview.allowed(a),true);
 assert.equal(preview.allowed(b),false);
 assert.equal(a.settings.development.previewWithoutTests,true);
 assert.equal(b.settings.development.previewWithoutTests,false);
 assert.throws(()=>normalizeProjectInput({name:'Nope',settings:{development:{previewWithoutTests:'true'}}}),/boolean/);
 assert.throws(()=>normalizeProjectInput({name:'Nope',settings:{development:{previewWithoutTests:1}}}),/boolean/);
 assert.throws(()=>preview.requireAllowed(b),/Enable Allow untested/);
 assert.doesNotThrow(()=>preview.requireAllowed(a));
});

test('project preview survives partial updates and can be explicitly disabled',()=>{
 const base=normalizeProjectInput({name:'Alpha',settings:{development:{previewWithoutTests:true},github:{owner:'team',repo:'a'}}});
 const after=normalizeProjectInput({name:'New Alpha'},base);
 assert.equal(after.settings.development.previewWithoutTests,true);
 assert.equal(after.settings.github.owner,'team');
 const off=normalizeProjectInput({name:'New Alpha',settings:{development:{previewWithoutTests:false}}},after);
 assert.equal(preview.allowed(off),false);
});

test('preview AI prompt cannot request changes to tests or dependency manifests',()=>{
 const prompt=preview.draftPrompt({brId:'BR-001',revision:1,brText:'Person name can be added.',stackId:'react',source:{files:['src/App.tsx','server/index.mjs'],previews:[]},approvedDesignHandoff:[{kind:'ux-ticket',sourceTicketKey:'TC-210',number:3,designFramework:'aia-qi',screens:[{name:'People',components:['Add name button'],interactions:['Create person']}]}]});
 assert.match(prompt,/UNTESTED/);
 assert.match(prompt,/Do not create or modify tests/);
 assert.match(prompt,/existing dev\/start command/);
 assert.match(prompt,/Person name can be added/);
 assert.match(prompt,/COMPLETE LINKED APPROVED UI\/UX DESIGN/);
 assert.match(prompt,/TC-210/);
 assert.throws(()=>preview.draftPrompt({brId:'../../oops'}),/Invalid BR/);
 assert.equal(preview.status({worktree:'/tmp/draft'}).checksPassed,false);
 assert.equal(preview.status({worktree:'/tmp/draft'}).productionReady,false);
});

test('UI and controller have a separate preview action and cannot mark delivery as tested',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
 assert.match(html,/id="projectPreviewWithoutTests"/);
 assert.match(html,/id="developerBrPreviewDraft"[^>]*aria-label="Preview Draft"[^>]*><svg[^>]+aria-hidden="true"/);
 assert.doesNotMatch(html,/Preview Draft \(No Tests?\)/);
 assert.match(html,/case 'developerBrPreviewDraft'/);
 assert.match(html,/await launchUntestedDraftServer/);
 assert.match(html,/run\.checksPassed=false/);
 assert.match(js,/developerBrDone=msg\.stage==='complete'&&!developerBrPreviewOnly/);
 assert.match(js,/developerBrDraftPhases/);
 assert.match(js,/developerBrDraftReady=msg\.stage==='complete'/);
 assert.match(js,/projectDraftPreviewEnabled\(\)/);
 assert.match(js,/developerBrPreviewDraft'\)\.addEventListener/);
});
