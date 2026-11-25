'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {repository,diagnostic}=require('../src/github-credential-validator');
const options={api:'https://api.github.com',route:'https://api.github.com/repos/acme/repo',owner:'acme',repo:'repo',token:'fake',branch:'main'};
function mock({deny=false,missing=false}={}){
 const calls=[];
 return {calls,request:async(url,opts)=>{
  calls.push(url);assert.equal(opts.token,'fake');
  if(url.endsWith('/user'))return {login:'tester'};
  if(url.endsWith('/branches/main')){if(deny)throw Error('HTTP 403');return {name:missing?'other':'main'};}
  return {full_name:'acme/repo',permissions:{pull:true,push:false},default_branch:'main'};
 }};
}
test('authenticated content access is separate from estimated write access',async()=>{
 const m=mock();const value=await repository({...options,request:m.request});
 assert.equal(value.authenticated,true);assert.equal(value.login,'tester');assert.deepEqual(value.permissions,{pull:true,push:false});assert.equal(m.calls.length,3);
});
test('metadata alone cannot verify content access; missing PAT fails closed',async()=>{
 const m=mock({deny:true});await assert.rejects(repository({...options,request:m.request}),/403/);
 await assert.rejects(repository({...options,token:'',request:m.request}),/required/);
 await assert.rejects(repository({...options,request:mock({missing:true}).request}),/branch/);
});
test('safe diagnostics distinguish SSO, rate limits and invalid credentials',()=>{
 assert.match(diagnostic(401,{}),/expired/);assert.match(diagnostic(403,{'x-ratelimit-remaining':'0'}),/rate limit/);
 assert.match(diagnostic(403,{'x-github-sso':'required'}),/SSO/);assert.match(diagnostic(429,{}),/rate limit/);
 assert.match(diagnostic(403,{},'IP allowlist enabled'),/IP allowlist/);
});
