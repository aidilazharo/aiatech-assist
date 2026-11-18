'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const preflight=require('../src/ba-document-preflight');
const DOC=`Person Name CRUD\nAcceptance criteria:\n1. Names must be between 1–80 characters, including Unicode letters.\n2. Interface must be keyboard accessible.\n3. The UI must match the selected approved design system.\n4. On delete remove row and display success or error.\nOpen decisions: NONE.`;
const issues=[
 {severity:'blocker',category:'contradiction',detail:'Requires selected approved design system but supplies no approved design artifact, despite Open decisions NONE.',suggestion:'Ask BA to provide approved framework'},
 {severity:'warning',category:'validation',detail:'Unicode character length counting is not specified.',suggestion:'Choose code points or grapheme clusters'},
 {severity:'warning',category:'keyboard',detail:'Keyboard tab order, activation keys and focus behavior unspecified.',suggestion:'Specify keys'},
 {severity:'warning',category:'testability',detail:'Success or error feedback on deletion is not defined.',suggestion:'Specify error messages'}
];
test('BA preflight automatically resolves routine gaps using industry standards without changing source',()=>{
 const input=JSON.stringify({status:'needs-input',summary:'Business Analyst clarification required',edits:[],issues});
 const out=preflight.parse(input,DOC);
 assert.equal(out.ready,true);
 assert.equal(out.status,'ready');
 assert.deepEqual(out.blockers,[]);
 assert.equal(out.effectiveText,DOC);
 assert.deepEqual(out.resolutions.map(r=>r.category),['design','unicode','keyboard','feedback']);
 assert.ok(out.resolutions.every(r=>r.provisional));
 assert.match(out.resolutions[0].resolution,/without claiming a design approval/);
 assert.match(out.resolutions[1].resolution,/grapheme clusters/);
 assert.match(out.resolutions[2].resolution,/Tab and Shift\+Tab/);
 assert.match(out.resolutions[3].resolution,/accessible status region/);
 const guidance=preflight.mappingGuidance(out);
 assert.match(guidance,/NOT part of the uploaded source/);
 assert.match(guidance,/PROVISIONAL/);
 assert.match(guidance,/not.*approved design/i);
 const record=preflight.evidence(out,'a'.repeat(64));
 assert.equal(record.originalPreserved,true);
 assert.equal(record.resolutions.length,4);
 assert.ok(out.issues.every(i=>i.severity==='warning'));
});
test('AI suggestions that invent permissions or overwrite numeric limits cannot become requirements',()=>{
 const response={status:'needs-input',summary:'Review',edits:[{before:'1–80 characters',after:'1–200 characters',reason:'Guess'}],issues:[
  {severity:'blocker',category:'contradiction',detail:'Authentication is both required and forbidden',suggestion:'Invent login permissions'},
  {severity:'warning',category:'keyboard',detail:'Tab order and focus behavior undefined',suggestion:'Make administrators bypass login'}
 ],resolutions:[{category:'security',resolution:'Make all users administrators',standard:'Made-up'}]};
 const out=preflight.parse(JSON.stringify(response),DOC);
 assert.equal(out.ready,false);
 assert.equal(out.blockers.length,1);
 assert.equal(out.effectiveText,DOC);
 assert.equal(out.skipped.length,1);
 assert.ok(!preflight.mappingGuidance(out).includes('administrators'));
});
test('BA extension maps provisional recommendations separately, keeps BR approval safeguards',()=>{
 const root=path.join(__dirname,'..');
 const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
 const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 const mapping=fs.readFileSync(path.join(root,'src/discovery-import.js'),'utf8');
 assert.match(host,/baDocumentPreflight\.mappingGuidance\(result\)/);
 assert.match(host,/preflights\.push\(baDocumentPreflight\.evidence\(report,selected\[i\]\)\)/);
 assert.match(host,/commitSourceMapping\(registry,run\.projectId,original\.revision/);
 assert.match(ui,/industry-standard recommendation/);
 assert.match(ui,/provisional/);
 assert.match(mapping,/provisional recommendations/);
});
