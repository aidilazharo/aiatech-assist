'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('all 18 Library roles have explicit verified next-action navigation in My Work',()=>{
 const roles=[...require('../src/sdlc-work').ROLES,...require('../src/sdlc-catalog').OPTIONAL_ROLES];
 const ui=read('media/atgv-mywork-ai.js');
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.equal(roles.length,18);
 for(const {id} of roles){
  assert.ok(ui.includes("'"+id+"':{target:"),'Missing client action for '+id);
  assert.ok(host.includes("'"+id+"':"),'Missing host action for '+id);
 }
 assert.match(ui,/actionButtons\(next\.action\);\s*displayResults\(true\);state\('thinking'\)/);
 assert.match(ui,/if\(requestId!==pending\|\|lastAnswered===requestId\)return/);
 assert.match(ui,/target==='discovery'/);
 assert.doesNotMatch(ui,/send\('(brJiraSync|pmJiraSetAssignee|architectApproveStack|uxPublishFrontend|delete|publish)'/);
});
test('Start screen suppresses project URL and preserves editable repository connection',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 assert.ok(html.includes('id="startupProjectRepository"'));
 assert.ok(html.includes('id="startupProjectRepositoryPreview" hidden'));
 assert.ok(!html.includes('https://github.com/aiamalaysia/my-fow-technology-app-techassists'));
 assert.match(js,/preview\.textContent='';preview\.hidden=true/);
});
test('role prompts instruct on project-scoped evidence and trusted next-action routing',()=>{
 const p=read('src/my-work-role-prompts.js');
 assert.match(p,/project-wide dependencies supplied as verified Jira, Confluence or RAG evidence/);
 assert.match(p,/the extension renders a validated navigation button separately/);
});
