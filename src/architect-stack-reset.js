'use strict';
// Reset only the verified ATGV bootstrap checkout. For an explicitly confirmed
// force reset, preserve tracked and untracked work in a recoverable Git stash
// before hard-resetting the clean local base checkout. Never force-push, rewrite
// base history, or operate on arbitrary feature branches.
const path=require('node:path');
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {branchFor}=require('./architect-stack-bootstrap');
const diagnostic=require('./stack-process-diagnostics');
async function git(root,...args){
 try{
  const {stdout}=await exec('git',['-C',root,...args],{timeout:30000,windowsHide:true,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  return args.includes('-z')?stdout:stdout.trim();
 }catch(error){const failure=Error('Git '+args[0]+' failed; download the error log for details.');failure.diagnosticLogs=diagnostic.capture({stage:'Git '+args[0],bin:'git',args:['-C',root,...args],cwd:root,stdout:error.stdout,stderr:error.stderr,error});throw failure;}
}
// Read-only diagnostic. Files are never staged, stashed, reset or removed.
// Normal untracked grouping avoids overwhelming VS Code when node_modules is
// not ignored by the project. -z handles spaces and embedded line breaks.
async function inspectWorkingTree(root){
 if(!root||!path.isAbsolute(root))throw Error('Choose a local Git repository.');
 const real=await fs.realpath(root);
 const raw=await git(real,'status','--porcelain=v1','-z','--untracked-files=normal');
 if(!raw)return {root:real,entries:[],total:0};
 const parts=raw.split('\0'),entries=[];
 for(let i=0;i<parts.length;i++){
  const item=parts[i];if(!item||item.length<4)continue;
  const status=item.slice(0,2),name=item.slice(3);
  // The extra -z field is the previous name for renamed/copied files.
  if(status.includes('R')||status.includes('C'))i++;
  entries.push({status,path:name});
 }
 return {root:real,entries,total:entries.length};
}
function dirtyCheckoutMessage(result){
 const list=result.entries.slice(0,8).map(item=>
  '  '+item.status+' '+JSON.stringify(item.path)).join('\n');
 const remaining=result.total>8?'\n  … and '+(result.total-8)+' more.':'';
 return 'The project repository contains uncommitted or untracked changes ('+result.total+' path(s)). No files were changed.\n'
 +list+remaining+'\nUse Review Git Changes to inspect the files in VS Code, then commit, stash, or intentionally remove your own changes before retrying Reset Tech Stack. ATGV will not discard user files.';
}
async function plan({root,project,baseBranch='main',force=false,allowFeatureRecovery=false}={}){
 const {validGithubBranch}=require('./projects');
 baseBranch=validGithubBranch(project?.techStackPrepared?.baseBranch||baseBranch)||'main';
 if(!root||!path.isAbsolute(root))throw Error('Choose the configured project repository first.');
 if(!project?.techStackId)throw Error('No technology stack is selected for this project.');
 const real=await fs.realpath(root);
 if(real!==path.normalize(root))throw Error('Refusing to reset a repository through a symlink.');
 const branch=await git(real,'branch','--show-current');
 const generation=project.techStackGeneration||0;
 if(!Number.isSafeInteger(generation)||generation<0||generation>=9999)throw Error('Technology stack generation limit reached; review branches manually.');
 const expected=project.techStackPrepared?.branch||branchFor(project.techStackId,generation);
 // A verified catalog upgrade can move a saved stack from bootstrap/* to
 // migration/<stack>-catalog-*. Reset must honor that recorded branch without
 // broadening the set of repositories or permitting arbitrary feature refs.
 const {recognizedBranch}=require('./architect-stack-branch-recovery');
 if(!recognizedBranch(expected,project.techStackId))
  throw Error('The saved technology stack branch is not a recognized ATGV bootstrap or migration branch. Reset is blocked.');
 if(expected.startsWith('migration/')){
  const prepared=project.techStackPrepared;
  if(!prepared||prepared.remotePushed!==true||!/^[a-f0-9]{40}$/.test(String(prepared.sha||'')))
   throw Error('Cannot reset a migration stack without a saved, pushed Git revision. No changes were made.');
  const recorded=await git(real,'rev-parse','--verify','refs/heads/'+expected).catch(()=>null);
  if(recorded!==prepared.sha)throw Error('Saved migration branch no longer matches its recorded Git revision. Reset is blocked to preserve local changes.');
 }
 if(project.techStackPrepared?.root){
  const recorded=await fs.realpath(project.techStackPrepared.root).catch(()=>null);
  if(recorded!==real)throw Error('The configured repository is not the checkout that prepared this stack. Reset is blocked.');
 }
 // Feature recovery is permitted ONLY for an explicitly confirmed Force Reset,
 // from the verified prepared checkout. Never delete/reset the feature branch.
 const featureRecovery=branch!==baseBranch&&branch!==expected&&force&&allowFeatureRecovery&&
  /^feature\/[A-Za-z0-9][A-Za-z0-9._\/-]{0,150}$/.test(branch)&&validGithubBranch(branch)===branch&&
  project.techStackPrepared?.branch===expected&&!!project.techStackPrepared?.root;
 if(branch!==baseBranch&&branch!==expected&&!featureRecovery)throw Error('The checkout is on '+(branch||'an unnamed branch')+'. Switch to the saved stack branch '+expected+' or clean '+baseBranch+' before resetting. No changes made.');
 if(featureRecovery&&!await git(real,'rev-parse','--verify','refs/heads/'+expected).catch(()=>null))
  throw Error('The recorded bootstrap branch is missing locally. Feature recovery cannot verify this stack; no changes made.');
 const pending=await inspectWorkingTree(real);
 if(pending.total&&!force)throw Error(dirtyCheckoutMessage(pending));
 const main=await git(real,'rev-parse','--verify','refs/heads/'+baseBranch).catch(()=>null);
 if(!main)throw Error('No local base branch '+baseBranch+' exists. Reset is blocked to avoid discarding an orphan bootstrap branch.');
 const mainStatus=await git(real,'rev-parse','--show-toplevel');
 if(path.normalize(mainStatus)!==real)throw Error('Configured repository does not match Git worktree root.');
 let recovery='';
 if(branch!==baseBranch){
  // Switching to main does not change or delete the old branch. Therefore
  // the manifest is helpful provenance, not a prerequisite to switching away.
  // Require shared Git history to avoid acting on a checkout accidentally
  // assigned to another project. The preflight already confirmed clean worktree,
  // expected branch identity, Git root, and an existing main.
  const common=await git(real,'merge-base',baseBranch,'HEAD').catch(()=>null);
  if(!common)throw Error('Current branch and '+baseBranch+' have unrelated Git histories. Review the checkout manually; no changes made.');
  if(featureRecovery){recovery='Feature branch '+branch+' will be preserved with its commits; only the checkout switches to '+baseBranch+'.';}
  if(!featureRecovery){
  const marker=path.join(real,'atgv.bootstrap.json');
  const content=await fs.readFile(marker,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  let manifest;try{manifest=content?JSON.parse(content):null;}catch{}
  if(!manifest)recovery=content===null?'ATGV manifest is missing':'ATGV manifest cannot be parsed';
  else if(manifest.source!=='github-main-catalog'||!Array.isArray(manifest.stacks)||!manifest.stacks.includes(project.techStackId))
   recovery='ATGV manifest does not match the saved stack';
  }
 }
 const head=await git(real,'rev-parse','HEAD');
 return {root:real,currentBranch:branch,previousBranch:branch===baseBranch?'':branch,preservedWorkBranch:featureRecovery?branch:'',baseBranch,main,head,recovery,nextGeneration:generation+1,dirtyCount:pending.total,dirtyEntries:pending.entries,dirtySignature:JSON.stringify(pending.entries)};
}
async function reset(options={}){
 // Force is opt-in from the confirmed UI operation, never implicitly enabled
 // by a dirty checkout. We must still validate project/branch identity.
 const force=options.force===true;
 const approved=await plan({...options,force});
 if(options.expectedPlan&&['root','currentBranch','head','main','baseBranch','dirtySignature','preservedWorkBranch'].some(key=>options.expectedPlan[key]!==approved[key]))
  throw Error('Repository changed since the reset confirmation. No changes made; review and confirm again.');
 const fresh=await plan({...options,force});
 if(fresh.currentBranch!==approved.currentBranch||fresh.head!==approved.head||fresh.main!==approved.main||fresh.dirtySignature!==approved.dirtySignature)
  throw Error('Git checkout changed during reset. No changes made; retry after review.');
 let recoveryStash='';
 if(approved.dirtyCount){
  if(!force)throw Error(dirtyCheckoutMessage(await inspectWorkingTree(approved.root)));
  // -u saves staged, unstaged and ordinary untracked files. Git ignored files
  // are deliberately not removed. We abort if Git cannot preserve everything.
  const previous=await git(approved.root,'rev-parse','-q','--verify','refs/stash').catch(()=>null);
  const label='ATGV force stack reset '+new Date().toISOString()+' '+approved.currentBranch;
  await git(approved.root,'stash','push','--include-untracked','--message',label);
  const current=await git(approved.root,'rev-parse','-q','--verify','refs/stash').catch(()=>null);
  if(!current||current===previous)throw Error('Git could not create a recovery stash. Reset aborted; inspect Git changes.');
  recoveryStash=current;
  if((await inspectWorkingTree(approved.root)).total)
   throw Error('Git recovery stash was created ('+recoveryStash.slice(0,12)+'), but the checkout remains dirty. No reset performed.');
 }
 // Recheck the branch and base SHA after the optional backup. Never use -f
 // to clobber ignored files, nor delete or rewrite any remote branch.
 if(await git(approved.root,'branch','--show-current')!==approved.currentBranch||
    await git(approved.root,'rev-parse','HEAD')!==approved.head||
    await git(approved.root,'rev-parse',approved.baseBranch)!==approved.main)
  throw Error('Git revisions changed while preparing reset; no hard reset performed. Recovery stash: '+(recoveryStash||'none'));
 if(approved.currentBranch!==approved.baseBranch)await git(approved.root,'switch','--no-overwrite-ignore',approved.baseBranch);
 if((await inspectWorkingTree(approved.root)).total)throw Error('Checkout is not clean after switching base. No hard reset performed.');
 await git(approved.root,'reset','--hard','HEAD');
 if(await git(approved.root,'rev-parse','HEAD')!==approved.main)throw Error('Local base branch changed unexpectedly. Verify the checkout before continuing.');
 return {...approved,currentBranch:approved.baseBranch,recoveryStash};
}

const ARCHIVE_NAMES=['tech-stack.json','documents/architecture/tech-stack.md'];
function samePath(a,b,platform=process.platform){
 const api=platform==='win32'?path.win32:path.posix;
 const left=api.normalize(String(a)),right=api.normalize(String(b));
 return platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;
}
function identity(stat){return stat?{dev:stat.dev,ino:stat.ino,size:stat.size,mtimeMs:stat.mtimeMs}:null;}
async function safeArchiveParent(base,relative){
 let folder=base;
 for(const segment of relative.split('/').slice(0,-1)){
  folder=path.join(folder,segment);
  const stat=await fs.lstat(folder).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(stat?.isSymbolicLink()||(stat&&!stat.isDirectory()))throw Error('Unsafe project stack document directory: '+relative);
 }
}
async function archiveBase(projectFolder,{workspaceRoot,projectId}={}){
 if(!projectFolder||!path.isAbsolute(projectFolder))throw Error('Invalid project stack archive location.');
 let folder=projectFolder;
 if(workspaceRoot!==undefined||projectId!==undefined){
  if(!workspaceRoot||!path.isAbsolute(workspaceRoot)||!/^[a-z][a-z0-9-]{0,48}$/.test(String(projectId||''))||
     !samePath(path.resolve(projectFolder),path.join(path.resolve(workspaceRoot),'projects',projectId)))throw Error('Project stack archive is outside the selected workspace project.');
  // The user-selected workspace itself may be an alias or use different
  // Windows casing. Resolve it first, then reject links in projects/<id>.
  const workspace=await fs.realpath(workspaceRoot),projects=path.join(workspace,'projects');
  const projectsStat=await fs.lstat(projects);
  if(projectsStat.isSymbolicLink()||!projectsStat.isDirectory())throw Error('Projects folder must be a real directory.');
  folder=path.join(projects,projectId);
 }
 const stat=await fs.lstat(folder);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Project folder must be a real directory; linked project folders cannot be reset.');
 const base=await fs.realpath(folder);
 if(workspaceRoot!==undefined&&!samePath(base,folder))throw Error('Project folder resolves outside the selected workspace.');
 return {base,projectIdentity:{dev:stat.dev,ino:stat.ino}};
}
async function fileDigest(file){
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
async function planProjectStackArchive(projectFolder,stackId,options={}){
 if(!/^[a-z][a-z0-9-]{0,48}$/.test(String(stackId||'')))throw Error('Invalid project stack archive location.');
 const {base,projectIdentity}=await archiveBase(projectFolder,options),entries=[];
 for(const relative of ARCHIVE_NAMES){
  await safeArchiveParent(base,relative);
  const filename=path.join(base,relative),stat=await fs.lstat(filename).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!stat)continue;
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('Unsafe project stack document: '+relative);
  const digest=await fileDigest(filename),after=await fs.lstat(filename);
  if(after.isSymbolicLink()||!after.isFile()||JSON.stringify(identity(stat))!==JSON.stringify(identity(after)))throw Error('Project stack document changed while preparing reset: '+relative);
  entries.push({name:relative,identity:identity(after),digest});
 }
 const history=path.join(base,'stack-history'),stat=entries.length?await fs.lstat(history).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)):null;
 if(stat&&(stat.isSymbolicLink()||!stat.isDirectory()))throw Error('Unsafe project stack archive directory.');
 return {base,stackId,projectIdentity,entries,historyIdentity:stat?{dev:stat.dev,ino:stat.ino}:null};
}
async function restoreProjectStackDocuments(archive){
 const names=archive?.archived||[];if(!names.length)return;
 if(!archive.base||!archive.folder||!path.isAbsolute(archive.base)||!path.isAbsolute(archive.folder)||
    new Set(names).size!==names.length||names.some(name=>!ARCHIVE_NAMES.includes(name)))throw Error('Invalid stack document recovery information.');
 const base=await fs.realpath(archive.base),history=path.join(base,'stack-history');
 const h=await fs.lstat(history),folderStat=await fs.lstat(archive.folder),relative=path.relative(history,archive.folder);
 if(h.isSymbolicLink()||!h.isDirectory()||folderStat.isSymbolicLink()||!folderStat.isDirectory()||!relative||relative.startsWith('..')||path.isAbsolute(relative)||relative.includes(path.sep)||
    !samePath(await fs.realpath(archive.folder),archive.folder))throw Error('Unsafe stack document recovery folder.');
 for(const name of names){
  await safeArchiveParent(base,name);
  const original=path.join(base,name),existing=await fs.lstat(original).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(existing)throw Error('Cannot restore '+name+' because a file already exists there.');
  const stored=path.join(archive.folder,name);await safeArchiveParent(archive.folder,name);
  const stat=await fs.lstat(stored);if(stat.isSymbolicLink()||!stat.isFile())throw Error('Unsafe archived stack document: '+name);
 }
 for(const name of [...names].reverse())await fs.rename(path.join(archive.folder,name),path.join(base,name));
}
async function archiveProjectStackDocuments(projectFolder,stackId,options={}){
 const current=await planProjectStackArchive(projectFolder,stackId,options),expected=options.expectedPlan;
 if(expected&&JSON.stringify(current)!==JSON.stringify(expected))throw Error('Project stack documents changed since reset confirmation. No Git changes made; review and retry.');
 if(!current.entries.length)return {archived:[],folder:'',base:current.base};
 const baseStat=await fs.lstat(current.base);
 if(baseStat.isSymbolicLink()||!baseStat.isDirectory()||baseStat.dev!==current.projectIdentity.dev||baseStat.ino!==current.projectIdentity.ino)throw Error('Project folder changed while preparing reset. No Git changes made.');
 const history=path.join(current.base,'stack-history');await fs.mkdir(history,{recursive:true});
 const h=await fs.lstat(history);if(h.isSymbolicLink()||!h.isDirectory()||!samePath(await fs.realpath(history),history))throw Error('Unsafe project stack archive directory.');
 const folder=await fs.mkdtemp(path.join(history,Date.now()+'-'+stackId+'-')),archived=[];
 try{
  for(const entry of current.entries){
   const source=path.join(current.base,entry.name),destination=path.join(folder,entry.name);
   await safeArchiveParent(current.base,entry.name);
   const stat=await fs.lstat(source);
   if(stat.isSymbolicLink()||!stat.isFile()||JSON.stringify(identity(stat))!==JSON.stringify(entry.identity))throw Error('Project stack document changed before archiving: '+entry.name);
   if(await fileDigest(source)!==entry.digest)throw Error('Project stack document content changed before archiving: '+entry.name);
   const after=await fs.lstat(source);if(after.isSymbolicLink()||JSON.stringify(identity(after))!==JSON.stringify(entry.identity))throw Error('Project stack document changed before archiving: '+entry.name);
   await fs.mkdir(path.dirname(destination),{recursive:true});await fs.rename(source,destination);archived.push(entry.name);
  }
 }catch(error){
  try{await restoreProjectStackDocuments({base:current.base,folder,archived});}
  catch(restoreError){throw Error('Stack document archive failed: '+error.message+'. Some files may remain in '+folder+'. Recovery failed: '+restoreError.message);}
  throw Error('Stack document archive failed; previously moved documents were restored: '+error.message);
 }
 return {archived,folder,base:current.base};
}
async function resetWithProjectArchive({projectFolder,stackId,workspaceRoot,projectId,expectedArchivePlan,...resetOptions}={}){
 // Archive first after confirmation: a bad project path or changed document
 // must not leave Git on another branch while project settings remain approved.
 const archive=await archiveProjectStackDocuments(projectFolder,stackId,{workspaceRoot,projectId,expectedPlan:expectedArchivePlan});
 try{return {result:await reset(resetOptions),archive};}
 catch(error){
  try{await restoreProjectStackDocuments(archive);}
  catch(restoreError){throw Error(error.message+'. Stack documents remain in '+archive.folder+'; automatic recovery failed: '+restoreError.message);}
  error.message+=' Stack documents were restored. If Git created a recovery stash, it remains available.';
  throw error;
 }
}
module.exports={plan,reset,resetWithProjectArchive,planProjectStackArchive,archiveProjectStackDocuments,restoreProjectStackDocuments,samePath,inspectWorkingTree,dirtyCheckoutMessage};
