'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
test('every accepted sidebar or role menu navigation requests fresh page state without reloading webview',()=>{
 assert.match(ui,/function navigate\(destination\)/);
 assert.match(ui,/function requestNavigationRefresh\(destination\)/);
 assert.match(ui,/requestNavigationRefresh\(destination\);\s*const isRole=/);
 assert.match(ui,/for\(const nav of document\.querySelectorAll\('\.sidebar \[data-nav\]'\)\)/);
 assert.match(ui,/send\('viewNavigateRefresh'/);
 assert.match(ui,/queueMicrotask\(/);
 assert.doesNotMatch(ui,/function requestNavigationRefresh\([\s\S]{0,550}location\.reload\(/);
});
test('host refreshes dashboard and remote sources without blocking or stopping ongoing processes',()=>{
 assert.match(host,/case 'viewNavigateRefresh':\{/);
 const start=host.indexOf("case 'viewNavigateRefresh':");
 const end=host.indexOf("case 'refresh':",start);
 const code=host.slice(start,end);
 assert.match(code,/await refreshDashboard\(\)/);
 assert.match(code,/void refreshLiveRemoteData\(\{reason:'menu-navigation',force:false\}\)/);
 assert.match(code,/activeDiscoveryMappingRun\?\.projectId===navigationProject/);
 assert.match(code,/type:'navigationRefreshState'/);
 assert.doesNotMatch(code,/\.abort\(\)|stop[A-Za-z]+\(|new AbortController/);
 assert.doesNotMatch(code,/dashboard\.webview\.html\s*=/);
});
test('active BA mapping keeps its step and progress when navigating away or returning',()=>{
 const a=ui.indexOf('function setView(next)'),z=ui.indexOf('function cell(',a);
 const code=ui.slice(a,z);
 assert.match(code,/const baProcessRunning=discoveryImportBusy/);
 assert.match(code,/if\(!baProcessRunning\)\{baResumeCardReady=/);
 assert.match(code,/baResumeCardReady&&!baProcessRunning/);
 assert.match(ui,/m\.type==='navigationRefreshState'/);
 assert.match(ui,/m\.mapping\?\.running/);
 assert.match(ui,/setDiscoveryImportBusy\(true/);
});
test('project switch is rejected during in-progress AI mapping to preserve authenticated checkpoints',()=>{
 const back=host.slice(host.indexOf("case 'openingBack':"),host.indexOf("case 'openingAuto':"));
 const open=host.slice(host.indexOf("case 'openingAuto':"),host.indexOf("case 'openingOffline':"));
 assert.match(back,/if\(activeDiscoveryMappingRun\?\.projectId===activeProject\?\.id\)/);
 assert.match(open,/if\(activeDiscoveryMappingRun\?\.projectId===activeProject\?\.id\)/);
 assert.ok(back.indexOf('activeDiscoveryMappingRun')<back.indexOf('openingFlow.reset()'));
});
test('closing Jira inventory modal does not cancel running scan',()=>{
 const first=ui.indexOf('function closeJiraInventory()'),end=ui.indexOf("$('overviewJiraInventory').addEventListener",first);
 const code=ui.slice(first,end);
 assert.doesNotMatch(code,/cancelProjectJiraInventory|jiraInventoryRequest\+\+/);
});
