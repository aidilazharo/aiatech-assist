'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const workflow=require('../src/br-workflow');
const read=file=>require('node:fs').readFileSync(path.join(__dirname,'..',file),'utf8');
const A='a'.repeat(64),B='b'.repeat(64);
const proposal={title:'Business priority approval',objective:'Approve proposed projects',scope:'Business projects',acceptanceCriteria:'Approve after review',features:[]};
const document=(name,digest)=>({name,digest,storedName:digest+'.pdf',characters:200,uploadedBy:'BA'});
async function withProject(cb){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv113-'));
 try{const registry=new ProjectRegistry(home);await registry.create({id:'demo',name:'Demo'});return await cb(registry);}finally{await fs.rm(home,{recursive:true,force:true});}
}
async function approved(registry){
 let state=await workflow.load(registry,'demo');
 state=await workflow.addSources(registry,'demo',state.revision,[document('one.pdf',A)]);
 state=await workflow.commitSourceMapping(registry,'demo',state.revision,{digests:[A],proposals:[{filename:'one.pdf',answers:{problem:'Approve projects'}}]});
 state=await workflow.discoverySaved(registry,'demo',state.revision,'D1',{answers:{problem:'Approve projects'}});
 state=await workflow.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 state=await workflow.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal]});
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:proposal,actor:'Business Analyst'});
 return workflow.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'Business Analyst'});
}
test('AI mapping failure does not modify previously approved BR or review state',()=>withProject(async registry=>{
 let state=await approved(registry);
 state=await workflow.addSources(registry,'demo',state.revision,[document('two.pdf',B)]);
 const original=state.revision,approvedSnapshot=structuredClone(state.brs[0].approvedContent),review=state.reviewRevision;
 await assert.rejects(workflow.commitSourceMapping(registry,'demo',state.revision,{digests:[B],proposals:[{filename:'two.pdf',answers:{problem:78}}]}),/Invalid Discovery answers/);
 state=await workflow.load(registry,'demo');
 assert.equal(state.revision,original);
 assert.equal(state.reviewRevision,review);
 assert.deepEqual(state.brs[0].approvedContent,approvedSnapshot);
 assert.equal(state.brs[0].needsRefresh,false);
 assert.equal(state.mappingCompleted,null); // A new source invalidates prior mapping; failed AI must not restore a stale mapping.
}));
test('atomic mapping commits all selected documents once and refuses stale concurrent writes',()=>withProject(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.addSources(registry,'demo',state.revision,[document('one.pdf',A),document('two.pdf',B)]);
 const before=state.revision;
 state=await workflow.commitSourceMapping(registry,'demo',state.revision,{digests:[A,B],proposals:[{filename:'one.pdf',answers:{problem:'First'}},{filename:'two.pdf',answers:{scope:'Second'}}]});
 assert.deepEqual(state.mappingCompleted.digests,[A,B]);
 assert.equal(state.importEpoch,1);
 assert.equal(state.events.at(-1).atomic,true);
 await assert.rejects(workflow.commitSourceMapping(registry,'demo',before,{digests:[A],proposals:[{filename:'one.pdf',answers:{problem:'Old'}}]}),/changed/);
}));
test('Jira pending retirement is visible after retiring one of the synced requirements',()=>withProject(async registry=>{
 let state=await approved(registry);
 state=await workflow.write(registry,'demo',state.revision,next=>{
  const item=workflow.flattenApproved(next.brs)[0];
  next.synced[item.path]={key:'ATGV-100',hash:crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex'),kind:'Epic'};
 });
 // No reliance on historical event timestamps; retirement of a synced epic must be planned.
 state=await workflow.write(registry,'demo',state.revision,next=>{next.brs[0].status='retired';});
 assert.ok(state.jiraPendingChanges>0);
 assert.equal(state.jiraPendingRetirements,1);
 assert.ok(workflow.plan(state).some(x=>x.action==='retire'));
}));
test('regeneration preserves manually edited stale draft as a prior draft snapshot',()=>withProject(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.addSources(registry,'demo',state.revision,[document('one.pdf',A)]);
 state=await workflow.commitSourceMapping(registry,'demo',state.revision,{digests:[A],proposals:[{filename:'one.pdf',answers:{problem:'Approve projects'}}]});
 state=await workflow.discoverySaved(registry,'demo',state.revision,'D1',{answers:{problem:'Approve projects'}});
 state=await workflow.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 state=await workflow.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal]});
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:{...proposal,objective:'Manually reviewed objective'},actor:'BA'});
 state=await workflow.discoverySaved(registry,'demo',state.revision,'D2',{answers:{problem:'New objective'}});
 state=await workflow.reviewed(registry,'demo',state.revision,{discoveryRevision:'D2',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 state=await workflow.generated(registry,'demo',state.revision,{discoveryRevision:'D2',requirements:[{...proposal,objective:'New objective from AI'}]});
 assert.equal(state.brs[0].objective,'New objective from AI');
 assert.equal(state.brs[0].previousDrafts.at(-1).content.objective,'Manually reviewed objective');
 assert.equal(state.brs[0].previousDrafts.at(-1).discoveryRevision,'D1');
}));
test('BA interface uses one Jira state, blocks fresh but not stale drafts, and prompts on unsaved close',()=>{
 const client=read('media/start.js'),host=read('test/generated/extension-source.txt');
 assert.match(client,/brState\.jiraPendingChanges!==0/);
 assert.match(client,/const durable=\[baMappingComplete\(\)/);
 assert.match(client,/brGenerate:.*freshDraftPending\|\|generatingDone/);
 assert.match(client,/function closeBREditor\(force=false\)/);
 assert.match(client,/if\(!force&&brEditorDirty\)/);
 for(const id of ['brUnsavedModal','brUnsavedSave','brUnsavedDiscard','brUnsavedCancel'])assert.match(host,new RegExp(`id="${id}"`));
 assert.match(host,/brWorkflow\.commitSourceMapping\(/);
 assert.doesNotMatch(host,/await brWorkflow\.selectSources\(registry,activeProject\.id,original\.revision,selected\)/);
});
test('interrupted draft file export keeps durable register and self-heals without changing BR content',()=>withProject(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.addSources(registry,'demo',state.revision,[document('one.pdf',A)]);
 state=await workflow.commitSourceMapping(registry,'demo',state.revision,{digests:[A],proposals:[{filename:'one.pdf',answers:{problem:'Approve projects'}}]});
 state=await workflow.discoverySaved(registry,'demo',state.revision,'D1',{answers:{problem:'Approve projects'}});
 state=await workflow.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 state=await workflow.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal]});
 const dir=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','draft-brs');
 await fs.mkdir(path.dirname(dir),{recursive:true});
 await fs.writeFile(dir,'block draft export folder');
 await assert.rejects(workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:proposal,actor:'BA'}),/draft was saved, but its Markdown export needs retry/);
 state=await workflow.load(registry,'demo');
 assert.ok(state.brs[0].draftSavedAt);
 assert.ok(state.exportJobs['BR-001:draft']);
 assert.equal((await workflow.repairPendingExports(registry,'demo')).failures.length,1);
 await fs.rm(dir);
 const recovered=await workflow.repairPendingExports(registry,'demo');
 assert.equal(recovered.failures.length,0);
 assert.deepEqual(recovered.register.exportJobs,{});
 assert.equal((await fs.readFile(path.join(dir,'BR-001.md'),'utf8')).includes('Portfolio'),false);
 assert.equal((await fs.readFile(path.join(dir,'BR-001.md'),'utf8')).includes(proposal.title),true);
}));
