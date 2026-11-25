'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {reconcileAfterSave}=require('../src/architect-server-verification');
const sha='a'.repeat(40), prepared={stackId:'react',root:'/tmp/example',sha,branch:'bootstrap/react-1'};
const project={id:'sample',techStackId:'react',techStackCompanionId:'',techStackPrepared:prepared,techStackValidation:{status:'tested',stackId:'react',sha,companionId:''}};
const healthy={running:true,healthy:true,sha,branch:prepared.branch,url:'http://127.0.0.1:5173/'};
test('single Save Stack reconciles live server after commit and retries without user action',async()=>{
 let checks=0;
 const result=await reconcileAfterSave({project,verify:async()=>++checks===1?{...healthy,healthy:false}:healthy,sleep:async()=>{}});
 assert.equal(checks,2);assert.equal(result.proof.sha,sha);assert.equal(result.restarted,false);
});
test('single Save Stack restarts only a stopped ATGV-selected server',async()=>{
 let running=false,started=0;
 const result=await reconcileAfterSave({project,verify:async()=>running?healthy:{running:false,otherRunning:false},start:async()=>{started++;running=true;},sleep:async()=>{}});
 assert.equal(started,1);assert.equal(result.restarted,true);assert.equal(result.proof.sha,sha);
});
test('single Save Stack never seizes an occupied server or accepts the wrong SHA',async()=>{
 let started=0;
 const result=await reconcileAfterSave({project,verify:async()=>({...healthy,sha:'b'.repeat(40)}),start:async()=>{started++;},sleep:async()=>{}});
 assert.equal(result.proof,null);assert.equal(started,0);
 const conflict=await reconcileAfterSave({project,verify:async()=>({running:false,otherRunning:true}),start:async()=>{started++;},sleep:async()=>{}});
 assert.equal(conflict.proof,null);assert.equal(started,0);
});
test('Save Stack persists final Git revision before server check, then pushes snapshot to UI',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const block=code.slice(code.indexOf("case 'architectSaveStack':{"),code.indexOf("case 'architectTestStack':{"));
 const remote=block.slice(block.indexOf('let updated=await registry.update(activeProject.id,savedProject)'));
 const index=x=>remote.indexOf(x);
 const local=block.slice(block.indexOf('const localProject=await registry.read'),block.indexOf('const root=await architectRepository.ensure(context.workspaceState'));
 assert.ok(local.indexOf('registry.update(projectId,{...latest,techStackId:id')>=0);
 assert.ok(local.indexOf('reconcileAfterSave')>local.indexOf('techStackPrepared:{stackId:id'));
 assert.match(local,/remotePushed:false/);
 assert.ok(index('registry.update(activeProject.id,savedProject)')>=0);
 assert.ok(index('reconcileAfterSave')>index('registry.update(activeProject.id,savedProject)'));
 assert.ok(index("type:'architectServerState'")>index('reconcileAfterSave'));
 assert.match(block,/allowManagedHandoff:false/);
});
