'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=file=>fss.readFileSync(path.join(root,file),'utf8');
const migration=require('../src/legacy-offline-library-cleanup');
const {compareVersions}=require('../src/library-semver');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const git={sha:'a'.repeat(40),version:'1.1.18',checkout:'/verified/catalog'};
async function fixture(t){
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v068-'));
 t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const dir=migration.location(workspace),data=path.join(dir,'files');
 await fs.mkdir(path.join(data,'roles','developer'),{recursive:true});
 const assets={
  'VERSION':'1.1.17\n',
  'catalog.json':JSON.stringify({schema:1,version:'1.1.17',roles:['developer'],techStacks:[]}),
  'roles/developer/SKILL.md':'# Verified Developer\n'
 };
 for(const [rel,body] of Object.entries(assets))await fs.writeFile(path.join(data,...rel.split('/')),body);
 await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({
  schema:1,source:'zip',archiveHash:'b'.repeat(64),
  repository:'aidilazharo/tech-stacks-skills',
  assets:Object.fromEntries(Object.entries(assets).map(([k,v])=>[k,hash(v)]))
 }));
 await fs.writeFile(path.join(workspace,'keep.txt'),'user project stays');
 return {workspace,dir,data};
}
test('legacy ZIP directory is removed only with verified equal/newer Git and unchanged managed files',async t=>{
 const {workspace,dir}=await fixture(t);
 const result=await migration.retire(workspace,{verifiedGit:git});
 assert.equal(result.removed,true);
 await assert.rejects(()=>fs.lstat(dir),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(workspace,'keep.txt'),'utf8'),'user project stays');
 assert.deepEqual(await migration.retire(workspace,{verifiedGit:git}),{removed:false,reason:'not-present'});
});
test('no verified Git catalog means legacy content is preserved for recovery',async t=>{
 const {workspace,dir}=await fixture(t);
 const result=await migration.retire(workspace);
 assert.equal(result.removed,false);
 assert.equal(result.reason,'verified-git-required');
 assert.equal((await fs.stat(dir)).isDirectory(),true);
});
test('modified or unexpected offline files cannot be removed automatically',async t=>{
 const {workspace,dir,data}=await fixture(t);
 await fs.appendFile(path.join(data,'roles','developer','SKILL.md'),'user edit');
 assert.equal((await migration.retire(workspace,{verifiedGit:git})).removed,false);
 await fs.writeFile(path.join(dir,'unexpected.txt'),'personal');
 const response=await migration.retire(workspace,{verifiedGit:git});
 assert.equal(response.removed,false);
 assert.equal(response.reason,'unexpected-snapshot-entries');
 assert.equal(await fs.readFile(path.join(dir,'unexpected.txt'),'utf8'),'personal');
});
test('newer imported versions are preserved rather than downgraded by Git retirement',async t=>{
 const {workspace,dir}=await fixture(t);
 const result=await migration.retire(workspace,{verifiedGit:{...git,version:'1.1.16'}});
 assert.equal(result.reason,'newer-zip-preserved');
 assert.equal((await fs.stat(dir)).isDirectory(),true);
 assert.ok(compareVersions('1.1.18','1.1.17')>0);
});
test('offline ZIP import, activation and executable cache have been retired',()=>{
 const cat=read('src/github-sdlc-catalog.js');
 const host=read('src/lib/runtime/extension-runtime.js');
 const vendor=read('src/catalog-vendor-libraries.js');
 const status=read('media/start.js');
 assert.equal(fss.existsSync(path.join(root,'src','offline-sdlc-library.js')),false);
 assert.doesNotMatch(cat,/offlineLibrary|importZip|offlineCache/);
 assert.doesNotMatch(host,/case 'importLibraryZip':|offlineLibrary\.importZip|catalogVendorLibraries\.installOffline/);
 assert.doesNotMatch(vendor,/installOffline|offline-zip|ZIP_CACHE/);
 assert.doesNotMatch(status,/Installed ZIP|Offline ZIP active/);
 assert.match(host,/sdlcCatalog\.syncGitWorkspace/);
 assert.match(host,/legacyOfflineCleanup\.retire/);
});
test('temporary notifications cover the credential row for exactly five seconds with no additional layout row',()=>{
 const ui=read('media/start.js'),css=read('media/atgv-consistency.css');
 const start=ui.indexOf('function showTopNotification(item){'),end=ui.indexOf('function closeTopNotification(){',start);
 const show=ui.slice(start,end);
 assert.match(show,/topNoticeTimer=setTimeout\(closeTopNotification,5000\)/);
 assert.doesNotMatch(show,/20000:11000/);
 assert.match(show,/credential\?\.getBoundingClientRect/);
 assert.match(show,/--atgv-notice-row-height/);
 assert.match(css,/#topNotification\.top-notification\{[\s\S]*?position:fixed!important/);
 assert.match(css,/z-index:90!important/);
 assert.match(css,/border:0!important;[\s\S]*?border-bottom:3px solid var\(--atgv-notice-line/);
 assert.match(css,/#roleCredentialBanner\.atgv-role-credential-banner\{[\s\S]*?border:0!important/);
});
