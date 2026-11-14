'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const SOURCE='d'.repeat(64);
const doc={name:'gate.pdf',digest:SOURCE,byteDigest:SOURCE,storedName:SOURCE+'.pdf',characters:200,uploadedBy:'BA'};
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v135-'));try{const reg=new ProjectRegistry(root);await reg.create({id:'demo',name:'isolated test'});return await run(reg)}finally{await fs.rm(root,{recursive:true,force:true});}}
test('UI locks uploaded source panel after mapping but keeps header Restart',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(ui,/const showSources=displayed==='upload'/);
 assert.doesNotMatch(ui,/sourceChangeActions|baRestartSources/);
 assert.doesNotMatch(host,/id="sourceChangeActions"|id="baRestartSources"/);
 assert.match(host,/id="baNewRequirement"/);
});
test('header Restart archives active BR source and resets milestones but preserves synced Jira identity, without touching remote Jira/Confluence',()=>fixture(async reg=>{
 let state=await br.load(reg,'demo');state=await br.addSources(reg,'demo',state.revision,[doc]);
 state=await br.write(reg,'demo',state.revision,next=>{
  next.processedSources=[SOURCE];next.mappingCompleted={epoch:next.importEpoch,digests:[SOURCE],sourceDigests:[SOURCE],proposals:[]};
  next.discoveryRevision='old';next.reviewRevision='old';next.reviewText='reviewed';
  next.brs=[{id:'BR-TEST',title:'Disposable mapped BR',status:'approved',approvedContent:{title:'old',features:[]},approvedRevision:1}];
  next.synced={'BR-TEST':{key:'TC-41',hash:'baseline'}};
 });
 const count=state.events.length;
 state=await br.startOrRestart(reg,'demo',state.revision,{actor:'BA'});
 assert.deepEqual(state.sourceDocuments,[]);
 assert.equal(state.archivedSources.length,1);
 assert.equal(state.importEpoch>0,true);
 assert.equal(state.mappingCompleted,null);
 assert.equal(state.reviewRevision,'');
 assert.equal(state.restartPending,true);
 assert.equal(state.brs[0].archivedFromRestart,true);
 assert.equal(state.brs[0].approvedContent.title,'old');
 assert.equal(state.synced['BR-TEST'].key,'TC-41');
 assert.equal(br.plan(state).filter(item=>item.action==='retire').length,0);
 assert.ok(state.events.length>count);
}));
test('Restart never invokes Jira/Confluence remote deletion APIs',async()=>{
 const extension=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const branch=extension.split("case 'startOrRestartBusinessRequirements':{")[1].split("case 'restartDiscoverySources':{")[0];
 assert.match(branch,/brWorkflow\.startOrRestart/);
 assert.match(branch,/This does not retire or delete previously published Jira issues/);
 assert.doesNotMatch(branch,/atlassian\.|jiraClient\.|confluenceClient\.|fetch\(|method:\s*'DELETE'/);
});
