'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const workflow=require('../media/jira-workflow-tables');
const progress=require('../media/ba-progress');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('BA Next Step is ready only when its actual next action can execute',()=>{
 const steps=progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true,generated:true,totalBrs:2,savedBrs:0});
 const next=workflow.getNextStep(steps,'generate',false);
 assert.equal(next?.key,'save');
 assert.equal(workflow.nextActionReady({next,complete:true,previewReady:true}),true);
 assert.equal(workflow.nextActionReady({next,complete:true,previewReady:false}),false);
 assert.equal(workflow.nextActionReady({next,complete:true,approvalReady:false}),false);
 assert.equal(workflow.nextActionReady({next,complete:false}),false);
 assert.equal(workflow.nextActionReady({next:null,complete:true}),false);
 assert.equal(workflow.nextActionReady({canConfirm:true,next:null,complete:false}),true);
 assert.equal(workflow.getNextStep(steps,'generate',true),null,'busy workflow cannot show a ready next action');
});
test('generate-to-preview remains available without prematurely requiring final BR approval',()=>{
 assert.match(ui,/const previewActionReady=displayed!=='generate'\|\|!\$\('brNextPreviewSave'\)\.disabled/);
 assert.match(ui,/const approvalActionReady=displayed!=='save'\|\|\(!readiness\.needsDecision&&!discoveryHasReviewBlockers\(\)\)/);
 assert.match(ui,/const ready=ATGVJiraWorkflowTables\.nextActionReady\(/);
 assert.match(ui,/nextButton\.disabled=!ready/);
 assert.match(ui,/nextButton\.dataset\.milestoneState=ready\?'ready':'blocked'/);
 assert.match(ui,/nextButton\.setAttribute\('aria-disabled',String\(!ready\)\)/);
 assert.match(ui,/Resolve Discovery Question 12 and outstanding BA findings before proceeding to approval/);
});
test('Next Step is blue only when ready and dark gray when blocked or disabled',()=>{
 assert.match(css,/#baStepNavigation #baNextStep\[data-milestone-state="ready"\]:not\(:disabled\)\{[\s\S]*?background:var\(--vscode-button-background,#0e639c\)!important/);
 assert.match(css,/#baStepNavigation #baNextStep\[data-milestone-state="blocked"\],[\s\S]*?#baStepNavigation #baNextStep:disabled\{[\s\S]*?background:#383b42!important/);
 assert.match(css,/#baStepNavigation #baNextStep:disabled\{[\s\S]*?opacity:1!important/);
});
