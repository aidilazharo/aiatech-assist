'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const jira=require('../media/jira-overview.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Jira overview counts published keys, deduplicates and categorizes safely',()=>{
 const data=jira.summarize({
  'BR-01/Epic':{key:'AIA-102',kind:'Epic',title:'Portfolio'},
  'BR-01/Story':{key:'AIA-103',kind:'Story',title:'Project initiation'},
  'BR-01/duplicate':{key:'AIA-103',kind:'Story',title:'Duplicate mapping'},
  'BR-01/bad':{key:'invalid<script>',title:'Bad'},
  'BR-01/pending':{title:'Unpublished'},
  'BR-01/null':null
 });
 assert.equal(data.count,2);
 assert.deepEqual(data.byType,{Epic:1,Story:1});
 assert.deepEqual(data.issues.map(x=>x.key),['AIA-102','AIA-103']);
 assert.deepEqual(jira.summarize(null),{count:0,byType:{},issues:[]});
});

test('Jira links require a trusted configured base and a valid Jira key',()=>{
 assert.equal(jira.browseUrl('https://jira.example.org','AIA-102'),'https://jira.example.org/browse/AIA-102');
 assert.equal(jira.browseUrl('https://example.org/jira/','ABC_1-5'),'https://example.org/jira/browse/ABC_1-5');
 for(const base of ['javascript:alert(1)','http://unknown.example','https://user:pass@host','https://host/path?x=1'])assert.equal(jira.browseUrl(base,'AIA-102'),null);
 assert.equal(jira.browseUrl('https://jira.example.org','<script>'),null);
});

test('overview card, drilldown, and publication-event refresh are wired in main webview',()=>{
 const host=read('test/generated/extension-source.txt'),js=read('media/start.js');
 for(const id of ['overviewJiraCount','overviewJiraBreakdown','overviewJiraDetails','overviewJiraList'])assert.match(host,new RegExp('id="'+id+'"'));
 assert.match(host,/<script src="\$\{jiraOverviewJs\}"><\/script>/);
 assert.match(js,/function renderOverviewJira\(\)/);
 assert.match(js,/renderOverviewRoles\(msg\.summary\|\|\{\}\)/);
 assert.match(js,/brApprovePending=false;renderOverviewJira\(\);/);
 assert.match(js,/tools\.browseUrl\(jiraBrowseBaseUrl,row\.key\)/);
 assert.match(js,/ATGVDataTables\.mount\(list,data\.issues/);
});

test('static duplicate explanations removed without losing approval and simulation warnings',()=>{
 const html=read('test/generated/extension-source.txt'),js=read('media/start.js');
 assert.doesNotMatch(html,/Select your role below, then open My Work/);
 assert.doesNotMatch(html,/Visual output from the selected Business Requirements design revision/);
 assert.doesNotMatch(html,/Approved Business Requirements → Published Jira → Start Work/);
 assert.doesNotMatch(js,/Draft design · review the assumptions, open questions/);
 assert.match(js,/Approved Business Requirements changed/);
 assert.match(js,/Offline simulation · no HTTP requests are sent/);
 assert.match(html,/id="designApprove"/);
});
