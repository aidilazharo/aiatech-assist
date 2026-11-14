'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {get,list,ids}=require('../media/user-guide');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const host=read('test/generated/extension-source.txt'),client=read('media/start.js'),catalog=read('media/user-guide.js'),controller=read('media/user-guide-controller.js'),css=read('media/start.css');
test('empty workspace automatically starts the opening guide only once per VS Code folder',()=>{
 assert.match(host,/emptyWorkspace=entries\.every\(/);
 assert.match(host,/atgvAssist\.guideAuto\./);
 assert.match(host,/case 'guideAutoShown'/);
 assert.match(controller,/function maybeAutoStart\(\)/);
 assert.match(controller,/autoGuideAttempted=true;send\('guideAutoShown'\);start\('opening'\)/);
});
test('missing VS Code folder has visible error and actionable Open Folder control',()=>{
 assert.match(host,/id="gateFolderAlert"[^>]*role="alert"/);
 assert.match(host,/id="gateOpenFolder"/);
 assert.match(host,/case 'openWorkspaceFolder'/);
 assert.match(client,/workspaceFolderAvailable=!!msg\.workspace/);
 assert.match(client,/gateFolderAlert'\)\.classList\.toggle\('hidden',workspaceFolderAvailable/);
});
test('start screen shows version beneath title and removes ATGV PROJECT WORKSPACE kicker',()=>{
 assert.match(host,/class="gate-product-title"/);
 assert.match(host,/<small>v\$\{extensionVersion\}<\/small>/);
 assert.ok(!host.includes('ATGV · PROJECT WORKSPACE'));
});
test('settings has a far-right guide button and official token links for Jira, Confluence, and GitHub',()=>{
 for(const id of ['settingsGuideHelp','guideJiraTokenLink','guideConfluenceTokenLink','guideGithubTokenLink'])assert.ok(host.includes(`id="${id}"`));
 assert.match(controller,/openMenu\('extension-settings'\)/);
 assert.match(host,/id="guideStepTokenLink"/);
 assert.match(controller,/guideStepTokenLink'\)\.addEventListener/);
 assert.match(host,/https:\/\/id\.atlassian\.com\/manage-profile\/security\/api-tokens/);
 assert.match(host,/https:\/\/github\.com\/settings\/personal-access-tokens/);
 assert.match(host,/vscode\.env\.openExternal/);
 assert.ok(get('extension-settings').steps.some(step=>step.selector==='#guideConfluenceTokenLink'));
});
test('guides are grouped into Getting Started, Navigation, My Work, Processes and Connections',()=>{
 const opened=list(['business-analyst','software-developer','qa-engineer'],true);
 for(const group of ['Getting Started','Workspace Navigation','My Work · Roles','Business Processes','Connections & Settings'])assert.ok(opened.some(x=>x.group===group),group);
 assert.ok(opened.some(x=>x.id==='jira-publishing'));
 assert.ok(opened.some(x=>x.id==='developer-delivery'));
 assert.ok(opened.some(x=>x.id==='navigation'));
 assert.ok(catalog.includes("'guideTokenLink'" )===false);
 assert.match(controller,/guide-tour-group/);
 assert.match(css,/\.guide-tour-group\{/);
 assert.ok(ids.includes('approval-handoff'));
});
