'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const artifacts=require('../src/developer-task-artifacts');
const host=require('node:fs').readFileSync(path.resolve(__dirname,'../test/generated/extension-source.txt'),'utf8');
const client=require('node:fs').readFileSync(path.resolve(__dirname,'../media/start.js'),'utf8');

test('Developer Jira progress uses real subtask completion, not an invented percentage',()=>{
 const sample={fields:{status:{name:'In Progress',statusCategory:{key:'indeterminate'}},subtasks:[
  {fields:{status:{statusCategory:{key:'done'}}}},
  {fields:{status:{statusCategory:{key:'new'}}}},
  {fields:{status:{statusCategory:{key:'done'}}}}
 ]}};
 assert.deepEqual(artifacts.progress(sample),{percent:67,label:'2 of 3 subtasks Done',basis:'subtasks',done:2,total:3});
 assert.deepEqual(artifacts.progress({fields:{status:{name:'In Progress',statusCategory:{key:'indeterminate'}}}}),{percent:50,label:'Jira workflow: In Progress',basis:'workflow',done:0,total:0});
 assert.equal(artifacts.progress({fields:{status:{name:'Done',statusCategory:{key:'done'}}}}).percent,100);
});

test('Developer artifact cards use safe per-issue paths, drafts cannot be silently overwritten',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-artifact-'));
 try{
  await assert.rejects(artifacts.read(root,'../../secrets','frontend'),/Invalid Jira/);
  await assert.rejects(artifacts.read(root,'TC-999','../../bad'),/Unsupported/);
  const first=await artifacts.read(root,'TC-199','backend');
  assert.equal(first.exists,false);
  assert.equal(first.path,'documents/jira-artifacts/TC-199/backend.md');
  const saved=await artifacts.save(root,'TC-199','backend','# Backend\n\nPending review','');
  assert.equal(saved.exists,true);assert.ok(saved.revision);assert.match(saved.content,/Pending review/);
  await assert.rejects(artifacts.save(root,'TC-199','backend','overwrite',''),/changed by another editor/);
  const revised=await artifacts.save(root,'TC-199','backend','# Backend\n\nUpdated with evidence',saved.revision);
  assert.notEqual(revised.revision,saved.revision);
  const external=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-foreign-'));
  try{
   await fs.mkdir(path.join(root,'documents','jira-artifacts','TC-200'),{recursive:true});
   await fs.symlink(path.join(external,'outside.md'),path.join(root,'documents','jira-artifacts','TC-200','database.md'));
   await assert.rejects(artifacts.save(root,'TC-200','database','attack',''),/Symlink/);
  }finally{await fs.rm(external,{force:true,recursive:true});}
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('References only report saved designs and distinguish approved from draft',()=>{
 const refs=artifacts.designReferences({designs:{
  mockup:[{id:'one',status:'draft',design:{title:'Screens'}},{id:'two',status:'approved',design:{title:'Approved mockup'}}],
  database:[{id:'db1',status:'draft',design:{title:'Proposed schema'}}],
  architecture:[]
 }});
 assert.equal(refs.length,2);assert.equal(refs[0].proposalId,'two');assert.equal(refs[0].status,'Approved');
 assert.equal(refs[1].status,'Draft');assert.match(refs[1].scope,/Project-wide/);
});

test('Developer My Work shows assigned tasks, progress, clickable artifact cards and design references',()=>{
 for(const id of ['developerTaskDashboard','developerAssignedTickets','developerTicketProgressBar','developerArtifactCards','developerArtifactViewer','developerTaskReferences'])assert.match(host,new RegExp(`id="${id}"`));
 for(const command of ['developerTaskDetail','developerArtifactRead','developerArtifactSave'])assert.match(host,new RegExp(`case '${command}':`));
 assert.match(host,/issue\.fields\?\.assignee\?\.accountId!==self\.accountId/);
 assert.match(client,/function showDeveloperAssignedTickets\(/);
 assert.match(client,/function selectDeveloperTicket\(/);
 assert.match(client,/function renderDeveloperTaskDetail\(/);
 assert.match(client,/developerArtifactLabels=\{frontend:'Frontend',backend:'API \/ Backend',database:'Database',integration:'Integration',testing:'Testing'\}/);
 assert.match(client,/send\('developerArtifactSave'/);
 assert.match(client,/send\('roleJiraAssign',\{key:item\.key,brId:item\.brId,expectedUpdated:item\.updated,roleId:selectedRole\}\)/);
});
