'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const catalog=require('../src/github-sdlc-catalog');
const git=(dir,...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
test('legacy sdlc-catalog checkout and state migrate to library without losing Git history',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-library-migration-')),workspace=path.join(root,'workspace');
 const base=path.join(workspace,'.atgv'),legacy=path.join(base,'sdlc-catalog');
 try{
  await fs.mkdir(legacy,{recursive:true});
  git(legacy,'init','-b','main');git(legacy,'config','user.name','Migration Test');git(legacy,'config','user.email','migration@example.invalid');
  await fs.writeFile(path.join(legacy,'catalog.json'),JSON.stringify({schema:1,version:'1.0.0',roles:[],techStacks:[]}));
  git(legacy,'add','.');git(legacy,'commit','-m','library content');
  const sha=git(legacy,'rev-parse','HEAD');
  await fs.writeFile(path.join(base,'sdlc-catalog-state.json'),JSON.stringify({schema:1,sha,repository:'example/library',ref:'main',version:'1.0.0'}));
  const result=await catalog.activeRoot(workspace);
  assert.equal(result.root,path.join(base,'library'));
  assert.equal(result.sha,sha);
  assert.equal(git(result.root,'rev-parse','HEAD'),sha);
  assert.equal(await catalog.activeFile(workspace,'catalog.json'),JSON.stringify({schema:1,version:'1.0.0',roles:[],techStacks:[]}));
  await assert.rejects(fs.lstat(legacy),{code:'ENOENT'});
  await assert.rejects(fs.lstat(path.join(base,'sdlc-catalog-state.json')),{code:'ENOENT'});
  assert.equal((await catalog.gitInstalled(workspace,{repositoryUrl:'https://github.com/example/library'})).sha,sha);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('existing library checkout never overwrites a separate legacy checkout',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-library-conflict-')),base=path.join(root,'.atgv');
 try{
  await fs.mkdir(path.join(base,'sdlc-catalog'),{recursive:true});
  await fs.mkdir(path.join(base,'library'),{recursive:true});
  await fs.writeFile(path.join(base,'sdlc-catalog','keep.txt'),'legacy');
  await fs.writeFile(path.join(base,'library','keep.txt'),'current');
  await catalog.migrateLegacyLibraryCheckout(root);
  assert.equal(await fs.readFile(path.join(base,'library','keep.txt'),'utf8'),'current');
  assert.equal(await fs.readFile(path.join(base,'sdlc-catalog','keep.txt'),'utf8'),'legacy');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
