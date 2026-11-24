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
test('Workspace exposes automatic release queue status',()=>{
 const source=fs.readFileSync(require.resolve('../src/repo-sync-workspace'),'utf8');
 assert.match(source,/id="checkReleaseSync"/);assert.match(source,/releaseQueue\.enqueue/);assert.doesNotMatch(source,/id="releasePrNumber"/);
});

test('publishes and resumes a verified merged release with no workflow or branch writes',async()=>{
 const tag='v0.0.84-build.921',src='a'.repeat(40),merged='b'.repeat(40),st='c'.repeat(40),dt='d'.repeat(40);
 const gitBlob=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 const digest=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 const files=new Map();
 for(const [name,checksum] of [['atgv-aiatech-assist-0.0.84.vsix','vsix.sha256'],['ATGV-AIATECH-Assist-v0.0.84-Source.zip','source.sha256']]){
  const bytes=Buffer.from('binary:'+name);files.set(name,bytes);files.set(checksum,Buffer.from(digest(bytes).slice(7)+'  '+name+'\n'));
 }
 files.set('vsix-size-report.json',Buffer.from('{"bytes":123}'));
 const assets=[...files].map(([name,bytes],i)=>({id:i+1,name,size:bytes.length,digest:digest(bytes),state:'uploaded'}));
 const manifest=Buffer.from(JSON.stringify({schema:1,sourceRepository:source.name,sourceBranch:'main',sourceCommit:src,codeVersion:'0.0.84',releaseTag:tag,releaseTargetCommitish:src,matchesSourceCommit:true,assets}));
 const pkg=Buffer.from('{"version":"0.0.84"}'),prefix='release-artifacts/'+tag+'/';
 const treeFile=(path,bytes)=>({path,type:'blob',mode:'100644',sha:gitBlob(bytes)});
 const sourceTree=[treeFile('package.json',pkg)];
 const destinationTree=[...sourceTree,...[...files].map(([n,b])=>treeFile(prefix+n,b)),treeFile(prefix+'release.json',manifest)];
 const responseFile=bytes=>({type:'file',encoding:'base64',size:bytes.length,content:bytes.toString('base64')});
 const prUrl='https://github.com/'+destination.name+'/pull/9',releaseUrl='https://github.com/'+destination.name+'/releases/tag/'+tag;
 let draft=null,uploads=0,creates=0,publishes=0;
 const ok=body=>({status:200,body});
 const request=async(repo,token,method,route,payload)=>{
  const isSource=repo.name===source.name;
  if(method==='POST'&&route==='/releases'){creates++;draft={...payload,id:77,assets:[],html_url:releaseUrl};return {status:201,body:draft};}
  if(method==='PATCH'&&route==='/releases/77'){assert.equal(payload.make_latest,'true');publishes++;draft={...draft,...payload,published_at:'2026-11-24T00:00:00Z'};return ok(draft);}
  assert.equal(method,'GET');
  if(route==='/pulls/9')return ok({merged:true,state:'closed',merge_commit_sha:merged,base:{ref:'main',repo:{full_name:destination.name}},html_url:prUrl});
  if(route==='/contents/'+prefix+'release.json?ref='+merged)return ok(responseFile(manifest));
  if(route==='/contents/package.json?ref='+src)return ok(responseFile(pkg));
  if(route==='/releases/tags/'+tag)return ok(isSource?{draft:false,published_at:'2026-11-24T00:00:00Z',tag_name:tag,target_commitish:src,assets,name:'ATGV 0.0.84'}:draft);
  if(route==='/git/ref/tags/'+tag)return isSource?ok({object:{type:'commit',sha:src}}):draft&&!draft.draft?ok({object:{type:'commit',sha:merged}}):{status:404};
  if(route==='/git/ref/heads/main')return ok({object:{sha:merged}});
  if(route.startsWith('/compare/'))return ok({status:'identical'});
  if(route.startsWith('/git/commits/'))return ok({tree:{sha:isSource?st:dt}});
  if(route.startsWith('/git/trees/'))return ok({tree:isSource?sourceTree:destinationTree,truncated:false});
  if(route==='/releases?per_page=100&page=1')return ok(draft?[draft]:[]);
  if(route==='/releases/77'||route==='/releases/latest')return ok(draft);
  throw Error('Unexpected request '+method+' '+route);
 };
 const download=async(repo,token,asset,filename)=>{await fs.promises.writeFile(filename,files.get(asset.name));};
 const upload=async(repo,token,id,name,bytes)=>{assert.equal(id,77);assert.ok(bytes.equals(files.get(name)));uploads++;draft.assets.push({...assets.find(a=>a.name===name),id:100+uploads});};
 const args={source,destination,sourcePat:'source',destPat:'dest',prNumber:9,tag,request,download,upload};
 const result=await publisher.publish(args);
 assert.equal(result.url,releaseUrl);assert.equal(result.assetCount,files.size);
 assert.equal(creates,1);assert.equal(uploads,files.size);assert.equal(publishes,1);
 await publisher.publish(args);
 assert.equal(creates,1);assert.equal(uploads,files.size);assert.equal(publishes,1);
});
