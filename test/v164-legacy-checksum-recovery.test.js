'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const {importDocumentText}=require('../src/discovery-import');
const sourceStore=require('../src/source-store');
const workflow=require('../src/br-workflow');
const fixture=path.join(__dirname,'fixtures','br-synthetic-integration.pdf');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const project=async fn=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v164-'));
 try{const reg=new ProjectRegistry(root);await reg.create({id:'test164',name:'Test'});return await fn(reg,root);}
 finally{await fs.rm(root,{recursive:true,force:true});}
};
async function original(reg){
 const parsed=await importDocumentText(fixture);
 const entry={...parsed,digest:sha(parsed.text),name:'legacy.pdf',uploadedBy:'BA'};
 entry.storedName=await sourceStore.store(reg,'test164',entry,fixture);
 return entry;
}
test('explicit same-byte re-upload repairs missing legacy checksum without resetting reviewed BR/Jira state',()=>project(async reg=>{
 const input=await original(reg);
 let state=await workflow.load(reg,'test164');
 state=await workflow.addSources(reg,'test164',state.revision,[{...input,byteDigest:undefined}]);
 state=await workflow.write(reg,'test164',state.revision,next=>{
  next.processedSources=[input.digest];
  next.mappingCompleted={epoch:9,digests:[input.digest],sourceDigests:[input.digest],proposals:[]};
  next.importEpoch=9;next.discoveryRevision='saved-revision';next.reviewRevision='saved-revision';next.reviewText='{"readiness":"Ready"}';
  next.brs=[{id:'BR-001',title:'Approved visitor requirement',status:'approved',approvedContent:{title:'Approved visitor requirement'},approvedRevision:3,needsRefresh:false}];
  next.synced={'BR-001':{key:'TC-274',kind:'Epic'}};
 });
 await assert.rejects(sourceStore.read(reg,'test164',state.sourceDocuments[0]),/re-upload/i);
 const selected={...input};
 selected.storedName=await sourceStore.store(reg,'test164',selected,fixture);
 const nextSources=state.sourceDocuments.map(source=>source.digest===selected.digest?{...source,byteDigest:selected.byteDigest}:source);
 const next=await workflow.addSources(reg,'test164',state.revision,nextSources,{actor:'BA'});
 assert.equal(next.sourceDocuments[0].byteDigest,sha(await fs.readFile(fixture)));
 assert.deepEqual(next.mappingCompleted,state.mappingCompleted);
 assert.deepEqual(next.processedSources,state.processedSources);
 assert.equal(next.discoveryRevision,'saved-revision');
 assert.equal(next.reviewRevision,'saved-revision');
 assert.equal(next.brs[0].approvedRevision,3);
 assert.equal(next.brs[0].status,'approved');
 assert.equal(next.synced['BR-001'].key,'TC-274');
 assert.equal(next.sourceDocuments[0].sourceId,state.sourceDocuments[0].sourceId);
 assert.equal(next.sourceDocuments[0].version,1);
 assert.equal(next.sourceRevisionHistory.length,0);
 assert.equal(next.events.some(event=>event.action==='legacy-source-original-verified'),true);
 assert.ok((await sourceStore.read(reg,'test164',next.sourceDocuments[0])).text.length>0);
}));
test('different raw PDF bytes with identical extracted text cannot repair a legacy original checksum',()=>project(async(reg,root)=>{
 const entry=await original(reg);
 let state=await workflow.load(reg,'test164');
 state=await workflow.addSources(reg,'test164',state.revision,[{...entry,byteDigest:undefined}]);
 const altered=path.join(root,'legacy.pdf');
 await fs.writeFile(altered,Buffer.concat([await fs.readFile(fixture),Buffer.from('\nnot-the-original-pdf-bytes')]));
 const parsed=await importDocumentText(altered);
 assert.equal(sha(parsed.text),entry.digest);
 await assert.rejects(sourceStore.store(reg,'test164',{...entry,byteDigest:undefined},altered),/bytes differ/i);
 const unchanged=await workflow.load(reg,'test164');
 assert.equal(unchanged.revision,state.revision);
 assert.equal(unchanged.sourceDocuments[0].byteDigest,'');
}));
test('legacy re-upload recovery is available from Generate Requirements without a restart',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const web=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(host,/id="brLegacySourceRecovery"/);
 assert.match(host,/id="brReuploadOriginalSource"/);
 assert.match(host,/legacyBaselines=unchanged\.filter/);
 assert.match(host,/unchanged\.length===documents\.length&&!legacyBaselines\.length/);
 assert.match(host,/sourceStore\.store\(registry,activeProject\.id,doc,doc\.originalPath\)/);
 assert.match(web,/\$\('brReuploadOriginalSource'\)\.addEventListener\('click',requestSourceReupload\)/);
 assert.match(web,/m\.reverified&&!m\.count/);
});
