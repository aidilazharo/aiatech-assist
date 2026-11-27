'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('../src/lib/updates/library-source-fallback');
const config={repositoryUrl:f.PRIMARY,authentication:'token',ref:'main'};
const remote={repository:f.FALLBACK_REPO,private:false,version:'0.0.11',sha:'a'.repeat(40)};
test('403 and 404 select the verified public source without forwarding private PAT',async()=>{
 for(const code of [403,404]){
  const calls=[];
  const result=await f.resolve(config,{tokenFor:async()=> 'secret',remoteVersion:async(c,t)=>{calls.push([c.repositoryUrl,t]);if(c.repositoryUrl===f.PRIMARY)throw Error('HTTP '+code);return remote;}});
  assert.deepEqual(calls,[[f.PRIMARY,'secret'],[f.FALLBACK,'']]);
  assert.equal(result.config.authentication,'public');assert.equal(result.fallback,true);
 }
});
test('network error and unexpected repository identity do not activate fallback',async()=>{
 await assert.rejects(f.resolve(config,{tokenFor:async()=>'',remoteVersion:async()=>{throw Error('timeout');}}),/timeout/);
 await assert.rejects(f.resolve(config,{tokenFor:async()=>'',remoteVersion:async(c)=>{if(c.repositoryUrl===f.PRIMARY)throw Error('HTTP 404');return {...remote,private:true};}}),/could not be verified/);
});
test('previous verified public source is allowed but arbitrary saved source is not',()=>{
 assert.equal(f.selectedConfig({repositoryUrl:f.FALLBACK,authentication:'public'},x=>x).repositoryUrl,f.FALLBACK);
 assert.equal(f.selectedConfig({repositoryUrl:'https://example.com/evil',authentication:'public'},x=>x).repositoryUrl,f.PRIMARY);
 assert.equal(f.selectedConfig({repositoryUrl:f.FALLBACK,authentication:'token'},x=>x).repositoryUrl,f.PRIMARY);
});
test('update error does not display repository URLs or paths',()=>{
 const message=f.safeMessage('HTTP 404 from api.github.com GET /repos/'+f.FALLBACK_REPO+': Not Found '+f.FALLBACK);
 assert.match(message,/HTTP 404/);assert.doesNotMatch(message,/aidilazharo|https:\/\/|\/repos\//);
});
