'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const {select}=require('../media/atgv-datatables');

test('Business Analyst My Work retains summary cards and Jira DataTable, without duplicate BR table',()=>{
 const view=host.slice(host.indexOf('<main id="workView"'),host.indexOf('<section id="pmDailyCockpit"'));
 for(const id of ['baMyWorkDashboard','baMyWorkMetrics','baMyWorkOpen','baJiraInventorySection']){
  assert.ok(view.includes('id="'+id+'"'),id+' must render in BA My Work');
 }
 assert.ok(view.indexOf('id="baMyWorkDashboard"')<view.indexOf('id="baJiraInventorySection"'));
 assert.doesNotMatch(view,/id="baMyWorkItems"|id="baMyWorkFilter"/);
 assert.match(ui,/function renderBAWorkDashboard\(\)/);
 assert.doesNotMatch(ui,/ATGVDataTables.mount\(items,filtered,/);
 assert.match(ui,/renderBAWorkDashboard\(\);/);
 assert.match(host,/id="baStartPanel"/,'Dedicated Business Requirements workflow is preserved');
});

test('Every DataTable uses five records per page with correct page boundaries',()=>{
 const rows=Array.from({length:12},(_,i)=>({key:'TC-'+(i+1)}));
 assert.deepEqual(select(rows,{page:1}).rows.map(x=>x.key),['TC-1','TC-2','TC-3','TC-4','TC-5']);
 assert.deepEqual(select(rows,{page:2}).rows.map(x=>x.key),['TC-6','TC-7','TC-8','TC-9','TC-10']);
 assert.deepEqual(select(rows,{page:3}).rows.map(x=>x.key),['TC-11','TC-12']);
 const last=select(rows,{page:999});assert.equal(last.page,3);assert.equal(last.pages,3);
 assert.match(ui,/const JIRA_INVENTORY_PAGE_SIZE=5;/);
 assert.doesNotMatch(ui,/pageSize:(10|20)/);
});

test('Technology Stack prerequisites are compact with expandable remote package list',()=>{
 assert.match(host,/id="architectPackageToggle"[^>]*aria-expanded="false"/);
 assert.match(ui,/item\.dataset\.kind=id\.startsWith\('package:'\)\?'package':'core'/);
 assert.match(css,/\.architect-requirement-list:not\(\.show-package-details\) \.architect-requirement-item\[data-kind="package"\]\{display:none\}/);
 assert.match(css,/\.architect-requirement-list\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(ui,/const packages=Array\.isArray\(stack\.dependencyPackages\)/);
});

test('release version follows v0.1.99 rollover convention',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'0.3.51');
 assert.equal(pkg.atgvDisplayVersion,'0.3.51');
});
