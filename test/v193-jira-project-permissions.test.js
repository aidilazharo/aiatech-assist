'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const {jiraIssueTypes}=require('../src/remote-actions');
const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'user@example.test','jira.projectKey':'ABE'})[key]||''};
const response=(status,obj)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(obj),json:async()=>obj});
test('Jira preview includes the effective project key and Project Settings source when denied',()=>{
 assert.match(host,/Jira preview target \$\{targetKey\} \(\$\{source\}\)/);
 assert.match(host,/activeProject\?\.settings\?\.jira\?\.projectKey\?'Project Settings'/);
 assert.match(host,/changing the default does not update this project/);
 assert.match(host,/Checking Jira \$\{targetKey\}/);
});
test('Jira connection checks project-scoped permissions rather than equating login with Create Issues',()=>{
 assert.match(host,/Create Issues denied: login works but Jira publishing is blocked/);
 assert.match(host,/mypermissions\?projectKey=\$\{encodeURIComponent\(fields\.projectKey\)\}/);
});
test('Jira ABE permission denial is read-only and explains project key correction',async()=>{
 const original=global.fetch,requests=[];
 global.fetch=async(url,options)=>{
  requests.push({url:String(url),method:options?.method});
  if(String(url).includes('/createmeta/'))return response(403,{errorMessages:['Permission denied']});
  if(String(url).includes('/myself'))return response(200,{displayName:'Example User'});
  if(String(url).includes('/project/ABE'))return response(200,{id:'10021',key:'ABE'});
  if(String(url).includes('/mypermissions'))return response(200,{permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:false}}});
  throw new Error('Unexpected API '+url);
 };
 try{
  await assert.rejects(jiraIssueTypes(config,'fake-token'),/Jira project ABE:.*lacks Create Issues permission.*Project Settings.*No Jira issues were created/);
  assert.ok(requests.every(req=>req.method==='GET'));
 }finally{global.fetch=original;}
});
