'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=require('../src/repo-sync-github-api');
const repo={owner:'Org',repo:'repo-b',name:'Org/repo-b'};
const pat='github_pat_'+'a'.repeat(40);
test('repository lookup verifies identity and write permission without gh',async()=>{
 let calls=[];
 const request=async(...args)=>{
  calls.push(args);return {status:200,body:{full_name:'Org/repo-b',default_branch:'main',permissions:{pull:true,push:true}}};
 };
 const result=await api.getRepository(repo,pat,request);
 assert.equal(result.defaultBranch,'main');
 assert.equal(calls.length,1);assert.deepEqual(calls[0].slice(0,4),[repo,pat,'GET','']);
 await assert.rejects(()=>api.getRepository(repo,pat,async()=>({status:200,body:{full_name:'Elsewhere/repo-b',default_branch:'main',permissions:{push:true}}})),/identity/);
 await assert.rejects(()=>api.getRepository(repo,pat,async()=>({status:200,body:{full_name:'Org/repo-b',default_branch:'main',permissions:{push:false}}})),/write access/);
});
test('open PR lookup validates Repo B branch and PR base',async()=>{
 const matching={state:'open',html_url:'https://github.com/Org/repo-b/pull/123',head:{ref:'sync/repo-a/source',repo:{full_name:'Org/repo-b'}},base:{ref:'main'}};
 let called='';
 const request=async(_repo,_token,method,route)=>{called=method+' '+route;return {status:200,body:[
  {...matching,head:{...matching.head,repo:{full_name:'Other/repo'}}},
  {...matching,base:{ref:'wrong-branch'}},matching
 ]};};
 const url=await api.findOpenPr(repo,pat,{branch:'sync/repo-a/source',base:'main'},request);
 assert.equal(url,'https://github.com/Org/repo-b/pull/123');
 assert.match(called,/GET \/pulls\?state=open&head=Org%3Async%2Frepo-a%2Fsource&per_page=100/);
});
test('new PR creation passes AI details to GitHub REST API and no token inside body',async()=>{
 const params={branch:'sync/repo-a/source',base:'main',title:'AI review title',body:'AI reviewed files'};
 let received;
 const request=async(_repo,_token,method,route,data)=>{received={method,route,data};return {status:201,body:{html_url:'https://github.com/Org/repo-b/pull/42'}};};
 const url=await api.createPr(repo,pat,params,request);
 assert.equal(url,'https://github.com/Org/repo-b/pull/42');
 assert.equal(received.method,'POST');assert.equal(received.route,'/pulls');
 assert.deepEqual(received.data,{head:params.branch,base:'main',title:'AI review title',body:'AI reviewed files',maintainer_can_modify:false});
 assert.equal(received.data.head,params.branch);
 assert.equal(received.data.body.includes(pat),false);
});
test('error on missing PR permissions gives actionable instruction, not gh ENOENT',async()=>{
 await assert.rejects(api.createPr(repo,pat,{branch:'sync/repo-a/x',base:'main',title:'t',body:'b'},async()=>({status:403,body:{message:'Forbidden'}})),/Pull requests: Read and write/);
 await assert.rejects(api.getRepository(repo,pat,async()=>({status:401})),/authentication failed/);
 await assert.rejects(api.createPr(repo,pat,{branch:'sync/repo-a/x',base:'main',title:'t',body:'b'},async()=>({status:422,body:{message:'Validation Failed'}})),/HTTP 422/);
});
test('PR URL is restricted to chosen destination repository',()=>{
 assert.equal(api.safePrUrl(repo,'https://github.com/Org/repo-b/pull/19'),'https://github.com/Org/repo-b/pull/19');
 for(const unsafe of ['https://github.com/Other/repo/pull/19','https://github.com/Org/repo-b/pull/19?token=secret','http://github.com/Org/repo-b/pull/19','https://evil.example/Org/repo-b/pull/19'])
  assert.throws(()=>api.safePrUrl(repo,unsafe));
});
test('no GitHub CLI dependency remains in Repo Sync implementation',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/repo-sync-pr.js'),'utf8');
 assert.doesNotMatch(source,/runner\('gh',|gh --version|--body-file/);
 assert.match(source,/githubApi\.getRepository/);
 assert.match(source,/githubApi\.createPr/);
});
