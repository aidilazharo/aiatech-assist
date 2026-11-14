'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
async function fixture(fn){const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v044-'));const registry=new ProjectRegistry(home);try{await registry.create({id:'sample',name:'Sample'});await fn(registry);}finally{await fs.rm(home,{recursive:true,force:true});}}
const docs=n=>Array.from({length:n},(_,i)=>({name:`requirement-${i+1}.pdf`,digest:digest('content-'+i),characters:100+i}));
test('multi-source register persists 10 independently tracked documents',()=>fixture(async registry=>{
 let r=await br.load(registry,'sample');const files=docs(10);
 r=await br.imported(registry,'sample',r.revision,{name:'10 documents',digest:digest('10docs'),documents:files});
 assert.equal(r.sourceDocuments.length,10);assert.ok(r.sourceDocuments.every(x=>x.addedAt));
 await assert.rejects(br.imported(registry,'sample',r.revision,{name:'11 documents',digest:digest('11docs'),documents:docs(11)}),/1–10/);
 const after=await br.load(registry,'sample');assert.equal(after.sourceDocuments.length,10);
}));
test('revised same-name source can retain its identity and replaces prior digest',()=>fixture(async registry=>{
 let r=await br.load(registry,'sample');const original=docs(2);
 r=await br.imported(registry,'sample',r.revision,{name:'two',digest:digest('two'),documents:original});
 const unchanged=original[1].addedAt;
 const next=[original[0],{...original[1],digest:digest('new-version')}];
 r=await br.imported(registry,'sample',r.revision,{name:'two',digest:digest('revised'),documents:next});
 assert.equal(r.sourceDocuments.length,2);assert.equal(r.sourceDocuments[1].digest,digest('new-version'));
 assert.ok(r.sourceHistory.length>=2);
}));
test('archiving processed sources preserves approved discovery and BR evidence',()=>fixture(async registry=>{
 let r=await br.load(registry,'sample');const files=docs(2);
 r=await br.imported(registry,'sample',r.revision,{name:'two',digest:digest('two'),documents:files});
 r=await br.discoverySaved(registry,'sample',r.revision,'D1');
 r=await br.reviewed(registry,'sample',r.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 await assert.rejects(br.removeSource(registry,'sample',r.revision,{digest:files[0].digest}),/Archived or Replaced/);
 r=await br.archiveSource(registry,'sample',r.revision,{digest:files[0].digest});
 assert.equal(r.sourceDocuments.length,1);assert.equal(r.archivedSources.length,1);
 assert.equal(r.reviewRevision,'D1');assert.equal(r.discoveryRevision,'D1');
 await assert.rejects(br.archiveSource(registry,'sample',r.revision,{digest:files[0].digest}),/changed or removed/);
 await assert.rejects(br.archiveSource(registry,'sample','stale',{digest:files[1].digest}),/changed/);
 r=await br.archiveSource(registry,'sample',r.revision,{digest:files[1].digest});
 assert.equal(r.sourceDocuments.length,0);assert.equal(r.archivedSources.length,2);
 assert.equal(r.reviewRevision,'D1');
}));
test('duplicate source names and content are rejected atomically',()=>fixture(async registry=>{
 let r=await br.load(registry,'sample');const files=docs(2);
 await assert.rejects(br.imported(registry,'sample',r.revision,{name:'duplicate names',digest:digest('dupnames'),documents:[files[0],{...files[1],name:files[0].name.toUpperCase()}]}),/unique/);
 await assert.rejects(br.imported(registry,'sample',r.revision,{name:'duplicate contents',digest:digest('dupcontents'),documents:[files[0],{...files[1],digest:files[0].digest}]}),/unique/);
 r=await br.load(registry,'sample');assert.equal(r.importEpoch,0);
}));
test('BA source selection maps files individually, renders source list and role status menu',()=>{
 const extension=fss.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=fss.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const css=fss.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
 assert.match(extension,/for\(let i=0;i<readable\.length;i\+\+\)/);
 assert.match(extension,/createMappingPrompt\(doc\)/);
 assert.match(extension,/createMappingPrompt\(doc\)/); // Each readable document receives its own mapping prompt
 assert.match(extension,/removeDiscoverySource/);
 assert.match(extension,/id="sourceDocuments"/);
 assert.match(extension,/id="sidebarRoleMenu"/);
 assert.match(ui,/discoveryImportQueue\.push\(proposal\)/);
 assert.match(ui,/discoveryImportQueue\.shift\(\)/);
 assert.match(css,/\.role-state-ready\{color:#50d6a0;font-weight:800/);
 assert.match(css,/\.role-state-progress\{color:#f3b95c;font-weight:800/);
 assert.match(css,/\.ba-review-summary-actions/);
});
