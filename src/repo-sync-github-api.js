'use strict';
// Minimal GitHub REST API client for Repo Sync PRs. The Destination PAT is used
// solely in HTTPS Authorization headers, never in shell args, Git remotes, files
// or PR descriptions. GitHub CLI (gh) is not required.
const https=require('node:https');
const MAX_RESPONSE=1024*1024;
const {diagnostic}=require('./github-credential-validator');
function assertToken(token){
 if(!/^[^\s\x00-\x1f\x7f]{20,512}$/.test(String(token||'')))throw Error('A valid Destination PAT is required for GitHub API access.');
}
function routeFor(repo,suffix=''){
 if(!repo||!/^[A-Za-z0-9-]+$/.test(repo.owner)||!/^[A-Za-z0-9_.-]+$/.test(repo.repo))throw Error('Invalid GitHub repository identity.');
 return '/repos/'+encodeURIComponent(repo.owner)+'/'+encodeURIComponent(repo.repo)+suffix;
}
function safePrUrl(repo,url){
 let parsed;
 try{parsed=new URL(String(url||''));}catch{throw Error('GitHub API returned an invalid pull request URL.');}
 const prefix=('/'+repo.owner+'/'+repo.repo+'/pull/').toLowerCase();
 if(parsed.protocol!=='https:'||parsed.hostname!=='github.com'||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash||
  !parsed.pathname.toLowerCase().startsWith(prefix)||!/^[1-9][0-9]*$/.test(parsed.pathname.slice(prefix.length)))
  throw Error('GitHub API returned a pull request URL outside the selected destination repository.');
 return parsed.href;
}
function githubRequest(repo,token,method,suffix='',payload){
 assertToken(token);
 const body=payload===undefined?'':JSON.stringify(payload);
 if(body.length>16384)throw Error('GitHub PR payload exceeds 16 KB.');
 const uri='https://api.github.com'+routeFor(repo,suffix);
 return new Promise((resolve,reject)=>{
  const req=https.request(uri,{method,headers:{
   'Accept':'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28',
   'User-Agent':'ATGV-AIATECH-Assist',
   'Authorization':'Bearer '+token,
   ...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})
  }},response=>{
   let content='',bytes=0;
   response.setEncoding('utf8');
   response.on('data',chunk=>{
    bytes+=Buffer.byteLength(chunk);
    if(bytes>MAX_RESPONSE){req.destroy(Object.assign(Error('GitHub API response too large.'),{code:'EBIGRESPONSE'}));return;}
    content+=chunk;
   });
   response.on('end',()=>{
    try{resolve({status:response.statusCode||0,body:content?JSON.parse(content):null,headers:response.headers});}
    catch{reject(Error('GitHub API returned an invalid JSON response.'));}
   });
   response.on('error',()=>reject(Error('GitHub API response failed.')));
  });
  req.setTimeout(20000,()=>req.destroy(Object.assign(Error('GitHub API request timed out.'),{code:'ETIMEDOUT'})));
  req.on('error',error=>reject(Error('Cannot reach GitHub API ('+String(error?.code||'network error')+'). Check network or proxy access.')));
  if(body)req.write(body);
  req.end();
 });
}
function requireOk(result,expected,activity){
 const status=Number(result?.status)||0;
 if(status===expected)return result.body;
 if(status===401)throw Error('GitHub Destination PAT authentication failed (HTTP 401).');
 if(status===403||status===429){const detail=diagnostic(status,result.headers,result.body?.message);const permissions=status===403&&activity==='pull request creation'&&/access denied/i.test(detail)?' Verify the Destination PAT grants Pull requests: Read and write.':'';throw Error('GitHub denied '+activity+' (HTTP '+status+'). '+detail+permissions);}
 if(status===404)throw Error('Destination repository or GitHub PR endpoint is inaccessible (HTTP 404). Verify the PAT and repository URL.');
 if(status===422)throw Error('GitHub rejected '+activity+' (HTTP 422): confirm the review branch differs from the base and a matching PR does not already exist.');
 throw Error('GitHub '+activity+' failed (HTTP '+status+').');
}
async function getRepository(repo,token,request=githubRequest){
 const value=requireOk(await request(repo,token,'GET',''),200,'repository lookup');
 if(!value||String(value.full_name||'').toLowerCase()!==repo.name.toLowerCase())
  throw Error('GitHub API destination repository differs from local Repo B origin.');
 if(value.permissions?.push!==true)throw Error('Destination PAT does not have write access to Repo B.');
 if(typeof value.default_branch!=='string'||!value.default_branch.trim())
  throw Error('GitHub did not report a default branch for Repo B.');
 return {nameWithOwner:value.full_name,defaultBranch:value.default_branch};
}
// Resolve the source default branch with read-only permissions. Do not assume "main".
async function getSourceRepository(repo,token,request=githubRequest){
 const result=await request(repo,token,'GET','');
 const status=Number(result?.status)||0;
 if(status===401)throw Error('Repo A Source PAT authentication failed (HTTP 401).');
 if(status===403)throw Error('GitHub denied Repo A source lookup (HTTP 403). Check Source PAT read access and organization restrictions.');
 if(status===404)throw Error('Repo A source repository not found or inaccessible with this PAT (HTTP 404).');
 if(status!==200)throw Error('GitHub Repo A source lookup failed (HTTP '+status+').');
 const value=result?.body;
 if(!value||String(value.full_name||'').toLowerCase()!==repo.name.toLowerCase())
  throw Error('GitHub API Source repository identity does not match Repo A.');
 if(value.permissions?.pull!==true)throw Error('Source PAT does not have read access to Repo A.');
 const branch=String(value.default_branch||'').trim();
 if(!branch)throw Error('Repo A has no default branch. Create an initial commit and default branch in GitHub before syncing.');
 return {nameWithOwner:value.full_name,defaultBranch:branch};
}
async function findOpenPr(repo,token,{branch,base},request=githubRequest){
 const filter='?state=open&head='+encodeURIComponent(repo.owner+':'+branch)+'&per_page=100';
 const value=requireOk(await request(repo,token,'GET','/pulls'+filter),200,'open PR lookup');
 if(!Array.isArray(value))throw Error('GitHub returned an invalid open PR list.');
 const items=value.filter(pr=>pr?.state==='open'&&pr.head?.ref===branch&&
  String(pr.head?.repo?.full_name||'').toLowerCase()===repo.name.toLowerCase()&&pr.base?.ref===base);
 if(items.length>1)throw Error('Multiple open PRs were found for the same destination review branch and base.');
 return items.length?safePrUrl(repo,items[0].html_url):'';
}
async function createPr(repo,token,{branch,base,title,body},request=githubRequest){
 const payload={head:branch,base,title,body,maintainer_can_modify:false};
 const result=await request(repo,token,'POST','/pulls',payload);
 if(result?.status===422){
  // Another request may have created the same PR between list and create.
  const reused=await findOpenPr(repo,token,{branch,base},request);
  if(reused)return reused;
 }
 const value=requireOk(result,201,'pull request creation');
 return safePrUrl(repo,value?.html_url);
}
// Never infer original PR details from a commit message or an AI suggestion.
function verifiedSourcePr(value,repo){
 if(!value||!Number.isSafeInteger(value.number)||!value.head||!value.base||
  String(value.head.repo?.full_name||'').toLowerCase()!==repo.name.toLowerCase())
  throw Error('Source PR must belong to Repo A and have an existing source branch.');
 const branch=String(value.head.ref||''),sha=String(value.head.sha||'');
 if(!/^[a-f0-9]{40}$/.test(sha)||!branch)throw Error('Source PR has no valid head commit and branch.');
 return {number:value.number,branch,sha,title:String(value.title||''),body:String(value.body||''),url:String(value.html_url||'')};
}
async function getSourcePullRequest(repo,token,prNumber,request=githubRequest){
 if(!Number.isSafeInteger(prNumber)||prNumber<1||prNumber>1000000000)throw Error('Enter a valid Repo A pull request number.');
 const response=await request(repo,token,'GET','/pulls/'+prNumber);
 if(response.status!==200)throw Error('Could not read source PR #'+prNumber+' (HTTP '+response.status+'). Check its number and Source PAT permissions.');
 return verifiedSourcePr(response.body,repo);
}
async function getSourcePrForCommit(repo,token,{sha,branch},request=githubRequest){
 if(!/^[a-f0-9]{40}$/.test(String(sha||'')))throw Error('Invalid source commit SHA.');
 const response=await request(repo,token,'GET','/commits/'+sha+'/pulls?per_page=100');
 if(response.status!==200)throw Error('Could not inspect source commit PR history (HTTP '+response.status+').');
 if(!Array.isArray(response.body))throw Error('GitHub returned invalid source commit PR metadata.');
 const exact=response.body.filter(pr=>pr?.head?.ref===branch&&pr?.head?.sha===sha&&
  String(pr?.head?.repo?.full_name||'').toLowerCase()===repo.name.toLowerCase());
 exact.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
 return exact.length?verifiedSourcePr(exact[0],repo):null;
}

// Release assets are binary, so they must not pass through the JSON-only API client.
// Get immutable release/asset IDs before reviewing, then verify IDs and digests on publish.
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const MAX_RELEASE_ASSET=20*1024*1024;
const MAX_RELEASE_TOTAL=80*1024*1024;
function safeReleaseComponent(name){
 const value=String(name||'');
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(value)||value.includes('..'))throw Error('Unsafe GitHub Release filename or tag.');
 return value;
}
function acceptedReleaseAsset(asset){
 if(!asset||!Number.isSafeInteger(asset.id)||asset.id<1)return false;
 if(!/\.(?:vsix|zip|sha256|json|md)$/i.test(String(asset.name||'')))return false;
 try{safeReleaseComponent(asset.name);}catch{return false;}
 return Number.isSafeInteger(asset.size)&&asset.size>0&&asset.size<=MAX_RELEASE_ASSET;
}
async function getLatestRelease(repo,token,request=githubRequest){
 const official=['aidilazharo/aiatech-assist','aidilazharo/tech-stacks-skills'].includes(repo.name.toLowerCase());
 const res=await request(repo,token,'GET',official?'/releases/latest':'/releases?per_page=10');
 if(official&&res.status===404)return null;
 if(res.status===404)throw Error('Source GitHub Releases cannot be read (HTTP 404).');
 if(res.status!==200)throw Error('Source GitHub Releases lookup failed (HTTP '+res.status+').');
 if(!official&&!Array.isArray(res.body))throw Error('Source GitHub release response is invalid.');
 const releases=(official?[res.body]:res.body).filter(r=>r&&!r.draft&&!r.prerelease&&r.published_at&&r.tag_name);
 releases.sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)));
 if(!releases.length)return null;
 const latest=releases[0];
 const tag=safeReleaseComponent(latest.tag_name);
 const expectedPath='/'+repo.name+'/releases/tag/'+encodeURIComponent(tag);
 let browser;
 try{browser=new URL(String(latest.html_url||''));}catch{throw Error('Invalid source GitHub release URL.');}
 if(browser.protocol!=='https:'||browser.hostname!=='github.com'||browser.username||
  browser.password||browser.port||browser.search||browser.hash||
  browser.pathname.toLowerCase()!==expectedPath.toLowerCase())
  throw Error('Release URL does not match the selected source repository.');
 const rawAssets=Array.isArray(latest.assets)?latest.assets:[];
 if(official){
  const revision=await request(repo,token,'GET','/git/ref/tags/'+encodeURIComponent(tag));
  let obj=revision.body?.object;
  if(revision.status!==200)throw Error('Cannot verify the source release tag.');
  for(let depth=0;depth<5&&obj?.type==='tag';depth++){
   if(!/^[a-f0-9]{40}$/.test(obj.sha))throw Error('Invalid release tag revision.');
   const target=await request(repo,token,'GET','/git/tags/'+obj.sha);
   if(target.status!==200)throw Error('Cannot resolve annotated release tag.');
   obj=target.body?.object;
  }
  if(obj?.type!=='commit'||!/^[a-f0-9]{40}$/.test(obj.sha)||latest.target_commitish!==obj.sha)throw Error('Source release tag does not identify its exact build commit.');
 }
 const assets=rawAssets.filter(a=>acceptedReleaseAsset(a)&&(!official||a.state==='uploaded')).map(a=>({
  id:a.id,name:a.name,size:a.size,digest:/^sha256:[a-f0-9]{64}$/i.test(String(a.digest||''))?String(a.digest).toLowerCase():''
 }));
 if(new Set(assets.map(a=>a.name.toLowerCase())).size!==assets.length)throw Error('Source release has duplicate artifact names.');
 if(assets.reduce((sum,a)=>sum+a.size,0)>MAX_RELEASE_TOTAL)throw Error('Source release assets exceed 80 MB.');
 return {tag,name:String(latest.name||tag).slice(0,140),url:browser.href,
  targetCommitish:String(latest.target_commitish||'').slice(0,120),
  publishedAt:String(latest.published_at),assets,skippedAssetCount:rawAssets.length-assets.length};
}
async function downloadReleaseAsset(repo,token,asset,destination){
 assertToken(token);
 if(!acceptedReleaseAsset(asset))throw Error('Selected release asset is invalid or exceeds 20 MB.');
 // Redirects may lead to GitHub's download CDN. Never forward the PAT to the CDN.
 const endpoint='https://api.github.com'+routeFor(repo,'/releases/assets/'+asset.id);
 async function read(url,redirects=0){
  if(redirects>3)throw Error('Too many release-asset redirects.');
  const parsed=new URL(url);
  const api=parsed.hostname==='api.github.com';
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
   !(api||['release-assets.githubusercontent.com','objects.githubusercontent.com','github.com'].includes(parsed.hostname)))
   throw Error('Unexpected GitHub asset download host.');
  return new Promise((resolve,reject)=>{
   const req=https.get(url,{headers:{
    'Accept':'application/octet-stream','User-Agent':'ATGV-AIATECH-Assist',
    ...(api?{'Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}:{})
   }},response=>{
    const status=response.statusCode||0;
    if([301,302,303,307,308].includes(status)){
     const location=response.headers.location;response.resume();
     if(!location){reject(Error('Release asset redirect missing Location.'));return;}
     let next;try{next=new URL(location,url).href;}catch{reject(Error('Malformed release asset redirect.'));return;}
     read(next,redirects+1).then(resolve,reject);return;
    }
    if(status!==200){response.resume();reject(Error('Release asset '+asset.name+' failed (HTTP '+status+').'));return;}
    // JSON reports are legitimate release assets. Metadata responses will fail
    // the reviewed byte length and SHA-256 checks below.
    let size=0;const chunks=[];
    response.on('data',chunk=>{
     size+=chunk.length;
     if(size>MAX_RELEASE_ASSET||size>asset.size){req.destroy(Error('Release asset exceeded verified size.'));return;}
     chunks.push(chunk);
    });
    response.on('end',()=>resolve(Buffer.concat(chunks,size)));
    response.on('error',reject);
   });
   req.setTimeout(45000,()=>req.destroy(Error('Release artifact download timed out.')));
   req.on('error',reject);
  });
 }
 const bytes=await read(endpoint);
 if(bytes.length!==asset.size)throw Error('Release asset size mismatch: '+asset.name);
 const digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 if(asset.digest&&asset.digest!==digest)throw Error('Release asset SHA-256 mismatch: '+asset.name);
 await fs.writeFile(destination,bytes,{flag:'wx'});
 return {name:asset.name,size:bytes.length,digest,verified:!!asset.digest};
}

module.exports={githubRequest,getRepository,getSourceRepository,getSourcePullRequest,getSourcePrForCommit,findOpenPr,createPr,safePrUrl,getLatestRelease,downloadReleaseAsset,safeReleaseComponent};
