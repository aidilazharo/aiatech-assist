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

test('incomplete cycle gets exactly one Resume/Restart section while approved history is preserved',()=>{
 for(const id of ['baUncompletedPanel','baIncompleteTitle','baIncompleteMeta','baIncompleteSource','baResumeIncomplete','baRestartIncomplete']){
  assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(host,/<section id="baUncompletedPanel" class="ba-incomplete-panel hidden"/);
 assert.match(host,/id="baCompletedSection" class="ba-completed-flat"/);
 assert.match(host,/id="baCompletedJiraHistory"/);
 assert.match(css,/#discoveryView \.ba-incomplete-panel\{display:flex/);
});
test('render only for a started but unfinished cycle, with exact saved milestone and source',()=>{
 assert.match(ui,/const started=hasSources\|\|!!brState\?\.restartPending\|\|activeBrs\.length>0/);
 assert.match(ui,/const unfinished=baResumeCardReady&&started&&baHasRecoverableBR\(brState\)&&!progress\.every\(step=>step\.complete\)/);
 assert.match(ui,/Resume at: Step \$\{current\.index\+1\} of \$\{progress\.length\}/);
 assert.match(ui,/renderBAUncompleted\(progress,activeStep,activeBrs,hasSources,displayed\)/);
 assert.equal(progress.derive({}).find(item=>item.current).key,'start');
 assert.equal(progress.derive({started:true,hasSources:false}).find(item=>item.current).key,'upload');
 assert.equal(progress.derive({started:true,hasSources:true}).find(item=>item.current).key,'mapping');
 assert.equal(progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true}).find(item=>item.current).key,'review');
});
test('resume navigates to saved active step without restarting or submitting work',()=>{
 const start=ui.indexOf("$('baResumeIncomplete').addEventListener('click'");
 const end=ui.indexOf("$('baDeleteIncomplete').addEventListener('click'",start);
 const resume=ui.slice(start,end);
 assert.match(resume,/baViewedStep=key/);
 assert.match(resume,/renderDiscoverySummary\(\)/);
 assert.doesNotMatch(resume,/send\(|startOrRestartBusinessRequirements|importDiscovery/);
});
test('restart uses host confirmation, preserves protected records and guards unsafe states',()=>{
 const start=ui.indexOf("$('baRestartIncomplete').addEventListener('click'");
 const end=ui.indexOf('// v0.1.21:',start);
 assert.match(ui.slice(start,end),/send\('restartUncompletedBusinessRequirement',\{revision:brState\.revision,openUploadImmediately:true\}\)/);
 assert.match(ui,/const canRestart=hasSources&&!Object\.keys\(brState\?\.pending\|\|\{\}\)\.length&&!discoveryDirty&&!brEditorDirty&&!baBusyTask&&!discoveryImportBusy/);
 const hostStart=host.indexOf("case 'restartUncompletedBusinessRequirement':");
 const hostEnd=host.indexOf("case 'restartDiscoverySources':",hostStart);
 const restart=host.slice(hostStart,hostEnd);
 assert.match(restart,/Restart Uncompleted Business Requirement/);
 assert.match(restart,/if\(answer!==action\)break/);
 assert.match(restart,/brWorkflow\.startOrRestart/);
 assert.match(restart,/await discovery\.save/);
 assert.match(restart,/await importDiscoveryDocument\('business-analyst'\)/);
 assert.match(restart,/Previously approved Business Requirements and published Jira links will be preserved/);
});
