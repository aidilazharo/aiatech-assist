'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const updater=require('../src/lib/updates/github-release-updater');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
function release(version,build,assets=true){
 const tag=`v${version}-build.${build}`;
 return {tag_name:tag,html_url:`https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/tag/${tag}`,draft:false,
 assets:assets?[`atgv-aiatech-assist-${version}.vsix`,'vsix.sha256'].map(name=>({name,url:`https://api.github.com/repos/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/assets/${build}${name.length}`,size:name==='vsix.sha256'?90:300})):[]};
}
test('release detection selects most recent newer semver, including prerelease build tags',()=>{
 const found=updater.selectRelease([release('0.3.48',7),release('0.3.49',5),release('0.3.49',6),release('0.3.50',7,false)],'0.3.48');
 assert.equal(found.tag,'v0.3.49-build.6');assert.equal(found.version,'0.3.49');
 assert.equal(updater.compareVersion('v0.3.49-build.19','0.3.48'),1);
 assert.equal(updater.compareVersion('0.3.49','0.3.49'),0);
 assert.equal(updater.selectRelease([release('0.3.48',6)],'0.3.49'),null);
});
test('rejects releases without both trusted assets and malformed release URLs',()=>{
 const item=release('0.3.49',12);item.assets[0].url='https://other.example.org/malware.vsix';
 assert.equal(updater.selectRelease([item],'0.3.48'),null);
 item.assets[0].url='https://api.github.com/repos/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/assets/12';
 item.html_url='https://phishing.test/upgrade';
 assert.equal(updater.selectRelease([item],'0.3.48'),null);
});
test('checksum verification accepts exact release asset bytes and rejects tampering',()=>{
 const filename='atgv-aiatech-assist-0.3.49.vsix',bytes=Buffer.from('test-vsix');
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(updater.verifyChecksum(Buffer.from(sha+'  '+filename+'\n'),bytes,filename),sha);
 assert.throws(()=>updater.verifyChecksum(Buffer.from(sha+'  '+filename+'\n'),Buffer.from('modified'),filename),/checksum verification/);
 assert.throws(()=>updater.verifyChecksum(Buffer.from(sha+'  different.vsix\n'),bytes,filename),/checksum verification/);
});
test('settings and runtime expose dual update checks, safe prompts and verified installation',()=>{
 const pkg=require('../package.json');assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 for(const key of ['autoCheckExtension','autoCheckLibrary','promptForUpdates','checkOnStartup']){
  assert.equal(pkg.contributes.configuration.properties['atgvAssist.updates.'+key].default,true);
 }
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),runtime=read('src/lib/runtime/extension-runtime.js');
 for(const id of ['settingsSoftwareUpdateGroup','checkSoftwareUpdates','pullLibraryFiles','viewExtensionRelease','viewLibraryRelease'])assert.ok(html.includes(`id="${id}"`));
 for(const type of ['checkSoftwareUpdates','catalogPull','viewExtensionRelease','viewLibraryRelease']){
  assert.ok(runtime.includes(`case '${type}':`));assert.ok(ui.includes(`'${type}'`));
 }
 assert.match(runtime,/scheduleSoftwareUpdates\(\)/);
 assert.match(runtime,/downloadVerified/);
 assert.match(runtime,/context\.globalState\.update\(key,promptId\)/);
  assert.match(runtime,/libraryReleaseUpdater\.latest/);
  assert.doesNotMatch(runtime,/libraryReleaseUpdater\.downloadVerified/);
  assert.match(runtime,/sdlcCatalog\.syncGitWorkspace/);
});

test('Section 8 contains exactly four visible update buttons, with independent release links',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
 const section=html.slice(html.indexOf('id="settingsSoftwareUpdateGroup"'),html.indexOf('id="projectView"'));
 const buttons=[...section.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(x=>x[1]);
 assert.deepEqual(buttons,['Check Extension Updates','Pull Library Updates','GitHub Release Extension','GitHub Release Library']);
 assert.doesNotMatch(section,/<button[^>]*(?:hidden|disabled)[^>]*>/);
 assert.match(ui,/send\('checkSoftwareUpdates',\{extensionOnly:true\}\)/);
 assert.match(host,/case 'viewExtensionRelease':\{\s*await openLatestReleaseFile\('extension'\)/);
 assert.match(host,/case 'viewLibraryRelease':\{\s*await openLatestReleaseFile\('library'\)/);
});
test('startup and manual prompts override dismissal without bypassing version verification',async()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const source=host.slice(host.indexOf('async function checkSoftwareUpdates('),host.indexOf('function scheduleSoftwareUpdates()'));
 const calls=[];
 const fn=new Function('calls',`
 let softwareCheckBusy=false,pendingStartupUpdateCheck=false,catalogBusy=false;
 const extensionRelease={version:'2.0.0'},libraryRelease={version:'2.0.0'};
 const publishUpdateStatus=async()=>{},updatePreferences=()=>({autoCheckExtension:true,autoCheckLibrary:true});
 const catalogCheck=async()=>calls.push('catalog');
 const checkExtensionRelease=async()=>calls.push('extension-check'),checkLibraryRelease=async()=>calls.push('library-check');
 const promptExtensionRelease=async(_,options)=>calls.push(['extension-prompt',options.force]);
 const promptLibraryRelease=async(_,options)=>calls.push(['library-prompt',options.force]);
 const report=()=>{};
 ${source}
 return checkSoftwareUpdates;
 `)(calls);
 await fn({prompt:true,force:true,startup:true});
 assert.deepEqual(calls,['catalog','extension-check','library-check',['extension-prompt',true],['library-prompt',true]]);
 calls.length=0;
 await fn({prompt:true,force:true,interactive:true,extensionOnly:true});
 assert.deepEqual(calls,['extension-check',['extension-prompt',true]]);
 calls.length=0;
 await fn({prompt:true});
 assert.deepEqual(calls,['extension-check','library-check',['extension-prompt',false],['library-prompt',false]]);
 assert.match(host,/compareVersion\(result\.version,installed\)>0\?result:null/);
 assert.match(host,/if\(!comparison\.available\|\|!updatePreferences\(\)\.promptForUpdates/);
});

test('latest release links open verified versioned file URLs and safely fall back to latest release page',async()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const source=host.slice(host.indexOf('async function openLatestReleaseFile('),host.indexOf('// Project GitHub actions continue',host.indexOf('async function openLatestReleaseFile(')));
 const opened=[],ext='aiamalaysia/my-fow-technology-app-techassists-dev-sdlc',lib='aiamalaysia/my-fow-technology-app-techassists-enterprise-skills';
 const mk=(repository,tag,assetKey,name)=>{const latest={repository,tag,version:'2.0.0'};return {latest,release:{...latest,[assetKey]:{name}}};};
 const extension=mk(ext,'v2.0.0-build.2','asset','atgv-aiatech-assist-2.0.0.vsix');
 const library=mk(lib,'v2.0.0-source-build.3','archive','tech-stacks-skills-2.0.0-source.zip');
 const releaseUpdater={REPO:ext,authorizedRequest:()=>null,latestAcrossRepositories:async()=>extension};
 const libraryReleaseUpdater={REPO:lib,latestAcrossRepositories:async()=>library};
 const vscode={Uri:{parse:x=>x},env:{openExternal:async url=>opened.push(url)}};
 const run=new Function('releaseUpdater','libraryReleaseUpdater','vscode','githubIssueAccessToken','report','require',source+';return openLatestReleaseFile;')(releaseUpdater,libraryReleaseUpdater,vscode,async()=>'',()=>{},()=>({version:'1.0.0'}));
 await run('extension');await run('library');
 assert.deepEqual(opened,['https://github.com/'+ext+'/releases/download/v2.0.0-build.2/atgv-aiatech-assist-2.0.0.vsix','https://github.com/'+lib+'/releases/download/v2.0.0-source-build.3/tech-stacks-skills-2.0.0-source.zip']);
 library.release=null;await run('library');assert.equal(opened.at(-1),'https://github.com/'+lib+'/releases/tag/v2.0.0-source-build.3');
 releaseUpdater.latestAcrossRepositories=async()=>{throw Error('403');};await run('extension');assert.equal(opened.at(-1),'https://github.com/'+ext+'/releases/latest');
});
