'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const setup=require('../src/lib/startup-setup'),routes=require('../src/lib/updates/repository-routes');
const root=path.resolve(__dirname,'..');
test('production sources stay canonical for current and existing account owners',()=>{
 for(const owner of ['aidilazharo','aiamalaysia']){
  const r=routes.forOwner(owner);
  assert.equal(r.librarySource,setup.RELEASES.library);
  assert.equal(r.extensionSource,setup.RELEASES.extension);
  assert.equal(setup.validate({...setup.DEFAULTS,githubUrl:'github.com/'+owner}).libraryRepoUrl,setup.RELEASES.library);
 }
 assert.equal(setup.FIXED_LIBRARY_REPOSITORY,setup.RELEASES.library);
 assert.equal(routes.forOwner('unknown-owner'),null);
});
test('installed runtime and package metadata contain no legacy hardcoded URL',()=>{
 for(const f of ['src/lib/startup-setup.js','src/lib/runtime/extension-runtime.js','src/lib/webview/dashboard-html.js','media/start.js','package.json']){
  const s=fs.readFileSync(path.join(root,f),'utf8');
  assert.doesNotMatch(s,/https:\/\/github\.com\/aidilazharo\//i,f);
 }
 const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(host,/function startupLibraryRepository\(\)\{\s*return startupSetup\.FIXED_LIBRARY_REPOSITORY;/);
 assert.match(host,/const extensionSourceRepository=startupSetup\.RELEASES\.extension/);
});
