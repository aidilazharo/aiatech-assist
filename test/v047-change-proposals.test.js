'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const br=require('../src/br-workflow');const {ProjectRegistry}=require('../src/projects');
const req=()=>({title:'Accounts',objective:'Create accounts',scope:'Employees only',acceptanceCriteria:'Tests pass',features:[{title:'Create account',description:'Creation',stories:[{title:'Register',description:'Successful registration'}]}]});
async function fixture(run){const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv47-'));try{const r=new ProjectRegistry(home);await r.create({id:'test',name:'Test'});let s=await br.load(r,'test');s=await br.imported(r,'test',s.revision,{name:'req.pdf',digest:'a'.repeat(64)});s=await br.discoverySaved(r,'test',s.revision,'D1');s=await br.reviewed(r,'test',s.revision,{discoveryRevision:'D1',text:'Reviewed'});s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req()]});s=await br.edit(r,'test',s.revision,{brId:'BR-001',content:req()});s=await br.approve(r,'test',s.revision,{brId:'BR-001'});return await run(r,s);}finally{await fs.rm(home,{recursive:true,force:true});}}
test('controlled proposal updates draft only while retaining approved snapshot',()=>fixture(async(r,s)=>{
 const original=JSON.stringify(s.brs[0].approvedContent);
 s=await br.propose(r,'test',s.revision,{origin:'br',field:'scope',value:'Employees and partners',targetIds:['BR-001']},'BA1');
 const pending=s.changeQueue.at(-1);
 assert.equal(s.brs[0].status,'approved');
 s=await br.decideProposal(r,'test',s.revision,{proposalId:pending.id,decision:'accept',actor:'Owner1'});
 assert.equal(s.brs[0].status,'draft');assert.equal(s.brs[0].scope,'Employees and partners');
 assert.equal(JSON.stringify(s.brs[0].approvedContent),original);
 assert.equal(s.changeQueue.at(-1).status,'accepted');
}));
test('rejected proposal does not change requirements',()=>fixture(async(r,s)=>{
 s=await br.propose(r,'test',s.revision,{origin:'role',field:'scope',value:'No access',targetIds:['BR-001']},'Architect');
 s=await br.decideProposal(r,'test',s.revision,{proposalId:s.changeQueue.at(-1).id,decision:'reject',actor:'Owner1'});
 assert.equal(s.brs[0].scope,'Employees only');assert.equal(s.brs[0].status,'approved');
}));
test('stale proposal cannot overwrite a more recent saved change',()=>fixture(async(r,s)=>{
 s=await br.propose(r,'test',s.revision,{origin:'br',field:'scope',value:'Scope change',targetIds:['BR-001']},'BA1');
 const id=s.changeQueue.at(-1).id;
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[{...req(),scope:'Employees and contractors'}]});
 await assert.rejects(br.decideProposal(r,'test',s.revision,{proposalId:id,decision:'accept',actor:'Owner1'}),/changed since/);
}));
test('discovery scope changes propose revisions without changing approved snapshot',()=>fixture(async(r,s)=>{
 s=await br.discoverySaved(r,'test',s.revision,'D2',{answerChanges:[{key:'scope',before:'Employees only',after:'Employees and partners'}]});
 assert.equal(s.changeQueue.filter(x=>x.origin==='discovery').length,0);
 assert.equal(s.brs[0].approvedContent.scope,'Employees only');
 // With no verified source-to-BR provenance, the BA must explicitly target the change.
 s=await br.propose(r,'test',s.revision,{origin:'br',field:'scope',value:'Employees and partners',targetIds:['BR-001']},'BA');
 assert.deepEqual(s.changeQueue.at(-1).targetIds,['BR-001']);assert.equal(s.brs[0].status,'approved');
}));
test('change proposals reject duplicate targets and stale register writes',()=>fixture(async(r,s)=>{
 await assert.rejects(br.propose(r,'test',s.revision,{field:'scope',value:'X',targetIds:['BR-001','BR-001']},'BA'),/distinct/);
 const applied=await br.propose(r,'test',s.revision,{field:'scope',value:'Y',targetIds:['BR-001']},'BA');
 await assert.rejects(br.propose(r,'test',s.revision,{field:'scope',value:'Z',targetIds:['BR-001']},'BA'),/changed/);
 assert.equal(applied.changeQueue.length,1);
}));
test('BA interface includes proposal form and ownership-gated decisions',()=>{
 const html=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(html,/brProposalSubmit/);assert.match(ui,/function renderChangeProposals/);assert.match(html,/requireBAOwner\('ba-br-'\+root\)/);
});
