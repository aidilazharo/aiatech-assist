'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const source=require('../src/catalog-vendor-libraries');
const root=path.join(__dirname,'..');
// Optional integration checkout; unit tests remain portable without GitHub/network.
const catalog=process.env.ATGV_TEST_CATALOG_DIR||'';
const commit='a'.repeat(40);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('third party browser libraries are no longer shipped in VSIX; trusted lock and GitHub adapter exist',()=>{
 assert.ok(fs.existsSync(path.join(root,'src/vendor-library-lock.json')));
 assert.ok(!fs.existsSync(path.join(root,'media/vendor/codemirror/lib/codemirror.js')));
 assert.ok(!fs.existsSync(path.join(root,'media/vendor/quill/quill.js')));
 assert.ok(!fs.existsSync(path.join(root,'media/vendor/frappe-gantt/frappe-gantt.umd.js')));
 assert.match(read('test/generated/extension-source.txt'),/catalogVendorLibraries\.install/);
 assert.match(read('test/generated/extension-source.txt'),/installedVendorAssets\.dir/);
 assert.match(read('test/generated/extension-source.txt'),/atgv-vendor-libs/);
});
test('repository bundle matches pinned trusted manifest, not just checksum claims from GitHub',async()=>{
 const manifest={schema:1,id:'atgv-approved-webview-libraries',version:'1.0.0',assets:source.files};
 assert.equal(source.verifyManifest(manifest).length,21);
 const forged={...manifest,assets:manifest.assets.map(x=>({...x}))};forged.assets[0].sha256='f'.repeat(64);
 assert.throws(()=>source.verifyManifest(forged),/not approved/);
});
test('verified download installs once, survives offline, and rejects tampering in the cache',async t=>{
 if(!catalog||!fs.existsSync(path.join(catalog,source.MANIFEST))){t.skip('Integration catalog not supplied; set ATGV_TEST_CATALOG_DIR for full download test.');return;}
 const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-v331-assets-'));
 try{
  const first=await source.install({catalogRoot:catalog,storageRoot:tmp,commit});
  assert.equal(first.fromCache,false);
  assert.equal((await source.cached({storageRoot:tmp})).version,'1.0.0');
  const second=await source.install({catalogRoot:catalog,storageRoot:tmp,commit});
  assert.equal(second.fromCache,false);assert.equal(first.dir,second.dir);
  const target=path.join(first.dir,'codemirror','lib','codemirror.js');
  await fsp.appendFile(target,'\n// altered');
  assert.equal(await source.cached({storageRoot:tmp}),null);
  await assert.rejects(source.install({catalogRoot:catalog,storageRoot:tmp,commit}),/unverified/);
 }finally{await fsp.rm(tmp,{recursive:true,force:true});}
});
test('cached libraries without an approved git checkout are unavailable to new installations',async()=>{
 const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-v331-empty-'));
 try{assert.equal(await source.cached({storageRoot:tmp}),null);}
 finally{await fsp.rm(tmp,{recursive:true,force:true});}
});
