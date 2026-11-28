'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const screen=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('BR status is plain color text and separate ownership buttons are absent',()=>{
 const developer=screen.slice(screen.indexOf('<section id="developerTaskDashboard"'),screen.indexOf('<div id="developerManualTickets"'));
 assert.match(developer,/id="developerBrChangeBadge"/);
 assert.doesNotMatch(developer,/id="developerBrAssign"|id="developerBrUnassign"/);
 assert.match(ui,/new:'New',updated:'Updated',cancelled:'Cancelled'/);
 assert.doesNotMatch(ui,/🟢 New|🟠 Updated|🔴 Cancelled|● New/);
 assert.match(css,/developer-br-change-badge\{padding:0;border:0!important;background:transparent!important/);
});
test('selected BR defaults to History and only the tabs and delivery area hide without selection',()=>{
 assert.match(ui,/developerBrTab='logs';/);
 assert.match(ui,/developerBrTab='logs';renderDeveloperBrChoices\(\)/);
 assert.match(ui,/developerBrWorkArea'\)\.classList\.toggle\('hidden',!hasSelectedBr\)/);
 assert.match(ui,/developerBrDetails'\)\.classList\.remove\('hidden'\)/);
 assert.match(css,/developer-br-details\.hidden\{display:none!important/);
});
test('Developer Jira table offers scoped assign/unassign and retains the confirmation on backend',()=>{
 assert.match(ui,/const developer=selectedRole==='software-developer',designer=selectedRole==='ux-designer'/);
 assert.match(ui,/btn.textContent=!item.brRoot\?'View Only':item.mine\?'Release My Role Tasks'/);
 assert.match(ui,/send\('developerBrAssignment',\{brId,key:item.key,action:item.mine\?'unassign':'assign',expectedUpdated:item.updated\}\)/);
 assert.match(ui,/send\('roleJiraUnassign',\{key:item.key,brId:item.brId,expectedUpdated:item.updated,roleId:selectedRole\}\)/);
 assert.match(screen,/Unassign & Delete Work/);
 assert.match(screen,/developerBRCleanup\.removeLocalDevelopment/);
});
