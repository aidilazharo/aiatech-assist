'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const discovery=require('../src/ba-discovery');
const A='a'.repeat(64),B='b'.repeat(64);
const doc=(name,digest)=>({name,digest,byteDigest:digest,storedName:digest+'.pdf',characters:100,uploadedBy:'BA'});
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v134-'));try{const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});return await fn(registry,root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('Start initializes an empty workflow without pretending an upload exists',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');assert.equal(state.restartPending,false);
 state=await br.startOrRestart(registry,'demo',state.revision,{actor:'BA'});
 assert.equal(state.restartPending,true);assert.equal(state.sourceDocuments.length,0);
 assert.equal(state.importEpoch,1);assert.equal(state.restartHistory[0].action,'start');
 await assert.rejects(br.startOrRestart(registry,'demo',state.revision,{actor:'BA'}),/already open/);
 const reloaded=await br.load(registry,'demo');assert.equal(reloaded.sourceDocuments.length,0);
 state=await br.addSources(registry,'demo',state.revision,[doc('new.pdf',A)]);
 assert.equal(state.sourceDocuments.length,1);
}));
test('Restart archives all uploaded documents, resets active stage, preserves protected BR and Jira linkage',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,[doc('one.pdf',A),doc('two.pdf',B)]);
 state=await br.selectSources(registry,'demo',state.revision,[A,B]);
 state=await br.write(registry,'demo',state.revision,next=>{
  next.mappingCompleted={epoch:next.importEpoch,digests:[A,B],sourceDigests:[A,B],proposals:[]};
  next.discoveryRevision='D1';next.reviewRevision='D1';next.reviewText='review';
  next.brs=[{id:'BR-001',title:'Protected requirement',status:'approved',approvedContent:{title:'Protected',features:[]},approvedRevision:1,approvedRevisions:[{revision:1,content:{title:'Protected'}}]},
    {id:'BR-002',title:'Unsaved draft',status:'draft',approvedContent:null}];
  next.synced={'BR-001':{key:'TC-100',kind:'Epic',hash:'prior'}};
 });
 let d=await discovery.load(registry,'demo');d=await discovery.save(registry,'demo',{problem:'Old answer'},d.revision);
 const old=state.revision;
 state=await br.startOrRestart(registry,'demo',state.revision,{actor:'BA'});
 assert.equal(state.restartPending,true);assert.equal(state.sourceDocuments.length,0);
 assert.equal(state.archivedSources.length,2);assert.deepEqual(new Set(state.archivedSources.map(x=>x.digest)),new Set([A,B]));
 assert.equal(state.mappingCompleted,null);assert.deepEqual(state.processedSources,[]);assert.equal(state.discoveryRevision,'');assert.equal(state.reviewRevision,'');
 assert.equal(state.brs.length,1);assert.equal(state.brs[0].archivedFromRestart,true);
 assert.equal(state.brs[0].approvedContent.title,'Protected');assert.equal(state.synced['BR-001'].key,'TC-100');
 assert.equal(state.restartHistory[0].jiraKeysPreserved[0],'TC-100');
 assert.equal(br.plan(state).filter(p=>p.action==='retire').length,0);
 d=await discovery.save(registry,'demo',{},d.revision);assert.equal(d.readiness.filled,0);
 const reloaded=await br.load(registry,'demo');assert.deepEqual(reloaded.sourceDocuments,[]);
 await assert.rejects(br.startOrRestart(registry,'demo',old,{actor:'BA'}),/changed/);
 state=await br.addSources(registry,'demo',state.revision,[doc('next.pdf',B)]);
 assert.equal(state.sourceDocuments[0].name,'next.pdf');assert.equal(state.synced['BR-001'].key,'TC-100');
}));
test('Restart refuses pending Jira writes without altering records',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,[doc('one.pdf',A)]);
 state=await br.write(registry,'demo',state.revision,next=>{next.pending={'BR-001':{action:'create',hash:'pending'}};});
 const revision=state.revision;
 await assert.rejects(br.startOrRestart(registry,'demo',revision,{actor:'BA'}),/pending Jira/);
 state=await br.load(registry,'demo');assert.equal(state.revision,revision);assert.equal(state.sourceDocuments.length,1);
}));
test('New requirements after restart do not retire previously published Jira records',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[doc('prior.pdf',A)]);
 state=await br.write(registry,'demo',state.revision,next=>{
  next.brs=[{id:'BR-001',title:'Old Requirement',status:'approved',approvedContent:{title:'Old Requirement',objective:'Old',scope:'Old',acceptanceCriteria:'Old',features:[]},approvedRevision:1}];
  next.synced={'BR-001':{key:'TC-100',kind:'Epic',hash:'old-hash',title:'Old Requirement'}};
 });
 state=await br.startOrRestart(registry,'demo',state.revision,{actor:'BA'});
 state=await br.write(registry,'demo',state.revision,next=>next.brs.push({id:'BR-002',title:'New Requirement',status:'approved',needsRefresh:false,approvedContent:{title:'New Requirement',objective:'New',scope:'New',acceptanceCriteria:'New',features:[]}}));
 const actions=br.plan(state);
 assert.deepEqual(actions.map(x=>({path:x.path,action:x.action})),[{path:'BR-002',action:'create'}]);
 assert.equal(state.synced['BR-001'].key,'TC-100');
}));
test('Header action is positioned alongside Readiness and routes into a guarded restart',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8'),ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(host,/id="baStartPanel"/);assert.match(host,/id="baNewRequirement"/);assert.equal((host.match(/id="baStart"/g)||[]).length,0);
 assert.match(host,/case 'startOrRestartBusinessRequirements':\{/);
 assert.match(host,/brWorkflow\.startOrRestart\(registry,activeProject.id,current.revision/);
 assert.match(host,/uiWarning\(`Start a new independent Business Requirements cycle/);
 assert.match(ui,/send\('startOrRestartBusinessRequirements',\{revision:brState.revision,openUploadImmediately:true\}\)/);
 assert.match(ui,/\$\('baNewRequirement'\)\.disabled=/);
 assert.match(ui,/const showSources=displayed==='upload'/);
});
