'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pm=require('../src/pm-jira-assignment');
const owner=require('../src/br-ownership');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
const register={brs:[{id:'BR-001',status:'approved',approvedContent:{title:'Workflow'}}],synced:{
 'BR-001':{key:'TC-100',kind:'Epic'},
 'BR-001/F-1':{key:'TC-101',kind:'Feature'},
 'BR-001/F-1/S-1':{key:'TC-102',kind:'Story'},
 'BR-001/F-1/S-1/T-1':{key:'TC-103',kind:'Task'},
 'BR-001/F-1/S-1/ROLE-QA':{key:'TC-104',kind:'Role',roleId:'qa'},
 'BR-001/F-1/S-1/ROLE-UIUX':{key:'TC-105',kind:'Role',roleId:'uiux'}
},roleTaskMappings:{
 'BR-001/F-1/S-1/ROLE-UAT':{key:'TC-106',roleId:'uat',roleLabel:'atgv-role-uat-tester'},
 'BR-001/F-1/S-1/ROLE-DEVELOPER':{key:'TC-107',roleId:'developer',roleLabel:'atgv-role-software-developer'}
}};
const items=[
 {key:'TC-100',type:'Epic',summary:'GATE',updated:'1'},
 {key:'TC-101',type:'Feature',parentKey:'TC-100',summary:'Workflow',updated:'1'},
 {key:'TC-102',type:'Story',parentKey:'TC-101',summary:'Approval',updated:'1'},
 {key:'TC-103',type:'Task',parentKey:'TC-102',summary:'Implement approvals',updated:'1'},
 {key:'TC-104',type:'Subtask',parentKey:'TC-102',summary:'QA Verification — Approval',labels:['atgv-role-qa-engineer'],updated:'1'},
 {key:'TC-105',type:'Subtask',parentKey:'TC-102',summary:'UI/UX Design — Approval',labels:['atgv-role-ux-designer'],updated:'1'},
 {key:'TC-106',type:'Subtask',parentKey:'TC-102',summary:'User Acceptance Testing — Approval',labels:['atgv-role-uat-tester'],updated:'1'},
 {key:'TC-107',type:'Subtask',parentKey:'TC-102',summary:'Development — Approval',labels:['atgv-role-software-developer'],updated:'1'},
 {key:'TC-108',type:'Subtask',parentKey:'TC-102',summary:'Undeclared Specialist Work',updated:'1'}
];
test('Type filter supports BR, Epic, User Stories, Task, Subtask',()=>{
 assert.equal(pm.group('BR'),'br');assert.equal(pm.group('Epic'),'epic');
 assert.equal(pm.group('User Story'),'story');assert.equal(pm.group('Subtask'),'subtask');
 for(const type of ['br','epic','story','task','subtask'])assert.match(html,new RegExp('value="'+type+'"'));
 assert.match(ui,/id==='pmJiraFilter'\?'input':'change'/);
 assert.match(ui,/pmJiraIssueType\(item\.type\)/);
 assert.match(ui,/'pmTypeFilter'/);
});
test('each Task and Subtask uses the specific role, including registry mappings',()=>{
 assert.equal(pm.roleForIssue(items[3],register),'Developer');
 assert.equal(pm.roleForIssue(items[4],register),'QA Engineer');
 assert.equal(pm.roleForIssue(items[5],register),'UI/UX Designer');
 assert.equal(pm.roleForIssue(items[6],register),'UAT Tester');
 assert.equal(pm.roleForIssue(items[7],register),'Developer');
 assert.equal(pm.roleForIssue(items[8],register),'');
 assert.equal(pm.roleForIssue({...items[7],labels:['atgv-role-qa-engineer','atgv-role-software-developer']},register),'');
});
test('Role-matched choices never assign a user merely because names coincide',()=>{
 const rows=[
  {id:'jira-A',name:'Alice',roles:['Developer']},
  {id:'jira-B',name:'Alice',roles:['UI/UX Designer']},
  {id:'jira-C',name:'Cathy',roles:['QA Engineer','Developer']},
  {id:'jira-D',name:'David',roles:['Project Manager']},
 ];
 assert.deepEqual(pm.rosterCandidates(rows,'Developer').map(x=>x.accountId),['jira-A','jira-C']);
 assert.deepEqual(pm.rosterCandidates(rows,'UI/UX Designer').map(x=>x.accountId),['jira-B']);
 assert.deepEqual(pm.rosterCandidates(rows,'UAT Tester'),[]);
});
test('Epic has independent role scopes; shared parents and unknown subtasks remain unchanged',()=>{
 const plan=pm.plan({rootKey:'TC-100',items,projectKey:'TC',register});
 assert.deepEqual(plan.targets.map(x=>x.key),['TC-103','TC-107']);
 const groups=pm.rolePlans({rootKey:'TC-100',items,projectKey:'TC',register}).scopes;
 assert.deepEqual(groups.find(x=>x.roleId==='ux-designer').targets.map(x=>x.key),['TC-105']);
 assert.deepEqual(groups.find(x=>x.roleId==='qa-engineer').targets.map(x=>x.key),['TC-104']);
 assert.deepEqual(groups.find(x=>x.roleId==='uat-tester').targets.map(x=>x.key),['TC-106']);
 assert.deepEqual(plan.excluded.map(x=>x.key).sort(),['TC-100','TC-101','TC-102','TC-104','TC-105','TC-106','TC-108']);
 assert.equal(plan.count,2);
 assert.equal(plan.excludedCount,7);
 assert.deepEqual(owner.developmentTree(register,'BR-001').entries.map(x=>x.key).sort(),
  ['TC-100','TC-101','TC-102','TC-103','TC-107']);
});
test('Update permission guard and issue revision failures must not mutate Jira',async()=>{
 assert.equal(pm.canAssign({permissions:{ASSIGN_ISSUES:{havePermission:true}}}),true);
 assert.equal(pm.canAssign({permissions:{ASSIGN_ISSUES:{havePermission:false}}}),false);
 const current=new Map(items.map(item=>[item.key,{updated:item.updated,owner:''}]));
 const calls=[];
 const readIssue=async key=>({key,fields:{project:{key:'TC'},issuetype:{name:items.find(x=>x.key===key).type},labels:items.find(x=>x.key===key).labels||[],parent:{key:items.find(x=>x.key===key).parentKey},updated:current.get(key).updated,assignee:current.get(key).owner?{accountId:current.get(key).owner}:null}});
 const setAssignee=async(key,assignee)=>{calls.push(key);current.get(key).owner=assignee||'';current.get(key).updated=String(Number(current.get(key).updated)+1);};
 const plan=pm.plan({rootKey:'TC-100',items,projectKey:'TC',register});
 current.get('TC-103').updated='2';
 await assert.rejects(pm.change({targets:plan.targets,projectKey:'TC',accountId:'jira-A',expectedUpdated:'1',readIssue,setAssignee}),/updated after/);
 assert.equal(calls.length,0);
 current.get('TC-103').updated='1';
 const done=await pm.change({targets:plan.targets,projectKey:'TC',accountId:'jira-A',expectedUpdated:'1',readIssue,setAssignee});
 assert.equal(done.changed,2);
 assert.equal(current.get('TC-100').owner,'');
 assert.equal(current.get('TC-102').owner,'');
 assert.deepEqual(calls.sort(),plan.targets.map(x=>x.key).sort());
 assert.equal(current.get('TC-104').owner,'');
});
test('Single specialist subtask can be assigned without altering other roles',async()=>{
 const issue=items[4];
 let state={updated:'1',owner:''},writes=0;
 const done=await pm.change({targets:[{key:issue.key,updated:'1',owner:'',type:issue.type}],projectKey:'TC',accountId:'jira-C',expectedUpdated:'1',
  readIssue:async()=>({key:issue.key,fields:{project:{key:'TC'},updated:state.updated,assignee:state.owner?{accountId:state.owner}:null}}),
  setAssignee:async(_,who)=>{state={owner:who,updated:'2'};writes++;}});
 assert.equal(done.changed,1);assert.equal(writes,1);
});
test('PM Assignee card, backend and complete roster requirement are wired',()=>{
 assert.match(ui,/label==='Assignee'&&selectedRole==='project-manager'/);
 assert.match(ui,/send\('pmJiraAssignableUsers'/);
 assert.match(ui,/send\('pmJiraSetAssignee'/);
 assert.match(host,/case 'pmJiraAssignableUsers':/);
 assert.match(host,/case 'pmJiraSetAssignee':/);
 assert.match(host,/pmJiraAssignment\.canAssign\(permissions\)/);
 assert.match(host,/myWorkPresence\.readRoster\(config,token,projectKey\)/);
 assert.match(host,/let roster=found\.rows/);
 assert.match(host,/user\/assignable\/search\?issueKey=/);
 assert.match(host,/scope\?\.targets/);
});

test('Explicit role Story is assigned with its own role only; shared Story stays unassigned',()=>{
 const reg={...register,synced:{...register.synced,'BR-001/F-1/S-2':{key:'TC-109',kind:'Story',roleId:'uiux'}}};
 const rows=[...items,{key:'TC-109',type:'Story',parentKey:'TC-101',labels:['atgv-role-ux-designer'],updated:'1'}];
 const plan=pm.plan({rootKey:'TC-100',items:rows,projectKey:'TC',register:reg,roleId:'ux-designer'});
 assert.deepEqual(plan.targets.map(x=>x.key),['TC-105','TC-109']);
 assert.ok(!plan.targets.some(x=>x.key==='TC-102'));
});

test('Individual role classification agrees with Epic role scope; no role guessed from title',()=>{
 const reg={...register,synced:{...register.synced,'BR-001/F-1/S-2':{key:'TC-109',kind:'Story',roleId:'sa'}}};
 const story={key:'TC-109',type:'Story',parentKey:'TC-101',labels:['atgv-role-solution-architect'],updated:'1'};
 assert.equal(pm.roleForIssue(story,reg),'Solution Architect');
 assert.equal(pm.roleForIssue({...story,labels:['atgv-role-ux-designer']},reg),'');
 assert.equal(pm.roleForIssue({key:'TC-110',type:'Task',summary:'UI/UX Design — unknown'},reg),'');
 assert.equal(pm.roleForIssue(items[2],reg),'');
 assert.deepEqual(pm.plan({rootKey:'TC-100',items:[...items,story],projectKey:'TC',register:reg,roleId:'solution-architect'}).targets.map(x=>x.key),['TC-109']);
});
