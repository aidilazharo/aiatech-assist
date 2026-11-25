'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const live=require('../src/live-published-br'),ownership=require('../src/br-ownership');
const mark='atgv-0123456789abcdef01234567',register={brs:[{id:'BR-007',status:'draft',title:'Unpublished draft',approvedRevision:1}],synced:{},deletedRequirements:[]};
function fixture(description='Published requirement',assignee='a'){
 const items=[{key:'TC-1',id:'101',type:'Epic',summary:'BR-007: Published',labels:[mark],updated:'2026-11-25T10:00:00Z'},{key:'TC-2',id:'102',type:'Story',parentKey:'TC-1',summary:'Story',labels:[],updated:'2026-11-25T10:00:00Z'},{key:'TC-3',id:'103',type:'Subtask',parentKey:'TC-2',summary:'Design',labels:['atgv-role-ux-designer'],updated:'2026-11-25T10:00:00Z'},{key:'TC-4',id:'104',type:'Subtask',parentKey:'TC-2',summary:'Build',labels:['atgv-role-software-developer'],updated:'2026-11-25T10:00:00Z'},{key:'TC-5',id:'105',type:'Task',parentKey:'TC-2',summary:'Other',labels:[],updated:'2026-11-25T10:00:00Z'}];
 const issues=items.map(x=>({key:x.key,id:x.id,names:{customfield_123:'Acceptance Criteria'},fields:{project:{key:'TC'},issuetype:{name:x.type},summary:x.summary,description:x.key==='TC-1'?description:'Exact work',labels:x.labels,updated:x.updated,parent:x.parentKey?{key:x.parentKey}:null,assignee:{accountId:assignee},customfield_123:x.key==='TC-4'?'Check saved value':''}}));
 return {items,issues};
}
async function collect(f,previous={}){return live.collect({register,items:f.items,projectKey:'TC',verifyMarker:(_,x)=>x.labels.includes(mark),readIssue:async key=>f.issues.find(x=>x.key===key),previous});}
test('published Jira alone reconstructs approved BR while preserving the draft and splitting roles',async()=>{
 const result=await collect(fixture());
 assert.equal(result.warnings.length,0);assert.equal(result.snapshots.length,1);
 const next=live.project(register,result.snapshots);
 assert.equal(next.brs[0].status,'approved');assert.equal(next.brs[0].approvedContent.objective,'Published requirement');
 assert.equal(register.brs[0].status,'draft');assert.equal(register.brs[0].title,'Unpublished draft');
 assert.equal(ownership.publishedSnapshot(next,next.brs[0]),true);
 assert.deepEqual(ownership.roleTree(next,'BR-007','software-developer').entries.map(x=>x.key),['TC-4']);
 assert.deepEqual(ownership.roleTree(next,'BR-007','ux-designer').entries.map(x=>x.key),['TC-3']);
 assert.equal(next.brs[0].publishedJiraEvidence.find(x=>x.key==='TC-4').acceptanceCriteria,'Check saved value');
});
test('content changes advance revision, assignment-only changes do not',async()=>{
 const first=(await collect(fixture())).snapshots[0];
 const second=(await collect(fixture('Published requirement','b'),{'TC-1':first})).snapshots[0];
 assert.equal(second.revision,first.revision);assert.equal(second.fingerprint,first.fingerprint);
 const third=(await collect(fixture('New requirement','b'),{'TC-1':second})).snapshots[0];
 assert.ok(third.revision>second.revision);assert.notEqual(third.fingerprint,second.fingerprint);
});
test('changed Jira parent or missing marker cannot produce executable snapshot',async()=>{
 const f=fixture();f.issues[2].fields.parent.key='TC-99';
 const result=await collect(f);assert.equal(result.snapshots.length,0);assert.match(result.warnings[0],/changed during snapshot/);
 const bad=fixture();bad.issues[0].fields.labels=[];
 assert.equal((await collect(bad)).snapshots.length,0);
});
