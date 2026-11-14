'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const js=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const roleIds=['business-analyst','project-manager','solution-architect','software-developer','qa-engineer','product-owner','scrum-master','ux-designer','security-engineer','data-engineer','uat-tester','release-manager','technical-writer','operations-support','business-owner','ai-ml-engineer','compliance-officer'];
test('all standard and optional roles have distinct subtle dark-menu background colors',()=>{
 const colors=[...js.matchAll(/'([a-z-]+)':\['(#[0-9a-f]{6})','(#[0-9a-f]{6})'\]/g)];
 for(const id of roleIds)assert.ok(colors.some(row=>row[1]===id),'Missing palette entry '+id);
 const backgrounds=colors.filter(row=>roleIds.includes(row[1])).map(row=>row[2]);
 assert.equal(new Set(backgrounds).size,roleIds.length);
 assert.match(js,/applyRoleNavigationTheme\(selectedRole\)/);
 assert.match(css,/\.sidebar\{background:color-mix\(in srgb,var\(--role-pane-bg/);
 assert.match(css,/\.sidebar \.role-picker-trigger\{border-color:var\(--role-nav-accent/);
});
test('operational messages go to process monitor; actionable notifications and brand divider remain',()=>{
 assert.match(css,/\.app-header\{border-bottom:3px solid #D31145\}/);
 for(const tone of ['error','warning','success'])assert.match(css,new RegExp('\\.top-notification\\.'+tone));
 assert.match(js,/function status\(message,error=false,\{persistent=false\}=\{\}\)/);
 assert.match(js,/notifyTop\(statusText/);
 assert.match(js,/processActivityUpsert\(id,/);
 assert.match(html,/id="status" class="status hidden"/);
 assert.doesNotMatch(js,/status\(m\.message,!!m\.error\);notifyTop\(m\.message/);
});
test('Settings launches the existing atomic bulk-role date editor and JSON editor is removed',()=>{
 assert.equal((html.match(/id="openPlanningTimelineModal"/g)||[]).length,1);
 assert.match(html,/id="settingsRoleScheduleHeading"/);
 assert.match(js,/openPlanningTimelineModal'\)\.addEventListener\('click',openBulkTimelineModal\)/);
 assert.match(js,/saveBulkRoleTimelines/);
 assert.doesNotMatch(html,/id="openTimelineSource"/);
 assert.doesNotMatch(js,/openTimelineSource'\)\.addEventListener/);
 assert.doesNotMatch(html,/case 'openTimelineSource'/);
});
