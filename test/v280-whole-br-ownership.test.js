'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ownership=require('../src/br-ownership');
const register={brs:[{id:'BR-007',status:'approved',needsRefresh:false,approvedContent:{title:'Person Name CRUD'}}],synced:{
 'BR-007':{key:'TC-400',kind:'Epic'},
 'BR-007/feature/frontend':{key:'TC-401',kind:'Feature'},
 'BR-007/feature/frontend/story/add':{key:'TC-402',kind:'Story'},
 'BR-007/feature/frontend/story/add/task/validation':{key:'TC-403',kind:'Subtask'}
}};
function fixture({owners={},failAt=''}={}){
 const state=new Map(Object.values(register.synced).map(x=>[x.key,{key:x.key,rev:1,owner:owners[x.key]||''}]));
 const calls=[];
 return {state,calls,
  readIssue:async key=>{const row=state.get(key);return {key,fields:{project:{key:'TC'},updated:String(row.rev),assignee:row.owner?{accountId:row.owner}:null}};},
  setAssignee:async(key,owner)=>{if(key===failAt)throw Error('Simulated Jira failure'); const row=state.get(key);row.owner=owner||'';row.rev++;calls.push({key,owner});}
 };
}
test('BR owner scope preserves Epic, Feature, Story and Subtask hierarchy',()=>{
 const scope=ownership.tree(register,'BR-007');
 assert.equal(scope.rootKey,'TC-400');assert.equal(scope.entries.length,4);
 assert.equal(ownership.fromKey(register,'TC-403'),'BR-007');
 assert.throws(()=>ownership.tree(register,'BR-008'),/approved/);
});
test('Assign Entire BR updates every mapped Jira issue',async()=>{
 const f=fixture();const result=await ownership.changeWholeBr({register,brId:'BR-007',projectKey:'TC',accountId:'user-A',mode:'assign',...f});
 assert.equal(result.count,4);assert.equal(f.calls.length,4);
 assert.deepEqual([...f.state.values()].map(x=>x.owner),Array(4).fill('user-A'));
});
test('Developer gate requires ownership of the entire Jira hierarchy',async()=>{
 const f=fixture({owners:{'TC-400':'user-A','TC-401':'user-A','TC-402':'user-A','TC-403':'user-A'}});
 assert.equal((await ownership.verifyOwner({register,brId:'BR-007',projectKey:'TC',accountId:'user-A',readIssue:f.readIssue})).entries.length,4);
 f.state.get('TC-403').owner='';
 await assert.rejects(ownership.verifyOwner({register,brId:'BR-007',projectKey:'TC',accountId:'user-A',readIssue:f.readIssue}),/Assign Entire BR/);
});
test('One owned descendant prevents any partial assignment',async()=>{
 const f=fixture({owners:{'TC-403':'user-B'}});
 await assert.rejects(ownership.changeWholeBr({register,brId:'BR-007',projectKey:'TC',accountId:'user-A',mode:'assign',...f}),/another user/);
 assert.equal(f.calls.length,0);
});
test('Partial Jira failure rolls back successfully assigned children and Epic',async()=>{
 const f=fixture({failAt:'TC-403'});
 await assert.rejects(ownership.changeWholeBr({register,brId:'BR-007',projectKey:'TC',accountId:'user-A',mode:'assign',...f}),/rolled back/);
 assert.deepEqual([...f.state.values()].map(x=>x.owner),['','','','']);
});
test('Only owner can release the entire BR and release never deletes Jira objects',async()=>{
 const f=fixture({owners:Object.fromEntries(Object.values(register.synced).map(x=>[x.key,'user-A']))});
 const result=await ownership.changeWholeBr({register,brId:'BR-007',projectKey:'TC',accountId:'user-A',mode:'unassign',...f});
 assert.equal(result.changed,4);assert.deepEqual([...f.state.values()].map(x=>x.owner),['','','','']);
 const other=fixture();await assert.rejects(ownership.changeWholeBr({register,brId:'BR-007',projectKey:'TC',accountId:'user-A',mode:'unassign',...other}),/current BR Epic owner/);
});
test('Webview and host enforce whole-BR ownership rather than individual issue claim',()=>{
 const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8'),ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 assert.match(host,/case 'developerBrAssignment':[\s\S]*?scope\.rootKey/);
 assert.match(host,/case 'devAssignJira':[\s\S]*?Individual Jira Story\/subtask assignment is disabled/);
 assert.match(host,/case 'roleJiraIssues':[\s\S]*?role-jira-inventory'\)\.enrich/);
 assert.match(fs.readFileSync(path.join(root,'src/role-jira-inventory.js'),'utf8'),/brRoot:!!root/);
 assert.match(ui,/btn\.textContent=!item\.brRoot\?'View Only':item\.mine\?'Release Entire BR'/);
 assert.match(ui,/mine=rows\.filter\(item=>item\.mine&&item\.brRoot\)/);
 assert.match(ui,/return developerAssignedMine\.filter\(item=>item\.brRoot&&item\.brId===br\)/);
});
