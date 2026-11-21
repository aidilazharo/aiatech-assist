'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ensureCustom}=require('../src/architect-repository');
const read=file=>require('node:fs').readFileSync(path.join(__dirname,'..',file),'utf8');
async function fixture(fn){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-architect-custom-'));
 try{
  const root=path.join(folder,'project');await fs.mkdir(root);
  const state={map:new Map(),get(key){return this.map.get(key)},async update(key,value){this.map.set(key,value)}};
  const calls=[];
  const driver={
   matchesGithubRepo:(remote,owner,name)=>remote==='https://github.com/'+owner+'/'+name+'.git',
   async repository(dest){
    const files=await fs.readdir(dest);
    if(!files.includes('.git'))throw Error('Not a Git repository');
    return {root:await fs.realpath(dest),sha:'a'.repeat(40),branch:'main',remote:'https://github.com/acme/project.git',clean:true};
   },
   async cloneConfigured(parent,owner,name,branch,options){
    calls.push({parent,owner,name,branch,options});
    const dest=path.join(parent,name);
    assert.deepEqual(await fs.readdir(dest),[]);
    await fs.mkdir(path.join(dest,'.git'));
    await fs.writeFile(path.join(dest,'package.json'),'{"name":"my-project"}\n');
    return this.repository(dest);
   }
  };
  await fn({root,state,driver,calls,dest:path.join(root,'repository','project')});
 }finally{await fs.rm(folder,{recursive:true,force:true})}
}
const opts=root=>({projectRoot:root,githubOwner:'acme',githubRepo:'project',githubBranch:'main',
 catalogRepositoryUrl:'https://github.com/acme/catalog'});

test('Save Custom Stack creates missing repository folder and clones configured source',async()=>{
 await fixture(async({root,state,driver,calls,dest})=>{
  const result=await ensureCustom(state,'demo',driver,opts(root));
  assert.equal(result.mode,'cloned');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.allowExistingEmpty,true);
  assert.equal((await fs.readFile(path.join(dest,'package.json'),'utf8')).includes('my-project'),true);
  assert.equal(state.get('atgvAssist.localRepo.demo'),dest);
  assert.equal(state.get('atgvAssist.bootstrapRepo.demo'),dest);
 });
});
test('Save Custom Stack clones when destination exists but is empty',async()=>{
 await fixture(async({root,state,driver,calls,dest})=>{
  await fs.mkdir(dest,{recursive:true});
  const result=await ensureCustom(state,'demo',driver,opts(root));
  assert.equal(result.mode,'cloned');
  assert.equal(calls.length,1);
  assert.ok((await fs.readdir(dest)).includes('package.json'));
 });
});
test('Populated verified checkout is never overwritten or pulled by Save Custom Stack',async()=>{
 await fixture(async({root,state,driver,calls,dest})=>{
  await fs.mkdir(path.join(dest,'.git'),{recursive:true});
  await fs.writeFile(path.join(dest,'existing.txt'),'user-owned content');
  const result=await ensureCustom(state,'demo',driver,opts(root));
  assert.equal(result.mode,'existing');
  assert.equal(calls.length,0);
  assert.equal(await fs.readFile(path.join(dest,'existing.txt'),'utf8'),'user-owned content');
 });
});
test('Git metadata without working-tree source uses a verified fast-forward pull',async()=>{
 await fixture(async({root,state,driver,calls,dest})=>{
  await fs.mkdir(path.join(dest,'.git'),{recursive:true});
  let called=0;
  const result=await ensureCustom(state,'demo',driver,{...opts(root),pull:async(folder,params)=>{
   called++;
   assert.equal(folder,dest);
   assert.equal(params.owner,'acme');
   assert.equal(params.name,'project');
   assert.equal(params.expectedSha,'a'.repeat(40));
   await fs.writeFile(path.join(dest,'package.json'),'{"name":"restored"}');
   return {updated:true};
  }});
  assert.equal(result.mode,'pulled');
  assert.equal(called,1);
  assert.equal(calls.length,0);
  assert.match(await fs.readFile(path.join(dest,'package.json'),'utf8'),/restored/);
 });
});
test('Populated non-Git folder, symlink, and mismatched origins fail safely',async()=>{
 await fixture(async({root,state,driver,calls,dest})=>{
  await fs.mkdir(dest,{recursive:true});
  await fs.writeFile(path.join(dest,'notes.md'),'must survive');
  await assert.rejects(ensureCustom(state,'demo',driver,opts(root)),/existing files/);
  assert.equal(await fs.readFile(path.join(dest,'notes.md'),'utf8'),'must survive');
  assert.equal(calls.length,0);
 });
 await fixture(async({root,state,driver,calls,dest})=>{
  const external=path.join(root,'outside');await fs.mkdir(external);
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.symlink(external,dest,'dir');
  await assert.rejects(ensureCustom(state,'demo',driver,opts(root)),/not a safe directory/);
  assert.equal(calls.length,0);
 });
 await fixture(async({root,state,driver,calls,dest})=>{
  await fs.mkdir(path.join(dest,'.git'),{recursive:true});
  driver.matchesGithubRepo=()=>false;
  await assert.rejects(ensureCustom(state,'demo',driver,opts(root)),/unexpected GitHub origin/);
  assert.equal(calls.length,0);
 });
});
test('No configured repository or catalog-as-project is rejected before filesystem writes',async()=>{
 await fixture(async({root,state,driver})=>{
  await assert.rejects(ensureCustom(state,'demo',driver,{projectRoot:root,githubOwner:'',githubRepo:''}),/Choose a valid GitHub/);
  await assert.rejects(ensureCustom(state,'demo',driver,{...opts(root),catalogRepositoryUrl:'https://github.com/acme/project'}),/SDLC Catalog/);
  assert.equal((await fs.readdir(root)).length,0);
 });
});
test('Custom Stack Save is enabled and no automatic scan runs on selection',()=>{
 const ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
 const git=read('src/developer-git.js'),repo=read('src/architect-repository.js');
 assert.match(ui,/save\.disabled=architectActionBusy\|\|!activeId/);
 assert.match(ui,/architectBegin\('architectSaveStack','Checking configured project repository/);
 assert.match(ui,/Choose Save Stack to verify or clone the configured GitHub checkout/);
 assert.match(host,/if\(id==='custom'\)/);
 assert.match(host,/architectRepository\.ensureCustom/);
 assert.match(host,/type:'architectCustomScanResult'/);
 assert.match(git,/allowExistingEmpty=false/);
 assert.match(repo,/existing files but is not a valid Git checkout/);
});
