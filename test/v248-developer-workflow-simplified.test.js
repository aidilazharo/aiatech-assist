'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const host=fs.readFileSync(path.resolve(__dirname,'../test/generated/extension-source.txt'),'utf8');
const client=fs.readFileSync(path.resolve(__dirname,'../media/start.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../media/start.css'),'utf8');

test('Assigned Jira Tasks uses an accessible single-select dropdown and preserves unsaved artifact edits',()=>{
 assert.match(host,/<select id="developerAssignedTickets" aria-label="Select your assigned Business Requirement"/);
 assert.doesNotMatch(host,/<details id="developerAssignedTaskSection"/);
 assert.match(client,/root\.replaceChildren\(\)/);
 assert.match(client,/root\.value=developerSelectedTicket/);
 assert.match(client,/if\(developerArtifactDirty\)\{root\.value=developerSelectedTicket/);
 assert.match(client,/option\.textContent=`\$\{item\.key\} · \$\{item\.summary/);
 assert.match(client,/syncDeveloperBrJira\(\)/);
 assert.doesNotMatch(client,/if\(mine\.length\)selectDeveloperTicket\(mine\[0\]\.key\)/);
});

test('Four animated step circles and compact artifact details are wired to real workflow events',()=>{
 for(const name of ['Select Task','AI Development','Tests &amp; Build','Complete Delivery'])assert.ok(host.includes('>'+name+'</strong>'));
 for(const id of ['developerStepSelect','developerStepAi','developerStepTests','developerStepComplete'])assert.match(host,new RegExp('id="'+id+'"'));
 assert.match(host,/<details id="developerArtifactsSection" class="developer-artifacts-section">/);
 assert.match(client,/developerStageEvidence\.aiReady=true/);
 assert.match(client,/developerStageEvidence\.checksPassed=!!msg\.value\?\.passed/);
 assert.match(client,/developerStageEvidence\.verified=!!info\.ready/);
 assert.match(client,/developerStageEvidence\.completed=true/);
 assert.match(client,/progress\.basis!=='subtasks'/);
 assert.match(css,/@keyframes atgvDeveloperCirclePulse/);
 assert.match(css,/@keyframes atgvDeveloperCircleComplete/);
 assert.match(css, /prefers-reduced-motion:reduce\)\{#workView \.developer-workflow-step/);
});

const start=client.indexOf('function renderDeveloperWorkflowSteps(){');
const end=client.indexOf('function textElement(',start);
const functionSource=client.slice(start,end);
function simulate({key='',detail=null,flags={},busy=false,aiBusy=false}={}){
 const result={};
 const nodes={};
 for(const id of ['developerStepSelect','developerStepAi','developerStepTests','developerStepComplete']){
  const small={textContent:''};
  nodes[id]={className:'',attributes:{},querySelector(q){assert.equal(q,'small');return small;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},small};
 }
 nodes.developerWorkflowStatus={textContent:''};
 nodes.developerDeliveryRunChecks={disabled:busy};
 const context={developerSelectedTicket:key,developerTaskInfo:detail,developerStageEvidence:{key,...flags},developerDeliveryBusy:busy,developerAiBusy:aiBusy,$:id=>nodes[id]};
 vm.runInNewContext(functionSource+'\nrenderDeveloperWorkflowSteps();',context);
 for(const [id,node] of Object.entries(nodes))result[id]={className:node.className,message:node.small?.textContent||node.textContent,attrs:node.attributes||{}};
 return result;
}
test('step states distinguish no task, AI proposal, tests, verification and actual Jira completion',()=>{
 const idle=simulate();assert.match(idle.developerStepSelect.className,/current/);
 assert.match(idle.developerStepTests.className,/pending/);
 const detail={key:'TC-401',status:'To Do'};
 const selected=simulate({key:'TC-401',detail});
 assert.match(selected.developerStepSelect.className,/complete/);
 assert.match(selected.developerStepAi.className,/current/);
 assert.match(selected.developerStepTests.className,/pending/);
 const proposal=simulate({key:'TC-401',detail,flags:{aiReady:true}});
 assert.match(proposal.developerStepAi.className,/complete/);
 assert.match(proposal.developerStepTests.className,/current/);
 assert.match(proposal.developerStepAi.message,/Proposal ready/);
 const testing=simulate({key:'TC-401',detail,busy:true});
 assert.match(testing.developerStepAi.className,/skipped/);
 assert.match(testing.developerStepTests.className,/current/);
 const failed=simulate({key:'TC-401',detail,flags:{checksFailed:true}});
 assert.match(failed.developerStepTests.className,/failed/);
 const passed=simulate({key:'TC-401',detail,flags:{checksPassed:true}});
 assert.match(passed.developerStepTests.className,/complete/);
 assert.match(passed.developerStepComplete.className,/current/);
 const verified=simulate({key:'TC-401',detail,flags:{verified:true}});
 assert.match(verified.developerStepComplete.message,/Verified/);
 assert.doesNotMatch(verified.developerStepComplete.className,/complete/);
 const done=simulate({key:'TC-401',detail,flags:{completed:true}});
 assert.match(done.developerStepComplete.className,/complete/);
 assert.match(done.developerWorkflowStatus.message,/completed/);
});
