'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
test('Business Analyst My Work shows only summary cards above the all-project Jira DataTable',()=>{
 for(const id of ['baMyWorkDashboard','baMyWorkMetrics','baMyWorkOpen','baJiraInventorySection','baJiraInventoryTable']){
  assert.match(host,new RegExp('id="'+id+'"'));
 }
 const overview=host.slice(host.indexOf('id="baMyWorkDashboard"'),host.indexOf('id="baJiraInventorySection"'));
 assert.doesNotMatch(overview,/Published Jira|published Jira work|baMyWorkFilter|baMyWorkItems/);
 const method=ui.slice(ui.indexOf('function renderBAWorkDashboard(){'),ui.indexOf('function applyFocusedRoleLayout('));
 assert.doesNotMatch(method,/Published Jira|Published Jira issues|ATGVDataTables\.mount/);
 assert.match(ui,/function renderBAJiraInventory\(\)/);
 assert.match(ui,/prioritizeJiraCreators/);
});
test('Business Requirements editing and approved revision records are preserved outside My Work',()=>{
 assert.match(host,/id="baStartPanel"/);
 assert.match(ui,/function renderBRs\(\)/);
 assert.match(ui,/previewApprovedBR/);
});
