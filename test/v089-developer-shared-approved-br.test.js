'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const recovery=require('../src/confluence-br-recovery'),inventory=require('../src/role-jira-inventory');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const a=ui.indexOf('function developerEligibleBRs('),b=ui.indexOf('function renderDeveloperBrChoices(',a);
const eligible=new Function(ui.slice(a,b)+'return developerEligibleBRs')();
const br={"id":"BR-001","status":"approved","approvedRevision":1,"approvedContent":{"title":"Example"}};
const register={"brs":[{"id":"BR-001","status":"approved","approvedRevision":1,"approvedContent":{"title":"Example"}}],"synced":{"BR-001":{"key":"TC-1","kind":"Epic","marker":"m1"},"BR-001/F-1":{"key":"TC-2","kind":"Feature","marker":"m2"},"BR-001/F-1/S-1/T-1":{"key":"TC-3","kind":"Task","marker":"m3"}},"roleTaskMappings":{"BR-001/F-1/S-1/ROLE-UIUX":{"key":"TC-4","roleId":"uiux","marker":"m4"}}};
const rows=[{"key":"TC-1","type":"Epic","assigneeId":"another"},{"key":"TC-2","type":"Feature","assigneeId":"another"},{"key":"TC-3","type":"Task","assigneeId":"dev","labels":["atgv-role-software-developer"]},{"key":"TC-4","type":"Subtask","assigneeId":"dev","labels":["atgv-role-ux-designer"]}];
test('assigned Developer task exposes its approved BR even if another user owns the Epic',()=>{
 const items=inventory.enrich(rows,register,'dev');
 assert.equal(items[0].mine,false);
 assert.equal(items[0].roleScopes['software-developer'].mine,true);
 assert.deepEqual(eligible(register,items).map(row=>row.id),['BR-001']);
 assert.deepEqual(eligible(register,[items[3]]),[]);
 assert.deepEqual(eligible(register,inventory.enrich(rows,register,'another')),[]);
 assert.deepEqual(eligible({brs:[{...br,needsRefresh:true}]},items),[]);
});
test('shared recovery is restricted to missing approved BRs mapped to assigned Developer tasks',()=>{
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[]},rows,'dev'),[{brId:'BR-001',jiraKey:'TC-1'}]);
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[br]},rows,'dev'),[]);
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[],deletedRequirements:[br]},rows,'dev'),[]);
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[]},rows,'another'),[]);
});
test('role refresh pulls shared content before mapping and refreshes the selector',()=>{
 assert.ok(host.includes("vault.sync({mode:'pull'})"));
 assert.ok(host.includes('confluenceBRRecovery.recoverAssigned'));
 assert.ok(host.includes('jiraLocalStore.saveMappings'));
 assert.ok(ui.includes('brState=msg.register;developerBrSyncWarnings'));
 assert.ok(ui.includes('renderDeveloperBrChoices();'));
});
