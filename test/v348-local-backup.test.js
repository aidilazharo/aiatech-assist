'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const backup=require('../src/lib/backup/local-content-backup');
const HASH='1234567890abcdef';
class State{constructor(data={}){this.data={...data};}keys(){return Object.keys(this.data);}get(key){return this.data[key];}async update(key,value){if(value===undefined)delete this.data[key];else this.data[key]=value;}}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-backup-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const workspace=path.join(root,'workspace'),storageRoot=path.join(root,'storage');
 await fs.mkdir(path.join(workspace,'projects','demo','repository','.git'),{recursive:true});
 await fs.mkdir(path.join(workspace,'.atgv','templates'),{recursive:true});
 await fs.mkdir(path.join(storageRoot,'projects',HASH),{recursive:true});
 await fs.writeFile(path.join(workspace,'projects','demo','repository','file.js'),'console.log("original");\n');
 await fs.writeFile(path.join(workspace,'projects','demo','repository','.env'),'APP_KEY=keep-locally');
 await fs.writeFile(path.join(workspace,'projects','demo','repository','.git','HEAD'),'ref: refs/heads/dev\n');
 await fs.writeFile(path.join(workspace,'.atgv','atgv.workspace.json'),JSON.stringify({managedBy:'aia-my.atgv-aiatech-assist'}));
 await fs.writeFile(path.join(storageRoot,'projects',HASH,'index.json'),'local indexed cache');
 const state=new State({'atgvAssist.activeProject':'demo','atgvAssist.ai.token':'DO_NOT_BACKUP','unrelated.setting':'keep'});
 return {root,workspace,storageRoot,workspaceHash:HASH,workspaceState:state,extensionVersion:'0.3.48',destination:path.join(root,'snapshot.atgvbackup')};
}
test('backup and restore exact project, git, .env, workspace library, cache and safe workspace state',async t=>{
 const f=await fixture(t);
 const before=await backup.createBackup(f);assert.equal(before.fileCount>=5,true);
 const scan=await backup.inspectBackup({source:f.destination,workspace:f.workspace,workspaceHash:HASH});
 assert.equal(scan.manifest.workspaceState['atgvAssist.ai.token'],undefined);
 assert.equal(scan.manifest.workspaceState['unrelated.setting'],undefined);
 assert.equal(scan.manifest.workspaceState['atgvAssist.activeProject'],'demo');
 await fs.writeFile(path.join(f.workspace,'projects','demo','repository','file.js'),'changed');
 await fs.writeFile(path.join(f.workspace,'projects','demo','repository','after-backup.js'),'unsaved work');
 await fs.writeFile(path.join(f.storageRoot,'projects',HASH,'index.json'),'changed');
 f.workspaceState.data['atgvAssist.activeProject']='other';
 const result=await backup.restoreBackup({source:f.destination,workspace:f.workspace,storageRoot:f.storageRoot,workspaceHash:HASH,workspaceState:f.workspaceState,confirm:async()=>true});
 assert.equal(result.fileCount,before.fileCount);
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','repository','file.js'),'utf8'),'console.log("original");\n');
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','repository','.env'),'utf8'),'APP_KEY=keep-locally');
 assert.equal(await fs.readFile(path.join(f.workspace,'projects','demo','repository','.git','HEAD'),'utf8'),'ref: refs/heads/dev\n');
 assert.equal(await fs.readFile(path.join(f.storageRoot,'projects',HASH,'index.json'),'utf8'),'local indexed cache');
 await assert.rejects(fs.stat(path.join(f.workspace,'projects','demo','repository','after-backup.js')),{code:'ENOENT'});
 assert.equal(f.workspaceState.get('atgvAssist.activeProject'),'demo');
 assert.equal(f.workspaceState.get('atgvAssist.ai.token'),'DO_NOT_BACKUP'); // excluded from archive; existing sensitive state remains untouched
 assert.equal(f.workspaceState.get('unrelated.setting'),'keep');
});
test('cancel restore preserves original work',async t=>{
 const f=await fixture(t);await backup.createBackup(f);
 const file=path.join(f.workspace,'projects','demo','repository','file.js');await fs.writeFile(file,'retain');
 const result=await backup.restoreBackup({source:f.destination,workspace:f.workspace,storageRoot:f.storageRoot,workspaceHash:HASH,workspaceState:f.workspaceState,confirm:async()=>false});
 assert.equal(result.cancelled,true);assert.equal(await fs.readFile(file,'utf8'),'retain');
});
test('corrupt backup payload is rejected before changing original local files',async t=>{
 const f=await fixture(t);await backup.createBackup(f);
 const scan=await backup.inspectBackup({source:f.destination,workspace:f.workspace,workspaceHash:HASH});
 const file=scan.manifest.entries.find(e=>e.kind==='file');
 const fd=await fs.open(f.destination,'r+');await fd.write(Buffer.from('CORRUPT'),0,7,file.offset);await fd.close();
 const original=path.join(f.workspace,'projects','demo','repository','file.js');await fs.writeFile(original,'must survive');
 await assert.rejects(backup.restoreBackup({source:f.destination,workspace:f.workspace,storageRoot:f.storageRoot,workspaceHash:HASH,workspaceState:f.workspaceState,confirm:async()=>true}),/incorrect header|invalid|checksum|unexpected|corrupt|Z_DATA_ERROR/i);
 assert.equal(await fs.readFile(original,'utf8'),'must survive');
});
test('refuse restore into another workspace and backups inside managed directories',async t=>{
 const f=await fixture(t);await backup.createBackup(f);
 await assert.rejects(backup.inspectBackup({source:f.destination,workspace:path.join(f.root,'other'),workspaceHash:HASH}),/another workspace/);
 await assert.rejects(backup.createBackup({...f,destination:path.join(f.workspace,'projects','oops.atgvbackup')}),/outside the ATGV-managed/);
});
test('relative symlinks within project are preserved where operating system permits',async t=>{
 const f=await fixture(t),repo=path.join(f.workspace,'projects','demo','repository');
 try{await fs.symlink('file.js',path.join(repo,'file-link.js'));}catch(e){if(['EPERM','EACCES'].includes(e.code))return t.skip('Symlink permissions unavailable');throw e;}
 await backup.createBackup(f);
 await backup.restoreBackup({source:f.destination,workspace:f.workspace,storageRoot:f.storageRoot,workspaceHash:HASH,workspaceState:f.workspaceState,confirm:async()=>true});
 assert.equal(await fs.readlink(path.join(repo,'file-link.js')),'file.js');
});
test('outside-root links are rejected instead of reading private files',async t=>{
 const f=await fixture(t),repo=path.join(f.workspace,'projects','demo','repository');
 try{await fs.symlink(f.root,path.join(repo,'escape'));}catch(e){if(['EPERM','EACCES'].includes(e.code))return t.skip('Symlink permissions unavailable');throw e;}
 await assert.rejects(backup.createBackup(f),/outside its ATGV root/);
});
test('versioned settings UI and runtime both expose backup/restore controls',()=>{
 const html=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const webview=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const runtime=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 for(const id of ['backupLocalContent','restoreLocalContent']){assert.ok(html.includes(`id="${id}"`));assert.ok(webview.includes(`send(command)`));assert.ok(runtime.includes(`case '${id}':`));}
});

test('failed workspace state update rolls back managed files',async t=>{
 const f=await fixture(t);await backup.createBackup(f);
 const original=path.join(f.workspace,'projects','demo','repository','file.js');
 await fs.writeFile(original,'post-backup change');
 const state=new State({'atgvAssist.activeProject':'different'});
 const update=state.update.bind(state);let failed=false;
 state.update=async(key,value)=>{if(key==='atgvAssist.activeProject'&&value==='demo'&&!failed){failed=true;throw Error('simulated workspaceState failure');}return update(key,value);};
 await assert.rejects(backup.restoreBackup({source:f.destination,workspace:f.workspace,storageRoot:f.storageRoot,workspaceHash:HASH,workspaceState:state,confirm:async()=>true}),/simulated workspaceState failure/);
 assert.equal(await fs.readFile(original,'utf8'),'post-backup change');
 assert.equal(state.get('atgvAssist.activeProject'),'different');
});
