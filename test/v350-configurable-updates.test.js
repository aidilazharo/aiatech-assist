'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const updater = require('../src/lib/updates/github-release-updater');

const alternate='https://github.com/testmaintainer/custom-assist/releases';
const repo='testmaintainer/custom-assist';
const filename='atgv-aiatech-assist-0.3.52.vsix';
function release({version='0.3.52',assetRepo=repo,linkRepo=repo}={}){
 const tag=`v${version}-build.7`;
 return {tag_name:tag,html_url:`https://github.com/${linkRepo}/releases/tag/${tag}`,draft:false,assets:[
  {name:`atgv-aiatech-assist-${version}.vsix`,url:`https://api.github.com/repos/${assetRepo}/releases/assets/131`,size:8},
  {name:'vsix.sha256',url:`https://api.github.com/repos/${assetRepo}/releases/assets/132`,size:120}
 ]};
}
test('release settings accept GitHub Releases URLs and normalize repo landing URLs',()=>{
 assert.deepEqual(updater.parseRepositoryUrl('https://github.com/testmaintainer/custom-assist/'),{
  repository:repo,url:alternate,api:`https://api.github.com/repos/${repo}/releases?per_page=30`
 });
 assert.equal(updater.parseRepositoryUrl(alternate).repository,repo);
 assert.equal(updater.parseRepositoryUrl().repository,'aidilazharo/aiatech-assist');
});
test('release settings reject arbitrary API endpoints, spoofed hosts and unsafe paths',()=>{
 for(const value of [
  '', 'http://github.com/testmaintainer/custom-assist/releases',
  'https://github.com.evil.example/testmaintainer/custom-assist/releases',
  'https://evil.example/testmaintainer/custom-assist/releases',
  'https://testmaintainer:password@github.com/testmaintainer/custom-assist/releases',
  'https://github.com/testmaintainer/custom-assist/releases/tag/v0.3.51',
  'https://github.com/testmaintainer/custom-assist/releases?latest=1',
  'https://github.com/testmaintainer/custom-assist%2Fother/releases',
  'https://github.com/testmaintainer/custom-assist.git',
  'https://github.com/testmaintainer/custom-assist#versions',
 ]) assert.throws(()=>updater.parseRepositoryUrl(value),Error,value);
});
test('release lookup uses configured repository and rejects wrong-repository assets',async()=>{
 let seen='',headers;
 const request=async (url,options)=>{
  seen=url;headers=options;
  return Buffer.from(JSON.stringify([release()]));
 };
 const got=await updater.latestRelease({version:'0.3.51',repositoryUrl:alternate,request});
 assert.equal(seen,`https://api.github.com/repos/${repo}/releases?per_page=30`);
 assert.equal(got.repository,repo);
 assert.equal(got.releaseUrl,alternate);
 assert.ok(headers.maxBytes>0);
 assert.equal(updater.selectRelease([release({assetRepo:'anotherowner/other'})],'0.3.51',alternate),null);
 assert.equal(updater.selectRelease([release({linkRepo:'anotherowner/other'})],'0.3.51',alternate),null);
});
test('verification downloads from selected repository only and enforces checksum',async(t)=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv350-release-'));
 t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const binary=Buffer.from('new-vsix');
 const checksum=crypto.createHash('sha256').update(binary).digest('hex');
 const manifest=release();
 manifest.assets[0].size=binary.length;
 const selected=updater.selectRelease([manifest],'0.3.51',alternate);
 const fetch=async(url)=> url.endsWith('/131')?binary:Buffer.from(`${checksum}  ${filename}\n`);
 const installed=await updater.downloadVerified(selected,{directory:temp,request:fetch});
 assert.equal(path.basename(installed),filename);
 assert.deepEqual(await fs.readFile(installed),binary);
 const modified={...selected,checksum:{...selected.checksum,url:'https://api.github.com/repos/different/other/releases/assets/132'}};
 await assert.rejects(updater.downloadVerified(modified,{directory:temp,request:fetch}),/not trusted/);
 const bad=async(url)=>url.endsWith('/131')?Buffer.from('tampered'):Buffer.from(`${checksum}  ${filename}\n`);
 await assert.rejects(updater.downloadVerified(selected,{directory:temp,request:bad}),/checksum verification/);
});
test('release URLs are independently configurable and still validated as GitHub repositories',()=>{
 const pkg=require('../package.json');assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 assert.equal(pkg.repository.url,'https://github.com/aidilazharo/aiatech-assist.git');
 assert.equal(updater.releaseUrlForRepository(pkg.repository.url),updater.DEFAULT_RELEASE_URL);
 assert.equal(updater.releaseUrlForRepository('https://github.com/aidilazharo/tech-stacks-skills'),'https://github.com/aidilazharo/tech-stacks-skills/releases');
 assert.equal(pkg.contributes.configuration.properties['atgvAssist.updates.releaseRepositoryUrl'],undefined);
 const runtime=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const html=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const js=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 for(const id of ['softwareReleaseRepositoryUrl','softwareLibraryRepositoryUrl','saveSoftwareUpdateSources'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/send\('saveSoftwareUpdateSources'/);
 assert.match(runtime,/case 'saveSoftwareUpdateSources':/);
 assert.match(runtime,/const release=releaseUpdater\.parseRepositoryUrl\(/);
 assert.match(runtime,/const library=sdlcCatalog\.normalizeConfig\(/);
 assert.match(runtime,/RELEASE_REPOSITORY_SETTING/);
 assert.match(runtime,/releaseRepositoryUrl,/);
 assert.match(runtime,/libraryRepositoryUrl:libraryRepository\|\|DEFAULT_LIBRARY_REPOSITORY_URL/);
 assert.match(runtime,/libraryReleaseUrl:libraryRepository\?releaseUpdater\.releaseUrlForRepository\(libraryRepository\):''/);
 assert.match(runtime,/if\(force\|\|config\.autoCheckLibrary\)/);
});
