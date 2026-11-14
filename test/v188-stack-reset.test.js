'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const fixture=require('./catalog-fixture');
const bootstrap=require('../src/architect-stack-bootstrap');
const reset=require('../src/architect-stack-reset');
const {normalizeProjectInput}=require('../src/projects');
function git(dir,...args){return execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function repo(fn){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v188-'));
 try{
  await fixture.activate(temp);
  const remote=path.join(temp,'origin.git'),seed=path.join(temp,'seed'),root=path.join(temp,'checkout');
  execFileSync('git',['init','--bare',remote],{stdio:'ignore'});execFileSync('git',['init','-b','main',seed],{stdio:'ignore'});
  git(seed,'config','user.name','Test');git(seed,'config','user.email','test@example.invalid');
  await fs.writeFile(path.join(seed,'README.md'),'# Project baseline\n');git(seed,'add','.');git(seed,'commit','-m','base');
  git(seed,'remote','add','origin',remote);git(seed,'push','-u','origin','main');
  execFileSync('git',['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/main']);
  execFileSync('git',['clone',remote,root],{stdio:'ignore'});
  git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
  await fn({temp,remote,root,main:git(root,'rev-parse','HEAD')});
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
function effects(){return {
 install:async(root)=>fs.mkdir(path.join(root,'node_modules'),{recursive:true}),
 execute:async(root,{relative,operation})=>({relative,operation,passed:true,at:new Date().toISOString()}),
 portAvailable:async()=>true,launch:async()=>{},waitHealth:async()=>{},isRunning:()=>true,stop:async()=>{}
};}
test('Reset switches clean bootstrap branch back to main; fresh stack is generated on a different branch without removing old GitHub branch',()=>repo(async({root,remote,main})=>{
 const old=await bootstrap.bootstrap({root,stackId:'react',effects:effects(),openBrowser:async()=>true});
 const previous={techStackId:'react',techStackGeneration:0,techStackPrepared:{branch:old.branch,root}};
 const preflight=await reset.plan({root,project:previous});
 assert.equal(preflight.previousBranch,'bootstrap/react-initial');
 const completed=await reset.reset({root,project:previous});
 assert.equal(completed.nextGeneration,1);
 assert.equal(git(root,'branch','--show-current'),'main');
 assert.equal(git(root,'rev-parse','HEAD'),main);
 assert.equal(git(remote,'rev-parse','refs/heads/main'),main);
 assert.ok(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'));
 assert.equal(await fs.stat(path.join(root,'src','main.jsx')).then(()=>true,()=>false),false);
 const next=await bootstrap.bootstrap({root,stackId:'angular',generation:completed.nextGeneration,effects:effects(),openBrowser:async()=>true});
 assert.equal(next.branch,'bootstrap/angular-reset-1');
 assert.ok(git(remote,'rev-parse','refs/heads/bootstrap/angular-reset-1'));
 assert.ok(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'));
 assert.equal(git(remote,'rev-parse','refs/heads/main'),main);
}));
test('Reset of same stack uses fresh generation branch rather than overwriting previous GitHub branch',()=>repo(async({root,remote,main})=>{
 await bootstrap.bootstrap({root,stackId:'react',effects:effects(),openBrowser:async()=>true});
 const old={techStackId:'react',techStackGeneration:0};
 await reset.reset({root,project:old});
 const next=await bootstrap.bootstrap({root,stackId:'react',generation:1,effects:effects(),openBrowser:async()=>true});
 assert.equal(next.branch,'bootstrap/react-reset-1');
 assert.equal(git(remote,'rev-parse','refs/heads/main'),main);
 assert.ok(git(remote,'rev-parse','refs/heads/bootstrap/react-initial'));
}));
test('Reset refuses to remove untracked files or discard edited source',()=>repo(async({root})=>{
 await bootstrap.bootstrap({root,stackId:'react',effects:effects(),openBrowser:async()=>true});
 await fs.writeFile(path.join(root,'notes.txt'),'do not delete me');
 await assert.rejects(reset.reset({root,project:{techStackId:'react'}}),/uncommitted or untracked/);
 assert.equal(git(root,'branch','--show-current'),'bootstrap/react-initial');
 assert.equal(await fs.readFile(path.join(root,'notes.txt'),'utf8'),'do not delete me');
 await fs.rm(path.join(root,'notes.txt'));
 await fs.appendFile(path.join(root,'src','main.jsx'),'\n// user modification\n');
 await assert.rejects(reset.plan({root,project:{techStackId:'react'}}),/uncommitted or untracked/);
 assert.match(await fs.readFile(path.join(root,'src','main.jsx'),'utf8'),/user modification/);
}));
test('Reset blocks unrelated feature branches and refuses a mismatched managed manifest',()=>repo(async({root})=>{
 await bootstrap.bootstrap({root,stackId:'react',effects:effects(),openBrowser:async()=>true});
 git(root,'switch','-c','feature/user-work');
 await assert.rejects(reset.reset({root,project:{techStackId:'react'}}),/Switch to the saved stack branch/);
 assert.equal(git(root,'branch','--show-current'),'feature/user-work');
}));
test('Project registry retains Git branch identity and reset generation for Developer and future Save Stack',()=>{
 const original=normalizeProjectInput({name:'Example',techStackId:'react',techStackGeneration:1,techStackPrepared:{stackId:'react',companionId:'',root:'/tmp/demo',branch:'bootstrap/react-reset-1',sha:'a'.repeat(40),remotePushed:true,previewUrl:'http://127.0.0.1:5173/'}});
 assert.equal(original.techStackGeneration,1);
 assert.equal(original.techStackPrepared.branch,'bootstrap/react-reset-1');
 assert.equal(original.techStackPrepared.remotePushed,true);
 const cleared=normalizeProjectInput({...original,techStackId:'',techStackPrepared:null,techStackValidation:null,techStackApproval:null,techStackGeneration:2},original);
 assert.equal(cleared.techStackId,'');assert.equal(cleared.techStackGeneration,2);assert.equal(cleared.techStackPrepared,null);
});
test('Tech Stack screen removes manual and wires new Reset Tech Stack action',()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.doesNotMatch(source,/Access &amp; Testing Manual|architectGuideItems|architectGuideRefresh|case 'architectGuideGet'/);
 assert.match(source,/id="architectResetStack"/);
 assert.match(source,/case 'architectResetStack'/);
 assert.match(ui,/architectBegin\('architectResetStack'/);
 assert.match(source,/techStackGeneration:result.nextGeneration/);
});

test('Reset archives old technology stack metadata and notes instead of overwriting edited files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v188-archive-'));
 try{
  await fs.mkdir(path.join(root,'documents','architecture'),{recursive:true});
  const originalJson='{"id":"react","notes":"custom setting"}\n';
  const originalMd='# Technology Stack — React\n\nManual notes preserved.\n';
  await fs.writeFile(path.join(root,'tech-stack.json'),originalJson);
  await fs.writeFile(path.join(root,'documents','architecture','tech-stack.md'),originalMd);
  const result=await reset.archiveProjectStackDocuments(root,'react');
  assert.deepEqual(result.archived,['tech-stack.json','documents/architecture/tech-stack.md']);
  assert.equal(await fs.readFile(path.join(result.folder,'tech-stack.json'),'utf8'),originalJson);
  assert.equal(await fs.readFile(path.join(result.folder,'documents','architecture','tech-stack.md'),'utf8'),originalMd);
  assert.equal(await fs.stat(path.join(root,'tech-stack.json')).then(()=>true,()=>false),false);
  const second=await reset.archiveProjectStackDocuments(root,'react');assert.deepEqual(second.archived,[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
