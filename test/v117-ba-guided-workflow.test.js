"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const progress=require('../media/ba-progress');

test('nine-step navigation is the single visible Business Requirements navigator',()=>{
 for(const id of progress.definitions.map(row=>row[1]))assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.doesNotMatch(host,/id="baPhaseNav"|id="baNextActionButton"/);
 assert.match(host,/<div class="ba-detailed-steps" id="baDetailedSteps">/);
 assert.doesNotMatch(host,/id="baPhaseNav"/);
 assert.match(ui,/if\(!node\|\|node\.disabled\)/);
});
test('nine-step progress preserves all prior workflow gates and Jira approval guards',()=>{
 const groups=[['start','upload','mapping'],['review'],['generate','save','approve'],['jiraPreview','jiraApprove','publish']];
 const all=groups.flat();
 assert.deepEqual(all,progress.definitions.map(row=>row[0]));
 assert.match(ui,/baGuideRender\(progress,displayed/);
 assert.match(ui,/brJiraSync:!!baBusyTask\|\|!brPlanRevision\|\|!brJiraPreviewApproved/);
});
test('a failed or stale stage never grants publication readiness',()=>{
 const empty=progress.derive({hasSources:false,published:true});
 assert.equal(empty.find(x=>x.key==='publish').complete,false);
 const stale=progress.derive({hasSources:true,mappingDone:false,savedDiscovery:false,reviewFinalized:true,generated:true,totalBrs:1,savedBrs:1,allApproved:true,jiraPreview:true,jiraApproved:true,published:true});
 assert.equal(stale.find(x=>x.key==='publish').complete,false);
 const started=progress.derive({hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true,generated:true,totalBrs:1,savedBrs:1,allApproved:false,published:false});
 assert.equal(started.find(x=>x.key==='approve').complete,false);
});
test('revision history and ownership options are condensed without removing guarded action handlers',()=>{
 assert.match(ui,/br-actions-menu/);
 assert.match(ui,/Compare revisions/);
 assert.match(ui,/Create New Revision/);
 assert.match(ui,/brRetire/);
 assert.match(css,/\.br-actions-menu/);
});
test('new interface remains responsive, no new editor group introduced',()=>{
 assert.match(css,/\.ba-detailed-steps \.discovery-workflow/);
 assert.match(css,/@media\(max-width:830px\)/);
 assert.match(css,/@media\(max-width:470px\)/);
 assert.doesNotMatch(ui,/editorLayoutTwoColumns|ViewColumn\.Two/);
});
