'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const catalog=require('../src/github-sdlc-catalog');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function harness(){
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-catalog-single-'));
 const bare=path.join(tmp,'origin.git'),writer=path.join(tmp,'writer'),workspace=path.join(tmp,'workspace');
 await fs.mkdir(writer);await fs.mkdir(path.join(workspace,'.atgv'),{recursive:true});
 git(tmp,'init','--bare',bare);git(writer,'init','-b','main');git(writer,'config','user.name','Catalog Test');git(writer,'config','user.email','catalog@example.invalid');
 git(writer,'remote','add','origin',bare);
 async function publish(value){
  await fs.mkdir(path.join(writer,'roles','developer'),{recursive:true});
  await fs.mkdir(path.join(writer,'tech-stacks','react','scaffold'),{recursive:true});
  await fs.writeFile(path.join(writer,'catalog.json'),JSON.stringify({schema:1,version:value,roles:['developer'],techStacks:['react']}));
  await fs.writeFile(path.join(writer,'roles','developer','SKILL.md'),'# Developer '+value+'\n');
  await fs.writeFile(path.join(writer,'tech-stacks','react','stack.json'),JSON.stringify({id:'react'}));
  await fs.writeFile(path.join(writer,'tech-stacks','react','scaffold','package.json'),'{}\n');
  git(writer,'add','.');git(writer,'commit','-m','catalog '+value);git(writer,'push','origin','main');
 }
 await publish('1.1.0');
 return {tmp,bare,writer,workspace,publish};
}
test('Git catalog uses one stable checkout, updates tracked files and never creates SHA asset folders',async()=>{
 const x=await harness();try{
  const a=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  assert.equal(a.action,'cloned');
  assert.match(await catalog.activeFile(x.workspace,'roles/developer/SKILL.md'),/1.1.0/);
  const checkout=catalog.gitCatalogFolder(x.workspace);
  assert.equal((await fs.stat(path.join(checkout,'.git'))).isDirectory(),true);
  await x.publish('1.2.0');
  const b=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  assert.equal(b.action,'pulled');assert.notEqual(b.sha,a.sha);
  assert.match(await catalog.activeFile(x.workspace,'roles/developer/SKILL.md'),/1.2.0/);
  assert.equal((await catalog.activeRoot(x.workspace)).root,checkout);
  assert.equal((await fs.readdir(path.join(x.workspace,'.atgv'))).filter(name=>/^[a-f0-9]{40}$/.test(name)).length,0);
  assert.equal((await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills')).action,'already-current');
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
test('installed version is recovered from the matching committed manifest without adopting local edits',async()=>{
 const x=await harness();try{
  const installed=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  const stateFile=catalog.gitCatalogState(x.workspace),state=JSON.parse(await fs.readFile(stateFile,'utf8'));
  state.version='0.9.0';await fs.writeFile(stateFile,JSON.stringify(state));
  const manifest=path.join(catalog.gitCatalogFolder(x.workspace),'catalog.json');
  const original=await fs.readFile(manifest,'utf8'),changed=JSON.parse(original);changed.localOnly=true;
  await fs.writeFile(manifest,JSON.stringify(changed));
  const dirty=await catalog.gitInstalled(x.workspace,{repositoryUrl:'https://github.com/example/skills'});
  assert.equal(dirty.version,'0.9.0');assert.match(dirty.versionWarning,/local library manifest has changes/i);
  assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).version,'0.9.0');
  await fs.writeFile(manifest,original);
  const corrected=await catalog.gitInstalled(x.workspace,{repositoryUrl:'https://github.com/example/skills'});
  assert.equal(corrected.sha,installed.sha);assert.equal(corrected.version,'1.1.0');
  assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).version,'1.1.0');
  const local=JSON.parse(await fs.readFile(manifest,'utf8'));local.version='9.9.9';
  await fs.writeFile(manifest,JSON.stringify(local));
  const modified=await catalog.gitInstalled(x.workspace,{repositoryUrl:'https://github.com/example/skills'});
  assert.equal(modified.version,'1.1.0');assert.match(modified.versionWarning,/local library manifest has changes/i);
  assert.equal(JSON.parse(await fs.readFile(manifest,'utf8')).version,'9.9.9');
  assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).version,'1.1.0');
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
test('Git catalog pull preserves all dirty tracked and untracked files in a separate backup',async()=>{
 const x=await harness();try{
  const original=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  const asset=path.join(catalog.gitCatalogFolder(x.workspace),'roles','developer','SKILL.md');
  await fs.writeFile(asset,'private local edits');
  await fs.writeFile(path.join(catalog.gitCatalogFolder(x.workspace),'local-note.txt'),'important untracked data');
  await x.publish('1.2.0');
  const progress=[];
  const result=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills','',{
   onProgress:event=>progress.push(event)
  });
  assert.equal(result.action,'preserved-and-updated');
  assert.notEqual(result.sha,original.sha);
  assert.match(await fs.readFile(asset,'utf8'),/1\.2\.0/);
  assert.equal(await fs.readFile(path.join(result.backupPath,'roles','developer','SKILL.md'),'utf8'),'private local edits');
  assert.equal(await fs.readFile(path.join(result.backupPath,'local-note.txt'),'utf8'),'important untracked data');
  assert.equal(git(result.backupPath,'rev-parse','HEAD'),original.sha);
  assert.ok(result.backupPath.startsWith(path.join(x.workspace,'.atgv','catalog-local-backups')+path.sep));
  assert.ok(progress.some(event=>event.percent===60&&/Preserving/.test(event.title)));
  const installed=await catalog.gitInstalled(x.workspace,{repositoryUrl:'https://github.com/example/skills'});
  assert.equal(installed.sha,result.sha);
  assert.equal((await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills')).action,'already-current');
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
test('Dirty catalog activation failure restores original folder and leaves a recoverable clone',async()=>{
 const x=await harness();try{
  const before=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  const originalRoot=catalog.gitCatalogFolder(x.workspace);
  const localFile=path.join(originalRoot,'notes.txt');
  await fs.writeFile(localFile,'keep my draft');
  await x.publish('1.2.0');
  const rejectRename=async()=>{const error=new Error('simulated activation error');error.code='EIO';throw error;};
  await assert.rejects(catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills','',{rename:rejectRename}),/original modified checkout was restored/);
  assert.equal(await fs.readFile(localFile,'utf8'),'keep my draft');
  assert.equal(git(originalRoot,'rev-parse','HEAD'),before.sha);
  assert.equal((await catalog.activeRoot(x.workspace)).sha,before.sha);
  assert.equal((await fs.readdir(path.join(x.workspace,'.atgv'))).filter(n=>n.startsWith('.sdlc-catalog-clone-')).length,1);
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
test('Invalid upstream catalog never archives or replaces a dirty local checkout',async()=>{
 const x=await harness();try{
  const installed=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  const localRoot=catalog.gitCatalogFolder(x.workspace);
  await fs.writeFile(path.join(localRoot,'local-notes.txt'),'retain notes');
  await fs.writeFile(path.join(x.writer,'catalog.json'),'{invalid upstream manifest');
  git(x.writer,'add','.');git(x.writer,'commit','-m','invalid');git(x.writer,'push','origin','main');
  await assert.rejects(catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills'),/catalog|manifest|JSON/i);
  assert.equal(await fs.readFile(path.join(localRoot,'local-notes.txt'),'utf8'),'retain notes');
  assert.equal(git(localRoot,'rev-parse','HEAD'),installed.sha);
  const backupRoot=path.join(x.workspace,'.atgv','catalog-local-backups');
  await assert.rejects(fs.lstat(backupRoot),{code:'ENOENT'});
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});

test('Failed manifest validation rolls back fast-forward without corrupting current catalog',async()=>{
 const x=await harness();try{
  const before=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  await fs.writeFile(path.join(x.writer,'catalog.json'),'{invalid json');
  git(x.writer,'add','.');git(x.writer,'commit','-m','invalid');git(x.writer,'push','origin','main');
  await assert.rejects(catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills'),/catalog\.json|manifest/);
  assert.match(await catalog.activeFile(x.workspace,'catalog.json'),/1\.1\.0/);
  assert.equal((await catalog.activeRoot(x.workspace)).sha,before.sha);
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
test('migration retires verified legacy SHA folders after new Git checkout is active',async()=>{
 const x=await harness();try{
  const oldSha='c'.repeat(40);
  const store=path.join(x.tmp,'global-store');
  const cache=path.join(store,'sdlc-catalog','example','skills',oldSha);
  const base=path.join(x.workspace,'.atgv','catalog-assets');
  await fs.mkdir(cache,{recursive:true});await fs.mkdir(path.join(base,oldSha),{recursive:true});
  await fs.writeFile(path.join(cache,'catalog.json'),'verified content');
  await fs.writeFile(path.join(cache,'atgv-catalog-lock.json'),JSON.stringify({sha:oldSha,repository:'example/skills',ref:'main'}));
  await fs.writeFile(path.join(base,oldSha,'catalog.json'),'verified content');
  await fs.writeFile(path.join(base,'active.json'),JSON.stringify({sha:oldSha,repository:'example/skills',ref:'main'}));
  await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  const result=await catalog.retireLegacyCatalogAssets(x.workspace,store,'example/skills');
  assert.deepEqual(result.removed,[oldSha]);
  await assert.rejects(fs.stat(base),{code:'ENOENT'});
  assert.match(await catalog.activeFile(x.workspace,'roles/developer/SKILL.md'),/1.1.0/);
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
test('manual git pull updates active revision metadata without creating another catalog folder',async()=>{
 const x=await harness();try{
  const first=await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  await x.publish('1.3.0');
  const checkout=catalog.gitCatalogFolder(x.workspace);
  git(checkout,'pull','--ff-only','origin','main');
  const active=await catalog.activeRoot(x.workspace);
  assert.notEqual(active.sha,first.sha);
  assert.equal(active.version,'1.3.0');
  assert.equal((await fs.readdir(path.join(x.workspace,'.atgv'))).filter(name=>/^[a-f0-9]{40}$/.test(name)).length,0);
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
test('migration moves unverifiable legacy revisions out of active catalog without losing modified files',async()=>{
 const x=await harness();try{
  const base=path.join(x.workspace,'.atgv','catalog-assets');
  const oldSha='d'.repeat(40);
  await fs.mkdir(path.join(base,oldSha),{recursive:true});
  await fs.writeFile(path.join(base,oldSha,'custom.txt'),'edited locally');
  await fs.writeFile(path.join(base,'active.json'),JSON.stringify({sha:oldSha,ref:'main',repository:'example/skills'}));
  await catalog.syncGitCatalogCheckout(x.workspace,x.bare,'example/skills');
  const outcome=await catalog.retireLegacyCatalogAssets(x.workspace,null,'example/skills');
  assert.deepEqual(outcome.archived,[oldSha]);
  await assert.rejects(fs.stat(base),{code:'ENOENT'});
  const backups=await fs.readdir(path.join(x.workspace,'.atgv','catalog-migration-backup'));
  assert.equal(backups.length,1);
  assert.ok(backups[0].startsWith('preserved-'));
  assert.doesNotMatch(backups[0],/^[a-f0-9]{40}$/);
  assert.equal(await fs.readFile(path.join(x.workspace,'.atgv','catalog-migration-backup',backups[0],'custom.txt'),'utf8'),'edited locally');
  assert.equal((await catalog.activeRoot(x.workspace)).root,catalog.gitCatalogFolder(x.workspace));
 }finally{await fs.rm(x.tmp,{force:true,recursive:true});}
});
