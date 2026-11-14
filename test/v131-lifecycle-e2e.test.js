'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const repo=require('../src/unified-document-repository'),{collectProjectKnowledge}=require('../src/knowledge-workspace');
const {saveDocumentMarkdown,loadDocument}=require('../src/document-editor');
async function setup(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-131e2e-'));const project='sample',registry={fileFor:()=>path.join(root,'projects',project,'atgv.project.json')};const folder=path.dirname(registry.fileFor());const file=path.join(folder,'documents','development','sprint-plan.md');await fs.mkdir(path.dirname(file),{recursive:true});const text='# Sprint Plan\n\nProject Manager template with manually authored project decisions.\n';await fs.writeFile(file,text);try{return await fn({root,project,registry,folder,file,text});}finally{await fs.rm(root,{recursive:true,force:true});}}
const roles=[{id:'project-manager',tasks:[{id:'plan',label:'Project plan',document:'development/sprint-plan.md'}]}];
test('T01 BR -> role template -> reviewed AI -> save -> approval -> indexed, with no duplicate canonical documents',()=>setup(async f=>{
 const br={id:'BR-001',approvedContent:{title:'Approved project',scope:'Project scope'},approvedRevision:1,approval:{actor:'BA',at:'2026-11-01'}};
 await repo.reconcile(f.registry,f.project,{roles,brs:[br]});
 const proposalId=(await repo.propose(f.registry,f.project,{roleId:'project-manager',taskId:'plan',markdown:f.text+'\nAI-proposed milestones (human review required).\n',baseDigest:repo.sha(f.text),actor:'AI Draft',sourceRefs:[{id:'BR-001',revision:1}]})).result;
 await repo.review(f.registry,f.project,proposalId,{actor:'reviewer',role:'project-manager',decision:'approve'});
 let invoked=0;
 await repo.apply(f.registry,f.project,proposalId,{roleId:'project-manager',taskId:'plan',actor:'owner',save:async(markdown,baseline)=>{invoked++;const read=await fs.readFile(f.file,'utf8');assert.equal(repo.sha(read),baseline);await fs.writeFile(f.file,markdown);return {revision:repo.sha(markdown)};}});
 assert.equal(invoked,1);
 await repo.approveDocument(f.registry,f.project,'project-manager','plan',{actor:'other-reviewer',reviewerRole:'project-manager',expectedDigest:repo.sha(await fs.readFile(f.file,'utf8'))});
 const state=await repo.load(f.registry,f.project);assert.equal(Object.keys(state.documents).length,2);assert.equal(state.documents['sample:role:project-manager/plan'].status,'approved');assert.equal(state.proposals[proposalId].status,'applied');
 const approvedBrPath=path.join(f.folder,'approved-brs','BR-001-revision-1.md');await fs.mkdir(path.dirname(approvedBrPath),{recursive:true});await fs.writeFile(approvedBrPath,'# Approved project\n\nScope from BR-001');
 const knowledge=await collectProjectKnowledge(f.folder);assert.equal(knowledge.length,2);assert.ok(knowledge.some(x=>x.sourceRefs?.some(r=>r.id==='BR-001')));
}));
test('T02 revised BR creates new evidence revision but does not overwrite unrelated role document',()=>setup(async f=>{
 const makeBr=revision=>({id:'BR-001',approvedContent:{title:'BR1',scope:'Change '+revision},approvedRevision:revision,approval:{actor:'BA',at:'2026-11-01'}});
 await repo.reconcile(f.registry,f.project,{roles,brs:[makeBr(1)]});const before=await fs.readFile(f.file,'utf8');await repo.reconcile(f.registry,f.project,{roles,brs:[makeBr(2)]});const state=await repo.load(f.registry,f.project);
 assert.equal(Object.keys(state.documents).length,2);assert.equal(state.documents['sample:br:BR-001'].contentRevision,2);assert.equal(state.documents['sample:br:BR-001'].history.length,1);assert.equal(await fs.readFile(f.file,'utf8'),before);
}));
test('T03 edits with stale local CAS and stale proposal reject instead of losing updates',()=>setup(async f=>{
 await repo.reconcile(f.registry,f.project,{roles});const current=repo.sha(f.text);
 await fs.writeFile(f.file,f.text+'\nnewer editor content\n');
 const stale=await Promise.allSettled([repo.propose(f.registry,f.project,{roleId:'project-manager',taskId:'plan',markdown:f.text+'\nAI proposal\n',baseDigest:'bad',actor:'AI'}),
 repo.recordDocumentSave(f.registry,f.project,'project-manager','plan',f.text+'\nnewer editor content\n',repo.sha(f.text+'\nnewer editor content\n'),'editor')]);
 assert.equal(stale[0].status,'rejected');assert.equal(stale[1].status,'fulfilled');const after=await repo.load(f.registry,f.project);
 assert.equal(after.documents['sample:role:project-manager/plan'].contentRevision,1);
}));
