'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../media/ba-automatic-ui.js'),'utf8');
const from=source.indexOf(' function generatedRequirementsStatus('),to=source.indexOf(' function renderReadyPanels(',from);
assert.ok(from>=0&&to>from);
const build=new Function('state','activeId','brState','busy','baBusyTask',source.slice(from,to)+';return {generatedRequirementsStatus,currentJiraPreview,canPublishPrepared};');
const {generatedRequirementsStatus:status}=build(null,'p',{revision:'r'});
const baseline={sourceReady:true,discoveryReady:true,excluded:false,requirementsReady:true,allApproved:false,phase:'ready',previewCurrent:true,unsaved:false};
test('verified generated drafts are ready, not in progress or approved',()=>{
 assert.equal(status(baseline),'ready');
 assert.equal(status({...baseline,phase:'publishing',previewCurrent:false}),'ready');
 assert.equal(status({...baseline,allApproved:true,phase:'published'}),'completed');
});
test('stale, blocked, incomplete and unsaved requirements do not claim readiness',()=>{
 assert.equal(status({...baseline,previewCurrent:false}),'in-progress');
 assert.equal(status({...baseline,phase:'draft'}),'in-progress');
 assert.equal(status({...baseline,unsaved:true}),'in-progress');
 assert.equal(status({...baseline,excluded:true}),'needs-attention');
 assert.equal(status({...baseline,sourceReady:false}),'not-started');
 assert.equal(status({...baseline,discoveryReady:false}),'not-started');
 assert.equal(status({...baseline,requirementsReady:false,phase:'running'}),'in-progress');
});
test('preview is scoped to active project and exact BR revision with zero conflicts',()=>{
 const current=preview=>build({projectId:'p',preview},'p',{revision:'r'}).currentJiraPreview();
 assert.equal(current({revision:'r',conflicts:[]}),true);
 assert.equal(current({revision:'old',conflicts:[]}),false);
 assert.equal(current({revision:'r',conflicts:['missing field']}),false);
 assert.equal(build({projectId:'old',preview:{revision:'r',conflicts:[]}},'p',{revision:'r'}).currentJiraPreview(),false);
 assert.equal(current(null),false);
});
test('Approved and Publish is available with open BR findings on a verified Jira preview',()=>{
 const brState={revision:'r',baDraftQuality:{excluded:[{id:'BR-001',reason:'Scope needs clarification.'}]}};
 const state={projectId:'p',preview:{revision:'r',sourceNotes:['BR-001 · Scope needs clarification.'],conflicts:[]}};
 const canPublish=build(state,'p',brState,()=>false,null).canPublishPrepared;
 assert.equal(canPublish('ready',false),true);
 assert.equal(canPublish('ready',true),false);
 assert.equal(canPublish('publishing',false),false);
 state.preview.conflicts.push('Jira Create Issues permission is required.');
 assert.equal(canPublish('ready',false),false);
});
