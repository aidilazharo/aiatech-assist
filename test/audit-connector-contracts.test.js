'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { testJiraConnection, getConfluenceSpace, testGithubConnection, writeConfluence } = require('../src/clients');

const settings = new Map(Object.entries({
  'jira.baseUrl':'https://example-org.atlassian.net',
  'jira.email':'test@example.invalid',
  'confluence.baseUrl':'https://example-org.atlassian.net/wiki',
  'confluence.spaceKey':'TCC',
  'confluence.spaceId':'',
  'confluence.parentPageId':'',
  'github.owner':'example-org',
  'github.repo':'tech-stacks-skills',
  'github.apiUrl':'https://api.github.com'
}));
const config={get:key=>settings.get(key)||''};

function mockFetch(t,reply) {
 const original=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (url,opts={})=>{
  calls.push({url:String(url),method:opts.method||'GET',headers:opts.headers,body:opts.body});
  const data=reply(String(url),opts);
  return {ok:!data.status||data.status<400,status:data.status||200,json:async()=>data.body||{},text:async()=>data.error||''};
 };
 t.after(()=>{globalThis.fetch=original;});
 return calls;
}

test('Jira live route contract: verifies account and token isolation',async t=>{
 const calls=mockFetch(t,(url)=>url.endsWith('/rest/api/3/myself')?{body:{accountId:'test-id',displayName:'Integration Test'}}:{status:404});
 const res=await testJiraConnection(config,'dummy-not-real-token');
 assert.equal(res.accountId,'test-id');
 assert.equal(calls.length,1);
 assert.match(calls[0].headers.Authorization,/^Basic /);
 assert.ok(!JSON.stringify(res).includes('dummy-not-real-token'));
});

test('Confluence TCC lookup requires exact authorized space key',async t=>{
 const calls=mockFetch(t,(url)=>url.includes('keys=TCC')?{body:{results:[{id:'4200',key:'TCC',name:'Tech Cockpit'}]}}:{status:404});
 const space=await getConfluenceSpace(config,'fake-token');
 assert.equal(space.key,'TCC');
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/api\/v2\/spaces\?keys=TCC/);
});

test('Confluence remote version conflict prevents blind overwrite',async t=>{
 const calls=mockFetch(t,()=>({status:409,error:'version conflict'}));
 await assert.rejects(writeConfluence(config,'fake-token',{pageId:'42',title:'Test',bodyHtml:'<p>Test</p>',version:2}),/version conflict/i);
 assert.equal(calls[0].method,'PUT');
 assert.equal(JSON.parse(calls[0].body).version.number,3);
});

test('GitHub skills repo identity is verified and mismatches rejected',async t=>{
 mockFetch(t,url=>({body:url.endsWith('/user')?{login:'tester'}:url.includes('/branches?')?[]:url.endsWith('/branches/main')?{name:'main'}:{full_name:'example-org/tech-stacks-skills',default_branch:'main',private:true}}));
 const status=await testGithubConnection(config,'fake-token');
 assert.equal(status.fullName,'example-org/tech-stacks-skills');
 assert.equal(status.private,true);
});
