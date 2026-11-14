'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const server=require('../src/developer-br-server');
const screen=host.slice(host.indexOf('<section id="developerTaskDashboard"'),host.indexOf('<div id="developerManualTickets"'));
test('Developer title is hidden only for Developer role and toolbar tabs are compact icon-only with tooltip names',()=>{
 assert.match(css,/#workView\.role-software-developer > \.page-kicker/);
 assert.match(css,/#workView\.role-software-developer > \.work-head/);
 assert.doesNotMatch(screen,/data-developer-br-tab="artifacts"/);
 assert.doesNotMatch(screen,/Implementation Artifacts/);
 for(const name of ['Frontend','API / Backend','Database','Integration','Unit Test','Test Results','Server Logs','Generated Files','Activity Log']){
  const label=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(screen,new RegExp('title="'+label+'" aria-label="'+label+'"'));
 }
 assert.match(screen,/id="developerBrStart"[^>]*>▶ Start Development/);
 assert.doesNotMatch(screen,/Generate, Test &amp; Run/);
});
test('Jira delivery review is not a visible accordion and requires explicit review modal confirmation',()=>{
 assert.match(screen,/<dialog id="developerDeliveryEvidence"/);
 assert.doesNotMatch(screen,/Delivery evidence &amp; Jira acceptance/);
 assert.match(screen,/id="developerDeliveryConfirmReview"/);
 assert.match(ui,/\$\('developerDeliveryEvidence'\).*?showModal\(\)/);
 assert.match(ui,/if\(!\$\('developerDeliveryAcceptance'\)\.checked\)/);
 assert.match(ui,/accepted:true/);
});
test('Start Development changes to Stop while processing, then Restart Development once complete',()=>{
 assert.match(ui,/processing\?'■ Stop Development'/);
 assert.match(ui,/developerBrCanRetry\|\|developerBrDone\?'↻ Restart Development'/);
 assert.match(ui,/function stopDeveloperBr\(\)/);
 assert.match(ui,/if\(developerBrBusy\)\{stopDeveloperBr\(\);return;\}/);
 assert.match(ui,/send\('developerBrRun',\{brId:developerBrSelected\}\)/);
 assert.match(ui,/send\('developerBrStartServer',\{brId:developerBrSelected\}\)/);
});
test('premature normal API exit triggers a bounded runtime repair, never a false healthy status',()=>{
 const fake={logs:'[stdout] [1] node server/index.mjs exited with code 0 [stdout] --> Sending SIGTERM to other processes.. [stdout] [0] vite exited with code 143',exitCode:143};
 assert.match(server.serverExitExplanation(fake),/API entry process exited normally/);
 assert.equal(server.isRepairableRuntimeFailure(Error('Generated application exited before becoming healthy. Exit code 143')),true);
 assert.equal(server.isRepairableRuntimeFailure(Error('Port 5173 already occupied')),false);
 assert.equal(server.isRepairableRuntimeFailure(Error('Stopped by user')),false);
 assert.match(host,/The generated application exited or failed HTTP health checks\. Attempting one AI repair/);
 assert.match(host,/repairLog:'REAL SERVER STARTUP FAILURE/);
 assert.match(host,/const checkedRuntime=await developerBR\.runChecks/);
 assert.match(host,/if\(!checkedRuntime\.passed\)throw Error/);
 assert.match(host,/await launchGeneratedBrServer\(run,project,progress,check\);/);
});
