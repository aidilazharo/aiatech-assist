'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const logic=require('../media/ba-jira-epics.js');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const items=[
 {key:'TC-400',type:'Epic',summary:'BR-007: Manage person names through a simple web interface',status:'To Do'},
 {key:'TC-401',type:'Feature',summary:'Frontend',parentKey:'TC-400'},
 {key:'TC-402',type:'Story',summary:'Add a person',parentKey:'TC-401'},
 {key:'TC-403',type:'Subtask',summary:'Keyboard interaction',sourceStoryKey:'TC-402'},
 {key:'TC-404',type:'Subtask',summary:'Not linked'},
 {key:'ABC-50',type:'Epic',summary:'Different project'},
 {key:'TC-420',type:'Epic',summary:'BR-008 - Another workflow'}
];
test('real Jira Epics remain discoverable when the local approved BR register has no records',()=>{
 const rows=logic.unlinkedEpics(items,[], 'TC');
 assert.deepEqual(rows.map(row=>row.key),['TC-400','TC-420']);
 assert.equal(rows[0].brId,'BR-007');
 assert.equal(rows[0].linkedIssueCount,3);
 assert.equal(rows[0].status,'To Do');
 assert.equal(rows[1].brId,'BR-008');
});
test('existing approved mapped Jira Epics are excluded from the read-only fallback',()=>{
 assert.deepEqual(logic.unlinkedEpics(items,['TC-400','TC-401'],'TC').map(row=>row.key),['TC-420']);
});
test('Jira discovery never crosses selected project or accepts malformed key',()=>{
 assert.equal(logic.unlinkedEpics(items,[],'').length,0);
 assert.equal(logic.unlinkedEpics(items,[],'TC; DROP').length,0);
 assert.deepEqual(logic.unlinkedEpics(items,[],'ABC').map(row=>row.key),['ABC-50']);
 assert.deepEqual(logic.unlinkedEpics([{key:'TC-500',type:'Story',summary:'BR-009'}],[], 'TC'),[]);
});
test('unrelated Jira items, duplicate keys, cycles and missing parent links do not inflate issue counts',()=>{
 const rows=logic.unlinkedEpics([...items,{key:'TC-400',type:'Epic',summary:'Duplicate'},{key:'TC-420',parentKey:'TC-420',sourceStoryKey:'TC-400',type:'Epic'}],[], 'TC');
 assert.equal(rows[0].linkedIssueCount,3);
 assert.equal(rows[1].linkedIssueCount,0);
});
test('no unverified BR identifier is manufactured from an arbitrary Epic title',()=>{
 assert.equal(logic.brFromSummary('Person Names app'), '');
 assert.equal(logic.brFromSummary('BR-007: Manage Person Names'), 'BR-007');
 assert.equal(logic.brFromSummary('BR-007Delete'), '');
});
test('the BA register stays present even without a local completed-cycle snapshot',()=>{
 assert.match(html,/id="baStartPanel"/);
 assert.match(html,/id="baJiraBackedEpics"/);
 assert.match(html,/src="\$\{baJiraEpicsJs\}"/);
 assert.match(ui,/\$\('baStartPanel'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.match(ui,/\$\('baCompletedSection'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.doesNotMatch(ui,/\$\('baStartPanel'\)\.classList\.toggle\('hidden',displayed!=='start'\|\|!completedBARecords\(\)\.length\)/);
 assert.match(ui,/const inScope=!!activeId&&jiraInventoryProject===activeId&&jiraInventoryKey===projectKey/);
 assert.match(ui,/renderBAJiraBackedEpics\(\);brPicker\.replaceChildren\(\)/);
 assert.match(css,/\.ba-jira-only-br-section/);
 assert.match(ui,/className='ba-completed-br-section ba-jira-only-br-section'/);
});
test('Jira Epic recovery is read-only: no Jira write or local approval mutation in its renderer',()=>{
 const slice=ui.split('function renderBAJiraBackedEpics(){')[1].split('function renderBACompletedRecords(){')[0];
 assert.ok(slice.includes('openJiraIssueModal(item.key)'));
 assert.doesNotMatch(slice,/send\(|\.synced\s*=|\.status\s*=|saveBR|send\('brPublish/);
});
