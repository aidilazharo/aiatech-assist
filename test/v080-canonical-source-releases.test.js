'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const ext=require('../src/lib/updates/github-release-updater');
const lib=require('../src/lib/updates/library-release-updater');
const startup=require('../src/lib/startup-setup');
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const extBytes=Buffer.from('Verified aiMalaysia extension package');
const libBytes=Buffer.from('Verified aiMalaysia source library archive');
const extensionTag='v0.0.81-build.1', libraryTag='v2.0.0-source-build.1';
function fixture(repository,tag,name,size){
 return {tag_name:tag,draft:false,published_at:'2026-11-24T00:00:00Z',html_url:'https://github.com/'+repository+'/releases/tag/'+tag,assets:[
  {name,size,url:'https://api.github.com/repos/'+repository+'/releases/assets/100'},
  {name:repository===ext.REPO?'vsix.sha256':'library-source.sha256',size:100,url:'https://api.github.com/repos/'+repository+'/releases/assets/101'}
 ]};
}
test('canonical source repository URLs equal both latest Release download URLs',()=>{
 assert.equal(startup.RELEASES.extension,startup.SOURCE_REPOS.aiamalaysia.extension);
 assert.equal(startup.RELEASES.library,startup.SOURCE_REPOS.aiamalaysia.library);
 assert.equal(ext.PINNED_RELEASE_URL,startup.RELEASES.extension+'/releases/latest');
 assert.equal(lib.LATEST_URL,startup.RELEASES.library+'/releases/latest');
 assert.deepEqual(ext.RELEASE_REPOSITORIES,[ext.REPO]);
 assert.deepEqual(lib.RELEASE_REPOSITORIES,[lib.REPO]);
});
test('extension uses signed source Release and forwards private PAT only to GitHub API requests',async t=>{
 const payload=fixture(ext.REPO,extensionTag,'atgv-aiatech-assist-0.0.81.vsix',extBytes.length);
 payload.assets[1].size=sha(extBytes).length+'  atgv-aiatech-assist-0.0.81.vsix\n'.length;
 const checksum=Buffer.from(sha(extBytes)+'  atgv-aiatech-assist-0.0.81.vsix\n');
 const calls=[];
 const request=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/latest')||url.endsWith('?per_page=30'))return Buffer.from(JSON.stringify(url.endsWith('/latest')?payload:[payload]));
  return url.endsWith('/100')?extBytes:checksum;
 };
 const result=await ext.latestAcrossRepositories({version:'0.0.80',token:'private-test-pat',request});
 assert.equal(result.latest.repository,ext.REPO);
 assert.equal(result.release.version,'0.0.81');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-test-ext-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const destination=await ext.downloadVerified(result.release,{directory:dir,token:'private-test-pat',request});
 assert.deepEqual(await fs.readFile(destination),extBytes);
 assert.ok(calls.every(c=>c.options.token==='private-test-pat'));
 assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/repos/'+ext.REPO+'/releases')));
});
test('library downloads source ZIP, verifies SHA-256 and allows identical retry',async t=>{
 const name='tech-stacks-skills-2.0.0-source.zip';
 const sum=Buffer.from(sha(libBytes)+'  '+name+'\n');
 const payload=fixture(lib.REPO,libraryTag,name,libBytes.length);
 payload.assets[1].size=sum.length;
 const calls=[];
 const request=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/latest')||url.endsWith('?per_page=30'))return Buffer.from(JSON.stringify(url.endsWith('/latest')?payload:[payload]));
  return url.endsWith('/100')?libBytes:sum;
 };
 const result=await lib.latestAcrossRepositories({request,token:'private-test-pat'});
 assert.equal(result.latest.repository,lib.REPO);
 assert.equal(result.release.tag,libraryTag);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-test-lib-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=await lib.downloadVerified(result.release,{directory:dir,request,token:'private-test-pat'});
 assert.deepEqual(await fs.readFile(file),libBytes);
 const again=await lib.downloadVerified(result.release,{directory:dir,request,token:'private-test-pat'});
 assert.equal(again,file);
 assert.ok(calls.every(c=>c.options.token==='private-test-pat'));
 await fs.writeFile(file,'tampered');
 await assert.rejects(lib.downloadVerified(result.release,{directory:dir,request,token:'private-test-pat'}),/Existing staged Library ZIP differs/);
});
test('source Release lookup does not read old distribution repositories or require authorization by default',async()=>{
 const urls=[],request=async(url,options={})=>{
  assert.equal(options.token,undefined);
  urls.push(url);
  const payload=fixture(ext.REPO,extensionTag,'atgv-aiatech-assist-0.0.81.vsix',extBytes.length);
  return Buffer.from(JSON.stringify(url.endsWith('/latest')?payload:[payload]));
 };
 const latest=await ext.latestAcrossRepositories({version:'0.0.80',request});
 assert.equal(latest.latest.repository,ext.REPO);
 assert.ok(urls.every(url=>url.includes('/'+ext.REPO+'/releases')));
 assert.ok(urls.every(url=>!url.includes('/aiamalaysia/extension/')));
});
