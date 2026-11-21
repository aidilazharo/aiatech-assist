'use strict';
// The Settings project checkout is the only bootstrap target. A configured
// GitHub owner/repository is not by itself a local Git checkout.
const fs=require('node:fs/promises');
const path=require('node:path');
async function resolve(state,projectId,developerGit,options={}){
 if(!state||!projectId||!developerGit?.repository)throw Error('Cannot resolve a project Git repository.');
 const localKey='atgvAssist.localRepo.'+projectId;
 const sources=options.projectRoot?
  [['Settings / developer',state.get(localKey)],['Architect bootstrap',state.get('atgvAssist.bootstrapRepo.'+projectId)]]:
  [['Architect bootstrap',state.get('atgvAssist.bootstrapRepo.'+projectId)],['Settings / developer',state.get(localKey)]];
 if(options.projectRoot&&options.githubRepo){
  const root=await fs.realpath(options.projectRoot);
  const folder=path.join(root,'repository',String(options.githubRepo));
  // Never follow a repo symlink or accept a Git directory outside this project.
  const stat=await fs.lstat(folder).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(stat?.isDirectory()&&!stat.isSymbolicLink())sources.push(['Project repository folder',folder]);
 }
 const checked=new Set(),failures=[];
 for(const [label,folder] of sources){
  if(!folder||checked.has(folder))continue;checked.add(folder);
  try{
   const repo=await developerGit.repository(folder);
   if(options.projectRoot){
    const root=await fs.realpath(options.projectRoot),relative=path.relative(root,repo.root);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Repository is outside the project folder.');
   }
   if(options.githubOwner&&options.githubRepo&&repo.remote&&
      !developerGit.matchesGithubRepo(repo.remote,options.githubOwner,options.githubRepo))
     throw Error('Local checkout has a different GitHub origin.');
   if(state.get(localKey)!==repo.root&&typeof state.update==='function')await state.update(localKey,repo.root);
   return repo.root;
  }catch(error){failures.push(label+': '+error.message);}
 }
 if(failures.length)throw Error('No usable project Git checkout. '+failures.join(' · ')+' . Re-select the local checkout or Clone Configured Repository in Settings → GitHub first.');
 throw Error('The GitHub repository is configured, but no local checkout is selected. Use Settings → GitHub → Clone Configured Repository; then Save Stack.');
}
// Save Stack may bootstrap a *missing* project checkout. An existing, invalid
// checkout must never be silently replaced or retargeted.
async function ensure(state,projectId,developerGit,options={}){
 const owner=String(options.githubOwner||''),repoName=String(options.githubRepo||'');
 if(!owner||!repoName||!options.projectRoot)throw Error('Configure a project GitHub repository and open an ATGV project before Save Stack.');
 // Compare the configured catalog repository dynamically, never a user's account name.
 const catalogUrl=String(options.catalogRepositoryUrl||'').trim();
 const catalogIdentity=catalogUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i);
 if(catalogIdentity&&catalogIdentity[1].toLowerCase()===owner.toLowerCase()&&catalogIdentity[2].toLowerCase()===repoName.toLowerCase())
  throw Error('The SDLC Catalog repository is not a project code repository. Select a separate GitHub project repository in Settings.');
 try{return await resolve(state,projectId,developerGit,options);}
 catch(error){if(!String(error.message).startsWith('The GitHub repository is configured, but no local checkout is selected.'))throw error;}
 const root=await fs.realpath(options.projectRoot),parent=path.join(root,'repository');
 await fs.mkdir(parent,{recursive:true});
 const parentReal=await fs.realpath(parent),relative=path.relative(root,parentReal);
 if(relative!=='repository'||path.isAbsolute(relative))throw Error('Unsafe project repository folder; automatic clone blocked.');
 const destination=path.join(parentReal,repoName);
 const existing=await fs.lstat(destination).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(existing)throw Error('A project checkout path already exists but is not a valid configured Git repository. Review it manually; no files were overwritten.');
 const cloned=await developerGit.cloneConfigured(parentReal,owner,repoName,options.githubBranch||'');
 const checked=await developerGit.repository(cloned.root);
 const inside=path.relative(root,checked.root);
 if(!inside||inside.startsWith('..')||path.isAbsolute(inside)||!developerGit.matchesGithubRepo(checked.remote,owner,repoName))
  throw Error('Cloned repository identity or project location verification failed.');
 if(typeof state.update==='function'){
  await state.update('atgvAssist.localRepo.'+projectId,checked.root);
  await state.update('atgvAssist.bootstrapRepo.'+projectId,checked.root);
 }
 return checked.root;
}
// Custom Stack Save creates only an absent/empty project repository folder,
// then clones the configured GitHub source. Never overwrite a nonempty folder,
// accept symlinks, auto-reset a checkout, or run downloaded project code.
async function ensureCustom(state,projectId,developerGit,options={}){
 const owner=String(options.githubOwner||''),repoName=String(options.githubRepo||'');
 if(!state||!projectId||!options.projectRoot||
    !/^[A-Za-z0-9-]{1,39}$/.test(owner)||
    !/^[-.A-Za-z0-9_]{1,100}$/.test(repoName)||['.','..'].includes(repoName))
  throw Error('Choose a valid GitHub owner and project repository in Settings before Save Stack.');
 const catalog=String(options.catalogRepositoryUrl||'').trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
 if(catalog&&catalog[1].toLowerCase()===owner.toLowerCase()&&catalog[2].toLowerCase()===repoName.toLowerCase())
  throw Error('The SDLC Catalog is not a project source repository. Configure a separate project GitHub repository.');
 const root=await fs.realpath(options.projectRoot);
 const parent=path.join(root,'repository');
 await fs.mkdir(parent,{recursive:true});
 const parentReal=await fs.realpath(parent);
 const sub=path.relative(root,parentReal);
 if(sub!=='repository'||path.isAbsolute(sub))
  throw Error('Repository folder resolves outside the active ATGV project.');
 const dest=path.join(parentReal,repoName);
 let existing=await fs.lstat(dest).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
 if(existing&&(!existing.isDirectory()||existing.isSymbolicLink()))
  throw Error('Project repository destination is not a safe directory; no files were modified.');
 let mode='existing';
 if(existing){
  const entries=await fs.readdir(dest);
  if(entries.length){
   // An existing valid checkout is read-only at Save Stack. Its content can
   // only be updated by the separately requested Pull Repository action.
   const checked=await developerGit.repository(dest).catch(()=>null);
   if(!checked)throw Error('Repository folder has existing files but is not a valid Git checkout. Preserve those files and select another folder manually.');
   if(!developerGit.matchesGithubRepo(checked.remote,owner,repoName))
    throw Error('Repository folder has an unexpected GitHub origin. Existing files were preserved.');
  }else mode='cloned';
 }else{
  await fs.mkdir(dest);
  mode='cloned';
 }
 let checked;
 if(mode==='cloned'){
  // cloneConfigured accepts an existing EMPTY destination only for this flow.
  const clone=await developerGit.cloneConfigured(parentReal,owner,repoName,
   options.githubBranch||'',{allowExistingEmpty:true});
  checked=await developerGit.repository(clone.root);
 }else checked=await developerGit.repository(dest);
 const relative=path.relative(root,checked.root);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||
    !developerGit.matchesGithubRepo(checked.remote,owner,repoName)||
    path.resolve(checked.root)!==path.resolve(dest))
  throw Error('The project checkout path or configured GitHub origin did not pass verification.');
 if(typeof state.update==='function'){
  await state.update('atgvAssist.localRepo.'+projectId,checked.root);
  await state.update('atgvAssist.bootstrapRepo.'+projectId,checked.root);
 }
 return {root:checked.root,branch:checked.branch,sha:checked.sha,mode};
}
module.exports={resolve,ensure,ensureCustom};
