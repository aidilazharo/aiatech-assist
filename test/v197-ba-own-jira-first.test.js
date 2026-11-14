'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

// Execute the same browser helper in isolation to verify default sorting semantics.
const match=ui.match(/function prioritizeJiraCreators\(items,accountId\)\{[\s\S]*?\n\}/);
assert.ok(match,'BA Jira creator-priority function must exist');
const prioritize=vm.runInNewContext('('+match[0]+')');
const keys=rows=>Array.from(rows, r=>r.key);
const newestFirst=[
 {key:'TC-12',creatorId:'other-a'},
 {key:'TC-11',creatorId:'viewer'},
 {key:'TC-10',creatorId:'other-b'},
 {key:'TC-9',creatorId:'viewer'},
];
test('BA Jira defaults to own-created issues first, retaining new-to-old within groups',()=>{
 assert.deepEqual(keys(prioritize(newestFirst,'viewer')),['TC-11','TC-9','TC-12','TC-10']);
 assert.deepEqual(keys(newestFirst),['TC-12','TC-11','TC-10','TC-9'],'original Jira batches must be unchanged');
});
test('same display names cannot cause false ownership; absent viewer preserves Jira order',()=>{
 const twins=[{key:'TC-3',creatorId:'other',creator:'Same Name'}, {key:'TC-2',creatorId:'viewer',creator:'Same Name'}];
 assert.deepEqual(keys(prioritize(twins,'viewer')),['TC-2','TC-3']);
 assert.deepEqual(keys(prioritize(newestFirst,'')),keys(newestFirst));
});
test('viewer identity comes from the authenticated Jira account and does not block inventory when unavailable',()=>{
 assert.match(host,/rest\/api\/3\/myself/);
 assert.match(host,/type:'jiraInventoryViewer',projectId,requestId,accountId/);
 assert.match(host,/\.catch\(\(\)=>null\)/);
 assert.match(ui,/if\(msg\.type==='jiraInventoryViewer'\)/);
 assert.match(ui,/jiraInventoryViewerId=String\(msg\.accountId\|\|''\)/);
 assert.match(ui,/prioritizeJiraCreators\(scoped\.filter\(/);
 assert.match(ui,/pageSize:5,sortKey:'',onRowClick/);
 assert.match(ui,/jiraInventoryTruncated=false;jiraInventoryViewerId='';/);
});
test('Business Analyst My Work keeps BR metrics and the project-wide Jira DataTable only',()=>{
 assert.match(host,/id="baMyWorkDashboard"/);
 assert.match(host,/id="baMyWorkMetrics"/);
 assert.match(host,/id="baMyWorkOpen"/);
 assert.doesNotMatch(host,/id="baMyWorkItems"|id="baMyWorkFilter"/);
 assert.match(ui,/function renderBAWorkDashboard\(\)/);
 assert.doesNotMatch(ui,/ATGVDataTables.mount\(items,filtered,/);
 assert.match(host,/id="baJiraInventoryTable"/);
 assert.match(ui,/prioritizeJiraCreators\(scoped\.filter\(/);
});
