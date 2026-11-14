'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const recovery=ui.split('function renderBAJiraBackedEpics(){')[1].split('function renderBACompletedRecords(){')[0];

test('BA Start preserves the existing BR and Jira Epic card containers without the removed heading',()=>{
 const section=page.slice(page.indexOf('<section id="baStartPanel"'),page.indexOf('<section class="source-documents-panel"'));
 assert.match(section,/id="baCompletedList"/);
 assert.match(section,/id="baJiraBackedEpics"/);
 assert.doesNotMatch(section,/<h2[^>]*>Existing Business Requirements<\/h2>/);
});
test('Jira-backed Epic renderer shows only cards and actions, not reconciliation explanation or empty-register guidance',()=>{
 assert.doesNotMatch(recovery,/Jira Epics requiring BR reconciliation|These Epics exist in Jira|No approved BR is stored/);
 assert.match(recovery,/if\(!rows\.length\)return;/);
 assert.match(recovery,/root\.append\(card\)/);
 assert.match(recovery,/openJiraIssueModal\(item\.key\)/);
 assert.match(recovery,/Unlinked to local BR/);
});
test('empty completed BR register is not filled with an unwanted message',()=>{
 assert.doesNotMatch(ui,/No locally recorded approved Business Requirements in the selected project/);
 assert.match(ui,/const records=completedBARecords\(\);root\.replaceChildren\(\);\s*const grouped=ATGVCompletedBRHistory\.group\(records\);/);
});
