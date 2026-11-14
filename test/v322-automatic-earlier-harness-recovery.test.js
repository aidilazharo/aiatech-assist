'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const recovery=require('../src/developer-tdd-harness-recovery');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function fixture(callback){
 const storageRoot=await fs.mkdtemp(path.join(os.tmpdir(),'atgv322-'));
 const worktree=path.join(storageRoot,'developer-br-worktrees','project','BR-012');
 const files={'src/__tests__/br012-ac06.test.tsx':'test("AC06 persistence",()=>{throw Error("not implemented yet")});','src/App.tsx':'export const App=()=>null;'};
 await fs.mkdir(path.join(worktree,'src/__tests__'),{recursive:true});
 const checkpoint={files:{}};
 for(const [rel,source] of Object.entries(files)){await fs.writeFile(path.join(worktree,rel),source);checkpoint.files[rel]=sha(source);}
 try{await callback({worktree,storageRoot,projectId:'project',brId:'BR-012',checkpoint,files});}
 finally{await fs.rm(storageRoot,{recursive:true,force:true});}
}
test('v322: excludes only locked later AC06 during earlier test execution and restores identical bytes',()=>fixture(async x=>{
 const rel='src/__tests__/br012-ac06.test.tsx';
 let executed=false;
 const answer=await recovery.withDeferredTests({...x,files:[rel],run:async()=>{
  executed=true;
  await assert.rejects(fs.access(path.join(x.worktree,rel)),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(x.worktree,'src/App.tsx'),'utf8'),x.files['src/App.tsx']);
  return {ran:true};
 }});
 assert.equal(executed,true);assert.deepEqual(answer,{ran:true});
 assert.equal(await fs.readFile(path.join(x.worktree,rel),'utf8'),x.files[rel]);
 assert.equal((await recovery.restoreInterruptedDeferredTests(x)).restored,0);
}));
test('v322: restores later locked RED even when earlier test runner fails',()=>fixture(async x=>{
 const rel='src/__tests__/br012-ac06.test.tsx';
 await assert.rejects(recovery.withDeferredTests({...x,files:[rel],run:async()=>{throw Error('RED intentionally failed');}}),/RED intentionally failed/);
 assert.equal(sha(await fs.readFile(path.join(x.worktree,rel))),x.checkpoint.files[rel]);
}));
test('v322: rejects changed/unverified test files without executing test runner',()=>fixture(async x=>{
 const rel='src/__tests__/br012-ac06.test.tsx';
 await assert.rejects(recovery.withDeferredTests({...x,checkpoint:{files:{...x.checkpoint.files,[rel]:'0'.repeat(64)}},files:[rel],run:async()=>assert.fail('must not execute')}),/checkpoint mismatch/);
 assert.equal(await fs.readFile(path.join(x.worktree,rel),'utf8'),x.files[rel]);
}));
test('v322: restores crash-interrupted test with verified journal, refuses modified checkpoint',()=>fixture(async x=>{
 const rel='src/__tests__/br012-ac06.test.tsx', dir=path.join(x.storageRoot,'developer-red-harness-deferred','project','BR-012','crashed');
 await fs.mkdir(dir,{recursive:true});
 const backup=sha(rel)+'-'+path.basename(rel);
 await fs.writeFile(path.join(dir,backup),x.files[rel]);
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({worktree:x.worktree,projectId:'project',brId:'BR-012',files:[{path:rel,sha256:x.checkpoint.files[rel],backup}]}));
 await fs.unlink(path.join(x.worktree,rel));
 await assert.rejects(recovery.restoreInterruptedDeferredTests({...x,checkpoint:{files:{[rel]:'0'.repeat(64)}}}),/checkpoint differs/);
 const outcome=await recovery.restoreInterruptedDeferredTests(x);
 assert.equal(outcome.restored,1);
 assert.equal(await fs.readFile(path.join(x.worktree,rel),'utf8'),x.files[rel]);
}));
test('v322: incomplete backup without a journal cannot remove locked tests',()=>fixture(async x=>{
 const rel='src/__tests__/br012-ac06.test.tsx';
 const dir=path.join(x.storageRoot,'developer-red-harness-deferred','project','BR-012','incomplete');
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'uncommitted-backup'),x.files[rel]);
 assert.equal((await recovery.restoreInterruptedDeferredTests(x)).restored,0);
 await assert.rejects(fs.access(dir),{code:'ENOENT'});
 assert.equal(sha(await fs.readFile(path.join(x.worktree,rel))),x.checkpoint.files[rel]);
}));
test('v322: host rewinds only earlier AC and preserves later locked AC through test runs',()=>{
 const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/ready-earlier-only/);
 assert.match(host,/preservedLaterIndex=review\.preservedIndex/);
 assert.match(host,/lockedTests\.push\(\.\.\.await developerTdd\.snapshotBeforeChanges\(run\.worktree,deferredLockedPaths/);
 assert.match(host,/withEarlierOnlyTests\(cycleIndex,\(\)=>developerTdd\.runTests/);
 assert.match(host,/restoreInterruptedDeferredTests/);
});
