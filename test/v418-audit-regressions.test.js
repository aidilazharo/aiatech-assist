'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const importer=require('../src/discovery-import');
const docx=require('../src/docx-extractor');
const preflight=require('../src/ba-document-preflight');
const store=require('../src/source-store');
const library=require('../src/offline-sdlc-library');
const versions=require('../src/library-update-version');
const extUpdates=require('../src/lib/updates/github-release-updater');
const libUpdates=require('../src/lib/updates/library-release-updater');
const permissions=require('../src/lib/startup-permissions');
const readiness=require('../src/lib/startup-readiness');
const table=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc(bytes){let n=0xffffffff;for(const x of bytes)n=table[(n^x)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function zip(files){
 const local=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const body=Buffer.from(text),label=Buffer.from(name),hdr=Buffer.alloc(30),cen=Buffer.alloc(46),sum=crc(body);
  hdr.writeUInt32LE(0x04034b50,0);hdr.writeUInt16LE(20,4);hdr.writeUInt32LE(sum,14);hdr.writeUInt32LE(body.length,18);hdr.writeUInt32LE(body.length,22);hdr.writeUInt16LE(label.length,26);
  cen.writeUInt32LE(0x02014b50,0);cen.writeUInt16LE(20,4);cen.writeUInt16LE(20,6);cen.writeUInt32LE(sum,16);cen.writeUInt32LE(body.length,20);cen.writeUInt32LE(body.length,24);cen.writeUInt16LE(label.length,28);cen.writeUInt32LE((0o100644<<16)>>>0,38);cen.writeUInt32LE(offset,42);
  local.push(hdr,label,body);central.push(cen,label);offset+=hdr.length+label.length+body.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,dir,end]);
}
const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function wordFixture(){return zip({
 'word/document.xml':`<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p><w:r><w:t>Current limit RM50.</w:t></w:r><w:del><w:r><w:delText>Old limit RM10.</w:delText></w:r></w:del><w:ins><w:r><w:t> Manager approval required.</w:t></w:r></w:ins><w:r><w:rPr><w:vanish/></w:rPr><w:t>Hidden draft.</w:t></w:r><w:r><w:footnoteReference w:id="3"/></w:r></w:p><w:sectPr><w:headerReference r:id="head"/><w:footerReference r:id="foot"/></w:sectPr></w:body></w:document>`,
 'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="head" Type="${r}/header" Target="header1.xml"/><Relationship Id="foot" Type="${r}/footer" Target="footer1.xml"/><Relationship Id="notes" Type="${r}/footnotes" Target="footnotes.xml"/><Relationship Id="image" Type="${r}/image" Target="media/image1.png"/></Relationships>`,
 'word/header1.xml':`<w:hdr xmlns:w="${w}"><w:p><w:r><w:t>Header requirement</w:t></w:r></w:p></w:hdr>`,
 'word/header99.xml':`<w:hdr xmlns:w="${w}"><w:p><w:r><w:t>Orphan header</w:t></w:r></w:p></w:hdr>`,
 'word/footer1.xml':`<w:ftr xmlns:w="${w}"><w:p><w:r><w:t>Footer rule</w:t></w:r></w:p></w:ftr>`,
 'word/footnotes.xml':`<w:footnotes xmlns:w="${w}"><w:footnote w:id="3"><w:p><w:r><w:t>Referenced footnote</w:t></w:r></w:p></w:footnote><w:footnote w:id="4"><w:p><w:r><w:t>Unused footnote</w:t></w:r></w:p></w:footnote></w:footnotes>`
});}
function catalogFiles(text){const p='tech-stacks-skills-source/';return {[p+'catalog.json']:JSON.stringify({schema:1,version:'1.1.16',roles:['software-developer'],techStacks:['react']}),[p+'VERSION']:'1.1.16\n',[p+'roles/software-developer/SKILL.md']:text,[p+'tech-stacks/react/stack.json']:JSON.stringify({schema:1,id:'react'}),[p+'tech-stacks/react/scaffold/package.json']:'{}\n'};}
test('DOCX extraction includes referenced parts and insertions but excludes deleted, hidden and orphaned text',()=>{
 const text=importer.extractDocx(wordFixture());
 for(const wanted of ['Current limit RM50','Manager approval','Header requirement','Footer rule','Referenced footnote'])assert.match(text,new RegExp(wanted));
 for(const unwanted of ['Old limit RM10','Hidden draft','Orphan header','Unused footnote'])assert.doesNotMatch(text,new RegExp(unwanted));
});
test('legacy source checksum is verified against original bytes while AI receives improved extraction',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-docx-v418-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'requirements.docx'),bytes=wordFixture();await fs.writeFile(file,bytes);
 const old=docx.extractLegacyDocx(bytes),digest=crypto.createHash('sha256').update(old).digest('hex');
 const project=path.join(root,'project');await fs.mkdir(project);
 const registry={fileFor:()=>path.join(project,'project.json')},entry={name:'requirements.docx',digest};
 entry.storedName=await store.store(registry,'p',entry,file);
 const loaded=await store.read(registry,'p',entry);
 assert.equal(loaded.extractionUpgraded,true);assert.equal(loaded.digest,digest);assert.notEqual(loaded.textDigest,digest);
 assert.match(loaded.text,/Header requirement/);assert.doesNotMatch(loaded.text,/Old limit RM10/);
});
test('preflight never applies edits that invert conditions, including small changes',()=>{
 const before='An eligible account with active status may receive the monthly benefit.';
 const after='An eligible account with inactive status may receive the monthly benefit.';
 const result=preflight.parse(JSON.stringify({status:'ready',summary:'checked',edits:[{before,after,reason:'typo'}],issues:[]}),before);
 assert.equal(result.effectiveText,before);assert.equal(result.applied.length,0);assert.equal(result.skipped.length,1);
});
test('cross-section review keeps sections and rejects unverifiable conflict evidence',()=>{
 const parts=[{scope:'Only managers can approve claims.'},{scope:'Managers cannot approve claims.'}];
 const prompt=preflight.crossSectionPrompt(parts);assert.match(prompt,/Only managers/);assert.match(prompt,/Managers cannot/);
 const conflict={status:'needs-input',conflicts:[{detail:'Approval rules conflict',first:{section:1,key:'scope',quote:'Only managers'},second:{section:2,key:'scope',quote:'Managers cannot'}}]};
 assert.equal(preflight.parseCrossSection(JSON.stringify(conflict),parts).conflicts.length,1);
 conflict.conflicts[0].second.quote='invented';assert.throws(()=>preflight.parseCrossSection(JSON.stringify(conflict),parts),/valid conflict evidence/);
 assert.throws(()=>preflight.parseCrossSection('{bad',parts),/invalid JSON/);
});
test('trusted equal-version release builds replace the old verified archive without downgrading',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-release-v418-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const file=path.join(workspace,'source.zip'),repositoryUrl='https://github.com/aidilazharo/tech-stacks-skills';
 const opts={workspace,repositoryUrl};
 await fs.writeFile(file,zip(catalogFiles('Build eight')));
 await library.importZip({...opts,file,verifiedRelease:{repository:'aidilazharo/tech-stacks-skills',tag:'v1.1.16-source-build.8'}});
 await fs.writeFile(file,zip(catalogFiles('Build nine')));
 const next=await library.importZip({...opts,file,verifiedRelease:{repository:'aidilazharo/tech-stacks-skills',tag:'v1.1.16-source-build.9'}});
 assert.equal(next.releaseTag,'v1.1.16-source-build.9');assert.match(await fs.readFile(path.join(next.root,'roles/software-developer/SKILL.md'),'utf8'),/Build nine/);
 assert.equal(versions.compareInstalledRelease({version:'1.1.16',releaseTag:'v1.1.16-source-build.8'},{version:'1.1.16',tag:'v1.1.16-source-build.9'}).available,true);
 await fs.writeFile(file,zip(catalogFiles('Build eight')));
 const old=await library.importZip({...opts,file,verifiedRelease:{repository:'aidilazharo/tech-stacks-skills',tag:'v1.1.16-source-build.8'}});
 assert.equal(old.releaseTag,'v1.1.16-source-build.9');
});
test('an explicitly verified release becomes active ahead of an equal-version Git checkout',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-release-git-v418-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const file=path.join(workspace,'source.zip'),repositoryUrl='https://github.com/aidilazharo/tech-stacks-skills';
 await fs.writeFile(file,zip(catalogFiles('Released build')));
 const catalog=require('../src/github-sdlc-catalog'),original=catalog.gitInstalled;
 try{
  catalog.gitInstalled=async()=>({version:'1.1.16',sha:'a'.repeat(40),checkout:path.join(workspace,'git'),repository:'aidilazharo/tech-stacks-skills'});
  const selected=await library.importZip({workspace,file,repositoryUrl,verifiedRelease:{repository:'aidilazharo/tech-stacks-skills',tag:'v1.1.16-source-build.9'}});
  assert.equal(selected.offline,true);assert.equal((await catalog.activeRoot(workspace)).releaseTag,'v1.1.16-source-build.9');
 }finally{catalog.gitInstalled=original;}
});
test('the public distribution repository can supply a verified archive for the canonical Library',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-public-library-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const file=path.join(workspace,'source.zip'),repositoryUrl='https://github.com/aidilazharo/tech-stacks-skills';
 await fs.writeFile(file,zip(catalogFiles('Public Library release')));
 const selected=await library.importZip({workspace,file,repositoryUrl,verifiedRelease:{repository:'aidilazharo/library',tag:'v1.1.16-source-build.9'}});
 assert.equal(selected.repository,'aidilazharo/tech-stacks-skills');
 assert.equal(selected.releaseRepository,'aidilazharo/library');
 assert.equal((await library.imported(workspace,repositoryUrl)).releaseTag,'v1.1.16-source-build.9');
 await assert.rejects(library.importZip({workspace,file,repositoryUrl,verifiedRelease:{repository:'untrusted/library',tag:'v1.1.16-source-build.10'}}),/Invalid verified Library release identity/);
});
function release(repo,tag,files){return {tag_name:tag,draft:false,html_url:`https://github.com/${repo}/releases/tag/${tag}`,assets:files.map((name,i)=>({name,size:100,url:`https://api.github.com/repos/${repo}/releases/assets/${i+1}`}))};}
test('extension and library lookups compare a stable release with newer prereleases',async()=>{
 const stableLib=release(libUpdates.REPO,'v1.1.15',['tech-stacks-skills-1.1.15-source.zip','library-source.sha256']);
 const newLib=release(libUpdates.REPO,'v1.1.16-source-build.9',['tech-stacks-skills-1.1.16-source.zip','library-source.sha256']);
 const stableExt=release(extUpdates.REPO,'v0.4.16',['atgv-aiatech-assist-0.4.16.vsix','vsix.sha256']);
 const newExt=release(extUpdates.REPO,'v0.4.17-build.274',['atgv-aiatech-assist-0.4.17.vsix','vsix.sha256']);
 const request=(stable,list)=>async url=>Buffer.from(JSON.stringify(url.endsWith('/latest')?stable:list));
 assert.equal((await libUpdates.latest({request:request(stableLib,[newLib,stableLib])})).version,'1.1.16');
 assert.equal((await extUpdates.latestRelease({version:'0.4.15',repositoryUrl:extUpdates.PINNED_RELEASE_URL,request:request(stableExt,[newExt,stableExt])})).version,'0.4.17');
 assert.equal((await extUpdates.latestRelease({version:'0.4.17',includeCurrent:true,repositoryUrl:extUpdates.PINNED_RELEASE_URL,request:request(stableExt,[newExt])})).version,'0.4.17');
});
test('permission checks use temporary files and report trust and write failures',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-permissions-v418-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const ext=path.join(root,'extensions','atgv'),storage=path.join(root,'storage');await fs.mkdir(ext,{recursive:true});await fs.mkdir(storage);
 await fs.writeFile(path.join(root,'keep.txt'),'unchanged');
 const result=await permissions.check({workspacePath:root,extensionPath:ext,storagePath:storage,trusted:true});
 assert.equal(result.ok,true);assert.equal(await fs.readFile(path.join(root,'keep.txt'),'utf8'),'unchanged');
 const untrusted=await permissions.check({workspacePath:root,extensionPath:ext,storagePath:storage,trusted:false});assert.equal(untrusted.ok,false);
 const denied={...fs,open:async()=>{throw Object.assign(Error('Access denied'),{code:'EACCES'});}};
 const fail=await permissions.probeDirectory(root,{fsApi:denied});assert.equal(fail.read,true);assert.equal(fail.write,false);assert.match(fail.detail,/Access denied/);
 assert.ok(!(await fs.readdir(root)).some(x=>x.startsWith('.atgv-permission-')));
});
test('stack checks run concurrently and an error freezes only the affected stack',async()=>{
 const events=[],started=[];
 const result=await readiness.check({runner:async command=>{started.push(command);await new Promise(resolve=>setTimeout(resolve,command==='node'?1:8));if(command==='dotnet')throw Error('missing');return {stdout:command==='java'?'java 25':command==='node'?'v24.2.0':'10.0.0'};},onStackProgress:event=>events.push(event)});
 assert.equal(started.length,Object.keys(readiness.TOOLS).length);
 const dotnet=events.filter(event=>event.id==='dotnet');assert.equal(dotnet.filter(event=>event.status==='error').length,1);assert.equal(dotnet.at(-1).status,'error');
 assert.ok(events.some(event=>event.id==='react'&&event.status==='complete'));assert.equal(result.stacks.find(x=>x.id==='dotnet').ready,false);
});
