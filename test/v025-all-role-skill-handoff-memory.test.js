'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {ROLES}=require('../src/my-work-role-prompts');
const router=require('../src/my-work-role-skill-router');
const examples={
 'business-analyst':'Create business requirements document',
 'solution-architect':'Create architecture diagram',
 'ux-designer':'Create UI mockup',
 'software-developer':'Build source code',
 'project-manager':'Create project plan',
 'qa-engineer':'Generate test cases',
 'uat-tester':'Create UAT test script',
 'product-owner':'Draft product roadmap',
 'scrum-master':'Create sprint retrospective',
 'security-engineer':'Design threat model',
 'data-engineer':'Create database schema',
 'technical-writer':'Write user guide',
 'operations-support':'Create incident runbook',
 'release-manager':'Create deployment pipeline',
 'technical-lead':'Write engineering standards document',
 'business-owner':'Draft business approval memo',
 'ai-ml-engineer':'Build machine learning model',
 'compliance-officer':'Create compliance audit checklist'
};
test('all 18 role expertise definitions are recorded in source-only agent/harness memory',t=>{
 if(!fs.existsSync(path.join(root,'.memory'))&&!fs.existsSync(path.join(root,'.git'))){t.skip('Source export intentionally excludes .memory; run in Git checkout for policy validation.');return;}
 const manifest=JSON.parse(read('.memory/manifest.json'));
 const category=manifest.categories.find(x=>x.id==='role-boundaries');
 assert.equal(category?.path,'.memory/role-boundaries.json');
 const memory=JSON.parse(read(category.path));
 assert.equal(memory.schema,1);
 assert.equal(memory.status,'accepted');
 assert.deepEqual(Object.keys(memory.roles).sort(),Object.keys(ROLES).sort());
 assert.deepEqual(Object.keys(examples).sort(),Object.keys(ROLES).sort());
 assert.equal(memory.policy.ui.includes('Never auto-switch'),true);
 assert.match(read('AGENTS.md'),/role-boundaries\.json/);
 assert.match(read('.gitattributes'),/^\.memory export-ignore$/m);
});
test('explicit cross-role deliverable creation routes to the correct expert for every role',()=>{
 for(const [roleId,message] of Object.entries(examples)){
  const current=roleId==='project-manager'?'ux-designer':'project-manager';
  const handoff=router.route(current,message);
  assert.equal(handoff?.targetRoleId,roleId,
   'Expected '+current+' to hand off "'+message+'" to '+roleId);
  assert.match(router.response(handoff),/switch to the/);
  assert.equal(router.route(roleId,message),null,
   'Must not redirect an expert for their own deliverable: '+roleId);
 }
 assert.equal(router.DOMAIN.length,Object.keys(ROLES).length);
});
test('cross-role informational review, ambiguous requests and role identity questions stay in the active role',()=>{
 for(const request of [
  'Review UX design dependencies for project delivery',
  'What are the UI mockup milestones?',
  'Review the architecture diagram before approval',
  'Create a UI mockup and project plan',
  'Who is responsible for the wireframe?',
  'Explain the acceptance criteria and project risks',
  'Who are you?'
 ])assert.equal(router.route('project-manager',request),null,request);
 assert.equal(router.route('project-manager','Can you create UI mockup?')?.targetRoleId,'ux-designer');
});
test('cross-role switch requires a user-clickable event, enabled role verification and retains the request draft',()=>{
 const ui=read('media/atgv-mywork-wave-chat.js');
 const host=read('src/lib/runtime/extension-runtime.js');
 const nav=read('media/start.js');
 assert.match(host,/myWorkRoleSkillRouter\.route\(roleId,msg\.message\)/);
 assert.match(host,/getRoleSettings\(registry,projectId\)/);
 assert.match(host,/suggestedRoleEnabled:allowed/);
 assert.match(ui,/atgv:mywork-switch-role/);
 assert.match(ui,/action\.addEventListener\('click'/);
 assert.match(ui,/Open Role Settings for /);
 assert.match(ui,/saveHandoffDraft/);
 assert.match(nav,/window\.addEventListener\('atgv:mywork-switch-role'/);
 assert.match(nav,/visibleRoles\(\)\.some\(item=>item\.id===target\)/);
 assert.match(nav,/roleSettings\.roles/);
 assert.match(ui,/const handoffRequest=submittedText/);
 assert.match(nav,/navigate\('project-settings'\)/);
 assert.match(nav,/navigate\(target\)/);
 assert.match(nav,/saveHandoffDraft\?\./);
 assert.doesNotMatch(nav,/window\.addEventListener\('atgv:mywork-switch-role'[\s\S]{0,1000}send\('roleStepAction'/);
});
test('the role switch button remains intact while the assistant is typewriting',()=>{
 const code=read('media/atgv-mywork-wave-chat.js');
 assert.match(code,/node\.appendChild\(body\)/);
 assert.match(code,/typewriter\(body,text\)/);
 assert.match(code,/reply\.append\(action\)/);
 assert.doesNotMatch(read('src/lib/webview/dashboard-html.js'),/id="atgvMyWorkTodayList"/);
});
