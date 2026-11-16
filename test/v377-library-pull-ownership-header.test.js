'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const verification=require('../src/library-update-version');

test('library pull success requires matching installed SemVer and pinned main SHA',()=>{
 const sha='a'.repeat(40),expected={version:'1.1.15',sha};
 assert.deepEqual(verification.verifyActivatedPull(expected,{version:'1.1.15',sha}),{version:'1.1.15',offline:false});
 assert.throws(()=>verification.verifyActivatedPull(expected,{version:'1.1.12',sha}),/verification failed/i);
 assert.throws(()=>verification.verifyActivatedPull(expected,{version:'1.1.15',sha:'b'.repeat(40)}),/verification failed/i);
 assert.throws(()=>verification.verifyActivatedPull(expected,{version:'1.1.12',offline:true}),/remains active/);
 assert.deepEqual(verification.verifyActivatedPull(expected,{version:'1.1.16',offline:true}),{version:'1.1.16',offline:true});
 assert.throws(()=>verification.verifyActivatedPull(expected,{version:'1.1.15',offline:true}),/remains active/);
});
test('both catalog pull pathways verify the active library instead of reporting success on Git exit alone',()=>{
 const s=read('src/lib/runtime/extension-runtime.js');
 assert.match(s,/const pinned=await sdlcCatalog\.remoteVersion\(config,token\)/);
 assert.equal((s.match(/libraryUpdateVersion\.verifyActivatedPull\(pinned,selected\)/g)||[]).length,2);
 assert.match(s,/Installed Library v'\+selected\.version/);
});
test('all destructive BR pathways enforce verified BR owner, including source deletion and remote retries',()=>{
 const s=read('src/lib/runtime/extension-runtime.js'),remote=read('src/remote-br-deletion.js');
 assert.match(s,/async function requireVerifiedBRDeletionOwner\(brIds\)/);
 assert.match(s,/owners\.scope==='local'/);
 assert.match(s,/await requireVerifiedBRDeletionOwner\(impact\.requirements\.map\(item=>item\.id\)\)/);
 assert.match(s,/await requireVerifiedBRDeletionOwner\(ids\)/);
 assert.match(s,/authorize:\(\)=>requireVerifiedBRDeletionOwner\(ids\)/);
 assert.match(remote,/await authorize\(plan\.brIds\)/);
});
test('compact branding maintains independent versions within logo-height title block',()=>{
 const css=read('media/start.css');
 assert.match(css,/v0\.3\.77: compact title-width identity/);
 assert.match(css,/\.brand-identity\{display:inline-flex/);
 assert.match(css,/\.brand-versions\{display:block/);
});
