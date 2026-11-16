'use strict';
// Repo A selected branch -> Repo B Git checkout, using independent PATs for each repository.
// GitHub credentials are supplied only through subprocess environments, never Git URLs or command arguments.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const githubApiDefault=require('./repo-sync-github-api');
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
function prDetails({source,destination,sha,scope,base,branch,count,changedFiles=[],sourceBranch='main'}){
 const short=sha.slice(0,10);
 return {
  title:'sync: '+source.name+' '+sourceBranch+' @ '+short,
  commit:'sync: '+source.name+' '+sourceBranch+' ('+short+') into '+destination.name,
  body:[
   '## Source', '',
   '- Repository: '+source.name,
   '- Branch: '+(sourceBranch||'main'),
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
function patEnvironment(pat,{githubCli=false}={}){
 const token=String(pat||'');
 if(!/^[^\s\x00-\x1f\x7f]{20,512}$/.test(token))throw Error('A valid GitHub Personal Access Token (PAT) is required for both repositories.');
 const basic=Buffer.from('x-access-token:'+token,'utf8').toString('base64');
 return {
  GIT_CONFIG_COUNT:'1',
  GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_0:'AUTHORIZATION: basic '+basic,
  ...(githubCli?{GH_TOKEN:token,GITHUB_TOKEN:token}:{})
 };
}
async function run(bin,args,{cwd,timeout=120000,env={}}={}){
 try{
  const result=await exec(bin,args,{cwd,timeout,maxBuffer:8*1024*1024,windowsHide:true,
   env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',...env}});
  return String(result.stdout||'').trim();
 }catch(e){
  // Git error messages must not accidentally include environment secrets.
  let detail=String(e.stderr||e.message||'').trim().slice(0,800);
  const token=String(env.GH_TOKEN||'');
  if(token)detail=detail.split(token).join('[REDACTED]');
  const raw=String(env.GIT_CONFIG_VALUE_0||'');
  if(raw)detail=detail.split(raw).join('[REDACTED]');
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
function cleanAiField(input,limit=220){
 const str=String(input||'').trim().replace(/[\x00-\x1f\x7f]/g,' ');
 return str.length<=limit?str:str.slice(0,limit).trim();
}
function aiSyncPlan(raw,source){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const prefix='sync/'+source.repo.toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,28)+'/';
 let branch=cleanAiField(raw.branch,115);
 // Enforce deterministic Repo A namespace regardless of model output.
 if(!branch.startsWith(prefix)||!/^[a-z0-9/_-]+$/.test(branch)||branch.includes('..')||branch.includes('//')||branch.endsWith('/'))branch='';
 if(branch)try{baseName(branch);}catch{branch='';}
 return {branch,commitMessage:cleanAiField(raw.commitMessage,160),
  prTitle:cleanAiField(raw.prTitle,140),prDescription:String(raw.prDescription||'').trim().slice(0,1200)};
}
async function readSourceFacts({cloned,source,chosenBranch,sha,sourceMessage,files,destination,base}){
 let project={};
 if(files.includes('package.json'))try{
  const pkg=JSON.parse(await fs.readFile(path.join(cloned,'package.json'),'utf8'));
  project={name:cleanAiField(pkg.name,80),version:cleanAiField(pkg.version,35),description:cleanAiField(pkg.description,180)};
 }catch{}
 // Source info: safe metadata only, never PATs, raw code, README text or secrets.
 return {sourceRepo:source.name,sourceBranch:chosenBranch,sourceSha:sha,
  sourceCommitMessage:sourceMessage.slice(0,700),project,
  destinationRepo:destination.name,baseBranch:base,files:files.slice(0,80),fileCount:files.length};
}
async function sync({sourceUrl,destinationUrl='',destinationFolder,copyScope='.',sourceBranch='main',baseBranch='',sourcePat,destPat,workspaceRoot='',onProgress=()=>{},runner=run,githubApi=githubApiDefault,describePr=async()=>'',planSync=async()=>null}){
 const source=githubUrl(sourceUrl),scope=scopeName(copyScope),chosenBranch=baseName(sourceBranch||'main');
 const sourceEnv=patEnvironment(sourcePat),destinationEnv=patEnvironment(destPat);
 const destRoot=await fs.realpath(String(destinationFolder||''));
 const stat=await fs.lstat(destRoot);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular Repo B folder.');
 if(workspaceRoot){
  const workspace=await fs.realpath(workspaceRoot);
  const covers=(parent,child)=>child===parent||child.startsWith(parent+path.sep);
  if(covers(workspace,destRoot)||covers(destRoot,workspace))
   throw Error('Repo B must be a separate folder outside the current ATGV workspace (not its parent or child).');
 }
 const notify=(stage,message)=>Promise.resolve(onProgress({stage,message}));
 await runner('git',['--version']);
 // Repo B may be a clean checkout, or an EMPTY folder selected for first-run cloning.
 let alreadyCloned=true;
 try {
  const top=await runner('git',['rev-parse','--show-toplevel'],{cwd:destRoot});
  if(await fs.realpath(top)!==destRoot)throw Error('Select Repo B Git root, not a nested folder inside a different repository.');
 } catch(error) {
  if(!/not a git repository/i.test(String(error?.message||error)))throw error;
  alreadyCloned=false;
 }
 if(!alreadyCloned){
  if((await fs.readdir(destRoot)).length)throw Error('Selected Repo B folder is not a Git repository and is not empty. Choose an empty folder or an existing Repo B Git root; files will not be overwritten.');
  if(!destinationUrl)throw Error('Enter and test the Destination GitHub URL before selecting an empty Repo B folder.');
 }
 let destination;
 if(alreadyCloned){
  const currentOrigin=await runner('git',['remote','get-url','origin'],{cwd:destRoot});
  if(!/^https:\/\/github\.com\//i.test(currentOrigin))throw Error('Repo B origin must be an HTTPS GitHub URL to authenticate with the Destination PAT.');
  destination=githubUrl(currentOrigin,{origin:true});
 }else destination=githubUrl(destinationUrl);
 if(destinationUrl&&githubUrl(destinationUrl).name.toLowerCase()!==destination.name.toLowerCase())throw Error('Repo B URL differs from selected folder origin; refusing to push.');
 if(source.name.toLowerCase()===destination.name.toLowerCase())throw Error('Repo A and Repo B must be different repositories.');
 const remote=await githubApi.getRepository(destination,destPat);
 if(remote.nameWithOwner?.toLowerCase()!==destination.name.toLowerCase())throw Error('Repo B GitHub identity differs from local origin.');
 const base=baseName(baseBranch||remote.defaultBranch);
 if(!alreadyCloned){
  await notify('destination','Cloning '+destination.name+' / '+base+' into the selected empty Repo B folder…');
  // Git refuses to clone into a nonempty directory. Do not delete or reset user files.
  await runner('git',['clone','--quiet','--single-branch','--branch',base,'--',destination.url,'.'],{
   cwd:destRoot,timeout:180000,env:destinationEnv
  });
  await notify('destination','Repo B checkout prepared. Creating the review branch next.');
 }
 const top=await runner('git',['rev-parse','--show-toplevel'],{cwd:destRoot});
 if(await fs.realpath(top)!==destRoot)throw Error('Repo B checkout root changed during verification.');
 const origin=await runner('git',['remote','get-url','origin'],{cwd:destRoot});
 if(!/^https:\/\/github\.com\//i.test(origin)||githubUrl(origin,{origin:true}).name.toLowerCase()!==destination.name.toLowerCase())
  throw Error('Repo B origin does not match the selected Destination GitHub URL.');
 const dirty=await runner('git',['status','--porcelain','--untracked-files=all'],{cwd:destRoot});
 if(dirty)throw Error('Repo B has uncommitted or untracked changes. Commit or stash them first.');
 const oldBranch=await runner('git',['symbolic-ref','--quiet','--short','HEAD'],{cwd:destRoot});
 if(!oldBranch)throw Error('Repo B cannot be in detached HEAD.');
 // AI selects the review branch only after Repo A is cloned to temporary storage.
 let branch=baseName('sync/'+source.repo.toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,28)+'/'+chosenBranch);
 let aiPlan={};
 await notify('clone','Cloning '+source.name+' / '+chosenBranch+' into a temporary folder…');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-repo-sync-'));
 let files=[],switched=false,pushed=false;
 try{
  const cloned=path.join(temp,'repo-a');
  await runner('git',['clone','--quiet','--depth','1','--single-branch','--branch',chosenBranch,source.url,cloned],{timeout:180000,env:sourceEnv});
  const sha=await runner('git',['rev-parse','HEAD'],{cwd:cloned});
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Could not verify Repo A source commit.');
  const sourceMessage=(await runner('git',['log','-1','--pretty=%B'],{cwd:cloned})).trim();
  if(!sourceMessage||sourceMessage.length>12000)throw Error('Repo A commit message is missing or too large.');
  files=await trackedFiles(cloned,scope);
  const facts=await readSourceFacts({cloned,source,chosenBranch,sha,sourceMessage,files,destination,base});
  await notify('ai','AI reading verified source repository metadata from the temporary clone…');
  try{
   aiPlan=aiSyncPlan(await planSync(facts),source);
   if(aiPlan.branch)branch=aiPlan.branch;
  }catch{await notify('ai','AI plan unavailable; using a deterministic review branch and source commit message.');}
  await runner('git',['check-ref-format','--branch',branch],{cwd:destRoot});
  await notify('preflight',files.length+' tracked files; checking '+destination.name+' / '+base+'…');
  await runner('git',['fetch','origin','+refs/heads/'+base+':refs/remotes/origin/'+base],{cwd:destRoot,timeout:180000,env:destinationEnv});
  const remoteBranch=(await runner('git',['ls-remote','--heads','origin','refs/heads/'+branch],{cwd:destRoot,env:destinationEnv})).trim();
  if(remoteBranch){
   await runner('git',['fetch','origin','+refs/heads/'+branch+':refs/remotes/origin/'+branch],{cwd:destRoot,timeout:180000,env:destinationEnv});
   const previous=await runner('git',['log','-1','--pretty=%B','refs/remotes/origin/'+branch],{cwd:destRoot});
   if(!previous.includes('ATGV-Sync-Source: '+source.name))throw Error('Repo B branch '+branch+' already exists but was not created by ATGV for this source. Refusing to overwrite it.');
   const local=await runner('git',['branch','--list',branch],{cwd:destRoot});
   if(local){
    await runner('git',['switch',branch],{cwd:destRoot});
    const localSha=await runner('git',['rev-parse','HEAD'],{cwd:destRoot});
    const remoteSha=await runner('git',['rev-parse','refs/remotes/origin/'+branch],{cwd:destRoot});
    if(localSha!==remoteSha)throw Error('Existing Repo B sync branch differs from origin; reconcile manually before reusing.');
   }else await runner('git',['switch','-c',branch,'refs/remotes/origin/'+branch],{cwd:destRoot});
   switched=true;
  }else{
   const local=await runner('git',['branch','--list',branch],{cwd:destRoot});
   if(local)throw Error('Repo B has an unpublished branch '+branch+'. Resolve or publish it before reusing the name.');
   await runner('git',['switch','-c',branch,'refs/remotes/origin/'+base],{cwd:destRoot});
   switched=true;
  }
  await notify('copy','Copying '+files.length+' eligible files into '+branch+'…');
  for(const rel of files){
   const dest=await destinationFileSafe(destRoot,rel);
   await fs.mkdir(path.dirname(dest),{recursive:true});
   await fs.copyFile(path.join(cloned,...rel.split('/')),dest);
  }
  // Stage as git add . would, then prevent any unexpected file from being committed.
  await runner('git',['add','-A','--','.'],{cwd:destRoot});
  const staged=await runner('git',['diff','--cached','--name-only','-z'],{cwd:destRoot});
  const changedFiles=staged.split('\0').filter(Boolean);
  const allowed=new Set(files);
  if(changedFiles.some(file=>!allowed.has(file)))
   throw Error('Unexpected files staged outside the approved copy scope. No commit or push was made.');
  if(!changedFiles.length){
   if(!remoteBranch){
    await runner('git',['switch',oldBranch],{cwd:destRoot});
    await runner('git',['branch','-D',branch],{cwd:destRoot});
   }
   switched=false;
   return {unchanged:true,message:'Repo B already has the same eligible files from Repo A '+chosenBranch+'.',sourceSha:sha,sourceBranch:chosenBranch,fileCount:files.length};
  }
  const details=prDetails({source,destination,sha,scope,base,branch,count:changedFiles.length,changedFiles,sourceBranch:chosenBranch});
  const commitMessage=(aiPlan.commitMessage||sourceMessage)+'\n\nATGV-Sync-Source: '+source.name+'\nATGV-Sync-SHA: '+sha;
  await notify('commit','Committing staged changes with '+(aiPlan.commitMessage?'AI-generated':'source')+' message…');
  await runner('git',['commit','-m',commitMessage],{cwd:destRoot,timeout:180000});
  await notify('push','Pushing '+branch+' using the destination PAT…');
  await runner('git',['push','--set-upstream','origin',branch],{cwd:destRoot,timeout:180000,env:destinationEnv});
  pushed=true;
  await notify('pr','Preparing a short AI-written PR description…');
  let summary=aiPlan.prDescription||'';
  if(!summary)try{summary=String(await describePr({sourceRepo:source.name,sourceBranch:chosenBranch,sourceSha:sha,destinationRepo:destination.name,base,branch,sourceMessage,changedFiles:changedFiles.slice(0,80)})||'').trim().slice(0,1300);}
  catch{await notify('pr','AI PR details unavailable; using verified change metadata.');}
  const body=(summary?summary+'\n\n':'')+details.body;
  await notify('pr','Creating or reusing the review PR via GitHub HTTPS API for '+branch+'…');
  // The Destination PAT is sent only in the API Authorization header.
  const prUrl=await githubApi.findOpenPr(destination,destPat,{branch,base})||
   await githubApi.createPr(destination,destPat,{branch,base,title:aiPlan.prTitle||details.title,body});
  return {prUrl,branch,sourceBranch:chosenBranch,sourceSha:sha,sourceRepo:source.name,destinationRepo:destination.name,base,fileCount:changedFiles.length,commitMessage};
 }catch(e){
  const suffix=switched?' Repo B remains on branch '+branch+(pushed?' (already pushed)':'')+' for review.':'';
  throw Error(e.message+suffix);
 }finally{await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={githubUrl,baseName,scopeName,isAllowedPath,branchName,prDetails,patEnvironment,aiSyncPlan,readSourceFacts,sync};
