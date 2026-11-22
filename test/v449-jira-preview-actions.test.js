'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=relative=>fs.readFileSync(path.join(__dirname,'..',relative),'utf8');

test('Jira preview has eight correctly sized columns and row actions remain contained',()=>{
 const css=source('media/start.css');
 const last=css.lastIndexOf('/* Jira Preview uses eight columns');
 assert.ok(last>0,'Jira Preview layout override is required');
 const rules=css.slice(last);
 const widths=[8,9,10,15,22,10,10,16];
 assert.equal(widths.reduce((sum,value)=>sum+value,0),100);
 widths.forEach((width,index)=>{
  assert.match(rules,new RegExp('th:nth-child\\('+(index+1)+'\\)\\{width:'+width+'%\\}'));
 });
 assert.match(rules,/jira-preview-row-actions\{display:flex/);
 assert.match(rules,/overflow-x:auto/);
});
test('Jira repair candidates use structured issue keys and are prioritized in both preview tables',()=>{
 const ui=source('media/start.js'),host=source('src/lib/runtime/extension-runtime.js');
 assert.match(host,/linkCandidates\.push\(\{path:item\.path,key:issue\.key\}\)/);
 assert.match(host,/const payload=\{changes,issueTypes,jiraProject,fieldPlans:jiraPreviewFieldPlans,conflicts:blockers,linkCandidates,protection,/);
 assert.match(ui,/jiraLinkCandidates=Array\.isArray\(m\.linkCandidates\)/);
 assert.match(ui,/pinFirst:row=>!!jiraLinkCandidate\(row\.entry\)/);
 assert.match(ui,/jiraDetailsActions\(row\.entry,true\)/);
 assert.match(ui,/jiraDetailsActions\(row\.entry\)/);
});
test('Failed Jira link repair is retryable; historical content forces separately approved update',()=>{
 const ui=source('media/start.js'),host=source('src/lib/runtime/extension-runtime.js');
 const workflow=source('src/br-workflow.js');
 assert.match(host,/type:'brJiraLinkFixFailed'/);
 assert.match(ui,/m\.type==='brJiraLinkFixFailed'/);
 assert.match(ui,/button\.disabled=false;button\.textContent='Fix Jira Link'/);
 assert.match(host,/strictContent:verifiedRepair\|\|contentMatchesApproved/);
 assert.match(host,/contentMatchesApproved\}\);/);
 assert.match(workflow,/contentMatchesApproved===false\?digest\(\{recoveredRemoteDigest:remoteDigest\}\):hash/);
});

test('Legacy Jira approval stays unavailable until all mandatory checks pass',()=>{
 const ui=source('media/start.js'),host=source('src/lib/runtime/extension-runtime.js');
 assert.match(host,/type:blockers\.length\?'brJiraPreflight':'brJiraPlan'/);
 assert.match(ui,/if\(m\.type==='brJiraPreflight'\)/);
 assert.match(ui,/Jira Preview has NOT been created/);
 assert.match(ui,/\$\('brJiraApprove'\)\.disabled=true;\$\('brJiraSync'\)\.disabled=true/);
 assert.match(ui,/jiraPreflightBlocked\?\x60Jira Preflight blocked:/);
});
