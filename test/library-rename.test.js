'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const catalog=require('../src/github-sdlc-catalog');
const git=(dir,...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
async function setup(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-library-root-')),base=path.join(root,'.atgv');
 await fs.mkdir(base,{recursive:true});
 try{return await fn({root,base});}finally{await fs.rm(root,{recursive:true,force:true});}
}
async function fixture(checkout,base){
 await fs.mkdir(checkout,{recursive:true});
 git(checkout,'init','-b','main');git(checkout,'config','user.name','Library Root Test');git(checkout,'config','user.email','library-root@example.invalid');
 await fs.writeFile(path.join(checkout,'catalog.json'),JSON.stringify({schema:1,version:'0.0.7',roles:[],techStacks:[]}));
 await fs.mkdir(path.join(checkout,'templates'),{recursive:true});
 await fs.writeFile(path.join(checkout,'templates','user-story.md'),'# Git template');
 git(checkout,'add','.');git(checkout,'commit','-m','Library fixture');
 const sha=git(checkout,'rev-parse','HEAD');
 await fs.writeFile(path.join(base,'library-state.json'),JSON.stringify({schema:1,sha,ref:'main',repository:'example/library',version:'0.0.7'}));
 return sha;
}
test('migrates legacy sdlc-catalog directly to library without losing Git history',()=>setup(async({root,base})=>{
 const old=path.join(base,'sdlc-catalog'),sha=await fixture(old,base);
 const result=await catalog.activeRoot(root);
 assert.equal(result.root,path.join(base,'library'));assert.equal(result.sha,sha);
 assert.equal(git(result.root,'rev-parse','HEAD'),sha);
 assert.equal(await catalog.activeFile(root,'templates/user-story.md'),'# Git template');
 await assert.rejects(fs.stat(old),{code:'ENOENT'});
}));
test('previous nested library/repository is promoted to direct library and user files are backed up',()=>setup(async({root,base})=>{
 const nested=path.join(base,'library','repository');
 const sha=await fixture(nested,base);
 await fs.mkdir(path.join(base,'library','sdlc'),{recursive:true});
 await fs.writeFile(path.join(base,'library','sdlc','custom.yaml'),'author edits');
 await fs.mkdir(path.join(base,'library','templates'),{recursive:true});
 await fs.writeFile(path.join(base,'library','templates','custom.md'),'human template');
 const result=await catalog.activeRoot(root);
 assert.equal(result.root,path.join(base,'library'));assert.equal(result.sha,sha);
 assert.equal(git(result.root,'rev-parse','HEAD'),sha);
 await assert.rejects(fs.stat(path.join(result.root,'repository')),{code:'ENOENT'});
 const dir=path.join(base,'library-migration-backups');
 const backups=await fs.readdir(dir);
 assert.equal(backups.length,1);
 assert.equal(await fs.readFile(path.join(dir,backups[0],'templates','custom.md'),'utf8'),'human template');
 assert.equal(await fs.readFile(path.join(dir,backups[0],'sdlc','custom.yaml'),'utf8'),'author edits');
 await catalog.migrateLegacyLibraryCheckout(root);
 assert.equal(git(result.root,'rev-parse','HEAD'),sha);
}));
test('Library files are always loaded from pinned Git HEAD, not untracked workspace edits',()=>setup(async({root,base})=>{
 await fixture(path.join(base,'library'),base);
 await fs.writeFile(path.join(base,'library','templates','user-story.md'),'# Tampered');
 assert.equal(await catalog.activeFile(root,'templates/user-story.md'),'# Git template');
}));
test('never replaces a valid direct Library when another legacy checkout exists',()=>setup(async({root,base})=>{
 const sha=await fixture(path.join(base,'library'),base);
 const previous=path.join(base,'sdlc-catalog');
 await fs.mkdir(previous);await fs.writeFile(path.join(previous,'private.md'),'preserve');
 await catalog.migrateLegacyLibraryCheckout(root);
 assert.equal(git(path.join(base,'library'),'rev-parse','HEAD'),sha);
 assert.equal(await fs.readFile(path.join(previous,'private.md'),'utf8'),'preserve');
}));
test('defaults-only library folders are archived instead of modifying a future Git checkout',()=>setup(async({root,base})=>{
 const lib=path.join(base,'library');await fs.mkdir(path.join(lib,'sdlc'),{recursive:true});
 await fs.writeFile(path.join(lib,'sdlc','user.yaml'),'important');
 await catalog.migrateLegacyLibraryCheckout(root);
 await assert.rejects(fs.stat(lib),{code:'ENOENT'});
 const backups=await fs.readdir(path.join(base,'library-migration-backups'));
 assert.equal(await fs.readFile(path.join(base,'library-migration-backups',backups[0],'sdlc','user.yaml'),'utf8'),'important');
}));
test('legacy unmodified external defaults remain accessible without entering the Git checkout',()=>setup(async({root,base})=>{
 await fs.mkdir(path.join(base,'templates'),{recursive:true});
 await fs.writeFile(path.join(base,'templates','custom.md'),'legacy');
 await catalog.migrateLegacyLibraryCheckout(root);
 assert.equal(await fs.readFile(path.join(base,'templates','custom.md'),'utf8'),'legacy');
 await assert.rejects(fs.stat(path.join(base,'library')),{code:'ENOENT'});
}));
