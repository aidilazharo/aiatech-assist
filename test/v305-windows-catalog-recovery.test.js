'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const catalog = require('../src/github-sdlc-catalog');
const git = (cwd, ...args) => execFileSync('git', args, {cwd,encoding:'utf8'}).trim();
const denied = (code='EPERM') => Object.assign(new Error('simulated Windows lock on rename'),{code});
async function harness() {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v305-catalog-'));
 const origin=path.join(root,'upstream.git');
 const writer=path.join(root,'writer');
 const workspace=path.join(root,'workspace');
 await fs.mkdir(writer);await fs.mkdir(path.join(workspace,'.atgv'),{recursive:true});
 git(root,'init','--bare',origin);
 git(writer,'init','-b','main');
 git(writer,'config','user.name','Catalog Tests');
 git(writer,'config','user.email','catalog-test@example.invalid');
 git(writer,'remote','add','origin',origin);
 await fs.mkdir(path.join(writer,'roles','developer'),{recursive:true});
 await fs.mkdir(path.join(writer,'tech-stacks','react','scaffold'),{recursive:true});
 await fs.writeFile(path.join(writer,'catalog.json'), JSON.stringify({schema:1,version:'1.2.0',roles:['developer'],techStacks:['react']}));
 await fs.writeFile(path.join(writer,'roles','developer','SKILL.md'),'# Developer\n');
 await fs.writeFile(path.join(writer,'tech-stacks','react','stack.json'),JSON.stringify({id:'react'}));
 await fs.writeFile(path.join(writer,'tech-stacks','react','scaffold','package.json'),'{}\n');
 git(writer,'add','.');git(writer,'commit','-m','Initial catalog');git(writer,'push','origin','main');
 return {root,origin,workspace};
}
function stages(workspace) {return fs.readdir(path.join(workspace,'.atgv')).then(x=>x.filter(n=>n.startsWith('.sdlc-catalog-clone-')));}

test('EPERM on directory rename retries then installs verified catalog by exclusive copy',async()=>{
 const x=await harness();try{
  let attempts=0,pauses=0;
  const result=await catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog','',{
   rename: async()=>{attempts++;throw denied();}, pause:async()=>{pauses++;}
  });
  assert.equal(attempts,6);assert.equal(pauses,5);
  assert.equal(result.action,'cloned');
  assert.equal(result.checkout,catalog.gitCatalogFolder(x.workspace));
  assert.match(await fs.readFile(path.join(result.checkout,'roles','developer','SKILL.md'),'utf8'),/# Developer/);
  assert.equal(git(result.checkout,'rev-parse','HEAD'),result.sha);
  assert.equal((await catalog.gitInstalled(x.workspace,{repositoryUrl:'https://github.com/test/catalog'})).sha,result.sha);
  assert.deepEqual(await stages(x.workspace),[]);
  assert.equal((await catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog')).action,'already-current');
 }finally{await fs.rm(x.root,{force:true,recursive:true});}
});

test('destination appearing during clone is adopted only when remote, branch and commit match',async()=>{
 const x=await harness();try{
  let called=0;
  const result=await catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog','',{
   rename:async(stage,target)=>{called++;await fs.cp(stage,target,{recursive:true,force:false,errorOnExist:true});throw denied('EEXIST');},
   pause:async()=>{}
  });
  assert.equal(called,1);
  assert.equal(result.action,'cloned');
  assert.equal((await catalog.gitInstalled(x.workspace,{repositoryUrl:'https://github.com/test/catalog'})).sha,result.sha);
  assert.deepEqual(await stages(x.workspace),[]);
 }finally{await fs.rm(x.root,{force:true,recursive:true});}
});

test('destination collision preserves unrelated user data and valid staged clone',async()=>{
 const x=await harness();try{
  const protectedText='user data — must not overwrite';
  await assert.rejects(catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog','',{
   rename: async(_stage,target)=>{
    await fs.mkdir(target);await fs.writeFile(path.join(target,'local.txt'),protectedText);
    throw denied('EPERM');
   }, pause:async()=>{}
  }),/differs from|not a safe directory|Temporary clone/);
  assert.equal(await fs.readFile(path.join(catalog.gitCatalogFolder(x.workspace),'local.txt'),'utf8'),protectedText);
  const pending=await stages(x.workspace);assert.equal(pending.length,1);
  assert.equal((await fs.stat(path.join(x.workspace,'.atgv',pending[0],'.git'))).isDirectory(),true);
 }finally{await fs.rm(x.root,{force:true,recursive:true});}
});

test('unrecoverable filesystem failure reports cause and does not delete verified staging checkout',async()=>{
 const x=await harness();try{
  await assert.rejects(catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog','',{
   rename:async()=>{throw denied('EIO');}, pause:async()=>{}
  }),/Temporary clone: .*No existing catalog was overwritten/);
  const pending=await stages(x.workspace);
  assert.equal(pending.length,1);
  assert.match(git(path.join(x.workspace,'.atgv',pending[0]),'branch','--show-current'),/^main$/);
  await assert.rejects(fs.lstat(catalog.gitCatalogFolder(x.workspace)),{code:'ENOENT'});
 }finally{await fs.rm(x.root,{force:true,recursive:true});}
});

test('catalog Git uses explicitly configured executable even when shell PATH has no git',async()=>{
 const bin=execFileSync('which',['git'],{encoding:'utf8'}).trim();
 const result=await catalog.runCatalogGit(os.tmpdir(),['--version'],{...process.env,PATH:'',ATGV_GIT_PATH:bin});
 assert.match(result,/git version/);
});

test('v0.3.09 recovers a preserved validated stage after an EEXIST copy collision without recloning',async()=>{
 const x=await harness();try{
  let copyAttempts=0;
  await assert.rejects(catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog','',{
   rename:async()=>{throw denied('EPERM');},
   pause:async()=>{},
   copyEntry:async()=>{copyAttempts++;throw denied('ERR_FS_CP_EEXIST');}
  }),/ERR_FS_CP_EEXIST.*Temporary clone:/);
  assert.equal(copyAttempts,1);
  const pending=await stages(x.workspace);
  assert.equal(pending.length,1);
  assert.equal((await fs.stat(path.join(x.workspace,'.atgv',pending[0],'catalog.json'))).isFile(),true);
  await assert.rejects(fs.stat(catalog.gitCatalogFolder(x.workspace)),{code:'ENOENT'});
  const recovered=await catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog','',{
   rename:async()=>{throw denied('EPERM');},pause:async()=>{}
  });
  assert.equal(recovered.action,'recovered');
  assert.equal(git(recovered.checkout,'rev-parse','HEAD'),recovered.sha);
  assert.match(await fs.readFile(path.join(recovered.checkout,'roles','developer','SKILL.md'),'utf8'),/# Developer/);
  assert.deepEqual(await stages(x.workspace),[]);
  assert.equal((await catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog')).action,'already-current');
 }finally{await fs.rm(x.root,{force:true,recursive:true});}
});

test('v0.3.09 does not adopt a preserved stage for a different repository',async()=>{
 const x=await harness();try{
  const stage=path.join(x.workspace,'.atgv','.sdlc-catalog-clone-11111111-2222-3333-4444-555555555555');
  await fs.mkdir(stage);
  await fs.writeFile(path.join(stage,'user-data.txt'),'do not delete');
  const result=await catalog.syncGitCatalogCheckout(x.workspace,x.origin,'test/catalog');
  assert.equal(result.action,'cloned');
  assert.equal(await fs.readFile(path.join(stage,'user-data.txt'),'utf8'),'do not delete');
 }finally{await fs.rm(x.root,{force:true,recursive:true});}
});
