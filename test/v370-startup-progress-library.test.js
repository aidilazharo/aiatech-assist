'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const catalog=require('../src/github-sdlc-catalog');
const offline=require('../src/offline-sdlc-library');
const readiness=require('../src/lib/startup-readiness');
const root=path.join(__dirname,'..');
const table=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc(bytes){let n=0xffffffff;for(const x of bytes)n=table[(n^x)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function zip(files){
 const local=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const body=Buffer.from(text),label=Buffer.from(name),sum=crc(body);
  const hdr=Buffer.alloc(30);hdr.writeUInt32LE(0x04034b50,0);hdr.writeUInt16LE(20,4);hdr.writeUInt32LE(sum,14);hdr.writeUInt32LE(body.length,18);hdr.writeUInt32LE(body.length,22);hdr.writeUInt16LE(label.length,26);
  local.push(hdr,label,body);
  const cen=Buffer.alloc(46);cen.writeUInt32LE(0x02014b50,0);cen.writeUInt16LE(20,4);cen.writeUInt16LE(20,6);cen.writeUInt32LE(sum,16);cen.writeUInt32LE(body.length,20);cen.writeUInt32LE(body.length,24);cen.writeUInt16LE(label.length,28);cen.writeUInt32LE((0o100644<<16)>>>0,38);cen.writeUInt32LE(offset,42);central.push(cen,label);
  offset+=hdr.length+label.length+body.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}
function files(version,text){const p='tech-stacks-skills-source/';return {
 [p+'catalog.json']:JSON.stringify({schema:1,version,roles:['software-developer'],techStacks:['react']}),
 [p+'VERSION']:version+'\n',
 [p+'roles/software-developer/SKILL.md']:text,
 [p+'tech-stacks/react/stack.json']:JSON.stringify({schema:1,id:'react'}),
 [p+'tech-stacks/react/scaffold/package.json']:'{}\n'
};}
const repo='https://github.com/aiamalaysia/test-sdlc-library';
test('ZIP upload activates catalog even when an old Git checkout marker exists',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v370-lib-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 await fs.mkdir(path.join(workspace,'.atgv'),{recursive:true});
 await fs.writeFile(path.join(workspace,'.atgv','sdlc-catalog-state.json'),JSON.stringify({ref:'main',sha:'a'.repeat(40),repository:'aiamalaysia/test-sdlc-library'}));
 const file=path.join(workspace,'src.zip');await fs.writeFile(file,zip(files('1.1.15','# V1.1.15 Developer\n')));
 const imported=await offline.importZip({file,workspace,repositoryUrl:repo});
 assert.equal(imported.version,'1.1.15');
 assert.equal((await catalog.activeRoot(workspace)).offline,true);
 assert.equal((await catalog.activeManifest(workspace)).version,'1.1.15');
 assert.match(await catalog.activeFile(workspace,'roles/software-developer/SKILL.md'),/V1.1.15/);
});
test('second ZIP load is idempotent; a newer archive replaces only verified previous data',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v370-replace-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const file=path.join(workspace,'src.zip');
 await fs.writeFile(file,zip(files('1.1.14','# Original Developer\n')));
 assert.equal((await offline.importZip({file,workspace,repositoryUrl:repo})).version,'1.1.14');
 assert.equal((await offline.importZip({file,workspace,repositoryUrl:repo})).unchanged,true);
 await fs.writeFile(file,zip(files('1.1.15','# Updated Developer\n')));
 const latest=await offline.importZip({file,workspace,repositoryUrl:repo});
 assert.equal(latest.version,'1.1.15');
 assert.match(await catalog.activeFile(workspace,'roles/software-developer/SKILL.md'),/Updated Developer/);
 const backups=(await fs.readdir(path.join(workspace,'.atgv'))).filter(x=>x.startsWith('.offline-sdlc-backup-'));
 assert.equal(backups.length,0);
});
test('semantic library versions compare numerically and prereleases are ordered',()=>{
 assert.ok(offline.compareVersions('1.1.15','1.1.9')>0);
 assert.ok(offline.compareVersions('1.2.0','1.11.99')>0);
 assert.ok(offline.compareVersions('1.1.15','1.1.15-rc.2')>0);
 assert.ok(offline.compareVersions('1.1.15-rc.10','1.1.15-rc.2')>0);
 assert.equal(offline.compareVersions('1.1.15+build.1','1.1.15+build.2'),0);
 assert.throws(()=>offline.compareVersions('latest','1.1.15'),/Invalid SDLC Library/);
});
test('ZIP importer does not downgrade a newer previously installed ZIP',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v372-no-downgrade-'));
 t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const file=path.join(workspace,'source.zip');
 await fs.writeFile(file,zip(files('1.1.16','# New Developer\\n')));
 await offline.importZip({file,workspace,repositoryUrl:repo});
 await fs.writeFile(file,zip(files('1.1.9','# Older Developer\\n')));
 const result=await offline.importZip({file,workspace,repositoryUrl:repo});
 assert.equal(result.version,'1.1.16');
 assert.equal(result.unchanged,true);
 assert.match(await catalog.activeFile(workspace,'roles/software-developer/SKILL.md'),/New Developer/);
});
test('ZIP importer prefers a verified Git checkout for equal or higher versions',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v372-git-preferred-'));
 t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const file=path.join(workspace,'source.zip');
 await fs.writeFile(file,zip(files('1.1.15','# ZIP Developer\\n')));
 const original=catalog.gitInstalled;
 try{
  catalog.gitInstalled=async()=>({sha:'a'.repeat(40),version:'1.1.16',checkout:path.join(workspace,'verified-git'),repository:'aiamalaysia/test-sdlc-library',roleCount:1,stackCount:1});
  const selected=await offline.importZip({file,workspace,repositoryUrl:repo});
  assert.equal(selected.version,'1.1.16');
  assert.equal(selected.selectedSource,'github');
  assert.equal(await offline.imported(workspace,repo),null);
 }finally{catalog.gitInstalled=original;}
});
test('newer ZIP survives a verified older Git checkout',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v372-zip-preserved-'));
 t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const file=path.join(workspace,'source.zip');
 await fs.writeFile(file,zip(files('1.1.16','# Newer ZIP\\n')));
 await offline.importZip({file,workspace,repositoryUrl:repo});
 const original=catalog.gitInstalled;
 try{
  catalog.gitInstalled=async()=>({sha:'a'.repeat(40),version:'1.1.15',checkout:'/verified-git'});
  assert.equal(await offline.removeAfterVerifiedGit(workspace,repo),false);
  assert.equal((await catalog.activeRoot(workspace)).version,'1.1.16');
 }finally{catalog.gitInstalled=original;}
});
test('ZIP VERSION and catalog.json must be consistent before activation',()=>{
 const fixtureFiles=files('1.1.16','# Contract\\n');
 fixtureFiles['tech-stacks-skills-source/VERSION']='1.1.15\\n';
 assert.throws(()=>offline.readArchive(zip(fixtureFiles)),/VERSION and catalog.json version must match/);
});
test('prerequisite progress events reflect checked tools and all five stacks',async()=>{
 const events=[];
 const r=await readiness.check({onProgress:p=>events.push(p),runner:async()=>({stdout:'v30.0.0',stderr:''})});
 assert.equal(r.stacks.length,5);
 assert.deepEqual(r.stacks.map(s=>s.id),readiness.STACKS.map(s=>s.id));
 assert.equal(events.length,Object.keys(readiness.TOOLS).length);
 assert.deepEqual(events.map(p=>p.completed),events.map((_,i)=>i+1));
 assert.equal(events.at(-1).percent,100);
 assert.equal(new Set(events.map(p=>p.name)).size,events.length);
});
test('start wizard must show connection screen, all stack checks, and a real project-opening progress bar',async()=>{
 const [runtime,js,html]=await Promise.all(['src/lib/runtime/extension-runtime.js','media/start.js','src/lib/webview/dashboard-html.js'].map(f=>fs.readFile(path.join(root,f),'utf8')));
 assert.match(runtime,/required:!startupSessionProceedApproved/);
 assert.match(runtime,/startupSessionProceedApproved=true/);
 assert.match(runtime,/startupSessionProceedApproved=false/);
 assert.doesNotMatch(runtime,/if\(startupIsComplete\(\)\)await finishManualProjectDiscovery\(sequence\)/);
 assert.match(html,/id="startupConnectionForm"/);
 for(const id of ['startupScanToolTrack','startupScanToolFill','startupStackGrid','gateOpenTrack','gateOpenFill','gateOpenPercent'])assert.ok(html.includes('id="'+id+'"'),id+' missing');
 assert.match(js,/function renderStartupScanPlaceholders\(/);
 assert.match(js,/function startupScanPercent\(/);
 assert.match(js,/function gateOpeningPercent\(/);
 assert.match(runtime,/startupReadiness\.check\(\{onProgress:/);
 for(const stage of ['connectionsVerified','workspaceReady','workspace'])assert.ok(runtime.includes("openingProgress('"+stage+"'"),stage+' missing');
});
