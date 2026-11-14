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

const REPO='aidilazharo/aiatech-assist';
const API=`https://api.github.com/repos/${REPO}/releases?per_page=30`;
const MAX_JSON=1024*1024,MAX_ASSET=80*1024*1024;
function parseVersion(value){
 const match=/^v?(\d+)\.(\d+)\.(\d+)(?:-build\.(\d+))?$/.exec(String(value||'').trim());
 return match?match.slice(1).map(n=>Number(n||0)):null;
}
function compareVersion(a,b){
 const aa=parseVersion(a),bb=parseVersion(b);if(!aa||!bb)return null;
 for(let i=0;i<3;i++){if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;}return 0;
}
function validAsset(asset,name){
 return asset&&asset.name===name&&Number.isSafeInteger(asset.size)&&asset.size>0&&asset.size<=MAX_ASSET&&
    typeof asset.url==='string'&&new URL(asset.url).hostname==='api.github.com'&&
    asset.url.startsWith(`https://api.github.com/repos/${REPO}/releases/assets/`);
}
function selectRelease(releases,currentVersion){
 if(!Array.isArray(releases))throw Error('Invalid GitHub Releases response.');
 const candidates=releases.filter(r=>r&&!r.draft&&parseVersion(r.tag_name)&&compareVersion(r.tag_name,currentVersion)>0)
  .filter(r=>typeof r.html_url==='string'&&r.html_url.startsWith(`https://github.com/${REPO}/releases/tag/`))
  .sort((a,b)=>{
   const x=parseVersion(a.tag_name),y=parseVersion(b.tag_name);
   for(let i=0;i<4;i++)if(x[i]!==y[i])return y[i]-x[i];
   return 0;
  });
 for(const release of candidates){
  const version=parseVersion(release.tag_name).slice(0,3).join('.');
  const name=`atgv-aiatech-assist-${version}.vsix`;
  const asset=(release.assets||[]).find(a=>validAsset(a,name));
  const checksum=(release.assets||[]).find(a=>validAsset(a,'vsix.sha256'));
  if(asset&&checksum)return {version,tag:release.tag_name,url:release.html_url,description:String(release.body||'').slice(0,1500),asset,checksum};
 }
 return null;
}
function validUrl(url){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!['api.github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github.com'].includes(parsed.hostname))throw Error('Unexpected GitHub download host.');
 if(parsed.username||parsed.password)throw Error('Credentials in update URLs are not allowed.');
 return parsed;
}
function getBytes(url,{token='',maxBytes=MAX_JSON,accept='application/vnd.github+json',redirects=3}={}){
 return new Promise((resolve,reject)=>{
  let u;try{u=validUrl(url);}catch(e){reject(e);return;}
  const headers={'User-Agent':'atgv-aiatech-assist-updater','Accept':accept,'X-GitHub-Api-Version':'2022-11-28'};
  // NEVER disclose an access token to redirected hosts.
  if(token&&u.hostname==='api.github.com')headers.Authorization=`Bearer ${token}`;
  const request=https.get(u,{headers,timeout:15000},response=>{
   const status=response.statusCode||0;
   if([301,302,303,307,308].includes(status)&&response.headers.location){
    response.resume();if(redirects<1){reject(Error('Too many GitHub redirects.'));return;}
    const next=new URL(response.headers.location,u).toString();
    getBytes(next,{token,maxBytes,accept,redirects:redirects-1}).then(resolve,reject);return;
   }
   if(status!==200){response.resume();reject(Error(`GitHub returned HTTP ${status}. Check private repository access in Settings.`));return;}
   const chunks=[];let length=0;
   response.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){response.destroy(Error('GitHub update download exceeds size limit.'));return;}chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>resolve(Buffer.concat(chunks)));
  });
  request.on('timeout',()=>request.destroy(Error('GitHub update request timed out.')));
  request.on('error',reject);
 });
}
async function latestRelease({version,token='',request=getBytes}={}){
 const bytes=await request(API,{token,maxBytes:MAX_JSON});
 let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid GitHub Releases JSON.');}
 if(data&&data.message&&!Array.isArray(data))throw Error('GitHub Releases unavailable. Check connection and permissions.');
 return selectRelease(data,version);
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
async function downloadVerified(release,{token='',directory,request=getBytes}={}){
 if(!release||!directory)throw Error('Verified release and local staging directory required.');
 const filename=`atgv-aiatech-assist-${release.version}.vsix`;
 if(!validAsset(release.asset,filename)||!validAsset(release.checksum,'vsix.sha256'))throw Error('Release assets are not trusted GitHub API assets.');
 const [vsix,checksum]=await Promise.all([
  request(release.asset.url,{token,maxBytes:MAX_ASSET,accept:'application/octet-stream'}),
  request(release.checksum.url,{token,maxBytes:10000,accept:'application/octet-stream'})
 ]);
 if(vsix.length!==release.asset.size)throw Error('Downloaded VSIX size does not match the release metadata.');
 verifyChecksum(checksum,vsix,filename);
 await fs.mkdir(directory,{recursive:true});
 const target=path.join(directory,filename);
 await fs.writeFile(target+'.part',vsix,{mode:0o600});await fs.rename(target+'.part',target);
 return target;
}
module.exports={REPO,API,parseVersion,compareVersion,selectRelease,verifyChecksum,latestRelease,downloadVerified,getBytes};
