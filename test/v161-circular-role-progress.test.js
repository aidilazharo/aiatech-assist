'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const client=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const plans=require('../src/role-step-engine');
test('circle steps are at the top of My Work with no duplicate progress displays',()=>{
 const view=host.slice(host.indexOf('<main id="workView"'),host.indexOf('<main id="discoveryView"'));
 const head=view.indexOf('id="workTitle"'),circles=view.indexOf('id="roleStepButtons"'),delivery=view.indexOf('id="deliveryWorkspace"');
 assert.ok(head>=0&&circles>head&&delivery>circles,'the progress circles appear above My Work');
 assert.equal((host.match(/id="roleStepButtons"/g)||[]).length,1);
 assert.equal((host.match(/id="roleStepStatus"/g)||[]).length,1);
 assert.match(view,/id="roleStepButtons" class="role-circle-steps"/);
 assert.match(view,/id="roleStepProgress"/);
 assert.match(view,/class="progress-track hidden"/);
});
test('circle UI is status-aware, keyboard accessible, selectable and scoped',()=>{
 for(const token of ['role-circle-step-marker','role-circle-step-title','role-circle-step-count','aria-pressed','aria-label','button.dataset.status=step.status','scrollIntoView','roleStepsForScope()','selectedRoleStepScope'])assert.ok(client.includes(token),token);
 for(const token of ['role-circle-step[data-status="completed"]','role-circle-step[data-status="blocked"]','role-circle-step[data-status="review"]','role-circle-step.selected','role-circle-step:focus-visible','overflow-x:auto'])assert.ok(css.includes(token),token);
 assert.match(client,/button\.addEventListener\('click',\(\)=>\{/);
 assert.match(client,/button\.title=step\.title/);
});
test('each standard and optional SDLC role has configured step plan',()=>{
 const expected=['business-analyst','product-owner','project-manager','solution-architect','ux-designer','software-developer','qa-engineer','uat-tester','release-manager','operations-support','security-engineer','data-engineer','scrum-master','technical-writer','technical-lead','business-owner','ai-ml-engineer','compliance-officer'];
 for(const id of expected){const plan=plans.getPlan({id,tasks:[]});assert.ok(plan.length>=3&&plan.length<=4,id);for(const step of plan)assert.ok(step.title&&step.requiredCount>0,id);}
});
