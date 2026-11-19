'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const progress=require('../media/ba-progress');

test('an uploaded source remains at Upload until mapping is submitted, then step 2 becomes active',()=>{
 const initial=progress.derive({hasSources:false,mappingDone:false});
 assert.equal(initial.find(x=>x.current).key,'start');
 assert.equal(progress.derive({started:true,hasSources:false}).find(x=>x.current).key,'upload');
 const mapping=progress.derive({hasSources:true,mappingDone:false});
 assert.equal(mapping.find(x=>x.current).key,'mapping');
 assert.match(ui,/const mappingSubmitted=mappingDone\|\|discoveryImportBusy/);
 assert.match(ui,/hasSources:hasSources&&mappingSubmitted,mappingDone/);
 assert.match(ui,/const showSources=displayed==='upload'/);
 assert.match(ui,/\.source-documents-panel'\)\.classList\.toggle\('hidden',!showSources\)/);
});

test('complete saved discovery is green Ready; unlinked answers remain retryable',()=>{
 assert.match(ui,/discoveryQuestionsBadge'\)\.textContent=savedDiscovery&&filled===total\?'Ready'/);
 assert.match(ui,/discoveryQuestionsBadge'\)\.classList\.toggle\('ba-ready',savedDiscovery&&filled===total/);
 assert.match(ui,/discoveryAction.disabled=discoveryAdvanceReady\?!!baBusyTask:/);
 assert.match(ui,/brState\?\.discoveryRevision===discoveryData\?\.revision/);
 assert.match(css,/#discoveryQuestionsBadge\.ba-ready\{color:#b9f3d7/);
 assert.match(css,/#discoverySave:disabled/);
});

test('revision, comparison and retirement buttons appear in the same row as Preview',()=>{
 assert.match(ui,/const placeWithPreview=button=>/);
 for(const label of ['Create New Revision','Compare revisions','Retire'])assert.ok(ui.includes(label));
 assert.match(ui,/placeWithPreview\(revise\)/);
 assert.match(ui,/placeWithPreview\(compare\)/);
 assert.match(ui,/placeWithPreview\(retire\)/);
 assert.match(ui,/actionBar\.append\(preview\)/);
 assert.match(ui,/const actionBar=brElement\('div','br-card-action-row'\)/);
 assert.match(css,/\.br-card-action-row\{display:flex;flex-direction:row/);
});

test('Jira has one progress meter and does not duplicate the active status beneath the title',()=>{
 assert.equal((host.match(/id="baRunning"/g)||[]).length,1);
 assert.match(host,/id="jiraStageProgress"[^>]+role="progressbar"/); // Step 10 confirmed operations only
 assert.match(ui,/const id=task==='generate'\?'brGenerationProgress':null/);
});

const functionSrc=host.slice(host.indexOf('async function installationStartup(){'),host.indexOf('\nfunction activate(ctx){'));
function createInstallScenario({dirty=false}={}){
 const globals=new Map(),workspaces=new Map(),commands=[],notices=[];
 const fake={
   workspace:{textDocuments:[{isDirty:dirty}]},window:{tabGroups:{all:[{tabs:dirty?[{isDirty:true}]:[]}] }},
   commands:{executeCommand:async(name,...args)=>{commands.push([name,...args]);}}
 };
 const context={extensionUri:{fsPath:'/tmp/test-extension'},globalState:{get:(k,f)=>globals.has(k)?globals.get(k):f,update:async(k,v)=>{if(v===undefined)globals.delete(k);else globals.set(k,v);}},workspaceState:{get:(k,f)=>workspaces.has(k)?workspaces.get(k):f,update:async(k,v)=>{if(v===undefined)workspaces.delete(k);else workspaces.set(k,v);}}};
 const startup=new Function('ready','vscode','context','installationSignature','lifecycleAction','uiInformation','require',functionSrc+'\nreturn installationStartup;')(
 Promise.resolve(),fake,context,async()=> '0.1.41|new-install',require('../src/bootstrap').lifecycleAction,async m=>notices.push(m),()=>({version:'0.1.82'}));
 return {startup,globals,workspaces,commands,notices,fake};
}

test('new version automatically reloads, safely closes editor tabs and runs ATGV Start once',async()=>{
 const s=createInstallScenario();
 await s.startup();
 assert.deepEqual(s.commands.map(x=>x[0]),['workbench.action.reloadWindow']);
 assert.equal(s.globals.get('atgvAssist.pendingStartAfterReload'),true);
 await s.startup();
 assert.deepEqual(s.commands.map(x=>x[0]),['workbench.action.reloadWindow','workbench.action.closeAllEditors','atgvAssist.start']);
 assert.deepEqual(s.commands.at(-1),['atgvAssist.start',{skipReload:true}]);
 assert.equal(s.globals.has('atgvAssist.pendingStartAfterReload'),false);
 await s.startup();
 assert.equal(s.commands.length,3,'no repeated reload on next activation');
});

test('automatic install flow never closes dirty/unsaved editor tabs',async()=>{
 const s=createInstallScenario({dirty:true});
 await s.startup();
 assert.deepEqual(s.commands,[]);
 assert.match(s.notices.join(' '),/Save or close unsaved editors/);
 assert.equal(s.globals.has('atgvAssist.pendingStartAfterReload'),false);
});
