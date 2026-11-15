'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {listGithubRepositories}=require('../src/clients');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const config={get:key=>key==='github.apiUrl'?'https://api.github.com':''};
const repo=(full_name,privateValue=false)=>({full_name,private:privateValue,default_branch:'main',archived:false});
function ok(data){return {ok:true,status:200,json:async()=>data};}
test('GitHub public owner listing uses /users endpoint and never needs bearer token',async()=>{
 const old=global.fetch;let url,auth;
 global.fetch=async(u,opts)=>{url=u;auth=opts.headers.Authorization;return ok([repo('example-org/tech-stacks-skills'),repo('example-org/tech-cockpit')]);};
 try{const v=await listGithubRepositories(config,'',{owner:'example-org'});assert.equal(v.repositories.length,2);assert.equal(v.authenticated,false);assert.match(url,/\/users\/example-org\/repos\?/);assert.equal(auth,undefined);assert.equal(v.repositories[0].defaultBranch,'main');}
 finally{global.fetch=old;}
});
test('GitHub authenticated listing supports private repos, rejects malformed identities, filters owner, deduplicates',async()=>{
 const old=global.fetch;let url,auth;
 global.fetch=async(u,opts)=>{url=u;auth=opts.headers.Authorization;return ok([repo('example-org/private-work',true),repo('other/public'),repo('example-org/private-work',true),repo('evil/../../bad')]);};
 try{const v=await listGithubRepositories(config,'saved-secret',{owner:'example-org'});assert.equal(v.repositories.length,1);assert.deepEqual(v.repositories[0].fullName,'example-org/private-work');assert.equal(v.repositories[0].private,true);assert.match(url,/\/user\/repos\?/);assert.equal(auth,'Bearer saved-secret');}
 finally{global.fetch=old;}
});
test('GitHub discovery rejects invalid owner and unauthenticated unspecified owner before network',async()=>{
 await assert.rejects(()=>listGithubRepositories(config,'',{owner:'owner/name'}),/valid GitHub account/);
 await assert.rejects(()=>listGithubRepositories(config,'',{owner:''}),/account name/);
});
test('GitHub repository listing limits API calls and signals first-page truncation',async()=>{
 const old=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return ok([repo('user/repo-one')]);};
 try{const v=await listGithubRepositories(config,'',{owner:'user',limit:1});assert.equal(calls,1);assert.equal(v.truncated,true);assert.equal(v.repositories[0].name,'repo-one');}
 finally{global.fetch=old;}
});
test('ordinary ownership sync cannot show success banner; offline warning remains',()=>{
 const ui=read('media/start.js');assert.ok(!ui.includes("status(opsOwnerCached?'Showing cached ownership.':'Ownership synchronized.');notifyTop"));
 assert.ok(!ui.includes("notifyTop(opsOwnerCached?'Offline ownership cache loaded. Pending changes will sync when online.':'Ownership synchronized.'"));
 assert.match(ui,/if\(opsOwnerCached\)notifyTop\('Offline ownership cache loaded/);
});
test('GitHub URL is edited directly and must pass connection test before Save',()=>{
 const ui=read('media/start.js'),host=read('test/generated/extension-source.txt');
 assert.match(host,/id="githubRepositoryUrl"/);
 assert.doesNotMatch(host,/id="githubRepoChoices"/);
 assert.doesNotMatch(host,/id="listGithubRepos"/);
 assert.match(ui,/syncGithubRepositoryUrl/);
 assert.match(ui,/invalidateTest\('github'\)/);
 assert.match(host,/case 'testExtensionGithub':/);
});
test('nine-step workflow is flat and uses shared flat milestone styling',()=>{
 const css=read('media/start.css');assert.match(css,/#discoveryView \.discovery-workflow \.workflow-step/);assert.match(css,/outline:none!important/);assert.match(css,/text-decoration:none!important/);assert.match(css,/box-shadow:none!important/);
});
