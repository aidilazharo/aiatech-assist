'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const preflight=require('../src/ba-document-preflight');
const working=require('../src/ba-working-br');
const sourceStore=require('../src/source-store');
const {ProjectRegistry}=require('../src/projects');
const digest='a'.repeat(64);
const original='Please add namme once. Use keyboard navigation.';
const source={name:'Requirement.pdf',digest,byteDigest:'b'.repeat(64),text:original};
function result(){return preflight.parse(JSON.stringify({status:'ready',summary:'Checked',edits:[{before:'add namme',after:'add name',reason:'Spelling'}],issues:[{severity:'warning',category:'keyboard',detail:'Keyboard focus needs clarification',sourceExcerpt:'Use keyboard navigation',suggestion:'Use native keyboard behavior'}]}),original);}

test('working BR follows the BA template and contains the validated text used for mapping',()=>{
 const r=result(),draft=working.prepare(source,[original],[r]);
 assert.equal(draft.sections[0].text,'Please add name once. Use keyboard navigation.');
 assert.match(draft.sections[0].guidance,/PROVISIONAL/);
 for(const heading of ['# Business Requirements','## Purpose','## Source Business Requirements','## Draft','## Review and Approvals','## Provisional Standards Guidance','## Preflight Validation'])assert.ok(draft.content.includes(heading),heading);
 assert.match(draft.content,/Please add name once/);
 assert.match(draft.content,/Application and acceptance tests: NOT RUN/);
 assert.equal(draft.checks.length,4);
 assert.ok(draft.checks.every(item=>item.status==='PASS'));
 assert.equal(source.text,original);
});
test('working BR rejects missing sections, blockers, invented edits and unverified guidance',()=>{
 const r=result();
 assert.throws(()=>working.prepare(source,['incomplete'],[r]),/coverage/);
 assert.throws(()=>working.prepare(source,[original],[{...r,ready:false}]),/blocker/);
 assert.throws(()=>working.prepare(source,[original],[{...r,effectiveText:'changed without evidence'}]),/outside the validated corrections/);
 assert.throws(()=>working.prepare(source,[original],[{...r,resolutions:[{...r.resolutions[0],resolution:'invented'}]}]),/Unrecognized/);
 assert.throws(()=>working.prepare(source,[original],[{...r,resolutions:[{...r.resolutions[0],sourceExcerpt:'invented quotation'}]}]),/unverified source excerpt/);
});
test('working BR is verified on download and removed with its source',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-working-br-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});
 const originalFile=path.join(root,'original.pdf');await fs.writeFile(originalFile,'%PDF-1.4 original evidence');
 const entry={name:'original.pdf',digest};entry.storedName=await sourceStore.store(registry,'demo',entry,originalFile);
 const draft=working.prepare({...source,byteDigest:entry.byteDigest},[original],[result()]);
 const ref=await working.store(registry,'demo',digest,draft.content);
 assert.equal(await working.read(registry,'demo',ref),draft.content);
 const workingFile=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','preflight-working',ref.filename);
 await fs.writeFile(workingFile,'modified');
 await assert.rejects(working.read(registry,'demo',ref),/changed on disk/);
 await sourceStore.removeStored(registry,'demo',entry);
 await assert.rejects(fs.stat(workingFile),{code:'ENOENT'});
 assert.equal(await fs.readFile(originalFile,'utf8'),'%PDF-1.4 original evidence');
});
