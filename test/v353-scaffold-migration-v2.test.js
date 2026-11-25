'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const fixture=require('./catalog-fixture');
const skeleton=require('../src/project-skeleton');
const migration=require('../src/architect-scaffold-migration');
const architect=require('../src/architect-simple-workflow');
const bootstrap=require('../src/architect-stack-bootstrap');
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
async function catalogNext(workspace){
 const folder=path.join(workspace,'.atgv','catalog-assets',fixture.SHA,'tech-stacks','react','scaffold');
 await fs.rename(path.join(folder,'src/main.jsx'),path.join(folder,'src/main.tsx'));
 await fs.rename(path.join(folder,'vite.config.js'),path.join(folder,'vite.config.ts'));
 await fs.writeFile(path.join(folder,'src/App.tsx'),'export default function App(){return null;}\n');
 await fs.writeFile(path.join(folder,'src/App.test.tsx'),'// starter smoke\n');
 await fs.writeFile(path.join(folder,'tsconfig.json'),'{}\n');
 const meta=path.join(workspace,'.atgv','catalog-assets',fixture.SHA,'catalog.json');
 const catalog=JSON.parse(await fs.readFile(meta,'utf8'));catalog.version='1.1.12';await fs.writeFile(meta,JSON.stringify(catalog));
}
async function withRepo(callback,{remote=false,windows=false}={}){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v353-'));
 try{
  await fixture.activate(temp);
  const root=path.join(temp,'checkout');
  let upstream=null;
  if(remote){
   upstream=path.join(temp,'origin.git');execFileSync('git',['init','--bare',upstream],{stdio:'ignore'});
   git(temp,'init','-b','main','seed');const seed=path.join(temp,'seed');
   git(seed,'config','user.name','ATGV');git(seed,'config','user.email','atgv@example.invalid');
   await fs.writeFile(path.join(seed,'README.md'),'Company project\n');
   git(seed,'add','.');git(seed,'commit','-m','base');git(seed,'remote','add','origin',upstream);git(seed,'push','-u','origin','main');
   execFileSync('git',['--git-dir',upstream,'symbolic-ref','HEAD','refs/heads/main']);
   execFileSync('git',['clone',upstream,root],{stdio:'ignore'});
  }else{await fs.mkdir(root);git(root,'init','-b','main');}
  git(root,'config','user.name','ATGV');git(root,'config','user.email','atgv@example.invalid');
  if(windows)git(root,'config','core.autocrlf','true');
  git(root,'switch','-c','bootstrap/react-initial');
  await skeleton.generateSkeleton(root,['react']);
  git(root,'add','.');git(root,'commit','-m','original catalog 1.1.0 scaffold');
  const baseCommit=git(root,'rev-parse','HEAD');
  if(upstream)git(root,'push','-u','origin','bootstrap/react-initial');
  await catalogNext(temp);
  return await callback({temp,root,upstream,baseCommit});
 }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
test('v0.3.55 migrates committed React starter on a distinct branch; main and bootstrap remain intact',()=>withRepo(async({root,baseCommit})=>{
 const old=git(root,'show','bootstrap/react-initial:src/main.jsx');
 const change=await migration.migrate({root,stackIds:['react']});
 assert.equal(change.migrated,true);
 assert.match(change.branch,/^migration\/react-catalog-1-1-12-/);
 assert.equal(git(root,'branch','--show-current'),change.branch);
 assert.equal(git(root,'rev-parse','bootstrap/react-initial'),baseCommit);
 assert.equal(git(root,'show','bootstrap/react-initial:src/main.jsx'),old);
 assert.ok((await fs.readFile(path.join(root,'src/main.tsx'),'utf8')).length);
 const plan=await architect.generatedCommitPlan(root,['react']);
 assert.equal(plan.migration,true);
 assert.ok(plan.files.includes('src/main.jsx'));
 assert.ok(plan.files.includes('src/main.tsx'));
 await architect.commitGenerated(plan);
 assert.equal(git(root,'status','--porcelain'),'');
 assert.equal(git(root,'rev-parse','bootstrap/react-initial'),baseCommit);
 assert.equal(git(root,'show','HEAD:atgv.bootstrap.json').includes('"catalogVersion": "1.1.12"'),true);
}));
test('v0.3.55 accepts Windows CRLF only when templateDigest verifies the original template',()=>withRepo(async({root})=>{
 const file=path.join(root,'src/main.jsx');
 // Simulate Git for Windows checkout: committed blob LF, worktree CRLF.
 const src=await fs.readFile(file,'utf8');
 await fs.writeFile(file,src.replace(/\r?\n/g,'\r\n'));
 assert.match(await fs.readFile(file,'utf8'),/\r\n/);
 // Git for Windows may report a content-clean CRLF worktree as clean.
 assert.match(git(root,'status','--porcelain','--','src/main.jsx'),/^(?:M src\/main\.jsx)?$/);
 assert.equal(git(root,'diff','--numstat','--','src/main.jsx'),'');
 const change=await migration.migrate({root,stackIds:['react']});
 assert.equal(change.provenance,'verified-CRLF-only');
 assert.equal((await architect.generatedCommitPlan(root,['react'])).migration,true);
},{windows:true}));
test('v0.3.55 refuses genuinely modified committed application code and keeps bootstrap branch',()=>withRepo(async({root,baseCommit})=>{
 await fs.appendFile(path.join(root,'src/main.jsx'),'// real customization\n');
 git(root,'add','.');git(root,'commit','-m','legitimate custom code');
 const before=await fs.readFile(path.join(root,'src/main.jsx'),'utf8');
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/templateDigest|genuine modifications/i);
 assert.equal(git(root,'branch','--show-current'),'bootstrap/react-initial');
 assert.equal(await fs.readFile(path.join(root,'src/main.jsx'),'utf8'),before);
 assert.equal(git(root,'show','HEAD:src/main.jsx'),before.trim());
}));
test('v0.3.55 refuses unrelated uncommitted files and an existing migration branch',()=>withRepo(async({root})=>{
 await fs.writeFile(path.join(root,'unrelated.txt'),'preserve');
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/uncommitted|unrelated/);
 await fs.rm(path.join(root,'unrelated.txt'));
 const branch=migration.migrationBranch('react','1.1.12',fixture.SHA);
 git(root,'branch',branch);
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/already exists/);
 assert.equal(git(root,'branch','--show-current'),'bootstrap/react-initial');
}));
test('v0.3.55 full Save Stack tests, commits and publishes *only* verified migration branch',()=>withRepo(async({root,upstream,baseCommit})=>{
 const mainCommit=git(root,'rev-parse','main');
 const effects={install:async()=>{},execute:async(_root,{operation})=>{
  assert.equal(await fs.stat(path.join(root,'src/main.tsx')).then(()=>true,()=>false),true);
  return {relative:'',operation,passed:true,logs:'simulated approved test'};
 },portAvailable:async()=>true,launch:async()=>{},waitHealth:async()=>{},isRunning:()=>true};
 const output=await bootstrap.bootstrap({root,stackId:'react',effects,openBrowser:async()=>true});
 assert.equal(output.pushed,true);
 assert.match(output.branch,/^migration\/react-catalog-/);
 assert.equal(git(root,'rev-parse','bootstrap/react-initial'),baseCommit);
 assert.equal(git(root,'rev-parse','main'),mainCommit);
 assert.equal(git(upstream,'rev-parse','refs/heads/bootstrap/react-initial'),baseCommit);
 assert.equal(git(upstream,'rev-parse','refs/heads/main'),mainCommit);
 assert.equal(git(upstream,'rev-parse','refs/heads/'+output.branch),output.repo.sha);
 assert.equal(git(root,'status','--porcelain'),'');
},{remote:true}));
test('v0.3.55 does not publish when migrated starter tests fail; existing bootstrap remote unchanged',()=>withRepo(async({root,upstream,baseCommit})=>{
 const fail={install:async()=>{},execute:async()=>({passed:false,logs:'intentional red test'})};
 await assert.rejects(bootstrap.bootstrap({root,stackId:'react',effects:fail}),/test failed/);
 assert.match(git(root,'branch','--show-current'),/^migration\//);
 assert.equal(git(upstream,'rev-parse','refs/heads/bootstrap/react-initial'),baseCommit);
 assert.equal(git(upstream,'branch','-r').includes('migration/'),false);
 // Next invocation resumes verified, isolated in-progress migration.
 const resume={install:async()=>{},execute:async(_root,{operation})=>({relative:'',operation,passed:true}),portAvailable:async()=>true,launch:async()=>{},waitHealth:async()=>{},isRunning:()=>true};
 const result=await bootstrap.bootstrap({root,stackId:'react',effects:resume,openBrowser:async()=>true});
 assert.equal(result.pushed,true);
 assert.match(result.branch,/migration\//);
},{remote:true}));
