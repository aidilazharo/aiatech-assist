'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const offline=require('../src/offline-sdlc-library');
const vendor=require('../src/catalog-vendor-libraries');
const read=p=>fss.readFileSync(path.join(__dirname,'..',p),'utf8');

test('offline vendor files can be activated only by matching pinned, verified ZIP manifest',async()=>{
 const root=read('src/catalog-vendor-libraries.js');
 assert.match(root,/const ZIP_CACHE=\/\^zip-/);
 assert.match(root,/async function installOffline\(/);
 assert.match(root,/if\(offline\)throw Error\('Offline ZIP webview asset does not match the trusted extension lock/);
 await assert.rejects(vendor.installOffline({catalogRoot:os.tmpdir(),storageRoot:os.tmpdir(),archiveHash:'fake'}),/verified offline Library ZIP SHA-256/);
});
test('offline ZIP import rebuilds Library Studio with pinned CodeMirror assets',()=>{
 const ext=read('src/lib/runtime/extension-runtime.js');
 const segment=ext.slice(ext.indexOf("case 'importLibraryZip':"),ext.indexOf("case 'startupTestConnections':"));
 assert.match(segment,/offlineLibrary\.importZip\(/);
 assert.match(segment,/await prepareVendorAssets\(\{syncIfMissing:false\}\)/);
 assert.match(segment,/webview\.options=.*localResourceRoots/);
 assert.match(segment,/webview\.html=html\(dashboard\.webview,\{resumeLibrary:true\}\)/);
 assert.match(ext,/catalogVendorLibraries\.installOffline/);
});
test('official offline Library ZIP installs CodeMirror with immutable SHA pins, then survives offline restart',async(t)=>{
 const zipped=process.env.ATGV_TEST_LIBRARY_ZIP;
 if(!zipped||!fss.existsSync(zipped)){t.skip('Provide ATGV_TEST_LIBRARY_ZIP to run full CodeMirror ZIP import test');return;}
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-codemirror-offline-'));
 t.after(()=>fs.rm(tmp,{force:true,recursive:true}));
 await fs.mkdir(path.join(tmp,'project','.atgv'),{recursive:true});
 const repo='https://github.com/aidilazharo/tech-stacks-skills';
 const result=await offline.importZip({file:zipped,workspace:path.join(tmp,'project'),repositoryUrl:repo});
 const loaded=await offline.imported(path.join(tmp,'project'),repo);
 assert.equal(loaded.archiveHash,result.archiveHash);
 const installed=await vendor.installOffline({catalogRoot:loaded.root,storageRoot:tmp,archiveHash:loaded.archiveHash});
 assert.equal(installed.source,'offline-zip');
 assert.ok(installed.commit.startsWith('zip-'));
 assert.equal((await vendor.cached({storageRoot:tmp})).dir,installed.dir);
 assert.match(await fs.readFile(path.join(installed.dir,'codemirror/lib/codemirror.js'),'utf8'),/CodeMirror/);
 // A changed CodeMirror script inside a second, untrusted offline import cannot
 // be activated as a browser library. The good cached source stays intact.
 const corrupted=path.join(tmp,'altered');await fs.cp(loaded.root,corrupted,{recursive:true});
 await fs.appendFile(path.join(corrupted,'shared/libraries/webview/assets/codemirror/lib/codemirror.js'),'\n// tampered\n');
 const sourceFile=path.join(corrupted,'shared/libraries/webview/assets/codemirror/lib/codemirror.js');
 if(fss.existsSync(sourceFile)){
  const cache2=path.join(tmp,'secondary');
  await assert.rejects(vendor.installOffline({catalogRoot:corrupted,storageRoot:cache2,archiveHash:result.archiveHash}),/trusted extension lock/);
 }
 assert.equal((await vendor.cached({storageRoot:tmp})).dir,installed.dir);
});
