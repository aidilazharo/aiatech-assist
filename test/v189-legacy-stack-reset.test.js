'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const fixture=require('./catalog-fixture');
const bootstrap=require('../src/architect-stack-bootstrap');
const reset=require('../src/architect-stack-reset');
function git(dir,...args){return execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function repo(fn){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v189-'));
 try{
  await fixture.activate(temp);
  const remote=path.join(temp,'origin.git'),seed=path.join(temp,'seed'),root=path.join(temp,'checkout');
  execFileSync('git',['init','--bare',remote],{stdio:'ignore'});
  execFileSync('git',['init','-b','main',seed],{stdio:'ignore'});
  git(seed,'config','user.name','Test');git(seed,'config','user.email','test@example.invalid');
  await fs.writeFile(path.join(seed,'README.md'),'# Project baseline\n');
  git(seed,'add','.');git(seed,'commit','-m','base');
  git(seed,'remote','add','origin',remote);git(seed,'push','-u','origin','main');
  execFileSync('git',['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/main']);
  execFileSync('git',['clone',remote,root],{stdio:'ignore'});
  git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
  const effects={install:async()=>fs.mkdir(path.join(root,'node_modules'),{recursive:true}),
   execute:async(_root,{relative,operation})=>({relative,operation,passed:true}),
   portAvailable:async()=>true,launch:async()=>{},waitHealth:async()=>{},isRunning:()=>true,stop:async()=>{}};
  await bootstrap.bootstrap({root,stackId:'react',effects,openBrowser:async()=>true});
  await fn({remote,root,main:git(root,'rev-parse','main')});
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
function project(root){return {techStackId:'react',techStackGeneration:0,techStackPrepared:{stackId:'react',branch:'bootstrap/react-initial',root}};}

test('Reset recovers a legacy clean bootstrap branch without a manifest; preserves branch history and main',()=>repo(async({root,remote,main})=>{
 git(root,'rm','atgv.bootstrap.json');git(root,'commit','-m','legacy checkout without manifest');
 const oldSha=git(root,'rev-parse','HEAD');
 const preflight=await reset.plan({root,project:project(root)});
 assert.equal(preflight.recovery,'ATGV manifest is missing');
 const done=await reset.reset({root,project:project(root),expectedPlan:preflight});
 assert.equal(done.recovery,'ATGV manifest is missing');
 assert.equal(git(root,'branch','--show-current'),'main');
 assert.equal(git(root,'rev-parse','main'),main);
 assert.equal(git(remote,'rev-parse','refs/heads/main'),main);
 assert.equal(git(root,'rev-parse','refs/heads/bootstrap/react-initial'),oldSha);
 assert.equal(await fs.readFile(path.join(root,'README.md'),'utf8'),'# Project baseline\n');
}));

test('Reset recovers a mismatched legacy manifest only on the recorded clean bootstrap branch',()=>repo(async({root,main})=>{
 const marker=path.join(root,'atgv.bootstrap.json');
 const json=JSON.parse(await fs.readFile(marker,'utf8'));json.stacks=['angular'];
 await fs.writeFile(marker,JSON.stringify(json)+'\n');git(root,'add','atgv.bootstrap.json');git(root,'commit','-m','legacy incorrect manifest');
 const previousSha=git(root,'rev-parse','HEAD');
 const p=await reset.plan({root,project:project(root)});
 assert.match(p.recovery,/does not match/);
 await reset.reset({root,project:project(root),expectedPlan:p});
 assert.equal(git(root,'rev-parse','refs/heads/bootstrap/react-initial'),previousSha);
 assert.equal(git(root,'rev-parse','main'),main);
}));

test('Legacy recovery still refuses dirty checkouts and unrelated branches',()=>repo(async({root})=>{
 git(root,'rm','atgv.bootstrap.json');git(root,'commit','-m','legacy no manifest');
 await fs.writeFile(path.join(root,'local-note.txt'),'keep me');
 await assert.rejects(reset.plan({root,project:project(root)}),/uncommitted or untracked/);
 await fs.rm(path.join(root,'local-note.txt'));
 git(root,'switch','-c','feature/real-work');
 await assert.rejects(reset.plan({root,project:project(root)}),/Switch to the saved stack branch/);
}));

test('Reset refuses a checkout changed since user confirmation',()=>repo(async({root})=>{
 const p=await reset.plan({root,project:project(root)});
 await fs.writeFile(path.join(root,'notes.txt'),'committed since confirmation');
 git(root,'add','notes.txt');git(root,'commit','-m','work after reset confirmation');
 await assert.rejects(reset.reset({root,project:project(root),expectedPlan:p}),/changed since the reset confirmation/);
 assert.equal(git(root,'branch','--show-current'),'bootstrap/react-initial');
 assert.equal(await fs.readFile(path.join(root,'notes.txt'),'utf8'),'committed since confirmation');
}));

test('Reset refuses a checkout at a different project root, even with a matching branch',()=>repo(async({root})=>{
 const saved=project(root);saved.techStackPrepared.root=path.dirname(root);
 await assert.rejects(reset.plan({root,project:saved}),/not the checkout that prepared/);
 assert.equal(git(root,'branch','--show-current'),'bootstrap/react-initial');
}));

test('UI explicitly displays legacy manifest recovery and binds the confirmation preflight',()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(source,/Legacy stack recovery:/);
 assert.match(source,/expectedPlan:plan/);
});
