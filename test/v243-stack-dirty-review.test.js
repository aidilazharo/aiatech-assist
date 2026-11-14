'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const stack=require('../src/architect-stack-reset');
const {readFileSync}=require('node:fs');
const host=readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
const ui=readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();}
async function withRepo(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v243-dirty-'));
 try{
  execFileSync('git',['init','-b','main',root],{stdio:'ignore'});
  git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');
  await fs.writeFile(path.join(root,'README.md'),'base\n');
  git(root,'add','README.md');git(root,'commit','-m','base');
  git(root,'switch','-c','bootstrap/react-initial');
  await fn(root);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('dirty stack plan names changed tracked and untracked files but leaves both untouched',()=>withRepo(async(root)=>{
 await fs.writeFile(path.join(root,'README.md'),'user edit\n');
 await fs.writeFile(path.join(root,'my notes.txt'),'valuable file\n');
 const report=await stack.inspectWorkingTree(root);
 assert.equal(report.total,2);
 assert.ok(report.entries.some(item=>item.status===' M'&&item.path==='README.md'));
 assert.ok(report.entries.some(item=>item.status==='??'&&item.path==='my notes.txt'));
 const project={techStackId:'react',techStackPrepared:{stackId:'react',branch:'bootstrap/react-initial',root}};
 await assert.rejects(stack.plan({root,project}),e=>{
  assert.match(e.message,/uncommitted or untracked/);
  assert.match(e.message,/README\.md/);
  assert.match(e.message,/my notes\.txt/);
  assert.match(e.message,/Review Git Changes/);return true;
 });
 assert.equal(git(root,'branch','--show-current'),'bootstrap/react-initial');
 assert.equal(await fs.readFile(path.join(root,'README.md'),'utf8'),'user edit\n');
 assert.equal(await fs.readFile(path.join(root,'my notes.txt'),'utf8'),'valuable file\n');
}));
test('clean stack worktree inspection has no false positives',()=>withRepo(async root=>{
 assert.deepEqual((await stack.inspectWorkingTree(root)).entries,[]);
}));
test('Tech Stack exposes read-only review button and host side review action',()=>{
 assert.match(host,/id="architectReviewGitChanges"/);
 assert.match(ui,/send\('architectReviewGitChanges'\)/);
 assert.match(host,/case 'architectReviewGitChanges':/);
 assert.match(host,/showQuickPick\(rows/);
 assert.match(host,/workbench\.view\.scm/);
});
