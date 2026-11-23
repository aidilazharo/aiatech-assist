'use strict';
// Verified GitHub Release copying for the two aiMalaysia distribution repositories.
const crypto=require('node:crypto');
const SOURCES=Object.freeze({
 extension:'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc',
 library:'aiamalaysia/my-fow-technology-app-techassists-enterprise-skills'
});
const DESTINATIONS=Object.freeze({extension:'aiamalaysia/extension',library:'aiamalaysia/library'});
const CHECKSUMS=Object.freeze({extension:'vsix.sha256',library:'library-source.sha256'});
const ROOT='https://api.github.com',UPLOAD='https://uploads.github.com',LIMIT=80*1024*1024;
const HOSTS=new Set(['api.github.com','uploads.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
const TAG=/^v\d+\.\d+\.\d+(?:-(?:source-)?build\.\d+)?$/;
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function destinations(kind){
 if(!Object.hasOwn(SOURCES,kind))throw Error('Choose Extension or Library Release.');
 return {source:SOURCES[kind],destination:DESTINATIONS[kind],checksum:CHECKSUMS[kind]};
}
function safeTag(value){
 const tag=String(value||'').trim();
 if(tag&&!TAG.test(tag))throw Error('Invalid Release tag. Use v1.2.3, v1.2.3-build.1 or v1.2.3-source-build.1.');
 return tag;
}
async function request(method,url,{token='',body=null,contentType='',maxBytes=2*1024*1024,allow404=false,redirects=3}={}){
 const target=new URL(url);
 if(target.protocol!=='https:'||target.username||target.password||target.port||!HOSTS.has(target.hostname))
  throw Error('Untrusted GitHub request URL.');
 if(method!=='GET'&&!['api.github.com','uploads.github.com'].includes(target.hostname))
  throw Error('GitHub writes require the trusted API host.');
 const headers={'Accept':contentType==='application/octet-stream'?'application/octet-stream':'application/vnd.github+json',
  'User-Agent':'atgv-workspace-release-copy','X-GitHub-Api-Version':'2022-11-28'};
 if(contentType)headers['Content-Type']=contentType;
 if(token&&['api.github.com','uploads.github.com'].includes(target.hostname))headers.Authorization='Bearer '+token;
 const response=await fetch(target,{method,headers,body:body===null?undefined:body,redirect:'manual',signal:AbortSignal.timeout(45000)});
 if(method==='GET'&&[301,302,303,307,308].includes(response.status)){
  if(!redirects)throw Error('Too many GitHub Release download redirects.');
  const location=response.headers.get('location');if(!location)throw Error('Missing GitHub download redirect.');
  const next=new URL(location,target);
  // An API token must never be forwarded to redirected storage or other sites.
  return request('GET',next.toString(),{token:next.hostname==='api.github.com'?token:'',maxBytes,redirects:redirects-1,allow404});
 }
 if(response.status===404&&allow404)return null;
 if(!response.ok)throw Error('GitHub '+method+' returned HTTP '+response.status+'.');
 if(Number(response.headers.get('content-length')||0)>maxBytes)throw Error('GitHub response exceeds size limit.');
 const chunks=[];let length=0;
 for await(const chunk of response.body){
  length+=chunk.byteLength;
  if(length>maxBytes)throw Error('GitHub response exceeds size limit.');
  chunks.push(Buffer.from(chunk));
 }
 return Buffer.concat(chunks,length);
}
async function json(io,method,url,token,data=null,allow404=false){
 const bytes=await io(method,url,{token,allow404,body:data===null?null:Buffer.from(JSON.stringify(data)),
  contentType:data===null?'':'application/json',maxBytes:2*1024*1024});
 if(bytes===null)return null;
 try{return JSON.parse(bytes.toString('utf8'));}catch{throw Error('GitHub returned malformed Release JSON.');}
}
function version(tag){
 const m=/^v(\d+)\.(\d+)\.(\d+)(?:-(?:source-)?build\.(\d+))?$/.exec(String(tag||''));
 return m?m.slice(1).map(v=>Number(v||0)):null;
}
function latestRelease(rows,tag=''){
 if(!Array.isArray(rows))throw Error('Invalid GitHub Release list.');
 const found=rows.filter(row=>row&&!row.draft&&version(row.tag_name));
 if(tag){
  const row=found.find(row=>row.tag_name===tag);
  if(!row)throw Error('Requested source Release tag not found in latest 100 versions.');
  return row;
 }
 found.sort((a,b)=>{const x=version(a.tag_name),y=version(b.tag_name);for(let i=0;i<4;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;});
 if(!found.length)throw Error('No usable source GitHub Release exists.');
 return found[0];
}
function asset(row,name,repo){
 const found=(row.assets||[]).find(a=>a.name===name);
 if(!found||!Number.isSafeInteger(found.id)||!Number.isSafeInteger(found.size)||found.size<1||found.size>LIMIT||
  found.state!=='uploaded'||found.url!==ROOT+'/repos/'+repo+'/releases/assets/'+found.id)
  throw Error('Release is missing the trusted asset '+name+'.');
 return found;
}
function filename(kind,tag){
 const v=version(tag);if(!v)throw Error('Invalid source release version.');
 const number=v.slice(0,3).join('.');
 return kind==='extension'?'atgv-aiatech-assist-'+number+'.vsix':'tech-stacks-skills-'+number+'-source.zip';
}
function verify(file,checksum,name){
 const match=checksum.toString('utf8').split(/\r?\n/).map(line=>/^([a-f0-9]{64})\s+\*?([^\s]+)$/.exec(line.trim()))
  .find(row=>row&&row[2]===name);
 if(!match||match[1]!==digest(file))throw Error('Source release SHA-256 validation failed.');
 return match[1];
}
async function copy({kind,tag='',sourceToken,destinationToken,io=request,onProgress=async()=>{}}={}){
 const {source,destination,checksum}=destinations(kind);
 tag=safeTag(tag);
 if(!sourceToken||!destinationToken)throw Error('Source read and destination write PATs are required.');
 const from=ROOT+'/repos/'+source,to=ROOT+'/repos/'+destination;
 await onProgress('Reading source GitHub Releases...');
 const rows=await json(io,'GET',from+'/releases?per_page=100',sourceToken);
 const row=latestRelease(rows,tag),selected=safeTag(row.tag_name),name=filename(kind,selected);
 if(!String(row.html_url||'').startsWith('https://github.com/'+source+'/releases/tag/'))
  throw Error('Source Release identity is not trusted.');
 const first=asset(row,name,source),second=asset(row,checksum,source);
 await onProgress('Downloading and validating Release artifacts...');
 const [file,sum]=await Promise.all([first,second].map(a=>io('GET',a.url,{token:sourceToken,contentType:'application/octet-stream',maxBytes:a.size})));
 if(file.length!==first.size||sum.length!==second.size)throw Error('Downloaded Release asset size mismatch.');
 const hash=verify(file,sum,name);
 const marker='ATGV source release: https://github.com/'+source+'/releases/tag/'+selected;
 const current=await json(io,'GET',to+'/releases/tags/'+encodeURIComponent(selected),destinationToken,null,true);
 if(current&&!String(current.body||'').includes(marker))throw Error('Destination Release has another origin; nothing was overwritten.');
 if(current&&!Number.isSafeInteger(current.id))throw Error('Destination Release ID is invalid.');
 const files=[[name,file],[checksum,sum]];
 // Preserve every trusted Release attachment, including source ZIPs and build reports.
 const extras=(row.assets||[]).filter(a=>a.name!==name&&a.name!==checksum);
 if(extras.length>18)throw Error('Source Release has too many additional assets.');
 let combined=file.length+sum.length;
 for(const extra of extras){
  if(typeof extra.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}$/.test(extra.name))
   throw Error('Unsafe GitHub Release asset name.');
  const info=asset(row,extra.name,source);
  combined+=info.size;
  if(combined>160*1024*1024)throw Error('Release total exceeds the size limit.');
  const content=await io('GET',info.url,{token:sourceToken,contentType:'application/octet-stream',maxBytes:info.size});
  if(content.length!==info.size)throw Error('Additional Release asset size mismatch: '+info.name);
  if(info.digest&&info.digest!=='sha256:'+digest(content))throw Error('Additional Release asset SHA-256 mismatch: '+info.name);
  files.push([info.name,content]);
 }
 const zip=files.find(([n])=>n.endsWith('-Source.zip'));
 const sourceHash=files.find(([n])=>n==='source.sha256');
 if(zip&&sourceHash)verify(zip[1],sourceHash[1],zip[0]);
 let uploaded=0,unchanged=0;
 if(current){
  // Check all collisions BEFORE any upload, and do not mutate an existing asset.
  for(const [assetName,data] of files){
   const old=(current.assets||[]).find(a=>a.name===assetName);
   if(!old)continue;
   if(!Number.isSafeInteger(old.id)||old.size!==data.length)throw Error('Destination Release asset conflicts: '+assetName);
   const bytes=await io('GET',to+'/releases/assets/'+old.id,{token:destinationToken,contentType:'application/octet-stream',maxBytes:data.length});
   if(digest(bytes)!==digest(data))throw Error('Destination Release checksum differs: '+assetName);
   unchanged++;
  }
 }
 let target=current;
 if(!target){
  await onProgress('Creating destination Release as draft...');
  target=await json(io,'POST',to+'/releases',destinationToken,{
   tag_name:selected,target_commitish:'main',draft:true,prerelease:!!row.prerelease,
   name:(kind==='extension'?'ATGV Extension ':'SDLC Library ')+selected,
   body:marker+'\nArtifact SHA-256: '+hash+'\n\n'+String(row.body||'').slice(0,4000)
  });
  if(!target||!Number.isSafeInteger(target.id))throw Error('Destination Release could not be created.');
 }
 for(const [assetName,data] of files){
  if(current&&(current.assets||[]).some(a=>a.name===assetName))continue;
  await onProgress('Uploading '+assetName+'...');
  await io('POST',UPLOAD+'/repos/'+destination+'/releases/'+target.id+'/assets?name='+encodeURIComponent(assetName),
   {token:destinationToken,contentType:'application/octet-stream',body:data,maxBytes:2*1024*1024});
  uploaded++;
 }
 if(!current){
  await onProgress('Publishing destination Release...');
  const published=await json(io,'PATCH',to+'/releases/'+target.id,destinationToken,{draft:false});
  if(!published||published.draft)throw Error('Release assets uploaded, but publishing failed. Inspect destination draft.');
 }
 await onProgress('Verified Release artifact copy complete.');
 return {kind,tag:selected,source,destination,uploaded,unchanged,sha256:hash};
}
module.exports={SOURCES,DESTINATIONS,CHECKSUMS,destinations,safeTag,latestRelease,filename,verify,request,copy};
