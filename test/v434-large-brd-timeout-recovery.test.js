'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const recovery=require('../src/ba-large-document-recovery');
const discovery=require('../src/discovery-import');
const preflight=require('../src/ba-document-preflight');
const working=require('../src/ba-working-br');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');

const longFixture=[
 'GATE MVP1a Requirements Baseline v2.0',
 'Document status REVIEW BASELINE (not formally approved)',
 'GATE-FR-001 GATE shall authorize new project initiators.',
 'D-01 OPEN DECISION: Technology portfolio role assignment requires Product Owner confirmation.',
 'Annex A — Detailed source requirement baseline',
 ...Array.from({length:800},(_,i)=>'GATE-SRC-'+String(i+1).padStart(3,'0')+' Project approval shall record audit, permissions, Finance cost centre, approval version and required decisions.'),
 'Annex B — Original master-data and authorization tables',
 ...Array.from({length:500},(_,i)=>'Cost Centre MY'+String(35000+i)+' Active'),
].join('\n');

test('source-only fallback is restricted to large documents and preserves source without invented decisions',()=>{
 assert.ok(longFixture.length>60000);
 assert.equal(recovery.isLargeDocument(longFixture.length),true);
 assert.equal(recovery.isLargeDocument(20000),false);
 assert.equal(recovery.timeout('preflight',true),45000);
 assert.equal(recovery.timeout('mapping',true),75000);
 assert.equal(recovery.attempts('preflight',true,false),1);
 assert.equal(recovery.attempts('preflight',true,true),2);
 assert.equal(recovery.attempts('preflight',false,false),3);
 const result=recovery.preflight(longFixture);
 assert.equal(result.effectiveText,longFixture);
 assert.equal(result.ready,true);
 assert.equal(result.degraded,true);
 assert.equal(result.status,'needs-review');
 assert.equal(result.applied.length,0);
 assert.equal(result.resolutions.length,0);
 assert.equal(result.blockers.length,0);
 assert.match(result.summary,/NO AI quality validation/);
 const mapped=recovery.mapping(longFixture,{section:1,totalSections:9});
 assert.equal(Object.keys(mapped).length,12);
 assert.match(mapped.businessRules,/GATE-FR-001|GATE-SRC/);
 assert.match(mapped.questions,/D-01 OPEN DECISION/);
 assert.match(mapped.questions,/AI NOT VERIFIED/);
 assert.doesNotMatch(JSON.stringify(mapped),/\"questions\":\"NONE\"/);
 assert.ok(Object.values(mapped).every(x=>typeof x==='string'&&x.length<=5000));
});
test('authenticated checkpoint payload can remember source-only recovery, not misparse as AI success',()=>{
 const sentinel=recovery.checkpointRecord('mapping');
 const saved=recovery.checkpointRecord('preflight');
 assert.equal(recovery.isCheckpointRecord(sentinel,'mapping'),true);
 assert.equal(recovery.isCheckpointRecord(saved,'preflight'),true);
 assert.equal(recovery.isCheckpointRecord(sentinel,'preflight'),false);
 assert.equal(recovery.isCheckpointRecord('{"answers":{}}','mapping'),false);
 assert.equal(recovery.isCheckpointRecord('{bad}', 'preflight'),false);
});
test('working BR labels incomplete AI validation rather than reporting a passing quality review',()=>{
 const crypto=require('node:crypto');
 const digest=crypto.createHash('sha256').update(longFixture).digest('hex');
 const sections=discovery.splitDocumentText(longFixture,12000);
 const reports=sections.map(text=>recovery.preflight(text));
 const draft=working.prepare({name:'fixture.docx',text:longFixture,digest},sections,reports);
 assert.equal(draft.sections.map(s=>s.text).join(''),longFixture);
 assert.ok(draft.checks.some(x=>x.status.includes('NOT VERIFIED')));
 assert.match(draft.content,/BA REVIEW REQUIRED/);
 assert.doesNotMatch(draft.content,/AI preflight quality and contradiction review: PASS/);
});
test('all document sections remain covered and fallback mapping merges without fabricating source rules',()=>{
 const sections=discovery.splitDocumentText(longFixture,12000);
 assert.ok(sections.length>5);
 assert.equal(sections.join(''),longFixture);
 const results=sections.map((text,i)=>recovery.mapping(text,{section:i+1,totalSections:sections.length}));
 for(const row of results)assert.ok(Object.keys(row).length===12);
 const combined=discovery.mergeMappingAnswers(results);
 assert.match(combined.questions,/D-01 OPEN DECISION/);
 assert.match(combined.businessRules,/GATE-FR-001/);
 assert.ok(Object.values(combined).every(x=>x.length<=100000));
});
test('runtime budgets per request; no false cross-section certification and no automatic approval',()=>{
 assert.match(host,/run\.largeSource=baLargeDocumentRecovery\.isLargeDocument\(source\.text\.length\)/);
 assert.match(host,/run\.preflightOffline=true;run\.sourceOnlyPreflight=true/);
 assert.match(host,/run\.mappingOffline=true;sourceOnlyMappingPart=true/);
 assert.match(host,/status:partialVerification\?'needs-review':'ready'/);
 assert.match(host,/sections\.length>1&&!run\.mappingOffline/);
 assert.match(host,/baLargeDocumentRecovery\.timeout\('cross',!!run\.largeSource\)/);
 assert.match(host,/source-only extraction, with full source retained and BA review required/);
});
