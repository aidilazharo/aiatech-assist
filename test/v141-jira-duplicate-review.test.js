'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const mod=require('../src/jira-duplicate-cleanup');
function issue(key,summary,{type='Subtask',parent='TC-7',description='Exact requirement',status='To Do',label='atgv-abcdefabcdefabcdefabcdef',assignee=null}={}){
 return {key,fields:{summary,description,issuetype:{name:type},project:{key:'TC'},parent:parent?{key:parent}:undefined,status:{name:status},labels:[label],created:key==='TC-1'?'2026-01-01T01:00:00Z':'2026-01-02T01:00:00Z',updated:'2026-11-02T09:00:00Z',assignee}};
}
const config={get:key=>({'jira.projectKey':'TC','jira.baseUrl':'https://example.atlassian.net','jira.email':'tester@example.test'}[key])||''};
test('reports cross-restart Epics but never automatically selects a hierarchy for deletion',()=>{
 const roots=[issue('TC-7','BR-001: GATE Project Approval',{type:'Epic',parent:null}),issue('TC-109','BR-003: GATE Project Approval',{type:'Epic',parent:null}),issue('TC-170','BR-004: GATE Project Approval',{type:'Epic',parent:null})];
 const result=mod.summarize(roots);
 assert.equal(result.overlapping.length,1);assert.deepEqual(result.overlapping[0].epics.map(x=>x.key),['TC-7','TC-109','TC-170']);assert.equal(result.eligible,0);
});
test('same-parent matching title with different requirements is review-only',()=>{
 const result=mod.summarize([issue('TC-1','Lock submitted package',{description:'Old revision'}),issue('TC-2','Lock Submitted Package',{description:'New revision'})]);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].eligible,false);assert.match(result.candidates[0].reason,/Descriptions differ/);
});
test('exact unlinked, unworked leaf is eligible, mapped duplicate is not',()=>{
 const items=[issue('TC-1','Show error'),issue('TC-2','Show Error')];
 assert.equal(mod.summarize(items).eligible,1);assert.equal(mod.summarize(items,['TC-2']).eligible,0);
});
test('a started or assigned issue is not eligible for automated deletion',()=>{
 const original=issue('TC-1','Validate route');
 assert.equal(mod.summarize([original,issue('TC-2','Validate route',{status:'In Progress'})]).eligible,0);
 assert.equal(mod.summarize([original,issue('TC-2','Validate route',{assignee:{accountId:'a'}})]).eligible,0);
});
test('duplicate inspection cannot delete a previously worked Jira issue',()=>{
 const rows=[issue('TC-1','Duplicate example'),issue('TC-2','Duplicate example',{status:'In Progress'})];
 assert.equal(mod.summarize(rows).eligible,0);
 assert.equal(typeof mod.preflightDelete,'undefined');
});
test('duplicate inspection is read-only even for matching unworked issues',()=>{
 const rows=[issue('TC-1','Update template'),issue('TC-2','Update template')];
 const review=mod.summarize(rows);
 assert.equal(review.candidates.length,1);
 assert.equal(typeof mod.deleteVerifiedDuplicate,'undefined');
 assert.equal(typeof mod.preflightDelete,'undefined');
});
test('no destructive Jira duplicate request can be initiated from the extension',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.doesNotMatch(src,/case 'brJiraDuplicateRemove'/);
 assert.doesNotMatch(src,/deleteVerifiedDuplicate\(/);
 assert.doesNotMatch(src,/preflightDelete\(/);
});
test('host retains identity assessment and reconciliation without a deletion control',()=>{
 const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/prePublishIdentityGuard\(/);
 assert.match(host,/jiraDuplicates\.assessPublishPlan\(/);
 assert.doesNotMatch(host,/id="brJiraDuplicateRemove"/);
});
