'use strict';
// Repo A (GitHub main) -> Repo B (local checkout -> new branch -> pull request).
// All commands use execFile (no shell interpolation) and the existing Git/gh authentication.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const MAX_FILES=6000,MAX_BYTES=100*1024*1024,MAX_SINGLE_FILE=20*1024*1024;
const OWNER=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO=/^[A-Za-z0-9_.-]{1,100}$/;
const BASE=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,110}$/;
function githubUrl(value,{origin=false}={}){
 const raw=String(value||'').trim();
 let match=/^https:\/\/github\.com\/([^/?#\s]+)\/([^/?#\s]+?)\/?$/i.exec(raw);
 if(!match&&origin)match=/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+)$/i.exec(raw);
 if(!match)throw Error('Expected a GitHub repository URL: https://github.com/OWNER/REPO');
 const owner=match[1],repo=match[2].replace(/\.git$/i,'');
 if(!OWNER.test(owner)||!REPO.test(repo)||repo==='.'||repo==='..')throw Error('Invalid GitHub repository owner or name.');
 return {owner,repo,name:owner+'/'+repo,url:'https://github.com/'+owner+'/'+repo+'.git'};
}
function baseName(input){
 const name=String(input||'').trim();
 if(!BASE.test(name)||name.includes('..')||name.includes('//')||name.endsWith('/')||name.includes('@{'))throw Error('Invalid destination PR base branch.');
 return name;
}
function scopeName(input){
 const value=String(input||'.').trim().replace(/\\/g,'/');
 if(!value||value==='.')return '.';
 if(value.length>280||value.startsWith('/')||/^[A-Za-z]:/.test(value)||value.includes('\0'))throw Error('Copy scope must be a short relative path.');
 const segments=value.split('/');
 if(segments.some(s=>!s||s==='.'||s==='..'||s.includes(':')))throw Error('Copy scope cannot contain parent traversal or unsafe segments.');
 if(!isAllowedPath(value))throw Error('Copy scope includes protected Git, release workflow, credential or generated paths.');
 return value;
}
const BLOCKED_DIRS=new Set(['.git','node_modules','dist','build','coverage','.atgv','.venv','venv','.next','.cache','tmp','temp']);
const BLOCKED_FILES=new Set(['.env','.npmrc','.pypirc','id_rsa','id_ed25519','credentials.json']);
function isAllowedPath(relative){
 const segments=String(relative||'').replace(/\\/g,'/').split('/');
 if(segments.some(s=>!s||s==='.'||s==='..'||BLOCKED_DIRS.has(s.toLowerCase())))return false;
 const lower=segments.map(s=>s.toLowerCase()),name=lower[lower.length-1];
 if(lower[0]==='.github'&&lower[1]==='workflows')return false;
 if(BLOCKED_FILES.has(name)||name.startsWith('.env.')||/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name))return false;
 return true;
}
function branchName(repo,sha,clock=new Date(),suffix=crypto.randomBytes(3).toString('hex')){
 const stamp=clock.toISOString().replace(/[-:]/g,'').slice(0,15).replace('T','t');
 const label=String(repo||'repo-a').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,35)||'repo-a';
 return 'sync/'+label+'-main-'+String(sha).slice(0,10)+'-'+stamp+'-'+suffix;
}
function prDetails({source,destination,sha,scope,base,branch,count,changedFiles=[]}){
 const short=sha.slice(0,10);
 return {
  title:'sync: '+source.name+' main @ '+short,
  commit:'sync: '+source.name+' main ('+short+') into '+destination.name,
  body:[
   '## Source', '',
   '- Repository: '+source.name,
   '- Branch: main',
   '- Commit: '+sha,
   '- Copied scope: '+(scope==='.'?'all eligible tracked files':scope),
   '', '## Destination', '',
   '- Repository: '+destination.name,
   '- PR base: '+base,
   '- New branch: '+branch,
   '- Files changed: '+count,
   '',
   '## Changed paths', '',
   ...(changedFiles.slice(0,60).map(file=>'- '+String(file).replace(/[\r\n\0`]/g,'?'))),
   ...(changedFiles.length>60?['- ... and '+(changedFiles.length-60)+' more changed paths']:[]),
   '', '## Safety and review', '',
   '- Repo B existing files are not deleted just because they are absent from Repo A.',
   '- Git metadata, release workflows, secrets and generated dependencies were not imported.',
   '- Review the diff, build, tests and ownership before merging.',
   '- Created by ATGV AIATECH Assist Repo Sync.'
  ].join('\n')
 };
}
async function run(bin,args,{cwd,timeout=120000}={}){
 try{
  const result=await exec(bin,args,{cwd,timeout,maxBuffer:8*1024*1024,windowsHide:true,
   env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  return String(result.stdout||'').trim();
 }catch(e){
  const detail=String(e.stderr||e.message||'').trim().slice(0,800);
  throw Error(bin+' '+args[0]+' failed: '+detail);
 }
}
async function destinationFileSafe(root,rel){
 const segments=rel.split('/'),target=path.resolve(root,...segments);
 if(target!==root&&!target.startsWith(root+path.sep))throw Error('Destination path leaves Repo B.');
 let parent=root;
 for(let i=0;i<segments.length;i++){
  parent=path.join(parent,segments[i]);
  const stat=await fs.lstat(parent).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(stat?.isSymbolicLink())throw Error('Refusing symbolic link in Repo B: '+rel);
  if(stat&&i<segments.length-1&&!stat.isDirectory())throw Error('Destination directory is not a directory: '+rel);
  if(stat&&i===segments.length-1&&!stat.isFile())throw Error('Destination path is not a regular file: '+rel);
 }
 return target;
}
async function trackedFiles(source,scope){
 const raw=await run('git',['ls-files','-z'],{cwd:source});
 const candidates=raw.split('\0').filter(Boolean).map(p=>p.replace(/\\/g,'/'));
 const paths=candidates.filter(p=>isAllowedPath(p)&&(scope==='.'||p===scope||p.startsWith(scope+'/')));
 if(!paths.length)throw Error('Repo A has no eligible tracked files in '+scope+'.');
 if(paths.length>MAX_FILES)throw Error('Copy exceeds '+MAX_FILES+' tracked files. Select a smaller scope.');
 let bytes=0;
 const valid=[];
 for(const rel of paths){
  const file=path.resolve(source,...rel.split('/'));
  if(!file.startsWith(source+path.sep))throw Error('Invalid Git source path.');
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink())continue;
  if(stat.size>MAX_SINGLE_FILE)throw Error('Source file exceeds 20 MB: '+rel);
  bytes+=stat.size;
  if(bytes>MAX_BYTES)throw Error('Copy exceeds 100 MB. Select a smaller scope.');
  valid.push(rel);
 }
 if(!valid.length)throw Error('No regular eligible files in selected scope.');
 return valid;
}
async function sync({sourceUrl,destinationFolder,copyScope='.',baseBranch='',onProgress=()=>{},runner=run}){
 const source=githubUrl(sourceUrl),scope=scopeName(copyScope);
 const destRoot=await fs.realpath(String(destinationFolder||''));
 const stat=await fs.lstat(destRoot);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular Repo B folder.');
 const notify=(stage,message)=>Promise.resolve(onProgress({stage,message}));
 await runner('git',['--version']);
 await runner('gh',['--version']);
 await runner('gh',['auth','status']);
 const top=await runner('git',['rev-parse','--show-toplevel'],{cwd:destRoot});
 const canonical=await fs.realpath(top);
 if(canonical!==destRoot)throw Error('Select the Repo B Git root, not a nested folder.');
 const dirty=await runner('git',['status','--porcelain','--untracked-files=all'],{cwd:destRoot});
 if(dirty)throw Error('Repo B has uncommitted or untracked changes. Commit or stash them first.');
 const oldBranch=await runner('git',['symbolic-ref','--quiet','--short','HEAD'],{cwd:destRoot});
 if(!oldBranch)throw Error('Repo B cannot be in detached HEAD.');
 const origin=await runner('git',['remote','get-url','origin'],{cwd:destRoot});
 const destination=githubUrl(origin,{origin:true});
 if(source.name.toLowerCase()===destination.name.toLowerCase())throw Error('Repo A and Repo B must be different repositories.');
 const remote=JSON.parse(await runner('gh',['repo','view',destination.name,'--json','nameWithOwner,defaultBranchRef']));
 if(remote.nameWithOwner?.toLowerCase()!==destination.name.toLowerCase())throw Error('Repo B GitHub identity differs from local origin.');
 const base=baseName(baseBranch||remote.defaultBranchRef?.name);
 await notify('clone','Reading latest '+source.name+' main…');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-repo-sync-'));
 let branch='',files=[],switched=false,pushed=false;
 try{
  const cloned=path.join(temp,'repo-a');
  await runner('git',['clone','--quiet','--depth','1','--single-branch','--branch','main',source.url,cloned],{timeout:180000});
  const sha=await runner('git',['rev-parse','HEAD'],{cwd:cloned});
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Could not verify Repo A main commit.');
  files=await trackedFiles(cloned,scope);
  await notify('preflight',files.length+' verified files; checking '+destination.name+' base '+base+'…');
  await runner('git',['fetch','origin','+refs/heads/'+base+':refs/remotes/origin/'+base],{cwd:destRoot,timeout:180000});
  branch=branchName(source.repo,sha);
  await runner('git',['check-ref-format','--branch',branch],{cwd:destRoot});
  await runner('git',['switch','-c',branch,'origin/'+base],{cwd:destRoot});
  switched=true;
  await notify('copy','Copying '+files.length+' files into '+branch+'…');
  for(const rel of files){
   const dest=await destinationFileSafe(destRoot,rel);
   await fs.mkdir(path.dirname(dest),{recursive:true});
   await fs.copyFile(path.join(cloned,...rel.split('/')),dest);
  }
  for(let i=0;i<files.length;i+=100){
   await runner('git',['add','--',...files.slice(i,i+100)],{cwd:destRoot});
  }
  const staged=await runner('git',['diff','--cached','--name-only','-z'],{cwd:destRoot});
  const changedFiles=staged.split('\0').filter(Boolean);
  if(!changedFiles.length){
   await runner('git',['switch',oldBranch],{cwd:destRoot});
   await runner('git',['branch','-D',branch],{cwd:destRoot});
   switched=false;branch='';
   return {unchanged:true,message:'Repo B already contains the same eligible files from Repo A.',sourceSha:sha,fileCount:files.length};
  }
  const details=prDetails({source,destination,sha,scope,base,branch,count:changedFiles.length,changedFiles});
  await notify('commit','Committing source '+sha.slice(0,10)+'…');
  await runner('git',['commit','-m',details.commit],{cwd:destRoot,timeout:180000});
  await notify('push','Pushing new branch '+branch+'…');
  await runner('git',['push','--set-upstream','origin',branch],{cwd:destRoot,timeout:180000});
  pushed=true;
  const body=path.join(temp,'pull-request.md');
  await fs.writeFile(body,details.body,'utf8');
  await notify('pr','Creating pull request into '+destination.name+'/'+base+'…');
  const prUrl=await runner('gh',['pr','create','--repo',destination.name,'--base',base,'--head',branch,'--title',details.title,'--body-file',body],{cwd:destRoot,timeout:180000});
  if(!/^https:\/\/github\.com\/[^ \r\n]+\/pull\/\d+/.test(prUrl))throw Error('GitHub CLI did not return a valid pull request URL.');
  return {prUrl,branch,sourceSha:sha,sourceRepo:source.name,destinationRepo:destination.name,base,fileCount:changedFiles.length,commitMessage:details.commit};
 }catch(e){
  const suffix=switched?' Repo B remains on new branch '+branch+(pushed?' (already pushed)':'')+' for manual inspection.':'';
  throw Error(e.message+suffix);
 }finally{await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={githubUrl,baseName,scopeName,isAllowedPath,branchName,prDetails,sync};
