'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createQueue,KEY}=require('../src/repo-sync-release-queue');
const {pruneManagedReleaseArtifacts,githubUrl}=require('../src/repo-sync-pr');
const source=githubUrl('https://github.com/aidilazharo/aiatech-assist');
const destination=githubUrl('https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc');
test('queue is durable, idempotent, waits for merge and does not persist secrets',async()=>{
 const map=new Map(),preferences={get:(k,d)=>map.get(k)??d,update:async(k,v)=>map.set(k,v)};
 const secrets={get:async()=> 'private-pat'};let merged=false,published=0;
 const opts={preferences,secrets,request:async()=>({status:200,body:{merged,state:merged?'closed':'open'}}),publish:async()=>{published++;return {url:'https://github.com/'+destination.name+'/releases/tag/v0.0.93-build.1'};}};
 const first=createQueue(opts),job={source,destination,prNumber:12,tag:'v0.0.93-build.1'};
 await first.enqueue(job);await first.enqueue(job);await first.tick();
 assert.equal(published,0);assert.equal(first.rows().length,1);assert.equal(first.rows()[0].status,'awaiting-merge');
 merged=true;const resumed=createQueue(opts);await resumed.tick();await resumed.tick();
 assert.equal(published,1);assert.equal(resumed.rows()[0].status,'published');assert.ok(!JSON.stringify(map.get(KEY)).includes('private-pat'));
});
test('pruning deletes only tracked files owned by previous release manifest',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-release-prune-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const old='release-artifacts/v0.0.92-build.1/',current='release-artifacts/v0.0.93-build.1/';
 await fs.mkdir(path.join(root,old),{recursive:true});
 await fs.writeFile(path.join(root,old,'release.json'),JSON.stringify({schema:1,sourceRepository:source.name,releaseTag:'v0.0.92-build.1',assets:[{name:'old.vsix'}]}));
 await fs.writeFile(path.join(root,old,'old.vsix'),'old');
 await fs.writeFile(path.join(root,old,'keep.txt'),'unmanaged');
 const commands=[];
 const removed=await pruneManagedReleaseArtifacts({root,tracked:[old+'release.json',old+'old.vsix',old+'keep.txt',current+'release.json'],sourceName:source.name,keepTag:'v0.0.93-build.1',runner:async(bin,args)=>{commands.push([bin,...args]);}});
 assert.deepEqual(removed,[old+'release.json',old+'old.vsix']);
 assert.equal(commands.length,2);
});
