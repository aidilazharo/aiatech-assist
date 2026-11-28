'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const identity=require('../src/lib/updates/extension-build-identity'),updater=require('../src/lib/updates/github-release-updater');
const version='0.1.66',stamp=(hash,date)=>({schema:1,contentSha256:hash.repeat(64),builtAt:date});
const old=stamp('a','2026-11-27T01:00:00.000Z'),next=stamp('b','2026-11-28T01:00:00.000Z');
const manifest=b=>({name:'atgv-aiatech-assist',publisher:'aia-my',version,atgvBuild:b});
function zip(value){
 const name=Buffer.from('extension/package.json'),plain=Buffer.from(JSON.stringify(value)),raw=zlib.deflateRawSync(plain);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(raw.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(name.length,26);
 const prefix=Buffer.concat([local,name,raw]),central=Buffer.alloc(46);
 central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(raw.length,20);central.writeUInt32LE(plain.length,24);central.writeUInt16LE(name.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(prefix.length,16);
 return Buffer.concat([prefix,central,name,end]);
}
test('same-version build requires newer timestamp and different payload, not just new tag or ZIP',()=>{
 assert.deepEqual(identity.identity(manifest(old),version),old);assert.equal(identity.newerBuild(old,next),true);
 assert.equal(identity.newerBuild(next,old),false);
 assert.equal(identity.newerBuild(old,{...old,builtAt:next.builtAt}),false);
 assert.equal(identity.newerBuild(null,next),false);
 assert.equal(identity.identity({...manifest(next),publisher:'other'},version),null);
 assert.equal(identity.identity(manifest(next),'0.1.67'),null);
});
test('bounded VSIX manifest parser reads packaged build and rejects malformed archives',()=>{
 assert.deepEqual(identity.readManifest(zip(manifest(next))),manifest(next));
 assert.throws(()=>identity.readManifest(Buffer.from('PKbad')),/Invalid VSIX/);
 const malformed=zip(manifest(next));malformed.writeUInt32LE(0xffffffff,22);assert.throws(()=>identity.readManifest(malformed),/Inconsistent VSIX manifest headers/);
 const broken=zip(manifest(next));broken[broken.length-22]=0;assert.throws(()=>identity.readManifest(broken),/ZIP directory/);
});
test('verified same-version build inspection rejects checksum mismatch and selects new local tags',async()=>{
 const repo=updater.RELEASE_REPOSITORIES[1],filename='atgv-aiatech-assist-'+version+'.vsix',bytes=zip(manifest(next)),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const assets=[{name:filename,url:'https://api.github.com/repos/'+repo+'/releases/assets/1',size:bytes.length},{name:'vsix.sha256',url:'https://api.github.com/repos/'+repo+'/releases/assets/2',size:90}];
 const release=(tag,published_at)=>({tag_name:tag,published_at,html_url:'https://github.com/'+repo+'/releases/tag/'+tag,assets});
 const newer=release('v'+version+'-local.abcdef0',next.builtAt),older=release('v'+version+'-build.9999',old.builtAt);
 const selected=updater.selectRelease([older,newer],version,'https://github.com/'+repo+'/releases',{includeCurrent:true});
 assert.equal(selected.tag,newer.tag_name);assert.deepEqual(await updater.inspectReleaseBuild(selected,{request:async url=>url.endsWith('/1')?bytes:Buffer.from(sha+'  '+filename+'\n')}),next);
 await assert.rejects(updater.inspectReleaseBuild(selected,{request:async url=>url.endsWith('/1')?bytes:Buffer.from('0'.repeat(64)+'  '+filename+'\n')}),/checksum verification/);
});

test('legacy build can migrate only to a valid verified stamped package; content identity still deduplicates',()=>{
 const legacy=manifest(undefined),sourceSha='c'.repeat(40);
 assert.equal(identity.eligibleBuild(legacy,next),true);
 assert.equal(identity.eligibleBuild(legacy,null),false);
 assert.equal(identity.eligibleBuild({...legacy,atgvBuild:{schema:999}},next),false);
 assert.equal(identity.eligibleBuild(manifest(next),{...next,builtAt:'2026-11-29T01:00:00.000Z'}),false);
 assert.equal(identity.eligibleBuild(manifest(next),old),false);
 assert.deepEqual(identity.identity(manifest({...next,sourceSha}),version),{...next,sourceSha});
 assert.deepEqual(identity.identity(manifest({...next,sourceSha:'bad'}),version),next);
});
