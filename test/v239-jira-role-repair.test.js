'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const role=require('../src/jira-role-task-repair');
const host=require('node:fs').readFileSync(require('node:path').join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=require('node:fs').readFileSync(require('node:path').join(__dirname,'../media/start.js'),'utf8');
const feature={id:'F-1',title:'User Portal',description:'Customer dashboard',stories:[
 {id:'S-1',title:'Customer dashboard',description:'Show status and search filter'},
 {id:'S-2',title:'Data API',description:'Backend API endpoint for data persistence'}]};
function fixture(){return {brs:[{id:'BR-005',status:'approved',approvedContent:{title:'Portal',features:[feature]}}],synced:{'BR-005':{key:'TC-390'},'BR-005/F-1':{key:'TC-391'},'BR-005/F-1/S-1':{key:'TC-392'},'BR-005/F-1/S-2':{key:'TC-393'}}};}
test('role subtasks trace to approved BR Story and existing Feature, without nesting inside Jira subtasks',()=>{
 const items=role.plan(fixture(),'BR-005');
 assert(items.some(x=>x.roleId==='uiux'&&x.storyKey==='TC-392'&&x.parentKey==='TC-391'));
 assert(!items.some(x=>x.roleId==='uiux'&&x.storyKey==='TC-393'));
 assert(items.some(x=>x.roleId==='developer'&&x.storyKey==='TC-393'));
 assert(items.some(x=>x.roleId==='qa'&&x.storyKey==='TC-393'));
 assert(items.every(x=>x.path.includes('/ROLE-')));
 assert.equal(new Set(items.map(x=>x.path)).size,items.length);
 assert(items.some(x=>x.description.includes('Jira parent Story: TC-392')));
});
test('preserves trusted published mapping from historical completed BR cycle',()=>{
 const reg={brs:[],synced:{},completedCycles:[{requirements:[{id:'BR-005',approvedContent:{features:[feature]},jiraIssues:[
 {path:'BR-005',key:'TC-390'},{path:'BR-005/F-1',key:'TC-391'},{path:'BR-005/F-1/S-1',key:'TC-392'},{path:'BR-005/F-1/S-2',key:'TC-393'}]}]}]};
 assert.equal(role.plan(reg,'BR-005').length,role.plan(fixture(),'BR-005').length);
});
test('fails closed when story identity is missing; does not attempt BR rewriting',()=>{
 const reg=fixture();delete reg.synced['BR-005/F-1/S-2'];
 assert.throws(()=>role.plan(reg,'BR-005'),/Story is missing/);
 assert.throws(()=>role.plan(reg,'BR-999'),/No approved Business Requirement/);
});
test('remote reconciliation verifies role label, task marker and parent',()=>{
 const row=role.plan(fixture(),'BR-005')[0],marker='atgv-'+'a'.repeat(24);
 const remote={key:'TC-405',fields:{project:{key:'TC'},parent:{key:row.parentKey},issuetype:{subtask:true,name:'Sub-task'},labels:[marker,row.roleLabel],summary:row.title}};
 assert.equal(role.validateRemote(remote,row,'TC',marker),true);
 assert.throws(()=>role.validateRemote({...remote,fields:{...remote.fields,parent:{key:'TC-999'}}},row,'TC',marker),/parent changed/);
 assert.throws(()=>role.validateRemote({...remote,fields:{...remote.fields,labels:[marker]}},row,'TC',marker),/metadata is missing/);
});
test('host requires BA ownership, verified preview, explicit publish and no Jira deletes',()=>{
 const preview=host.slice(host.indexOf("case 'brRoleTaskRepairPreview':"),host.indexOf("case 'brJiraPreview':"));
 for(const pattern of [/requireBAOwner\(/,/roleRepairPreviewFor\(/,/roleRepairPreviewContext/,/uiWarning\(/,/jiraFindIssueByMarker\(/,/jiraCreateIssue\(/,/jiraRoleRepair\.record/])assert.match(preview,pattern);
 assert.doesNotMatch(preview,/jiraRetireIssue\(|deleteIssue|deleteBREverywhere/);
 assert.match(ui,/Regenerate Jira Tasks/);assert.match(ui,/Publish Missing Jira Subtasks/);
});
