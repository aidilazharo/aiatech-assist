'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {clearOnReinstall,CACHE_DIRS,SIGNATURE_KEY}=require('../src/library-install-cache');
const versions=require('../src/library-update-version');
const source=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
function state(){const values=new Map();return {get:(k,v)=>values.get(k)??v,update:async(k,v)=>{if(v===undefined)values.delete(k);else values.set(k,v);}};}
test('reinstall clears only disposable caches once, leaving all BR files/settings intact',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-reinstall-'));
 try{
  const project=path.join(root,'projects','p1','documents','requirements');
  await fs.mkdir(project,{recursive:true});await fs.writeFile(path.join(project,'approved.md'),'PRESERVE');
  await fs.mkdir(path.join(root,'keep-settings'));await fs.writeFile(path.join(root,'keep-settings','config.json'),'PRESERVE');
  for(const name of CACHE_DIRS){await fs.mkdir(path.join(root,name),{recursive:true});await fs.writeFile(path.join(root,name,'old'),'STALE');}
  const globalState=state(),args={storageRoot:root,signature:'0.3.79|install|1711',globalState};
  assert.deepEqual((await clearOnReinstall(args)).removed,[...CACHE_DIRS]);
  assert.equal(await fs.readFile(path.join(project,'approved.md'),'utf8'),'PRESERVE');
  assert.equal(await fs.readFile(path.join(root,'keep-settings','config.json'),'utf8'),'PRESERVE');
  for(const name of CACHE_DIRS)await assert.rejects(fs.stat(path.join(root,name)),{code:'ENOENT'});
  await fs.mkdir(path.join(root,CACHE_DIRS[0]));await fs.writeFile(path.join(root,CACHE_DIRS[0],'fresh'),'KEEP');
  assert.equal((await clearOnReinstall(args)).changed,false);
  assert.equal(await fs.readFile(path.join(root,CACHE_DIRS[0],'fresh'),'utf8'),'KEEP');
  assert.equal(globalState.get(SIGNATURE_KEY),'0.3.79|install|1711');
  assert.equal((await clearOnReinstall({...args,signature:'0.3.79|reinstalled|1712'})).changed,true);
  await assert.rejects(fs.stat(path.join(root,CACHE_DIRS[0])),{code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('symlink target is rejected before clearing any cache',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-reinstall-safe-'));
 const external=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-outside-'));
 try{
  await fs.writeFile(path.join(external,'keep'),'PRESERVE');
  await fs.mkdir(path.join(root,CACHE_DIRS[0]));
  try{await fs.symlink(external,path.join(root,'updates'),'dir');}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('Symlink creation blocked');return;}throw e;}
  const globalState=state();
  await assert.rejects(clearOnReinstall({storageRoot:root,signature:'new',globalState}),/Unsafe cache folder/);
  assert.equal(await fs.readFile(path.join(external,'keep'),'utf8'),'PRESERVE');
  assert.equal((await fs.stat(path.join(root,CACHE_DIRS[0]))).isDirectory(),true);
 }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(external,{recursive:true,force:true});}
});
test('Library header shows one active version while Settings retains available versions',()=>{
 assert.deepEqual(versions.compareInstalledRemote('','1.1.15'),{available:true,reason:'not-installed',installed:'',remote:'1.1.15'});
 assert.deepEqual(versions.compareInstalledRemote('1.1.12','1.1.15'),{available:true,reason:'newer',installed:'1.1.12',remote:'1.1.15'});
 assert.equal(versions.compareInstalledRemote('1.1.15','1.1.15').available,false);
 assert.equal(versions.displayLibraryUpdate('','1.1.15').message,'A verified SDLC Library is available for installation.');
 assert.match(ui,/updateBrandLibraryVersion\(state\)/);
 assert.match(ui,/Library v'\+installed:' · Library not installed'/);
 assert.doesNotMatch(ui.slice(ui.indexOf('function updateBrandLibraryVersion('),ui.indexOf("window.addEventListener('resize',fitBrandVersionLines)")),/state\?\.remote| → v/);
});
test('startup version polling is read-only, Pull Catalog remains pinned and failures visible',()=>{
 const begin=source.indexOf('async function catalogCheck('),end=source.indexOf('function scheduleCatalogChecks()',begin);
 const check=source.slice(begin,end);
 assert.match(check,/remoteVersion\(config,token\)/);
 assert.doesNotMatch(check,/syncGitWorkspace\(/);
 const status=source.slice(source.indexOf('async function catalogUiState('),begin);
 assert.doesNotMatch(status,/sdlcCatalog\.cached\(/);
 assert.match(source,/await installCache\.clearOnReinstall/);
 assert.match(source,/libraryUpdateVersion\.verifyActivatedPull\(pinned,selected\)/);
 assert.match(source,/action:'pull',success:false/);
});
