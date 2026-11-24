'use strict';
// Fixed, trusted source for SDLC Library release archives. The GitHub latest
// endpoint excludes prereleases, so query the same repository's list as fallback.
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const updater=require('./github-release-updater');
const REPO='aiamalaysia/my-fow-technology-app-techassists-enterprise-skills';
// Release discovery is pinned to the AIA Malaysia Library source.
const RELEASE_REPOSITORIES=Object.freeze([REPO]);
const LATEST_URL='https://github.com/'+REPO+'/releases/latest';
const API_LATEST='https://api.github.com/repos/'+REPO+'/releases/latest';
const API_LIST='https://api.github.com/repos/'+REPO+'/releases?per_page=30';
const MAX_ZIP=80*1024*1024;
function tagged(value){
 const match=/^v?(\d+\.\d+\.\d+)(?:-source-build\.(\d+))?$/.exec(String(value||''));
 return match?{version:match[1],build:Number(match[2]||0)}:null;
}
function trustedAsset(asset,name,repository=REPO){
 return !!asset&&asset.name===name&&Number.isSafeInteger(asset.size)&&asset.size>0&&asset.size<=MAX_ZIP&&
 (RELEASE_REPOSITORIES.includes(repository)||repository===REPO)&&typeof asset.url==='string'&&asset.url.startsWith('https://api.github.com/repos/'+repository+'/releases/assets/')&&
 /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/assets\/\d+$/.test(asset.url);
}
function select(releases,repository=REPO){
 if(!Array.isArray(releases))throw Error('Invalid Library Releases response.');
 if(!RELEASE_REPOSITORIES.includes(repository)&&repository!==REPO)throw Error('Untrusted Library release repository.');
 const candidates=[];
 for(const release of releases){
  const version=tagged(release?.tag_name);
  if(!version||release.draft||!String(release.html_url||'').startsWith('https://github.com/'+repository+'/releases/tag/'))continue;
  const filename='tech-stacks-skills-'+version.version+'-source.zip';
  const archive=(release.assets||[]).find(a=>trustedAsset(a,filename,repository));
  const checksum=(release.assets||[]).find(a=>trustedAsset(a,'library-source.sha256',repository));
  if(archive&&checksum)candidates.push({...version,filename,archive,checksum,tag:release.tag_name,url:release.html_url,repository,publishedAt:release.published_at||''});
 }
 candidates.sort((a,b)=>updater.compareVersion(b.version,a.version)||b.build-a.build);
 return candidates[0]||null;
}
async function fetchReleaseList({repository=REPO,request=updater.getBytes}={}){
 if(!RELEASE_REPOSITORIES.includes(repository)&&repository!==REPO)throw Error('Untrusted Library release repository.');
 const fetch=async url=>JSON.parse((await request(url,{maxBytes:1024*1024})).toString('utf8'));
 const api='https://api.github.com/repos/'+repository+'/releases';
 let stable=null;try{stable=await fetch(api+'/latest');}catch{/* Verify same-repository prereleases below. */}
 const releases=await fetch(api+'?per_page=30');
 if(!Array.isArray(releases))throw Error('Invalid Library Releases response.');
 return stable?[...releases,stable]:releases;
}
async function latest({repository=REPO,request=updater.getBytes}={}){
 return select(await fetchReleaseList({repository,request}),repository);
}
async function latestAcrossRepositories({request=updater.getBytes}={}){
 const results=await Promise.allSettled(RELEASE_REPOSITORIES.map(repository=>fetchReleaseList({repository,request})));
 const errors=results.flatMap((result,index)=>result.status==='rejected'?[RELEASE_REPOSITORIES[index]+': '+String(result.reason?.message||result.reason)]:[]);
 if(errors.length===results.length)throw Error('Cannot check AIA Library releases: '+errors.join('; '));
 const found=[];
 results.forEach((result,index)=>{
  if(result.status!=='fulfilled')return;
  const repository=RELEASE_REPOSITORIES[index];
  for(const row of result.value){
   const version=tagged(row?.tag_name);
   if(!version||row.draft||!String(row.html_url||'').startsWith('https://github.com/'+repository+'/releases/tag/'))continue;
   found.push({...version,tag:row.tag_name,url:row.html_url,repository,publishedAt:row.published_at||'',row});
  }
 });
 found.sort((a,b)=>updater.compareVersion(b.version,a.version)||b.build-a.build||((Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0))||RELEASE_REPOSITORIES.indexOf(a.repository)-RELEASE_REPOSITORIES.indexOf(b.repository));
 const newest=found[0];
 if(!newest)return {release:null,latest:null,errors};
 const release=select([newest.row],newest.repository);
 return {release,latest:{version:newest.version,tag:newest.tag,url:newest.url,repository:newest.repository,publishedAt:newest.publishedAt,installable:!!release},errors};
}
async function downloadVerified(release,{directory,request=updater.getBytes}={}){
 if(!release||!directory||!RELEASE_REPOSITORIES.includes(release.repository)||!trustedAsset(release.archive,release.filename,release.repository)||!trustedAsset(release.checksum,'library-source.sha256',release.repository))
  throw Error('Untrusted SDLC Library release.');
 if(release.filename!=='tech-stacks-skills-'+release.version+'-source.zip')throw Error('Invalid Library archive filename.');
 const [zip,checksum]=await Promise.all([
  request(release.archive.url,{maxBytes:MAX_ZIP,accept:'application/octet-stream'}),
  request(release.checksum.url,{maxBytes:10000,accept:'application/octet-stream'})
 ]);
 if(zip.length!==release.archive.size)throw Error('Library archive size does not match release metadata.');
 const digest=crypto.createHash('sha256').update(zip).digest('hex');
 if(!checksum.toString('utf8').split(/\r?\n/).some(line=>{
  const match=/^([a-f0-9]{64})\s+\*?([^\s]+)$/.exec(line.trim());
  return match&&match[1]===digest&&path.posix.basename(match[2])===release.filename;
 }))throw Error('Library source ZIP SHA-256 checksum verification failed.');
 await fs.mkdir(directory,{recursive:true});
 const file=path.join(directory,release.filename);
 await fs.writeFile(file,zip,{mode:0o600,flag:'wx'});
 return file;
}
module.exports={REPO,RELEASE_REPOSITORIES,LATEST_URL,API_LATEST,API_LIST,latest,latestAcrossRepositories,select,downloadVerified,trustedAsset};
