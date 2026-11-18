'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const lock=require('../src/vendor-library-lock.json');
test('Quill and Frappe are externalized into approved GitHub browser library manifest',()=>{
 for(const name of ['quill/quill.js','quill/quill.snow.css','frappe-gantt/frappe-gantt.umd.js','frappe-gantt/frappe-gantt.css']){
  assert.ok(lock.assets.some(x=>x.path===name));assert.equal(fs.existsSync(path.join(root,'media/vendor',name)),false);
 }
 assert.equal(fs.existsSync(path.join(root,'media/vendor/drawio')),false);
 assert.ok(fs.statSync(path.join(root,'media/diagram-canvas.js')).size<15000);
});
test('trusted library hashes are pinned inside ATGV with no actual third-party JS bundles packaged',()=>{
 assert.equal(lock.schema,1);assert.equal(lock.version,'1.0.1');
 assert.equal(lock.assets.length,24);
 for(const item of lock.assets){assert.match(item.sha256,/^[a-f0-9]{64}$/);assert.ok(item.bytes>0);}
 assert.ok(lock.assets.reduce((sum,x)=>sum+x.bytes,0)<1_400_000);
});
