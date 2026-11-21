'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const css=read('media/atgv-mywork-ai.css');
const ui=read('media/atgv-mywork-ai.js');
const start=read('media/start.js');
const host=read('src/lib/runtime/extension-runtime.js');

test('one shared My Work AI panel appears before BA and other role content',()=>{
 const startOfWork=html.indexOf('<main id="workView"');
 const panel=html.indexOf('id="atgvMyWorkAi"',startOfWork);
 const firstRoleSection=html.indexOf('id="baMyWorkDashboard"',startOfWork);
 assert.ok(startOfWork>0&&panel>startOfWork&&firstRoleSection>panel);
 assert.equal(html.match(/id="atgvMyWorkAi"/g)?.length,1);
 assert.match(html,/atgv-mywork-ai\\.css/);
 assert.match(html,/atgv-mywork-ai\\.js/);
});
test('AI has no user chat composer and is readable as plain status text',()=>{
 const section=html.slice(html.indexOf('id="atgvMyWorkAi"'),html.indexOf('id="baMyWorkDashboard"'));
 assert.doesNotMatch(section,/<textarea|<input|contenteditable/);
 assert.match(section,/aria-live="polite"/);
 assert.match(section,/id="atgvMyWorkAiActions"/);
});
test('role variants use black unbordered panel and white text',()=>{
 assert.match(css,/#workView\\.role-progress-only > #atgvMyWorkAi\\.atgv-mywork-ai/);
 assert.match(css,/background:#000!important;color:#fff!important/);
 assert.match(css,/border:0!important/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('animation is idle blue, thinking blue-green, then green success and disappear',()=>{
 for(const item of ['idle','thinking','success','complete'])assert.match(ui,new RegExp(item));
 assert.match(css,/data-state="thinking"/);
 assert.match(css,/data-state="success"/);
 assert.match(css,/data-state="complete"/);
 assert.match(ui,/1250/);
});
test('AI suggestions only navigate or refresh the read-only recommendation',()=>{
 assert.match(start,/window\\.ATGVMyWorkAI\\?\\.update\\(/);
 assert.match(host,/case 'roleAiReview'/);
 assert.match(host,/requireOpened\\(\\)/);
 assert.match(host,/activeAiTarget\\(\\)/);
 assert.match(ui,/send\\('roleAiReview'/);
 assert.doesNotMatch(ui,/send\\('(?:brJiraSync|pmJiraSetAssignee|architectApproveStack|uxPublishFrontend|delete|publish)'/);
 assert.match(host,/The AI cannot invoke commands/);
});
