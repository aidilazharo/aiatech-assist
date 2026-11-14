'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const reset=require('../src/architect-stack-reset');
const host=require('node:fs').readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
const webview=require('node:fs').readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
const bootstrap=require('node:fs').readFileSync(path.join(__dirname,'..','src','architect-stack-bootstrap.js'),'utf8');
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v244-reset-'));
 try{
  execFileSync('git',['init','-b','main',root],{stdio:'ignore'});
  git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');
  await fs.writeFile(path.join(root,'README.md'),'main baseline\n');git(root,'add','.');git(root,'commit','-m','main baseline');
  const baseSha=git(root,'rev-parse','HEAD');git(root,'switch','-c','bootstrap/react-initial');
  await fs.mkdir(path.join(root,'src'));
  await fs.writeFile(path.join(root,'src','main.jsx'),'generated stack\n');
  git(root,'add','src/main.jsx');git(root,'commit','-m','bootstrap react');
  const stackSha=git(root,'rev-parse','HEAD');
  await fn({root,baseSha,stackSha,project:{techStackId:'react',techStackPrepared:{branch:'bootstrap/react-initial',root},techStackGeneration:0}});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('confirmed force reset recovers edited and untracked files in Git stash, returns to main and preserves the old stack branch',()=>fixture(async({root,baseSha,stackSha,project})=>{
 await fs.writeFile(path.join(root,'src','main.jsx'),'my edits\n');
 await fs.writeFile(path.join(root,'notes from user.txt'),'important work\n');
 const planned=await reset.plan({root,project,force:true});
 assert.equal(planned.dirtyCount,2);assert.equal(planned.currentBranch,'bootstrap/react-initial');
 const result=await reset.reset({root,project,force:true,expectedPlan:planned});
 assert.equal(result.nextGeneration,1);assert.equal(result.currentBranch,'main');
 assert.equal(git(root,'rev-parse','HEAD'),baseSha);
 assert.equal(git(root,'rev-parse','bootstrap/react-initial'),stackSha);
 assert.equal((await fs.readFile(path.join(root,'README.md'),'utf8')),'main baseline\n');
 assert.equal(await fs.stat(path.join(root,'notes from user.txt')).then(()=>true,()=>false),false);
 assert.equal(await fs.stat(path.join(root,'src','main.jsx')).then(()=>true,()=>false),false);
 assert.ok(result.recoveryStash);assert.equal(git(root,'rev-parse','stash@{0}'),result.recoveryStash);
 assert.match(git(root,'stash','list'),/ATGV force stack reset/);
 // The stash must be capable of recovering both tracked and untracked content.
 git(root,'switch','bootstrap/react-initial');git(root,'stash','apply','stash@{0}');
 assert.equal(await fs.readFile(path.join(root,'src','main.jsx'),'utf8'),'my edits\n');
 assert.equal(await fs.readFile(path.join(root,'notes from user.txt'),'utf8'),'important work\n');
}));
test('force reset refuses an unrelated branch without stashing or discarding files',()=>fixture(async({root,project})=>{
 git(root,'switch','-c','feature/do-not-touch');
 await fs.writeFile(path.join(root,'notes.txt'),'untouched');
 await assert.rejects(reset.plan({root,project,force:true}),/Switch to the saved stack branch/);
 await assert.rejects(reset.reset({root,project,force:true}),/Switch to the saved stack branch/);
 assert.equal(git(root,'branch','--show-current'),'feature/do-not-touch');
 assert.equal(await fs.readFile(path.join(root,'notes.txt'),'utf8'),'untouched');
 assert.equal(git(root,'stash','list'),'');
}));
test('force reset requires a fresh expected plan before running a stash or hard reset',()=>fixture(async({root,project})=>{
 await fs.writeFile(path.join(root,'first.txt'),'one');
 const planned=await reset.plan({root,project,force:true});
 await fs.writeFile(path.join(root,'second.txt'),'two');
 await assert.rejects(reset.reset({root,project,force:true,expectedPlan:planned}),/changed since the reset confirmation/);
 assert.equal(git(root,'branch','--show-current'),'bootstrap/react-initial');
 assert.equal(git(root,'stash','list'),'');
 assert.equal(await fs.readFile(path.join(root,'first.txt'),'utf8'),'one');
 assert.equal(await fs.readFile(path.join(root,'second.txt'),'utf8'),'two');
}));
test('Save Stack automatically installs dependencies, standalone Install Dependencies UI and handler are removed',()=>{
 assert.doesNotMatch(host,/id="architectInstallDependencies"|case 'architectInstallDependencies':/);
 assert.doesNotMatch(webview,/architectInstallDependencies/);
 assert.match(bootstrap,/await dependencies\.ensureAll\(root,\[target\]/);
 assert.match(host,/case 'architectSaveStack':[\s\S]*?orchestrator\.bootstrap\(/);
 assert.match(host,/case 'architectResetStack':[\s\S]*?force:true/);
 assert.match(host,/Force Reset Tech Stack/);
});
