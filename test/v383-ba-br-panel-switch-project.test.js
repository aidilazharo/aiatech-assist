'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const base=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(base,'media','start.js'),'utf8');
const html=fs.readFileSync(path.join(base,'src','lib','webview','dashboard-html.js'),'utf8');

test('BR-panel Jira-only Epic cards keep View Jira but no Switch Project action',()=>{
 const begin=ui.indexOf('function renderBAJiraBackedEpics(){');
 const end=ui.indexOf('function renderBACompletedRecords(){',begin);
 assert.ok(begin>=0&&end>begin,'expected Business Analyst completed BR renderer');
 const section=ui.slice(begin,end);
 assert.match(section,/Unlinked to local BR/);
 assert.match(section,/openJiraIssueModal\(item\.key\)/);
 assert.match(section,/card\.append\(heading\)/);
 assert.match(section,/body\.append\(info\);card\.append\(body\);root\.append\(card\);/);
 assert.match(section,/className='ba-completed-br-section ba-jira-only-br-section'/);
 assert.match(section,/answers\.disabled=true/);
 assert.match(section,/View Jira · /);
 assert.doesNotMatch(section,/Switch Project|switchProject|navigate\('projects'\)/);
});

test('project switching stays available in the main navigation',()=>{
 assert.match(html,/id="sidebarSwitchProject"/);
 assert.match(ui,/\$\('sidebarSwitchProject'\)\.addEventListener\('click',\(\)=>navigate\('projects'\)\)/);
});
