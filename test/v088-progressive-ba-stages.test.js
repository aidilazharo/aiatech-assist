'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const read=name=>require('node:fs').readFileSync(path.join(__dirname,'..',name),'utf8');
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
async function fixture(run){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-ba088-'));
 try{
  const registry=new ProjectRegistry(dir);await registry.create({id:'demo',name:'Demo'});
  let state=await br.load(registry,'demo');
  state=await br.imported(registry,'demo',state.revision,{name:'discovery.pdf',digest:a,documents:[{name:'discovery.pdf',digest:b}]});
  return await run(registry,state);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('successful mapping is recorded only after selected sources and proposals complete',()=>fixture(async(registry,state)=>{
 assert.equal(state.mappingCompleted,null);
 state=await br.selectSources(registry,'demo',state.revision,[b]);
 assert.equal(state.mappingCompleted,null);
 await assert.rejects(br.completeSourceMapping(registry,'demo',state.revision,{digests:[b],proposals:[]}),/All selected documents/);
 assert.equal((await br.load(registry,'demo')).mappingCompleted,null);
 state=await br.completeSourceMapping(registry,'demo',state.revision,{digests:[b],proposals:[{filename:'discovery.pdf',answers:{problem:'Define approvals'}}]});
 assert.equal(state.mappingCompleted.epoch,state.importEpoch);
 assert.deepEqual(state.mappingCompleted.digests,[b]);
 assert.equal(state.mappingCompleted.proposals[0].answers.problem,'Define approvals');
 assert.equal(state.events.at(-1).action,'source-mapping-completed');
 assert.equal((await br.load(registry,'demo')).mappingCompleted.epoch,state.importEpoch);
}));
test('mapping a selected subset remains valid without forcing all uploaded documents into the same mapping',()=>fixture(async(registry,state)=>{
 state=await br.addSources(registry,'demo',state.revision,[
  {name:'discovery.pdf',digest:b,storedName:b+'.pdf'},
  {name:'optional.pdf',digest:c,storedName:c+'.pdf'}
 ]);
 state=await br.selectSources(registry,'demo',state.revision,[b]);
 state=await br.completeSourceMapping(registry,'demo',state.revision,{digests:[b],proposals:[{filename:'discovery.pdf',answers:{}}]});
 assert.deepEqual(state.mappingCompleted.digests,[b]);
 assert.deepEqual(state.mappingCompleted.sourceDigests,[b,c]);
 assert.equal(state.sourceDocuments.length,2);
 assert.equal(state.mappingCompleted.epoch,state.importEpoch);
}));
test('newly uploaded evidence changes the mapping snapshot without deleting approved history',()=>fixture(async(registry,state)=>{
 state=await br.selectSources(registry,'demo',state.revision,[b]);
 state=await br.completeSourceMapping(registry,'demo',state.revision,{digests:[b],proposals:[{filename:'discovery.pdf',answers:{}}]});
 assert.deepEqual(state.mappingCompleted.sourceDigests,[b]);
 state=await br.addSources(registry,'demo',state.revision,[
  {name:'discovery.pdf',digest:b,storedName:b+'.pdf'},
  {name:'new-evidence.pdf',digest:c,storedName:c+'.pdf'}
 ]);
 assert.equal(state.mappingCompleted,null); // New evidence requires remapping; the completed snapshot is no longer valid.
 assert.equal(state.sourceDocuments.length,2);
}));
test('failed and stale mapping cannot activate later stages',()=>fixture(async(registry,state)=>{
 state=await br.selectSources(registry,'demo',state.revision,[b]);
 const staleRevision=state.revision;
 state=await br.selectSources(registry,'demo',state.revision,[b]);
 await assert.rejects(br.completeSourceMapping(registry,'demo',staleRevision,{digests:[b],proposals:[{filename:'discovery.pdf',answers:{}}]}),/register changed/);
 await assert.rejects(br.completeSourceMapping(registry,'demo',state.revision,{digests:[c],proposals:[{filename:'other.pdf',answers:{}}]}),/selection changed/);
 assert.equal((await br.load(registry,'demo')).mappingCompleted,null);
}));
test('re-selecting or replacing evidence invalidates the previous mapped stage',()=>fixture(async(registry,state)=>{
 state=await br.selectSources(registry,'demo',state.revision,[b]);
 state=await br.completeSourceMapping(registry,'demo',state.revision,{digests:[b],proposals:[{filename:'discovery.pdf',answers:{}}]});
 state=await br.selectSources(registry,'demo',state.revision,[b]);
 assert.equal(state.mappingCompleted,null);
}));
test('The four-stage BA screen hides legacy milestone metadata',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js');
 assert.doesNotMatch(host,/<span>READINESS<\/span>/);
 assert.equal((host.match(/data-ba-auto-stage=/g)||[]).length,4);
 assert.match(host,/id="baStartPanel"[^>]*>[\s\S]*id="baCompletedSection"/);
 assert.match(host,/id="baReviewFinish"/);
 assert.match(ui,/ATGVBAStageFlow\.select/);
 assert.match(ui,/showSources/);
 assert.match(ui,/showQuestions/);
 assert.match(ui,/showReview/);
 assert.match(ui,/showDocuments/);
 assert.match(ui,/showJira/);
 assert.match(ui,/else if\(readiness\.needsDecision\)/);
 assert.match(ui,/filled===total/);
 assert.match(ui,/brGenerate:!!baBusyTask\|\|!mine\|\|!\(brState\?\.sourceDocuments\|\|\[\]\)\.length\|\|!reviewGood/);
});
test('Jira preview backend rejects a new unapproved draft',()=>{
 const host=read('test/generated/extension-source.txt');
 assert.match(host,/Save and approve all current-cycle Business Requirements/);
 assert.match(host,/currentRequirements\.some\(item=>item\.status!=='approved'\|\|item\.needsRefresh/);
 assert.match(host,/!item\.archivedFromRestart/);
});
