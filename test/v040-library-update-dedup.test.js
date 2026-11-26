'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const versions=require('../src/library-update-version');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('matching semantic version without a verified installed build does not repeatedly offer an update',()=>{
 const remote={version:'0.0.6',tag:'v0.0.6-source-build.21'};
 for(const installed of [
  {version:'0.0.6',sha:'a'.repeat(40)},
  {version:'0.0.6'},
  {version:'0.0.6',releaseTag:'invalid'}
 ]){
  const result=versions.compareInstalledRelease(installed,remote);
  assert.equal(result.available,false);
  assert.equal(result.reason,'build-unverified');
 }
});
test('verified source-build comparisons still offer only truly newer builds',()=>{
 const installed={version:'0.0.6',releaseTag:'v0.0.6-source-build.8'};
 assert.deepEqual(
  {available:versions.compareInstalledRelease(installed,{version:'0.0.6',tag:'v0.0.6-source-build.9'}).available,
   reason:versions.compareInstalledRelease(installed,{version:'0.0.6',tag:'v0.0.6-source-build.9'}).reason},
  {available:true,reason:'newer-build'});
 assert.equal(versions.compareInstalledRelease(installed,{version:'0.0.6',tag:'v0.0.6-source-build.8'}).available,false);
 assert.equal(versions.compareInstalledRelease(installed,{version:'0.0.6',tag:'v0.0.6-source-build.7'}).available,false);
 assert.equal(versions.compareInstalledRelease(installed,{version:'0.0.7',tag:'v0.0.7-source-build.1'}).available,true);
 assert.equal(versions.compareInstalledRelease(installed,{version:'0.0.5',tag:'v0.0.5-source-build.100'}).available,false);
 assert.equal(versions.compareInstalledRelease(installed,{version:'0.0.6',tag:'invalid'}).available,false);
});
test('startup and explicit checks re-offer newer releases while hourly checks deduplicate',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const check=host.slice(host.indexOf('async function checkSoftwareUpdates('),host.indexOf('function scheduleSoftwareUpdates()'));
 assert.match(check,/if\(!extensionOnly&&libraryRelease\)await promptLibraryRelease\(libraryRelease,\{force:startup\|\|interactive\}\)/);
 assert.match(check,/promptExtensionRelease\(extensionRelease,\{force:startup\|\|interactive\}\)/);
 assert.match(host,/if\(!force&&context\.globalState\.get\(key\)===promptId\)return/);
});
test('Pull Library uses verified Git main and cannot activate obsolete ZIP archives',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const pull=host.slice(host.indexOf("case 'catalogPull':{"),host.indexOf("case 'openingSelect':{"));
 assert.match(pull,/sdlcCatalog\.remoteVersion\(config,token\)/);
 assert.match(pull,/sdlcCatalog\.syncGitWorkspace\(config,token,workspace/);
 assert.match(pull,/active\.version!==remote\.version\|\|active\.sha!==remote\.sha/);
 assert.doesNotMatch(pull,/importZip|inspectZip|downloadVerified\(release/);
});
test('the update modal makes differing build numbers visible to the user',()=>{
 const ui=read('media/start.js');
 assert.match(ui,/message\.installedTag/);
 assert.match(ui,/message\.remoteTag/);
 assert.match(ui,/installedBuild\?' · build '/);
 assert.match(ui,/latestBuild\?' · build '/);
});
