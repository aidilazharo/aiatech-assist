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

test('one standalone previous and next navigation panel follows all BA content',()=>{
 const panel=host.indexOf('<section id="baStepNavigation"');
 const jira=host.indexOf('<section class="jira-publish-panel"');
 const modal=host.indexOf('<div id="brEditModal"');
 assert.ok(jira>=0&&panel>jira&&modal>panel);
 for(const id of ['baStepNavigation','baPreviousStep','baNextStep'])assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(css,/#discoveryView>\.ba-step-navigation\{display:flex;flex-direction:column/);
 assert.doesNotMatch(host,/Workflow navigation|id="baStepNavigationStatus"/);
 assert.doesNotMatch(ui,/\$\('baStepNavigationStatus'\)/);
 assert.match(css,/\.ba-step-navigation \.ba-next-step-row\{display:flex;justify-content:space-between/);
 assert.match(css,/\.ba-step-navigation \.ba-next-step-row button:disabled/);
});
test('Start has no Next Upload action while later milestones show Previous and gated Next',()=>{
 assert.match(ui,/navigation\.classList\.toggle\('hidden',displayed==='start'\)/);
 assert.match(ui,/previousButton\.disabled=!previousDefinition\?\.selectable\|\|navigatingBusy/);
 assert.match(ui,/nextButton\.disabled=!ready/);
 assert.match(ui,/const next=ATGVJiraWorkflowTables\.getNextStep\(progress,displayed,navigatingBusy\)/);
 assert.match(ui,/previousButton\.dataset\.previousStep=previousDefinition\?\.key\|\|''/);
 assert.match(ui,/nextButton\.dataset\.nextStep=next\?\.key\|\|''/);
 assert.doesNotMatch(ui,/target\.append\(nextRow\)/);
 const started=progress.derive({started:true,hasSources:true});
 assert.equal(getNextStep(started,'start',false)?.key,'upload'); // Start hides the nav panel regardless.
 assert.equal(getNextStep(started,'upload',false)?.key,'mapping');
 assert.equal(started[0].selectable,true);
});
test('Next from Generate starts Preview & Save including first editable draft; navigation never auto-saves',()=>{
 assert.match(ui,/if\(\$\('baNextStep'\)\.dataset\.stage==='generate'\)/);
 assert.match(ui,/if\(!\$\('brNextPreviewSave'\)\.disabled\)\$\('brNextPreviewSave'\)\.click\(\)/);
 assert.match(ui,/if\(!openBAWorkflowStep\('save'\)\)return/);
 assert.match(ui,/requestAnimationFrame\(\(\)=>openBREditor\(first\.id\)\)/);
 assert.match(ui,/if\(\$\('baNextStep'\)\.disabled\)return/);
 assert.match(ui,/if\(\$\('baPreviousStep'\)\.disabled\)return/);
});
test('completed-stage inline Next buttons are hidden to avoid duplicates',()=>{
 assert.match(ui,/button\.classList\.toggle\('hidden',complete\)/);
 assert.match(ui,/discoveryAction\.classList\.toggle\('hidden',discoveryAdvanceReady\)/);
 assert.match(ui,/const hide=reviewComplete&&!running/);
 assert.match(ui,/nextPreview\.classList\.add\('hidden'\)/);
});
