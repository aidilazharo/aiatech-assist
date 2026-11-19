'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {requestJson,testJiraConnection}=require('../src/clients');
const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'tester@example.test','jira.projectKey':'TC'})[key]||''};
async function withFetch(response,callback){
 const original=global.fetch;
 global.fetch=async()=>response;
 try{return await callback();}finally{global.fetch=original;}
}
const fail=(status,body)=>({ok:false,status,text:async()=>body});
test('v416: Jira 404 JSON null identifies failing issue path and permissions, not null',async()=>{
 await assert.rejects(withFetch(fail(404,'null'),()=>requestJson('https://example.atlassian.net/rest/api/3/issue/TC-712?token=do-not-log')),
  error=>{
   assert.match(error.message,/HTTP 404 from example\.atlassian\.net GET \/rest\/api\/3\/issue\/TC-712/);
   assert.match(error.message,/No error details returned by the server/);
   assert.match(error.message,/not found or not visible/);
   assert.match(error.message,/404 does not prove deletion/);
   assert.doesNotMatch(error.message,/do-not-log|: null\b/);
   return true;
  });
});
test('v416: project HTTP 404 with empty Jira error data names project visibility without guessing deletion',async()=>{
 await assert.rejects(withFetch(fail(404,'{"errorMessages":null,"errors":{}}'),()=>requestJson('https://example.atlassian.net/rest/api/3/project/TC')),
  error=>{
   assert.match(error.message,/GET \/rest\/api\/3\/project\/TC/);
   assert.match(error.message,/No error details returned by the server/);
   assert.match(error.message,/Project Key and Browse Projects permission/);
   assert.doesNotMatch(error.message,/\bnull\b/);
   return true;
  });
});
test('v416: a wrong Jira site during account preflight identifies URL configuration',async()=>{
 await assert.rejects(withFetch(fail(404,''),()=>testJiraConnection(config,'fake-token')),
  error=>{
   assert.match(error.message,/GET \/rest\/api\/3\/myself/);
   assert.match(error.message,/Jira Base URL is the correct Atlassian Cloud site/);
   assert.doesNotMatch(error.message,/fake-token/);
   return true;
  });
});
test('v416: Jira JSON details explain the error without exposing request query parameters',async()=>{
 await assert.rejects(withFetch(fail(404,'{"errorMessages":[null,"Issue does not exist or you do not have permission"],"errors":{"project":"Not found"}}'),()=>requestJson('https://example.atlassian.net/rest/api/3/issue/TC-123?jql=private-issue')),
 error=>{
  assert.match(error.message,/Issue does not exist or you do not have permission; Not found/);
  assert.doesNotMatch(error.message,/private-issue/);
  return true;
 });
});
test('v416: other HTTP errors preserve status, API path and error message',async()=>{
 await assert.rejects(withFetch(fail(401,'{"errorMessages":["Unauthorized"]}'),()=>requestJson('https://example.atlassian.net/rest/api/3/myself')),
 /HTTP 401 from example\.atlassian\.net GET \/rest\/api\/3\/myself: Unauthorized/);
});
test('v416: non-Atlassian 404 does not carry incorrect Jira hint',async()=>{
 await assert.rejects(withFetch(fail(404,'null'),()=>requestJson('https://api.github.com/repos/company/project?access_token=private')),
 error=>{
  assert.match(error.message,/HTTP 404 from api\.github\.com GET \/repos\/company\/project/);
  assert.doesNotMatch(error.message,/Browse Projects|access_token|private/);
  return true;
 });
});
test('Confluence 404 identifies Confluence URL and access, without a misleading Jira hint',async()=>{
 await assert.rejects(withFetch(fail(404,'null'),()=>requestJson('https://example.atlassian.net/wiki/api/v2/spaces?limit=1')),
 error=>{
  assert.match(error.message,/Confluence API endpoint not found or not accessible/);
  assert.doesNotMatch(error.message,/Jira Base URL|Browse Projects/);
  return true;
 });
});
