'use strict';
// Capture eligible working source into a separate worktree, never stage or
// modify the user's original checkout. The snapshot is a local commit only.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),exec=require('node:util').promisify(execFile);
const {safeName,safeText}=require('./architect-initial-commit');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function git(root,...args){
 const r=await exec('git',['-C',root,...args],{encoding:'buffer',timeout:60000,maxBuffer:8*1024*1024,windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
 return r.stdout;
}
const names=b=>b.toString('utf8').split('\0').filter(Boolean);
async function file(root,name){
 let p=root;const parts=name.split('/');
 for(let i=0;i<parts.length;i++){
  p=path.join(p,parts[i]);const st=await fs.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!st)return {missing:true};
  if(st.isSymbolicLink()||(i<parts.length-1?!st.isDirectory():!st.isFile()))return null;
  if(i===parts.length-1&&st.size>2*1024*1024)return null;
 }
 const bytes=await fs.readFile(p);if(!safeText(bytes))return null;
 return {bytes,sha:hash(bytes)};
}
async function inspect(root,head){
 if((await git(root,'rev-parse','HEAD')).toString().trim()!==head)throw Error('Project checkout HEAD changed; retry Initial Development.');
 if((await git(root,'ls-files','--unmerged','-z')).length)throw Error('Resolve Git merge conflicts before Initial Development.');
 const changed=names(await git(root,'diff','--no-renames','--name-only','-z',head,'--'));
 const untracked=names(await git(root,'ls-files','--others','--exclude-standard','-z'));
 const candidates=[...new Set([...changed,...untracked])].sort();
 if(candidates.length>10000)throw Error('Too many changed files for safe automatic capture.');
 const tracked=new Set(changed),files=[],excluded=[];let total=0;
 for(const name of candidates){
  if(!safeName(name)||/\.(?:sqlite3?|db)(?:[-.].*)?$|(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(name)){excluded.push(name);continue;}
  const value=await file(root,name);
  if(!value||value.missing&&!tracked.has(name)){excluded.push(name);continue;}
  if(value.missing){
   // Never propagate deletions automatically; retain the committed baseline.
   excluded.push(name);continue;
  }
  total+=value.bytes.length;
  if(total>64*1024*1024||files.length>=2500)throw Error('Changed project source exceeds automatic capture limit.');
  files.push({name,sha:value.sha,bytes:value.bytes});
 }
 return {files,excluded,digest:hash(JSON.stringify({files:files.map(x=>[x.name,x.sha]),excluded}))};
}
async function capture(root,worktree,{head,baseSha,check=()=>{}}){
 const plan=await inspect(root,head);check();
 if(plan.files.length&&head!==baseSha)throw Error('Uncommitted project source is based on a different commit than the selected development baseline. Reconcile source before Initial Development.');
 if(!plan.files.length)return {sha:baseSha,captured:0,excluded:plan.excluded.length};
 const hookDir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-snapshot-hooks-'));
 try{
  for(const entry of plan.files){
   check();
   let parent=worktree;const parts=entry.name.split('/');
   for(const part of parts.slice(0,-1)){
    parent=path.join(parent,part);const st=await fs.lstat(parent).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
    if(st&&(!st.isDirectory()||st.isSymbolicLink()))throw Error('Unsafe snapshot destination.');
    if(!st)await fs.mkdir(parent);
   }
   const target=path.join(worktree,entry.name),st=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
   if(st&&(!st.isFile()||st.isSymbolicLink()))throw Error('Unsafe snapshot destination.');
   await fs.writeFile(target,entry.bytes);
   await git(worktree,'--literal-pathspecs','add','-f','--',entry.name);
   const staged=await git(worktree,'show',':'+entry.name);
   if(!safeText(staged))throw Error('Git filter produced unsafe staged source.');
  }
  const latest=await inspect(root,head);check();
  if(latest.digest!==plan.digest)throw Error('Project source changed while capturing. Retry Initial Development.');
  const allowed=new Set(plan.files.map(x=>x.name)),staged=names(await git(worktree,'diff','--cached','--name-only','-z'));
  if(staged.some(x=>!allowed.has(x)))throw Error('Unexpected staged source in isolated branch.');
  if(staged.length)await git(worktree,'-c','core.hooksPath='+hookDir,'-c','commit.gpgsign=false','-c','user.name=ATGV','-c','user.email=atgv-local@localhost','commit','-m','ATGV capture current project source for initial development');
  const sha=(await git(worktree,'rev-parse','HEAD')).toString().trim();
  return {sha,captured:staged.length,excluded:plan.excluded.length};
 }finally{await fs.rm(hookDir,{recursive:true,force:true});}
}
module.exports={capture,inspect};
