'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const publisher=require('../src/repo-sync-release-publisher');
const source={owner:'aidilazharo',repo:'aiatech-assist',name:'aidilazharo/aiatech-assist'};
const destination={owner:'aiamalaysia',repo:'my-fow-technology-app-techassists-dev-sdlc',name:'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc'};
test('publisher restricts repository pairs and release tag families',()=>{
 assert.equal(publisher.pairFor(source,destination).kind,'extension');
 assert.throws(()=>publisher.pairFor(source,{name:'other/repo'}),/restricted/);
 assert.equal(publisher.tagInfo('v0.0.84-build.921','extension').version,'0.0.84');
 assert.equal(publisher.tagInfo('v0.0.8-source-build.38','library').version,'0.0.8');
 assert.throws(()=>publisher.tagInfo('v0.0.8-source-build.38','extension'),/exact/);
});
test('unmerged PR blocks all GitHub writes',async()=>{
 const calls=[];
 await assert.rejects(publisher.publish({source,destination,sourcePat:'a',destPat:'b',prNumber:2,tag:'v0.0.84-build.921',request:async(r,t,m,s)=>{calls.push(m);return {status:200,body:{merged:false,state:'open'}};}}),/must be merged/);
 assert.deepEqual(calls,['GET']);
});
test('projection rejects changed source, but excludes protected workflows',()=>{
 const a={path:'package.json',type:'blob',mode:'100644',sha:'a'.repeat(40)};
 const ignored={...a,path:'.github/workflows/build.yml'};
 assert.doesNotThrow(()=>publisher.verifyProjection([a,ignored],[a]));
 assert.throws(()=>publisher.verifyProjection([a],[{...a,sha:'b'.repeat(40)}]),/differs/);
});
test('checksum binds the exact artifact filename and bytes',()=>{
 const bytes=Buffer.from('verified binary'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.doesNotThrow(()=>publisher.verifyChecksum(bytes,Buffer.from(hash+'  file.vsix\n'),'file.vsix'));
 assert.throws(()=>publisher.verifyChecksum(bytes,Buffer.from(hash+'  other.vsix\n'),'file.vsix'),/verification failed/);
});
test('Workspace exposes the resumable publication action',()=>{
 const source=fs.readFileSync(require.resolve('../src/repo-sync-workspace'),'utf8');
 assert.match(source,/id="publishMergedRelease"/);assert.match(source,/releasePublisher\.publish/);
});
