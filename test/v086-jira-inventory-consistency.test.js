'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {roleName,projectRows}=require('../media/ba-jira-epics');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Jira role labels resolve independently from assignee, and missing or conflicting labels remain explicit',()=>{
 assert.equal(roleName({labels:['atgv-role-software-developer'],assignee:'Unassigned'}),'Developer');
 assert.equal(roleName({labels:['atgv-role-qa-engineer']}),'QA Engineer');
 assert.equal(roleName({labels:['atgv-role-project-manager']}),'Project Manager');
 assert.equal(roleName({summary:'Development — Example',assignee:'Developer'}),'Not specified');
 assert.equal(roleName({labels:['atgv-role-qa-engineer','atgv-role-uat-tester']}),'Needs role review');
 assert.equal(roleName({labels:['atgv-role-unknown']}),'Needs role review');
});
test('PM rows associate Jira-only BR descendants by actual parent links without granting local ownership',()=>{
 const rows=projectRows([{key:'TC-1',type:'Epic',summary:'BR-004: Requirement'},{key:'TC-2',type:'Story',parentKey:'TC-1'},{key:'TC-3',type:'Subtask',parentKey:'TC-2',labels:['atgv-role-uat-tester']},{key:'TC-4',type:'Task',summary:'BR-004 unrelated'}],[],'TC');
 assert.equal(rows[2].brLabel,'BR-004');assert.equal(rows[2].roleName,'UAT Tester');
 assert.equal(rows[2]._brRefs[0].kind,'jira');assert.equal(rows[2]._brRefs[0].hasAnswers,false);
 assert.equal(rows[3].brLabel,'');
});
test('BA and PM share core columns and modal tooltip escapes the scrolling panel',()=>{
 const ui=read('media/start.js'),css=read('media/start.css'),html=read('src/lib/webview/dashboard-html.js');
 const ba=ui.slice(ui.indexOf('baJiraTableInstance=ATGVDataTables.mount'),ui.indexOf('// Project Manager My Work shares'));
 const pm=ui.slice(ui.indexOf('pmJiraTableInstance=ATGVDataTables.mount'),ui.indexOf('function ensurePMJiraInventory'));
 for(const key of ['brLabel','key','type','summary','roleName','assignee','priority','status','dueDate','updated','brOwner','creator','created']){assert.ok(ba.includes("key:'"+key+"'"),key);assert.ok(pm.includes("key:'"+key+"'"),key);}
 for(const id of ['baJiraRoleFilter','pmRoleFilter','pmBrFilter'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/\.ba-modal-card-heading > \.ba-completed-br-title\{display:none\}/);
 assert.match(ui,/document\.body\.append\(node\);brTooltipNode=node/);
 assert.match(css,/\.atgv-br-portal-tooltip\{position:fixed;z-index:2147483647/);
});
