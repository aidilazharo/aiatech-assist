'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const view=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const renderer=view.slice(view.indexOf('function renderDeveloperBrStages(){'),view.indexOf('let developerBrFailedAt=',view.indexOf('function renderDeveloperBrStages(){')));
const ids=['Analyze','Plan','Red','Green','Refactor','Test','Build','Local','Verify'];
function renderPreview(phase,{ready=false,stage=phase,preview=true,owns=true,loaded=true,inventoryProject='p',serverRunning=ready}={}){
 const nodes={};
 function node(){const flags=new Set();return {
  textContent:'',disabled:false,className:'',title:'',attrs:{},
  classList:{toggle:(n,on)=>on?flags.add(n):flags.delete(n),add:n=>flags.add(n),remove:n=>flags.delete(n),contains:n=>flags.has(n)},
  querySelector:n=>n==='small'?{textContent:''}:null,
  setAttribute(n,v){this.attrs[n]=v},removeAttribute(n){delete this.attrs[n]}
 }}
 for(const id of ids.map(n=>'developerBrStep'+n).concat(['developerBrProgressCount','developerBrServerIndicator','developerBrDetails','developerBrWorkArea','developerBrStart','developerBrStop','developerBrPreviewDraft','developerBrOpenWorktree','developerBrOpenPreview','developerBrRetryLocal','developerBrServerToggle','developerBrSelect','developerBrJiraSelect']))nodes[id]=node();
 const ctx={developerBrStages:['analyze','plan','red','green','refactor','tests','build','local','verify'],developerBrNodes:ids.map(n=>'developerBrStep'+n),developerBrDraftPhases:['analyze','plan','local','verify'],developerBrDraftPhase:phase,developerBrDraftReady:ready,
 developerBrStage:stage,developerBrPreviewOnly:preview,developerBrDone:false,developerBrSelected:'BR-011',developerBrBusy:!ready,developerBrServerBusy:false,developerBrServerRunning:serverRunning,developerBrStopping:false,developerBrAssignmentBusy:false,developerBrCanRetry:false,developerBrWorktree:'',developerBrUrl:'',developerBrCycleIndex:0,developerBrCycleTotal:0,developerBrRecovery:null,
 roleJiraLoaded:loaded,roleJiraProject:inventoryProject,activeId:'p',roleJiraItems:[{brRoot:true,brId:'BR-011',roleScopes:{'software-developer':{mine:owns}}}],
 projectDraftPreviewEnabled:()=>true,renderDeveloperCriterionProgress:()=>{},renderDeveloperBrAssignment:()=>{},syncBrDeliveryGate:()=>{},matchingDeveloperBrTickets:()=>[],windowDeveloperBrFailedAt:()=>stage,$:id=>{assert.ok(nodes[id],id);return nodes[id];}};
 vm.runInNewContext(renderer+'\nrenderDeveloperBrStages();',ctx);
 return nodes;
}
test('Preview Draft uses a tooltip-accessible eye icon and retains project permission gate',()=>{
 assert.match(host,/id="developerBrPreviewDraft"[^>]+aria-label="Preview Draft"[^>]*><svg/);
 assert.match(host,/<svg[^>]+aria-hidden="true"/);
 assert.doesNotMatch(host,/>Preview Draft<\/button>/);
 assert.match(css,/#developerBrPreviewDraft\{[^}]+width:44px/);
 assert.match(view,/preview\.classList\.toggle\('hidden',false\)/);
 assert.match(view,/preview\.disabled=!projectDraftPreviewEnabled\(\)/);
 assert.match(view,/preview\.title='Preview Draft/);
});
test('Draft preview moves through Analyze, Plan, Local and Verify circles without falsely passing TDD',()=>{
 const phaseOrder=['analyze','plan','local','verify'];
 for (const [index,phase] of phaseOrder.entries()){
  const nodes=renderPreview(phase);
  for(const skipped of ['Red','Green','Refactor','Test','Build'])assert.match(nodes['developerBrStep'+skipped].className,/preview-skipped/);
  const circle=nodes['developerBrStep'+({analyze:'Analyze',plan:'Plan',local:'Local',verify:'Verify'}[phase])];
  assert.match(circle.className,/preview-current/);
  assert.equal(circle.attrs['aria-current'],'step');
  assert.match(nodes.developerBrProgressCount.textContent,new RegExp(`${index} of 4 phases`));
 }
 const done=renderPreview('verify',{ready:true});
 for(const active of ['Analyze','Plan','Local','Verify'])assert.match(done['developerBrStep'+active].className,/preview-complete/);
 for(const skipped of ['Red','Green','Refactor','Test','Build'])assert.doesNotMatch(done['developerBrStep'+skipped].className,/\bcomplete\b/);
 assert.match(done.developerBrProgressCount.textContent,/4 of 4 phases.*tests\/build skipped/);
});
test('Draft preview failures and stopped runs do not look fully verified',()=>{
 const fail=renderPreview('local',{stage:'failed'});
 assert.match(fail.developerBrStepLocal.className,/failed/);
 assert.match(fail.developerBrProgressCount.textContent,/2 of 4 phases/);
 const stopped=renderPreview('local',{stage:'server-stopped'});
 assert.doesNotMatch(stopped.developerBrStepLocal.className,/preview-current|preview-complete/);
});
test('Preview backend reports live Verify phase from HTTP readiness; no test/build execution',()=>{
 const fn=host.slice(host.indexOf('async function launchUntestedDraftServer('),host.indexOf('async function runDeveloperDraftPreview('));
 assert.match(fn,/await progress\('verify','UNTESTED PREVIEW: checking frontend HTTP readiness only/);
 assert.match(fn,/onUpdate:async state=>\{check\(\);await progress\('verify'/);
 assert.match(fn,/endpoints\.slice\(0,1\)/);
 assert.match(fn,/run\.checksPassed=false/);
 assert.doesNotMatch(fn,/npm run test|npm run build/);
 assert.match(view,/const phase=msg\.stage==='code'\?'plan':msg\.stage==='complete'\?'verify':msg\.stage/);
 assert.match(view,/developerBrDone=msg\.stage==='complete'&&!developerBrPreviewOnly/);
});

test('Draft preview requires current verified role ownership',()=>{
 assert.equal(renderPreview('idle',{ready:true,preview:false,serverRunning:false}).developerBrPreviewDraft.disabled,false);
 assert.equal(renderPreview('idle',{ready:true,preview:false,serverRunning:false,owns:false}).developerBrPreviewDraft.disabled,true);
 assert.equal(renderPreview('idle',{ready:true,preview:false,serverRunning:false,loaded:false}).developerBrPreviewDraft.disabled,true);
 assert.equal(renderPreview('idle',{ready:true,preview:false,serverRunning:false,inventoryProject:'other'}).developerBrPreviewDraft.disabled,true);
});
