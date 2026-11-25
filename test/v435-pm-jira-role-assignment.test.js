'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pm=require('../src/pm-jira-assignment');
const ownership=require('../src/br-ownership');
const html=fs.readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const register={brs:[{id:'BR-001',status:'approved',needsRefresh:false,approvedContent:{title:'Example'}}],synced:{
 'BR-001':{key:'TC-100',kind:'Epic'},
 'BR-001/feature':{key:'TC-101',kind:'Feature'},
 'BR-001/feature/story':{key:'TC-102',kind:'Story'},
 'BR-001/feature/story/task':{key:'TC-103',kind:'Task'},
 'BR-001/feature/story/ROLE-UIUX':{key:'TC-104',kind:'Role',roleId:'uiux'},
 'BR-001/feature/story/ROLE-QA':{key:'TC-105',kind:'Role',roleId:'qa'},
 'BR-001/feature/story/ROLE-UAT':{key:'TC-106',kind:'Role',roleId:'uat'},
 'BR-001/feature/story/ROLE-DEVELOPER':{key:'TC-107',kind:'Role',roleId:'developer'}
}};
const items=[
 ['TC-100','Epic','',[]],['TC-101','Feature','TC-100',[]],
 ['TC-102','Story','TC-100',[]],['TC-103','Subtask','TC-102',[]],
 ['TC-104','Subtask','TC-102',['atgv-role-ux-designer']],
 ['TC-105','Subtask','TC-102',['atgv-role-qa-engineer']],
 ['TC-106','Subtask','TC-102',['atgv-role-uat-tester']],
 ['TC-107','Subtask','TC-102',['atgv-role-software-developer']]
].map(([key,type,parentKey,labels])=>({key,type,parentKey,labels,summary:'Work '+key,updated:'2026-11-19T09:00:00Z',assigneeId:''}));
test('filter groups BR, Epic, User Story, Task and Subtask correctly',()=>{
 for(const [t,want] of [['BR','br'],['Business Requirement','br'],['Epic','epic'],['Story','story'],['User Story','story'],['Task','task'],['Subtask','subtask'],['Sub Task','subtask'],['Bug','other']])assert.equal(pm.group(t),want);
 assert.match(html,/id="pmTypeFilter"/);
 for(const type of ['br','epic','story','task','subtask'])assert.match(html,new RegExp('<option value="'+type+'">'));
 assert.match(ui,/pmJiraIssueType\(item\.type\)===typeFilter/);
});
test('PM modal has editable Assignee after Reporter and no implicit developer takeover',()=>{
 assert.match(ui,/\['Reporter',value\.reporter\][\s\S]*?\['Assignee',value\.assignee\]/);
 assert.match(ui,/selectedRole==='project-manager'&&view==='work'/);
 assert.match(ui,/send\('pmJiraAssignableUsers'/);
 assert.match(ui,/send\('pmJiraSetAssignee'/);
 assert.match(host,/ASSIGN_ISSUES/);
 assert.match(host,/myWorkPresence\.locate/);
 assert.match(host,/user\/assignable\/search/);
 assert.match(host,/pmJiraAssignment\.change/);
});
test('role-specific Jira subtasks only match their own role',()=>{
 assert.equal(pm.roleForIssue(items[4],register),'UI/UX Designer');
 assert.equal(pm.roleForIssue(items[5],register),'QA Engineer');
 assert.equal(pm.roleForIssue(items[6],register),'UAT Tester');
 assert.equal(pm.roleForIssue(items[7],register),'Developer');
 assert.equal(pm.roleForIssue({key:'TC-108',type:'Subtask',labels:[],summary:'Other'},register),'');
 assert.equal(pm.roleForIssue({key:'TC-109',type:'Subtask',labels:['atgv-role-qa-engineer','atgv-role-ux-designer']},register),'');
});
test('candidates must have a verified matching role and valid account ID',()=>{
 const roster=[{id:'dev-1',name:'D',roles:['Developer']},{id:'ux-1',name:'U',roles:['UI/UX Designer']},{id:'qa-1',name:'Q',roles:['QA Engineer']},{id:'uat-1',name:'T',roles:['UAT Tester']},{id:'bad guy',roles:['Developer']}];
 assert.deepEqual(pm.rosterCandidates(roster,'Developer').map(x=>x.accountId),['dev-1']);
 assert.deepEqual(pm.rosterCandidates(roster,'UI/UX Designer').map(x=>x.accountId),['ux-1']);
 assert.deepEqual(pm.rosterCandidates(roster,'QA Engineer').map(x=>x.accountId),['qa-1']);
 assert.deepEqual(pm.rosterCandidates(roster,'UAT Tester').map(x=>x.accountId),['uat-1']);
 assert.deepEqual(pm.rosterCandidates(roster,'Solution Architect'),[]);
});
test('Epic Developer assignment excludes shared hierarchy and other role subtasks',()=>{
 const p=pm.plan({rootKey:'TC-100',projectKey:'TC',items,register});
 assert.deepEqual(p.targets.map(x=>x.key).sort(),['TC-103','TC-107']);
 assert.deepEqual(p.excluded.map(x=>x.key).sort(),['TC-100','TC-101','TC-102','TC-104','TC-105','TC-106']);
 const tree=ownership.developmentTree(register,'BR-001');
 assert.deepEqual(tree.entries.map(x=>x.key).sort(),['TC-100','TC-101','TC-102','TC-103','TC-107'].sort());
});
test('single Task and Subtask assignment uses verified Jira values; rolled back on failure',async()=>{
 let state=new Map(items.map(x=>[x.key,{updated:x.updated,owner:x.assigneeId}]));
 const calls=[],readIssue=async key=>{const x=state.get(key);return {key,fields:{updated:x.updated,project:{key:'TC'},assignee:x.owner?{accountId:x.owner}:null}};};
 const setAssignee=async(key,id)=>{calls.push({key,id});if(key==='TC-102')throw Error('simulated');state.get(key).owner=id||'';};
 const targets=[{key:'TC-100',updated:items[0].updated,owner:''},{key:'TC-102',updated:items[2].updated,owner:''}];
 await assert.rejects(pm.change({targets,projectKey:'TC',accountId:'dev-1',expectedUpdated:items[0].updated,readIssue,setAssignee}),/rolled back/);
 assert.equal(state.get('TC-100').owner,'');
 assert.equal(state.get('TC-102').owner,'');
});
test('stale Jira issue prevents all writes',async()=>{
 let changed=0;
 await assert.rejects(pm.change({
  targets:[{key:'TC-100',updated:'old',owner:''}],projectKey:'TC',accountId:'dev-1',expectedUpdated:'old',
  readIssue:async key=>({key,fields:{project:{key:'TC'},updated:'new',assignee:null}}),
  setAssignee:async()=>{changed++;}
 }),/updated after it was loaded/);
 assert.equal(changed,0);
});
