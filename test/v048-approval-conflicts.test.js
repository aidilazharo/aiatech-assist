'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const br=require('../src/br-workflow');const {ProjectRegistry}=require('../src/projects');
const req=(scope='Staff')=>({title:'Employee accounts',objective:'Manage employee profiles',scope,acceptanceCriteria:'Login succeeds',features:[{title:'Profile',description:'Profile management',stories:[{title:'Update name',description:'Staff changes their name'}]}]});
async function fixture(run){const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv48-'));try{const r=new ProjectRegistry(home);await r.create({id:'demo',name:'Demo'});let s=await br.load(r,'demo');s=await br.imported(r,'demo',s.revision,{name:'r.pdf',digest:'b'.repeat(64)});s=await br.discoverySaved(r,'demo',s.revision,'D1');s=await br.reviewed(r,'demo',s.revision,{discoveryRevision:'D1',text:'Reviewed'});s=await br.generated(r,'demo',s.revision,{discoveryRevision:'D1',requirements:[req()]});s=await br.edit(r,'demo',s.revision,{brId:'BR-001',content:req()});s=await br.approve(r,'demo',s.revision,{brId:'BR-001',actor:'Owner A'});return await run(r,s);}finally{await fs.rm(home,{recursive:true,force:true});}}
test('two conflicting proposals cannot be accepted until one is rejected',()=>fixture(async(r,s)=>{
 s=await br.propose(r,'demo',s.revision,{origin:'role',field:'scope',value:'Only admins',targetIds:['BR-001']},'Architect');
 s=await br.propose(r,'demo',s.revision,{origin:'br',field:'scope',value:'All users',targetIds:['BR-001']},'BA');
 assert.equal(br.proposalConflicts(s).length,1);
 const [a,b]=s.changeQueue.slice(-2);
 await assert.rejects(br.decideProposal(r,'demo',s.revision,{proposalId:a.id,decision:'accept',actor:'Owner'}),/Conflicting proposals/);
 s=await br.decideProposal(r,'demo',s.revision,{proposalId:b.id,decision:'reject',actor:'Owner'});
 s=await br.decideProposal(r,'demo',s.revision,{proposalId:a.id,decision:'accept',actor:'Owner'});
 assert.equal(s.brs[0].scope,'Only admins');
}));
test('pending proposals prevent approval and preserve previous approved revisions',()=>fixture(async(r,s)=>{
 const previous=JSON.stringify(s.brs[0].approvedRevisions[0]);
 s=await br.propose(r,'demo',s.revision,{field:'scope',value:'Partners',targetIds:['BR-001']},'BA');
 s=await br.generated(r,'demo',s.revision,{discoveryRevision:'D1',requirements:[req('Contractors')]});
 s=await br.edit(r,'demo',s.revision,{brId:'BR-001',content:req('Contractors')});
 await assert.rejects(br.approve(r,'demo',s.revision,{brId:'BR-001'}),/pending change proposals/);
 const changeId=s.changeQueue.at(-1).id;
 s=await br.decideProposal(r,'demo',s.revision,{proposalId:changeId,decision:'reject',actor:'Owner'});
 s=await br.edit(r,'demo',s.revision,{brId:'BR-001',content:req('Contractors')});
 s=await br.approve(r,'demo',s.revision,{brId:'BR-001',actor:'Owner B'});
 assert.equal(s.brs[0].approvedRevisions.length,2);
 assert.equal(JSON.stringify(s.brs[0].approvedRevisions[0]),previous);
 assert.equal(s.brs[0].approvedRevisions[1].approval.actor,'Owner B');
}));
test('BR approval and retirement require current document ownership',()=>{
 const code=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 for(const command of ['brApprove','brRetire','brKeep'])assert.match(code,new RegExp("case '"+command+"':[\\s\\S]{0,110}requireBAOwner\\('ba-br-'\\+msg.brId\\)"));
});
