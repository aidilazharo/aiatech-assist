'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const workflow=require('../src/br-workflow');
const remote=require('../src/remote-br-deletion');

const fakeConfig={get:key=>({'jira.projectKey':'TC','jira.email':'tester@example.test','jira.baseUrl':'https://example.atlassian.net'})[key]||''};
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v215-jira-sync-'));
 try{const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});return await fn(registry);}
 finally{await fs.rm(root,{recursive:true,force:true});}
}
function record(id,title){return {id,title,objective:title,scope:title,acceptanceCriteria:title,features:[],status:'approved',approvedRevision:1,approvedContent:{title,objective:title,scope:title,acceptanceCriteria:title,features:[]},needsRefresh:false};}
test('deleting BR-001 with zero mapped Jira issues preserves BR-004 and its TC-170 hierarchy',()=>fixture(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.write(registry,'demo',state.revision,next=>{
  next.brs=[record('BR-001','Old request'),record('BR-004','GATE project approval')];
  next.synced={'BR-004':{key:'TC-170',kind:'Epic'},'BR-004/F-1':{key:'TC-171',kind:'Feature'}};
  next.completedCycles=[{id:'first',requirements:[{id:'BR-001',title:'Old request',jiraIssues:[]},{id:'BR-004',title:'GATE project approval',jiraKey:'TC-170',jiraIssues:[{path:'BR-004',key:'TC-170'},{path:'BR-004/F-1',key:'TC-171'}]}]}];
 });
 assert.deepEqual(remote.getJiraRows(state,['BR-001'],fakeConfig),[]);
 const deleted=await workflow.forceDeleteBusinessRequirement(registry,'demo',state.revision,{brId:'BR-001',expectedJiraKeys:[],remoteDeletionJobId:'11111111-1111-1111-1111-111111111111'});
 assert.deepEqual(deleted.brs.map(br=>br.id),['BR-004']);
 assert.equal(deleted.synced['BR-004'].key,'TC-170');
 assert.equal(deleted.synced['BR-004/F-1'].key,'TC-171');
 assert.deepEqual(deleted.completedCycles[0].requirements.map(br=>br.id),['BR-004']);
 assert.equal(deleted.deletedRequirements.at(-1).jiraIssues.length,0);
}));
test('verified remote deletion clears active saved Jira work history for target BR only',()=>fixture(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.write(registry,'demo',state.revision,next=>{
  next.brs=[record('BR-001','Old request'),record('BR-004','GATE project approval')];
  next.synced={'BR-001':{key:'TC-100',kind:'Epic'},'BR-001/F-1':{key:'TC-101',kind:'Feature'},'BR-004':{key:'TC-170',kind:'Epic'}};
  next.jiraWorkHistory={'TC-100':{status:'Done'},'TC-101':{status:'In Progress'},'TC-170':{status:'To Do'}};
  next.completedCycles=[{requirements:[{id:'BR-001',jiraIssues:[{path:'BR-001',key:'TC-100'}]},{id:'BR-004',jiraIssues:[{path:'BR-004',key:'TC-170'}]}]}];
 });
 const deleted=await workflow.forceDeleteBusinessRequirement(registry,'demo',state.revision,{brId:'BR-001',expectedJiraKeys:['TC-100','TC-101'],remoteDeletionJobId:'11111111-1111-1111-1111-111111111111'});
 assert.deepEqual(Object.keys(deleted.jiraWorkHistory),['TC-170']);
 assert.equal(deleted.synced['BR-004'].key,'TC-170');
 assert.deepEqual(deleted.deletedRequirements.at(-1).jiraIssues.map(i=>i.key).sort(),['TC-100','TC-101']);
}));
test('local-only BR removal does not falsely clear saved Jira work history',()=>fixture(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.write(registry,'demo',state.revision,next=>{
  next.brs=[record('BR-001','Old request')];next.synced={'BR-001':{key:'TC-100',kind:'Epic'}};
  next.jiraWorkHistory={'TC-100':{status:'In Progress'}};
 });
 const deleted=await workflow.forceDeleteBusinessRequirement(registry,'demo',state.revision,{brId:'BR-001',expectedJiraKeys:['TC-100']});
 assert.equal(deleted.jiraWorkHistory['TC-100'].status,'In Progress');
 assert.equal(deleted.deletedRequirements.at(-1).remoteRecordsPreserved,true);
}));
test('deletion completion invalidates webview inventory and stale publish-plan state',async()=>{
 const ext=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(ext,/type:'brDeletedEverywhere',projectId:deletionProjectId/);
 assert.match(ext,/No verified remote links belonged to the selected BR/);
 assert.match(await fs.readFile(path.join(__dirname,'../src/br-deletion-preview.js'),'utf8'),/NO VERIFIED JIRA LINKS are mapped to the selected BR/);
 assert.match(ui,/if\(msg\.type==='brDeletedEverywhere'\)/);
 assert.match(ui,/jiraInventoryRequest\+\+; \/\/ Reject any pre-deletion in-flight Jira batches/);
 assert.match(ui,/jiraInventoryItems=\[\];jiraInventoryPage=0/);
 assert.match(ui,/jiraPublicationPlan=\[\];jiraPublicationConfirmed\.clear\(\)/);
 assert.match(ui,/if\(activeId&&projectConnectionsSnapshot\.jira\?\.key\)searchJiraInventory\(\)/);
 assert.doesNotMatch(ui,/if\(msg\.type==='brDeletedEverywhere'\)[\s\S]*?jiraInventoryItems\.filter\(.*brId/);
});
