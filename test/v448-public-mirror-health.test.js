'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const client=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const updater=require('../src/lib/updates/github-release-updater');

function isPublicMirrorBehind(latestVersion,version){
 const start=client.indexOf(' const semverParts=value=>');
 const end=client.indexOf(' const checked=',start);
 assert.ok(start>=0&&end>start,'Missing safe public mirror comparison');
 const source=client.slice(start,end);
 return vm.runInNewContext(source+'\npublicBehind',{latestVersion,version});
}
test('a stale public mirror is labeled behind and must not offer a downgrade',()=>{
 assert.equal(isPublicMirrorBehind('0.4.33','0.4.48'),true);
 assert.equal(isPublicMirrorBehind('0.4.46','0.4.47'),true);
 assert.equal(isPublicMirrorBehind('0.4.48','0.4.48'),false);
 assert.equal(isPublicMirrorBehind('0.4.49','0.4.48'),false);
 assert.equal(isPublicMirrorBehind('0.5.0','0.4.99'),false);
 assert.match(client,/public release mirror is behind/);
 assert.match(client,/No downgrade available/);
});
test('release discovery uses only the canonical Extension source repository',()=>{
 assert.deepEqual(updater.RELEASE_REPOSITORIES,['aiamalaysia/my-fow-technology-app-techassists-dev-sdlc']);
 const pkg=require('../package.json');
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
});
