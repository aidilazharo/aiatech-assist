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
  throw Error('The Library repository is not a project code repository. Select a separate GitHub project repository in Settings.');
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
async function discoverCustomFolders(options={}){
 const root=await fs.realpath(options.projectRoot),parent=path.join(root,'repository');
 const stat=await fs.lstat(parent).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return [];
 if(!stat.isDirectory()||stat.isSymbolicLink()||path.relative(root,await fs.realpath(parent))!=='repository')throw Error('Unsafe project repository parent.');
 const entries=await fs.readdir(parent,{withFileTypes:true});
 if(entries.some(e=>e.name==='.git'||e.isFile()&&/^(?:package\.json|pom\.xml|[^/]+\.sln|[^/]+\.csproj|pyproject\.toml|go\.mod|Cargo\.toml|composer\.json|index\.html)$/i.test(e.name)))return [{root:parent,label:'repository',kind:'Project root'}];
 const folders=[];
 for(const entry of entries){
  if(!entry.isDirectory()||entry.isSymbolicLink()||entry.name.startsWith('.')||/^(?:node_modules|dist|build|coverage|vendor|__pycache__)$/i.test(entry.name))continue;
  const real=await fs.realpath(path.join(parent,entry.name));
  if(path.dirname(real)!==parent)continue;
  const children=await fs.readdir(real,{withFileTypes:true});
  folders.push({root:real,label:entry.name,kind:children.some(x=>x.name==='.git')?'Git repository':children.length?'Existing files':'Empty folder'});
 }
 return folders.sort((a,b)=>a.label.localeCompare(b.label));
}
async function chooseCustomFolder(state,projectId,options={}){
 const folders=await discoverCustomFolders(options);
 if(!folders.length)return '';
 const key='atgvAssist.selectedRepositoryFolder.'+projectId;
 const previous=state.get(key)||state.get('atgvAssist.localRepo.'+projectId);
 let selected;
 if(folders.length===1)selected=folders[0].root;
 else if(!options.forceChoose&&folders.some(x=>x.root===previous))selected=previous;
 else{
  if(typeof options.chooseFolder!=='function')throw Error('More than one project folder found. Select a repository folder.');
  selected=await options.chooseFolder(folders,previous);
  if(!folders.some(x=>x.root===selected))throw Error('Repository folder selection cancelled. No files were changed.');
 }
 if(typeof state.update==='function')await state.update(key,selected);
 return selected;
}
async function ensureCustom(state,projectId,developerGit,options={}){
 const owner=String(options.githubOwner||''),repoName=String(options.githubRepo||'');
 if(!state||!projectId||!options.projectRoot||
    !/^[A-Za-z0-9-]{1,39}$/.test(owner)||
    !/^[-.A-Za-z0-9_]{1,100}$/.test(repoName)||['.','..'].includes(repoName))
  throw Error('Choose a valid GitHub owner and project repository in Settings before Save Stack.');
 const catalog=String(options.catalogRepositoryUrl||'').trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
 if(catalog&&catalog[1].toLowerCase()===owner.toLowerCase()&&catalog[2].toLowerCase()===repoName.toLowerCase())
  throw Error('The Library is not a project source repository. Configure a separate project GitHub repository.');
 const root=await fs.realpath(options.projectRoot);
 const parent=path.join(root,'repository');
 await fs.mkdir(parent,{recursive:true});
 const parentReal=await fs.realpath(parent);
 const sub=path.relative(root,parentReal);
 if(sub!=='repository'||path.isAbsolute(sub))
  throw Error('Repository folder resolves outside the active ATGV project.');
 const dest=options.selectedFolder?path.resolve(options.selectedFolder):path.join(parentReal,repoName);
 if(options.selectedFolder&&!(await discoverCustomFolders(options)).some(x=>x.root===dest))throw Error('Selected repository folder is no longer available or safe.');
 let existing=await fs.lstat(dest).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
 if(existing&&(!existing.isDirectory()||existing.isSymbolicLink()))
  throw Error('Project repository destination is not a safe directory; no files were modified.');
 let mode='existing',checked=null;
 if(existing){
  const entries=await fs.readdir(dest);
  if(entries.length){
   // Never clone over or reset a populated folder. When only .git is present,
   // a verified fast-forward may restore missing tracked working-tree files.
   checked=await developerGit.repository(dest).catch(()=>null);
   if(!checked){
    if(!options.initializeExisting)throw Error('Repository folder has existing files but is not a valid Git checkout. Preserve those files and select another folder manually.');
    checked=await developerGit.initializeProjectGit(dest,options.githubBranch||'main');
    mode='initialized';
   }
   if(!checked.remote&&options.initializeExisting){
    checked=await developerGit.configureOrigin(dest,owner,repoName);
    mode='initialized';
   }
   if(!developerGit.matchesGithubRepo(checked.remote,owner,repoName))
    throw Error('Repository folder has an unexpected GitHub origin. Existing files were preserved.');
   // Opted-in bundled projects receive source and module archives from the
   // same origin branch. Pull only clean configured checkouts; never reset.
   if(entries.length>1&&checked.clean&&checked.sha&&checked.branch===(options.githubBranch||'main')&&
      !developerGit.localLogs?.()?.running){
    const policyPath=path.join(dest,'vendor','windows-x64','bundle-policy.json');
    const policy=await fs.readFile(policyPath,'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return null;throw error;});
    if(policy?.schema===1&&policy.required===true&&policy.platform==='win32'&&policy.arch==='x64'){
     const safePull=options.pull||require('./architect-custom-pull').pull;
     const result=await safePull(dest,{expectedSha:checked.sha,owner,name:repoName,driver:developerGit});
     checked=await developerGit.repository(dest);
     mode=result.updated?'pulled':'existing';
    }
   }
   if(entries.length===1&&entries[0]==='.git'){
    if(!checked.sha&&checked.clean&&typeof developerGit.hydrateUnbornCheckout==='function'){
     checked=await developerGit.hydrateUnbornCheckout(dest,owner,repoName,options.githubBranch||checked.branch||'main',{token:options.token||''});
     mode=checked.sha?'pulled':'initialized';
    }else{
    if(!checked.clean||!/^[a-f0-9]{40}$/i.test(String(checked.sha||'')))
     throw Error('Git checkout has no verified clean HEAD; no automatic pull attempted.');
    const safePull=options.pull||require('./architect-custom-pull').pull;
    const result=await safePull(dest,{expectedSha:checked.sha,owner,name:repoName,driver:developerGit});
    checked=await developerGit.repository(dest);
    mode=result.updated?'pulled':'existing';
    }
   }
  }else if(options.selectedFolder&&path.resolve(dest)!==path.resolve(parentReal,repoName)){
   checked=await developerGit.initializeProjectGit(dest,options.githubBranch||'main');
   checked=await developerGit.configureOrigin(dest,owner,repoName);
   if(typeof developerGit.hydrateUnbornCheckout==='function')checked=await developerGit.hydrateUnbornCheckout(dest,owner,repoName,options.githubBranch||'main',{token:options.token||''});
   mode=checked.sha?'pulled':'initialized';
  }else mode='cloned';
 }else{
  await fs.mkdir(dest);
  mode='cloned';
 }
 if(mode==='cloned'){
  // cloneConfigured accepts an existing EMPTY destination only for this flow.
  const clone=await developerGit.cloneConfigured(parentReal,owner,repoName,
   options.githubBranch||'',{allowExistingEmpty:true,...(options.token?{token:options.token}:{})});
  checked=await developerGit.repository(clone.root);
 }
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
// A catalog stack starts in its own new project-local Git folder. Never clone or replace an existing application.
async function ensureLocal(state,projectId,developerGit,{projectRoot,stackId,generation=0}={}){
 if(!/^[a-z][a-z0-9-]{0,48}$/.test(projectId)||!/^[a-z][a-z0-9-]{0,48}$/.test(stackId)||stackId==='custom'||!Number.isSafeInteger(generation)||generation<0||generation>9999)throw Error('Invalid local stack identity.');
 const root=await fs.realpath(projectRoot),parent=path.join(root,'repository');
 await fs.mkdir(parent,{recursive:true});
 const parentReal=await fs.realpath(parent);
 if(path.relative(root,parentReal)!=='repository'||(await fs.lstat(parent)).isSymbolicLink())throw Error('Unsafe project repository parent.');
 const folder=path.join(parentReal,projectId+'-'+stackId+'-g'+generation);
 await fs.mkdir(folder).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const st=await fs.lstat(folder);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Local stack destination is not a regular directory.');
 const entries=await fs.readdir(folder);
 let repo;
 if(!entries.length||(entries.every(n=>['.git','.DS_Store'].includes(n))&&entries.includes('.git')&&!(await developerGit.repository(folder)).sha))repo=await developerGit.initLocalBaseline(folder,'main');
 else{
  repo=await developerGit.repository(folder);
  if(repo.remote)throw Error('Local stack folder already has a remote; select a new generation or use Custom Stack.');
  if(repo.branch!=='main'&&!repo.branch.startsWith('bootstrap/'+stackId)&&!repo.branch.startsWith('migration/'+stackId+'-catalog-'))throw Error('Existing local stack branch is not a known ATGV branch.');
  if(repo.branch==='main'&&(!repo.clean||entries.some(n=>!['.git','README.md','.DS_Store'].includes(n))))throw Error('Existing local baseline contains unrelated changes.');
  if(repo.branch!=='main'){
   const marker=JSON.parse(await fs.readFile(path.join(folder,'atgv.bootstrap.json'),'utf8'));
   if(marker.schema!==1||marker.stacks?.length!==1||marker.stacks[0]!==stackId)throw Error('Local starter manifest does not match the selected stack.');
  }
 }
 if(path.resolve(repo.root)!==path.resolve(folder)||repo.remote)throw Error('Local project repository identity verification failed.');
 return repo.root;
}
async function selectLocal(state,projectId,root){
 await state.update('atgvAssist.localRepo.'+projectId,root);
 await state.update('atgvAssist.bootstrapRepo.'+projectId,root);
}
module.exports={resolve,ensure,ensureCustom,ensureLocal,selectLocal,discoverCustomFolders,chooseCustomFolder};
