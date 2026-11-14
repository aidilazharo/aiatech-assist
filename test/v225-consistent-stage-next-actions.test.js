
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const progress=require('../media/ba-progress');
const {getNextStep}=require('../media/jira-workflow-tables');

test('all ten ordered steps exist and only the final Publish step has no successor',()=>{
 const steps=progress.definitions;
 assert.equal(steps.length,10);
 assert.equal(new Set(steps.map(([key])=>key)).size,10);
 assert.equal(steps[0][0],'start');assert.equal(steps.at(-1)[0],'publish');
 for(let i=0;i<steps.length-1;i++) assert.equal(steps[i+1][0],progress.definitions[i+1][0]);
 assert.match(ui,/nextButton.textContent=nextDefinition\?'Next Step · '\+nextDefinition.label:'Workflow Complete'/);
});
test('a single standalone navigation panel replaces reparented Next Step controls',()=>{
 assert.equal((host.match(/id="baStepNavigation"/g)||[]).length,1);
 assert.equal((host.match(/id="baNextStepRow"/g)||[]).length,1);
 assert.equal((host.match(/id="baPreviousStep"/g)||[]).length,1);
 assert.equal((host.match(/id="baNextStep"/g)||[]).length,1);
 assert.match(ui,/navigation.classList.toggle\('hidden',displayed==='start'\)/);
 assert.match(ui,/previousButton.disabled=!previousDefinition\?.selectable\|\|navigatingBusy/);
 assert.match(ui,/nextButton.disabled=!ready/);
 assert.match(ui,/nextButton.classList.toggle\('ba-step-next-complete',ready\)/);
 assert.match(ui,/nextButton.dataset.nextStep=next\?.key\|\|''/);
 assert.match(ui,/ATGVJiraWorkflowTables.getNextStep\(progress,displayed,navigatingBusy\)/);
 assert.doesNotMatch(ui,/target.append\(nextRow\)/);
});
test('Steps 2–5 preserve process controls but hide duplicate Next navigation after completion',()=>{
 for(const id of ['sourceProcessSubmit','discoverySave','discoveryCopilot','brNextPreviewSave']) assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(ui,/button.classList.toggle\('hidden',complete\)/);
 assert.match(ui,/discoveryAction.classList.toggle\('hidden',discoveryAdvanceReady\)/);
 assert.match(ui,/const hide=reviewComplete&&!running/);
 assert.match(ui,/nextPreview.classList.add\('hidden'\)/);
 assert.match(ui,/if\(!openBAWorkflowStep\('save'\)\)return/);
 assert.match(ui,/if\(!drafts.length\)return/);
});
test('next navigation is gray after completing a stage but not blocked unless safeguards demand it',()=>{
 assert.match(css,/button.ba-step-next-complete:not\(:disabled\)/);
 assert.match(css,/background:var\(--vscode-button-secondaryBackground/);
 assert.match(css,/#discoveryView \.ba-next-step-row.hidden\{display:none!important\}/);
 const saved=progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true});
 assert.equal(saved.find(x=>x.key==='mapping').complete,true);
 assert.equal(getNextStep(saved,'mapping',false).key,'review');
 assert.equal(getNextStep(saved,'mapping',true),null);
 assert.equal(getNextStep(saved,'review',false),null);
 assert.equal(getNextStep(progress.derive({}), 'start',false),null);
});
test('all main Business Analysis panels share width and indentation without a nested gray history wrapper',()=>{
 assert.match(css,/#discoveryView> :is\(\.discovery-overview,\.ba-incomplete-panel/);
 assert.match(css,/box-sizing:border-box;width:100%;max-width:100%;margin:var\(--ba-panel-gap\) 0/);
 assert.match(css,/#discoveryView>\.ba-start-history-only\{padding:0;border:0;background:transparent/);
 assert.match(css,/#discoveryView #baCompletedList\{display:flex;flex-direction:column;gap:var\(--ba-panel-gap\)\}/);
});
