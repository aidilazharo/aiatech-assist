'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const ext=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const js=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('Developer uses one Jira DataTable, without the old three-step workbench',()=>{
 assert.match(ext,/id="roleJiraWork"/);
 assert.match(ext,/id="roleJiraTable"/);
 for(const id of ['developerWorkbench','devJiraCard','devCodeCard','devTestingCard','workGithub'])assert.doesNotMatch(ext,new RegExp('id="'+id+'"'));
 assert.match(js,/ATGVDataTables\.mount\(root,rows/);
});
test('Jira assignment and architect approval backend routes are preserved',()=>{
 for(const id of ['roleJiraTable','roleJiraRefresh','architectSaveStack','architectApproveStack'])assert.equal((ext.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 for(const command of ['roleJiraAssign','roleJiraIssues','architectSaveStack','architectTestStack','architectApproveStack','devExecute'])assert.match(ext,new RegExp("case '"+command+"':"));
 assert.match(js,/send\('roleJiraAssign'/);
});
test('Developer role no longer mounts a duplicate workbench',()=>{
 assert.match(js,/function setupDeveloperFocusedLayout\(\)/);
 assert.doesNotMatch(js,/workbench\.after\(archive\)/);
 assert.match(js,/setupDeveloperFocusedLayout\(role\.id==='software-developer'\)/);
});
test('Jira workbench lists the authenticated user’s live assigned tasks',()=>{
 assert.match(ext,/assignee = currentUser\(\)/);
 assert.match(js,/function renderAssignedJiraTasks/);
 assert.match(js,/tasks\.length&&!tasks\.some/);
 assert.match(js,/send\('devLoadJira',\{key:tasks\[0\]\.key\}\)/);
 assert.doesNotMatch(ext,/id="devAssignJira"/);
});
test('Solution Designs use ordinary direct action buttons instead of overflow menus',()=>{
 assert.match(js,/actions\.append\(regen\)/);
 assert.match(js,/tools\.append\(remove\)/);
 assert.doesNotMatch(js,/secondary\.append\(secondarySummary,regen\)/);
 assert.doesNotMatch(js,/menu\.append\(atgvMoreActionsSummary\(label\+' revision '\+item\.number\),remove\)/);
 assert.match(js,/deleteDesign\(kind,item\)/);
});
