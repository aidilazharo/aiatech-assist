'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ProjectRegistry}=require('../src/projects'),br=require('../src/br-workflow');
const hash=c=>c.repeat(64);
const old=hash('a'),newer=hash('b'),other=hash('c');
const source=(name,digest)=>({name,digest,storedName:digest+'.pdf',byteDigest:digest,uploadedBy:'BA',characters:2500});
async function fixture(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-source-revision-'));
 try{const reg=new ProjectRegistry(dir);await reg.create({id:'demo',name:'Demo'});return await fn(reg);}
 finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function seed(reg,pending=false){
 let r=await br.load(reg,'demo');r=await br.addSources(reg,'demo',r.revision,[source('v1.pdf',old)],{singleSourceCycle:true});
 r=await br.write(reg,'demo',r.revision,next=>{
  next.brs=[{id:'BR-012',status:'approved',title:'Project initiation',needsRefresh:false,approvedRevision:1,approvedContent:{title:'Project initiation',objective:'Register project',scope:'Project portfolio',acceptanceCriteria:'Submission can be reviewed',features:[]},
    evidence:[{name:'v1.pdf',digest:old,verified:true}],source:{name:'v1.pdf',digest:old}}];
  next.synced={'BR-012':{key:'TC-712',hash:'abc',kind:'Epic',title:'Project initiation'}};
  next.discoveryRevision='R-OLD';next.reviewRevision='R-OLD';
  next.mappingCompleted={epoch:1,digests:[old],sourceDigests:[old],proposals:[{filename:'v1.pdf',answers:{}}]};
  next.processedSources=[old];
  if(pending)next.pending={'BR-012':{action:'update',key:'TC-712'}};
 });
 return r;
}
test('Replace & Reprocess changes source version but never deletes approved BRs or Jira keys',()=>fixture(async reg=>{
 const before=await seed(reg);
 const after=await br.addSources(reg,'demo',before.revision,[source('renamed-v2.pdf',newer)],{replacementDigest:old,singleSourceCycle:true,actor:'BA'});
 assert.equal(after.sourceDocuments[0].sourceId,before.sourceDocuments[0].sourceId);
 assert.equal(after.sourceDocuments[0].version,2);
 assert.equal(after.sourceDocuments[0].previousDigest,old);
 assert.equal(after.archivedSources.find(x=>x.digest===old).status,'superseded');
 assert.equal(after.brs[0].status,'approved');assert.equal(after.brs[0].needsRefresh,true);
 assert.equal(after.synced['BR-012'].key,'TC-712');
 assert.equal(after.reviewRevision,'');assert.equal(after.discoveryRevision,'');assert.equal(after.mappingCompleted,null);
 assert.equal(br.plan(after).length,0,'Unapproved document cannot schedule any Jira writes');
 assert.equal(after.sourceRevisionHistory.at(-1).jiraChanged,false);
}));
test('Remove Source then reupload new filename preserves the historical source and Jira',()=>fixture(async reg=>{
 let r=await seed(reg);
 r=await br.archiveSource(reg,'demo',r.revision,{digest:old});
 assert.equal(r.sourceDocuments.length,0);assert.equal(r.synced['BR-012'].key,'TC-712');
 r=await br.addSources(reg,'demo',r.revision,[source('updated.doc.pdf',newer)],{replacementDigest:old,singleSourceCycle:true,actor:'BA'});
 assert.equal(r.sourceDocuments.length,1);assert.equal(r.sourceDocuments[0].version,2);
 assert.equal(r.archivedSources.find(x=>x.digest===old).status,'superseded');
 assert.equal(r.synced['BR-012'].key,'TC-712');assert.equal(r.brs[0].needsRefresh,true);
}));
test('stale revision, identical content, wrong digest and pending Jira operations fail closed',()=>fixture(async reg=>{
 let r=await seed(reg);
 await assert.rejects(br.addSources(reg,'demo',r.revision,[source('same.pdf',old)],{replacementDigest:old}),/same extracted contents/);
 await assert.rejects(br.addSources(reg,'demo',r.revision,[source('v2.pdf',newer)],{replacementDigest:other}),/Source version changed/);
 const stale=r.revision;r=await br.write(reg,'demo',r.revision,n=>{n.pending={'BR-012':{action:'update'}};});
 await assert.rejects(br.addSources(reg,'demo',r.revision,[source('v2.pdf',newer)],{replacementDigest:old}),/Resolve pending Jira/);
 await assert.rejects(br.addSources(reg,'demo',stale,[source('v2.pdf',newer)],{replacementDigest:old}),/changed/);
 assert.equal((await br.load(reg,'demo')).sourceDocuments[0].digest,old);
}));
test('UI exposes safe replacement and Delete; legacy archival handler is still retained',()=>{
 const ui=fsSync.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const host=fsSync.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(ui,/replace.textContent='Replace & Reprocess'/);
 assert.doesNotMatch(ui,/archive.textContent='Remove Source'/);
 assert.match(ui,/remove.textContent='Delete'/);
 assert.match(ui,/send\('replaceDiscoverySource',\{roleId:selectedRole,digest:doc.digest,revision:brState.revision\}\)/);
 assert.match(host,/case 'archiveDiscoverySourceSafe':/);
 assert.match(host,/case 'replaceDiscoverySource':/);
 assert.match(host,/selectedReplacementDigest=latest.digest;replacementSource=latest/);
 assert.match(host,/processSelectedDiscoverySources\(\{digests:register.sourceDocuments/);
});
