'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ownership=require('../src/br-ownership'),inventory=require('../src/role-jira-inventory');
const register={brs:[{id:'BR-007',status:'approved',approvedContent:{title:'Person Name CRUD'}}],synced:{
 'BR-007':{key:'TC-400',kind:'Epic'},
 'BR-007/F-1':{key:'TC-401',kind:'Feature'},
 'BR-007/F-1/S-1':{key:'TC-402',kind:'Story'},
 'BR-007/F-1/S-1/T-1':{key:'TC-403',kind:'Subtask'},
 'BR-007/F-1/S-1/ROLE-DEVELOPER':{key:'TC-404',kind:'Role'}
},roleTaskMappings:{
 'BR-007/F-1/S-1/ROLE-UIUX':{key:'TC-405',roleId:'uiux'},
 'BR-007/F-1/S-1/ROLE-UAT':{key:'TC-406',roleId:'uat'}
}};
function fixture({owners={},failAt='',wrongRole=false}={}){
 const keys=['TC-400','TC-401','TC-402','TC-403','TC-404','TC-405','TC-406'];
 const state=new Map(keys.map((key,i)=>[key,{key,rev:1,owner:owners[key]||'',type:['Epic','Feature','Story','Subtask','Subtask','Subtask','Subtask'][i],labels:i<4?[]:['atgv-role-'+['software-developer','ux-designer','uat-tester'][i-4]]}]));
 if(wrongRole)state.get('TC-404').labels=['atgv-role-ux-designer'];
 const calls=[];
 return {state,calls,readIssue:async key=>{const row=state.get(key);return {key,fields:{project:{key:'TC'},issuetype:{name:row.type},labels:row.labels,updated:String(row.rev),assignee:row.owner?{accountId:row.owner}:null}};},
 setAssignee:async(key,owner)=>{if(key===failAt)throw Error('Simulated Jira failure');const row=state.get(key);row.owner=owner||'';row.rev++;calls.push(key);}};
}
const args=(f,roleId='software-developer',mode='assign',accountId='user-A')=>({register,brId:'BR-007',projectKey:'TC',roleId,mode,accountId,...f});
test('BR tree retains the hierarchy; role scopes exclude all shared parents',()=>{
 assert.equal(ownership.tree(register,'BR-007').rootKey,'TC-400');
 assert.deepEqual(ownership.roleTree(register,'BR-007').entries.map(x=>x.key),['TC-403','TC-404']);
 assert.deepEqual(ownership.roleTree(register,'BR-007','ux-designer').entries.map(x=>x.key),['TC-405']);
 assert.equal(ownership.fromKey(register,'TC-405'),'BR-007');
});
test('Designer and Developer can independently claim and release the same BR',async()=>{
 const f=fixture({owners:{'TC-400':'parent-owner','TC-401':'feature-owner','TC-402':'story-owner','TC-406':'uat-owner'}});
 await ownership.changeWholeBr(args(f,'ux-designer','assign','designer'));
 await ownership.changeWholeBr(args(f));
 assert.deepEqual(f.calls,['TC-405','TC-403','TC-404']);
 assert.equal(f.state.get('TC-405').owner,'designer');
 assert.equal((await ownership.verifyOwner(args(f))).entries.length,2);
 await ownership.changeWholeBr(args(f,'ux-designer','unassign','designer'));
 assert.equal(f.state.get('TC-403').owner,'user-A');assert.equal(f.state.get('TC-405').owner,'');
 for(const [key,owner] of [['TC-400','parent-owner'],['TC-401','feature-owner'],['TC-402','story-owner'],['TC-406','uat-owner']])assert.equal(f.state.get(key).owner,owner);
});
test('Conflicting ownership or wrong Jira role blocks all writes',async()=>{
 for(const f of [fixture({owners:{'TC-404':'user-B'}}),fixture({wrongRole:true})]){
  await assert.rejects(ownership.changeWholeBr(args(f)),/another user|Role or issue type changed/);
  assert.equal(f.calls.length,0);
 }
});
test('Partial Jira failure rolls back role writes and preserves shared parents',async()=>{
 const f=fixture({failAt:'TC-404',owners:{'TC-400':'parent-owner'}});
 await assert.rejects(ownership.changeWholeBr(args(f)),/rolled back/);
 assert.equal(f.state.get('TC-403').owner,'');assert.equal(f.state.get('TC-400').owner,'parent-owner');
});
test('Role release requires ownership; empty scope cannot claim shared parents',async()=>{
 const f=fixture();
 await assert.rejects(ownership.changeWholeBr(args(f,'software-developer','unassign')),/current role-task owner/);
 await assert.rejects(ownership.changeWholeBr(args(f,'project-manager')),/No mapped tasks/);
 assert.equal(f.calls.length,0);
});
test('Inventory calculates separate ownership on the same shared BR row',()=>{
 const f=fixture({owners:{'TC-400':'parent-owner','TC-403':'user-A','TC-404':'user-A'}});
 const items=[...f.state.values()].map(x=>({...x,assigneeId:x.owner}));
 const rows=inventory.enrich(items,register,'user-A'),root=rows.find(x=>x.brRoot);
 assert.equal(root.mine,false);assert.equal(root.roleScopes['software-developer'].mine,true);
 assert.equal(root.roleScopes['ux-designer'].available,true);
 assert.equal(rows.find(x=>x.key==='TC-405').taskRole,'ux-designer');
});
test('Host and UI wire role-only scope while BR rows remain navigation',()=>{
 const root=path.resolve(__dirname,'..'),host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8'),ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 assert.match(host,/scope=ownership\.roleTree\(register,brId,roleId\)/);
 assert.match(host,/mode:action,roleId:'software-developer'/);
 assert.match(ui,/item\.roleScopes\?\.\[selectedRole\]/);
 assert.match(ui,/item\.taskRole==='ux-designer'/);
 assert.match(ui,/item\.taskRole==='software-developer'/);
});

test('Explicit role-owned Stories and Features can be assigned without claiming shared parents',()=>{
 const reg={...register,synced:{...register.synced,'BR-007/F-2':{key:'TC-407',kind:'Feature',roleId:'sa'},'BR-007/F-2/S-1':{key:'TC-408',kind:'Story',roleId:'sa'}}};
 const entries=ownership.roleTree(reg,'BR-007','solution-architect').entries;
 assert.deepEqual(entries.map(x=>x.key),['TC-407','TC-408']);
 assert.equal(ownership.matchesRoleTask(entries[1],{type:'Story',labels:['atgv-role-solution-architect']}),true);
 assert.equal(ownership.matchesRoleTask(entries[1],{type:'Story',labels:['atgv-role-ux-designer']}),false);
 assert.equal(ownership.matchesRoleTask(entries[1],{type:'Epic',labels:['atgv-role-solution-architect']}),false);
 assert.deepEqual(ownership.roleTree(reg,'BR-007').entries.map(x=>x.key),['TC-403','TC-404']);
});
