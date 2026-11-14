'use strict';const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const repo=require('../src/unified-document-repository');const {collectProjectKnowledge}=require('../src/knowledge-workspace');
test('Phase 3 knowledge indexes latest approved BR and approved role revision, excludes drafts',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-knowledge-'));const dir=path.join(root,'projects','sample'),registry={fileFor:()=>path.join(dir,'atgv.project.json')};
 try{
  await fs.mkdir(path.join(dir,'documents','development'),{recursive:true});await fs.mkdir(path.join(dir,'approved-brs'),{recursive:true});
  const rel='documents/development/plan.md',text='# Official project plan\n\nA detailed approved and reviewed project plan for authorized project stakeholders.\n';
  await fs.writeFile(path.join(dir,rel),text);await fs.writeFile(path.join(dir,'documents','development','private-draft.md'),'# Private draft\n\nConfidential draft must never be indexed.');
  await fs.writeFile(path.join(dir,'approved-brs','BR-001-revision-1.md'),'# BR-001 Approved\n\nApproved scope and acceptance criteria.');
  await repo.reconcile(registry,'sample',{roles:[{id:'project-manager',tasks:[{id:'plan',document:'development/plan.md',label:'Project Plan'}]}],brs:[{id:'BR-001',approvedContent:{title:'Approved BR'},approvedRevision:1}]});
  await repo.approveDocument(registry,'sample','project-manager','plan',{actor:'reviewer',reviewerRole:'project-manager',expectedDigest:repo.sha(text)});
  const docs=await collectProjectKnowledge(dir);
  assert.equal(docs.length,2);assert.ok(docs.some(x=>x.id==='sample:br:BR-001'&&x.revision===1));assert.ok(docs.some(x=>x.id==='sample:role:project-manager/plan'&&x.approval));assert.ok(!docs.some(x=>x.text.includes('Private draft')));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Phase 3 knowledge rejects silent inclusion when canonical index is invalid',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-index-'));try{await fs.mkdir(path.join(root,'sdlc'));await fs.writeFile(path.join(root,'sdlc','unified-documents.json'),'{invalid');await assert.rejects(collectProjectKnowledge(root),/Unexpected token|Expected property/);}finally{await fs.rm(root,{recursive:true,force:true});}});
