'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const js=read('media/start.js'),css=read('media/start.css'),host=read('test/generated/extension-source.txt');
const severitySource=js.slice(js.indexOf('function atgvSeverity('),js.indexOf('const ATGV_STATUS_BADGES='));
const atgvSeverity=vm.runInNewContext(severitySource+'\natgvSeverity');
test('UI status scale is deterministic for success, warning, error, running and pending',()=>{
 for(const [input,expect] of [['Approved','success'],['All answers saved','success'],['On track','success'],['Jira conflict','failure'],['Unauthorized edit','failure'],['Action required','warning'],['Blocked','warning'],['Stale draft','warning'],['In Progress','running'],['Processing document','running'],['Awaiting prerequisites','pending']]){
  assert.equal(atgvSeverity(input),expect,input);
 }
});
test('all eight navigation entries get an accessible decorative flat icon',()=>{
 for(const id of ['overview','sdlc-roles','flow','documents','planning','knowledge','operations','settings'])assert.match(js,new RegExp("(?:'"+id+"'|"+id+"):"));
 assert.match(js,/function atgvSyncNavigationIcons\(root=document\)/);
 assert.match(js,/slot\.setAttribute\('aria-hidden','true'\)/);
 assert.match(css,/\.nav-item \.nav-icon svg/);
});
test('single icon decorator never adds SVG to controls already containing graphics',()=>{
 assert.equal((js.match(/function decorateBAActionButtons\(/g)||[]).length,1);
 assert.match(js,/if\(button\.querySelector\('svg,\.atgv-flat-icon,\.ba-flat-icon'\)/);
 assert.match(js,/svg\.setAttribute\('aria-hidden','true'\)/);
 assert.match(css,/\.atgv-secondary-actions>\.atgv-more-actions-trigger::before\{content:none!important/);
 assert.match(css,/\.atgv-flat-icon\{margin-right:0/);
});
test('handoff secondary action consolidation keeps existing handlers intact',()=>{
 assert.match(js,/function atgvConsolidateHandoffActions\(root=document\)/);
 assert.match(js,/\.handoff-row:not\(\[data-atgv-actions-grouped\]\)/);
 assert.match(js,/menu\.append\(atgvMoreActionsSummary\('work ownership'\),\.\.\.secondary\)/);
 assert.match(js,/card\.dataset\.atgvActionsGrouped='true'/);
 assert.match(js,/function atgvCloseSecondaryMenus\(event\)/);
 assert.match(js,/document\.addEventListener\('keydown',atgvCloseSecondaryMenus\)/);
});
test('review complete hides obsolete controls but preserves current read-only evidence',()=>{
 assert.match(js,/const reviewComplete=baReviewFinalized\(\)/);
 assert.match(js,/const hide=reviewComplete&&!running/);
 assert.match(js,/function renderSavedReviewEvidence\(review,current\)/);
 assert.match(host,/id="baReviewEvidence"/);
 assert.match(js,/staleDrafts\.length>0\|\|generatingDone/);
});
test('source errors use an inline error role with recovery and page-local placement',()=>{
 assert.match(js,/const anchors=\{planningView:'#designStatus'/);
 assert.match(js,/region\.setAttribute\('role',error\?'alert':'status'\)/);
 assert.match(js,/region\.setAttribute\('aria-live',error\?'assertive':'polite'\)/);
 assert.match(js,/notice\.classList\.toggle\('hidden',!notice\.textContent\)/);
 assert.match(css,/\.atgv-page-feedback\[data-status="error"\]/);
});
test('design revisions expose direct delete action and retain the approved workflow',()=>{
 assert.match(js,/tools\.append\(remove\)/);assert.doesNotMatch(js,/menu\.append\(atgvMoreActionsSummary\(label\+' revision '\+item\.number\),remove\)/);
 assert.match(js,/openDesignPreview\(kind,item\.id\)/);
 assert.match(js,/deleteDesign\(kind,item\)/);
 assert.match(host,/id="designApprove" disabled/);
});
test('v0.1.37 metadata and 9-step workflow remain consistent',()=>{
 const pkg=require('../package.json');assert.equal(pkg.version,'0.3.55');assert.equal(pkg.atgvDisplayVersion,'0.3.55');
 assert.equal((host.match(/class="workflow-step atgv-milestone"/g)||[]).length,10);
 assert.match(host,/atgvDisplayVersion :'0\.3\.55'/);
});
