'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {branchPolicy,gitFailure}=require('../src/github-credential-validator');
const {normalizeExtensionSettings,projectConfig}=require('../src/projects');
const opts={route:'https://api.github.com/repos/acme/repo',branch:'main',token:'fake'};
test('GH013 pull-request policy is not reported as invalid credentials',()=>{
 const msg=gitFailure({stderr:'GH013: Repository rule violations. Changes must be made through a pull request.'});
 assert.match(msg,/requires a pull request/);assert.doesNotMatch(msg,/authentication failed/i);
 assert.match(gitFailure({stderr:'Authentication failed'}),/authentication failed/i);
});
test('branch rules are read only and policy failure does not deny authentication',async()=>{
 const calls=[];const policy=await branchPolicy({...opts,request:async url=>{calls.push(url);return url.includes('/rules/')?[{type:'pull_request'}]:{name:'main',protected:true};}});
 assert.deepEqual(policy,{protectedBranch:true,requiresPullRequest:true});assert.equal(calls.length,2);
 const unknown=await branchPolicy({...opts,request:async()=>{throw Error('HTTP 403');}});
 assert.deepEqual(unknown,{protectedBranch:null,requiresPullRequest:null});
});
test('explicit authentication method survives normalization and project config',()=>{
 const settings=normalizeExtensionSettings({github:{authentication:'vscode'}});
 assert.equal(projectConfig(null,settings).get('github.authentication'),'vscode');
 assert.throws(()=>normalizeExtensionSettings({github:{authentication:'other'}}),/authentication method/);
});
