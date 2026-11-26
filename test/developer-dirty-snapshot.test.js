'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const pipeline=require('../src/developer-br-pipeline'),snapshot=require('../src/developer-dirty-snapshot');
test('Initial Development captures modified and new project source without touching original index or files',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-dirty-')),root=path.join(base,'repo');await fs.mkdir(root);
 const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
 try{
  git(root,'init','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
  await fs.writeFile(path.join(root,'app.js'),'const a=1;\n');git(root,'add','app.js');git(root,'commit','-m','baseline');
  const head=git(root,'rev-parse','HEAD');
  await fs.writeFile(path.join(root,'app.js'),'const a=2;\n');git(root,'add','app.js');
  await fs.writeFile(path.join(root,'app.js'),'const a=3;\n');await fs.writeFile(path.join(root,'new.js'),'export const b=1;\n');await fs.writeFile(path.join(root,'.env'),'TOKEN=test-secret\n');await fs.writeFile(path.join(root,'runtime.db'),'runtime');
  const status=git(root,'status','--porcelain'),index=git(root,'diff','--cached');
  const w=await pipeline.createWorktree({root,approvedSha:head,baseDirectory:path.join(base,'trees'),brId:'BR-001',allowDirty:true});
  const c=await snapshot.capture(root,w.worktree,{head,baseSha:head});
  assert.equal(c.captured,2);assert.equal(c.excluded,2);assert.notEqual(c.sha,head);
  assert.equal(await fs.readFile(path.join(w.worktree,'app.js'),'utf8'),'const a=3;\n');
  assert.equal(await fs.readFile(path.join(w.worktree,'new.js'),'utf8'),'export const b=1;\n');
  await assert.rejects(fs.stat(path.join(w.worktree,'.env')),/ENOENT/);
  assert.equal(git(root,'status','--porcelain'),status);assert.equal(git(root,'diff','--cached'),index);assert.equal(git(root,'rev-parse','HEAD'),head);
 }finally{await fs.rm(base,{recursive:true,force:true});}
});
