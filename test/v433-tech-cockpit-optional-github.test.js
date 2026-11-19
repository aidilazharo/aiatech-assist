'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {sha}=require('../src/utils');
const {projectConfig,normalizeExtensionSettings,normalizeProjectInput}=require('../src/projects');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const start=host.indexOf('async function testOpeningProject(){'),end=host.indexOf('async function initializeOpeningProject(){',start);
assert.ok(start>0&&end>start,'Project opening implementation must be found');
function harness({accountOwner='',repo='',repoOwner='',jiraProjectKey=''}={}){
 const calls=[],events=[],project=normalizeProjectInput({name:'Tech Cockpit',id:'tech-cockpit',settings:{
  jira:{projectKey:jiraProjectKey},confluence:{spaceKey:'TECH'},
  github:{owner:repoOwner,repo}}});
 const extension=normalizeExtensionSettings({
  jira:{baseUrl:'https://example.atlassian.net',email:'owner@example.com'},
  confluence:{baseUrl:'https://example.atlassian.net/wiki'},
  github:{owner:accountOwner}
 });
 const config=projectConfig(project,extension);
 const openingFlow={candidate:project,warnings:null,require:phase=>assert.equal(phase,'selected'),tested(warnings){this.warnings=warnings;}};
 const sandbox={openingFlow,effectiveConfig:()=>config,sha,JSON,Date,verifiedConnections:new Map(),
  getAtlassianToken:async()=>{calls.push('atlassian-token');return 'TEST_TOKEN';},
  getGithubToken:async()=>{calls.push('github-token');return 'TEST_GH_TOKEN';},
  testJiraConnection:async()=>{calls.push('jira');return {displayName:'Tester'};},
  getConfluenceSpace:async()=>{calls.push('confluence');return {name:'Tech Cockpit'};},
  jiraIssueTypes:async()=>{calls.push('jira-types');return [];},
  requestJson:async()=>{calls.push('request');return {};},
  baseAtlassian:()=> 'https://example.atlassian.net',
  openingProgress:async()=>{},
  recordStartupDiagnostic:async x=>{events.push(x);},
  testGithubConnection:async()=>{calls.push('github-repo');return {name:'tech-cockpit'};}
 };
 vm.createContext(sandbox);
 vm.runInContext(host.slice(start,end)+'\nthis.open=testOpeningProject;',sandbox);
 return {open:sandbox.open,calls,events,openingFlow,config};
}
test('tech-cockpit opens with saved GitHub account owner but no project repository',async()=>{
 const h=harness({accountOwner:'aidilazharo'});
 const result=await h.open();
 assert.match(result,/Jira authenticated/);
 assert.deepEqual(h.calls,['atlassian-token','jira','confluence']);
 assert.match(h.openingFlow.warnings.join(' '),/Project GitHub repository not configured \(optional\)/);
 assert.ok(h.events.some(x=>x.status==='optional-github-skipped'&&x.projectId==='tech-cockpit'));
 assert.equal(h.config.get('github.owner'),'aidilazharo');
 assert.equal(h.config.get('github.repo'),'');
});
test('project with no GitHub account or repository opens successfully',async()=>{
 const h=harness();await h.open();
 assert.ok(!h.calls.includes('github-repo'));
 assert.equal(h.openingFlow.warnings.length,1);
});
test('configured project repo still performs permission validation before opening',async()=>{
 const h=harness({accountOwner:'aidilazharo',repo:'tech-cockpit'});
 const result=await h.open();
 assert.ok(h.calls.includes('github-token'));
 assert.ok(h.calls.includes('github-repo'));
 assert.ok(!h.events.some(x=>x.status==='optional-github-skipped'));
 assert.match(result,/GitHub verified/);
});
test('project repo without GitHub owner gives actionable configuration error',async()=>{
 const h=harness({repo:'tech-cockpit'});
 await assert.rejects(h.open(),/repository without an owner/);
 assert.ok(!h.calls.includes('github-repo'));
});
test('account-only GitHub owner is not cleared from saved account settings',()=>{
 const ext=normalizeExtensionSettings({github:{owner:'aidilazharo',repo:''}});
 assert.equal(ext.github.owner,'aidilazharo');
 assert.equal(ext.github.repo||'','');
});
