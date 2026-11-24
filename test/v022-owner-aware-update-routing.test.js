'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const routing=require('../src/lib/updates/repository-routes');
const startup=require('../src/lib/startup-setup');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('both GitHub organizations resolve exactly to their sources and the same release distribution repositories',()=>{
 const expected=[
  ['aidilazharo','aiatech-assist','tech-stacks-skills'],
  ['aiamalaysia','my-fow-technology-app-techassists-dev-sdlc','my-fow-technology-app-techassists-enterprise-skills']
 ];
 for(const [owner,extension,library] of expected){
  const routes=routing.forOwner('github.com/'+owner);
  assert.equal(routes.owner,owner);
  assert.equal(routes.extensionSource,`https://github.com/${owner}/${extension}`);
  assert.equal(routes.librarySource,`https://github.com/${owner}/${library}`);
  assert.equal(routes.extensionReleases,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc');
  assert.equal(routes.libraryReleases,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
  assert.equal(routing.asRepository(routes.extensionSource),owner+'/'+extension);
  assert.equal(routing.asRepository(routes.librarySource),owner+'/'+library);
  assert.equal(startup.validate({jiraUrl:'https://example.atlassian.net',email:'user@example.com',githubUrl:'github.com/'+owner}).libraryRepoUrl,routes.librarySource);
 }
 for(const value of ['otherowner','github.com/otherowner','github.com/aiamalaysia/sneaky','https://evil.test/aiamalaysia','','../aidilazharo'])
  assert.equal(routing.forOwner(value),null,value);
});
test('runtime uses chosen GitHub source main and never attributes one organization mirror to the other',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const start=host.indexOf("case 'catalogPull':{");
 const end=host.indexOf("case 'openingSelect':{",start);
 assert.ok(start>0&&end>start);
 const pull=host.slice(start,end);
 assert.match(pull,/const config=catalogConfig\(\)/);
 assert.match(pull,/sdlcCatalog\.remoteVersion\(config,token\)/);
 assert.match(pull,/sdlcCatalog\.syncGitWorkspace\(config,token,workspace,context\.globalStorageUri\.fsPath,\{expectedSha:remote\.sha\}\)/);
 assert.match(pull,/libraryUpdateVersion\.compareInstalledRemote\(installed\.version,remote\.version\)/);
 assert.doesNotMatch(pull,/libraryUpdateVersion\.compareInstalledRelease\(installed,release\)/);
 assert.doesNotMatch(pull,/config\.repositoryUrl!==startupSetup\.SOURCE_REPOS\.aidilazharo\.library/);
 assert.match(pull,/No downgrade was performed/);
 assert.doesNotMatch(pull,/offlineLibrary|importZip|downloadVerified\(release/);
 assert.doesNotMatch(pull,/\.\.\.catalogConfig\(\),repositoryUrl:FIXED_LIBRARY_REPOSITORY/);
});
test('update check and UI distinguish selected source from a stale public mirror',()=>{
 const host=read('src/lib/runtime/extension-runtime.js'),ui=read('media/start.js');
 assert.match(host,/extensionSourceRepositoryUrl:routes\?\.extensionSource/);
 assert.match(host,/libraryRepositoryUrl:routes\?\.librarySource/);
 assert.match(host,/extensionReleaseRepositoryUrl:startupSetup\.RELEASES\.extension/);
 assert.match(host,/libraryReleaseRepositoryUrl:startupSetup\.RELEASES\.library/);
 assert.match(host,/if\(force&&!catalogBusy\)await catalogCheck\(\{interactive:false\}\)/);
 assert.match(host,/libraryReleaseAvailable=!!libraryRelease&&libraryUpdateVersion\.compareInstalledRelease/);
 assert.doesNotMatch(host,/catalogRemote=\{repository:libraryLatest\.repository/);
 assert.match(ui,/const mirrorBehind=/);
 assert.match(ui,/No downgrade available/);
 assert.match(ui,/Checking selected GitHub Library source/);
});
