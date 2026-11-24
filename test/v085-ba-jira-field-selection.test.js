'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {planFields}=require('../src/jira-field-preflight');
const fields=[{id:'customfield_10001',name:'Business Objective',schema:{type:'string'}},{id:'customfield_10002',name:'Scope',required:true,schema:{type:'string'}}];
const item={title:'Example',description:'Example'};
test('optional fields honor selection and required fields remain planned',()=>{
 const context={approvedBR:{objective:'Objective',scope:'Scope'},selectedFields:[]};
 const plan=planFields(item,fields,context);
 assert.equal(plan.extraFields.customfield_10001,undefined);
 assert.equal(plan.fields[0].status,'not-selected');
 assert.equal(plan.extraFields.customfield_10002,'Scope');
 assert.equal(planFields(item,fields,{...context,selectedFields:['customfield_10001']}).extraFields.customfield_10001,'Objective');
});
test('unselected field preserves existing Jira data and explicit BA values',()=>{
 const context={selectedFields:[],existing:{fields:{customfield_10001:'Prior'}}};
 assert.equal(planFields(item,fields,context).fields[0].status,'preserved');
 assert.equal(planFields({...item,jiraDetails:{fieldValues:{customfield_10001:'Manual'}}},fields,context).extraFields.customfield_10001,'Manual');
});
