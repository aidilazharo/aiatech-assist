'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const r=require('../src/br-role-ownership');
const register={brs:[{id:'BR-001',status:'approved',approvedContent:{title:'Example'}}],synced:{'BR-001':{key:'TC-1',kind:'Epic'},'BR-001/F-1':{key:'TC-2',kind:'Feature'}}};
const rows=[{key:'TC-1',id:'100',type:'Epic',brRoot:true,brId:'BR-001',roleScopes:{}},{key:'TC-2',type:'Feature',parentKey:'TC-1'},{key:'TC-3',type:'Task',parentKey:'TC-2',labels:['atgv-role-qa-engineer'],updated:'1'},{key:'TC-4',type:'Task',parentKey:'TC-2',labels:['atgv-role-software-developer'],updated:'1'},{key:'TC-5',type:'Task',parentKey:'TC-2',labels:[]},{key:'TC-6',type:'Task',parentKey:'TC-2',labels:['atgv-role-qa-engineer','atgv-role-software-developer']}];
test('zero-task role ownership remains visible independently of task assignment',async()=>{
 const store=Object.create(r.Store.prototype);let saved;
 store.save=async(_,docs)=>{saved=docs;};
 const state={documents:{}};
 await store.set({state,epic:'TC-1',issueId:'100',brId:'BR-001',roleId:'qa-engineer',actorId:'qa',targetId:'qa',targetName:'QA user'});
 const scope=r.overlay(rows,saved,'qa',['qa-engineer','software-developer'])[0].roleScopes;
 assert.equal(scope['qa-engineer'].mine,true);assert.equal(scope['qa-engineer'].count,0);assert.equal(scope['software-developer'].available,true);
 await assert.rejects(store.set({state:{documents:saved},epic:'TC-1',issueId:'100',brId:'BR-001',roleId:'qa-engineer',actorId:'other',targetId:'other'}),/another user/i);
 assert.equal(r.recordFor(saved,'TC-1','qa-engineer','999'),null);
});
test('new explicit role tasks follow only their verified BR hierarchy and role',()=>{
 assert.deepEqual(r.candidates({items:rows,register,epic:'TC-1',brId:'BR-001',roleId:'qa-engineer'}).map(x=>x.item.key),['TC-3']);
 assert.deepEqual(r.candidates({items:rows,register,epic:'TC-1',brId:'BR-001',roleId:'software-developer'}).map(x=>x.item.key),['TC-4']);
});
test('automatic assignment never overwrites another assignee or stale role ownership',async()=>{
 const owner={epic:'TC-1',issueId:'100',brId:'BR-001',roleId:'qa-engineer',ownerId:'qa',ownerName:'QA',revision:1};
 const records={'TC-1--qa-engineer':owner};let writes=0;
 const result=await r.sync({store:{read:async()=>({documents:records})},records,register,items:rows.map(x=>x.key==='TC-3'?{...x,assigneeId:'other'}:x),projectKey:'TC',readIssue:async()=>{throw Error('must not read');},setAssignee:async()=>writes++});
 assert.equal(writes,0);assert.match(result.warnings[0],/different assignee/);
 const stale=await r.sync({store:{read:async()=>({documents:{}})},records,register,items:rows,projectKey:'TC',readIssue:async()=>{throw Error('must not read');},setAssignee:async()=>writes++});
 assert.equal(writes,0);assert.equal(stale.changed.size,0);
});

test('automatic synchronization assigns a newly labelled task and retains unrelated rows',async()=>{
 const owner={epic:'TC-1',issueId:'100',brId:'BR-001',roleId:'qa-engineer',ownerId:'qa',ownerName:'QA',revision:1};
 const records={'TC-1--qa-engineer':owner};let who='',writes=[];
 const readIssue=async key=>key==='TC-1'?{key,id:'100',fields:{project:{key:'TC'},issuetype:{name:'Epic'}}}:key==='TC-2'?{key,fields:{project:{key:'TC'},issuetype:{name:'Feature'},parent:{key:'TC-1'}}}:{key,fields:{project:{key:'TC'},issuetype:{name:'Task'},labels:['atgv-role-qa-engineer'],parent:{key:'TC-2'},updated:'1',assignee:who?{accountId:who,displayName:'QA user'}:null}};
 const result=await r.sync({store:{read:async()=>({documents:records})},records,register,items:rows,projectKey:'TC',readIssue,setAssignee:async(key,id)=>{writes.push(key);who=id;}});
 assert.deepEqual(writes,['TC-3']);assert.equal(result.changed.get('TC-3').assigneeId,'qa');
 assert.deepEqual(r.scopeTargets({items:rows,register,epic:'TC-1',brId:'BR-001',roleId:'qa-engineer',projectKey:'TC'}).map(x=>x.key),['TC-3']);
});
