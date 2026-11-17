'use strict';

// Read manifests from one pinned GitHub main tree. Catalog code is data and is
// never executed. This supports first-run setup before a checkout exists.
const catalog=require('./github-sdlc-catalog');
const {requestJson}=require('./clients');
const {normalizeStack,catalogDependencyPackages,catalogNodeEngines}=require('./tech-stacks');
const HEADERS={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
function isManifest(file){
 return !/(?:^|\/)(?:node_modules|\.git)\//i.test(file)&&/(?:^|\/)(?:package\.json|pom\.xml|[^/]+\.csproj)$/.test(file);
}
async function remote({config,token='',request=requestJson,api=catalog}={}){
 const info=await api.getTree(config,token,request);
 const byPath=new Map(info.files.map(file=>[file.path,file]));
 async function read(file,max=128000){
  const item=byPath.get(file);if(!item)throw Error('Missing catalog manifest: '+file);
  if(item.size>max)throw Error('Catalog manifest is too large: '+file);
  const reply=await request(info.route+'/git/blobs/'+item.sha,{token,headers:HEADERS});
  if(reply?.encoding!=='base64'||typeof reply.content!=='string')throw Error('Catalog manifest is unavailable: '+file);
  const data=Buffer.from(reply.content.replace(/\s/g,''),'base64');
  if(data.length!==item.size||api.blobSha(data)!==item.sha)throw Error('Catalog manifest integrity check failed: '+file);
  return data;
 }
 const catalogFile=byPath.has('catalog.json')?'catalog.json':'catalog.yaml';
 const [manifest,versionFile]=await Promise.all([read(catalogFile,32768),read('VERSION',128)]);
 const inspected=api.inspectManifest(manifest,new Set(byPath.keys()),catalogFile.endsWith('.yaml')?'yaml':'json');
 if(versionFile.toString('utf8').trim()!==inspected.version)throw Error('SDLC Library VERSION and catalog manifest disagree.');
 const stacks=[];
 for(const id of inspected.techStacks){
  const prefix='tech-stacks/'+id+'/scaffold/';
  const descriptor='tech-stacks/'+id+'/stack.json';
  const manifests=info.files.filter(file=>file.path.startsWith(prefix)&&isManifest(file.path.slice(prefix.length)));
  const raw=await read(descriptor,16000),contents=[];
  for(let start=0;start<manifests.length;start+=8)contents.push(...await Promise.all(manifests.slice(start,start+8).map(file=>read(file.path))));
  const files=Object.fromEntries(manifests.map((file,i)=>[file.path.slice(prefix.length),contents[i]]));
  const stack=normalizeStack(JSON.parse(raw.toString('utf8')),id);
  stacks.push({...stack,dependencyPackages:catalogDependencyPackages(files),nodeEngines:catalogNodeEngines(files)});
 }
 return {source:'GitHub main',version:inspected.version,sha:info.sha,stacks};
}
module.exports={isManifest,remote};
