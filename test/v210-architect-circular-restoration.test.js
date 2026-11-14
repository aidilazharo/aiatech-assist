
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const client=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('Solution Architect heading is restored above progress circles',()=>{
 assert.match(host,/<h1 id="workTitle">Business Analyst<\/h1>/);
 assert.match(client,/\$\('workTitle'\)\.textContent=visibleRoleLabel\(role\)/);
 assert.match(client,/work\.classList\.toggle\('role-solution-architect',architect\)/);
 assert.match(css,/#workView\.role-progress-only > \.view-heading\.work-head\{display:flex!important\}/);
 assert.match(css,/#workView\.role-progress-only > \.page-kicker\{display:block!important\}/);
});
test('Circular progress steps are accessible for Solution Architect and other roles',()=>{
 assert.match(host,/id="roleStepButtons" class="role-circle-steps"/);
 assert.match(client,/legacySteps.setAttribute\('aria-hidden','false'\)/);
 assert.match(css,/#workView \.role-legacy-hidden\{display:block!important/);
 assert.match(client,/renderRoleStepFlow\(role\)/);
 assert.doesNotMatch(host,/id="processActivityRows"|Process Progress &amp; Messages/);
});
test('Business Analyst, Developer and Project Manager all retain circular progress, without process monitor',()=>{
 assert.match(client,/work\.classList\.toggle\('role-progress-only',focused\)/);
 assert.match(css,/#workView\.role-pm-dashboard > \.role-overview\{display:block!important/);
 assert.match(css,/#workView\.role-ba-simplified > \.role-overview,/);
 assert.match(host,/id="roleStepStatus"/);
});
