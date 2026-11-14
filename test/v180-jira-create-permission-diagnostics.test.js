'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {jiraIssueTypes, jiraCreateIssue} = require('../src/remote-actions');
const fs = require('node:fs'), path=require('node:path');
const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'test@example.test','jira.projectKey':'TC'})[key]||''};
const response=(status,obj)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(obj),json:async()=>obj});
async function withFetch(fn,handler){const saved=global.fetch;global.fetch=handler;try{return await fn();}finally{global.fetch=saved;}}
test('Jira metadata succeeds without requesting permission fallback',async()=>{
 const paths=[];
 const types=await withFetch(()=>jiraIssueTypes(config,'token'),async(u,o)=>{paths.push(new URL(u).pathname);return response(200,{issueTypes:[{id:'10001',name:'Task',subtask:false}]});});
 assert.equal(types[0].name,'Task');assert.deepEqual(paths,['/rest/api/3/issue/createmeta/TC/issuetypes']);
});
test('Jira 404 + explicit Create Issues denial produces specific no-write diagnosis',async()=>{
 const urls=[];
 await assert.rejects(withFetch(()=>jiraIssueTypes(config,'token'),async(u,o)=>{
  urls.push(u);assert.equal(o.method,'GET');
  if(u.includes('createmeta'))return response(404,{errorMessages:['You cannot create issues in this project.']});
  if(u.includes('/myself'))return response(200,{displayName:'Test User'});
  if(u.includes('/mypermissions'))return response(200,{permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:false}}});
  if(u.includes('/project/TC'))return response(200,{id:'10003',key:'TC'});
  throw Error('unexpected URL '+u);
 }),/Test User lacks Create Issues permission.*No Jira issues were created/);
 assert.ok(urls.some(u=>u.includes('/mypermissions?projectKey=TC')));
});
test('Jira 404 + two granted permissions uses project-specific issue types',async()=>{
 const urls=[];
 const types=await withFetch(()=>jiraIssueTypes(config,'token'),async(u,o)=>{
  urls.push(u);assert.equal(o.method,'GET');
  if(u.includes('createmeta'))return response(404,{errorMessages:['You cannot create issues in this project.']});
  if(u.includes('/myself'))return response(200,{accountId:'a1'});
  if(u.includes('/mypermissions'))return response(200,{permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:true}}});
  if(u.includes('/project/TC'))return response(200,{id:'10003',key:'TC'});
  if(u.includes('/issuetype/project?projectId=10003'))return response(200,[{id:'1',name:'Story',subtask:false},{id:'2',name:'Subtask',subtask:true}]);
  throw Error('unexpected URL '+u);
 });
 assert.equal(types.length,2);assert.ok(urls.some(u=>u.includes('/issuetype/project?projectId=10003')));
});
test('Jira 404 with unverified permissions never assumes success or creates issues',async()=>{
 await assert.rejects(withFetch(()=>jiraIssueTypes(config,'token'),async(u,o)=>{
  assert.equal(o.method,'GET');
  if(u.includes('createmeta'))return response(404,{errorMessages:['You cannot create issues in this project.']});
  if(u.includes('/project/TC'))return response(200,{id:'10003'});
  return response(403,{errorMessages:['Not authorized']});
 }),/Project TC exists and is readable.*token scope.*No Jira issues were created/);
});
test('batch publisher passes validated issue types to avoid repeating create metadata',async()=>{
 const urls=[];
 const result=await withFetch(()=>jiraCreateIssue(config,'token',{
  summary:'Ticket test',issueType:'Task',issueTypes:[{id:'10101',name:'Task',subtask:false}]
 }),async(u,o)=>{urls.push(u);assert.equal(o.method,'POST');return response(201,{key:'TC-765'});});
 assert.deepEqual(urls,['https://example.atlassian.net/rest/api/3/issue']);assert.equal(result.key,'TC-765');
});
test('Jira preview validates creation capabilities before approval; login test is labeled authentication-only',()=>{
 const extension=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(extension,/if\(changes\.some\(item=>item\.action==='create'\)\)\{[\s\S]{0,900}await jiraIssueTypes\(target\.config,target\.token\)/);
 assert.match(extension,/Jira login successful/);
 assert.match(extension,/issueTypes:types/);
});
