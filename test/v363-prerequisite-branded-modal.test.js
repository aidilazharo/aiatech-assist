'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('host prerequisite confirmation uses AIA branded modal and maintains allowlisted command gate',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.match(host,/async function offerBrandedPrerequisiteInstall\(plan\)/);
 assert.match(host,/type:'startupPrerequisiteOffer',requestId/);
 assert.match(host,/case 'startupPrerequisiteDecision':\{/);
 assert.match(host,/entry\.toolId===msg\.id/);
 assert.match(host,/const plan=startupInstall\.plan\(id\)/);
 assert.match(host,/const proceed=await offerBrandedPrerequisiteInstall\(plan\)/);
 assert.match(host,/if\(proceed!=='Install'\)/);
 assert.match(host,/const result=await startupInstall\.install\(id/);
 assert.doesNotMatch(host,/const proceed=await vscode\.window\.showWarningMessage\(/);
 assert.match(host,/pendingPrerequisiteInstallOffers\.set/);
 assert.match(host,/for\(const \[key,item\] of pendingPrerequisiteInstallOffers\)/);
});

test('prerequisite dialog uses the same logo and upgrade modal style',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),css=read('media/start.css');
 const area=html.slice(html.indexOf('id="startupPrerequisiteModal"'),html.indexOf('id="libraryUpdateModal"'));
 assert.ok(area.length>500);
 for(const id of ['startupPrerequisiteTitle','startupPrerequisiteDescription','startupPrerequisiteCommand','startupPrerequisiteAssurance','startupPrerequisiteCancel','startupPrerequisiteInstall'])
  assert.ok(area.includes('id="'+id+'"'),id);
 assert.match(area,/class="modal-card atgv-upgrade-modal atgv-prerequisite-modal"/);
 assert.match(area,/role="dialog" aria-modal="true"/);
 assert.match(area,/src="\$\{brand\}" alt="ATGV AIATECH Assist logo"/);
 assert.match(area,/This action may download software/);
 assert.match(css,/\.atgv-prerequisite-command/);
 assert.match(css,/\.atgv-prerequisite-modal/);
});

test('Install and Cancel are explicit, focus-managed and keyboard accessible',()=>{
 const ui=read('media/start.js');
 assert.match(ui,/request\.type!=='startupPrerequisiteOffer'/);
 assert.match(ui,/send\('startupPrerequisiteDecision'/);
 assert.match(ui,/startupPrerequisiteCancel'\)\.addEventListener\('click'/);
 assert.match(ui,/startupPrerequisiteInstall'\)\.addEventListener\('click'/);
 assert.match(ui,/event\.key==='Escape'/);
 assert.match(ui,/event\.key==='Tab'/);
 assert.match(ui,/prerequisitePriorFocus/);
 assert.match(ui,/\.textContent=String\(request\.command/);
 assert.match(ui,/request\.automatic\?'Install':'Open Guide'/);
 assert.doesNotMatch(ui,/eval\(|innerHTML=String\(request\.command/);
});
