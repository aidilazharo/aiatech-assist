'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {ProjectRegistry}=require('../src/projects');
const brWorkflow=require('../src/br-workflow');
const discoveryImport=require('../src/discovery-import');
const sourceStore=require('../src/source-store');
const baBrTextPipeline=require('../src/ba-br-md-pipeline');
const source= require('node:fs').readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const fixtureFile=path.join(__dirname,'fixtures/br-synthetic-integration.pdf');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');

async function withProject(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-reupload-'));
 try{
  const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});
  const parsed=await discoveryImport.importDocumentText(fixtureFile);
  const doc={...parsed,digest:sha(parsed.text),uploadedBy:'BA'};
  doc.storedName=await sourceStore.store(registry,'demo',doc,fixtureFile);
  let initial=await brWorkflow.load(registry,'demo');
  initial=await brWorkflow.addSources(registry,'demo',initial.revision,[doc]);
  return await fn({root,registry,doc,initial});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
function uploadFixture(registry,file){
 const messages=[],notices=[],mapped=[],savedSelections=[];
 const context={
  baPreparationRun:null,jiraSyncBusy:false,requireOpened(){},ensureBAUploadRole:async()=> 'BA',registry,activeProject:{id:'demo'},
  vscode:{window:{showOpenDialog:async()=>[{fsPath:file}]}},path,fs,discoveryImport,sha,sourceStore,brWorkflow,baBrTextPipeline,
  dashboard:{webview:{postMessage:async message=>messages.push(message)}},
  context:{workspaceState:{update:async(key,value)=>savedSelections.push({key,value})}},
  documentPreflightSessions:new Map(),approvedJiraPreviewRevision:null,approvedJiraPreviewBinding:null,jiraPreviewValidation:null,
  runBRPreparation:async stage=>mapped.push(stage),
  uiWarning:async()=>{throw Error('Unexpected revision confirmation');},
  notice:async message=>notices.push(message)
 };
 const a=source.indexOf('async function importDiscoveryDocument('),b=source.indexOf('const successfulSourceMappings=',a);
 assert.ok(a>0&&b>a);vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 return {run:()=>context.importDiscoveryDocument('business-analyst'),messages,notices,mapped,savedSelections};
}
test('re-uploading a document archived by a new BR cycle makes it active and starts mapping',()=>withProject(async({registry,doc,initial})=>{
 let state=await brWorkflow.write(registry,'demo',initial.revision,next=>{
  next.brs=[{id:'BR-001',title:'Previous approved requirement',status:'approved',approvedContent:{title:'Previous approved requirement'},approvedRevision:1}];
  next.synced={'BR-001':{key:'TC-123',kind:'Epic'}};
 });
 state=await brWorkflow.startOrRestart(registry,'demo',state.revision,{actor:'BA'});
 assert.equal(state.sourceDocuments.length,0);assert.equal(state.archivedSources.length,1);
 const upload=uploadFixture(registry,fixtureFile);await upload.run();
 const after=await brWorkflow.load(registry,'demo');
 assert.equal(after.sourceDocuments.length,1);assert.equal(after.sourceDocuments[0].digest,doc.digest);
 assert.equal(after.archivedSources.length,0);assert.equal(after.sourceDocuments[0].byteDigest,doc.byteDigest);
 assert.equal(after.brs[0].approvedContent.title,'Previous approved requirement');assert.equal(after.synced['BR-001'].key,'TC-123');
 assert.equal(upload.notices.length,0);assert.equal(upload.mapped.length,1);
 assert.equal(upload.mapped[0],'source');
 const done=upload.messages.find(message=>message.type==='discoveryUploadDone');
 assert.equal(done.restored,1);assert.equal(done.autoPreflight,true);
 assert.ok((await sourceStore.originalBytes(registry,'demo',after.sourceDocuments[0])).length>0);
}));
test('an already active and intact identical upload remains a no-op',()=>withProject(async({registry,initial})=>{
 const upload=uploadFixture(registry,fixtureFile);await upload.run();
 assert.match(upload.notices[0],/No source changes/);
 assert.equal(upload.mapped.length,0);
 assert.equal((await brWorkflow.load(registry,'demo')).revision,initial.revision);
}));
test('re-upload restores a missing active original without resetting mapping or Jira',()=>withProject(async({registry,doc,initial})=>{
 let state=await brWorkflow.write(registry,'demo',initial.revision,next=>{
  next.processedSources=[doc.digest];next.mappingCompleted={epoch:1,digests:[doc.digest],sourceDigests:[doc.digest],proposals:[]};
  next.synced={'BR-001':{key:'TC-123'}};
 });
 const stored=path.join(sourceStore.sourceDirectory(registry,'demo'),doc.storedName);
 await fs.unlink(stored);
 const upload=uploadFixture(registry,fixtureFile);await upload.run();
 const after=await brWorkflow.load(registry,'demo');
 assert.deepEqual(after.mappingCompleted,state.mappingCompleted);assert.equal(after.synced['BR-001'].key,'TC-123');
 assert.equal(after.sourceDocuments[0].byteDigest,doc.byteDigest);
 assert.ok((await sourceStore.originalBytes(registry,'demo',after.sourceDocuments[0])).length>0);
 assert.equal(upload.mapped.length,0);assert.equal(upload.messages.find(m=>m.type==='discoveryUploadDone').reverified,1);
}));
test('a same-text file with different bytes cannot replace a missing original',()=>withProject(async({root,registry,doc,initial})=>{
 const state=await brWorkflow.startOrRestart(registry,'demo',initial.revision,{actor:'BA'});
 await fs.unlink(path.join(sourceStore.sourceDirectory(registry,'demo'),doc.storedName));
 const altered=path.join(root,doc.name);await fs.writeFile(altered,Buffer.concat([await fs.readFile(fixtureFile),Buffer.from('\n% changed bytes')]));
 assert.equal(sha((await discoveryImport.importDocumentText(altered)).text),doc.digest);
 const upload=uploadFixture(registry,altered);
 await assert.rejects(upload.run(),/does not match the original document checksum/);
 const after=await brWorkflow.load(registry,'demo');
 assert.equal(after.revision,state.revision);assert.equal(after.sourceDocuments.length,0);assert.equal(after.archivedSources.length,1);
 assert.equal(await fs.stat(path.join(sourceStore.sourceDirectory(registry,'demo'),doc.storedName)).then(()=>true,()=>false),false);
}));
