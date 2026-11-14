'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const guard=require('../src/jira-duplicate-cleanup');
const issue=(key,title,kind,parent=null)=>({key,fields:{summary:title,description:'Requirement for '+title,issuetype:{name:kind},parent:parent?{key:parent}:undefined,status:{name:'To Do'},labels:['atgv-1234567890abcdef12345678']}});
test('a previously published GATE Epic blocks a new BR with the same logical title',()=>{
 const rows=[issue('TC-7','BR-001: GATE workflow','Epic'),issue('TC-109','BR-003: GATE workflow','Epic')];
 const plan=[{action:'create',kind:'Epic',path:'BR-004',title:'BR-004: GATE workflow'}];
 const result=guard.assessPublishPlan(rows,plan,{});
 assert.equal(result.safe,false);assert.deepEqual(result.matches.map(x=>x.existingKey),['TC-7','TC-109']);
});
test('a genuinely different requirement can create a new Epic',()=>{
 const result=guard.assessPublishPlan([issue('TC-7','BR-001: Existing system','Epic')],[{action:'create',kind:'Epic',path:'BR-003',title:'BR-003: New service'}]);
 assert.equal(result.safe,true);
});
test('update is safe when using the same mapped Epic key',()=>{
 const result=guard.assessPublishPlan([issue('TC-7','BR-001: Existing system','Epic')],[{action:'update',kind:'Epic',path:'BR-001',key:'TC-7',title:'BR-001: Existing system'}],{'BR-001':{key:'TC-7'}});
 assert.equal(result.safe,true);
});
test('updates block when another duplicate Epic hierarchy is present',()=>{
 const rows=[issue('TC-7','BR-001: GATE workflow','Epic'),issue('TC-109','BR-003: GATE workflow','Epic')];
 const plan=[{action:'update',kind:'Epic',path:'BR-001',key:'TC-7',title:'BR-001: GATE workflow'}];
 const result=guard.assessPublishPlan(rows,plan,{'BR-001':{key:'TC-7'}});
 assert.equal(result.safe,false);assert.equal(result.matches[0].existingKey,'TC-109');
});
test('new issue under existing Jira parent with same title is blocked pending human comparison',()=>{
 const result=guard.assessPublishPlan([issue('TC-25','Validate submission','Subtask','TC-7')],[{action:'create',kind:'Task',path:'BR-001/F-001/T-001',parent:'BR-001/F-001',title:'Validate submission'}],{'BR-001/F-001':{key:'TC-7'}});
 assert.equal(result.safe,false);assert.equal(result.matches[0].existingKey,'TC-25');
});
test('unrelated previously published subtasks do not block new work',()=>{
 const result=guard.assessPublishPlan([issue('TC-25','Validate submission','Subtask','TC-7')],[{action:'create',kind:'Task',path:'BR-001/F-001/T-001',parent:'BR-001/F-001',title:'Record decision'}],{'BR-001/F-001':{key:'TC-7'}});
 assert.equal(result.safe,true);
});
test('Jira preview and publishing use read-only identity guards before any issue creation',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const publish=src.slice(src.indexOf('async function syncApprovedBRs'),src.indexOf('let aiChangeResolutionRuntime'));
 assert.ok(publish.indexOf('prePublishIdentityGuard(')>=0);
 assert.ok(publish.indexOf('prePublishIdentityGuard(')<publish.indexOf('jiraCreateIssue('));
 assert.match(src,/jiraDuplicates\.assessPublishPlan\(rows,items,reg\.synced\|\|\{\}\)/);
 assert.match(src,/conflicts\.push\(\.\.\.formatIdentityConflicts\(duplicateGate\)\)/);
 assert.doesNotMatch(src,/id="brJiraDuplicateRemove"/);
});
test('identity collision error includes the conflicting Jira key and a reconciliation instruction',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(src,/existing Jira \$/);
 assert.match(src,/Reconcile the authoritative Epic and trusted BR-to-Jira mapping/);
 assert.match(src,/no automatic deletion is allowed/);
 assert.match(src,/Jira publication blocked by possible duplicates/);
});
