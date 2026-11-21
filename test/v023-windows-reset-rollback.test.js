'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const reset=require('../src/lib/reset/local-reset');
const {ensureWorkspaceLibrary}=require('../src/tech-stacks');
const {ProjectRegistry}=require('../src/projects');
const transient=code=>Object.assign(Error('Simulated Windows '+code+': locked directory'),{code});
const exists=async filename=>fs.lstat(filename).then(()=>true,error=>error.code==='ENOENT'?false:Promise.reject(error));
async function fixture(t){
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-reset-23-'));
 t.after(()=>fs.rm(workspace,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 await ensureWorkspaceLibrary(workspace);
 const registry=new ProjectRegistry(workspace);
 await registry.ensureRoot();
 await fs.mkdir(path.join(workspace,'projects','demo'));
 await fs.writeFile(path.join(workspace,'projects','demo','only-local.txt'),'original local data');
 await fs.writeFile(path.join(workspace,'user-notes.txt'),'unmanaged file');
 const stage=await fs.mkdtemp(path.join(workspace,'.atgv-reset-staging-'));
 const stagedWorkspace=path.join(stage,'workspace');
 await fs.mkdir(stagedWorkspace);
 await ensureWorkspaceLibrary(stagedWorkspace);
 await fs.mkdir(path.join(stagedWorkspace,'projects','demo'),{recursive:true});
 await fs.writeFile(path.join(stagedWorkspace,'projects','demo','from-github.txt'),'verified remote data');
 return {workspace,registry,stage,stagedWorkspace,
  args:{workspace,registry,stage,stagedWorkspace,storageRoot:path.join(workspace,'global-storage'),workspaceHash:'testhash'}};
}
test('Windows rename helper retries bounded EPERM, EACCES, EBUSY only',async()=>{
 const calls=[],delay=[];
 await reset.renameWithRetry('source','destination',{rename:async()=>{calls.push(1);if(calls.length<4)throw transient('EPERM');},delay:async value=>delay.push(value)});
 assert.equal(calls.length,4);assert.deepEqual(delay,[80,180,350]);
 let count=0;
 await assert.rejects(reset.renameWithRetry('a','b',{rename:async()=>{count++;throw transient('ENOENT');},delay:async()=>{}}),{code:'ENOENT'});
 assert.equal(count,1);
});
test('successful Reset swaps validated directories and keeps unrelated workspace data',async t=>{
 const f=await fixture(t);
 const result=await reset.replaceLocalWorkspace(f.args);
 assert.deepEqual(result.warnings,[]);
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','from-github.txt'),'utf8'),'verified remote data');
 assert.equal(await exists(path.join(f.workspace,'projects','demo','only-local.txt')),false);
 assert.equal(await fs.readFile(path.join(f.workspace,'user-notes.txt'),'utf8'),'unmanaged file');
 assert.equal(await exists(f.stage),false);
});
test('persistent staged .atgv EPERM plus failed copy restores both original directories',async t=>{
 const f=await fixture(t),rename=fs.rename,cp=fs.cp;
 const stagedAtgv=path.join(f.stagedWorkspace,'.atgv');
 fs.rename=async(src,dst)=>src===stagedAtgv?Promise.reject(transient('EPERM')):rename(src,dst);
 fs.cp=async(src,...rest)=>src===stagedAtgv?Promise.reject(transient('EACCES')):cp(src,...rest);
 try{
  await assert.rejects(reset.replaceLocalWorkspace(f.args),/Transactional Reset failed: .*Original workspace directories were restored/);
 }finally{fs.rename=rename;fs.cp=cp;}
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','only-local.txt'),'utf8'),'original local data');
 assert.equal(await exists(path.join(f.workspace,'.atgv','atgv.workspace.json')),true);
 assert.equal(await exists(stagedAtgv),true,'staging stays for inspection');
 assert.equal(await exists(path.join(f.workspace,'projects','demo','from-github.txt')),false);
});
test('locked existing projects stops Reset before promotion; existing source restored',async t=>{
 const f=await fixture(t),rename=fs.rename;
 const existingProjects=path.join(f.workspace,'projects');
 fs.rename=async(src,dst)=>src===existingProjects?Promise.reject(transient('EPERM')):rename(src,dst);
 try{await assert.rejects(reset.replaceLocalWorkspace(f.args),/Transactional Reset failed/);}
 finally{fs.rename=rename;}
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','only-local.txt'),'utf8'),'original local data');
 assert.equal(await exists(path.join(f.workspace,'.atgv','atgv.workspace.json')),true);
});
test('Windows staging EPERM falls back to exclusive copy and completes safely',async t=>{
 const f=await fixture(t),rename=fs.rename;
 const stagedAtgv=path.join(f.stagedWorkspace,'.atgv');
 fs.rename=async(src,dst)=>src===stagedAtgv?Promise.reject(transient('EPERM')):rename(src,dst);
 try{await reset.replaceLocalWorkspace(f.args);}
 finally{fs.rename=rename;}
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','from-github.txt'),'utf8'),'verified remote data');
 assert.equal(await exists(path.join(f.workspace,'.atgv','atgv.workspace.json')),true);
 assert.equal(await exists(f.stage),false);
});
test('recovers v0.0.22 incomplete Reset with staged .atgv and emptied local projects',async t=>{
 const f=await fixture(t);
 await fs.rm(path.join(f.workspace,'.atgv'),{recursive:true,force:true});
 await fs.rm(path.join(f.workspace,'projects','demo'),{recursive:true,force:true});
 const recovered=await reset.recoverInterruptedReset(f.workspace);
 assert.equal(recovered.projects,1);
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','from-github.txt'),'utf8'),'verified remote data');
 assert.equal(await fs.readFile(path.join(f.workspace,'user-notes.txt'),'utf8'),'unmanaged file');
 assert.equal(await exists(path.join(f.workspace,'.atgv','atgv.workspace.json')),true);
 assert.equal(await exists(f.stage),false);
});
test('refuses retry when earlier Reset stage coexists with active local work',async t=>{
 const f=await fixture(t);
 await assert.rejects(reset.recoverInterruptedReset(f.workspace),/Previous Reset staging is still present/);
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','only-local.txt'),'utf8'),'original local data');
 assert.equal(await exists(f.stage),true);
});
