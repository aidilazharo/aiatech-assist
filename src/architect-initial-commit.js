'use strict';
// A new custom checkout needs a reviewed local baseline, not a blanket git add.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const exec=promisify(execFile),driver=require('./developer-git');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function git(root,...args){const r=await exec('git',['-C',root,...args],{timeout:60000,maxBuffer:8*1024*1024,encoding:'buffer',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});return r.stdout;}
const entries=buf=>buf.toString('utf8').split('\0').filter(Boolean);
function safeName(name){
 if(!/^[A-Za-z0-9_./ @+()=-]+$/.test(name)||name.startsWith('/')||name.includes('//'))return false;
 const parts=name.split('/');
 if(parts.some(x=>!x||x==='.'||x==='..'||(/^\./.test(x)&&!['.gitignore','.gitattributes','.editorconfig','.nvmrc'].includes(x))||/^(?:node_modules|dist|build|coverage|vendor|target|out|bin|obj|data|logs?|secrets?|credentials?|certificates?|private|__pycache__)$/i.test(x)||/(?:^|[._-])(?:env|secrets?|credentials?|passwords?|tokens?|private[-_]?key)(?:[._-]|$)/i.test(x)))return false;
 const base=parts.at(-1);
 return /^(?:README|LICENSE|NOTICE|CHANGELOG|Dockerfile|Makefile)(?:\.[A-Za-z0-9]+)?$/i.test(base)||['.gitignore','.gitattributes','.editorconfig','.nvmrc'].includes(base)||/\.(?:[cm]?[jt]sx?|css|scss|sass|less|html|json|md|txt|ya?ml|xml|sql|java|kt|cs|csproj|sln|py|toml|go|rs|vue|svelte|razor|lock|svg)$/i.test(base);
}
function safeText(bytes){
 if(bytes.includes(0)||bytes.length>2*1024*1024)return false;
 const value=bytes.toString('utf8');
 if(value.includes('\ufffd'))return false;
 return !/-----BEGIN [^-]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-]{16})[A-Za-z0-9_-]{12,}|(?:AKIA|ASIA)[A-Z0-9]{16}|(?:api[_-]?key|client[_-]?secret|password|access[_-]?token|refresh[_-]?token|connection[_-]?string)\s*["']?\s*[:=]\s*["'][^"'\r\n]{6,}["']|https?:\/\/[^/\s:@]+:[^/\s@]+@/i.test(value);
}
async function readSafe(root,name){
 if(!safeName(name))return null;
 let current=root;for(const part of name.split('/')){current=path.join(current,part);const st=await fs.lstat(current);if(st.isSymbolicLink())return null;if(current!==path.join(root,name)&&!st.isDirectory())return null;}
 const st=await fs.lstat(current);if(!st.isFile()||st.size>2*1024*1024)return null;
 if(path.relative(root,await fs.realpath(current)).split(path.sep).join('/')!==name)return null;
 const bytes=await fs.readFile(current);return safeText(bytes)?bytes:null;
}
async function plan(root,{owner,name}={}){
 const repo=await driver.repository(root);
 if(repo.sha)throw Error('Git history already exists. No initial commit is required.');
 if(!repo.branch)throw Error('Select an initial Git branch first.');
 if(!owner||!name||!driver.matchesGithubRepo(repo.remote,owner,name))throw Error('The project repository origin must match the configured GitHub repository.');
 if(entries(await git(repo.root,'ls-files','-z')).length)throw Error('The initial Git index already contains staged files. Review and commit them manually; ATGV will not change your staging.');
 const names=entries(await git(repo.root,'ls-files','--others','--exclude-standard','-z')).sort();
 if(names.length>10000)throw Error('Too many untracked files for automatic initial commit review. Review and commit manually.');
 const files=[],excluded=[];let total=0;
 for(const name of names){
  const bytes=await readSafe(repo.root,name);
  if(!bytes){excluded.push(name);continue;}
  total+=bytes.length;if(total>64*1024*1024||files.length>=2500)throw Error('Initial source review exceeds its safe size limit. Review and commit manually.');
  files.push({path:name,sha256:digest(bytes)});
 }
 if(!files.length)throw Error('No eligible source files were found for the initial commit. Review the repository manually.');
 const fingerprint=digest(JSON.stringify({root:repo.root,branch:repo.branch,remote:repo.remote,files,excluded}));
 return {root:repo.root,branch:repo.branch,files,excluded,fingerprint};
}
function reviewText(p){return ['# Review initial local Git commit','Repository: '+p.root,'Branch: '+p.branch,'No GitHub push. Review these files before approving; automated secret detection is not exhaustive.','','Files proposed for commit ('+p.files.length+'):',...p.files.map(x=>x.path),'','Excluded untracked files ('+p.excluded.length+'); ignored files are not listed:',...p.excluded.map(x=>JSON.stringify(x))].join('\n');}
async function commit(root,review,{owner,name,signal}={}){
 const checkStop=()=>{if(signal?.aborted)throw Error('Initial commit cancelled before committing.');};
 checkStop();const checked=await plan(root,{owner,name});checkStop();
 if(checked.fingerprint!==review?.fingerprint)throw Error('Source files or repository changed during review. Rescan and approve again.');
 const expected=checked.files.map(x=>x.path).sort(),staged=new Set();
 const hooks=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-no-git-hooks-'));
 try{
  // Explicit paths only; never stage ignored files or directories. Git's normal
  // filters and line endings are retained, but hooks are not run by this commit.
  let batch=[],length=0;
  async function flush(){
   if(!batch.length)return;checkStop();
   // Track the attempted paths so a partial Git failure can be rolled back.
   for(const name of batch)staged.add(name);
   await git(checked.root,'--literal-pathspecs','add','--',...batch);
   batch=[];length=0;
  }
  for(const item of checked.files){
   checkStop();const bytes=await readSafe(checked.root,item.path);
   if(!bytes||digest(bytes)!==item.sha256)throw Error('Source changed during staging; review again.');
   if(length+item.path.length>6000)await flush();
   batch.push(item.path);length+=item.path.length+3;
  }
  await flush();
  const index=entries(await git(checked.root,'ls-files','-z')).sort();
  if(JSON.stringify(index)!==JSON.stringify(expected))throw Error('Git index changed during review. No commit was created.');
  for(const item of checked.files){
   checkStop();const bytes=await readSafe(checked.root,item.path);
   const blob=await git(checked.root,'show',':'+item.path);
   if(!bytes||digest(bytes)!==item.sha256||!safeText(blob))throw Error('A staged file changed or contains potentially sensitive content; no commit created.');
  }
  const latest=await driver.repository(checked.root);
  if(latest.sha||latest.branch!==checked.branch||!driver.matchesGithubRepo(latest.remote,owner,name))throw Error('Git history, branch or origin changed during review.');
  checkStop();await git(checked.root,'-c','core.hooksPath='+hooks,'commit','-m','chore: initialize reviewed project source');
  const result=await driver.repository(checked.root);
  if(!/^[a-f0-9]{40,64}$/i.test(result.sha||''))throw Error('Initial commit could not be verified.');
  return result;
 }catch(error){
  // Do not reset history or remove working files. Roll back our staging only
  // if the index still consists solely of paths staged by this operation.
  const latest=await driver.repository(checked.root).catch(()=>null);
  const index=await git(checked.root,'ls-files','-z').then(entries,()=>null);
  if(latest&&!latest.sha&&index&&index.every(x=>staged.has(x))){
   for(const name of index)await git(checked.root,'--literal-pathspecs','rm','--cached','-f','--',name).catch(()=>{});
  }
  throw Error('Initial local commit failed: '+String(error.message||error).slice(0,300)+'. Review Git Source Control before retrying.');
 }finally{await fs.rm(hooks,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={plan,reviewText,commit,safeName,safeText};
