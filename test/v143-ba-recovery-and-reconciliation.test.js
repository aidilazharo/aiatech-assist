'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const host=read('test/generated/extension-source.txt'),web=read('media/start.js'),css=read('media/start.css');
const jira=require('../src/jira-duplicate-cleanup');

test('AI Review completion does not emit a misleading stopped event from finally',()=>{
 const branch=host.split("case 'copilotDiscovery':{")[1].split("case 'stopDiscoveryReview':{")[0];
 assert.match(branch,/try\{await completion;\}/);
 assert.match(branch,/outcome:cancelled\?'cancelled':'failed'/);
 assert.doesNotMatch(branch,/finally\{[^}]*postMessage\(\{type:'discoveryReviewStopped'/);
 assert.match(host,/type:'discoveryReviewResult'/);
});
test('AI Review stop or failure includes the reason and offers a re-run',()=>{
 assert.match(host,/id="baReviewStopReason"/);
 assert.match(web,/reviewStopReason=\(failed\?'AI Review failed: ':'AI Review stopped: '\)\+reason/);
 assert.match(web,/\(reviewStopReason\|\|reviewCurrent\)\?'Re-run AI Review'/);
 assert.match(web,/reviewStopReason='';renderDiscoveryReview\(\);baBusy\('review'/);
 assert.match(css,/\.ba-review-stop-reason\{/);
});
test('restart notice is ephemeral and discarded once workflow advances',()=>{
 assert.match(web,/function dismissObsoleteBARestartNotice\(\)/);
 assert.match(web,/topNoticeQueue\.filter\(item=>!stale\(item\)\)/);
 assert.match(web,/if\(m\.task&&m\.task!=='upload'\)dismissObsoleteBARestartNotice\(\)/);
 assert.match(web,/status\(m\.freshStart\?'New Business Requirements cycle ready\./);
 assert.doesNotMatch(web,/Previous source documents archived\. Upload new source documents to begin\.',false,\{persistent:true\}/);
});
test('preview action is displayed on same metadata and ownership row, with draft blue and approved grey',()=>{
 assert.match(web,/cardControls\.append\(meta\)/);
 assert.match(web,/cardControls\.append\(actionBar\)/);
 assert.match(web,/br-preview-action/);
 assert.match(web,/secondary br-preview-approved/);
 assert.match(css,/br-card-preview\.br-preview-action\{/);
 assert.match(css,/br-card-preview\.br-preview-approved\{/);
});
test('reopen actions are positioned below requirements and Jira panels',()=>{
 const jira=host.indexOf('<section class="jira-publish-panel"');
 const edit=host.indexOf('<div class="ba-step-reopen">');
 const modal=host.indexOf('id="brEditModal"');
 assert.ok(jira>=0&&edit>jira&&modal>edit);
});
const issue=(key,summary,type,parent)=>({key,fields:{summary,issuetype:{name:type},parent:parent?{key:parent}:undefined,status:{name:'To Do'}}});
test('cross-Epic comparison includes child hierarchy, but cannot enable deletion on matching titles alone',()=>{
 const rows=[issue('TC-7','BR-001: Same','Epic'),issue('TC-9','BR-002: Same','Epic'),issue('TC-8','Feature 1','Story','TC-7'),issue('TC-10','Feature 2','Story','TC-9'),issue('TC-11','Task 1','Sub-task','TC-10')];
 const scan=jira.summarize(rows);
 assert.equal(scan.overlapping.length,1);
 assert.equal(scan.overlapping[0].epics[0].children.length,1);
 assert.equal(scan.overlapping[0].epics[1].children.length,2);
 assert.equal(scan.eligible,0);
 assert.equal(typeof jira.deleteVerifiedDuplicate,'undefined');
 assert.match(host,/formatIdentityConflicts\(/);
 assert.match(host,/no automatic deletion is allowed/);
});
