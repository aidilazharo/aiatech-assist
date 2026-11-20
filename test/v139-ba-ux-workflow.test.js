'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const host=read('test/generated/extension-source.txt'),ui=read('media/start.js'),css=read('media/start.css');
test('upload selection contains only count and Submit, with no duplicated explanatory messages',()=>{
 assert.doesNotMatch(host,/id="sourceAiDisclosure"|Select one or more documents for the 12 questions/);
 assert.match(host,/id="sourceSelectionCount"/);
 assert.match(ui,/textContent=count\?`\$\{count\} of .* selected`:'\s*'/);
});
test('nine-step workflow retains header readiness while bottom process descriptions are hidden',()=>{
 assert.match(host,/id="baProgressSelected" class="hidden" aria-hidden="true"/);
 assert.match(host,/class="discovery-status-row hidden" aria-hidden="true"/);
 assert.match(host,/id="discoveryReadiness"/);
 for(let step=1;step<=9;step++)assert.match(host,new RegExp('milestone-number">'+step+'<'));
});
test('AI review distinguishes replacement actions from review risk acknowledgments',()=>{
 assert.match(host,/id="discoveryReviewApply"[^>]*>Apply Answer Replacements/);
 assert.match(host,/Review &amp; Acknowledge Findings records your decision/);
 assert.match(ui,/finish\.textContent='Approve AI Review & Continue'/);
 assert.match(ui,/apply\.disabled=!!baBusyTask\|\|!mine\|\|!reviewCurrent/);
});
test('BR filter defaults to All on project change and Preview Edit is in the ownership row',()=>{
 assert.match(ui,/brFilterProjectId!==activeId\)\{brActiveFilter='all';brFilterProjectId=activeId/);
 assert.match(ui,/cardControls\.append\(meta\)/);
 assert.match(ui,/br-card-preview/);
 assert.match(ui,/actionBar\.append\(preview\)/);
 assert.match(css,/\.br-card-controls \.br-card-preview\{margin-left:auto/);
});
test('Quill approval reasons include contextual navigation; existing approvals still require prerequisites',()=>{
 assert.match(ui,/resolutionButtons=\{/);
 for(const key of ['discovery','review','ownership','businessOwner','draftSource','impact','conflict','changes'])assert.match(ui,new RegExp('\\b'+key+':\\['));
 assert.match(ui,/button\.addEventListener\('click',\(\)=>\{/);
 assert.match(ui,/const canApprove=!!br&&!blockers\.length/);
});
test('Upload register is visible and disabled outside an active Start Restart source window',()=>{
 assert.match(ui,/const showSources=displayed==='upload'/);
 assert.match(ui,/const sourceWindowOpen=!!brState\?\.restartPending/);
 assert.match(ui,/const sourceLocked=!sourceWindowOpen\|\|sourceMappingStarted/);
 assert.match(ui,/\$\('discoveryImport'\)\.disabled=sourceLocked/);
 assert.match(ui,/\.classList\.toggle\('ba-source-locked',sourceLocked\)/);
 assert.match(ui,/function renderArchivedSources\(\)/);assert.match(ui,/root\.replaceChildren\(\);root\.classList\.add\('hidden'\)/);
 assert.match(ui,/selector\.classList\.remove\('hidden'\)/);
});
test('Save becomes Next Step when persisted and supports retrying an unlinked revision',()=>{
 assert.match(ui,/discoverySave:saved&&!discoveryDirty&&baMappingComplete\(\)\?/);
 assert.match(ui,/\(!discoveryDirty&&saved\)/);
 assert.match(ui,/if\(!discoveryData\|\|\$\('discoverySave'\)\.disabled\)return;/);
 assert.match(ui,/discoveryDirty=true;\$\('discoverySave'\)\.disabled=!baCanEdit/);
 assert.match(ui,/discoveryAction.type=discoveryAdvanceReady\?'button':'submit'/);
 assert.match(ui,/openBAWorkflowStep\('review'\)/);
});
