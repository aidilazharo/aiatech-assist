'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../src/live-remote-refresh');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const runtime=read('test/generated/extension-source.txt');
const ui=read('media/start.js');
const html=read('src/lib/webview/dashboard-html.js');
const config=values=>({get:key=>values[key]||''});
test('Jira and Confluence refresh are enabled for configured project connections',()=>{
 const c=config({'jira.baseUrl':'https://example.atlassian.net','jira.projectKey':'TC','confluence.spaceKey':'TCC'});
 assert.deepEqual(policy.configState(c),{jira:true,confluence:true});
 assert.equal(policy.jiraConfig(c).get('jira.jql'),'project = TC ORDER BY updated DESC');
 const customized=config({'jira.baseUrl':'https://example.atlassian.net','jira.projectKey':'TC','jira.jql':'project = TC AND status != Done','confluence.baseUrl':'https://example.atlassian.net/wiki','confluence.spaceKey':'TCC'});
 assert.equal(policy.jiraConfig(customized),customized,'User-approved JQL remains unchanged');
 assert.deepEqual(policy.configState(config({})),{jira:false,confluence:false});
 assert.throws(()=>policy.jiraConfig(config({'jira.projectKey':'TC; DROP'})),/Project Key/);
});
test('refresh is rate limited to five minutes and skips concurrent, offline work',()=>{
 assert.equal(policy.INTERVAL_MS,300000);
 assert.equal(policy.MIN_RETRY_MS,60000);
 assert.equal(policy.canRefresh({now:100000,lastAttempt:80000}),false);
 assert.equal(policy.canRefresh({now:150000,lastAttempt:80000}),true);
 assert.equal(policy.canRefresh({now:150000,lastAttempt:80000,busy:true,force:true}),false);
 assert.equal(policy.canRefresh({now:150000,lastAttempt:80000,offline:true,force:true}),false);
 assert.equal(policy.canRefresh({now:150000,lastAttempt:80000,force:true}),true);
});
test('read-only remote refresh lifecycle starts on project open, rechecks in background and honors offline',()=>{
 assert.match(runtime,/const liveRemoteRefresh=require\('[^']*live-remote-refresh'\)/);
 assert.match(runtime,/void refreshLiveRemoteData\(\{reason:'project-open',force:true\}\)/);
 assert.match(runtime,/setInterval\(\(\)=>\{\s*if\(activeProject\?\.id===project\.id\)void refreshLiveRemoteData/);
 assert.match(runtime,/liveRemoteRefresh\.INTERVAL_MS/);
 assert.match(runtime,/if\(openingOffline\)\{\s*liveRemoteState=/);
 assert.match(runtime,/case 'refreshConnectedSources'/);
 assert.match(runtime,/liveRemote:activeProject\?\.id===liveRemoteState\.projectId/);
 assert.match(runtime,/async function refreshLiveRemoteData/);
 const code=runtime.slice(runtime.indexOf('async function refreshLiveRemoteData'),runtime.indexOf('async function syncGithub',runtime.indexOf('async function refreshLiveRemoteData')));
 assert.match(code,/syncJira\(target,\{background:true\}\)/);
 assert.match(code,/syncConfluence\(target,\{background:true\}\)/);
 assert.match(code,/liveRefreshStillCurrent\(target\)/);
 assert.doesNotMatch(code,/syncManagedDocuments\(|writeConfluence\(|jiraIssueCreate\(/);
});
test('failed fetch preserves cached Jira and Confluence data and does not replace via stale project response',()=>{
 assert.match(runtime,/if\(!liveRefreshStillCurrent\(target\)\)throw Error\('Project changed during Confluence refresh/);
 assert.match(runtime,/if\(!liveRefreshStillCurrent\(target\)\)throw Error\('Project changed during Jira refresh/);
 const block=runtime.slice(runtime.indexOf('async function refreshLiveRemoteData'),runtime.indexOf('async function syncGithub',runtime.indexOf('async function refreshLiveRemoteData')));
 assert.match(block,/catch\(error\)\{errors\[name\]=/);
 assert.match(block,/phase:Object\.keys\(errors\)\.length\?'partial':'ready'/);
});
test('BA/PM Jira inventory automatically reloads when stale, remote status is visible in Knowledge',()=>{
 assert.match(ui,/jiraInventoryLastChecked=Date\.now\(\)/);
 assert.match(ui,/Date\.now\(\)-jiraInventoryLastChecked>=300000/);
 assert.match(ui,/function renderLiveRemoteState\(value\)/);
 assert.match(ui,/send\('refreshConnectedSources'\)/);
 assert.match(ui,/data\.type!=='liveRemoteState'/);
 assert.match(html,/Jira and Confluence refresh automatically when the project opens/);
 assert.match(html,/id="knowledgeSyncStatus"/);
});
test('extension metadata is consistent with this release',()=>{
 const pkg=require('../package.json');
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
});
