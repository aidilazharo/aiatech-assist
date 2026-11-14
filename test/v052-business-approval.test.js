'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const br=require('../src/br-workflow'),{ProjectRegistry}=require('../src/projects');
const req=()=>({title:'Claims',objective:'Process claims',scope:'Insurance claims',acceptanceCriteria:'Claim processing verified',features:[]});
test('independent business owner approval is content and actor bound',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv52-'));
 try{
  const r=new ProjectRegistry(home);await r.create({id:'test',name:'Test'});let s=await br.load(r,'test');s=await br.imported(r,'test',s.revision,{name:'req.pdf',digest:'b'.repeat(64)});s=await br.discoverySaved(r,'test',s.revision,'D1');s=await br.reviewed(r,'test',s.revision,{discoveryRevision:'D1',text:'Reviewed'});s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req()]});s=await br.edit(r,'test',s.revision,{brId:'BR-001',content:req(),actor:'BA A'});
  await assert.rejects(br.approve(r,'test',s.revision,{brId:'BR-001',actor:'BA A',requireBusinessOwner:true}),/Business Owner approval/);
  await assert.rejects(br.endorse(r,'test',s.revision,{brId:'BR-001',actor:'BA A'}),/own draft/);
  s=await br.endorse(r,'test',s.revision,{brId:'BR-001',actor:'BO B'});
  assert.equal(s.brs[0].businessApproval.actor,'BO B');
  s=await br.approve(r,'test',s.revision,{brId:'BR-001',actor:'BA A',requireBusinessOwner:true});
  assert.equal(s.brs[0].approval.businessOwner.actor,'BO B');
  assert.equal(s.brs[0].approvedRevisions.length,1);
  const approved=JSON.stringify(s.brs[0].approvedContent);
  s=await br.propose(r,'test',s.revision,{origin:'role',field:'scope',value:'Claims and enquiries',targetIds:['BR-001']},'Architect');
  s=await br.decideProposal(r,'test',s.revision,{proposalId:s.changeQueue.at(-1).id,decision:'accept',actor:'BA A'});
  assert.equal(s.brs[0].businessApproval,null);
  assert.equal(JSON.stringify(s.brs[0].approvedContent),approved);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
