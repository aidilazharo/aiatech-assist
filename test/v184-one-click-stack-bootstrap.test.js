'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const stack=require('../src/architect-stack-bootstrap');
const fixture=require('./catalog-fixture');
function git(cwd,...args){return execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();}
async function tempGit(fn,{populateApp=false,dirty=false,customIgnore=false}={}){
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v184-'));const remote=path.join(tmp,'origin.git'),seed=path.join(tmp,'seed'),work=path.join(tmp,'checkout');
 try{
  await fixture.activate(tmp);execFileSync('git',['init','--bare',remote]);execFileSync('git',['init','-b','main',seed]);
  git(seed,'config','user.email','test@example.invalid');git(seed,'config','user.name','Tester');
  await fs.writeFile(path.join(seed,'README.md'),'# Baseline README\n');
  if(customIgnore)await fs.writeFile(path.join(seed,'.gitignore'),'# company rules\n');
  if(populateApp)await fs.writeFile(path.join(seed,'package.json'),JSON.stringify({name:'existing',scripts:{test:'echo test',build:'echo build',dev:'echo dev'}}));
  git(seed,'add','.');git(seed,'commit','-m','initial baseline');git(seed,'remote','add','origin',remote);git(seed,'push','-u','origin','main');
  execFileSync('git',['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/main']);
  execFileSync('git',['clone',remote,work]);git(work,'config','user.email','test@example.invalid');git(work,'config','user.name','Tester');
  if(dirty)await fs.writeFile(path.join(work,'unrelated.txt'),'Uncommitted work\n');
  return await fn({work,remote,mainSha:git(work,'rev-parse','HEAD')});
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
function effects({failAt}={}){
 const stages=[],actions=[];
 const f={
  install:async(root)=>{actions.push('install');await fs.mkdir(path.join(root,'node_modules'),{recursive:true});},
  execute:async(root,{relative,operation})=>{actions.push(operation);if(failAt===operation)return {relative,operation,passed:false,logs:'intentional failure'};return {relative,operation,passed:true,logs:'Passed',at:new Date().toISOString()};},
  portAvailable:async()=>true,
  launch:async()=>{actions.push('launch');if(failAt==='launch')throw Error('Failed to start');},
  waitHealth:async()=>{actions.push('health');if(failAt==='health')throw Error('Health unavailable');},
  stop:async()=>{actions.push('stop');},
  isRunning:()=>true
 };
 return {f,actions,stages};
}
test('Save Stack starts from application-empty main, verifies in browser and pushes only bootstrap/react-initial',()=>tempGit(async({work,remote,mainSha})=>{
 const {f,actions,stages}=effects();
 const outcome=await stack.bootstrap({root:work,stackId:'react',effects:f,onProgress:stage=>stages.push(stage),openBrowser:async url=>{actions.push('browser');assert.equal(url,'http://127.0.0.1:5173/');return true;}});
 assert.equal(outcome.branch,'bootstrap/react-initial');assert.equal(outcome.pushed,true);
 assert.equal(outcome.validation.status,'tested');assert.equal(outcome.validation.results.length,3);
 assert.equal(outcome.repo.clean,true);
 assert.deepEqual(actions,['install','test','build','launch','health','browser']);
 assert.equal(git(work,'rev-parse','refs/heads/main'),mainSha);
 assert.equal(git(remote,'rev-parse','refs/heads/main'),mainSha);
 assert.equal(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'),outcome.repo.sha);
 assert.ok(stages.some(x=>x.includes('Pushing')));
 assert.ok((await fs.readFile(path.join(work,'README.md'),'utf8')).includes('Baseline README'));
 assert.equal((await fs.readFile(path.join(work,'src/main.jsx'),'utf8')).includes('ATGV React'),true);
 assert.equal(git(work,'show','--pretty=format:','--name-only','HEAD').includes('README.md'),false);
}));
test('Existing application on main is rejected before branch creation or file writes',()=>tempGit(async({work,remote})=>{
 const {f}=effects();await assert.rejects(stack.bootstrap({root:work,stackId:'react',effects:f,openBrowser:async()=>true}),/(?:main|base) branch already contains application files/);
 assert.equal(git(work,'branch','--show-current'),'main');
 assert.equal(git(remote,'branch','--list','bootstrap/react-initial'),'');
 assert.equal(await fs.stat(path.join(work,'src')).then(()=>true,()=>false),false);
},{populateApp:true}));
test('Dirty main rejects branch and leaves user changes intact',()=>tempGit(async({work})=>{
 await assert.rejects(stack.bootstrap({root:work,stackId:'react'}),/Uncommitted work/);
 assert.equal(await fs.readFile(path.join(work,'unrelated.txt'),'utf8'),'Uncommitted work\n');
 assert.equal(git(work,'branch','--show-current'),'main');
},{dirty:true}));
test('Failed health stops preview, does not commit or push, and retry resumes the same branch',()=>tempGit(async({work,remote})=>{
 const bad=effects({failAt:'health'});
 await assert.rejects(stack.bootstrap({root:work,stackId:'react',effects:bad.f,openBrowser:async()=>true}),/Health unavailable/);
 assert.ok(bad.actions.includes('stop'));
 assert.equal(git(remote,'branch','--list','bootstrap/react-initial'),'');
 assert.equal(git(work,'branch','--show-current'),'bootstrap/react-initial');
 assert.match(git(work,'status','--porcelain'),/package\.json/);
 const ok=effects();const done=await stack.bootstrap({root:work,stackId:'react',effects:ok.f,openBrowser:async()=>true});
 assert.equal(done.pushed,true);assert.equal(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'),done.repo.sha);
}));
test('Browser refusal prevents remote push and local commit',()=>tempGit(async({work,remote,mainSha})=>{
 const {f}=effects();await assert.rejects(stack.bootstrap({root:work,stackId:'react',effects:f,openBrowser:async()=>false}),/Could not open the external browser/);
 assert.equal(git(work,'rev-parse','HEAD'),mainSha);
 assert.equal(git(remote,'branch','--list','bootstrap/react-initial'),'');
}));
test('A clean bootstrap branch can safely retry a push without overwriting remote history',()=>tempGit(async({work})=>{
 const first=effects();await stack.bootstrap({root:work,stackId:'react',effects:first.f,openBrowser:async()=>true});
 const second=effects();const done=await stack.bootstrap({root:work,stackId:'react',effects:second.f,openBrowser:async()=>true});
 assert.equal(done.pushed,false);
}));

test('Remote without any branches can create first commit on bootstrap branch without inventing main',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v184-empty-'));
 try{
  const remote=path.join(temp,'empty.git'),root=path.join(temp,'checkout');
  await fixture.activate(temp);execFileSync('git',['init','--bare',remote]);execFileSync('git',['init','-b','main',root]);
  git(root,'remote','add','origin',remote);git(root,'config','user.name','Tester');git(root,'config','user.email','test@example.invalid');
  const {f}=effects();const result=await stack.bootstrap({root,stackId:'react',effects:f,openBrowser:async()=>true});
  assert.equal(result.pushed,true);
  assert.equal(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'),result.repo.sha);
  assert.equal(git(remote,'branch','--list','main'),'');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('Existing company .gitignore is preserved and runtime node_modules excluded locally',()=>tempGit(async({work})=>{
 const {f}=effects();const result=await stack.bootstrap({root:work,stackId:'react',effects:f,openBrowser:async()=>true});
 assert.equal(result.pushed,true);
 assert.equal(await fs.readFile(path.join(work,'.gitignore'),'utf8'),'# company rules\n');
 assert.ok((await fs.readFile(path.join(work,'.git/info/exclude'),'utf8')).includes('node_modules/'));
 assert.equal(git(work,'status','--porcelain'),'');
},{customIgnore:true}));

test('Configured develop branch bootstraps without touching develop or main; reset returns to develop',()=>tempGit(async({work,remote,mainSha})=>{
 git(work,'switch','-c','develop');git(work,'push','-u','origin','develop');
 const {f}=effects();const result=await stack.bootstrap({root:work,stackId:'react',baseBranch:'develop',effects:f,openBrowser:async()=>true});
 assert.equal(result.baseBranch,undefined); // the bootstrap public result is the published Git result
 assert.equal(result.branch,'bootstrap/react-initial');
 assert.equal(git(remote,'rev-parse','refs/heads/develop'),mainSha);
 assert.equal(git(remote,'rev-parse','refs/heads/main'),mainSha);
 const reset=require('../src/architect-stack-reset');
 const project={techStackId:'react',techStackGeneration:0,techStackPrepared:{branch:result.branch,root:work,baseBranch:'develop'}};
 const outcome=await reset.reset({root:work,project,baseBranch:'develop'});
 assert.equal(outcome.currentBranch,'develop');
 assert.equal(git(work,'branch','--show-current'),'develop');
 assert.equal(git(work,'rev-parse','HEAD'),mainSha);
 assert.equal(git(work,'rev-parse','refs/heads/bootstrap/react-initial'),result.repo.sha);
}));

test('Save Stack resumes a verified existing local bootstrap branch after returning to main',()=>tempGit(async({work,remote})=>{
 const first=await stack.bootstrap({root:work,stackId:'react',effects:effects().f,openBrowser:async()=>true});
 git(work,'switch','main');
 const second=await stack.bootstrap({root:work,stackId:'react',effects:effects().f,openBrowser:async()=>true});
 assert.equal(second.pushed,false);
 assert.equal(second.branch,first.branch);
 assert.equal(second.repo.sha,first.repo.sha);
 assert.equal(git(work,'branch','--show-current'),first.branch);
 assert.equal(git(remote,'rev-parse','refs/heads/'+first.branch),first.repo.sha);
}));

test('Save Stack resumes a remote-only verified bootstrap branch without overwriting its commit',()=>tempGit(async({work,remote})=>{
 const first=await stack.bootstrap({root:work,stackId:'react',effects:effects().f,openBrowser:async()=>true});
 git(work,'switch','main');
 git(work,'branch','-D',first.branch);
 const second=await stack.bootstrap({root:work,stackId:'react',effects:effects().f,openBrowser:async()=>true});
 assert.equal(second.pushed,false);
 assert.equal(second.repo.sha,first.repo.sha);
 assert.equal(git(work,'branch','--show-current'),first.branch);
 assert.equal(git(remote,'rev-parse','refs/heads/'+first.branch),first.repo.sha);
}));

test('Save Stack refuses an existing branch with invalid starter manifest, leaving main untouched',()=>tempGit(async({work,remote})=>{
 git(work,'switch','-c','bootstrap/react-initial');
 await fs.writeFile(path.join(work,'atgv.bootstrap.json'),JSON.stringify({schema:1,stacks:['dotnet'],status:'draft'}));
 git(work,'add','atgv.bootstrap.json');git(work,'commit','-m','Different stack');git(work,'switch','main');
 await assert.rejects(stack.bootstrap({root:work,stackId:'react'}),/does not match the selected react starter/);
 assert.equal(git(work,'branch','--show-current'),'main');
 assert.equal(git(remote,'branch','--list','bootstrap/react-initial'),'');
}));

test('Save Stack refuses a local branch that diverged from its published remote SHA',()=>tempGit(async({work,remote})=>{
 const first=await stack.bootstrap({root:work,stackId:'react',effects:effects().f,openBrowser:async()=>true});
 await fs.writeFile(path.join(work,'NOTES.md'),'new local change\n');
 git(work,'add','NOTES.md');git(work,'commit','-m','Local later work');git(work,'switch','main');
 await assert.rejects(stack.bootstrap({root:work,stackId:'react'}),/differs from GitHub/);
 assert.equal(git(work,'branch','--show-current'),'main');
 assert.equal(git(remote,'rev-parse','refs/heads/'+first.branch),first.repo.sha);
}));

test('Save Stack refuses an existing bootstrap branch based on an outdated remote main SHA',()=>tempGit(async({work})=>{
 await stack.bootstrap({root:work,stackId:'react',effects:effects().f,openBrowser:async()=>true});
 git(work,'switch','main');
 await fs.writeFile(path.join(work,'CHANGELOG.md'),'new base commit\n');
 git(work,'add','CHANGELOG.md');git(work,'commit','-m','update base');git(work,'push','origin','main');
 await assert.rejects(stack.bootstrap({root:work,stackId:'react'}),/not based on the current approved base revision/);
 assert.equal(git(work,'branch','--show-current'),'main');
}));
