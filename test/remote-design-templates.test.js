'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const catalog=require('../src/github-sdlc-catalog');
const fixture=require('./catalog-fixture');
test('the actual UI design HTML, token JSON and guidance come from the pinned remote snapshot',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-design-'));
 try{await fixture.activate(root);
  const text=await catalog.designReference(root);
  assert.match(text,/AIA Qi-informed mockup guidance/);
  assert.match(text,/Reference markup/);
  assert.match(text,/--brand/);
  assert.match(text,/Tokens:/);
  assert.match(await catalog.designTemplate(root,'aia-qi','mockup-template.html'),/<!doctype html>/);
  assert.match(await catalog.roleSkill(root,'business-analyst'),/Business Analyst/i);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('missing design template does not fall back to hardcoded UI markup',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-design-missing-'));
 try{await fixture.activate(root);
  await fs.rm(path.join(root,'.atgv','catalog-assets',fixture.SHA,'shared','design-systems','aia-qi','mockup-template.html'));
  await assert.rejects(()=>catalog.designReference(root),/Design template is missing/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
