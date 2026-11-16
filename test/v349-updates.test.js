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
 return {tag_name:tag,html_url:`https://github.com/aidilazharo/aiatech-assist/releases/tag/${tag}`,draft:false,
 assets:assets?[`atgv-aiatech-assist-${version}.vsix`,'vsix.sha256'].map(name=>({name,url:`https://api.github.com/repos/aidilazharo/aiatech-assist/releases/assets/${build}${name.length}`,size:name==='vsix.sha256'?90:300})):[]};
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
 item.assets[0].url='https://api.github.com/repos/aidilazharo/aiatech-assist/releases/assets/12';
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
 for(const id of ['settingsSoftwareUpdateGroup','checkSoftwareUpdates','installExtensionRelease','viewExtensionRelease'])assert.ok(html.includes(`id="${id}"`));
 for(const type of ['checkSoftwareUpdates','installExtensionRelease','viewExtensionRelease']){
  assert.ok(runtime.includes(`case '${type}':`));assert.ok(ui.includes(`'${type}'`));
 }
 assert.match(runtime,/scheduleSoftwareUpdates\(\)/);
 assert.match(runtime,/downloadVerified/);
 assert.match(runtime,/context\.globalState\.update\(key,promptId\)/);
  assert.match(runtime,/catalogRemote\?\.sha\|\|remote/);
});
