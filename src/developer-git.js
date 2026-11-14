'use strict';
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const diagnostic = require('./stack-process-diagnostics');
const {npmCommand} = require('./platform-process');
const run = promisify(execFile);
const KEY = /^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/;
const BRANCH = /^[a-z0-9][a-z0-9/_-]{0,110}$/;
function jiraKey(input) { const key = String(input || '').trim().toUpperCase(); if (!KEY.test(key))
    throw Error('Enter a valid Jira issue key (e.g. CLAIM-101).'); return key; }
function branchName(key, summary = '') { const safe = String(summary).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45).replace(/-$/, ''); return `feature/${jiraKey(key).toLowerCase()}${safe ? '-' + safe : ''}`; }
async function git(root, ...args) {
    const { stdout, stderr } = await run('git', ['-C', root, ...args], { timeout: 45000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } });
    return (stdout || stderr || '').trim();
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
    const sha = await git(real, 'rev-parse', 'HEAD').catch(() => '');
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
async function publishBootstrap(root, base = 'main') {
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
    const remoteBase = await git(root, 'ls-remote', '--heads', 'origin', 'refs/heads/' + base);
    if (remoteBase && remoteBase.split(/\s/)[0] !== localBase)
        throw Error('Remote integration branch changed. Review and reconcile before publishing.');
    if (!remoteBase)
        await git(root, 'push', 'origin', base);
    await git(root, 'push', '--set-upstream', 'origin', repo.branch);
    return { ...repo, base, baseSha: localBase, published: true };
}
async function cloneConfigured(parent, owner, name, branch = '') {
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[-.a-zA-Z0-9_]{1,100}$/.test(name) || name === '.' || name === '..')
        throw Error('Invalid GitHub repository identity.');
    const root = await fs.realpath(parent), dest = path.join(root, name);
    if (await fs.lstat(dest).then(() => true, () => false))
        throw Error('Clone target already exists; open the existing repository instead.');
    const address = `https://github.com/${owner}/${name}.git`;
    const { validGithubBranch } = require('./projects');
    const selected=validGithubBranch(branch);
    await run('git', ['clone', ...(selected?['--branch',selected]:[]), '--', address, dest], { cwd: root, timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } });
    return repository(dest);
}
async function pushStory(root, key) {
    const repo = await repository(root), prefix = 'feature/' + jiraKey(key).toLowerCase();
    if (!(repo.branch === prefix || repo.branch.startsWith(prefix + '-')))
        throw Error('Checked-out branch does not match the selected Jira story.');
    if (!repo.clean)
        throw Error('Commit or stash your local changes before pushing.');
    if (!repo.remote)
        throw Error('Origin remote is not configured.');
    await git(root, 'push', '--set-upstream', 'origin', repo.branch);
    return repository(root);
}
async function inspectScripts(root) {
    const repo = await repository(root);
    const locations = ['', 'apps/web', 'services/api'];
    const items = [];
    for (const relative of locations) {
        const folder = path.join(repo.root, relative);
        const packageFile = path.join(folder, 'package.json');
        let pkg = null;
        try {
            pkg = JSON.parse(await fs.readFile(packageFile, 'utf8'));
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        if (pkg) {
            const scripts = Object.keys(pkg.scripts || {});
            items.push({ relative, kind: 'npm', scripts: scripts.filter(s => ['dev', 'start', 'test', 'build'].includes(s)), installed: !!await fs.stat(path.join(folder, 'node_modules')).then(x => x.isDirectory(), () => false) });
        }
        else if (await fs.readdir(folder).then(x => x.some(n => n.endsWith('.csproj')), () => false))
            items.push({ relative, kind: 'dotnet', scripts: ['build', 'test', 'run'], installed: true });
        else if (await fs.stat(path.join(folder, 'pom.xml')).then(() => true, () => false))
            items.push({ relative, kind: 'maven', scripts: ['build', 'test', 'run'], installed: true });
    }
    return { repo, targets: items };
}
function approvedCommand(target, operation) {
    if (!['test', 'build', 'run'].includes(operation))
        throw Error('Unsupported local operation.');
    if (target.kind === 'npm') {
        const script = operation === 'run' ? (target.scripts.includes('dev') ? 'dev' : 'start') : operation;
        if (!target.scripts.includes(script))
            throw Error('Project does not define a ' + script + ' script.');
        if (!target.installed)
            throw Error('Dependencies are not installed. Review the project and run the approved install procedure first.');
        return npmCommand(['run', script]);
    }
    if (target.kind === 'dotnet')
        return { bin: 'dotnet', args: operation === 'test' ? ['test', 'tests/Atgv.Tests/Atgv.Tests.csproj'] : [operation === 'run' ? 'run' : 'build'] };
    if (target.kind === 'maven')
        return { bin: 'mvn', args: operation === 'test' ? ['test'] : operation === 'build' ? ['package'] : ['spring-boot:run'] };
    throw Error('Unsupported project runtime.');
}
async function executeLocal(root, { relative = '', operation = 'test', onDiagnostic = async()=>{} } = {}) {
    const info = await inspectScripts(root), target = info.targets.find(t => t.relative === relative);
    if (!target)
        throw Error('No matching application was found in the repository.');
    if (operation === 'run')
        throw Error('Use the tracked application process for Run Locally.');
    const cmd = approvedCommand(target, operation), cwd = path.join(info.repo.root, target.relative);
    const at = new Date().toISOString(), head = info.repo.sha;
    try {
        const { stdout, stderr } = await run(cmd.bin, cmd.args, { cwd, timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false });
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
let activeProcess = null;
let lastProcess = null;
async function runLocal(root, { relative = '', env = {} } = {}) {
    if (activeProcess && activeProcess.child.exitCode === null)
        throw Error('An application is already running. Stop it before starting another.');
    const info = await inspectScripts(root), target = info.targets.find(t => t.relative === relative);
    if (!target)
        throw Error('Select a detected application.');
    const cmd = approvedCommand(target, 'run'), cwd = path.join(info.repo.root, target.relative);
    const child = spawn(cmd.bin, cmd.args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' });
    const entry = { child, cwd, command:diagnostic.commandLine(cmd.bin,cmd.args), logs: '', head: info.repo.sha, relative, exitCode:null, signal:null };
    activeProcess = entry;
    lastProcess = entry;
    const read = (label,data) => { entry.logs = (entry.logs + '['+label+'] '+String(data)).slice(-256*1024); };
    child.stdout?.on('data', data=>read('stdout',data));
    child.stderr?.on('data', data=>read('stderr',data));
    child.on('error', e => read('spawn-error',e.message));
    child.on('exit', (code,signal) => { entry.exitCode=code;entry.signal=signal; if (activeProcess === entry)
        activeProcess = null; });
    try {
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    }
    catch (error) {
        if (activeProcess === entry)
            activeProcess = null;
        throw diagnostic.attach(Error('Unable to start local application: ' + error.message),{stage:'start application',bin:cmd.bin,args:cmd.args,cwd,logs:entry.logs,exitCode:entry.exitCode??error.code,signal:entry.signal});
    }
    return { pid: child.pid, relative, head: entry.head, message: 'Application process started. Review logs for the actual local URL.' };
}
async function stopLocal() { if (!activeProcess)
    return { stopped: false }; const entry = activeProcess; activeProcess = null; if (process.platform !== 'win32') {
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
} return { stopped: true, logs: entry.logs }; }
function localLogs() { const entry=activeProcess||lastProcess;return entry ? { running: !!activeProcess&&entry.child.exitCode === null && !entry.child.killed, pid:entry.child.pid, logs: entry.logs, cwd: entry.cwd, relative: entry.relative, head: entry.head, command:entry.command, exitCode:entry.exitCode, signal:entry.signal } : { running: false, pid:null, logs: '' }; }
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

module.exports = { readinessFlags, checkReadiness, readArtifactFiles, artifactSnapshot, findLocalStoryBranch, jiraKey, branchName, repository, findStoryBranch, matchesGithubRepo, createBranch, resumeBranch, initLocalBaseline, commitBootstrap, configureOrigin, publishBootstrap, cloneConfigured, pushStory, inspectScripts, executeLocal, runLocal, stopLocal, localLogs };
