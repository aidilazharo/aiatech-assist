'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../src/role-connection-policy');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const complete={jiraRead:true,jiraWrite:true,confluenceRead:true,confluenceWrite:true,githubRead:true};
test('all roles require Jira/Confluence read and write plus GitHub read',()=>{
 const roles=['business-analyst','solution-architect','ux-designer','project-manager','qa-engineer','release-manager'];
 for(const role of roles){
  const result=policy.evaluate(role,complete,'demo');
  assert.equal(result.ready,true);
  assert.equal(result.capabilities.githubWrite,false);
  assert.equal(result.required.includes('githubWrite'),false);
  assert.equal(result.projectId,'demo');
 }
});
test('developer requires verified GitHub write access in addition to shared permissions',()=>{
 for(const role of ['developer','software-developer']){
  assert.deepEqual(policy.evaluate(role,complete).missing,['GitHub write']);
  assert.equal(policy.evaluate(role,{...complete,githubWrite:true}).ready,true);
 }
});
test('unverified permissions fail closed without blocking the extension shell',()=>{
 const result=policy.evaluate('business-analyst',{jiraRead:true});
 assert.deepEqual(result.missing,['Jira write','Confluence read','Confluence write','GitHub read']);
 assert.equal(result.ready,false);
});
test('startup and project selection contain non-gating skip paths',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const ui=read('media/start.js');
 const html=read('src/lib/webview/dashboard-html.js');
 assert.match(host,/case 'openingSkip'/);
 assert.match(host,/launchUnconfiguredWorkspace\(/);
 assert.match(host,/openingFlow\.tested\(warnings\)/);
 assert.match(ui,/id.?roleCredentialBanner|roleCredentialBanner/);
 assert.match(ui,/send\('openingSkip'\)/);
 assert.match(html,/id="gateSkip"/);
 assert.match(html,/id="roleCredentialSettings"/);
 assert.match(html,/id="roleCredentialBanner"/);
});
