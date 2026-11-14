'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const {importDocumentText}=require('../src/discovery-import');
const sourceStore=require('../src/source-store');
const br=require('../src/br-workflow');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fixture=path.join(__dirname,'fixtures','br-synthetic-integration.pdf');
async function project(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv132-'));
 try{const registry=new ProjectRegistry(root);await registry.create({id:'test132',name:'test132'});return await fn(registry,root);}
 finally{await fs.rm(root,{recursive:true,force:true});}
}
test('portable PDF upload persists byte hash and is readable after registry reload',()=>project(async registry=>{
 const original=await importDocumentText(fixture);
 const file={...original,digest:digest(original.text),name:'gate-source.pdf'};
 file.storedName=await sourceStore.store(registry,'test132',file,fixture);
 let s=await br.load(registry,'test132');
 s=await br.addSources(registry,'test132',s.revision,[file]);
 const fetched=await br.load(registry,'test132');
 assert.equal(fetched.sourceDocuments.length,1);
 assert.equal(fetched.sourceDocuments[0].byteDigest,digest(await fs.readFile(fixture)));
 assert.equal((await sourceStore.read(registry,'test132',fetched.sourceDocuments[0])).text,original.text);
 s=await br.selectSources(registry,'test132',fetched.revision,[file.digest]);
 s=await br.completeSourceMapping(registry,'test132',s.revision,{digests:[file.digest],proposals:[{filename:file.name,answers:{problem:'GATE form rules'}}]});
 assert.equal(s.mappingCompleted.proposals.length,1);
}));
test('a restart with a re-uploaded legacy source establishes a byte hash without modifying approved requirements',()=>project(async (registry,root)=>{
 const f=path.join(root,'evidence.pdf');await fs.writeFile(f,'%PDF-1.4\n1 0 obj\n<< /Length 65 >>\nstream\n(GATE project requirements original evidence preserved.) Tj\nendstream\nendobj');
 const input=await importDocumentText(f);const entry={...input,digest:digest(input.text),name:'legacy.pdf'};
 entry.storedName=await sourceStore.store(registry,'test132',entry,f);
 let state=await br.load(registry,'test132');
 state=await br.addSources(registry,'test132',state.revision,[{...entry,byteDigest:undefined}]);
 assert.equal(state.sourceDocuments[0].byteDigest,'');
 await assert.rejects(sourceStore.read(registry,'test132',state.sourceDocuments[0]),/Re-upload/i);
 const replacement={...entry,byteDigest:undefined};
 replacement.storedName=await sourceStore.store(registry,'test132',replacement,f);
 state=await br.addSources(registry,'test132',state.revision,[replacement],{restart:true,restartedNames:['legacy.pdf']});
 assert.equal(state.restartPending,true);
 assert.equal(state.mappingCompleted,null);
 assert.equal(state.sourceDocuments[0].byteDigest,digest(await fs.readFile(f)));
 assert.ok((await sourceStore.read(registry,'test132',state.sourceDocuments[0])).text.length);
}));
test('archiving and restoring retains source bytes checksum',()=>project(async(registry,root)=>{
 const f=path.join(root,'evidence.pdf');await fs.writeFile(f,'%PDF-1.4\n1 0 obj\n<< /Length 65 >>\nstream\n(GATE project requirements original evidence preserved.) Tj\nendstream\nendobj');
 const input=await importDocumentText(f);const entry={...input,digest:digest(input.text),name:'evidence.pdf'};
 entry.storedName=await sourceStore.store(registry,'test132',entry,f);
 let s=await br.load(registry,'test132');s=await br.addSources(registry,'test132',s.revision,[entry]);
 s=await br.archiveSource(registry,'test132',s.revision,{digest:entry.digest,reason:'Testing'});
 assert.equal(s.archivedSources[0].byteDigest,entry.byteDigest);
 s=await br.restoreSource(registry,'test132',s.revision,{digest:entry.digest});
 assert.equal(s.sourceDocuments[0].byteDigest,entry.byteDigest);
 assert.ok((await sourceStore.read(registry,'test132',s.sourceDocuments[0])).text);
}));
test('user-triggered BA mapping, AI review, and generation do not show a second Send to AI popup',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const mapping=host.slice(host.indexOf('async function processSelectedDiscoverySources'),host.indexOf('async function removeDiscoverySource'));
 const review=host.slice(host.indexOf('async function aiDiscoverySuggestion'),host.indexOf('async function generateBusinessRequirements'));
 const generate=host.slice(host.indexOf('async function generateBusinessRequirements'),host.indexOf('async function verifyRoleDocumentImpactTarget'));
 for(const [name,fn] of [['mapping',mapping],['review',review],['generation',generate]])assert.doesNotMatch(fn,/askAiSendConsent\(/,name);
 assert.doesNotMatch(host,/id="sourceAiDisclosure"/);
});
test('restart enables source uploads only in active source window; mapping locks the panel',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(ui,/const showSources=displayed==='upload'/);
 assert.match(ui,/if\(m\.type==='discoveryRestarted'\)/);
 assert.match(ui,/sourceSelectedDigests=new Set\(m\.digests\|\|\[\]\)/);
});
test('BA discovery errors appear in top notification without duplicate inline or bottom-panel error strings',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(ui,/if\(error\)\{notice\.textContent='';notice\.classList\.add\('hidden'\);return;\}/);
 assert.match(ui,/if\(view==='discovery'&&!m\.error&&\$\('baInlineStatus'\)\)/);
 assert.match(ui,/mappingFailureMessage=m\.mapping\?\(m\.message\|\|'Mapping stopped\. No answers were saved\.'\)/);
 assert.doesNotMatch(ui,/setDiscoveryImportBusy\(false,m\.message\|\|'Import failed\.'\)/);
});
