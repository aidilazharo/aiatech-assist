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

test('incomplete cycle shows only Resume and Delete while approved history is preserved',()=>{
 for(const id of ['baUncompletedPanel','baIncompleteTitle','baIncompleteMeta','baIncompleteSource','baResumeIncomplete','baDeleteIncomplete']){
  assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.doesNotMatch(host,/id="baRestartIncomplete"|id="baOverviewNew"/);
 assert.match(host,/<section id="baUncompletedPanel" class="ba-incomplete-panel"/);
 assert.match(host,/id="baCompletedSection" class="ba-completed-flat"/);
 assert.match(host,/id="baCompletedJiraHistory"/);
 assert.match(css,/#baRequirementsOverview \.ba-incomplete-panel\{display:flex/);
});
test('the overview renders the saved milestone and source for an unfinished cycle',()=>{
 assert.match(ui,/if\(!panel\|\|view!=='baOverview'\)return/);
 assert.match(ui,/const unfinished=baHasRecoverableBR\(brState\)&&\(!baPublishedCurrent\(\)/);
 assert.match(ui,/ATGVBusinessRequirements\?\.stageSummary\(\)/);
 assert.match(ui,/baResumeIncomplete'\)\.classList\.toggle\('hidden',!unfinished\)/);
 assert.equal(progress.derive({}).find(item=>item.current).key,'start');
 assert.equal(progress.derive({started:true,hasSources:false}).find(item=>item.current).key,'upload');
 assert.equal(progress.derive({started:true,hasSources:true}).find(item=>item.current).key,'mapping');
 assert.equal(progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true}).find(item=>item.current).key,'review');
});
test('resume navigates to saved active step without restarting or submitting work',()=>{
 assert.doesNotMatch(ui,/baRestartIncomplete/);
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
