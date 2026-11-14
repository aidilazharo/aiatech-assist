'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const version=require('../package.json');
test('v0.1.50 version and milestone-specific Jira action groups',()=>{
 assert.ok(version.version.split('.').map(Number).reduce((a,v)=>a*100+v,0)>=150,'Jira publishing UI requires v0.1.50 or newer');
 for(const id of ['brJiraPreviewStep','brJiraApprovalStep','brJiraPublishStep']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(ui,new RegExp("\\$\\('"+id+"'\\)\\.classList\\.toggle\\('hidden'"));
 }
 assert.match(html,/Step 8 · Jira Preview/);
 assert.match(html,/Step 9 · Approve Jira Preview/);
 assert.match(html,/Step 10 · Publish Jira/);
});
test('old Jira history only appears inside completed Start section',()=>{
 const a=html.indexOf('id="baCompletedSection"'),b=html.indexOf('id="baCompletedJiraHistory"'),c=html.indexOf('id="brPublishedJira"'),d=html.indexOf('id="sourceDocumentCount"');
 assert.ok(a>=0&&a<b&&b<c&&c<d);
 const panel=html.slice(html.indexOf('<section class="jira-publish-panel"'),html.indexOf('<section class="ai-service-panel"'));
 assert.doesNotMatch(panel,/id="brPublishedJira"/);
 assert.match(ui,/\$\('baCompletedSection'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
});
test('publication counts are confirmed only after persisted Jira state',()=>{
 const fn=html.slice(html.indexOf('async function syncApprovedBRs('),html.indexOf('let aiChangeResolutionRuntime=null;'));
 const saved=fn.indexOf('state=await brWorkflow.recorded('),increment=fn.indexOf('confirmed++;'),done=fn.lastIndexOf("publishProgress('completed'");
 assert.ok(saved>=0&&saved<increment&&increment<done);
 assert.match(fn,/await publishProgress\('verifying'/);
 assert.match(fn,/await publishProgress\('failed'/);
 assert.doesNotMatch(fn,/percent:Math\.floor\(\(items\.indexOf\(item\)\/items\.length\)\*100\)/);
});
test('dedicated progress bar remains visible while publishing and stops at 99 before final verification',()=>{
 assert.match(html,/id="jiraStageProgress"[^>]+role="progressbar"/);
 assert.match(ui,/phase==='completed'\?100:total>0\?Math\.min\(99,/);
 assert.match(css,/#jiraStageProgress\.jira-dedicated-progress \.ba-stage-track\{display:block!important\}/);
 assert.match(ui,/brJiraPublishProgress/);
});
test('interrupted publish requires a fresh Jira preview and human approval',()=>{
 assert.match(html,/id="brJiraResume"/);
 assert.match(ui,/brPlanRevision=null;brJiraPreviewApproved=false;brJiraPlanChanges=0;/);
 assert.match(ui,/send\('brJiraPreview'\)/);
 assert.match(html,/if\(started\?\.previousAttempt\)throw Error\('Jira create state uncertain/);
 assert.match(html,/verifyRecoveredJiraIssue\(remote,item,/);
 assert.match(html,/prePublishIdentityGuard\(state,config,token,items\)/);
});
