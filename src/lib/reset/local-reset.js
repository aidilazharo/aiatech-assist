'use strict';
// ATGV: Reset is LOCAL ONLY. Never make Jira/Confluence delete requests, mutate
// a remote Git branch, or clear credentials and extension-wide configuration.
const fs = require('node:fs/promises');
const path = require('node:path');
const {ProjectRegistry,normalizeProjectInput,projectConfig} = require('../../projects');
const {ensureWorkspaceLibrary,scaffoldProject,removeManagedWorkspaceLibrary} = require('../../tech-stacks');
const developerGit = require('../../developer-git');
const sdlcCatalog = require('../../github-sdlc-catalog');

function restoredProject(project) {
  // Project identity and connection *configuration* survive so that source can
  // be re-downloaded. All approvals, repository SHA state, generated outputs,
  // progress and local artifacts are rebuilt from scratch.
  return normalizeProjectInput({
    id:project.id,name:project.name,settings:project.settings||{},
    schedule:project.schedule||{},techStackId:project.techStackId||'',
    techStackCompanionId:project.techStackCompanionId||'',
    techStackGeneration:0
  });
}
function remoteCheckout(project,extensionSettings,globalConfig){
  const config=projectConfig(project,extensionSettings,globalConfig);
  const owner=String(config.get('github.owner')||'');
  const repo=String(config.get('github.repo')||'');
  if(Boolean(owner)!==Boolean(repo))throw Error(`Project ${project.id}: GitHub owner and repository must both be configured before Reset.`);
  // Reset must start from the configured remote source branch (or the recorded
  // integration base), NOT automatically restore a stale bootstrap branch.
  // Pushed bootstrap branches remain untouched on GitHub for future recovery.
  const explicit=String(project.settings?.github?.branch||'');
  const branch=explicit || String(config.get('github.branch')||'') || String(project.techStackPrepared?.baseBranch||'');
  return {owner,repo,branch};
}
function preview(projects,connections,hasCatalog,root){
  const lines=[
    'ATGV RESET — DELETE ALL LOCAL WORK',
    `Managed project directory: ${path.join(root,'projects')}`,
    'Permanently delete local source changes, unpushed commits, worktrees, local Git branches, BR drafts, generated documents, tests, project execution state and caches.',
    'Remove existing local project repositories and the downloaded Library; download fresh copies from configured remote GitHub sources.',
    'KEEP extension-wide settings, Jira/Confluence/GitHub connection details, API tokens and VS Code preferences.',
    'KEEP project identities and remote connection mappings needed to recreate local projects.',
    'DO NOT delete or modify any remote Jira issue, Confluence page, GitHub repository, branch or pull request.',
    'Fresh repositories are cloned BEFORE local deletion; if a required download fails, the original local projects are kept.',
    'Work that exists ONLY locally is irrecoverable after Reset.',
    'Previously pushed remote bootstrap branches remain unchanged; old committed scaffolds may still need explicit migration.'
  ];
  for (const project of projects){
    const git=connections.find(item=>item.id===project.id);
    lines.push(`PROJECT ${project.name} [${project.id}]: ${git?.repo ? `${git.owner}/${git.repo}${git.branch?' @ '+git.branch:''}`:'no configured project repository'}`);
  }
  lines.push(`Library: ${hasCatalog?'re-download from configured main':'not configured'}`);
  const out=lines.join('\n');
  if(out.length>9500)throw Error('Too many projects for a safe Reset confirmation.');
  return out;
}
async function checkOwnedWorkspaceLibrary(workspace){
  const base=path.join(workspace,'.atgv');
  const stat=await fs.lstat(base).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!stat)return;
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Refusing Reset: .atgv is not a normal ATGV-owned directory.');
  const marker=await fs.readFile(path.join(base,'atgv.workspace.json'),'utf8').catch(()=>null);
  let identity;
  try{identity=JSON.parse(marker);}catch{}
  if(identity?.managedBy!=='aia-my.atgv-aiatech-assist')
    throw Error('Refusing Reset: .atgv is not verified as ATGV-managed. No local files were deleted.');
}
async function stageFreshWorkspace({workspace,projects,connections,catalogConfig,catalogToken}){
  const stage=await fs.mkdtemp(path.join(workspace,'.atgv-reset-staging-'));
  const stagedWorkspace=path.join(stage,'workspace');
  try{
    await fs.mkdir(stagedWorkspace);
    await ensureWorkspaceLibrary(stagedWorkspace);
    // Download the verified catalog first so rebuilt stack documents can use
    // current templates; a GitHub outage must never erase existing work.
    if(catalogConfig.repositoryUrl){
      await sdlcCatalog.syncGitWorkspace(catalogConfig,catalogToken,stagedWorkspace);
    }
    const registry=new ProjectRegistry(stagedWorkspace);
    await registry.ensureRoot(); // Also stage a real, empty projects root when no project exists.
    for(const project of projects){
      const fresh=await registry.create(restoredProject(project));
      await scaffoldProject(stagedWorkspace,fresh);
      const git=connections.find(item=>item.id===project.id);
      if(git?.repo){
        const parent=path.join(stagedWorkspace,'projects',project.id,'repository');
        await fs.mkdir(parent,{recursive:true});
        await developerGit.cloneConfigured(parent,git.owner,git.repo,git.branch);
      }
    }
    return {stage,stagedWorkspace};
  }catch(error){
    await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});
    throw Error('Fresh remote download failed; existing local work was NOT deleted: '+error.message,{cause:error});
  }
}
// On Windows, antivirus and file watchers can briefly hold directory handles.
// Retry only transient permission/locking errors. Never clear a destination to
// make a rename succeed, and never retry a semantic safety failure.
const TRANSIENT_RENAME_ERRORS=new Set(['EPERM','EACCES','EBUSY']);
async function pathEntry(target){
 return fs.lstat(target).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
}
function normalDir(stat,label){
 if(!stat||!stat.isDirectory()||stat.isSymbolicLink())throw Error(label+' must be an existing, real directory. No files were replaced.');
}
async function renameWithRetry(from,to,{rename=fs.rename,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=0;;attempt++){
  try{return await rename(from,to);}
  catch(error){
   if(!TRANSIENT_RENAME_ERRORS.has(error?.code)||attempt>=3)throw error;
   // Bounded, low-impact retries: Windows may release transient file handles.
   await delay([80,180,350][attempt]);
  }
 }
}
async function promoteStagedDirectory(from,to){
 normalDir(await pathEntry(from),'Staged Reset directory');
 if(await pathEntry(to))throw Error('Reset destination already exists: '+to+'. No existing folder was overwritten.');
 try{await renameWithRetry(from,to);return 'moved';}
 catch(error){
  if(!TRANSIENT_RENAME_ERRORS.has(error?.code))throw error;
  // A locked staged directory can sometimes be read when it cannot be renamed.
  // Only copy from our verified staging to an absent destination; never merge.
  if(await pathEntry(to))throw error;
  try{
   await fs.cp(from,to,{recursive:true,force:false,errorOnExist:true,dereference:false});
   normalDir(await pathEntry(to),'Promoted Reset directory');
   return 'copied';
  }catch(copyError){
   // The destination did not exist before this operation. Remove only files
   // created by the failed copy; never touch pre-existing user content.
   await fs.rm(to,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
   throw Error('Staged Reset folder could not be moved or copied: '+error.message+'; copy: '+copyError.message,{cause:copyError});
  }
 }
}
async function stagedResetLayout(stage){
 normalDir(await pathEntry(stage),'Reset staging directory');
 const stagedWorkspace=path.join(stage,'workspace');
 normalDir(await pathEntry(stagedWorkspace),'Staged workspace');
 const stagedAtgv=path.join(stagedWorkspace,'.atgv');
 normalDir(await pathEntry(stagedAtgv),'Staged .atgv');
 let marker;
 try{marker=JSON.parse(await fs.readFile(path.join(stagedAtgv,'atgv.workspace.json'),'utf8'));}
 catch{throw Error('Staged Reset has no valid ATGV ownership marker. Nothing was replaced.');}
 if(marker?.managedBy!=='aia-my.atgv-aiatech-assist')
  throw Error('Staged Reset is not owned by ATGV. Nothing was replaced.');
 normalDir(await pathEntry(path.join(stagedWorkspace,'projects')),'Staged projects');
 return stagedWorkspace;
}
async function recoverInterruptedReset(workspace){
 const names=(await fs.readdir(workspace)).filter(name=>name.startsWith('.atgv-reset-staging-')).sort();
 if(!names.length)return null;
 // Existing staged data is never erased on a subsequent Reset. Even an old
 // failed attempt with partially replaced directories needs explicit review.
 const activeAtgv=await pathEntry(path.join(workspace,'.atgv'));
 const projectRoot=path.join(workspace,'projects');
 const projects=await pathEntry(projectRoot);
 if(activeAtgv||projects&&(!projects.isDirectory()||projects.isSymbolicLink()||(await fs.readdir(projectRoot)).length))
  throw Error('Previous Reset staging is still present: '+names.join(', ')+'. Existing workspace files were preserved. Review or back up both copies before attempting another Reset.');
 if(names.length!==1)throw Error('Multiple interrupted Reset staging folders exist. Preserve them for manual reconciliation: '+names.join(', '));
 const stage=path.join(workspace,names[0]),stagedWorkspace=await stagedResetLayout(stage);
 const stagedProjects=path.join(stagedWorkspace,'projects');
 const entries=await fs.readdir(stagedProjects,{withFileTypes:true});
 if(entries.some(entry=>!entry.isDirectory()||entry.isSymbolicLink()))
  throw Error('Interrupted Reset staging contains unexpected project entries. Review manually before recovery.');
 const madeRoot=!projects,installed=[];
 try{
  if(madeRoot)await fs.mkdir(projectRoot);
  await promoteStagedDirectory(path.join(stagedWorkspace,'.atgv'),path.join(workspace,'.atgv'));
  installed.push(path.join(workspace,'.atgv'));
  for(const entry of entries){
   const destination=path.join(projectRoot,entry.name);
   await promoteStagedDirectory(path.join(stagedProjects,entry.name),destination);
   installed.push(destination);
  }
 }catch(error){
  // These target names were absent at entry. Preserve staging; revert only
  // new recovery targets and do not destroy an existing user project.
  const issues=[];
  for(const target of installed.reverse())try{await fs.rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:150});}
  catch(rollback){issues.push(target+': '+rollback.message);}
  if(madeRoot)await fs.rmdir(projectRoot).catch(()=>{});
  throw Error('Interrupted Reset recovery stopped: '+error.message+(issues.length?'. Manually review partial targets: '+issues.join('; '):'. Original staging remains available.'),{cause:error});
 }
 // Cleanup failure does not invalidate a verified recovery. Preserve the
 // stage and report it rather than risking a second destructive Reset.
 const warnings=[];
 try{await fs.rm(stage,{recursive:true,force:true,maxRetries:3,retryDelay:150});}
 catch(error){warnings.push('Recovery staging retained at '+stage+': '+error.message);}
 return {projects:entries.length,warnings,stage};
}
async function replaceLocalWorkspace({workspace,registry,stage,stagedWorkspace,storageRoot,workspaceHash}){
 await checkOwnedWorkspaceLibrary(workspace);
 if(path.dirname(stage)!==workspace||stagedWorkspace!==path.join(stage,'workspace'))
  throw Error('Unsafe Reset staging path. No files were replaced.');
 await stagedResetLayout(stage);
 const atgv=path.join(workspace,'.atgv'),projects=path.join(workspace,'projects');
 const beforeAtgv=await pathEntry(atgv),beforeProjects=await pathEntry(projects);
 if(beforeAtgv)normalDir(beforeAtgv,'Existing .atgv');
 if(beforeProjects)normalDir(beforeProjects,'Existing projects');
 const backupDir=path.join(stage,'rollback');
 await fs.mkdir(backupDir,{recursive:false});
 const oldAtgv=path.join(backupDir,'original-atgv'),oldProjects=path.join(backupDir,'original-projects');
 const backups=[],installed=[],warnings=[];
 // No existing files are deleted before both replacement directories have
 // been staged and validated. Original directories stay available for rollback.
 try{
  if(beforeAtgv){await renameWithRetry(atgv,oldAtgv);backups.push([oldAtgv,atgv]);}
  if(beforeProjects){await renameWithRetry(projects,oldProjects);backups.push([oldProjects,projects]);}
  await promoteStagedDirectory(path.join(stagedWorkspace,'.atgv'),atgv);installed.push(atgv);
  await promoteStagedDirectory(path.join(stagedWorkspace,'projects'),projects);installed.push(projects);
  normalDir(await pathEntry(atgv),'Activated .atgv');
  normalDir(await pathEntry(projects),'Activated projects');
  const marker=JSON.parse(await fs.readFile(path.join(atgv,'atgv.workspace.json'),'utf8'));
  if(marker.managedBy!=='aia-my.atgv-aiatech-assist')throw Error('Activated .atgv ownership verification failed.');
 }catch(error){
  const issues=[];
  // Move new files aside without deleting them; keep staging for diagnosis.
  const rejected=path.join(stage,'uncommitted');
  await fs.mkdir(rejected,{recursive:true}).catch(e=>issues.push(e.message));
  for(const target of installed.reverse()){
   if(!await pathEntry(target))continue;
   try{await renameWithRetry(target,path.join(rejected,path.basename(target).replace(/^\./,'')));}
   catch(moveError){issues.push('Could not move partial '+target+': '+moveError.message);}
  }
  for(const [backup,target] of backups.reverse()){
   if(await pathEntry(target)){issues.push('Target remains occupied: '+target);continue;}
   try{await renameWithRetry(backup,target);}
   catch(restoreError){issues.push('Original data retained at '+backup+': '+restoreError.message);}
  }
  throw Error('Transactional Reset failed: '+error.message+(issues.length?'. Recovery needs review: '+issues.join('; '):'. Original workspace directories were restored.')+' Staging kept at '+stage,{cause:error});
 }
 // The replacement is now complete. Cache cleanup and staging deletion are
 // best-effort; their failure must not relabel a completed reset as incomplete.
 for(const target of [
  path.join(storageRoot,'projects',workspaceHash),
  path.join(storageRoot,'atlassian-ownership'),
  path.join(storageRoot,'library'),
  path.join(storageRoot,'sdlc-catalog'),
  stage
 ]){
  try{await fs.rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:150});}
  catch(error){warnings.push('Cleanup deferred for '+target+': '+error.message);}
 }
 return {warnings,stage};
}
module.exports={restoredProject,remoteCheckout,preview,checkOwnedWorkspaceLibrary,stageFreshWorkspace,replaceLocalWorkspace,recoverInterruptedReset,renameWithRetry,promoteStagedDirectory};
