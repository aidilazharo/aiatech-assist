'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const source=(name,hash)=>({name,digest:hash,byteDigest:digest(name+'bytes'),storedName:hash+'.pdf',characters:900});
async function fixture(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v170-'));
 try{const registry=new ProjectRegistry(dir);await registry.create({id:'demo',name:'Demo'});return await fn(registry);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
function requirement(id,name,source){return {id,title:name,objective:name,scope:name,acceptanceCriteria:'Accepted',features:[],status:'approved',approvedRevision:1,approvedContent:{title:name},source:{name:source.name,digest:source.digest},evidence:[{name:source.name,digest:source.digest,verified:true}]};}

test('new BA source cycle accepts one file and rejects multiple, without persisting rejected upload',()=>fixture(async registry=>{
 const a=source('Visitor.pdf',digest('visitor')),b=source('Equipment.pdf',digest('equipment'));
 let state=await br.load(registry,'demo');
 await assert.rejects(br.addSources(registry,'demo',state.revision,[a,b],{singleSourceCycle:true}),/Only one active source document/);
 assert.deepEqual((await br.load(registry,'demo')).sourceDocuments,[]);
 state=await br.addSources(registry,'demo',state.revision,[a],{singleSourceCycle:true});
 assert.equal(state.sourceDocuments.length,1);
 await assert.rejects(br.addSources(registry,'demo',state.revision,[a,b],{singleSourceCycle:true}),/Only one active source document/);
 assert.equal((await br.load(registry,'demo')).sourceDocuments.length,1);
}));

test('legacy multi-source project remains loadable for migration; UI host enforces new single-file uploads',()=>fixture(async registry=>{
 const a=source('Visitor.pdf',digest('visitor')),b=source('Equipment.pdf',digest('equipment'));
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[a,b]);
 assert.equal(state.sourceDocuments.length,2);
 assert.equal((await br.load(registry,'demo')).sourceDocuments.length,2);
}));

test('deleting the uploaded source also removes its linked published BR, never an unrelated BR or its Jira key',()=>fixture(async registry=>{
 const a=source('Visitor.pdf',digest('visitor')),b=source('Equipment.pdf',digest('equipment'));
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[a,b]);
 state=await br.write(registry,'demo',state.revision,next=>{
  next.brs=[requirement('BR-007','Visitor Registration',a),requirement('BR-008','Equipment Loans',b)];
  next.synced={'BR-007':{key:'TC-274',kind:'Epic'},'BR-008':{key:'TC-300',kind:'Epic'}};
  next.completedCycles=[{id:'C',requirements:[{id:'BR-007'},{id:'BR-008'}]}];
 });
 const impact=br.activeSourceDeletionImpact(state,a.digest);
 assert.deepEqual(impact.requirements.map(x=>x.id),['BR-007']);
 assert.deepEqual(impact.jiraKeys,['TC-274']);
 state=await br.forceDeleteActiveSource(registry,'demo',state.revision,{digest:a.digest,expectedBrIds:['BR-007'],actor:'BA'});
 assert.deepEqual(state.sourceDocuments.map(x=>x.name),['Equipment.pdf']);
 assert.deepEqual(state.brs.map(x=>x.id),['BR-008']);
 assert.deepEqual(state.completedCycles[0].requirements.map(x=>x.id),['BR-008']);
 assert.equal(state.synced['BR-007'],undefined);
 assert.equal(state.synced['BR-008'].key,'TC-300');
 assert.deepEqual(state.deletedRequirements[0].jiraIssues.map(x=>x.key),['TC-274']);
 assert.equal(state.sourceHistory.at(-1).action,'uploaded-source-and-br-deleted');
}));

test('deleting an unprocessed upload clears active source and unlocks a new upload',()=>fixture(async registry=>{
 const a=source('New.pdf',digest('new'));
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[a],{singleSourceCycle:true});
 assert.deepEqual(br.activeSourceDeletionImpact(state,a.digest).requirements,[]);
 state=await br.forceDeleteActiveSource(registry,'demo',state.revision,{digest:a.digest,expectedBrIds:[]});
 assert.equal(state.sourceDocuments.length,0);
 assert.equal(state.restartPending,false);
 assert.equal(state.mappingCompleted,null);
 assert.equal(state.deletedRequirements.length,0);
}));

test('deletion refuses stale preview, changed revision, invalid digest, and pending Jira publication',()=>fixture(async registry=>{
 const a=source('Visitor.pdf',digest('visitor'));
 let state=await br.load(registry,'demo');
 state=await br.addSources(registry,'demo',state.revision,[a],{singleSourceCycle:true});
 state=await br.write(registry,'demo',state.revision,next=>{next.brs=[requirement('BR-007','Visitor',a)];next.synced={'BR-007':{key:'TC-274',kind:'Epic'}};});
 await assert.rejects(br.forceDeleteActiveSource(registry,'demo',state.revision,{digest:a.digest,expectedBrIds:[]}),/Linked BR list changed/);
 await assert.rejects(br.forceDeleteActiveSource(registry,'demo',state.revision,{digest:'../escape',expectedBrIds:[]}),/Invalid source fingerprint/);
 const stale=state.revision;
 state=await br.write(registry,'demo',state.revision,next=>{next.pending['BR-007']={action:'create',hash:'test'};});
 await assert.rejects(br.forceDeleteActiveSource(registry,'demo',stale,{digest:a.digest,expectedBrIds:['BR-007']}),/changed/);
 await assert.rejects(br.forceDeleteActiveSource(registry,'demo',state.revision,{digest:a.digest,expectedBrIds:['BR-007']}),/Jira publication is pending/);
 assert.equal((await br.load(registry,'demo')).brs[0].id,'BR-007');
}));

test('active-source Delete control, confirmation, and one-document counter are wired to host',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(ui,/\$\('sourceDocumentCount'\)\.textContent=`\$\{files\.length\} \/ 1`/);
 assert.match(host,/aria-valuemax="1"/);
 assert.match(host,/if\(prospective\.length>1\)throw Error/);
 assert.match(ui,/requestBRDeletion\(\{target:'active-source',digest:doc\.digest,revision:brState\.revision\}\)/);
 assert.match(host,/case 'deleteUploadedDiscoverySource'/);
 assert.match(host,/remoteBRDeletion\.execute/);
 assert.match(host,/const confirmed=await uiWarning\(message,\{modal:true/);
 assert.match(host,/DELETE EVERYWHERE/);
});
