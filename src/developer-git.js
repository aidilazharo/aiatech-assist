'use strict';
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const diagnostic = require('./stack-process-diagnostics');
const {nodeExecutable,npmCommand,mavenCommand} = require('./platform-process');
const run = promisify(execFile);
const {gitFailure}=require('./github-credential-validator');
// Scope the supplied credential to github.com via process-local Git config; never persist it.
function gitCredentialEnvironment(token){
 if(!token)return {};
 const value=String(token);if(!/^[^\s\x00-\x1f\x7f]{1,512}$/.test(value))throw Error('Invalid GitHub credential.');
 return {GIT_CONFIG_COUNT:'3',GIT_CONFIG_KEY_2:'http.followRedirects',GIT_CONFIG_VALUE_2:'false',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:'',GIT_CONFIG_KEY_1:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_1:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+value).toString('base64')};
}
const KEY = /^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/;
const BRANCH = /^[a-z0-9][a-z0-9/_-]{0,110}$/;
function jiraKey(input) { const key = String(input || '').trim().toUpperCase(); if (!KEY.test(key))
    throw Error('Enter a valid Jira issue key (e.g. CLAIM-101).'); return key; }
function branchName(key, summary = '') { const safe = String(summary).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45).replace(/-$/, ''); return `feature/${jiraKey(key).toLowerCase()}${safe ? '-' + safe : ''}`; }
async function git(root, ...args) {
    const { stdout, stderr } = await run('git', ['-C', root, ...args], { timeout: 45000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } });
    return (stdout || stderr || '').trim();
}
async function remoteGit(root,args,token=''){
 try{const {stdout,stderr}=await run('git',['-C',root,...args],{timeout:60000,maxBuffer:2*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',...gitCredentialEnvironment(token)}});return (stdout||stderr||'').trim();}
 catch(error){throw Error(gitFailure(error));}
}
async function probeRemote(owner,name,branch='main',{token=''}={}){
 if(!matchesGithubRepo('https://github.com/'+owner+'/'+name+'.git',owner,name))throw Error('Invalid GitHub repository identity.');
 const selected=require('./projects').validGithubBranch(branch);
 if(!selected)throw Error('A branch is required for the Git transport probe.');
 try{
  const result=await run('git',['ls-remote','--exit-code','--heads','https://github.com/'+owner+'/'+name+'.git','refs/heads/'+selected],{timeout:20000,maxBuffer:262144,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',...gitCredentialEnvironment(token)}});
  if(!/^[a-f0-9]{40,64}\s+refs\/heads\//m.test(result.stdout||''))throw Error('Remote branch not found.');
  return {ok:true,method:token?'selected-token':'local-git'};
 }catch(error){return {ok:false,message:gitFailure(error)};}
}
async function checkedPushRemote(root,repo,owner,name,token){
 if(!token)return 'origin';
 if(!matchesGithubRepo(repo.remote,owner,name))throw Error('Origin does not match the configured GitHub repository.');
 const push=await git(root,'remote','get-url','--push','--all','origin');
 if(push.split('\n').length!==1||!matchesGithubRepo(push,owner,name))throw Error('Push origin does not match the configured GitHub repository.');
 if(!/^https:\/\/github\.com\//i.test(push))throw Error('The selected API credential requires an HTTPS origin; SSH uses separate credentials.');
 return 'origin';
}
async function repository(root) {
    if (!root || typeof root !== 'string')
        throw Error('Choose a local repository folder.');
    const real = await fs.realpath(root);
    const st = await fs.lstat(real);
    if (!st.isDirectory())
        throw Error('Not a repository folder.');
    const top = await git(real, 'rev-parse', '--show-toplevel').catch(() => null);
    if (!top)
        throw Error('The selected folder does not contain a Git repository.');
    if (path.resolve(top) !== path.resolve(real))
        throw Error('Select the repository root, not a nested directory.');
    const status = await git(real, 'status', '--porcelain');
    const branch = await git(real, 'symbolic-ref', '--quiet', '--short', 'HEAD').catch(() => '');
    const remote = await git(real, 'remote', 'get-url', 'origin').catch(() => '');
    const sha = await git(real, 'rev-parse', '--verify', 'HEAD').catch(() => '');
    return { root: real, branch, remote, sha, clean: !status, changed: status.split('\n').filter(Boolean).slice(0, 40) };
}
async function findLocalStoryBranch(root,key) {
  const repo=await repository(root),prefix='feature/'+jiraKey(key).toLowerCase();
  const output=await git(repo.root,'for-each-ref','--format=%(refname:short)','refs/heads/'+prefix+'*');
  const branches=output.split('\n').filter(name=>name&&(name===prefix||name.startsWith(prefix+'-')));
  if(branches.length>1)throw Error('Multiple local branches reference this Jira story. Choose one manually.');
  return branches[0]||null;
}
async function findStoryBranch(root, key) {
    const repo = await repository(root);
    if (!repo.remote)
        throw Error('Origin remote is not configured.');
    const prefix = 'feature/' + jiraKey(key).toLowerCase();
    const output = await git(root, 'ls-remote', '--heads', 'origin', 'refs/heads/' + prefix + '*');
    const names = output.split('\n').map(line => line.split('refs/heads/')[1]).filter(name => name && (name === prefix || name.startsWith(prefix + '-')));
    if (names.length > 1)
        throw Error('Multiple remote branches reference this Jira story. Resolve duplicates manually.');
    return names[0] || null;
}
function matchesGithubRepo(remote, owner, name) {
    if (!/^[A-Za-z0-9-]{1,39}$/.test(String(owner || '')) || !/^[-.A-Za-z0-9_]{1,100}$/.test(String(name || '')))
        return false;
    const target = String(owner + '/' + name).toLowerCase();
    const match = String(remote || '').match(/^(?:https:\/\/github\.com\/|git@github\.com:)([^?#]+?)(?:\.git)?\/?$/i);
    return !!match && match[1].toLowerCase() === target;
}
async function createBranch(root, key, { summary = '', base = 'main' } = {}) {
    const repo = await repository(root);
    if (!repo.clean)
        throw Error('Uncommitted files detected. Commit, stash manually or use a separate Git worktree.');
    if (!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,110}$/.test(base) || base.includes('..'))
        throw Error('Invalid integration branch.');
    if (!repo.remote)
        throw Error('Configure an origin remote before creating a story branch.');
    const branch = branchName(key, summary);
    if (!BRANCH.test(branch))
        throw Error('Invalid feature branch.');
    const linked = await findStoryBranch(root, key);
    if (linked)
        throw Error('Story branch ' + linked + ' already exists remotely. Resume it instead.');
    await git(root, 'fetch', '--no-tags', 'origin', base);
    const target = 'refs/remotes/origin/' + base;
    const baseSha = await git(root, 'rev-parse', '--verify', target);
    const local = await git(root, 'show-ref', '--verify', 'refs/heads/' + branch).then(() => true, () => false);
    const remote = await git(root, 'ls-remote', '--heads', 'origin', 'refs/heads/' + branch);
    if (local || remote)
        throw Error('Story branch already exists. Resume the existing branch instead of creating a duplicate.');
    await git(root, 'switch', '--create', branch, baseSha);
    const head = await git(root, 'rev-parse', 'HEAD');
    return { branch, base, baseSha, head, root: repo.root, action: 'created' };
}
async function resumeBranch(root, branch) {
    if (!BRANCH.test(String(branch || '')) || branch.includes('..'))
        throw Error('Invalid story branch.');
    const repo = await repository(root);
    if (!repo.clean)
        throw Error('Uncommitted changes found. Save work before switching branches.');
    await git(root, 'fetch', '--no-tags', 'origin');
    const local = await git(root, 'show-ref', '--verify', 'refs/heads/' + branch).then(() => true, () => false);
    if (local)
        await git(root, 'switch', branch);
    else {
        const remote = await git(root, 'show-ref', '--verify', 'refs/remotes/origin/' + branch).then(() => true, () => false);
        if (!remote)
            throw Error('Linked branch was not found locally or on origin.');
        await git(root, 'switch', '--track', '-c', branch, 'origin/' + branch);
    }
    return { ...await repository(root), action: 'resumed' };
}
async function initLocalBaseline(root, base = 'main') {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(base))
        throw Error('Invalid baseline branch.');
    const real = await fs.realpath(root), gitDir = path.join(real, '.git');
    const already = await fs.lstat(gitDir).then(s => s.isDirectory(), () => false);
    if (already) {
        const current = await git(real, 'rev-parse', '--verify', 'HEAD').catch(() => null);
        if (current)
            throw Error('Git history already exists. Preserve the existing repository and commit.');
        const changes = (await fs.readdir(real)).filter(name => name !== '.git' && name !== '.DS_Store');
        if (changes.length)
            throw Error('Initialize the cloned empty repository before adding application files.');
        await git(real, 'symbolic-ref', 'HEAD', 'refs/heads/' + base);
    }
    else {
        const entries = (await fs.readdir(real)).filter(name => name !== '.DS_Store');
        if (entries.length)
            throw Error('Initialize an empty folder only; do not overwrite an existing project.');
        await git(real, 'init', '-b', base);
    }
    await fs.writeFile(path.join(real, 'README.md'), '# ATGV Project\n\nInitial commit for approved project bootstrap.\n', { flag: 'wx' });
    await git(real, 'add', 'README.md');
    await git(real, 'commit', '-m', 'chore: initialize ATGV project');
    return repository(real);
}
async function commitBootstrap(root, stackIds) {
    const repo = await repository(root), base = repo.branch;
    if (!['main', 'master', 'develop', 'development'].includes(base))
        throw Error('Bootstrap must start from the configured integration branch.');
    const { skeletonFiles } = require('./project-skeleton');
    const files = await skeletonFiles(stackIds,repo.root);
    const tracked = [];
    for (const file of Object.keys(files)) {
        if (file === 'README.md')
            continue;
        const target = path.join(repo.root, file);
        if (await fs.stat(target).then(s => s.isFile(), () => false))
            tracked.push(file);
        else
            throw Error('Missing skeleton file ' + file);
    }
    const branch = 'bootstrap/initial-tech-stack';
    if (await git(repo.root, 'show-ref', '--verify', 'refs/heads/' + branch).then(() => true, () => false))
        throw Error('Existing bootstrap branch found. Resume it rather than making another.');
    await git(repo.root, 'switch', '-c', branch);
    await git(repo.root, 'add', '--', ...tracked);
    const staged = await git(repo.root, 'diff', '--cached', '--name-only');
    if (!staged)
        throw Error('No skeleton changes were staged.');
    await git(repo.root, 'commit', '-m', 'chore: bootstrap ' + stackIds.join('+') + ' application skeleton');
    return { ...await repository(repo.root), base, branch, staged: staged.split('\n') };
}
async function configureOrigin(root, owner, name) {
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[-.a-zA-Z0-9_]{1,100}$/.test(name) || name === '.' || name === '..')
        throw Error('Invalid GitHub repository identity.');
    const repo = await repository(root);
    if (repo.remote)
        throw Error('An origin remote already exists. It will not be overwritten.');
    const remote = `https://github.com/${owner}/${name}.git`;
    await git(repo.root, 'remote', 'add', 'origin', remote);
    return { ...await repository(root), message: 'Origin configured.' };
}
async function publishBootstrap(root, base = 'main', {token='',owner='',name=''}={}) {
    const repo = await repository(root);
    if (repo.branch !== 'bootstrap/initial-tech-stack')
        throw Error('Checkout the bootstrap branch before publishing.');
    if (!repo.clean)
        throw Error('Resolve uncommitted changes before publishing bootstrap.');
    if (!repo.remote)
        throw Error('Set an origin remote for the target GitHub repository.');
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(base))
        throw Error('Invalid integration branch.');
    const localBase = await git(root, 'rev-parse', '--verify', 'refs/heads/' + base);
    const origin=await checkedPushRemote(root,repo,owner,name,token);
    const remoteBase = await remoteGit(root,['ls-remote','--heads',origin,'refs/heads/'+base],token);
    if (remoteBase && remoteBase.split(/\s/)[0] !== localBase)
        throw Error('Remote integration branch changed. Review and reconcile before publishing.');
    if (!remoteBase)
        await remoteGit(root,['push',origin,base],token);
    await remoteGit(root,['push','--set-upstream',origin,repo.branch],token);
    return { ...repo, base, baseSha: localBase, published: true };
}
// Initialize Git metadata only. Never stage, commit, delete or publish existing files.
async function initializeProjectGit(root,base='main'){
    const selected=require('./projects').validGithubBranch(base);
    if(!selected)throw Error('Invalid initial Git branch.');
    const stat=await fs.lstat(root);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular project directory.');
    const real=await fs.realpath(root);
    const metadata=await fs.lstat(path.join(real,'.git')).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
    if(metadata){
        if(metadata.isSymbolicLink())throw Error('Git metadata cannot be a symlink.');
        return repository(real);
    }
    const ancestor=await git(real,'rev-parse','--show-toplevel').catch(()=>null);
    if(ancestor)throw Error('Project directory belongs to another Git repository; select its root.');
    await git(real,'init','-b',selected);
    return repository(real);
}
// Empty initialized checkouts may adopt a verified remote branch without
// resetting or overwriting any local files. A populated checkout is not eligible.
async function hydrateUnbornCheckout(root,owner,name,branch='main',{token=''}={}){
    const repo=await repository(root);
    if(repo.sha||!repo.clean||!repo.branch||!matchesGithubRepo(repo.remote,owner,name))
        throw Error('Only a clean unborn checkout with the configured origin can be hydrated.');
    const entries=await fs.readdir(repo.root);
    if(entries.some(entry=>entry!=='.git'))throw Error('Existing files must be preserved; automatic checkout blocked.');
    const selected=require('./projects').validGithubBranch(branch||repo.branch);
    if(!selected)throw Error('Invalid configured Git branch.');
    const refs=await remoteGit(repo.root,['ls-remote','--refs','origin'],token);
    if(!refs.trim())return repo;
    const expected=refs.split('\n').find(line=>line.endsWith('\trefs/heads/'+selected))?.split(/\s+/)[0];
    if(!/^[a-f0-9]{40,64}$/.test(expected||''))throw Error('Configured remote branch is missing; review repository settings.');
    await remoteGit(repo.root,['fetch','--no-tags','origin','refs/heads/'+selected],token);
    if(await git(repo.root,'rev-parse','--verify','FETCH_HEAD')!==expected)throw Error('Remote branch changed during fetch; retry.');
    const latest=await repository(repo.root);
    if(latest.sha||!latest.clean||(await fs.readdir(repo.root)).some(entry=>entry!=='.git'))throw Error('Local files changed during fetch; checkout blocked.');
    await git(repo.root,'switch','-c',selected,'FETCH_HEAD');
    return repository(repo.root);
}
async function cloneConfigured(parent, owner, name, branch = '', {allowExistingEmpty=false,token=''} = {}) {
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[-.a-zA-Z0-9_]{1,100}$/.test(name) || name === '.' || name === '..')
        throw Error('Invalid GitHub repository identity.');
    const root = await fs.realpath(parent), dest = path.join(root, name);
    const existing=await fs.lstat(dest).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
    if(existing){
        if(!allowExistingEmpty||!existing.isDirectory()||existing.isSymbolicLink()||
           (await fs.readdir(dest)).length!==0)
            throw Error('Clone target exists and is not an explicitly approved empty directory. No files were overwritten.');
    }
    const address = `https://github.com/${owner}/${name}.git`;
    const { validGithubBranch } = require('./projects');
    const selected=validGithubBranch(branch);
    // --branch fails against a repository with no refs. Probe only to
    // distinguish a verified empty remote from a missing configured branch.
    let cloneBranch=selected;
    if(selected){
        const refs=await remoteGit(root,['ls-remote','--refs',address],token);
        if(!refs.trim())cloneBranch='';
    }
    try{await run('git', ['clone', ...(cloneBranch?['--branch',cloneBranch]:[]), '--', address, dest], { cwd: root, timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', ...gitCredentialEnvironment(token) } });}
    catch(error){throw Error(gitFailure(error));}
    const cloned=await repository(dest);
    if(selected&&!cloneBranch){
        if(cloned.sha)throw Error('Remote acquired commits during clone; review the checked-out branch.');
        await git(dest,'symbolic-ref','HEAD','refs/heads/'+selected);
        return repository(dest);
    }
    return cloned;
}
async function pushStory(root, key,{token='',owner='',name=''}={}) {
    const repo = await repository(root), prefix = 'feature/' + jiraKey(key).toLowerCase();
    if (!(repo.branch === prefix || repo.branch.startsWith(prefix + '-')))
        throw Error('Checked-out branch does not match the selected Jira story.');
    if (!repo.clean)
        throw Error('Commit or stash your local changes before pushing.');
    if (!repo.remote)
        throw Error('Origin remote is not configured.');
    const origin=await checkedPushRemote(root,repo,owner,name,token);
    await remoteGit(root,['push','--set-upstream',origin,repo.branch],token);
    return repository(root);
}
async function inspectScripts(root) {
    const repo = await repository(root);
    // Discover real npm/.NET/Maven application folders, including common
    // multi-app repositories such as ReactTS_Frontend + NestJS_Backend.
    // Never recurse through dependency trees, symlinks, Git internals or docs.
    const locations = new Set(['']);
    const excluded = new Set(['node_modules','dist','build','coverage','docs','test','tests','e2e','src','scripts','public','assets','vendor','fixtures','.git','.atgv']);
    const workspaceContainers = new Set(['apps','services','packages','modules','projects','applications','frontend','backend','client','server']);
    const acceptable = name => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(name) && !excluded.has(name.toLowerCase());
    const children = async folder => (await fs.readdir(folder,{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error)))
        .filter(entry=>entry.isDirectory() && !entry.isSymbolicLink() && acceptable(entry.name)).slice(0,80);
    for (const entry of await children(repo.root)) {
        locations.add(entry.name);
        if (workspaceContainers.has(entry.name.toLowerCase()))
            for (const child of await children(path.join(repo.root,entry.name)))
                locations.add(entry.name+'/'+child.name);
    }
    const items = [];
    for (const relative of locations) {
        const folder = path.resolve(repo.root,relative);
        const stats = await fs.lstat(folder).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
        if(!stats?.isDirectory()||stats.isSymbolicLink())continue;
        const real=await fs.realpath(folder);
        if(real!==repo.root&&!real.startsWith(repo.root+path.sep))continue;
        const packageFile = path.join(real, 'package.json');
        let pkg = null;
        try {
            pkg = JSON.parse(await fs.readFile(packageFile, 'utf8'));
        }
        catch (e) {
            if (e.code !== 'ENOENT')throw e;
        }
        if (pkg) {
            const scripts = Object.keys(pkg.scripts || {});
            const supported = scripts.filter(s => ['dev', 'start:dev', 'start', 'test', 'build'].includes(s));
            items.push({ relative, kind: 'npm', scripts:supported,
                installed: !!await fs.stat(path.join(real,'node_modules')).then(x=>x.isDirectory(),()=>false) });
        }
        else if (await fs.readdir(real).then(x=>x.some(n=>n.endsWith('.csproj')),()=>false))
            items.push({ relative, kind: 'dotnet', scripts: ['build', 'test', 'run'], installed: true });
        else if (await fs.stat(path.join(real,'pom.xml')).then(()=>true,()=>false))
            items.push({ relative, kind: 'maven', scripts: ['build', 'test', 'run'], installed: true });
    }
    return {repo,targets:items};
}
function approvedCommand(target, operation, offlinePack=null) {
    if (!['test', 'build', 'run'].includes(operation))
        throw Error('Unsupported local operation.');
    if (target.kind === 'npm') {
        const script = operation === 'run' ? (target.scripts.includes('dev') ? 'dev' : target.scripts.includes('start:dev') ? 'start:dev' : 'start') : operation;
        if (!target.scripts.includes(script))
            throw Error('Project does not define a ' + script + ' script.');
        if (!target.installed)
            throw Error('Dependencies are not installed. Review the project and run the approved install procedure first.');
        return npmCommand(['run', script]);
    }
    if (target.kind === 'dotnet')
        return { bin: 'dotnet', args: offlinePack ? (operation==='test'?['test','tests/Atgv.Tests/Atgv.Tests.csproj','--no-restore']:[operation==='run'?'run':'build','--no-restore']) : operation === 'test' ? ['test'] : [operation === 'run' ? 'run' : 'build'] };
    if (target.kind === 'maven')
        return mavenCommand([...(offlinePack?['-o']:[]),...(operation === 'test' ? ['test'] : operation === 'build' ? ['package'] : ['spring-boot:run'])]);
    throw Error('Unsupported project runtime.');
}
async function executeLocal(root, { relative = '', operation = 'test', onDiagnostic = async()=>{} } = {}) {
    const info = await inspectScripts(root), target = info.targets.find(t => t.relative === relative);
    if (!target)
        throw Error('No matching application was found in the repository.');
    if (operation === 'run')
        throw Error('Use the tracked application process for Run Locally.');
    const cwd = path.join(info.repo.root, target.relative);
    const libraryOffline=require('./library-offline-dependencies'),offlinePack=await libraryOffline.locate(info.repo.root,cwd);
    const cmd = approvedCommand(target, operation,offlinePack);
    const at = new Date().toISOString(), head = info.repo.sha;
    const offline = {...libraryOffline.env(offlinePack),...(target.kind==='npm'?await require('./windows-dependency-bundle').offlineEnv(info.repo.root,cwd):{})};
    try {
        const { stdout, stderr } = await run(cmd.bin, cmd.args, { cwd, timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false,env:{...process.env,...offline} });
        const details=diagnostic.capture({stage:operation,bin:cmd.bin,args:cmd.args,cwd,stdout,stderr,exitCode:0});
        await onDiagnostic(details);
        return { passed: true, operation, head, at, logs: (stdout + '\n' + stderr).slice(-20000), diagnosticLogs:details, relative };
    }
    catch (e) {
        const details=diagnostic.capture({stage:operation,bin:cmd.bin,args:cmd.args,cwd,stdout:e.stdout,stderr:e.stderr,error:e});
        await onDiagnostic(details);
        return { passed: false, operation, head, at, logs: ((e.stdout || '') + '\n' + (e.stderr || '') + '\n' + e.message).slice(-96000), diagnosticLogs:details, relative };
    }
}
// Legacy scaffolds pin the Vite/Angular API proxy to 3001. Set a runtime-only
// proxy overlay instead of editing approved/committed source or stopping the port
// owner. The overlay is ignored in this checkout's .git/info/exclude.
async function createRuntimeProxyOverlay(repoRoot,cwd,apiPort,viteSource){
 if(apiPort===null||apiPort===3001||viteSource.includes('process.env.API_PORT'))return null;
 const vite=!!viteSource;
 const angular=!vite&&!!(await fs.readFile(path.join(cwd,'proxy.conf.json'),'utf8').catch(()=>''));
 if(!vite&&!angular)throw Error('This application has no supported runtime API proxy configuration. Preserve its source and use a verified stack migration.');
 const gitExclude=await git(repoRoot,'rev-parse','--git-path','info/exclude');
 const excludePath=path.isAbsolute(gitExclude)?gitExclude:path.join(repoRoot,gitExclude);
 const old=await fs.readFile(excludePath,'utf8').catch(error=>error.code==='ENOENT'?'':Promise.reject(error));
 const marker='vite.config.atgv-runtime-*.mts';
 const markerNg='proxy.atgv-runtime-*.json';
 if(!old.includes(marker)||!old.includes(markerNg)){
  await fs.mkdir(path.dirname(excludePath),{recursive:true});
  await fs.appendFile(excludePath,(old.endsWith('\n')?'':'\n')+
   '# ATGV generated untracked preview proxy overlays\n'+
   (!old.includes(marker)?marker+'\n':'')+(!old.includes(markerNg)?markerNg+'\n':''));
 }
 const name=vite?'vite.config.atgv-runtime-'+crypto.randomUUID()+'.mts':'proxy.atgv-runtime-'+crypto.randomUUID()+'.json';
 const location=path.join(cwd,name);
 const content=vite?
  "import original from './vite.config.ts';\n"+
  "import { mergeConfig } from 'vite';\n"+
  "export default async environment => mergeConfig((typeof original==='function'?await original(environment):await original)||{}, "+
  JSON.stringify({server:{proxy:{'/api':{target:'http://127.0.0.1:'+apiPort,secure:false,changeOrigin:false}}}})+");\n"
  :JSON.stringify({'/api':{target:'http://127.0.0.1:'+apiPort,secure:false,changeOrigin:false}},null,2)+'\n';
 await fs.writeFile(location,content,{flag:'wx',mode:0o600});
 return {file:name,location,kind:vite?'vite':'angular'};
}
// Use runtime-only CLI port arguments for the known ATGV catalog starters.
// No package.json or approved source file is modified by port selection.
async function previewCommand(cmd,target,cwd,previewUrl,proxyOverlay=null){
 if(!previewUrl)return cmd;
 const endpoint=new URL(previewUrl),port=Number(endpoint.port);
 if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||!Number.isInteger(port)||port<1||port>65535)
  throw Error('Preview override requires a valid localhost HTTP port.');
 if(target.kind!=='npm')return cmd;
 const pkg=JSON.parse(await fs.readFile(path.join(cwd,'package.json'),'utf8'));
 const scriptName=target.scripts.includes('dev')?'dev':target.scripts.includes('start:dev')?'start:dev':'start';
 const script=String(pkg.scripts?.[scriptName]||'').trim();
 const known=script.match(/^concurrently -k "(vite|ng serve) --host 127\.0\.0\.1 --port (\d+)" "(node server\/index\.mjs)"$/);
 if(known){
  const frontend=known[1]+' --host 127.0.0.1 --port '+port+(known[1]==='vite'?' --strictPort':'')+
   (proxyOverlay?' '+(known[1]==='vite'?'--config ':'--proxy-config ')+proxyOverlay.file:'');
  return npmCommand(['exec','--offline','--','concurrently','-k',frontend,known[3]]);
 }
 if(/^vite(?:\s|$)/.test(script)&&!known&&/--port\s+\d+/.test(script)){
  return npmCommand(['exec','--offline','--','vite','--host','127.0.0.1','--port',String(port),'--strictPort',...(proxyOverlay?['--config',proxyOverlay.file]:[])]);
 }
 if(/^ng serve(?:\s|$)/.test(script)&&/--port\s+\d+/.test(script)){
  return npmCommand(['exec','--offline','--','ng','serve','--host','127.0.0.1','--port',String(port),...(proxyOverlay?['--proxy-config',proxyOverlay.file]:[])]);
 }
 if(proxyOverlay)throw Error('The legacy API proxy cannot be overridden by an unrecognized launch command. Approved project files were not modified.');
 return cmd;
}
// Mock Preview installs only a transient Vite config. It does not modify the
// application's source files, use production API credentials, or launch a DB.
async function createViteMockOverlay(repoRoot,cwd,port,mockDatabase=false){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Mock Preview needs a localhost port.');
 const configFile=(await Promise.all(['vite.config.ts','vite.config.mts','vite.config.js','vite.config.mjs'].map(async name=>
   await fs.lstat(path.join(cwd,name)).then(st=>st.isFile()&&!st.isSymbolicLink()?name:null,()=>null)))).find(Boolean);
 if(!configFile)throw Error('Mock Preview requires a local Vite configuration.');
 const gitExclude=await git(repoRoot,'rev-parse','--git-path','info/exclude');
 const excludePath=path.isAbsolute(gitExclude)?gitExclude:path.join(repoRoot,gitExclude);
 const old=await fs.readFile(excludePath,'utf8').catch(error=>error.code==='ENOENT'?'':Promise.reject(error));
 const marker='vite.config.atgv-mock-runtime-*.mts';
 if(!old.includes(marker)){
   await fs.mkdir(path.dirname(excludePath),{recursive:true});
   await fs.appendFile(excludePath,(old.endsWith('\n')?'':'\n')+'# ATGV ephemeral local Mock Preview\n'+marker+'\n');
 }
 // Identify the *current* TechCockpit multi-app layout by its manifests, not
 // by a branch name or any untrusted in-repository instruction file.
 let profile='';
 if(path.basename(cwd)==='ReactTS_Frontend' && path.dirname(cwd)===repoRoot){
   const nested=await Promise.all(['ReactTS_Frontend/package.json','NestJS_Backend/package.json'].map(async rel=>{
     const loc=path.join(repoRoot,rel);
     const st=await fs.lstat(loc).catch(()=>null);
     if(!st?.isFile()||st.isSymbolicLink())return null;
     return JSON.parse(await fs.readFile(loc,'utf8'));
   }));
   if(nested[0]?.scripts?.dev?.trim()==='vite'&&nested[0]?.dependencies?.react&&
      nested[0]?.devDependencies?.vite&&nested[1]?.dependencies?.['@nestjs/core'])
      profile='tech-cockpit';
 }
 const file='vite.config.atgv-mock-runtime-'+crypto.randomUUID()+'.mts',location=path.join(cwd,file);
 const config=require('./stack-mock-preview').render({source:configFile,port,mockDatabase,profile});
 await fs.writeFile(location,config,{flag:'wx',mode:0o600});
 return {file,location,kind:'mock'};
}
let activeProcess = null;
let lastProcess = null;
async function runLocal(root, { relative = '', env = {}, previewUrl = '', apiPort = null, mockPreview = false, mockDatabase = false } = {}) {
    if (require('./architect-custom-fullstack').hasManagedSession())throw Error('Stop the full-stack session before starting another application.');
    if (activeProcess && activeProcess.child.exitCode === null)
        throw Error('An application is already running. Stop it before starting another.');
    const info = await inspectScripts(root), target = info.targets.find(t => t.relative === relative);
    if (!target)
        throw Error('Select a detected application.');
    const cwd=path.join(info.repo.root,target.relative);
    const libraryOffline=require('./library-offline-dependencies'),offlinePack=await libraryOffline.locate(info.repo.root,cwd);
    let cmd;
    let runtimeProxy=null;
    const port=previewUrl?Number(new URL(previewUrl).port):null;
    const selectedApiPort=apiPort===null?null:Number(apiPort);
    if(selectedApiPort!==null&&(!Number.isInteger(selectedApiPort)||selectedApiPort<1||selectedApiPort>65535||selectedApiPort===port))
        throw Error('ATGV API port must be a valid local port distinct from the frontend.');
    const apiSource=await fs.readFile(path.join(cwd,'server/index.mjs'),'utf8').catch(()=>'');
    const viteSource=await fs.readFile(path.join(cwd,'vite.config.ts'),'utf8').catch(()=>'');
    if(mockPreview){
        if(!previewUrl||target.kind!=='npm'||selectedApiPort!==null)throw Error('Mock Preview needs a selected local Vite application and its preview URL.');
        runtimeProxy=await createViteMockOverlay(info.repo.root,cwd,port,!!mockDatabase);
    }else runtimeProxy=await createRuntimeProxyOverlay(info.repo.root,cwd,selectedApiPort,viteSource);
    try{
        cmd=mockPreview?npmCommand(['exec','--offline','--','vite','--host','127.0.0.1','--port',String(port),'--strictPort','--config',runtimeProxy.file]):
          await previewCommand(approvedCommand(target,'run',offlinePack),target,cwd,previewUrl,runtimeProxy);
    }
    catch(error){if(runtimeProxy)await fs.rm(runtimeProxy.location,{force:true}).catch(()=>{});throw error;}
    const instanceId=apiSource.includes('ATGV_INSTANCE_ID')?crypto.randomUUID():'';
    const offline={...libraryOffline.env(offlinePack),...(target.kind==='npm'?await require('./windows-dependency-bundle').offlineEnv(info.repo.root,cwd):{})};
    const runtimeEnv={
     ...(port?{PORT:String(port),PREVIEW_PORT:String(port),ATGV_PREVIEW_PORT:String(port),ASPNETCORE_URLS:'http://127.0.0.1:'+port,SERVER_PORT:String(port)}:{}),
     ...(selectedApiPort!==null?{API_PORT:String(selectedApiPort),ATGV_API_PORT:String(selectedApiPort),VITE_ATGV_API_PORT:String(selectedApiPort)}:{}),
     ...(instanceId?{ATGV_INSTANCE_ID:instanceId,ATGV_STARTED_AT:new Date().toISOString()}:{}),
     VITE_ATGV_PROJECT:path.basename(info.repo.root),VITE_ATGV_BRANCH:info.repo.branch||'',VITE_ATGV_REVISION:info.repo.sha||''
    };
    let child;
    try{child=spawn(cmd.bin, cmd.args, { cwd, env: { ...process.env, ...env, ...runtimeEnv, ...offline }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' });}
    catch(error){if(runtimeProxy)await fs.rm(runtimeProxy.location,{force:true}).catch(()=>{});throw error;}
    const entry = { child, cwd, previewUrl, apiPort:selectedApiPort, instanceId, runtimeProxy, mockPreview:!!mockPreview, command:diagnostic.commandLine(cmd.bin,cmd.args), logs: '', head: info.repo.sha, relative, exitCode:null, signal:null };
    activeProcess = entry;
    lastProcess = entry;
    const read = (label,data) => { entry.logs = (entry.logs + '['+label+'] '+String(data)).slice(-256*1024); };
    child.stdout?.on('data', data=>read('stdout',data));
    child.stderr?.on('data', data=>read('stderr',data));
    child.on('error', e => read('spawn-error',e.message));
    child.on('exit', (code,signal) => { entry.exitCode=code;entry.signal=signal; if (activeProcess === entry)
        activeProcess = null;
        if(runtimeProxy)fs.rm(runtimeProxy.location,{force:true}).catch(error=>read('cleanup',error.message));
    });
    try {
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    }
    catch (error) {
        if (activeProcess === entry)
            activeProcess = null;
        if(runtimeProxy)await fs.rm(runtimeProxy.location,{force:true}).catch(()=>{});
        throw diagnostic.attach(Error('Unable to start local application: ' + error.message),{stage:'start application',bin:cmd.bin,args:cmd.args,cwd,logs:entry.logs,exitCode:entry.exitCode??error.code,signal:entry.signal});
    }
    return { pid: child.pid, relative, head: entry.head, message: 'Application process started'+(previewUrl?' at '+previewUrl:'. Review logs for the actual local URL.') };
}
// Run only ATGV-generated, localhost-only synthetic API fixtures from a reviewed
// local fix branch. Reuse the normal managed-process tracker so Stop and Status work.
async function runMockServices(root,{relative='',previewUrl=''}={}){
    if(require('./architect-custom-fullstack').hasManagedSession())throw Error('Stop the real full-stack session before starting a mock API.');
    if(activeProcess&&activeProcess.child.exitCode===null&&activeProcess.child.signalCode===null)
        throw Error('An ATGV-managed application is already running.');
    const info=await inspectScripts(root);
    const target=info.targets.find(t=>t.relative===relative);
    if(!target||target.kind!=='npm')throw Error('Select a detected Node application for synthetic API preview.');
    if(!/^fix\/atgv-custom-stack-[a-f0-9]{10}$/.test(info.repo.branch||''))
        throw Error('Synthetic API runner is allowed only on an isolated ATGV local fix branch.');
    const url=require('./architect-custom-stack').loopbackPreview(previewUrl);
    const parsed=new URL(url);
    const port=Number(parsed.port);
    if(!Number.isInteger(port)||port<1||port>65535||parsed.pathname!=='/api/v1/health')
        throw Error('Mock API requires an explicit localhost port and /api/v1/health endpoint.');
    const file=path.join(info.repo.root,'atgv-preview','mock-services.mjs');
    const stat=await fs.lstat(file).catch(()=>null);
    if(!stat?.isFile()||stat.isSymbolicLink())
        throw Error('ATGV mock service source is missing or unsafe.');
    const trusted=require('./architect-custom-repair').PREVIEW_SERVICE;
    if(await fs.readFile(file,'utf8')!==trusted)
        throw Error('The local synthetic mock service differs from the verified ATGV template.');
    const cwd=path.join(info.repo.root,relative);
    // The desktop extension host's executable may open the script in VS Code.
    const child=spawn(nodeExecutable(),[file],{
        cwd,env:{ATGV_MOCK_PORT:String(port),PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||'',
          TEMP:process.env.TEMP||'',TMP:process.env.TMP||'',HOME:process.env.HOME||''},
        windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false,detached:process.platform!=='win32'
    });
    const entry={child,cwd,previewUrl:url,apiPort:null,instanceId:'',runtimeProxy:null,
        mockPreview:true,command:'node [ATGV synthetic mock service]',logs:'',head:info.repo.sha,
        relative,exitCode:null,signal:null};
    activeProcess=entry;lastProcess=entry;
    const read=(label,data)=>{entry.logs=(entry.logs+'['+label+'] '+String(data)).slice(-256*1024);};
    child.stdout?.on('data',data=>read('stdout',data));
    child.stderr?.on('data',data=>read('stderr',data));
    child.on('error',error=>read('spawn-error',error.message));
    child.on('exit',(code,signal)=>{entry.exitCode=code;entry.signal=signal;if(activeProcess===entry)activeProcess=null;});
    try{
        await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    }catch(error){
        if(activeProcess===entry)activeProcess=null;
        throw Error('Cannot launch isolated ATGV mock API: '+error.message);
    }
    return {pid:child.pid,relative,previewUrl:url,mockPreview:true};
}
async function stopLocal() {
 const fullstack=require('./architect-custom-fullstack');
 if(fullstack.hasManagedSession())return fullstack.stop();
 if (!activeProcess)
    return { stopped: false }; const entry = activeProcess; if (process.platform !== 'win32') {
    try {
        process.kill(-entry.child.pid, 'SIGTERM');
    }
    catch {
        entry.child.kill('SIGTERM');
    }
}
else {
    // Windows npm launches a process tree (Vite, API, concurrently). Kill the
    // tree, not just its parent, to release the server port on Stop Server.
    try {
        if (Number.isInteger(entry.child.pid) && entry.child.pid > 0)
            await run('taskkill', ['/T', '/F', '/PID', String(entry.child.pid)], { windowsHide: true, timeout: 12000 });
    } catch { entry.child.kill(); }
}
await Promise.race([
 new Promise(resolve=>(entry.child.exitCode!==null||entry.child.signalCode!==null)?resolve():entry.child.once('exit',resolve)),
 new Promise(resolve=>setTimeout(resolve,3500))
]);
if(entry.child.exitCode===null&&entry.child.signalCode===null)
 throw Error('ATGV-managed process did not exit; it remains tracked.');
if(activeProcess===entry)activeProcess=null;
return { stopped: true, logs: entry.logs }; }
function localLogs() {
 const fullstack=require('./architect-custom-fullstack');
 if(fullstack.hasManagedSession())return fullstack.log();
 const entry=activeProcess||lastProcess;return entry ? { running: !!activeProcess&&entry.child.exitCode === null && entry.child.signalCode === null, pid:entry.child.pid, logs: entry.logs, cwd: entry.cwd, relative: entry.relative, head: entry.head, command:entry.command, previewUrl:entry.previewUrl, apiPort:entry.apiPort, instanceId:entry.instanceId, mockPreview:entry.mockPreview===true, exitCode:entry.exitCode, signal:entry.signal } : { running: false, pid:null, logs: '' }; }
function readinessFlags({hasRepo=false, clean=false, matched=false, baseFound=false, stackId='', targets=[]}={}) {
  const blockers=[];
  if(!stackId) blockers.push('Solution Architect has not selected a technology stack');
  if(!hasRepo) blockers.push('Local Git repository is not selected');
  if(hasRepo&&!clean) blockers.push('Repository has uncommitted changes');
  if(hasRepo&&!matched) blockers.push('Repository origin does not match the configured GitHub repository');
  if(hasRepo&&matched&&!baseFound) blockers.push('Integration branch was not found on origin or remote is inaccessible');
  const readyBranch=blockers.length===0;
  const testTarget=(Array.isArray(targets)?targets:[]).some(t=>t.scripts?.includes('test')&&t.installed);
  return {readyBranch,readyTest:readyBranch&&testTarget,blockers,
    testingNote:testTarget?'At least one installed test runner is available.':'No installed runnable unit-test target detected. Generate the skeleton and install approved dependencies.'};
}
async function checkReadiness(root,{owner='',name='',base='main',stackId=''}={}) {
  if(!root)return {...readinessFlags({stackId}),remote:'',branch:'',root:'',targets:[]};
  let inspection;
  try{inspection=await inspectScripts(root);}catch(error){return {...readinessFlags({stackId}),blockers:['Local repository check failed: '+error.message],remote:'',branch:'',root:'',targets:[]};}
  const repo=inspection.repo;
  const matched=!!(owner&&name&&matchesGithubRepo(repo.remote,owner,name));
  let baseFound=false,remoteError='';
  if(matched&&/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,110}$/.test(base)&&!base.includes('..')){
    try{baseFound=!!(await git(repo.root,'ls-remote','--heads','origin','refs/heads/'+base));}
    catch(e){remoteError='Could not reach origin: '+e.message.slice(0,240);}
  }
  const flags=readinessFlags({hasRepo:true,clean:repo.clean,matched,baseFound,stackId,targets:inspection.targets});
  if(remoteError)flags.blockers.push(remoteError);
  return {...flags,remote:repo.remote,branch:repo.branch,root:repo.root,base,targets:inspection.targets,updated:new Date().toISOString()};
}
async function readArtifactFiles(root,base='main') {
  const repo=await repository(root);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,110}$/.test(base)||base.includes('..'))throw Error('Invalid integration branch.');
  const ref='refs/remotes/origin/'+base;
  const hasBase=await git(repo.root,'rev-parse','--verify',ref).then(()=>true,()=>false);
  const revisionFiles=hasBase?await git(repo.root,'diff','--name-only','--diff-filter=ACMR',ref+'...HEAD').catch(()=>''):'';
  const uncommittedFiles=await git(repo.root,'status','--porcelain','--untracked-files=all');
  const paths=[...revisionFiles.split('\n'),...uncommittedFiles.split('\n').map(line=>line.replace(/^.{1,2}\s+/, '').split(' -> ').pop())]
    .filter(name=>name&&!name.startsWith('/')&&!name.split('/').includes('..'));
  return {files:[...new Set(paths)].slice(0,250),branch:repo.branch,head:repo.sha,updated:new Date().toISOString(),basis:hasBase?'origin/'+base:'working tree only (base not available)'};
}

async function artifactSnapshot(root, key, base='main') {
    const repo = await repository(root);
    const valid = jiraKey(key);
    const prefix = 'feature/' + valid.toLowerCase();
    if (!(repo.branch === prefix || repo.branch.startsWith(prefix + '-'))) {
        return {connected:true,validBranch:false,branch:repo.branch,sha:repo.sha,files:[],groups:require('./developer-copilot').artifactGroups([]),source:'Current repository branch is not linked to Jira '+valid};
    }
    const found = await readArtifactFiles(root,base);
    return {connected:true,validBranch:true,branch:repo.branch,sha:repo.sha,
        files:found.files,groups:require('./developer-copilot').artifactGroups(found.files),
        source:'Git files from '+found.basis+' on '+repo.branch};
}

module.exports = { initializeProjectGit, hydrateUnbornCheckout, probeRemote, readinessFlags, checkReadiness, readArtifactFiles, artifactSnapshot, createRuntimeProxyOverlay, findLocalStoryBranch, jiraKey, branchName, repository, findStoryBranch, matchesGithubRepo, createBranch, resumeBranch, initLocalBaseline, commitBootstrap, configureOrigin, publishBootstrap, cloneConfigured, pushStory, inspectScripts, executeLocal, previewCommand, runLocal, runMockServices, stopLocal, localLogs };
