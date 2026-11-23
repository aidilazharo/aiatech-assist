'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const routing=require('../src/jira-role-routing'),preflight=require('../src/jira-field-preflight');
const details=require('../src/jira-preview-details'),fieldValues=require('../src/jira-field-values');
test('18 role labels exist; unclassified tasks require manual role selection',()=>{
 assert.equal(routing.roleChoices().length,18);
 assert.equal(routing.resolveRole({kind:'Task',title:'Frontend: table columns'}),'software-developer');
 assert.equal(routing.resolveRole({kind:'Task',title:'Wireframe application list'}),'ux-designer');
 assert.equal(routing.resolveRole({kind:'Task',title:'Project plan and RAID log'}),'project-manager');
 assert.equal(routing.resolveRole({kind:'Task',title:'Discuss improvements'}),'');
 assert.equal(routing.resolveRole({kind:'Task',title:'Frontend dashboard',roleId:'ux-designer'}),'ux-designer');
 assert.equal(routing.roleLabel('uiux'),'atgv-role-ux-designer');
 assert.throws(()=>routing.resolveRole({kind:'Task',roleId:'unknown-role'}),/Unknown SDLC role/);
});
test('Jira unsupported required fields block; optional missing evidence stays blank',()=>{
 const meta=[
 {id:'summary',name:'Summary',required:true,schema:{type:'string'}},
 {id:'customfield_11111',name:'Optional Free Text',schema:{type:'string'}},
 {id:'customfield_11112',name:'Risk Score',required:true,schema:{type:'number'}}];
 const plan=preflight.planFields({title:'Application list'},meta,{approvedBR:{title:'Application list'}});
 assert.equal(plan.extraFields.customfield_11111,undefined);
 assert.equal(plan.fields[1].status,'missing-evidence');
 assert.equal(plan.fields[1].publishable,false);
 assert.equal(plan.blocking.length,1);
 assert.match(plan.blocking[0],/Risk Score/);
 assert.throws(()=>fieldValues.encode({...meta[1],operations:['set']},'Information not available in the approved Business Requirements document.'),/actual approved evidence/);
});
test('Draft TRM does not become an approved project DoD or invented AC',()=>{
 const item={kind:'Story',title:'Application list',description:'Display business applications'};
 assert.deepEqual(details.generalize(item,{}, {status:'proposed',items:['99% test coverage']}),{acceptanceCriteria:'',definitionOfDone:''});
 const approved=details.generalize(item,{}, {status:'approved',items:['Tests pass']});
 assert.equal(approved.acceptanceCriteria,'');
 assert.equal(approved.definitionOfDone,'[ ] Tests pass');
 const selected=details.applyDetails(item,{roleId:'project-manager',acceptanceCriteria:'Given access, when list loads, then rows appear'});
 assert.equal(selected.roleLabel,'atgv-role-project-manager');
 assert.equal(selected.roleId,'project-manager');
});
