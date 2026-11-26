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
test('Populated non-Git folder and symlink fail safely; mismatched origins are local only',async()=>{
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
  await fs.writeFile(path.join(dest,'existing.txt'),'preserve source');
  const result=await ensureCustom(state,'demo',driver,{...opts(root),pull:async()=>{throw Error('Must not pull mismatched origin');}});
  assert.equal(result.mode,'local-origin-mismatch');
  assert.equal(result.originMatches,false);
  assert.equal(await fs.readFile(path.join(dest,'existing.txt'),'utf8'),'preserve source');
  const {resolve}=require('../src/architect-repository');
  await assert.rejects(resolve(state,'demo',driver,opts(root)),/different GitHub origin/);
  assert.equal(await resolve(state,'demo',driver,{...opts(root),allowLocalOrigin:true}),dest);
  assert.equal(calls.length,0);
 });
});
test('No configured repository or catalog-as-project is rejected before filesystem writes',async()=>{
 await fixture(async({root,state,driver})=>{
  await assert.rejects(ensureCustom(state,'demo',driver,{projectRoot:root,githubOwner:'',githubRepo:''}),/Choose a valid GitHub/);
  await assert.rejects(ensureCustom(state,'demo',driver,{...opts(root),catalogRepositoryUrl:'https://github.com/acme/project'}),/Library/);
  assert.equal((await fs.readdir(root)).length,0);
 });
});
test('Custom Stack Save discovers project folders and offers a rescan action',()=>{
 const ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
 const git=read('src/developer-git.js'),repo=read('src/architect-repository.js');
 assert.match(ui,/save\.disabled=architectActionBusy\|\|!activeId/);
 assert.match(ui,/architectBegin\('architectSaveStack','Checking configured project repository/);
 assert.match(ui,/Choose Save Stack to discover project folders and initialize or verify Git/);
 assert.match(host,/architectRepository\.chooseCustomFolder/);
 assert.match(host,/if\(id==='custom'\)/);
 assert.match(host,/architectRepository\.ensureCustom/);
 assert.match(host,/type:'architectCustomScanResult'/);
 assert.match(git,/allowExistingEmpty=false/);
 assert.match(repo,/existing files but is not a valid Git checkout/);
});

test('switch to Custom Stack scans a pushed migration checkout in place after confirmation',async()=>{
 const source=read('src/lib/runtime/extension-runtime.js');
 const start=source.indexOf("          const projectId=activeProject.id,current=await registry.read(projectId);",
  source.indexOf("case 'architectSaveStack':{"));
 const end=source.indexOf('\n          break;',start);
 assert.ok(start>0&&end>start);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('deps','let {activeProject,registry,effectiveConfig,aiRoot,catalogConfig,context,developerGit,architectRepository,getWorkspace,path,uiWarning,dashboard,recordStackActivity,refreshDashboard,require,getGithubToken}=deps; do {\n'+source.slice(start,end)+'\n} while(false);');
 const root=path.join(os.tmpdir(),'atgv-existing-checkout');
 const branch='migration/react-catalog-1-1-14-07bbe5e6',sha='a'.repeat(40);
 const activeProject={id:'demo',techStackId:'react',techStackPrepared:{stackId:'react',branch,sha,remotePushed:true},techStackApproval:{status:'approved'}};
 const events=[],messages=[];
 let confirmed=false,scanSha=sha;
 const deps={
  activeProject,path,context:{workspaceState:{}},aiRoot:()=>root,catalogConfig:()=>({}),
  effectiveConfig:()=>({get:key=>key==='github.owner'?'acme':'project'}),
  getWorkspace:()=>({uri:{fsPath:os.tmpdir()}}),
  registry:{read:async()=>activeProject,update:async(_id,value)=>{events.push('update');return value}},
  uiWarning:async(message,_options,action)=>{assert.ok(message.includes(branch));return confirmed?action:undefined},
  getGithubToken:async()=>'',architectRepository:{chooseCustomFolder:async()=>root,ensureCustom:async(_state,_id,driver,options)=>{assert.equal(options.selectedFolder,root);return {...await driver.repository(root),mode:'existing'};}},
  developerGit:{repository:async()=>({root,branch,sha,remote:'https://github.com/acme/project',clean:false}),matchesGithubRepo:()=>true,localLogs:()=>({})},
  dashboard:{webview:{postMessage:async msg=>messages.push(msg)}},
  recordStackActivity:async()=>{},refreshDashboard:async()=>{},
  require:name=>{
   if(name.endsWith('architect-stack-reset'))return {
    planProjectStackArchive:async()=>({}),archiveProjectStackDocuments:async()=>{events.push('archive');return {}}
   };
   if(name.endsWith('architect-custom-repair'))return {branches:async()=>({current:branch,items:[branch]})};
   assert.ok(name.endsWith('architect-custom-stack'));
   return {scan:async folder=>{assert.equal(folder,root);events.push('scan');return {branch,sha:scanSha,targets:[]}}};
  }
 };
 await run(deps);
 assert.deepEqual(events,[]);
 assert.equal(messages.at(-1).type,'architectStackCancelled');
 confirmed=true;
 scanSha='b'.repeat(40);
 await assert.rejects(run(deps),/branch or revision changed/);
 assert.deepEqual(events.splice(0),['scan']);
 scanSha=sha;
 deps.registry.update=async(_id,value)=>{
  events.push('update');
  assert.equal(value.techStackId,'custom');
  assert.equal(value.techStackPrepared,null);
  assert.equal(value.techStackApproval,null);
  return value;
 };
 await run(deps);
 assert.deepEqual(events,['scan','archive','update']);
 assert.equal(messages.at(-1).value.branch,branch);
});
