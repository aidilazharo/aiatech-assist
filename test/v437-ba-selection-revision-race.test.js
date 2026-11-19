'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const guard=require('../src/ba-source-selection-guard');

const dg=c=>c.repeat(64);
const first={name:'GATE-BRD.docx',digest:dg('a'),byteDigest:dg('b'),storedName:dg('a')+'.docx',
 characters:150,uploadedBy:'BA',uploadedAt:'2026-11-19T09:00:00Z'};
const proposals=[{filename:'GATE-BRD.docx',answers:{problem:'The requester shall submit a project initiation form.'}}];
async function project(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv437-source-race-'));
 try{
  const registry=new ProjectRegistry(dir);
  await registry.create({id:'demo',name:'Demo'});
  let state=await br.load(registry,'demo');
  state=await br.addSources(registry,'demo',state.revision,[first]);
  return await fn({registry,state});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}

test('stale UI register revision does not invalidate unchanged source identity',()=>project(async({registry,state})=>{
 const sources=guard.snapshot(state),stale=state.revision;
 const changed=await br.write(registry,'demo',stale,next=>{next.events.push({action:'unrelated-background-refresh'});});
 assert.notEqual(changed.revision,stale);
 assert.equal(guard.assertUnchanged(sources,changed),true);
 const committed=await br.commitSourceMapping(registry,'demo',stale,{
  digests:[first.digest],proposals,sourceSnapshot:sources
 });
 assert.deepEqual(committed.processedSources,[first.digest]);
 assert.equal(committed.mappingCompleted.proposals[0].answers.problem,proposals[0].answers.problem);
}));

test('a real replacement is blocked and cannot overwrite completed requirements',()=>project(async({registry,state})=>{
 const sources=guard.snapshot(state),stale=state.revision;
 const replacement={...first,digest:dg('c'),byteDigest:dg('d'),storedName:dg('c')+'.docx'};
 const updated=await br.addSources(registry,'demo',state.revision,[replacement]);
 await assert.rejects(br.commitSourceMapping(registry,'demo',stale,{
  digests:[first.digest],proposals,sourceSnapshot:sources
 }),/uploaded source selection changed/);
 const current=await br.load(registry,'demo');
 assert.equal(current.revision,updated.revision);
 assert.equal(current.sourceDocuments[0].digest,replacement.digest);
 assert.equal(current.mappingCompleted,null);
}));

test('a concurrent source re-selection is not misclassified as unrelated register activity',()=>project(async({registry,state})=>{
 const sources=guard.snapshot(state);
 await br.selectSources(registry,'demo',state.revision,[first.digest]);
 await assert.rejects(br.commitSourceMapping(registry,'demo',state.revision,{
  digests:[first.digest],proposals,sourceSnapshot:sources
 }),/uploaded source selection changed/);
}));

test('legacy callers still reject stale revisions without a verified source snapshot',()=>project(async({registry,state})=>{
 await br.write(registry,'demo',state.revision,next=>{next.events.push({action:'unrelated-change'});});
 await assert.rejects(br.commitSourceMapping(registry,'demo',state.revision,{
  digests:[first.digest],proposals
 }),/BR register changed/);
}));

test('authenticated resume markers survive unrelated BR revisions but reject different source identities',()=>{
 const state={sourceDocuments:[first],importEpoch:0,processedSources:[]};
 const snapshot=guard.snapshot(state);
 const selected=[first.digest];
 const legacy={revision:'old-register-revision',digests:selected};
 assert.equal(guard.resumeRevision(state,selected,legacy),'old-register-revision');
 const modern={revision:'checkpoint-source-revision',digests:selected,sourceIdentity:snapshot.identity};
 assert.equal(guard.resumeRevision(state,selected,modern),'checkpoint-source-revision');
 const reuploaded={...state,sourceDocuments:[{...first,byteDigest:dg('e')}]};
 assert.notEqual(guard.resumeRevision(reuploaded,selected,modern),'checkpoint-source-revision');
 assert.notEqual(guard.resumeRevision(state,[dg('f')],modern),'checkpoint-source-revision');
});

test('host uses verified source snapshots for start, checkpoints and atomic completion',()=>{
 const host=fss.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(host,/const sourceSnapshot=baSourceSelectionGuard\.snapshot\(original\)/);
 assert.match(host,/const resumeRevision=baSourceSelectionGuard\.resumeRevision\(original,selected,sourceResumeMarker\)/);
 assert.match(host,/sourceIdentity:sourceSnapshot\.identity/);
 assert.match(host,/preflights,sourceSnapshot\}/);
 assert.doesNotMatch(host,/if\(msg\.revision!==original\.revision\)throw Error\('Source selection changed/);
});
