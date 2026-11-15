'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {get,list,validStep,normalizeProgress,ids}=require('../media/user-guide');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('opening tour is isolated from opened project workflows',()=>{
 assert.deepEqual(list(['solution-architect'],false).map(g=>g.id),['opening','start-settings','extension-settings']);
 assert.ok(list(['solution-architect','software-developer','business-analyst'],true).some(g=>g.id==='solution-architect'));
 assert.ok(list(['solution-architect','software-developer','business-analyst'],true).some(g=>g.id==='my-work'));
 assert.ok(list(['solution-architect','software-developer','business-analyst'],true).some(g=>g.id==='business-requirement'));
 assert.ok(list(['solution-architect','software-developer'],true).some(g=>g.id==='start-settings'));
 assert.ok(!list(['solution-architect'],true).some(g=>g.id==='software-developer'));
 assert.ok(!list(['solution-architect'],true).some(g=>g.id==='opening'));
});
test('each SDLC guide has deterministic unique steps with bounded content',()=>{
 for(const id of ids){
  const guide=get(id);assert.ok(guide.steps.length>=3,id);
  assert.equal(new Set(guide.steps.map(step=>step.id)).size,guide.steps.length,id);
  for(const step of guide.steps){assert.ok(step.title&&step.description&&step.selector&&step.route,id);assert.equal(typeof step.interactive,'boolean');}
 }
});
test('only known steps are persisted, and progress is normalized',()=>{
 assert.equal(validStep('software-developer','issues'),true);
 assert.equal(validStep('software-developer','fake'),false);
 assert.equal(normalizeProgress('bad',{}),null);
 assert.deepEqual(normalizeProgress('software-developer',{stepId:'fake',completed:'yes',skipped:0}),{stepId:'issues',completed:false,skipped:false});
 assert.deepEqual(normalizeProgress('software-developer',{stepId:'refresh',completed:true,skipped:false}),{stepId:'refresh',completed:true,skipped:false});
});
test('practice interaction is limited to navigation, not Git Jira or approval buttons',()=>{
 for(const id of ids)for(const step of get(id).steps){
  if(!step.interactive)continue;
  assert.ok(step.selector.includes('data-nav')||step.selector==='#sidebarRoleTrigger',`${id}/${step.id} permits unsafe interaction`);
 }
});
test('all tour targets exist in real extension webview markup',()=>{
 const source=read('test/generated/extension-source.txt');
 for(const id of ids)for(const step of get(id).steps){
  if(step.selector[0]==='#')assert.ok(source.includes(`id="${step.selector.slice(1)}"`),`${id}/${step.id} target missing: ${step.selector}`);
  else if(step.selector.startsWith('[data-nav='))assert.ok(source.includes(`data-nav="${step.selector.match(/"([^"]+)"/)[1]}"`),`${id}/${step.id} navigation missing`);
 }
});
test('webview includes local scripts, accessible guide overlay, keyboard navigation and host persistence',()=>{
 const host=read('test/generated/extension-source.txt'),controller=read('media/user-guide-controller.js');
 for(const id of ['guideHelp','gateGuideHelp','guideMenu','guideOverlay','guideCard','guideStepTitle','guideMenuStart','guideNext','guideBack','guideSkip'])assert.ok(host.includes(`id="${id}"`),id);
 for(const file of ['user-guide.js','user-guide-controller.js'])assert.ok(host.includes(file),file);
 assert.ok(host.includes("case 'guideLoad':"));assert.ok(host.includes("case 'guideSave':"));
 assert.ok(host.includes('context.workspaceState.update(key'));
 assert.ok(host.includes("activeProject?.id||'opening'"));
 assert.ok(controller.includes("event.key==='Escape'"));
 assert.ok(controller.includes("event.key==='Tab'"));
 assert.ok(controller.includes("send('guideLoad')"));
 assert.ok(controller.includes("send('guideSave'"));
 assert.ok(controller.includes("if(!activeTarget.disabled"));
 assert.equal(read('package.json').includes('"version": "0.3.53"'),true);
});
