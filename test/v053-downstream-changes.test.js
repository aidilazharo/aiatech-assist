'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const br=require('../src/br-workflow'),{ProjectRegistry}=require('../src/projects'),{detectCrossSourceConflicts}=require('../src/conflict-engine'),{calculateReadiness}=require('../src/role-readiness');
const req=()=>({title:'Customer Portal',objective:'Secure customer access',scope:'Customer access',acceptanceCriteria:'Authentication tested',features:[{title:'Registration',description:'Customer identity',stories:[]}]});
async function fixture(fn){const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv53-'));try{const r=new ProjectRegistry(home);await r.create({id:'test',name:'Test'});let s=await br.load(r,'test');s=await br.imported(r,'test',s.revision,{name:'requirements.pdf',digest:'b'.repeat(64)});s=await br.discoverySaved(r,'test',s.revision,'D1',{answers:{problem:'Secure customer access',scope:'Customer access',acceptance:'Authentication tested'}});s=await br.reviewed(r,'test',s.revision,{discoveryRevision:'D1',text:'Reviewed'});s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req()]});s=await br.edit(r,'test',s.revision,{brId:'BR-001',content:req(),actor:'BA-1'});s=await br.approve(r,'test',s.revision,{brId:'BR-001',actor:'BA-1'});return await fn(r,s);}finally{await fs.rm(home,{recursive:true,force:true});}}
test('downstream role change remains a review item and blocks old ready handoff',()=>fixture(async(r,s)=>{
 s.synced={'BR-001':{key:'TEST-1',hash:br.plan(s).find(x=>x.path==='BR-001')?.hash}};
 const initial=calculateReadiness({enabled:['business-analyst','solution-architect'],roles:[{id:'business-analyst',label:'BA',tasks:[]},{id:'solution-architect',label:'Architect',tasks:[{id:'design'}]}],dependencies:{'business-analyst':[],'solution-architect':['business-analyst']}},{},s,{});
 assert.ok(initial.handoffs.length);
 s=await br.recordRoleDocumentImpact(r,'test',s.revision,{roleId:'solution-architect',taskId:'design',brId:'BR-001',brRevision:1,contentDigest:'a'.repeat(64),actor:'Architect',excerpt:'Changed architecture decision'});
 assert.equal(s.brs[0].roleReviewRequired,true);assert.equal(s.roleImpacts.at(-1).status,'pending');
 s=await br.decideRoleDocumentImpact(r,'test',s.revision,{impactId:s.roleImpacts.at(-1).id,actor:'BA-1'});
 assert.equal(s.brs[0].roleReviewRequired,false);assert.equal(s.brs[0].approvedContent.title,req().title);
}));
test('Quill-edit amendments prepare Discovery proposals with preserved prior answer',()=>fixture(async(r,s)=>{
 s=await br.propose(r,'test',s.revision,{origin:'br',field:'scope',value:'Customer and broker access',targetIds:['BR-001']},'BA-1');
 s=await br.decideProposal(r,'test',s.revision,{proposalId:s.changeQueue.at(-1).id,decision:'accept',actor:'BA-1'});
 s=await br.edit(r,'test',s.revision,{brId:'BR-001',content:{...req(),scope:'Customers, brokers and delegates'},actor:'BA-1'});
 const proposal=s.discoveryProposals.find(x=>x.key==='scope'&&x.status==='pending');assert.ok(proposal);assert.equal(proposal.before,'Customer access');
 await assert.rejects(br.resolveDiscoveryProposal(r,'test',s.revision,{proposalId:proposal.id,decision:'accept',actor:'BA-1'}),/Save the approved Discovery change/);
 s=await br.resolveDiscoveryProposal(r,'test',s.revision,{proposalId:proposal.id,decision:'reject',actor:'BA-1'});assert.equal(s.discoveryProposals.find(x=>x.id===proposal.id).status,'rejected');
}));
test('opposing source assertions with significant shared language are warned and never automatically resolved',()=>{
 const result=detectCrossSourceConflicts([{id:'BR-001',evidence:[
  {digest:'a'.repeat(64),verified:true,passage:'Customer registration requires mandatory mobile verification before account activation.'},
  {digest:'b'.repeat(64),verified:true,passage:'Customer registration must not require mobile verification before account activation.'}
 ]}]);assert.equal(result.length,1);assert.equal(result[0].status,'review-required');
});
test('JIRA auto-monitor, role impacts and discovery proposals remain opt-in or review-only UI',()=>{
 const js=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');const media=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(js,/monitorJira/);assert.match(js,/scanExternalJira\(\{quiet:true\}\)/);assert.match(js,/case 'brRoleImpactReview'/);assert.match(js,/case 'brDiscoveryProposalDecision'/);
 assert.match(media,/renderRoleImpacts/);assert.match(media,/renderSourceConflicts/);assert.match(media,/renderDiscoveryProposals/);
});
