'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const discovery=require('../src/ba-discovery');
const A='a'.repeat(64),B='b'.repeat(64);
const doc=(name,digest)=>({name,digest,storedName:digest+'.pdf',characters:120,uploadedBy:'Business Analyst'});
const fixture=async fn=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv89-restart-'));
 try{const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});return await fn(registry,root);}finally{await fs.rm(root,{recursive:true,force:true});}
};
const content={title:'Access management',objective:'User access validation',scope:'Business users',acceptanceCriteria:'Approved access',features:[]};
async function approvedState(registry){
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[doc('requirements.pdf',A)]);
 state=await br.selectSources(registry,'demo',state.revision,[A]);
 state=await br.completeSourceMapping(registry,'demo',state.revision,{digests:[A],proposals:[{filename:'requirements.pdf',answers:{problem:'Access management'}}]});
 state=await br.discoverySaved(registry,'demo',state.revision,'D1',{answers:{problem:'Access management'}});
 state=await br.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 state=await br.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[content]});
 state=await br.edit(registry,'demo',state.revision,{brId:'BR-001',content,actor:'BA'});
 state=await br.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 state=await br.write(registry,'demo',state.revision,next=>{
  next.synced={'BR-001':{key:'TEST-1',action:'create',hash:'x'}};
  next.changeQueue=[{id:'pending-1',status:'pending',origin:'discovery'}];
  next.discoveryProposals=[{id:'old',status:'pending'}];
 });
 return state;
}
test('identical document restart resets mapping and generated outputs while preserving approved revision and Jira key',()=>fixture(async(registry,root)=>{
 let state=await approvedState(registry);
 const approved=structuredClone(state.brs[0].approvedContent);
 const draft=path.join(root,'projects','demo','documents','requirements','draft-brs','BR-001.md');
 assert.equal((await fs.stat(draft)).isFile(),true);
 state=await br.addSources(registry,'demo',state.revision,[doc('requirements.pdf',A)],{restart:true,actor:'BA',restartedNames:['requirements.pdf']});
 assert.equal(state.restartPending,true);
 assert.equal(state.mappingCompleted,null);
 assert.deepEqual(state.processedSources,[]);
 assert.equal(state.reviewRevision,'');
 assert.equal(state.reviewText,'');
 assert.equal(state.discoveryRevision,'');
 assert.deepEqual(state.discoveryProposals,[]);
 assert.equal(state.changeQueue[0].status,'superseded');
 assert.deepEqual(state.brs[0].approvedContent,approved);
 assert.equal(state.brs[0].needsRefresh,true);
 assert.equal(state.brs[0].status,'retire-proposed');
 assert.equal(state.synced['BR-001'].key,'TEST-1');
 assert.equal((await fs.stat(draft).catch(()=>null)),null);
 const archived=path.join(root,'projects','demo','documents','requirements','restart-history');
 const folders=await fs.readdir(archived);
 assert.equal(folders.length,1);
 assert.equal((await fs.stat(path.join(archived,folders[0],'BR-001.md'))).isFile(),true);
 assert.equal(state.restartHistory.length,1);
 assert.equal(state.restartHistory[0].jiraKeysPreserved[0],'TEST-1');
 state=await br.selectSources(registry,'demo',state.revision,[A]);
 assert.equal(state.restartPending,true);
}));
test('changed file with same filename starts fresh and supersedes previous source',()=>fixture(async registry=>{
 let state=await approvedState(registry);
 state=await br.addSources(registry,'demo',state.revision,[doc('requirements.pdf',B)],{restart:true,restartedNames:['requirements.pdf']});
 assert.equal(state.sourceDocuments[0].digest,B);
 assert.equal(state.archivedSources.find(x=>x.digest===A).status,'superseded');
 assert.equal(state.restartPending,true);
}));
test('same content with new filename restarts without keeping duplicate active sources',()=>fixture(async registry=>{
 let state=await approvedState(registry);
 state=await br.addSources(registry,'demo',state.revision,[doc('new-name.pdf',A)],{restart:true,restartedNames:['requirements.pdf']});
 assert.deepEqual(state.sourceDocuments.map(x=>x.name),['new-name.pdf']);
 assert.equal(state.brs.length,1);
}));
test('unapproved draft output is replaced, approved history remains',()=>fixture(async registry=>{
 let state=await approvedState(registry);
 state=await br.write(registry,'demo',state.revision,next=>next.brs.push({id:'BR-002',title:'Draft only',status:'draft',approvedContent:null}));
 state=await br.addSources(registry,'demo',state.revision,[doc('requirements.pdf',A)],{restart:true,restartedNames:['requirements.pdf']});
 assert.deepEqual(state.brs.map(x=>x.id),['BR-001']);
 assert.deepEqual(state.restartHistory[0].removedDraftIds,['BR-002']);
}));
test('invalid restart is refused and does not modify project',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[doc('requirements.pdf',A)]);
 const before=state.revision;
 await assert.rejects(br.addSources(registry,'demo',state.revision,[doc('other.pdf',B)],{restart:true,restartedNames:['other.pdf']}),/previously uploaded/);
 state=await br.load(registry,'demo');assert.equal(state.revision,before);
 assert.equal(state.sourceDocuments[0].digest,A);
}));
test('archived same-content reupload can confirm restart',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[doc('old.pdf',A)]);
 state=await br.archiveSource(registry,'demo',state.revision,{digest:A});
 state=await br.addSources(registry,'demo',state.revision,[doc('new.pdf',A)],{restart:true,restartedNames:['old.pdf']});
 assert.equal(state.sourceDocuments[0].name,'new.pdf');
 assert.equal(state.archivedSources.length,0);
}));
test('discovery reset writes fresh empty answers and rejects stale writes',()=>fixture(async registry=>{
 let previous=await discovery.load(registry,'demo');
 previous=await discovery.save(registry,'demo',{problem:'Old mapping'},previous.revision);
 const stale=previous.revision;
 const cleared=await discovery.save(registry,'demo',{},stale);
 assert.equal(cleared.readiness.filled,0);
 assert.equal(cleared.answers.problem,'');
 await assert.rejects(discovery.save(registry,'demo',{problem:'stale'},stale),/changed/);
}));
test('webview confirms duplicate before storing and clears preview only on successful restart',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const upload=host.slice(host.indexOf('async function importDiscoveryDocument'),host.indexOf('async function processSelectedDiscoverySources'));
 assert.match(upload,/previousVersions\.find\(x=>x\.digest===doc\.digest\)/);
 assert.ok(upload.indexOf("uiWarning(summary")>=0&&upload.indexOf("uiWarning(summary")<upload.indexOf('sourceStore.store('));
 assert.match(upload,/discoverySourceRevised/);
 assert.match(upload,/discoveryImportCancelled/);
 assert.match(ui,/m\.type==='discoveryRestarted'/);
 assert.match(ui,/brState\?\.restartPending/);
});

test('restart cannot discard pending Jira publication state',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[doc('requirements.pdf',A)]);
 state=await br.write(registry,'demo',state.revision,next=>next.pending['BR-001']={action:'create',hash:'pending'});
 const original=state.revision;
 await assert.rejects(br.addSources(registry,'demo',original,[doc('requirements.pdf',A)],{restart:true,restartedNames:['requirements.pdf']}),/pending Jira publication/);
 state=await br.load(registry,'demo');
 assert.equal(state.revision,original);
 assert.equal(state.pending['BR-001'].action,'create');
}));
