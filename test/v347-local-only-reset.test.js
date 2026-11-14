'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const localReset=require('../src/lib/reset/local-reset');
const developerGit=require('../src/developer-git');
const catalog=require('../src/github-sdlc-catalog');
const {ProjectRegistry}=require('../src/projects');
const {ensureWorkspaceLibrary}=require('../src/tech-stacks');

const config={get:(name,fallback)=>fallback};
function project(){return {id:'testproject',name:'Test Project',techStackId:'react',techStackGeneration:17,
  techStackPrepared:{stackId:'react',companionId:'',branch:'bootstrap/react-initial',remotePushed:true,baseBranch:'main',root:'/old',sha:'a'.repeat(40)},
  techStackApproval:{status:'approved'},settings:{jira:{projectKey:'TC'},github:{owner:'my-org',repo:'my-app'}},schedule:{}};}
async function temp(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-347-reset-'));try{await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}

test('Local Reset keeps project identity and connection settings but discards stack approvals',()=>{
 const original=project();const fresh=localReset.restoredProject(original);
 assert.equal(fresh.id,'testproject');assert.equal(fresh.name,'Test Project');
 assert.equal(fresh.techStackId,'react');assert.equal(fresh.techStackGeneration,0);
 assert.equal(fresh.techStackPrepared,null);assert.equal(fresh.techStackApproval,null);
 assert.equal(fresh.settings.jira.projectKey,'TC');assert.equal(fresh.settings.github.repo,'my-app');
 const remote=localReset.remoteCheckout(original,{},config);
 assert.deepEqual(remote,{owner:'my-org',repo:'my-app',branch:'main'});
 assert.equal(localReset.remoteCheckout({...original,settings:{...original.settings,github:{...original.settings.github,branch:'develop'}}},{},config).branch,'develop');
});
test('Local reset preview clearly excludes all remote deletion and preserves extensions settings',()=>{
 const msg=localReset.preview([project()],[{id:'testproject',owner:'my-org',repo:'my-app',branch:'bootstrap/react-initial'}],true,'C:/atgv');
 assert.match(msg,/DELETE ALL LOCAL WORK/);assert.match(msg,/API tokens/);
 assert.match(msg,/DO NOT delete or modify any remote Jira issue/);
 assert.match(msg,/unpushed commits/);assert.match(msg,/bootstrap\/react-initial/);
});
test('Local Reset refuses non-ATGV .atgv path before deleting anything',()=>temp(async workspace=>{
 await fs.mkdir(path.join(workspace,'.atgv'));await fs.writeFile(path.join(workspace,'.atgv','keep.txt'),'other app');
 await assert.rejects(localReset.checkOwnedWorkspaceLibrary(workspace),/not verified as ATGV-managed/);
 assert.equal(await fs.readFile(path.join(workspace,'.atgv','keep.txt'),'utf8'),'other app');
}));
test('Failed repository download leaves original project and catalog intact and removes staging',()=>temp(async workspace=>{
 await ensureWorkspaceLibrary(workspace);const registry=new ProjectRegistry(workspace);await registry.create(project());
 const local=path.join(workspace,'projects','testproject','do-not-delete.txt');await fs.writeFile(local,'local edits');
 const old=developerGit.cloneConfigured;
 developerGit.cloneConfigured=async()=>{throw Error('Offline private repository');};
 try{
  await assert.rejects(localReset.stageFreshWorkspace({workspace,projects:[project()],connections:[{id:'testproject',owner:'my-org',repo:'my-app',branch:'main'}],catalogConfig:{repositoryUrl:''},catalogToken:''}),/existing local work was NOT deleted/i);
  assert.equal(await fs.readFile(local,'utf8'),'local edits');
  assert.ok(await fs.stat(path.join(workspace,'.atgv','atgv.workspace.json')));
  assert.equal((await fs.readdir(workspace)).filter(name=>name.startsWith('.atgv-reset-staging-')).length,0);
 }finally{developerGit.cloneConfigured=old;}
}));
test('Local Reset stages remote copies, replaces all local work and preserves external workspace files',()=>temp(async workspace=>{
 await ensureWorkspaceLibrary(workspace);const registry=new ProjectRegistry(workspace);await registry.create(project());
 await fs.writeFile(path.join(workspace,'projects','testproject','local-only.txt'),'delete');
 await fs.writeFile(path.join(workspace,'unrelated.txt'),'keep');
 const oldClone=developerGit.cloneConfigured,oldCatalog=catalog.syncGitWorkspace;
 let cloneCalls=0,catalogCalls=0;
 developerGit.cloneConfigured=async(parent,owner,repo,branch)=>{
  cloneCalls++;const folder=path.join(parent,repo);await fs.mkdir(folder);
  await fs.writeFile(path.join(folder,'remote.txt'),branch);return {root:folder,branch};
 };
 catalog.syncGitWorkspace=async(config,token,ws)=>{catalogCalls++;await fs.writeFile(path.join(ws,'.atgv','downloaded-from-main'),'catalog');return {sha:'a'.repeat(40)};};
 try{
  const staged=await localReset.stageFreshWorkspace({workspace,projects:[project()],connections:[{id:'testproject',owner:'my-org',repo:'my-app',branch:'bootstrap/react-initial'}],catalogConfig:{repositoryUrl:'https://github.com/my-org/skills'},catalogToken:''});
  await localReset.replaceLocalWorkspace({workspace,registry,...staged,storageRoot:path.join(workspace,'globalcache'),workspaceHash:'abc123'});
  assert.equal(cloneCalls,1);assert.equal(catalogCalls,1);
  await assert.rejects(fs.access(path.join(workspace,'projects','testproject','local-only.txt')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(workspace,'projects','testproject','repository','my-app','remote.txt'),'utf8'),'bootstrap/react-initial');
  assert.equal(await fs.readFile(path.join(workspace,'.atgv','downloaded-from-main'),'utf8'),'catalog');
  assert.equal(await fs.readFile(path.join(workspace,'unrelated.txt'),'utf8'),'keep');
  const restored=await registry.read('testproject');assert.equal(restored.settings.jira.projectKey,'TC');assert.equal(restored.techStackApproval,null);
 }finally{developerGit.cloneConfigured=oldClone;catalog.syncGitWorkspace=oldCatalog;}
}));
