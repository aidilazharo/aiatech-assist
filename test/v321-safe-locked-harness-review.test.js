'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const recovery=require('../src/developer-tdd-harness-recovery');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
test('v321: blocked legacy recovery creates a non-destructive, hash-verified review bundle',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv321-'));
 const worktree=path.join(root,'developer-br-worktrees','project','BR-012');
 try{
  await fs.mkdir(path.join(worktree,'src','__tests__'),{recursive:true});
  await fs.mkdir(path.join(worktree,'server'),{recursive:true});
  const originals={'src/__tests__/ac05.test.tsx':'const rejectedCreateResponse=undefined; expect(rejectedCreateResponse).toBeDefined();', 'src/__tests__/ac06.test.tsx':'test("persistence", ()=>{});','server/index.mjs':'export const x=1;'};
  const checkpoint={files:{}};
  for(const [file,content] of Object.entries(originals)){await fs.writeFile(path.join(worktree,file),content);checkpoint.files[file]=sha(content)}
  const criteria=[{id:'AC-05',status:'complete',testFiles:['src/__tests__/ac05.test.tsx']},{id:'AC-06',status:'needs-attention',testFiles:['src/__tests__/ac06.test.tsx']}];
  const review={status:'review-required',items:[{criterion:'AC-05',path:'src/__tests__/ac05.test.tsx',kind:'unapproved-ui-network-assertion',sha256:checkpoint.files['src/__tests__/ac05.test.tsx']}],reason:'Earlier test invalid; AC-06 not proven invalid.'};
  const bundle=await recovery.prepareReview({worktree,storageRoot:root,projectId:'project',brId:'BR-012',checkpoint,review,criteria,failedIndex:1});
  assert.equal(bundle.summary.files.length,3);
  assert.equal(bundle.summary.failedCriterion,'AC-06');
  for(const row of bundle.summary.files){
   assert.equal(sha(await fs.readFile(path.join(bundle.folder,row.copyFile))),row.sha256);
   assert.equal(sha(await fs.readFile(path.join(worktree,row.originalPath))),row.sha256);
  }
  const manifest=JSON.parse(await fs.readFile(path.join(bundle.folder,'REVIEW.json'),'utf8'));
  assert.equal(manifest.files.length,3);
  await assert.rejects(recovery.prepareReview({worktree,storageRoot:root,projectId:'project',brId:'BR-012',checkpoint:{files:{...checkpoint.files,'src/__tests__/ac06.test.tsx':'0'.repeat(64)}},review,criteria,failedIndex:1}),/checkpoint-verified|changed or unverified/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('v321: host explains blocked recovery and stores review references without changing locked tests',()=>{
 const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/harnessRecovery\.prepareReview/);
 assert.match(host,/record\.testHarnessReview=/);
 assert.match(host,/no locked tests modified/i);
});
