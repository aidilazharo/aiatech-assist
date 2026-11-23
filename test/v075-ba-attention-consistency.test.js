'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const quality=require('../src/ba-automatic-workflow');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('BR quality finding identifies the exact affected section and quoted text',()=>{
 const draft={id:'BR-013',title:'Controlled Project Initiation and Portfolio Routing',
  objective:'Digitize project initiation and route to the Portfolio Lead.',
  scope:'MVP1a applies only to projects below MYR250,000.',
  acceptanceCriteria:'Given an authorized user, when valid data is submitted, then GATE records the initiator.',
  work:[],evidence:[]};
 const quote='MVP1a applies only to projects below MYR250,000.';
 const result=quality.parseQuality(JSON.stringify({excluded:[{
  id:'BR-013',quote,reason:'Cost threshold conflicts with source evidence.',conflict:null
 }]}),[draft],[]);
 assert.equal(result.length,1);
 assert.equal(result[0].id,'BR-013');
 assert.equal(result[0].field,'Scope');
 assert.equal(result[0].quote,quote);
 assert.match(result[0].reason,/Cost threshold/);
});

test('Generated Requirements exposes actionable quality findings without changing literal checklist text',()=>{
 const ui=read('media/ba-automatic-ui.js');
 assert.match(ui,/What needs attention/);
 assert.match(ui,/row\.id\+\(row\.field\?/);
 assert.match(ui,/problem\.quote/);
 assert.match(ui,/text\.textContent=value\|\|'Unspecified'/);
 assert.match(ui,/No BR content changed/);
 assert.doesNotMatch(ui,/checkbox.*problem\.quote|problem\.quote.*checkbox/);
});

test('Regeneration uses current quality findings and reports unchanged content precisely',()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const workflow=read('src/br-workflow.js');
 assert.match(runtime,/UNRESOLVED DRAFT QUALITY FINDINGS/);
 assert.match(runtime,/Regeneration completed: 0 Business Requirements changed/);
 assert.match(runtime,/finding\?\.field/);
 assert.match(workflow,/const unchanged=normalizedContent\(previous\)===normalizedContent\(stable\)/);
 assert.match(workflow,/change:'unchanged',approved:!!existing\.approvedContent/);
});

test('Shared form styling stays consistent while literal DoD markers remain unchanged',()=>{
 const css=read('media/atgv-consistency.css');
 assert.match(css,/#discoveryView \.ba-auto-attention-summary/);
 assert.match(css,/#brEditModal \.ql-container\.ql-snow/);
 assert.match(css,/\.jira-issue-modal-content :is\(input/);
 const jira=read('src/jira-preview-details.js');
 assert.match(jira,/\['acceptanceCriteria','definitionOfDone'\]/);
 assert.match(jira,/'\[ \] '/);
});
