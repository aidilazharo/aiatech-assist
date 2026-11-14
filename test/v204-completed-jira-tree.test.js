'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {jiraTree}=require('../media/completed-br-history');
const root=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const source=[
 {path:'BR-009',key:'TC-315',kind:'Epic',title:'Visit Management'},
 {path:'BR-009/F-1',key:'TC-316',kind:'Feature',title:'Visitor Registration'},
 {path:'BR-009/F-1/S-1',key:'TC-317',kind:'Story',title:'Capture visitor details'},
 {path:'BR-009/F-1/S-1/T-1',key:'TC-318',kind:'Task',title:'Build form'},
 {path:'BR-009/F-1/S-1/T-2',key:'TC-319',kind:'Task',title:'Validate details'},
 {path:'BR-009/F-2',key:'TC-323',kind:'Feature',title:'Appointments'}
];
test('ATGV published issue paths form a safe expandable Epic → Feature → Story → Task tree',()=>{
 const result=jiraTree({id:'BR-009',jiraIssues:source});
 assert.equal(result.count,6);
 assert.deepEqual(result.roots.map(x=>x.key),['TC-315']);
 assert.deepEqual(result.roots[0].children.map(x=>x.key),['TC-316','TC-323']);
 assert.equal(result.roots[0].children[0].children[0].children.length,2);
 assert.equal(result.roots[0].descendants,5);
 assert.match(result.roots[0].searchText,/Validate details/);
});
test('legacy orphan paths, duplicate keys and missing parents do not hide Jira issue links',()=>{
 const result=jiraTree({id:'BR-100',jiraIssues:[
  {path:'BR-100/F-1/S-1',key:'TC-400'},
  {path:'BR-100/F-1/S-1/T-1',key:'TC-401'},
  {path:'BR-100/F-2',key:'TC-400'},
  {key:'TC-402'}
 ]});
 assert.equal(result.count,3);assert.deepEqual(result.roots.map(x=>x.key),['TC-400','TC-402']);
 assert.deepEqual(result.roots[0].children.map(x=>x.key),['TC-401']);
 assert.deepEqual(jiraTree({id:'BR-007',jiraKey:'TC-225'}).roots.map(x=>x.key),['TC-225']);
 assert.equal(jiraTree({id:'BR-008'}).count,0);
});
test('render keeps the count next to source PDF, removes inline issue links and unwanted heading',()=>{
 assert.match(ui,/sourceBox\.append\(document\.createTextNode\(br\.sourceName/);assert.match(ui,/ba-completed-source-download/);
 assert.match(ui,/sourceBox\.append\(brElement\('span','ba-completed-source-count',` · \$\{tree\.count\} issue/);
 assert.match(ui,/renderCompletedJiraTable\(card,br,tree\)/);
 assert.match(ui,/pageSize:5/);
 assert.doesNotMatch(ui,/Published Jira Hierarchy|Expandable DataTable with Epic|jira\.append\(brElement\('b','','Published Jira: '\)/);
 assert.match(ui,/Approved R\$\{latest\?\.approvedRevision\|\|1\}/);
 assert.match(css,/\.ba-completed-source-count/);
});
