'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('SDLC Library update offers use the same ATGV branded modal as extension upgrades',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 const runtime=read('src/lib/runtime/extension-runtime.js');
 for(const id of ['libraryUpdateModal','libraryUpdateTitle','libraryUpdateDescription','libraryUpdateCurrent','libraryUpdateNext','libraryUpdateSource','libraryUpdateLater','libraryUpdatePull'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/id="libraryUpdateModal" class="modal-overlay hidden"/);
 assert.match(html,/atgv-upgrade-brand/);
 assert.match(html,/alt="ATGV AIATECH Assist logo"/);
 assert.match(runtime,/offerBrandedLibraryUpdate/);
 assert.match(runtime,/type:'libraryUpdateOffer'/);
 assert.match(runtime,/case 'libraryUpdateDecision':/);
 assert.match(runtime,/pendingLibraryUpdateOffers/);
 assert.ok(!runtime.includes('const answer=await vscode.window.showInformationMessage('));
 assert.match(js,/message\.type!=='libraryUpdateOffer'/);
 assert.match(js,/startLibraryUpdatePull/);
 assert.match(js,/type==='libraryUpdateProgress'/);
 assert.match(js,/event\.key==='Escape'/);
 assert.match(js,/libraryUpdatePriorFocus/);
});
test('update actions stay on one row with two independently saved GitHub source URLs',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),css=read('media/start.css');
 const section=html.slice(html.indexOf('id="settingsSoftwareUpdateGroup"'),html.indexOf('id="projectView"'));
 assert.match(section,/class="software-update-toolbar"/);
 for(const id of ['checkSoftwareUpdates','installExtensionRelease','viewExtensionRelease'])
  assert.ok(section.includes('id="'+id+'"'),id);
 for(const id of ['softwareReleaseRepositoryUrl','softwareLibraryRepositoryUrl','saveSoftwareUpdateSources'])
  assert.ok(section.includes('id="'+id+'"'),id);
 assert.ok(section.indexOf('id="softwareReleaseRepositoryUrl"')<section.indexOf('id="softwareLibraryRepositoryUrl"'));
 assert.match(ui,/softwareSourcesDirty/);
 assert.match(ui,/type==='softwareUpdateSourcesSaved'/);
 for(const id of ['softwareAutoExtension','softwareAutoLibrary','softwarePromptUpdates','softwareCheckOnStartup']){
  assert.ok(!section.includes('id="'+id+'"'),id);
  assert.ok(!ui.includes("$('"+id+"')"),id);
 }
 assert.match(css,/\.software-update-toolbar\{[^}]*flex-wrap:nowrap/);
});
test('all four update checks and consent prompts are mandatory with legacy settings',()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const pkg=require('../package.json');
 for(const key of ['autoCheckExtension','autoCheckLibrary','promptForUpdates','checkOnStartup']){
  assert.ok(runtime.includes(key+':true'),key);
  assert.equal(pkg.contributes.configuration.properties['atgvAssist.updates.'+key].default,true);
 }
 assert.doesNotMatch(runtime,/await cfg\(\)\.update\('updates\.'\+key,true/);
});
