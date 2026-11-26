'use strict';
// Read only the pinned project commit. All tracked code stays in its worktree.
const pipeline=require('./developer-br-pipeline');
const sourceExt=/\.(?:[cm]?[jt]sx?|css|scss|sass|less|html|json|vue|svelte|sql|java|cs|xml|py|go|php|razor|md|yaml|yml|rs|kt|swift)$/i;
const excluded=/(?:^|\/)(?:\.[^/]+|node_modules|dist|build|coverage|vendor|secrets?|credentials?|private|data)(?:\/|$)|(?:lock\.json|yarn\.lock|pnpm-lock\.yaml)$|(?:secret|credential|password|token)[^/]*\.(?:json|ya?ml|txt)$/i;
const sensitive=/-----BEGIN [^-]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{15,}|(?:api[_-]?key|client[_-]?secret|password|access[_-]?token)\s*[:=]\s*["'][^"'\n]{8,}["']/i;
async function scan(worktree,{sha,git=pipeline.runGit,analyze,onProgress=async()=>{},check=()=>{}}){
 if(!/^[a-f0-9]{40}$/i.test(sha)||typeof analyze!=='function')throw Error('A pinned project commit and AI source analyzer are required.');
 if(await git(worktree,'rev-parse','HEAD')!==sha)throw Error('Initial development branch does not match the selected project source.');
 const listing=await git(worktree,'ls-tree','-r','-l',sha);
 const paths=[],sources=new Map(),skipped=[];
 for(const line of listing.split('\n')){
  check();const m=line.match(/^100(?:644|755) blob [a-f0-9]+\s+(\d+)\t(.+)$/i);if(!m)continue;
  const name=m[2];paths.push(name);
  if(!sourceExt.test(name)||excluded.test(name))continue;
  try{if(pipeline.safeRelative(name)!==name)continue;}catch{continue;}
  if(Number(m[1])>180000){skipped.push(name);continue;}
  const content=await git(worktree,'show',sha+':'+name);
  if(content.includes('\u0000')||sensitive.test(content))continue;
  sources.set(name,content);
 }
 const batches=[];let batch=[],size=0,total=0;
 for(const [name,content] of sources){
  for(let offset=0;offset<Math.max(1,content.length);offset+=20000){
   const part={path:name,offset,content:content.slice(offset,offset+20000)};
   const bytes=JSON.stringify(part).length;total+=bytes;
   if(total>1800000)throw Error('Project source exceeds the initial AI scan budget. Narrow the BR scope or split the application before retrying.');
   if(batch.length&&size+bytes>48000){batches.push(batch);batch=[];size=0;}
   batch.push(part);size+=bytes;
  }
 }
 if(batch.length)batches.push(batch);
 if(!batches.length)throw Error('No readable application source found in the project repository.');
 const findings=[],selected=new Set();
 for(let i=0;i<batches.length;i++){
  check();await onProgress(i+1,batches.length,paths.length);
  const raw=await analyze(batches[i],i+1,batches.length);check();
  let result;try{result=JSON.parse(String(raw).replace(/^\s*\x60\x60\x60(?:json)?\s*/i,'').replace(/\x60\x60\x60\s*$/,'').trim());}catch{throw Error('Invalid AI project source analysis. Retry initial development.');}
  if(typeof result.summary!=='string'||!Array.isArray(result.paths))throw Error('Invalid AI project source analysis shape.');
  findings.push(result.summary.slice(0,1400));
  const allowed=new Set(batches[i].map(x=>x.path));
  for(const name of result.paths)if(allowed.has(name))selected.add(name);
 }
 const context=Object.create(null);let budget=110000;
 for(const name of selected){const content=sources.get(name);if(content.length>budget)continue;context[name]=content;budget-=content.length;}
 return {paths,scanned:sources.size,skipped,findings,context,eligiblePaths:[...sources.keys()]};
}
function assertInspected(files,scan){
 const known=new Set(scan.paths.map(p=>p.toLowerCase()));
 const missing=files.map(f=>f.path).filter(p=>known.has(p.toLowerCase())&&!Object.hasOwn(scan.context,p));
 if(missing.length)throw Error('AI attempted to replace existing files without full source context: '+missing.join(', ')+'. Refine the source analysis before retrying.');
}
module.exports={scan,assertInspected};
