'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const progress=require('../media/ba-progress');

test('Start never shows Next Step Upload and navigation uses a standalone section for subsequent steps',()=>{
 assert.doesNotMatch(host,/id="baStartNextActions"/);
 assert.doesNotMatch(ui,/start:\$\('baStartNextActions'\)/);
 assert.match(host,/id="baStepNavigation"/);
 assert.match(host,/id="baPreviousStep"/);
 assert.match(ui,/navigation.classList.toggle\('hidden',displayed==='start'\)/);
 assert.match(ui,/previousButton.disabled=!previousDefinition\?.selectable\|\|navigatingBusy/);
 assert.match(host,/id="baNextStep"/);
 assert.equal(progress.definitions.length,10);
});
test('New Business Requirement is enabled at Start regardless of an unfinished BR',()=>{
 assert.match(ui,/\$\('baNewRequirement'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.match(ui,/\$\('baNewRequirement'\)\.disabled=displayed!=='start'\|\|!activeId\|\|!brState/);
 assert.doesNotMatch(ui,/canBeginOrResume|const canStartNew/);
 assert.doesNotMatch(host,/id="baNewRequirement"[^>]*\sdisabled\b/);
 assert.match(ui,/send\('startOrRestartBusinessRequirements',\{revision:brState\.revision,openUploadImmediately:true\}\)/);
});

test('Starting from Start confirms an active cycle and prevents unsafe interruption',()=>{
 assert.match(host,/const hasPrior=existing\.length>0/);
 assert.match(host,/uiWarning\(`Start a new independent Business Requirements cycle\?/);
 assert.match(host,/answer!==action\)break/);
 assert.match(host,/brWorkflow\.startOrRestart\(registry,activeProject\.id,current\.revision/);
 assert.match(ui,/if\(baBusyTask\|\|discoveryImportBusy\|\|brEditorSaving\|\|discoveryDirty\|\|brEditorDirty\|\|Object\.keys\(brState\.pending\|\|\{\}\)\.length\)/);
 assert.match(ui,/Finish the current operation, save unsaved changes/);
 assert.match(host,/if\(msg\.openUploadImmediately\)\{/);
 assert.match(host,/await importDiscoveryDocument\('business-analyst'\)/);
});
