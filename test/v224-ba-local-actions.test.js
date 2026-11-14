'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const js=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('unfinished requirement card is Start-only and Resume still targets saved workflow step',()=>{
 assert.match(js,/panel\.classList\.toggle\('hidden',!unfinished\|\|displayed!=='start'\)/);
 assert.match(js,/if\(!unfinished\|\|displayed!=='start'\)return/);
 assert.match(js,/renderBAUncompleted\(progress,activeStep,activeBrs,hasSources,displayed\)/);
 assert.match(js,/\$\('baResumeIncomplete'\)\.dataset\.resumeStep=activeStep/);
 assert.match(js,/send\('restartUncompletedBusinessRequirement'/);
});

test('finished AI Review uses Next Step Generate Requirements rather than Re-run, and navigates safely',()=>{
 assert.match(js,/const reviewAdvanceReady=baReviewFinalized\(\)&&!running/);
 assert.match(js,/reviewAdvanceReady\?'Next Step · Generate Requirements'/);
 assert.match(js,/dataset\.action=reviewAdvanceReady\?'next-generate':'review'/);
 assert.match(js,/dataset\.action==='next-generate'\)\{openBAWorkflowStep\('generate'\);return;/);
 assert.match(js,/if\(baBusyTask==='review'\)/);
});

test('Generate and Next Preview Save actions live at the bottom of the BR Documents section',()=>{
 const start=html.indexOf('<section class="br-workflow-panel"');
 const end=html.indexOf('</section>',start);
 const section=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.ok(section.indexOf('id="brCards"')<section.indexOf('class="br-documents-actions"'));
 for(const id of ['brGenerate','brGenerateAffected','brNextPreviewSave']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  assert.ok(section.includes('id="'+id+'"'));
 }
 assert.match(js,/const canPreview=generatingDone&&displayedStage==='generate'/);
 assert.match(js,/if\(!openBAWorkflowStep\('save'\)\)return/);
 assert.match(js,/requestAnimationFrame\(\(\)=>openBREditor\(first\.id\)\)/);
 assert.match(css,/\.br-documents-actions\{display:flex/);
});

test('Previous and Next Step share one standalone section rather than being reparented into content',()=>{
 assert.match(html,/id="baStepNavigation"/);
 assert.match(html,/id="baPreviousStep"/);
 assert.match(html,/id="baNextStep"/);
 assert.match(js,/navigation\.classList\.toggle\('hidden',displayed==='start'\)/);
 assert.doesNotMatch(js,/target\.append\(nextRow\)/);
});

test('release version is 0.2.42 without changing the ten milestone definitions',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'0.3.49');
 assert.equal(pkg.atgvDisplayVersion,'0.3.49');
 assert.equal((html.match(/class="workflow-step atgv-milestone"/g)||[]).length,10);
});
