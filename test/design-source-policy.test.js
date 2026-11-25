'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../src/design-source-policy');
test('visual design requires readable user-uploaded evidence',()=>{
 assert.throws(()=>policy.requireReference({exists:false}),/Upload a design reference/);
 assert.throws(()=>policy.requireReference({exists:true,sha256:'abc'}),/no readable design evidence/);
 assert.equal(policy.requireReference({exists:true,sha256:'abc',imageCount:1}).imageCount,1);
});
test('design policy forbids independent themes and blocks unsupported UI file changes',()=>{
 const guide=policy.guide('Project CSS evidence','Uploaded screenshot observations');
 assert.match(guide,/Never invent your own visual design/);
 assert.match(guide,/Project CSS evidence/);
 assert.match(guide,/Uploaded screenshot observations/);
 assert.throws(()=>policy.guardVisualFiles([{path:'src/App.tsx'}],{references:[]}),/reference required/);
 assert.equal(policy.guardVisualFiles([{path:'server/index.mjs'}],{references:[]}),true);
 assert.equal(policy.guardVisualFiles([{path:'src/App.tsx'}],{references:[{key:'TC-1'}]}),true);
});
test('host uses reference policy for UX and Developer generation',()=>{
 const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(host,/developerDesignSource\(/);
 assert.match(host,/designReferenceHash/);
 assert.match(host,/guardVisualFiles\(candidate.files,designSource\)/);
 assert.match(host,/Independent AI design is disabled/);
 assert.match(host,/User-uploaded design reference and committed project repository loaded/);
});
