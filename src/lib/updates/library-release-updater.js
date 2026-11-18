'use strict';
// Fixed, trusted source for SDLC Library release archives. The GitHub latest
// endpoint excludes prereleases, so query the same repository's list as fallback.
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const updater=require('./github-release-updater');
const REPO='aidilazharo/tech-stacks-skills';
const LATEST_URL='https://github.com/'+REPO+'/releases/latest';
const API_LATEST='https://api.github.com/repos/'+REPO+'/releases/latest';
const API_LIST='https://api.github.com/repos/'+REPO+'/releases?per_page=30';
const MAX_ZIP=80*1024*1024;
function tagged(value){
 const match=/^v?(\d+\.\d+\.\d+)(?:-source-build\.(\d+))?$/.exec(String(value||''));
 return match?{version:match[1],build:Number(match[2]||0)}:null;
}
function trustedAsset(asset,name){
 return !!asset&&asset.name===name&&Number.isSafeInteger(asset.size)&&asset.size>0&&asset.size<=MAX_ZIP&&
 typeof asset.url==='string'&&asset.url.startsWith('https://api.github.com/repos/'+REPO+'/releases/assets/')&&
 /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/assets\/\d+$/.test(asset.url);
}
function select(releases){
 if(!Array.isArray(releases))throw Error('Invalid Library Releases response.');
 const candidates=[];
 for(const release of releases){
  const version=tagged(release?.tag_name);
  if(!version||release.draft||!String(release.html_url||'').startsWith('https://github.com/'+REPO+'/releases/tag/'))continue;
  const filename='tech-stacks-skills-'+version.version+'-source.zip';
  const archive=(release.assets||[]).find(a=>trustedAsset(a,filename));
  const checksum=(release.assets||[]).find(a=>trustedAsset(a,'library-source.sha256'));
  if(archive&&checksum)candidates.push({...version,filename,archive,checksum,tag:release.tag_name,url:release.html_url,repository:REPO});
 }
 candidates.sort((a,b)=>updater.compareVersion(b.version,a.version)||b.build-a.build);
 return candidates[0]||null;
}
async function latest({token='',request=updater.getBytes}={}){
 const fetch=async url=>JSON.parse((await request(url,{token,maxBytes:1024*1024})).toString('utf8'));
 let stable=null;try{stable=await fetch(API_LATEST);}catch{/* Verify same-repository prereleases below. */}
 const releases=await fetch(API_LIST);
 if(!Array.isArray(releases))throw Error('Invalid Library Releases response.');
 return select(stable?[...releases,stable]:releases);
}
async function downloadVerified(release,{token='',directory,request=updater.getBytes}={}){
 if(!release||!directory||release.repository!==REPO||!trustedAsset(release.archive,release.filename)||!trustedAsset(release.checksum,'library-source.sha256'))
  throw Error('Untrusted SDLC Library release.');
 if(release.filename!=='tech-stacks-skills-'+release.version+'-source.zip')throw Error('Invalid Library archive filename.');
 const [zip,checksum]=await Promise.all([
  request(release.archive.url,{token,maxBytes:MAX_ZIP,accept:'application/octet-stream'}),
  request(release.checksum.url,{token,maxBytes:10000,accept:'application/octet-stream'})
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
module.exports={REPO,LATEST_URL,API_LATEST,API_LIST,latest,select,downloadVerified,trustedAsset};
