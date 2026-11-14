'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const fixture=require('./catalog-fixture');
const skeleton=require('../src/project-skeleton');
const architect=require('../src/architect-simple-workflow');
const migration=require('../src/architect-scaffold-migration');
const bootstrap=require('../src/architect-stack-bootstrap');
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const exists=file=>fs.stat(file).then(()=>true,()=>false);
async function updatedCatalog(workspace){
 const dir=path.join(workspace,'.atgv','catalog-assets',fixture.SHA,'tech-stacks','react','scaffold');
 await fs.rename(path.join(dir,'src','main.jsx'),path.join(dir,'src','main.tsx'));
 await fs.rename(path.join(dir,'vite.config.js'),path.join(dir,'vite.config.ts'));
 await fs.writeFile(path.join(dir,'src','App.tsx'),'export default function App(){return null;}\n');
 await fs.writeFile(path.join(dir,'src','App.test.tsx'),'// unit test placeholder\n');
 await fs.writeFile(path.join(dir,'tsconfig.json'),'{}\n');
 await fs.writeFile(path.join(dir,'playwright.config.ts'),'export default {};\n');
 await fs.mkdir(path.join(dir,'e2e'),{recursive:true});
 await fs.writeFile(path.join(dir,'e2e','smoke.spec.ts'),'// e2e placeholder\n');
 await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:'next-react',version:'0.1.3',scripts:{test:'node --test server/api.test.mjs',build:'node --check server/index.mjs',dev:'node server/index.mjs',start:'node server/index.mjs'}})+'\n');
 await fs.writeFile(path.join(dir,'server','api.test.mjs'),(await fs.readFile(path.join(dir,'server','api.test.mjs'),'utf8'))+'\n// updated catalog\n');
 const manifest=path.join(workspace,'.atgv','catalog-assets',fixture.SHA,'catalog.json');
 const m=JSON.parse(await fs.readFile(manifest,'utf8'));m.version='1.1.6';await fs.writeFile(manifest,JSON.stringify(m));
}
async function withDraft(fn){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv309-'));
 try{
  await fixture.activate(temp);
  const root=path.join(temp,'repo');await fs.mkdir(root);
  git(root,'init','-b','main');git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');
  await skeleton.generateSkeleton(root,['react']);
  await updatedCatalog(temp);
  return await fn({temp,root});
 }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
}
test('v0.3.09 migrates pristine JS React scaffold to TS scaffold with journaled backup and passing commit plan',()=>withDraft(async({root})=>{
 const before=JSON.parse(await fs.readFile(path.join(root,'atgv.bootstrap.json'),'utf8'));
 const oldMain=await fs.readFile(path.join(root,'src/main.jsx'));
 const messages=[];
 const result=await migration.migrate({root,stackIds:['react'],onProgress:m=>messages.push(m)});
 assert.equal(result.migrated,true);
 assert.ok(result.removed.includes('src/main.jsx'));
 assert.ok(result.removed.includes('vite.config.js'));
 assert.ok(result.added.includes('src/main.tsx'));
 assert.ok(result.added.includes('vite.config.ts'));
 assert.ok(!await exists(path.join(root,'src/main.jsx')));
 assert.ok(await exists(path.join(root,'src/main.tsx')));
 assert.deepEqual(await fs.readFile(path.join(result.backupDir,'original/src/main.jsx')),oldMain);
 const after=JSON.parse(await fs.readFile(path.join(root,'atgv.bootstrap.json'),'utf8'));
 assert.equal(after.catalogVersion,'1.1.6');
 assert.notEqual(after.templateDigest,before.templateDigest);
 assert.ok(after.generatedFiles.includes('src/main.tsx'));
 assert.ok(!after.generatedFiles.includes('src/main.jsx'));
 assert.equal((await architect.generatedCommitPlan(root,['react'])).needsCommit,true);
 assert.equal((await migration.migrate({root,stackIds:['react']})).migrated,false);
 assert.equal(git(root,'status','--porcelain').includes('atgv-scaffold-migration-'),false);
 assert.ok(messages.some(m=>m.includes('Migrated verified pristine')));
}));
test('v0.3.09 refuses to migrate user-edited legacy source even with a matching manifest',()=>withDraft(async({root})=>{
 await fs.appendFile(path.join(root,'src/main.jsx'),'// user work\n');
 const original=await fs.readFile(path.join(root,'src/main.jsx'));
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/templateDigest/);
 assert.deepEqual(await fs.readFile(path.join(root,'src/main.jsx')),original);
 assert.equal(await exists(path.join(root,'src/main.tsx')),false);
}));
test('v0.3.09 rejects staged or unrelated work and preserves old scaffold',()=>withDraft(async({root})=>{
 await fs.writeFile(path.join(root,'user.txt'),'do not overwrite');
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/unrelated changes/);
 assert.ok(await exists(path.join(root,'src/main.jsx')));
 assert.equal(await exists(path.join(root,'src/main.tsx')),false);
}));
test('v0.3.09 rejects tracked existing starter without rewriting it',()=>withDraft(async({root})=>{
 git(root,'add','.');git(root,'commit','-m','initial starter');
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/tracked, ignored or missing/);
 assert.ok(await exists(path.join(root,'src/main.jsx')));
}));
test('v0.3.09 rejects additional file at new scaffold path',()=>withDraft(async({root})=>{
 await fs.writeFile(path.join(root,'src/main.tsx'),'an existing user file');
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/unrelated changes|new catalog starter path already exists/i);
 assert.equal(await fs.readFile(path.join(root,'src/main.tsx'),'utf8'),'an existing user file');
}));
test('v0.3.09 rejects unsafe legacy manifest entries without writing anything',()=>withDraft(async({root})=>{
 const f=path.join(root,'atgv.bootstrap.json');const m=JSON.parse(await fs.readFile(f,'utf8'));
 m.generatedFiles.push('../secrets.txt');await fs.writeFile(f,JSON.stringify(m));
 await assert.rejects(migration.migrate({root,stackIds:['react']}),/unsafe generated-file paths/);
 assert.ok(await exists(path.join(root,'src/main.jsx')));
}));
test('v0.3.09 Save Stack recovery migrates JS to TS before testing and safely pushes branch',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv309-bootstrap-'));
 try{
  await fixture.activate(temp);
  const remote=path.join(temp,'remote.git'),seed=path.join(temp,'seed'),root=path.join(temp,'checkout');
  execFileSync('git',['init','--bare',remote]);execFileSync('git',['init','-b','main',seed]);
  git(seed,'config','user.email','atgv@example.invalid');git(seed,'config','user.name','ATGV Test');
  await fs.writeFile(path.join(seed,'README.md'),'# Base\n');
  git(seed,'add','.');git(seed,'commit','-m','base');git(seed,'remote','add','origin',remote);git(seed,'push','-u','origin','main');
  execFileSync('git',['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/main']);
  execFileSync('git',['clone',remote,root]);git(root,'config','user.email','atgv@example.invalid');git(root,'config','user.name','ATGV Test');
  // First failed run generates old JavaScript starter (tests deliberately fail).
  const fail={install:async()=>{},execute:async()=>({passed:false,logs:'intentional test failure'})};
  await assert.rejects(bootstrap.bootstrap({root,stackId:'react',effects:fail}),/test failed/);
  await updatedCatalog(temp);
  const messages=[];
  const effects={install:async()=>{},execute:async(_root,{operation})=>{
   assert.equal(await exists(path.join(root,'src/main.tsx')),true);
   assert.equal(await exists(path.join(root,'src/main.jsx')),false);
   return {relative:'',operation,passed:true,logs:'ok'};
  },portAvailable:async()=>true,launch:async()=>{},waitHealth:async()=>{},isRunning:()=>true};
  const done=await bootstrap.bootstrap({root,stackId:'react',effects,onProgress:m=>messages.push(m),openBrowser:async()=>true});
  assert.equal(done.pushed,true);
  assert.ok(messages.some(m=>m.includes('Migrated verified pristine')));
  assert.equal(git(root,'status','--porcelain'),'');
  assert.equal(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'),done.repo.sha);
 }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
test('v0.3.09 migrates a pristine draft without changing a company-managed Git-tracked .gitignore',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv309-preserved-'));
 try{
  await fixture.activate(temp);
  const root=path.join(temp,'repo');await fs.mkdir(root);
  git(root,'init','-b','main');git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');
  await fs.writeFile(path.join(root,'.gitignore'),'# company managed ignore\n');
  git(root,'add','.gitignore');git(root,'commit','-m','baseline ignore');
  await skeleton.generateSkeleton(root,['react']);
  await updatedCatalog(temp);
  const result=await migration.migrate({root,stackIds:['react']});
  assert.equal(result.migrated,true);
  const meta=JSON.parse(await fs.readFile(path.join(root,'atgv.bootstrap.json'),'utf8'));
  assert.equal(meta.generatedFiles.includes('.gitignore'),false);
  assert.equal(await fs.readFile(path.join(root,'.gitignore'),'utf8'),'# company managed ignore\n');
  assert.equal((await architect.generatedCommitPlan(root,['react'])).needsCommit,true);
 }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
