'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const catalog=require('../src/github-sdlc-catalog');
const offline=require('../src/offline-sdlc-library');
const crypto=require('node:crypto');
const TABLE=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc32(bytes){let n=0xffffffff;for(const x of bytes)n=TABLE[(n^x)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function zip(files){
 let local=[],central=[],offset=0;
 for(const [name,text] of Object.entries(files)){
  const data=Buffer.from(text),filename=Buffer.from(name),crc=crc32(data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);
  header.writeUInt16LE(20,4);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);
  header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
  local.push(header,filename,data);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);
  entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(crc,16);
  entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);
  entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE((0o100644<<16)>>>0,38);
  entry.writeUInt32LE(offset,42);central.push(entry,filename);
  offset+=header.length+filename.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);
 end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}
function fixture(prefix=''){
 const p=prefix;
 return {
  [p+'catalog.json']:JSON.stringify({schema:1,version:'1.1.14',roles:['developer'],techStacks:['react-node']}),
  [p+'VERSION']:'1.1.14\n',
  [p+'roles/developer/SKILL.md']:'# Developer\n',
  [p+'tech-stacks/react-node/stack.yaml']:'name: React Node\n',
  [p+'tech-stacks/react-node/scaffold/package.json']:'{}\n',
  [p+'ai-harness/skills/dev-tdd-plan/SKILL.md']:'# Plan\n',
 };
}
const repo='https://github.com/aia/test-library';
test('Start-page ZIP icon appears next to SDLC Library URL and sends host picker command',async()=>{
 const root=path.join(__dirname,'..');
 const [html,js,runtime]=await Promise.all(['src/lib/webview/dashboard-html.js','media/start.js','src/lib/runtime/extension-runtime.js']
  .map(p=>fs.readFile(path.join(root,p),'utf8')));
 const url=html.indexOf('id="startupLibraryRepo"'),upload=html.indexOf('id="startupLibraryZipUpload"');
 assert.ok(url>0&&upload>url&&upload-url<650);
 assert.match(js,/send\('importLibraryZip',\{repositoryUrl\}\)/);
 assert.match(runtime,/case 'importLibraryZip':/);
 assert.match(runtime,/offlineLibrary\.importZip/);
});
test('imports a GitHub-style ZIP offline, exposes catalog skills, and retains user original',async(t)=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-offline-zip-'));
 t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 await fs.mkdir(path.join(workspace,'.atgv'));
 const file=path.join(workspace,'library.zip'),source=zip(fixture('tech-stacks-skills-main/'));
 await fs.writeFile(file,source);
 const result=await offline.importZip({file,workspace,repositoryUrl:repo});
 assert.equal(result.version,'1.1.14');assert.equal(result.roleCount,1);assert.equal(result.stackCount,1);
 const active=await offline.imported(workspace,repo);
 assert.equal(active.offline,true);assert.equal(active.version,'1.1.14');
 assert.equal((await catalog.activeRoot(workspace)).offline,true);
 assert.match(await catalog.activeFile(workspace,'roles/developer/SKILL.md'),/Developer/);
 assert.deepEqual(await fs.readFile(file),source);
 assert.equal(await offline.removeAfterVerifiedGit(workspace,repo),false);
});
test('rejects ZIP path traversal, bad manifest and mismatched repository, without removing import',async(t)=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-offline-reject-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 await fs.mkdir(path.join(workspace,'.atgv'));
 assert.throws(()=>offline.readArchive(zip({'../oops.txt':'oops',...fixture()})),/Unsafe path/);
 assert.throws(()=>offline.readArchive(zip({'catalog.json':'{}'})),/manifest|catalog|schema|roles/i);
 const file=path.join(workspace,'library.zip');await fs.writeFile(file,zip(fixture()));
 await offline.importZip({file,workspace,repositoryUrl:repo});
 assert.equal(await offline.imported(workspace,'https://github.com/aia/different-library'),null);
 await assert.rejects(()=>offline.importZip({file,workspace,repositoryUrl:repo}),/already installed/);
});
test('removes only unchanged offline copy after authenticated Git checkout is verified',async(t)=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-offline-clean-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 await fs.mkdir(path.join(workspace,'.atgv'));
 const file=path.join(workspace,'library.zip');await fs.writeFile(file,zip(fixture()));
 await offline.importZip({file,workspace,repositoryUrl:repo});
 const before=catalog.gitInstalled;
 try{
  catalog.gitInstalled=async()=>({checkout:path.join(workspace,'.atgv','sdlc-catalog'),sha:'a'.repeat(40)});
  assert.equal(await offline.removeAfterVerifiedGit(workspace,repo),true);
  assert.equal(await offline.imported(workspace,repo),null);
  assert.equal((await fs.stat(file)).isFile(),true);
 }finally{catalog.gitInstalled=before;}
});
test('modified import must be preserved, never deleted after GitHub recovery',async(t)=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-offline-preserve-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 await fs.mkdir(path.join(workspace,'.atgv'));
 const file=path.join(workspace,'library.zip');await fs.writeFile(file,zip(fixture()));
 const result=await offline.importZip({file,workspace,repositoryUrl:repo});
 await fs.writeFile(path.join(result.root,'roles','developer','SKILL.md'),'# Edited locally\n');
 const before=catalog.gitInstalled;
 try{
  catalog.gitInstalled=async()=>({checkout:'/verified/catalog',sha:'a'.repeat(40)});
  await assert.rejects(()=>offline.removeAfterVerifiedGit(workspace,repo),/modified/);
  assert.equal((await fs.stat(result.root)).isDirectory(),true);
 }finally{catalog.gitInstalled=before;}
});
