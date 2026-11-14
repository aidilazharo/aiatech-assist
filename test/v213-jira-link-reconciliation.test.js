'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const reconciliation=require('../src/jira-link-reconciliation');
const workflow=require('../src/br-workflow');
const projectKey='TC',brId='BR-009';
const config={get:k=>({'jira.projectKey':'TC','jira.email':'person@example.test','jira.baseUrl':'https://example.atlassian.net'})[k]};
function register(){
 const feature={id:'F-1',title:'Check in',description:'Manage visitors',stories:[]};
 return {revision:'unchanged',brs:[{id:brId,status:'approved',needsRefresh:false,approvedContent:{title:'Visitor workflow',objective:'Visitor access',scope:'Visits',acceptanceCriteria:'Works',features:[feature]}}],
  synced:{'BR-009':{key:'TC-315',hash:'a'},'BR-009/F-1':{key:'TC-316',hash:'b'}},pending:{},completedCycles:[{requirements:[{id:brId,jiraKey:'TC-315',jiraIssues:[{key:'TC-315',path:brId},{key:'TC-316',path:'BR-009/F-1'}]}]}],jiraLinkReconciliations:[],events:[]};
}
const request=async()=>({permissions:{BROWSE_PROJECTS:{havePermission:true}}});
const readJira=async(_config,_token,key)=>key==='TC-315'?{key,fields:{project:{key:'TC'}}}:Promise.reject(Error('HTTP 404: Issue does not exist or you do not have permission to see it.'));
test('scan identifies 404 without deleting other mapped issues',async()=>{
 const state=register();const plan=await reconciliation.inspect({register:state,brId,config,token:'dummy',projectId:'project',request,readJira});
 assert.deepEqual(plan.missing.map(r=>r.key),['TC-316']);assert.deepEqual(plan.available.map(r=>r.key),['TC-315']);
 assert.equal(state.synced['BR-009/F-1'].key,'TC-316');
 reconciliation.apply(state,plan,'BA');
 assert.equal(state.synced['BR-009'].key,'TC-315');assert.equal(state.synced['BR-009/F-1'],undefined);
 assert.equal(state.completedCycles[0].requirements[0].jiraIssues.length,2,'immutable history remains unchanged');
 assert.equal(state.jiraLinkReconciliations.length,1);
 assert.ok(reconciliation.suppressedKeys(state,brId).has('TC-316'));
 // A deleted Jira link must not be silently recreated on the next Jira preview.
 assert.equal(workflow.plan(state).some(item=>item.path==='BR-009/F-1'&&item.action==='create'),false);
});
test('permission failure stops reconciliation even when Jira would return 404',async()=>{
 await assert.rejects(()=>reconciliation.inspect({register:register(),brId,config,token:'x',projectId:'p',request:async()=>({permissions:{BROWSE_PROJECTS:{havePermission:false}}}),readJira}),/Browse Projects permission/);
});
test('other HTTP failures are not misclassified as absent Jira issues',async()=>{
 await assert.rejects(()=>reconciliation.inspect({register:register(),brId,config,token:'x',projectId:'p',request,readJira:async()=>{throw Error('HTTP 403 forbidden');}}),/403/);
});
test('changed issue mappings and cross-BR references are protected',async()=>{
 const initial=register();const plan=await reconciliation.inspect({register:initial,brId,config,token:'x',projectId:'p',request,readJira});
 initial.synced['BR-009/F-1'].key='TC-399';
 assert.throws(()=>reconciliation.apply(initial,plan,'BA'),/changed during review|remapped/);
 const shared=register();shared.synced['BR-008']={key:'TC-316'};
 assert.throws(()=>reconciliation.savedLinks(shared,brId),/shared by another BR/);
});
test('already reconciled keys are excluded from repeat scans',async()=>{
 const r=register();const p=await reconciliation.inspect({register:r,brId,config,token:'x',projectId:'p',request,readJira});
 reconciliation.apply(r,p,'BA');
 const next=await reconciliation.inspect({register:r,brId,config,token:'x',projectId:'p',request,readJira});
 assert.equal(next.missing.length,0);assert.equal(next.available.length,1);
});
