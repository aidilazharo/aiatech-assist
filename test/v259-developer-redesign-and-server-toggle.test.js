'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const client=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('reference-aligned layout offers a eight-step TDD BR flow, grouped implementation categories, and delivery evidence',()=>{
 const screen=host.slice(host.indexOf('<section id="developerTaskDashboard"'),host.indexOf('<div id="developerManualTickets"'));
 assert.match(screen,/class="developer-br-topbar"/);
 assert.match(screen,/id="developerBrServerToggle"/);
 assert.match(screen,/id="developerBrOpenPreview"/);
 assert.match(screen,/id="developerBrCategoryPanel"/);
 assert.match(screen,/id="developerDeliveryEvidence"/);
 for(const group of ['frontend','backend','database','integration','testing','code','tests','server','logs'])assert.ok(screen.includes(`data-developer-br-tab="${group}"`),group);
 assert.ok(screen.indexOf('id="developerBrOutput"')<screen.indexOf('id="developerDeliveryPanel"'));
 assert.match(css,/developer-br-output-tabs.*overflow-x:auto/);
 assert.match(css,/developer-br-stage\.complete::before\{content:attr\(data-number\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('server control launches only matching tested, checkpointed initial or permitted draft worktrees and opens browser after verification',()=>{
 assert.match(host,/case 'developerBrStartServer':/);
 assert.match(host,/prior\.brId!==String\(msg\.brId\|\|''\)/);
 assert.match(host,/if\(!prior\|\|prior\.projectId!==activeProject\.id.*!\(prior\.checksPassed\|\|prior\.initial\|\|prior\.previewOnly&&require\('\.\.\/\.\.\/developer-preview-mode'\)\.allowed/);
 assert.match(host,/if\(prior\.initial\)\{await developerTdd\.verifyCheckpoint\(prior\.worktree,prior\.checkpoint\)/);
 assert.match(host,/if\(approved\.approvedRevision!==prior\.revision\)/);
 assert.match(host,/if\(approval\.sha!==prior\.approvalSha\)/);
 const start=host.indexOf("case 'developerBrStartServer':");
 const end=host.indexOf("case 'developerBrLogs':",start);
 const body=host.slice(start,end);
 assert.ok(body.indexOf('await launchGeneratedBrServer(run,project,progress,check)')<body.indexOf('vscode.env.openExternal'));
 assert.match(body,/msg\.command==='developerBrStartServer'/);
 assert.match(body,/type:'developerBrBrowserOpened'/);
 assert.match(host,/case 'developerBrStop'/);
 assert.match(host,/type:'developerBrLogState'.*previewUrl:verified\?prior\.previewUrl/);
 assert.match(client,/send\('developerBrStartServer',\{brId:developerBrSelected\}\)/);
});

const start=client.indexOf('function renderDeveloperBrStages(){');
const end=client.indexOf('let developerBrFailedAt=',start);
const renderCode=client.slice(start,end);
function simulate({selected='',stage='idle',done=false,busy=false,serverRunning=false,serverBusy=false,canRetry=false,worktree='',url='',owns=true,loaded=true,inventoryProject='p',inventoryRole='software-developer',taskCount=1}={}){
 const nodes={};
 function fake(){const flags=new Set();return {
  disabled:false,textContent:'',attributes:{},
  classList:{toggle(name,enabled){if(enabled)flags.add(name);else flags.delete(name);},contains(name){return flags.has(name);},remove(name){flags.delete(name);}},
  querySelector(name){return name==='small'?{textContent:''}:null;},
  setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];}
 };}
 for(const id of ['developerBrStepAnalyze','developerBrStepPlan','developerBrStepRed','developerBrStepGreen','developerBrStepRefactor','developerBrStepTest','developerBrStepBuild','developerBrStepLocal','developerBrStepVerify','developerBrPreviewDraft','developerBrProgressCount','developerBrServerIndicator','developerBrDetails','developerBrWorkArea','developerBrStart','developerBrStop','developerBrOpenWorktree','developerBrOpenPreview','developerBrRetryLocal','developerBrServerToggle','developerBrSelect','developerBrJiraSelect'])nodes[id]=fake();
 const context={
  developerBrStages:['analyze','plan','red','green','refactor','tests','build','local','verify'],
  developerBrNodes:['developerBrStepAnalyze','developerBrStepPlan','developerBrStepRed','developerBrStepGreen','developerBrStepRefactor','developerBrStepTest','developerBrStepBuild','developerBrStepLocal','developerBrStepVerify'],
  developerBrStage:stage,developerBrDone:done,developerBrBusy:busy,developerBrServerRunning:serverRunning,developerBrServerBusy:serverBusy,developerBrPreviewOnly:false,projectDraftPreviewEnabled:()=>false,
  roleJiraLoaded:loaded,roleJiraProject:inventoryProject,roleJiraRole:inventoryRole,activeId:'p',roleJiraItems:selected?[{brRoot:true,brId:selected,roleScopes:{'software-developer':{mine:owns,count:taskCount}}}]:[],
  developerBrSelected:selected,developerBrWorktree:worktree,developerBrCanRetry:canRetry,developerBrUrl:url,developerBrStopping:false,developerBrAssignmentBusy:false,renderDeveloperBrAssignment:()=>{},
  matchingDeveloperBrTickets:()=>[],syncBrDeliveryGate:()=>{},windowDeveloperBrFailedAt:()=>stage,renderDeveloperCriterionProgress:()=>{},
  $:id=>{assert.ok(nodes[id],id);return nodes[id];}
 };
 vm.runInNewContext(renderCode+'\nrenderDeveloperBrStages();',context);
 return nodes;
}
test('Start Server changes to Stop Server only for a running verified server',()=>{
 const empty=simulate();
 assert.equal(empty.developerBrDetails.classList.contains('hidden'),false);
 assert.equal(empty.developerBrWorkArea.classList.contains('hidden'),true);
 assert.equal(empty.developerBrProgressCount.classList.contains('hidden'),false);
 assert.equal(empty.developerBrStart.disabled,true);
 const initial=simulate({selected:'BR-007'});
 assert.equal(initial.developerBrDetails.classList.contains('hidden'),false);
 assert.equal(initial.developerBrWorkArea.classList.contains('hidden'),false);
 assert.equal(initial.developerBrProgressCount.classList.contains('hidden'),false);
 assert.equal(initial.developerBrServerToggle.disabled,true);
 assert.match(initial.developerBrServerToggle.textContent,/Start Server/);
 assert.equal(initial.developerBrProgressCount.textContent,'0 of 9 steps');
 const stopped=simulate({selected:'BR-007',stage:'server-stopped',canRetry:true,worktree:'/worktrees/br007'});
 assert.equal(stopped.developerBrServerToggle.disabled,false);
 assert.match(stopped.developerBrServerToggle.textContent,/Start Server/);
 assert.equal(stopped.developerBrProgressCount.textContent,'7 of 9 steps');
 const running=simulate({selected:'BR-007',stage:'verify',done:true,canRetry:true,worktree:'/worktrees/br007',serverRunning:true,url:'http://127.0.0.1:5173/'});
 assert.equal(running.developerBrServerToggle.disabled,false);
 assert.match(running.developerBrServerToggle.textContent,/Stop Server/);
 assert.equal(running.developerBrOpenPreview.disabled,false);
 assert.equal(running.developerBrProgressCount.textContent,'9 of 9 steps');
 const loading=simulate({selected:'BR-007',stage:'local',busy:true,serverBusy:true,canRetry:true,worktree:'/worktrees/br007'});
 assert.equal(loading.developerBrServerToggle.disabled,true);
 assert.equal(loading.developerBrStop.classList.contains('hidden'),true);
 assert.match(loading.developerBrStart.textContent,/Stop Development/);
});

test('Start Development requires verified ownership from the current project but Stop remains available',()=>{
 for(const options of [{owns:false},{loaded:false},{inventoryProject:'other'},{inventoryRole:'ux-designer'},{taskCount:0}]){
  const nodes=simulate({selected:'BR-007',...options});
  assert.equal(nodes.developerBrStart.disabled,true);
  assert.equal(simulate({selected:'BR-007',busy:true,...options}).developerBrStart.disabled,false);
 }
 assert.equal(simulate({selected:'BR-007'}).developerBrStart.disabled,false);
});
