'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {derive,definitions}=require('../media/ba-progress');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ready={hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true,generated:true,totalBrs:1,savedBrs:1,allApproved:false};
test('all ten process stages exist and are individually selectable when available',()=>{
 const stages=derive({});
 assert.equal(stages.length,10);
 assert.deepEqual(stages.map(x=>x.key),definitions.map(x=>x[0]));
 assert.equal(stages[0].current,true);
 assert.equal(stages.filter(x=>x.selectable).length,1);
 assert.equal(stages[0].state,'warning');
 assert.equal(stages[9].state,'pending');
});
test('completed stages become green and current approval becomes amber',()=>{
 const stages=derive(ready);
 assert.equal(stages.slice(0,6).every(x=>x.state==='success'),true);
 assert.equal(stages[6].state,'warning');
 assert.equal(stages[6].current,true);
 assert.equal(stages[7].selectable,false);
});
test('review findings remain visible but approved milestones are not stuck amber',()=>{
 const stages=derive({...ready,reviewWarnings:true});
 assert.equal(stages[3].state,'success');
 assert.equal(stages[3].selectable,true);
 assert.equal(stages[6].current,true);
});
test('failed stage is red and can be opened for retry and diagnosis',()=>{
 const stages=derive({...ready,failedStep:'approve'});
 assert.equal(stages[6].state,'failure');
 assert.equal(stages[6].selectable,true);
});
test('Jira progresses through preview, approval and publication independently',()=>{
 const approved={...ready,allApproved:true};
 assert.equal(derive(approved).find(x=>x.current).key,'jiraPreview');
 assert.equal(derive({...approved,jiraPreview:true}).find(x=>x.current).key,'jiraApprove');
 assert.equal(derive({...approved,jiraPreview:true,jiraApproved:true}).find(x=>x.current).key,'publish');
 const done=derive({...approved,published:true});
 assert.equal(done.every(x=>x.state==='success'),true);
});
test('progress selections render one section only and do not skip prerequisites',()=>{
 const html=read('test/generated/extension-source.txt'),script=read('media/start.js');
 assert.equal((html.match(/data-ba-step=/g)||[]).length,10);
 assert.match(script,/const displayed=baViewedStep\|\|activeStep/);
 for(const name of ['showSources','showMapping','showQuestions','showReview','showDocuments','showJira'])assert.match(script,new RegExp(name));
 assert.match(script,/node\.disabled=idleMilestones\?step\.key!=='start':!step\.selectable/);
 assert.match(script,/node\.setAttribute\('aria-pressed'/);
 assert.match(script,/baProgressProjectId!==activeId/);
 assert.match(script,/!baPublishedCurrent\(\)\|\|baViewedStep!==null/);
});
test('approval command confirms before writing and preserves existing approval checks',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js');
 const handler=host.slice(host.indexOf("case 'brSaveAndApprove':"),host.indexOf("case 'brApprove':"));
 assert.match(handler,/await requireBAOwner/);
 assert.match(handler,/savedDiscovery\.readiness\.canReview/);
 assert.match(handler,/current\.revision!==msg\.revision/);
 assert.match(handler,/await uiWarning/);
 assert.ok(handler.indexOf('await uiWarning')<handler.indexOf('brWorkflow.edit'));
 assert.ok(handler.indexOf('brWorkflow.edit')<handler.indexOf('brWorkflow.approve'));
 assert.match(handler,/requireBusinessOwner:roles\.enabled\.includes\('business-owner'\)/);
 assert.match(ui,/send\('brSaveAndApprove'/);
});
test('approval works for dirty draft without requiring a manual draft click',()=>{
 const ui=read('media/start.js');
 assert.match(ui,/const dirty=brEditorDirty\|\|!br\?\.draftSavedAt/);
 assert.doesNotMatch(ui,/const canApprove=[^\n]*!brEditorDirty/);
 assert.match(ui,/dirty\?parseBRQuill\(\):undefined/);
});
test('host confirmation moves above the Quill editor and receives keyboard focus',()=>{
 const ui=read('media/start.js'),css=read('media/start.css');
 assert.match(ui,/document\.body\.appendChild\(\$\('hostDialog'\)\)/);
 assert.match(css,/#hostDialog\.modal-overlay\{z-index:2147483000!important/);
 assert.match(ui,/\$\('hostDialogConfirm'\)\)\.focus\(\)/);
});

test('failed approval after auto-save retains the saved draft editor for corrections',()=>{
 const ui=read('media/start.js');
 assert.match(ui,/task==='approveBR'&&current\?\.status==='draft'/);
 assert.match(ui,/Final approval is still pending/);
});
