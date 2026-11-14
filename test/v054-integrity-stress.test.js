'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const br=require('../src/br-workflow'),{ProjectRegistry}=require('../src/projects');
const req=(stories)=>({title:'Eligibility',objective:'Determine eligibility',scope:'Member onboarding',acceptanceCriteria:'All tests pass',features:[{title:'Intake',description:'Collect member details',stories}]});
const story=tasks=>({title:'Complete intake',description:'Capture member profile',tasks});
const task=(title,description)=>({title,description});
async function fixture(run){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv54-'));try{const r=new ProjectRegistry(dir);await r.create({id:'test',name:'Test'});let s=await br.load(r,'test');s=await br.imported(r,'test',s.revision,{name:'source.pdf',digest:'d'.repeat(64)});s=await br.discoverySaved(r,'test',s.revision,'D1');s=await br.reviewed(r,'test',s.revision,{discoveryRevision:'D1',text:'Reviewed'});return await run(r,s);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('removed task and story identities remain reserved across revisions',()=>fixture(async(r,s)=>{
 const initial=req([story([task('Verify phone','Send mobile code')])]);
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[initial]});
 assert.equal(s.brs[0].features[0].stories[0].tasks[0].id,'T-001');
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req([story([])])]});
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req([story([task('Evaluate address','Verify postal area')])])]});
 assert.equal(s.brs[0].features[0].stories[0].tasks[0].id,'T-002');
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req([])]});
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[req([{title:'Archive request',description:'Store consent',tasks:[]}])]});
 assert.equal(s.brs[0].features[0].stories[0].id,'S-002');
 assert.ok(s.brs[0].identityLedger.includes('F-001/S-001/T-001'));
}));
test('external JIRA conflicts preserve approved snapshots and block publishing until reconciliation',()=>fixture(async(r,s)=>{
 const initial=req([story([])]);
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[initial]});
 s=await br.edit(r,'test',s.revision,{brId:'BR-001',content:initial,actor:'BA A'});
 s=await br.approve(r,'test',s.revision,{brId:'BR-001',actor:'BA A'});
 const initialPlan=br.plan(s);assert.ok(initialPlan.length);
 const key=initialPlan.find(x=>x.path==='BR-001');
 const syncedHash=key.hash;
 s=await br.beginOperation(r,'test',s.revision,{path:'BR-001',action:'create',hash:syncedHash});
 s=await br.recorded(r,'test',s.revision,{path:'BR-001',action:'create',key:'TEST-1',hash:syncedHash,kind:'Epic',remoteDigest:'e'.repeat(64)});
 s=await br.recordInboundJira(r,'test',s.revision,[{path:'BR-001',key:'TEST-1',summary:'Updated externally',description:'Remote change',remoteDigest:'f'.repeat(64)}],'TEST');
 assert.equal(s.brs[0].externalReviewRequired,true);
 assert.ok(br.plan(s).every(x=>x.path!=='BR-001'));
 assert.equal(s.brs[0].approvedContent.title,initial.title);
}));
test('external JIRA Feature or Story edits create proposals without changing approved content',()=>fixture(async(r,s)=>{
 const initial=req([story([])]);
 s=await br.generated(r,'test',s.revision,{discoveryRevision:'D1',requirements:[initial]});
 s=await br.edit(r,'test',s.revision,{brId:'BR-001',content:initial,actor:'BA-A'});
 s=await br.approve(r,'test',s.revision,{brId:'BR-001',actor:'BA-A'});
 const feature=br.plan(s).find(x=>x.path==='BR-001/F-001');
 s=await br.beginOperation(r,'test',s.revision,{path:feature.path,action:'create',hash:feature.hash});
 s=await br.recorded(r,'test',s.revision,{path:feature.path,action:'create',key:'TEST-2',hash:feature.hash,kind:'Feature',remoteDigest:'e'.repeat(64)});
 s=await br.recordInboundJira(r,'test',s.revision,[{path:feature.path,key:'TEST-2',summary:'Revised intake',description:'Updated verification steps',remoteDigest:'f'.repeat(64)}],'TEST');
 const proposals=s.changeQueue.filter(x=>x.origin==='jira'&&x.targetIds.includes(feature.path));
 assert.equal(proposals.length,2);assert.ok(proposals.some(x=>x.field==='description'));
 assert.equal(s.brs[0].status,'approved');assert.equal(s.brs[0].approvedContent.features[0].title,'Intake');
}));
