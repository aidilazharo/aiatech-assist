'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const workflow=require('../src/br-workflow');
const {ProjectRegistry}=require('../src/projects');
const req=(tasks=[{title:'Validate claim',description:'Validate claim amount'}])=>({title:'Insurance Claims',objective:'Process submitted claims',scope:'Customer claim intake',acceptanceCriteria:'Claims are validated',features:[{title:'Claims intake',description:'Intake module',stories:[{title:'Submit claim',description:'Submit and validate claim',tasks}]}]});
async function fixture(run){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv82-'));
 try{
  const registry=new ProjectRegistry(home);await registry.create({id:'demo',name:'Demo'});
  let state=await workflow.load(registry,'demo');
  state=await workflow.imported(registry,'demo',state.revision,{name:'requirements.pdf',digest:'e'.repeat(64)});
  state=await workflow.discoverySaved(registry,'demo',state.revision,'D1');
  state=await workflow.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:'Reviewed'});
  state=await workflow.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[req()]});
  state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:req(),actor:'BA'});
  state=await workflow.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
  return await run(registry,state);
 }finally{await fs.rm(home,{recursive:true,force:true});}
}
test('new BR maps parent Story and role subtasks while preserving original Task',()=>fixture(async(_r,state)=>{
 const nodes=workflow.flattenApproved(state.brs);
 assert.deepEqual(nodes.slice(0,4).map(n=>n.kind),['Epic','Feature','Story','Task']);
 assert.equal(nodes[2].issueLevel,'standard');assert.equal(nodes[2].parent,nodes[0].path);assert.equal(nodes.filter(n=>n.kind==='Role').length,3);
 assert.equal(nodes[3].parent,nodes[2].path);
 assert.equal(nodes[3].storyPath,nodes[2].path);
 assert.match(nodes[3].description,/BR story: Submit claim/);
 assert.match(nodes[3].description,/ATGV story reference: BR-001\/F-001\/S-001/);
 assert.ok(workflow.asMarkdown(state.brs[0]).includes('Task 1: Validate claim'));
}));
test('new draft preserves old approved content and Jira mappings and rejects direct edit of approved BR',()=>fixture(async(registry,state)=>{
 const original=JSON.stringify(state.brs[0].approvedContent),oldRevision=state.brs[0].approvedRevision;
 await assert.rejects(workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:req()}),/Only draft/);
 state=await workflow.beginRevision(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 assert.equal(state.brs[0].status,'draft');assert.equal(state.brs[0].approvedRevision,oldRevision);
 assert.equal(JSON.stringify(state.brs[0].approvedContent),original);
 assert.equal(state.brs[0].draftSavedAt,null);
 await assert.rejects(workflow.approve(registry,'demo',state.revision,{brId:'BR-001'}),/Save the BR draft/);
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:req(),actor:'BA'});
 await assert.rejects(workflow.approve(registry,'demo',state.revision,{brId:'BR-001'}),/no content changes/);
}));
test('task-only change increments revision and updates original Jira task without duplicating',()=>fixture(async(registry,state)=>{
 const oldTask=workflow.plan(state).find(item=>item.kind==='Task');
 const oldNodePath=oldTask.path;
 state=await workflow.recorded(registry,'demo',state.revision,{path:oldNodePath,action:'create',key:'DEMO-108',hash:oldTask.hash,kind:'Task',issueType:'Sub-task',remoteDigest:'a'.repeat(64)});
 state=await workflow.beginRevision(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 const revised=req([{title:'Validate claim',description:'Validate claim amount and currency'}]);
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:revised,actor:'BA'});
 assert.equal(state.brs[0].features[0].stories[0].tasks[0].id,'T-001');
 state=await workflow.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 assert.equal(state.brs[0].approvedRevision,2);
 assert.equal(state.brs[0].approvedRevisions.length,2);
 assert.ok(state.brs[0].approvedRevisions[0].content.features[0].stories[0].tasks[0].description.includes('Validate claim amount'));
 assert.equal(state.brs[0].approvedContent.features[0].stories[0].tasks[0].description,'Validate claim amount and currency');
 const taskChanges=workflow.plan(state).filter(item=>item.kind==='Task');
 assert.equal(taskChanges.length,1);
 assert.equal(taskChanges[0].action,'update');
 assert.equal(taskChanges[0].key,'DEMO-108');
 assert.equal(taskChanges[0].path,oldNodePath);
 assert.equal(state.synced[oldNodePath].key,'DEMO-108');
}));
test('adding a task produces only a new Task, removing one proposes retirement',()=>fixture(async(registry,state)=>{
 let oldTask=workflow.plan(state).find(item=>item.kind==='Task');
 state=await workflow.recorded(registry,'demo',state.revision,{path:oldTask.path,action:'create',key:'DEMO-200',hash:oldTask.hash,kind:'Task',remoteDigest:'b'.repeat(64)});
 state=await workflow.beginRevision(registry,'demo',state.revision,{brId:'BR-001'});
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:req([{title:'Validate claim',description:'Validate claim amount'},{title:'Notify claimant',description:'Send an email'}])});
 state=await workflow.approve(registry,'demo',state.revision,{brId:'BR-001'});
 let tasks=workflow.plan(state).filter(item=>item.kind==='Task');
 assert.equal(tasks.length,1);assert.equal(tasks[0].action,'create');assert.equal(tasks[0].title,'Notify claimant');
 state=await workflow.beginRevision(registry,'demo',state.revision,{brId:'BR-001'});
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:req([{title:'Notify claimant',description:'Send an email'}])});
 state=await workflow.approve(registry,'demo',state.revision,{brId:'BR-001'});
 tasks=workflow.plan(state).filter(item=>item.kind==='Task');
 const retired=tasks.filter(item=>item.action==='retire');
 assert.equal(retired.length,1);assert.equal(retired[0].key,'DEMO-200');assert.equal(retired[0].requiresApproval,true);
 assert.ok(tasks.some(item=>item.action==='create'&&item.title==='Notify claimant'));
}));
test('explicit task identifiers keep Jira issue identity after renaming',()=>fixture(async(registry,state)=>{
 state=await workflow.beginRevision(registry,'demo',state.revision,{brId:'BR-001'});
 const changed=req([{id:'T-001',title:'Verify invoice',description:'Verify policy invoice'}]);
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:changed});
 assert.equal(state.brs[0].features[0].stories[0].tasks[0].id,'T-001');
 assert.equal(state.brs[0].features[0].stories[0].tasks[0].title,'Verify invoice');
}));
test('stale revision and second revision before approval are rejected',()=>fixture(async(registry,state)=>{
 const stale=state.revision;
 state=await workflow.beginRevision(registry,'demo',state.revision,{brId:'BR-001'});
 await assert.rejects(workflow.beginRevision(registry,'demo',stale,{brId:'BR-001'}),/changed/);
 await assert.rejects(workflow.beginRevision(registry,'demo',state.revision,{brId:'BR-001'}),/Only an approved BR/);
}));
test('webview exposes revision action and Jira Task mapping is recognized as a Sub-task',()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.ok(source.includes("case 'brBeginRevision':"));
 assert.ok(source.includes('id="brEditRevision"'));
 assert.ok(ui.includes('Create New Revision'));
 assert.ok(ui.includes("send('brBeginRevision'"));
 assert.ok(source.includes("['Story','Task','Role'].includes(item.kind)"));
});

test('Task limit prevents silently discarding imported or edited tasks',()=>{
 const many=Array.from({length:17},(_,i)=>({title:'Task '+i,description:'Description '+i}));
 assert.throws(()=>workflow.validateProposal([req(many)]),/Too many tasks/);
});

test('AI regeneration detects a Task-only change without creating a duplicate BR or Task ID',()=>fixture(async(registry,state)=>{
 const changed=req([{title:'Validate claim',description:'Validate claim amount and policy limits'}]);
 state=await workflow.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[changed]});
 assert.equal(state.brs.length,1);
 assert.equal(state.brs[0].status,'draft');
 assert.equal(state.brs[0].features[0].stories[0].tasks[0].id,'T-001');
 assert.equal(state.impact.find(item=>item.id==='BR-001').change,'modified');
}));
