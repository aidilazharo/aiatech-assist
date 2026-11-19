'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');

test('startup restores saved nonsecret fields and begins prerequisite scan before full dashboard hydration',()=>{
 const handshake=host.indexOf("case 'webviewReady':");
 const quick=host.indexOf("type:'startupQuickStart'",handshake);
 const dashboard=host.indexOf("await finishManualProjectDiscovery(startupSequence)",handshake);
 assert.ok(quick>handshake&&dashboard>quick,'the fast status arrives ahead of full state');
 assert.match(ui,/if\(message\.type==='startupQuickStart'\)/);
 assert.match(ui,/startupPrereqRequested=true;[\s\S]*?renderStartupScanPlaceholders\(\);[\s\S]*?send\('startupReadiness'\);/);
 assert.match(ui,/\$\('startupPrerequisiteDetails'\)\.open=true;/);
 assert.match(host,/saved:startupSavedConnectionFields\(\),defaults:startupSetup\.DEFAULTS/);
});
test('initial connection verification is cached only for UI, not authorization',()=>{
 assert.match(host,/startupUiVerificationCache/);
 assert.match(host,/Date\.now\(\)-startupUiVerificationCache\.at<30000/);
 assert.match(host,/case 'startupProceed':[\s\S]{0,200}const verified=await storedStartupVerification\(\);/);
});
test('hidden optional SDK and permissions remain in DOM for diagnostics but do not occupy startup screen',()=>{
 assert.match(html,/id="startupPermissionChecks"[^>]*class="[^"]*hidden"/);
 assert.doesNotMatch(html,/>Checking permissions…<\/p>/);
 assert.match(html,/id="startupCopilotCard"[^>]*class="[^"]*hidden"/);
 assert.match(css,/#startupPermissionChecks,#startupCopilotCard \{display:none!important;\}/);
 assert.doesNotMatch(ui,/const copilotIssue=startupScanComplete/);
 assert.match(css,/#startupPrerequisiteDetails>\.atgv-tool-scan-status:hover[\s\S]*?background:transparent!important/);
});
test('project launch disables and darkens its button while showing opening progress',()=>{
 assert.match(ui,/gateOpeningTargetId=String\(selection\.projectId\|\|''\)/);
 assert.match(ui,/\$\('gateFinder'\)\.classList\.toggle\('is-opening',gateBusy\)/);
 assert.match(ui,/action\.disabled=gateBusy;action\.setAttribute\('aria-disabled',String\(gateBusy\)\)/);
 assert.match(ui,/gateOpeningPercent\(5,'Selecting project…'\)/);
 assert.match(css,/#gateFinder\.is-opening \.gate-result button:disabled \{background:#383b42!important/);
 assert.match(ui,/gateOpeningTargetId='';gateError=m\.message/);
});
test('startup footers have no duplicate upper dividers or filler text',()=>{
 assert.match(css,/#startupSetup \.atgv-startup-footer,#gateFinder \.gate-search-footer \{border-top:0!important/);
 assert.match(html,/<p id="gateAutoMessage" role="status" class="muted"><\/p>/);
});
test('project opening checks independent endpoints concurrently and avoids duplicate full dashboard state',()=>{
 const start=host.indexOf('async function testOpeningProject(');
 const end=host.indexOf('async function initializeOpeningProject(',start);
 const block=host.slice(start,end);
 assert.match(block,/const accountTask=testJiraConnection\(config,token\)/);
 assert.match(block,/const spaceTask=getConfluenceSpace\(config,token\)/);
 assert.match(block,/Promise\.all\(\[accountTask,spaceTask,jiraProjectTask,githubTask\]\)/);
 const caseStart=host.indexOf("case 'openingAuto':");
 const caseEnd=host.indexOf("case 'openingOffline':",caseStart);
 const opening=host.slice(caseStart,caseEnd);
 assert.match(opening,/await guardedOpeningStep\(\(\)=>launchProject\(msg\)\)/);
 assert.doesNotMatch(opening,/await guardedOpeningStep\(\(\)=>launchProject\(msg\)\);\s*await refreshDashboard/);
});
test('Discovery answers remain a single numbered set of exactly 12 questions',()=>{
 const begin=ui.indexOf('const BA_QUESTIONS=[');
 const end=ui.indexOf('];',begin);
 const definitions=ui.slice(begin,end);
 const keys=[...definitions.matchAll(/\['([a-zA-Z]+)','/g)].map(match=>match[1]);
 assert.deepEqual(keys,['problem','stakeholders','currentProcess','targetProcess','scope','businessRules','acceptance','data','dependencies','constraints','measures','questions']);
 assert.match(ui,/const groups=\[\['Business context',0,4\],\['Requirements and rules',4,8\],\['Delivery and open questions',8,12\]\]/);
 assert.match(ui,/root\.replaceChildren\(\);[\s\S]*?const groups=/);
 assert.match(ui,/questionLabel\.textContent=\(idx\+1\)\+'\. '\+label/);
});
