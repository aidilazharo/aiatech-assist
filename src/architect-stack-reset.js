'use strict';
// Reset only the verified ATGV bootstrap checkout. For an explicitly confirmed
// force reset, preserve tracked and untracked work in a recoverable Git stash
// before hard-resetting the clean local base checkout. Never force-push, rewrite
// base history, or operate on arbitrary feature branches.
const path=require('node:path');
const fs=require('node:fs/promises');
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
 if(!/^bootstrap\/[a-z0-9-]{1,80}$/.test(expected)||!expected.startsWith('bootstrap/'+project.techStackId+'-'))
  throw Error('The recorded bootstrap branch does not match the saved technology stack. Reset is blocked.');
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

async function archiveProjectStackDocuments(projectFolder,stackId){
 if(!projectFolder||!path.isAbsolute(projectFolder)||!/^[a-z][a-z0-9-]{0,48}$/.test(stackId))throw Error('Invalid project stack archive location.');
 const base=await fs.realpath(projectFolder);
 if(base!==path.normalize(projectFolder))throw Error('Refusing to archive project documents through a symlink.');
 const names=['tech-stack.json','documents/architecture/tech-stack.md'];
 const found=[];
 for(const relative of names){
  let folder=base;
  for(const segment of relative.split('/').slice(0,-1)){
   folder=path.join(folder,segment);
   const stat=await fs.lstat(folder).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
   if(stat?.isSymbolicLink()||(stat&&!stat.isDirectory()))throw Error('Unsafe project stack document directory: '+relative);
  }
  const filename=path.join(base,relative),stat=await fs.lstat(filename).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(stat){if(stat.isSymbolicLink()||!stat.isFile())throw Error('Unsafe project stack document: '+relative);found.push(relative);}
 }
 if(!found.length)return {archived:[],folder:''};
 const history=path.join(base,'stack-history'),stat=await fs.lstat(history).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(stat&&(stat.isSymbolicLink()||!stat.isDirectory()))throw Error('Unsafe project stack archive directory.');
 await fs.mkdir(history,{recursive:true});
 const folder=await fs.mkdtemp(path.join(history,Date.now()+'-'+stackId+'-'));
 const archived=[];
 for(const name of found){
  const source=path.join(base,name),destination=path.join(folder,name);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.rename(source,destination);archived.push(name);
 }
 return {archived,folder};
}
module.exports={plan,reset,archiveProjectStackDocuments,inspectWorkingTree,dirtyCheckoutMessage};
