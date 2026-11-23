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
  repository:repo,url:alternate,api:`https://api.github.com/repos/${repo}/releases?per_page=30`,listApi:`https://api.github.com/repos/${repo}/releases?per_page=30`
 });
 assert.equal(updater.parseRepositoryUrl(alternate).repository,repo);
 assert.equal(updater.parseRepositoryUrl().repository,'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc');
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
test('fixed extension source checks latest first and accepts signed prereleases from the same repo',async()=>{
 assert.equal(updater.PINNED_RELEASE_URL,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/latest');
 const calls=[];
 const fetch=async url=>{
  calls.push(url);
  if(url.endsWith('/latest'))throw Error('No stable release');
  const version='0.4.20',tag='v'+version+'-build.100';
  return Buffer.from(JSON.stringify([{tag_name:tag,html_url:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/tag/'+tag,assets:[
   {name:'atgv-aiatech-assist-'+version+'.vsix',size:11,url:'https://api.github.com/repos/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/assets/1'},
   {name:'vsix.sha256',size:80,url:'https://api.github.com/repos/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/assets/2'}
  ]}]));
 };
 const got=await updater.latestRelease({repositoryUrl:updater.PINNED_RELEASE_URL,version:'0.4.13',request:fetch});
 assert.equal(got.version,'0.4.20');
 assert.ok(calls[0].endsWith('/latest')&&calls[1].endsWith('?per_page=30'));
});
test('extension and library release sources are immutable; both check every hour',()=>{
 const fs=require('node:fs');
 const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const html=read('src/lib/webview/dashboard-html.js');
 const ui=read('media/start.js');
 const library=require('../src/lib/updates/library-release-updater');
 assert.equal(library.LATEST_URL,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills/releases/latest');
 assert.match(runtime,/releaseRepositoryUrl:startupSetup\.RELEASES\.extension/);
 assert.match(runtime,/libraryReleaseUrl:startupSetup\.RELEASES\.library/);
 assert.match(runtime,/60\*60\*1000/);
 assert.doesNotMatch(runtime,/6\*60\*60\*1000/);
 for(const id of ['softwareReleaseRepositoryUrl','softwareLibraryRepositoryUrl','saveSoftwareUpdateSources'])
  assert.ok(!html.includes('id="'+id+'"'),id);
 assert.ok(!ui.includes('softwareSourcesDirty'));
 assert.ok(!runtime.includes("case 'saveSoftwareUpdateSources':"));
 assert.ok(!html.includes(updater.PINNED_RELEASE_URL),'extension release URL is hidden from settings');
 assert.ok(!html.includes(library.LATEST_URL),'library release URL is hidden from settings');
});
