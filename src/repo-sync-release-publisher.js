'use strict';
// Publish only the approved ATGV distribution pair, from an already merged PR.
// No GitHub Actions, no local Git changes, no credential persistence.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const api=require('./repo-sync-github-api');
const sync=require('./repo-sync-pr');
const PAIRS=Object.freeze({
 'aidilazharo/aiatech-assist':{destination:'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc',kind:'extension'},
 'aidilazharo/tech-stacks-skills':{destination:'aiamalaysia/my-fow-technology-app-techassists-enterprise-skills',kind:'library'}
});
const SHA=/^[a-f0-9]{40}$/;
const sha=value=>{if(!SHA.test(String(value||'')))throw Error('Invalid verified Git revision.');return value;};
const hex=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
function pairFor(source,destination){
 const p=PAIRS[String(source?.name||'').toLowerCase()];
 if(!p||p.destination!==String(destination?.name||'').toLowerCase())throw Error('Release publishing is restricted to the approved ATGV extension and Library distribution pairs.');
 return p;
}
function tagInfo(tag,kind){
 const re=kind==='extension'?/^v(\d+)\.(\d+)\.(\d+)-build\.(\d+)$/:/^v(\d+)\.(\d+)\.(\d+)-source-build\.(\d+)$/;
 const m=re.exec(String(tag||''));
 if(!m||m.slice(1).some(n=>!Number.isSafeInteger(Number(n))))throw Error('Select the exact published ATGV source release tag.');
 return {version:m.slice(1,4).map(Number).join('.'),key:m.slice(1).map(Number)};
}
function compare(a,b){for(let i=0;i<4;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;}
function compareTags(a,b,kind){return compare(tagInfo(a,kind).key,tagInfo(b,kind).key);}
function required(kind,version){return kind==='extension'?
 [[ 'atgv-aiatech-assist-'+version+'.vsix','vsix.sha256'],['ATGV-AIATECH-Assist-v'+version+'-Source.zip','source.sha256']]:
 [['tech-stacks-skills-'+version+'-source.zip','library-source.sha256']];}
function verifyChecksum(bytes,checksum,name){
 const matches=checksum.toString('utf8').split(/\r?\n/).filter(line=>{
  const m=/^([a-f0-9]{64})\s+\*?([A-Za-z0-9._-]+)$/.exec(line.trim());
  return m&&m[1]===hex(bytes)&&m[2]===name;
 });
 if(matches.length!==1)throw Error('Source checksum verification failed: '+name);
}
function verifyProjection(source,destination){
 if(!Array.isArray(source)||!Array.isArray(destination))throw Error('Invalid Git tree.');
 const map=new Map(destination.map(x=>[x.path,x]));
 const eligible=source.filter(x=>x.type!=='tree'&&sync.isAllowedPath(x.path));
 if(!eligible.length||eligible.length>6000)throw Error('Invalid source projection.');
 for(const x of eligible){
  if(x.type!=='blob'||!['100644','100755'].includes(x.mode))throw Error('Unsupported tracked source entry: '+x.path);
  if(map.get(x.path)?.sha!==x.sha)throw Error('Merged source differs: '+x.path);
 }
 return map;
}
async function uploadAsset(repo,token,id,name,bytes){
 if(!Number.isSafeInteger(id)||id<1||!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>20*1024*1024)throw Error('Invalid release upload.');
 api.safeReleaseComponent(name);
 // Fixed GitHub upload endpoint; no redirects or credentials in URL.
 const url='https://uploads.github.com/repos/'+encodeURIComponent(repo.owner)+'/'+encodeURIComponent(repo.repo)+'/releases/'+id+'/assets?name='+encodeURIComponent(name);
 const res=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{
  Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/octet-stream'
 },body:bytes});
 if(res.status!==201)throw Error('GitHub asset upload failed (HTTP '+res.status+'): '+name+'. Retry the matching draft.');
 const item=await res.json();
 if(item.name!==name||item.size!==bytes.length||item.state!=='uploaded')throw Error('GitHub upload metadata mismatch: '+name);
 return item;
}
async function publish({source,destination,sourcePat,destPat,prNumber,tag,onProgress=async()=>{},request=api.githubRequest,download=api.downloadReleaseAsset,upload=uploadAsset}){
 const pair=pairFor(source,destination),info=tagInfo(tag,pair.kind);
 if(!Number.isSafeInteger(prNumber)||prNumber<1||prNumber>1000000000)throw Error('Enter the destination PR number.');
 const call=async(repo,token,method,route,payload,expected=200)=>{
  const result=await request(repo,token,method,route,payload);
  if(result?.status!==expected)throw Error('GitHub '+method+' '+route.split('?')[0]+' returned HTTP '+(result?.status||0)+'. Verify repository permissions.');
  return result.body;
 };
 const get=(repo,token,route)=>call(repo,token,'GET',route);
 const sg=route=>get(source,sourcePat,route),dg=route=>get(destination,destPat,route);
 async function tagCommit(repo,token,allowMissing=false){
  const response=await request(repo,token,'GET','/git/ref/tags/'+encodeURIComponent(tag));
  if(response.status===404&&allowMissing)return null;
  if(response.status!==200)throw Error('Cannot verify release Git tag (HTTP '+response.status+').');
  let obj=response.body?.object;
  for(let i=0;i<5&&obj?.type==='tag';i++)obj=(await get(repo,token,'/git/tags/'+sha(obj.sha))).object;
  if(obj?.type!=='commit')throw Error('Release tag does not resolve to a commit.');
  return sha(obj.sha);
 }
 async function tree(repo,token,commit){
  const revision=await get(repo,token,'/git/commits/'+sha(commit));
  const data=await get(repo,token,'/git/trees/'+sha(revision.tree?.sha)+'?recursive=1');
  if(data.truncated||!Array.isArray(data.tree))throw Error('Incomplete Git tree; cannot verify distribution.');
  return data.tree;
 }
 async function readFile(repo,token,filename,ref){
  const value=await get(repo,token,'/contents/'+filename.split('/').map(encodeURIComponent).join('/')+'?ref='+sha(ref));
  if(value.type!=='file'||value.encoding!=='base64'||typeof value.content!=='string'||value.size>131072)throw Error('Invalid version or release manifest file.');
  const data=Buffer.from(value.content,'base64');
  if(data.length!==value.size)throw Error('Manifest size mismatch.');
  return data;
 }
 const number=prNumber;
 await onProgress('Checking merged destination PR #'+number+'…');
 const pr=await dg('/pulls/'+number);
 if(!pr.merged||pr.state!=='closed'||pr.base?.ref!=='main'||String(pr.base?.repo?.full_name||'').toLowerCase()!==destination.name.toLowerCase())throw Error('Destination PR must be merged into main before publishing a release.');
 const merged=sha(pr.merge_commit_sha),prUrl=api.safePrUrl(destination,pr.html_url);
 const prefix='release-artifacts/'+tag+'/';
 const manifest=JSON.parse((await readFile(destination,destPat,prefix+'release.json',merged)).toString('utf8'));
 if(manifest.schema!==1||manifest.sourceRepository!==source.name||manifest.sourceBranch!=='main'||manifest.releaseTag!==tag||manifest.matchesSourceCommit!==(manifest.sourceCommit===manifest.releaseTargetCommitish)||(manifest.releaseVersion||info.version)!==info.version||!Array.isArray(manifest.assets))throw Error('Merged PR does not contain a matching source release manifest. Re-sync the exact published main revision.');
 const codeCommit=sha(manifest.sourceCommit),sourceCommit=sha(manifest.releaseTargetCommitish);
 const release=await sg('/releases/tags/'+encodeURIComponent(tag));
 if(release.draft||release.prerelease||!release.published_at||release.tag_name!==tag||release.target_commitish!==sourceCommit||await tagCommit(source,sourcePat)!==sourceCommit)throw Error('Source release does not identify the exact copied commit.');
 const sourceCompare=await sg('/compare/'+sourceCommit+'...main');
 if(!['ahead','identical'].includes(sourceCompare.status))throw Error('Source release commit is not in main history.');
 const versionFile=pair.kind==='extension'?'package.json':'VERSION';
 const versionBytes=await readFile(source,sourcePat,versionFile,sourceCommit);
 const version=pair.kind==='extension'?JSON.parse(versionBytes).version:versionBytes.toString('utf8').trim();
 if(version!==info.version)throw Error('Source release version differs from source code.');
 if(pair.kind==='library'&&JSON.parse(await readFile(source,sourcePat,'catalog.json',sourceCommit)).version!==version)throw Error('Library catalog version differs.');
 const codeVersionBytes=await readFile(source,sourcePat,versionFile,codeCommit);
 const codeVersion=pair.kind==='extension'?JSON.parse(codeVersionBytes).version:codeVersionBytes.toString('utf8').trim();
 if(codeVersion!==manifest.codeVersion)throw Error('Copied source version differs from manifest.');
 const codeCompare=await sg('/compare/'+codeCommit+'...main');
 if(!['ahead','identical'].includes(codeCompare.status))throw Error('Copied source commit is not in main history.');
 const sourceTree=await tree(source,sourcePat,codeCommit);
 const mergedTree=verifyProjection(sourceTree,await tree(destination,destPat,merged));
 // Check the current main projection again just before making a draft public.
 async function verifyCurrent(){
  const ref=await dg('/git/ref/heads/main'),head=sha(ref.object?.sha);
  const ancestry=await dg('/compare/'+merged+'...'+head);
  if(!['ahead','identical'].includes(ancestry.status))throw Error('Merged PR is not in destination main history.');
  return new Map((await tree(destination,destPat,head)).map(x=>[x.path,x]));
 }
 const current=await verifyCurrent();
 const assets=release.assets||[],manifestAssets=manifest.assets;
 if(!Array.isArray(assets)||!assets.length||assets.length!==manifestAssets.length||assets.length>30)throw Error('Source release and merged asset sets differ.');
 const byName=new Map();
 for(const a of assets){
  api.safeReleaseComponent(a.name);
  if(byName.has(a.name)||!Number.isSafeInteger(a.size)||a.size<1||a.size>20*1024*1024||a.state!=='uploaded')throw Error('Invalid source release asset: '+a.name);
  byName.set(a.name,a);
 }
 if(assets.reduce((n,a)=>n+a.size,0)>80*1024*1024||new Set(manifestAssets.map(a=>a.name)).size!==assets.length)throw Error('Invalid merged release asset inventory.');
 for(const [name,checksum] of required(pair.kind,version))if(!byName.has(name)||!byName.has(checksum))throw Error('Missing required release asset or checksum: '+name);
 const marker='ATGV-Sync: '+sourceCommit+' '+tag;
 const notes=marker+'\nDestination commit: '+merged+'\nReviewed PR: '+prUrl+(codeCommit!==sourceCommit?'\nArtifact source version: '+version+' @ '+sourceCommit+'\nCopied code version: '+codeVersion+' @ '+codeCommit+' (GitHub generated source archives describe the destination commit, not the older build).':'');
 async function findExisting(){
  let existing=null;
  // Check all listed releases (including drafts) and refuse semantic downgrades.
  for(let page=1;page<=20;page++){
   const rows=await dg('/releases?per_page=100&page='+page);
   if(!Array.isArray(rows))throw Error('Invalid destination release list.');
   for(const row of rows){
    if(row.tag_name===tag){if(existing)throw Error('Duplicate release identity.');existing=row;}
    if(!row.draft){
     let prior;try{prior=tagInfo(row.tag_name,pair.kind);}catch{
      const plain=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(row.tag_name||''));
      if(!plain||plain.slice(1).some(n=>!Number.isSafeInteger(Number(n))))continue;
      prior={key:[...plain.slice(1).map(Number),0]};
     }
     if(compare(prior.key,info.key)>0){const error=Error('A newer destination release already exists. No downgrade.');error.code='RELEASE_SUPERSEDED';throw error;}
    }
   }
   if(rows.length<100)return existing;
  }
  throw Error('Release history exceeds verification limit.');
 }
 function assertIdentity(row){
  if(!row||row.tag_name!==tag||row.target_commitish!==merged||row.body!==notes||!Number.isSafeInteger(row.id))throw Error('Existing destination release identity differs. No overwrite.');
 }
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-release-publish-'));
 try{
  await onProgress('Downloading and verifying '+assets.length+' source artifacts and merged Git blobs…');
  const buffers=new Map();
  for(const a of assets){
   const m=manifestAssets.find(x=>x.name===a.name);
   if(!m||m.size!==a.size||!/^sha256:[a-f0-9]{64}$/.test(m.digest))throw Error('Invalid merged asset digest: '+a.name);
   const dest=path.join(temp,a.name);
   await download(source,sourcePat,a,dest);
   const bytes=await fs.readFile(dest);
   if(bytes.length!==a.size||'sha256:'+hex(bytes)!==m.digest||mergedTree.get(prefix+a.name)?.sha!==blob(bytes)||current.get(prefix+a.name)?.sha!==blob(bytes))throw Error('Source artifact does not match merged Git bytes: '+a.name);
   buffers.set(a.name,bytes);
  }
  for(const [name,checksum] of required(pair.kind,version))verifyChecksum(buffers.get(name),buffers.get(checksum),name);
  let row=await findExisting();
  const existingTag=await tagCommit(destination,destPat,true);
  if(row&&!row.draft&&!row.prerelease&&row.published_at&&existingTag&&existingTag!==merged){
   if(row.target_commitish!==existingTag||String(row.body||'').split('\n')[0]!==marker)throw Error('Existing release provenance differs. No overwrite.');
   if(row.assets?.length!==buffers.size||new Set(row.assets.map(a=>a.name)).size!==buffers.size)throw Error('Existing release assets differ.');
   for(const a of row.assets){const expected=buffers.get(a.name);if(!expected)throw Error('Unexpected existing release asset.');const filename=path.join(temp,'existing-'+crypto.randomUUID());await download(destination,destPat,a,filename);if(!expected.equals(await fs.readFile(filename)))throw Error('Existing release checksum differs.');}
   return {url:'https://github.com/'+destination.name+'/releases/tag/'+tag,tag,version,assetCount:buffers.size,merged:existingTag,alreadyPublished:true};
  }
  if(existingTag&&existingTag!==merged)throw Error('Destination tag already refers to another commit.');
  if(row)assertIdentity(row);
  else{
   await onProgress('Creating verified destination draft release…');
   row=await call(destination,destPat,'POST','/releases',{tag_name:tag,target_commitish:merged,name:release.name||tag,body:notes,draft:true,prerelease:false},201);
   assertIdentity(row);
   if(!row.draft)throw Error('GitHub did not create a draft.');
  }
  const readDetail=()=>dg('/releases/'+row.id);
  async function verifyUploaded(detail,allowMissing){
   assertIdentity(detail);
   const seen=new Set();
   for(const a of detail.assets||[]){
    if(seen.has(a.name)||!buffers.has(a.name))throw Error('Unexpected destination release asset: '+a.name);
    seen.add(a.name);
    const filename=path.join(temp,'verify-'+a.id+'-'+crypto.randomUUID());
    try{
     await download(destination,destPat,a,filename);
     if(!buffers.get(a.name).equals(await fs.readFile(filename)))throw Error('Destination asset differs: '+a.name+'. No overwrite.');
    }finally{await fs.rm(filename,{force:true});}
   }
   if(!allowMissing&&seen.size!==buffers.size)throw Error('Destination release assets incomplete.');
   return seen;
  }
  const detail=await readDetail(),seen=await verifyUploaded(detail,detail.draft===true);
  if(detail.draft){
   for(const [name,bytes] of buffers)if(!seen.has(name)){await onProgress('Uploading '+name+'…');await upload(destination,destPat,row.id,name,bytes);}
   const verified=await readDetail();
   if(!verified.draft)throw Error('Draft status changed during upload.');
   await verifyUploaded(verified,false);
   const latest=await verifyCurrent();
   for(const [name,bytes] of buffers)if(latest.get(prefix+name)?.sha!==blob(bytes))throw Error('Destination artifacts changed during upload.');
   const latestRelease=await findExisting();assertIdentity(latestRelease);
   if(!latestRelease.draft||latestRelease.id!==row.id)throw Error('Draft changed during upload.');
   const prePublishTag=await tagCommit(destination,destPat,true);
   if(prePublishTag&&prePublishTag!==merged)throw Error('Destination tag changed during upload.');
   await onProgress('Publishing verified draft as latest stable release…');
   await call(destination,destPat,'PATCH','/releases/'+row.id,{draft:false,prerelease:false,make_latest:'true'});
  }
  const final=await dg('/releases/tags/'+encodeURIComponent(tag));assertIdentity(final);
  if(final.draft||final.prerelease||!final.published_at||await tagCommit(destination,destPat)!==merged)throw Error('Destination release is not published at the approved commit.');
  await verifyUploaded(final,false);
  const latestStable=await dg('/releases/latest');
  if(latestStable.id!==final.id||latestStable.tag_name!==tag||latestStable.draft||latestStable.prerelease)throw Error('The verified release is published, but is not the current latest stable release. Check concurrent publication.');
  const expectedUrl='https://github.com/'+destination.name+'/releases/tag/'+tag;
  if(final.html_url!==expectedUrl)throw Error('Unexpected destination release URL.');
  return {url:expectedUrl,tag,version,assetCount:buffers.size,merged};
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
module.exports={publish,pairFor,tagInfo,compareTags,required,verifyChecksum,verifyProjection};
