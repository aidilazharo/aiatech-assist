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
test('published Jira approval is visible to every role without inventing assignments',()=>{
 const live=[{key:'TC-1',id:'101',type:'Epic',summary:'BR-001: Example',labels:['m1']},{key:'TC-3',type:'Task',parentKey:'TC-1',assigneeId:'dev'},
 {key:'TC-9',type:'Epic',summary:'BR-009: Not ATGV'},{key:'OTHER-1',type:'Epic',summary:'BR-002: Other',labels:['m1']}];
 const options={projectKey:'TC',verifyMarker:(id,row)=>id==='BR-001'&&row.labels?.includes('m1')};
 for(const actor of ['dev','designer','qa','pm','']){
  const result=inventory.enrich(live,{brs:[],synced:{}},actor,options);
  assert.equal(result[0].publishedApproval,true);assert.equal(result[1].brStatus,'Approved & Published');
  assert.equal(result[1].brId,'BR-001');assert.equal(result[1].taskRole,'');assert.equal(result[0].brRoot,false);
  assert.equal(result[2].publishedApproval,false);assert.equal(result[3].publishedApproval,false);
 }
 assert.equal(inventory.enrich(live,{brs:[],deletedRequirements:[{id:'BR-001'}]},'dev',options)[0].publishedApproval,false);
});
test('shared recovery is restricted to missing approved BRs mapped to assigned Developer tasks',()=>{
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[]},rows,'dev'),[{brId:'BR-001',jiraKey:'TC-1'}]);
 assert.deepEqual(recovery.assignedCandidates(register,register,rows,'dev'),[]);
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[br],synced:{'BR-001':register.synced['BR-001']}},rows,'dev'),[{brId:'BR-001',jiraKey:'TC-1'}]);
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[{...br,approvedContent:{title:'Different'}}]},rows,'dev'),[]);
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[],deletedRequirements:[br]},rows,'dev'),[]);
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[]},rows,'another'),[]);
});
test('assigned UI/UX tasks are eligible for selective shared recovery',()=>{
 assert.deepEqual(recovery.assignedCandidates(register,{brs:[]},rows,'dev','ux-designer'),[{brId:'BR-001',jiraKey:'TC-1'}]);
 const live=[{key:'TC-1',type:'Epic',summary:'BR-001: Example',labels:['m1']},
 {key:'TC-4',type:'Subtask',parentKey:'TC-1',assigneeId:'dev',labels:['atgv-role-ux-designer']}];
 const result=inventory.enrich(live,{brs:[]},'dev',{projectKey:'TC',verifyMarker:(id,row)=>row.labels.includes('m1')});
 assert.equal(result[1].taskRole,'ux-designer');assert.equal(result[1].roleMappingVerified,false);
 assert.equal(result[1].publishedSnapshotReady,false);
});
test('published immutable content survives a separate BA draft',()=>{
 const hash=require('../src/br-workflow').normalizedContent(br.approvedContent);
 const state={...register,brs:[{...br,status:'draft',needsRefresh:true}],baPublishedBRs:{'BR-001':hash}};
 const result=inventory.enrich([{...rows[0],labels:['m1']},{...rows[1],parentKey:'TC-1'},{...rows[2],parentKey:'TC-2'},rows[3]],state,'dev',{projectKey:'TC'});
 assert.equal(result.find(x=>x.key==='TC-3').publishedSnapshotReady,true);
 assert.equal(require('../src/developer-br-pipeline').approvedBr(state,'BR-001').status,'approved');
 assert.deepEqual(eligible(state,result).map(x=>x.id),['BR-001']);
});
test('role refresh pulls shared content before mapping and refreshes the selector',()=>{
 assert.ok(host.includes("vault.sync({mode:'pull'})"));
 assert.ok(host.includes('confluenceBRRecovery.recoverAssigned'));
 assert.ok(host.includes('jiraLocalStore.saveMappings'));
 assert.ok(host.includes('refreshPublishedRoleRegister(projectId,{config,token,register,items:all'));
 assert.ok(ui.includes('roleBrState=msg.register;developerBrSyncWarnings'));
 assert.ok(!ui.includes('brState=msg.register;developerBrSyncWarnings'));
 assert.ok(ui.includes('renderDeveloperBrChoices();'));
});
