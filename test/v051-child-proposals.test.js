'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const br=require('../src/br-workflow'),{ProjectRegistry}=require('../src/projects');
const req=()=>({title:'Registration',objective:'Register users',scope:'Customers',acceptanceCriteria:'Acceptance verified',features:[{title:'Registration flow',description:'Set up registration',stories:[{title:'Register account',description:'Store profile',tasks:[{title:'Check OTP',description:'Validate phone code'}]}]}]});
test('story and task changes preserve approved snapshots and distinct stable IDs',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv51-'));
 try{
  const r=new ProjectRegistry(home);await r.create({id:'test',name:'Test'});let s=await br.load(r,'test');s=await br.imported(r,'test',s.revision,{name:'source.pdf',digest:'a'.repeat(64)});s=await br.discoverySaved(r,'test',s.revision,'D1');s=await br.reviewed(r,'test',s.revision,{discoveryRevision:'D1',text:'Reviewed'});s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req()]});s=await br.edit(r,'test',s.revision,{brId:'BR-001',content:req()});s=await br.approve(r,'test',s.revision,{brId:'BR-001',actor:'Owner'});
  const task=s.brs[0].features[0].stories[0].tasks[0],approved=JSON.stringify(s.brs[0].approvedContent);
  assert.equal(task.id,'T-001');
  s=await br.propose(r,'test',s.revision,{origin:'jira',sourceId:'JIRA-1',field:'description',value:'OTP with expiration time',targetIds:['BR-001/F-001/S-001/T-001']},'Jira reviewer');
  s=await br.decideProposal(r,'test',s.revision,{proposalId:s.changeQueue.at(-1).id,decision:'accept',actor:'Owner'});
  assert.equal(s.brs[0].status,'draft');assert.equal(s.brs[0].features[0].stories[0].tasks[0].description,'OTP with expiration time');assert.equal(JSON.stringify(s.brs[0].approvedContent),approved);
  assert.equal(s.canonical.records.filter(x=>x.type==='task').length,1);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
