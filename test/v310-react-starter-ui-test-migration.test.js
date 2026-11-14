'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const migration=require('../src/developer-starter-test-migration');
const fixture=path.join(__dirname,'fixtures/catalog/tech-stacks/react/scaffold/src/App.test.tsx');
async function setup(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v310-scaffold-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const repo=path.join(root,'approved'),worktree=path.join(root,'worktree'),storage=path.join(root,'storage');
 await fs.mkdir(path.join(repo,'src'),{recursive:true});
 await fs.mkdir(path.join(worktree,'src'),{recursive:true});
 await fs.mkdir(storage);
 const stock=await fs.readFile(fixture,'utf8');
 await fs.writeFile(path.join(repo,'src','App.test.tsx'),stock);
 await fs.writeFile(path.join(worktree,'src','App.test.tsx'),stock);
 const args={worktree,approvedRepository:repo,storageRoot:storage,projectId:'TC',brId:'BR-001',stackId:'react',brText:'CRUD for person names only'};
 return {root,repo,worktree,storage,stock,args,file:path.join(worktree,'src','App.test.tsx')};
}
test('v0.3.13 retires only the exact catalog React task-demo UI assertions inside an isolated worktree',async t=>{
 const s=await setup(t);
 const result=await migration.retireReactDemoTest(s.args);
 assert.equal(result.path,'src/App.test.tsx');
 assert.match(await fs.readFile(s.file,'utf8'),/Application render smoke/);
 assert.doesNotMatch(await fs.readFile(s.file,'utf8'),/New task|ATGV React/);
 assert.equal(await fs.readFile(result.archive,'utf8'),s.stock);
 assert.equal(await fs.readFile(path.join(s.repo,'src','App.test.tsx'),'utf8'),s.stock);
 assert.equal(await migration.retireReactDemoTest(s.args),null);
});
test('v0.3.13 preserves catalog task tests when the BR is actually about managing tasks',async t=>{
 const s=await setup(t);
 assert.equal(await migration.retireReactDemoTest({...s.args,brText:'Approved task management app with task list'}),null);
 assert.equal(await fs.readFile(s.file,'utf8'),s.stock);
});
test('v0.3.13 refuses to rewrite user-edited demo tests even if the old assertion text remains',async t=>{
 const s=await setup(t);
 await fs.appendFile(s.file,'\n// extra custom test');
 await assert.rejects(migration.retireReactDemoTest(s.args),/not an exact catalog starter/);
 assert.match(await fs.readFile(s.file,'utf8'),/extra custom test/);
});
test('v0.3.13 ignores unrelated custom application tests',async t=>{
 const s=await setup(t);
 await fs.writeFile(s.file,"import {test} from 'vitest'; test('real app',()=>{});");
 assert.equal(await migration.retireReactDemoTest(s.args),null);
});
test('v0.3.13 rejects the approved repo as migration target',async t=>{
 const s=await setup(t);
 await assert.rejects(migration.retireReactDemoTest({...s.args,worktree:s.repo}),/isolated worktree/);
});
test('v0.3.13 does not follow symlinks to replace starter tests',async t=>{
 const s=await setup(t);
 await fs.rm(s.file);
 await fs.symlink(path.join(s.repo,'src','App.test.tsx'),s.file);
 await assert.rejects(migration.retireReactDemoTest(s.args),/Unsafe React starter test/);
 assert.equal(await fs.readFile(path.join(s.repo,'src','App.test.tsx'),'utf8'),s.stock);
});
test('v0.3.13 migration supports CRLF on Windows',async t=>{
 const s=await setup(t);
 await fs.writeFile(s.file,s.stock.replace(/\n/g,'\r\n'));
 assert.ok(await migration.retireReactDemoTest(s.args));
});
test('v0.3.13 keeps Product BR-specific RED/GREEN tests mandatory and visible',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/retireReactDemoTest/);
 assert.match(host,/developerTdd\.runTests\(run\.worktree,repoRoot,progress,check,'green'\)/);
 assert.match(host,/await developerTdd\.assertLockedTests\(lockedTests\)/);
 assert.match(host,/if\(!resuming\)\{\s*const scaffoldEvidence=/);
 assert.match(host,/if\(resuming\)await capture\(\)/);
});
