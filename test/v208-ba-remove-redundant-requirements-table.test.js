'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
test('Business Analyst My Work has no redundant Requirements table or Show filter',()=>{
 const start=host.indexOf('<div id="baMyWorkDashboard"');
 const end=host.indexOf('<section id="discoveryView"',start);
 const content=host.slice(start,end);
 assert.match(content,/id="baMyWorkOpen"/);
 assert.match(content,/id="baMyWorkMetrics"/);
 assert.doesNotMatch(content,/baMyWorkItems|baMyWorkFilter|Show <select|Requirements<\/strong>/);
 assert.doesNotMatch(ui,/baMyWorkItems|baMyWorkFilter/);
});
test('Project Jira table and standalone Business Requirements workflow remain available',()=>{
 assert.match(host,/id="baJiraInventoryTable"/);
 assert.match(host,/id="baJiraInventoryRefresh"/);
 assert.match(host,/id="baStartPanel"/);
 assert.match(ui,/navigate\('discovery'\)/);
 assert.match(ui,/baJiraTableInstance=ATGVDataTables\.mount/);
 assert.match(ui,/pageSize:5,sortKey:''/);
});
