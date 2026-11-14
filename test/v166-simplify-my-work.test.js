'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('test/generated/extension-source.txt');
const ui=read('media/start.js');
const css=read('media/start.css');

test('No role creates or reveals a Selected step outputs disclosure',()=>{
 assert.doesNotMatch(ui,/Selected step outputs|roleProgressDetails|roleStepHome|roleStepReturnBefore/);
 assert.doesNotMatch(html,/Selected step outputs|roleProgressDetails/);
 assert.doesNotMatch(css,/#roleProgressDetails/);
 assert.match(ui,/const focused=roleId!=='business-analyst'&&roleId!=='software-developer'/);
 assert.match(css,/#workView\.role-progress-only > :not\(\.role-overview\):not\(#architectBootstrap\)\{display:none!important\}/);
 assert.match(ui,/if\(role\.id==='software-developer'\)\$\('roleStepFlow'\)\.scrollIntoView/);
});

test('Business Analyst My Work keeps progress and requirement entry while hiding obsolete sections',()=>{
 assert.match(ui,/work\.classList\.toggle\('role-ba-simplified',roleId==='business-analyst'\)/);
 for(const target of ['.handoff-panel','#deliveryWorkspace','.role-timeline','.role-insight-grid','#roleStepFlow','.work-notice']){
  assert.ok(css.includes('#workView.role-ba-simplified > '+target),target);
 }
 assert.match(html,/My Work · Progress Steps/);
 assert.match(ui,/function renderBAJiraInventory\(\)/);
 assert.match(ui,/function renderBAWorkDashboard\(\)/);
 assert.match(css,/#workView\.role-ba-simplified > #roleChecklist\{display:none!important\}/);
 assert.match(html,/id="baMyWorkDashboard"/);
 assert.match(html,/id="baJiraInventorySection"/);
});

test('Continue working callout is removed, while sidebar navigation remains',()=>{
 assert.doesNotMatch(html,/Continue working|id="overviewMyWork"/);
 assert.doesNotMatch(ui,/overviewMyWork/);
 assert.match(html,/data-nav="sdlc-roles"/);
});

test('Role step records remain, while duplicate Developer workbench is removed',()=>{
 for(const id of ['roleStepFlow','roleStepOutputs','roleStepReviewer','roleChecklist','roleJiraWork','roleJiraTable'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/id="developerWorkbench"|id="devJiraKey"|id="devTest"/);
 assert.match(ui,/setupDeveloperFocusedLayout\(role\.id==='software-developer'\)/);
});
