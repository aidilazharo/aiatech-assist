'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const migration=require('../src/developer-starter-test-migration');
const tdd=require('../src/developer-tdd');
const guard=require('../src/developer-tdd-contract-guard');
const fixture=path.join(__dirname,'fixtures/catalog/tech-stacks/react/scaffold/server/api.test.mjs');
async function setup(t, content){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v316-'));
 t.after(()=>fs.rm(folder,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const approvedRepository=path.join(folder,'approved'),worktree=path.join(folder,'worktree'),storageRoot=path.join(folder,'storage');
 for(const root of [approvedRepository,worktree])await fs.mkdir(path.join(root,'server'),{recursive:true});
 await fs.mkdir(storageRoot);
 const original=content??await fs.readFile(fixture,'utf8');
 const target=path.join(worktree,'server','api.test.mjs');
 await fs.writeFile(target,original);
 await fs.writeFile(path.join(approvedRepository,'server','api.test.mjs'),original);
 return {folder,target,original,approvedRepository,worktree,storageRoot,projectId:'TC',brId:'BR-011',brText:'Approved person name CRUD. POST /api/people returns 201 and GET /api/people returns 200.',stackId:'react'};
}
test('v316 exact stock task API test is archived and replaced with live HTTP/SQLite bootstrap regression',async t=>{
 const s=await setup(t);
 const result=await migration.retireReactDemoApiTest(s);
 assert.equal(result.path,'server/api.test.mjs');
 assert.equal(await fs.readFile(result.archive,'utf8'),s.original);
 const replacement=await fs.readFile(s.target,'utf8');
 assert.match(replacement,/Application HTTP and SQLite bootstrap smoke/);
 assert.match(replacement,/\/api\/health/);
 assert.match(replacement,/SELECT 1 AS ok/);
 assert.doesNotMatch(replacement,/Example task|\/api\/tasks/);
 assert.equal(await fs.readFile(path.join(s.approvedRepository,'server','api.test.mjs'),'utf8'),s.original);
 assert.equal(await migration.retireReactDemoApiTest(s),null);
});
test('v316 preserves demo task tests when the BR actually requires a task API',async t=>{
 const s=await setup(t);assert.equal(await migration.retireReactDemoApiTest({...s,brText:'Task management via /api/tasks'}),null);
 assert.equal(await fs.readFile(s.target,'utf8'),s.original);
});
test('v316 verifies both older fixture and newer official task-demo test hashes',async t=>{
 const current=await fs.readFile(path.join(__dirname,'fixtures/catalog/tech-stacks/react/scaffold/server/api.test-current.mjs'),'utf8');
 const s=await setup(t,current);assert.ok(await migration.retireReactDemoApiTest(s));
});
test('v316 rejects customized task demo test and leaves original bytes untouched',async t=>{
 const s=await setup(t);await fs.appendFile(s.target,'\n// user change');
 await assert.rejects(migration.retireReactDemoApiTest(s),/not an exact verified catalog starter/);
 assert.match(await fs.readFile(s.target,'utf8'),/user change/);
});
test('v316 rejects symlinked task API file and approved repo as target',async t=>{
 const s=await setup(t);
 await assert.rejects(migration.retireReactDemoApiTest({...s,worktree:s.approvedRepository}),/isolated worktree/);
 await fs.unlink(s.target);
 await fs.symlink(path.join(s.approvedRepository,'server','api.test.mjs'),s.target);
 await assert.rejects(migration.retireReactDemoApiTest(s),/Unsafe React starter API test/);
});
test('v316 detects explicit BR API methods and blocks generated wrong route prior to RED locking',()=>{
 const br='GET /api/people returns 200. POST `/api/people` accepts JSON. PATCH /api/people/:id and DELETE /api/people/:id.';
 assert.deepEqual(guard.approvedRoutesFromBr(br),[
 {method:'GET',path:'/api/people'},
 {method:'POST',path:'/api/people'},
 {method:'PATCH',path:'/api/people/:id'},
 {method:'DELETE',path:'/api/people/:id'}
 ]);
 const bad=[{path:'src/__tests__/br-011-ac-02.test.tsx',content:"await fetch(`${baseUrl}/api/names`, {method:'POST',body:JSON.stringify({name:'Alice'})});"}];
 const review=tdd.reviewRedTestContract(br,bad);
 assert.equal(review.status,'contract-review-required');
 assert.equal(review.conflicts[0].unsupported[0].path,'/api/names');
 const okay=tdd.reviewRedTestContract(br,bad.map(x=>({...x,content:x.content.replace('/api/names','/api/people')})));
 assert.equal(okay.status,'ready');
 assert.equal(tdd.reviewRedTestContract('Simple CRUD no declared HTTP URL',bad).status,'no-explicit-api-contract');
});
test('v316 recovery archives invalid locked RED tests and removes only current AC test after verifying checkpoint',async t=>{
 const s=await setup(t);
 const file='src/__tests__/br-011-ac-02-create-red.test.tsx';
 const full=path.join(s.worktree,file);await fs.mkdir(path.dirname(full),{recursive:true});
 const content="const r=await fetch(`${baseUrl}/api/names`,{method:'POST',body:JSON.stringify({name:'Alice Smith'})});expect(r.status).toBe(201);";
 await fs.writeFile(full,content);
 const old=path.join(s.worktree,'src/__tests__/br-011-ac-01-red.test.tsx');await fs.writeFile(old,'previous passing test');
 const checkpoint={files:{[file]:crypto.createHash('sha256').update(content).digest('hex')}};
 const result=await tdd.archiveInvalidRedContract({...s,criterion:{id:'AC-02',testFiles:[file]},checkpoint});
 assert.equal(result.criterion,'AC-02');assert.equal(result.archives.length,1);
 assert.equal(await fs.readFile(result.archives[0].archive,'utf8'),content);
 assert.equal(fsSync.existsSync(full),false);
 assert.equal(await fs.readFile(old,'utf8'),'previous passing test');
});
test('v316 recovery refuses to invalidate RED tests without correct verified SHA-256',async t=>{
 const s=await setup(t),file='src/__tests__/br-011-ac-02.test.tsx';
 const full=path.join(s.worktree,file);await fs.mkdir(path.dirname(full),{recursive:true});
 const content="fetch('/api/names',{method:'POST'})";await fs.writeFile(full,content);
 await assert.rejects(tdd.archiveInvalidRedContract({...s,criterion:{id:'AC-02',testFiles:[file]},checkpoint:{files:{[file]:'wrong'}}}),/checksum differs/);
 assert.equal(await fs.readFile(full,'utf8'),content);
});
test('v316 source wires pre-lock RED contract and audited recovery without weakening locked tests',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/retireReactDemoApiTest/);
 assert.match(host,/reviewRedTestContract\(brText,redManifest\.files\)/);
 assert.match(host,/archiveInvalidRedContract/);
 assert.match(host,/assertLockedTests\(lockedTests\)/);
 assert.match(host,/repeated-noop-implementation/);
});
