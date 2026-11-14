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
    'Remove existing local project repositories and the downloaded SDLC Catalog; download fresh copies from configured remote GitHub sources.',
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
  lines.push(`SDLC Catalog: ${hasCatalog?'re-download from configured main':'not configured'}`);
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
async function replaceLocalWorkspace({workspace,registry,stage,stagedWorkspace,storageRoot,workspaceHash}){
  await checkOwnedWorkspaceLibrary(workspace);
  // No network requests or remote mutations occur beyond this point.
  await registry.resetFolder();
  await removeManagedWorkspaceLibrary(workspace);
  await fs.rename(path.join(stagedWorkspace,'.atgv'),path.join(workspace,'.atgv'));
  const source=path.join(stagedWorkspace,'projects');
  for(const item of await fs.readdir(source)){
    await fs.rename(path.join(source,item),path.join(workspace,'projects',item));
  }
  // Project caches are isolated to the current workspace; global account
  // settings, credentials, provider configurations, and extension preferences
  // are intentionally left untouched.
  await fs.rm(path.join(storageRoot,'projects',workspaceHash),{recursive:true,force:true});
  await fs.rm(path.join(storageRoot,'atlassian-ownership'),{recursive:true,force:true});
  await fs.rm(path.join(storageRoot,'sdlc-catalog'),{recursive:true,force:true});
  await fs.rm(stage,{recursive:true,force:true});
}
module.exports={restoredProject,remoteCheckout,preview,checkOwnedWorkspaceLibrary,stageFreshWorkspace,replaceLocalWorkspace};
