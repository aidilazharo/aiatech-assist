'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {group,titleFor}=require('../media/completed-br-history');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const cycles=[
 {id:'current',isCurrent:true,requirements:[{id:'BR-007',title:'Auditable Digital Visitor Request, Approval, Check-In, and Check-Out Management',approvedRevision:2,jiraIssues:[{key:'TC-224',kind:'Epic'}]}],sources:[{name:'01_Office_Visitor_Registration.pdf'}]},
 {id:'old1',completedAt:'2026-11-02T12:00:00Z',requirements:[{id:'BR-006',title:'Project Initiation and Approval',approvedRevision:1,jiraKey:'TC-196'}]},
 {id:'old0',completedAt:'2026-10-31T12:00:00Z',requirements:[{id:'BR-007',title:'Auditable Digital Visitor Request',approvedRevision:1,jiraKey:'TC-99'}]}
];
test('every unique BR is an independent top-level section, not grouped under a cycle',()=>{
 const rows=group(cycles);
 assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.id),['BR-007','BR-006']);
 assert.equal(rows[0].snapshots.length,2);assert.equal(rows[1].snapshots.length,1);
 assert.equal(rows[0].title,'BR-007 · Auditable Digital Visitor Request, Approval, Check-In, and Check-Out Management');
 assert.equal(rows[1].title,'BR-006 · Project Initiation and Approval');
 assert.equal(rows[0].snapshots[0].br.jiraIssues[0].key,'TC-224');
 assert.equal(rows[0].snapshots[1].br.jiraKey,'TC-99');
});
test('BR titles are based on the approved requirement, not source filename or publication cycle',()=>{
 assert.equal(titleFor({id:'BR-007',title:'BR-007: Visitor Management'}),'BR-007 · Visitor Management');
 assert.equal(titleFor({id:'BR-007',approvedContent:{title:'Visitor Management'}}),'BR-007 · Visitor Management');
 assert.equal(titleFor({id:'BR-006',title:'BR-001 / BR-003: Shared Governance'}),'BR-006 · BR-001 / BR-003: Shared Governance');
});
test('repeated ID retains distinct historical snapshots and missing IDs never merge',()=>{
 const rows=group([{requirements:[{id:'BR-001',approvedRevision:3},{id:'',title:'Unidentified'}]},{requirements:[{id:'BR-001',approvedRevision:2},{id:'',title:'Other'}]}]);
 assert.equal(rows.length,3);assert.equal(rows[0].snapshots.length,2);assert.equal(rows[1].snapshots.length,1);assert.equal(rows[2].snapshots.length,1);
});
test('completed history renders BR sections with source, Jira, related documents and discovery inside the individual BR',()=>{
 assert.match(host,/media','completed-br-history\.js/);
 assert.match(host,/<script src="\$\{completedBrHistoryJs\}"><\/script><script src="\$\{baJiraEpicsJs\}"><\/script><script src="\$\{overviewSdlcJs\}"><\/script><script src="\$\{recoveryControllerJs\}"><\/script><script src="\$\{uxRecoveryJs\}"><\/script><script src="\$\{developerRecoveryJs\}"><\/script><script src="\$\{js\}"><\/script>/);
 assert.match(ui,/ATGVCompletedBRHistory\.group\(records\)/);
 assert.match(ui,/const details=document\.createElement\('details'\);details\.className='ba-completed-br-section'/);
 assert.match(ui,/heading\.append\(brElement\('strong','ba-completed-br-title',group\.title\)\)/);
 assert.doesNotMatch(ui,/heading\.textContent=\(cycle\.isCurrent\?'Current published cycle'/);
 for(const name of ['Source documents:','renderCompletedJiraTable','Related SDLC documents','Earlier published revisions','View approved requirement','View saved discovery answers'])assert.ok(ui.includes(name),name);
 assert.match(css,/\.ba-completed-br-heading/);
 assert.match(css,/\.ba-completed-br-body/);
});
