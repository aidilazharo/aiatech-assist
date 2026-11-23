'use strict';
/**
 * Trusted ATGV extension updater. Catalog changes are managed separately by
 * github-sdlc-catalog; no executable code is loaded from a remote catalog.
 */
const https=require('node:https');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {URL}=require('node:url');

const REPO='aiamalaysia/my-fow-technology-app-techassists-dev-sdlc';
// Public release discovery uses only the dedicated distribution repository.
// The source repository remains the fixed source-of-truth for signed update metadata.
const RELEASE_REPOSITORIES=Object.freeze(['aiamalaysia/extension']);
const DEFAULT_RELEASE_URL=`https://github.com/${REPO}/releases`;
const API=`https://api.github.com/repos/${REPO}/releases?per_page=30`;
const PINNED_RELEASE_URL=`https://github.com/${REPO}/releases/latest`;
/** Accept only a GitHub repository or its Releases landing URL, never an arbitrary API endpoint. */
function parseRepositoryUrl(input=DEFAULT_RELEASE_URL){
 if(typeof input!=='string'||input.length>300)throw Error('Enter a valid GitHub repository Releases URL.');
 let url;try{url=new URL(input.trim());}catch{throw Error('Enter a valid GitHub repository Releases URL.');}
 if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.port||url.search||url.hash){
  throw Error('Release URL must use https://github.com without credentials, ports or query parameters.');
 }
 const match=/^\/([a-zA-Z0-9-]{1,39})\/([a-zA-Z0-9_.-]{1,100})(?:\/releases(\/latest)?)?\/?$/.exec(url.pathname);
 if(!match||match[2]==='.'||match[2]==='..'||match[2].endsWith('.git')){
  throw Error('Use https://github.com/OWNER/REPOSITORY/releases.');
 }
 const repository=match[1]+'/'+match[2];
 const latest=match[3]==='/latest';
 return {repository,url:`https://github.com/${repository}/releases${latest?'/latest':''}`,api:`https://api.github.com/repos/${repository}/releases${latest?'/latest':'?per_page=30'}`,listApi:`https://api.github.com/repos/${repository}/releases?per_page=30`};
}
/** Derive trusted GitHub Releases URLs only from repository metadata. */
function releaseUrlForRepository(repositoryUrl){
 if(typeof repositoryUrl!=='string'||!repositoryUrl.trim())throw Error('GitHub repository source is unavailable.');
 return parseRepositoryUrl(repositoryUrl.trim().replace(/\.git$/i,'')).url;
}
const MAX_JSON=1024*1024,MAX_ASSET=80*1024*1024;
function parseVersion(value){
 const match=/^v?(\d+)\.(\d+)\.(\d+)(?:-build\.(\d+))?$/.exec(String(value||'').trim());
 return match?match.slice(1).map(n=>Number(n||0)):null;
}
function compareVersion(a,b){
 const aa=parseVersion(a),bb=parseVersion(b);if(!aa||!bb)return null;
 for(let i=0;i<3;i++){if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;}return 0;
}
function validAsset(asset,name,repository=REPO){
 return asset&&asset.name===name&&Number.isSafeInteger(asset.size)&&asset.size>0&&asset.size<=MAX_ASSET&&
    typeof asset.url==='string'&&new URL(asset.url).hostname==='api.github.com'&&
    asset.url.startsWith(`https://api.github.com/repos/${repository}/releases/assets/`);
}
function selectRelease(releases,currentVersion,repositoryUrl=DEFAULT_RELEASE_URL,{includeCurrent=false}={}){
 const {repository,url:releaseUrl}=parseRepositoryUrl(repositoryUrl);
 if(!Array.isArray(releases))throw Error('Invalid GitHub Releases response.');
 const candidates=releases.filter(r=>r&&!r.draft&&parseVersion(r.tag_name)&&(includeCurrent||compareVersion(r.tag_name,currentVersion)>0))
  .filter(r=>typeof r.html_url==='string'&&r.html_url.startsWith(`https://github.com/${repository}/releases/tag/`))
  .sort((a,b)=>{
   const x=parseVersion(a.tag_name),y=parseVersion(b.tag_name);
   for(let i=0;i<4;i++)if(x[i]!==y[i])return y[i]-x[i];
   return 0;
  });
 for(const release of candidates){
  const version=parseVersion(release.tag_name).slice(0,3).join('.');
  const name=`atgv-aiatech-assist-${version}.vsix`;
  const asset=(release.assets||[]).find(a=>validAsset(a,name,repository));
  const checksum=(release.assets||[]).find(a=>validAsset(a,'vsix.sha256',repository));
  if(asset&&checksum)return {version,tag:release.tag_name,url:release.html_url,repository,releaseUrl,publishedAt:release.published_at||'',description:String(release.body||'').slice(0,1500),asset,checksum};
 }
 return null;
}
function validUrl(url){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!['api.github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github.com'].includes(parsed.hostname))throw Error('Unexpected GitHub download host.');
 if(parsed.username||parsed.password)throw Error('Credentials in update URLs are not allowed.');
 return parsed;
}
function getBytes(url,{maxBytes=MAX_JSON,accept='application/vnd.github+json',redirects=3}={}){
 return new Promise((resolve,reject)=>{
  let u;try{u=validUrl(url);}catch(e){reject(e);return;}
  const headers={'User-Agent':'atgv-aiatech-assist-updater','Accept':accept,'X-GitHub-Api-Version':'2022-11-28'};
  const request=https.get(u,{headers,timeout:15000},response=>{
   const status=response.statusCode||0;
   if([301,302,303,307,308].includes(status)&&response.headers.location){
    response.resume();if(redirects<1){reject(Error('Too many GitHub redirects.'));return;}
    const next=new URL(response.headers.location,u).toString();
    getBytes(next,{maxBytes,accept,redirects:redirects-1}).then(resolve,reject);return;
   }
   if(status!==200){response.resume();reject(Error(`Public GitHub release request returned HTTP ${status}.`));return;}
   const chunks=[];let length=0;
   response.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){response.destroy(Error('GitHub update download exceeds size limit.'));return;}chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>resolve(Buffer.concat(chunks)));
  });
  request.on('timeout',()=>request.destroy(Error('GitHub update request timed out.')));
  request.on('error',reject);
 });
}
async function fetchReleaseList({repositoryUrl=DEFAULT_RELEASE_URL,request=getBytes}={}){
 const repo=parseRepositoryUrl(repositoryUrl);
 // /latest excludes prereleases. Always compare the full releases list, even
 // when a stable release exists, so a newer approved prerelease is not missed.
 let stable=null;
 if(repo.api!==repo.listApi){
  try{
   const bytes=await request(repo.api,{maxBytes:MAX_JSON});
   stable=JSON.parse(bytes.toString('utf8'));
  }catch{/* No latest stable release; verified prereleases may still exist. */}
 }
 const bytes=await request(repo.listApi,{maxBytes:MAX_JSON});
 let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid GitHub Releases JSON.');}
 if(data&&data.message&&!Array.isArray(data))throw Error('GitHub Releases unavailable. Check connection and permissions.');
 if(!Array.isArray(data))throw Error('Invalid GitHub Releases response.');
 return {repo,releases:stable?[...data,stable]:data};
}
async function latestRelease({version,repositoryUrl=DEFAULT_RELEASE_URL,request=getBytes,includeCurrent=false}={}){
 const {repo,releases}=await fetchReleaseList({repositoryUrl,request});
 return selectRelease(releases,version,repo.url,{includeCurrent});
}
async function latestAcrossRepositories({version,request=getBytes,includeCurrent=true}={}){
 const results=await Promise.allSettled(RELEASE_REPOSITORIES.map(repository=>fetchReleaseList({repositoryUrl:`https://github.com/${repository}/releases/latest`,request})));
 const errors=results.flatMap((result,index)=>result.status==='rejected'?[RELEASE_REPOSITORIES[index]+': '+String(result.reason?.message||result.reason)]:[]);
 if(errors.length===results.length)throw Error('Cannot check public extension releases: '+errors.join('; '));
 const found=[];
 for(const result of results.filter(x=>x.status==='fulfilled')){
  const {repo,releases}=result.value;
  for(const row of releases){
   const parsed=parseVersion(row?.tag_name);
   if(!parsed||row.draft||!String(row.html_url||'').startsWith(`https://github.com/${repo.repository}/releases/tag/`))continue;
   found.push({version:parsed.slice(0,3).join('.'),build:parsed[3],tag:row.tag_name,url:row.html_url,repository:repo.repository,publishedAt:row.published_at||'',row,releaseUrl:repo.url});
  }
 }
 found.sort((a,b)=>compareVersion(b.version,a.version)||b.build-a.build||((Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0))||RELEASE_REPOSITORIES.indexOf(a.repository)-RELEASE_REPOSITORIES.indexOf(b.repository));
 const newest=found[0];
 if(!newest)return {release:null,latest:null,errors};
 const release=selectRelease([newest.row],version,newest.releaseUrl,{includeCurrent});
 return {release,latest:{version:newest.version,tag:newest.tag,url:newest.url,repository:newest.repository,publishedAt:newest.publishedAt,installable:!!release},errors};
}
function verifyChecksum(checksumBytes,assetBytes,filename){
 const lines=checksumBytes.toString('utf8').split(/\r?\n/);
 const digest=crypto.createHash('sha256').update(assetBytes).digest('hex');
 const matching=lines.find(line=>{
  const parts=/^([a-f0-9]{64})\s+\*?([^\s]+)$/.exec(line.trim());
  return parts&&path.posix.basename(parts[2])===filename&&parts[1]===digest;
 });
 if(!matching)throw Error('VSIX checksum verification failed; the upgrade was not installed.');
 return digest;
}
async function downloadVerified(release,{directory,request=getBytes,onProgress=async()=>{}}={}){
 if(!release||!directory)throw Error('Verified release and local staging directory required.');
 const filename=`atgv-aiatech-assist-${release.version}.vsix`;
 const repo=parseRepositoryUrl(release.releaseUrl||DEFAULT_RELEASE_URL);
 if(release.repository&&release.repository!==repo.repository)throw Error('Release repository does not match its source.');
 if(!validAsset(release.asset,filename,repo.repository)||!validAsset(release.checksum,'vsix.sha256',repo.repository))throw Error('Release assets are not trusted GitHub API assets.');
 await onProgress('downloading');
 const [vsix,checksum]=await Promise.all([
  request(release.asset.url,{maxBytes:MAX_ASSET,accept:'application/octet-stream'}),
  request(release.checksum.url,{maxBytes:10000,accept:'application/octet-stream'})
 ]);
 if(vsix.length!==release.asset.size)throw Error('Downloaded VSIX size does not match the release metadata.');
 await onProgress('verifying');
 verifyChecksum(checksum,vsix,filename);
 await onProgress('staging');
 await fs.mkdir(directory,{recursive:true});
 const target=path.join(directory,filename);
 await fs.writeFile(target+'.part',vsix,{mode:0o600});await fs.rename(target+'.part',target);
 return target;
}
module.exports={REPO,RELEASE_REPOSITORIES,API,DEFAULT_RELEASE_URL,PINNED_RELEASE_URL,parseRepositoryUrl,releaseUrlForRepository,parseVersion,compareVersion,selectRelease,verifyChecksum,latestRelease,latestAcrossRepositories,downloadVerified,getBytes};
