'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const host=read('test/generated/extension-source.txt'),ui=read('media/start.js'),css=read('media/start.css');
const {resolve}=require('../src/architect-repository');
const context=map=>({get:key=>map[key]});
test('Configured developer checkout works without duplicate bootstrap selection',async()=>{
 const git={repository:async folder=>({root:'/actual'+folder})};
 assert.equal(await resolve(context({'atgvAssist.localRepo.alpha':'/a'}),'alpha',git),'/actual/a');
 assert.equal(await resolve(context({'atgvAssist.bootstrapRepo.alpha':'/b','atgvAssist.localRepo.alpha':'/a'}),'alpha',git),'/actual/b');
});
test('Stale bootstrap path falls back to local checkout, but refuses invalid or remote-only paths',async()=>{
 const git={repository:async folder=>{if(folder==='/stale')throw Error('folder is gone');if(folder==='/bad')throw Error('not Git');return {root:folder};}};
 assert.equal(await resolve(context({'atgvAssist.bootstrapRepo.alpha':'/stale','atgvAssist.localRepo.alpha':'/ok'}),'alpha',git),'/ok');
 await assert.rejects(()=>resolve(context({'atgvAssist.localRepo.alpha':'/bad'}),'alpha',git),/Re-select the local checkout/);
 await assert.rejects(()=>resolve(context({}),'alpha',git),/no local checkout is selected/);
});
test('Solution Architect test and approval share the same local repo resolution and keep consent',()=>{
 const testBlock=host.slice(host.indexOf("case 'architectTestStack':"),host.indexOf("case 'architectApproveStack':"));
 const approvalBlock=host.slice(host.indexOf("case 'architectApproveStack':"),host.indexOf("case 'architectRecommend':"));
 assert.match(testBlock,/architectRepository\.resolve/);
 assert.match(testBlock,/inspection\.repo\.clean/);
 assert.match(testBlock,/uiWarning/);
 assert.match(approvalBlock,/architectRepository\.resolve/);
 assert.match(approvalBlock,/gate\.approval/);
});
test('Business Analyst shows restored BR summary while legacy role workflow is hidden',()=>{
 assert.match(host,/id="baMyWorkDashboard"/);
 assert.match(ui,/function renderBAWorkDashboard\(\)/);
 assert.match(host,/id="baJiraInventorySection"/);
 assert.match(css,/#workView #roleStepFlow\{display:none!important\}/);
 assert.match(css,/#workView\.role-ba-simplified > #roleChecklist\{display:none!important\}/);
 assert.doesNotMatch(host,/>Role Workflow</);
 assert.doesNotMatch(host,/id="baContinueToJira"|id="brEditJira"/);
 assert.doesNotMatch(ui,/baContinueToJira|brEditJira/);
 assert.match(host,/id="baNextStep"/);
});
