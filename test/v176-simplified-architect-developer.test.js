'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const architect=require('../src/architect-simple-workflow');
const git=require('../src/developer-git');
const fixture=require('./catalog-fixture');
const host=fsSync.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=fsSync.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
function run(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();}
async function withRepo(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv176-'));try{
 await fixture.activate(dir);const root=path.join(dir,'repo');await fs.mkdir(root);run(root,'init','-b','main');run(root,'config','user.name','Test');run(root,'config','user.email','test@example.invalid');
 return await fn(root);
}finally{await fs.rm(dir,{recursive:true,force:true});}}

test('Save Stack copies real runnable source into empty Git checkout root (not skeleton subdirectory)',()=>withRepo(async root=>{
 const result=await architect.save(root,['react']);
 assert.equal(result.generated,true);assert.equal(result.root,root);
 assert.equal(await fs.stat(path.join(root,'src','main.jsx')).then(s=>s.isFile()),true);
 assert.equal(await fs.stat(path.join(root,'package.json')).then(s=>s.isFile()),true);
 assert.equal(await fs.stat(path.join(root,'skeleton')).then(()=>true,()=>false),false);
 const plan=await architect.generatedCommitPlan(root,['react']);assert.equal(plan.needsCommit,true);
 assert.ok(plan.files.includes('package.json'));
 assert.equal(await architect.commitGenerated(plan),true);
 const committed=await git.repository(root);assert.equal(committed.clean,true);assert.ok(committed.sha);
 assert.equal((await architect.generatedCommitPlan(root,['react'])).needsCommit,false);
 const second=await architect.save(root,['react']);assert.equal(second.generated,false);
 await assert.rejects(architect.save(root,['nestjs']),/different ATGV starter stack/);
}));

test('Test & Run allows committed changes but blocks auto committing edited or unrelated untracked files',()=>withRepo(async root=>{
 await architect.save(root,['react']);
 await fs.writeFile(path.join(root,'src','main.jsx'),'// user changed\n');
 await assert.rejects(architect.generatedCommitPlan(root,['react']),/edited/);
 await fs.writeFile(path.join(root,'src','main.jsx'),(await require('../src/project-skeleton').skeletonFiles(['react'],root))['src/main.jsx']);
 await fs.writeFile(path.join(root,'unrelated-secret.txt'),'do-not-commit');
 await assert.rejects(architect.generatedCommitPlan(root,['react']),/non-starter/);
 await fs.rm(path.join(root,'unrelated-secret.txt'));
 await architect.commitGenerated(await architect.generatedCommitPlan(root,['react']));
 await fs.writeFile(path.join(root,'src','main.jsx'),'// reviewed edit\n');
 run(root,'add','src/main.jsx');run(root,'commit','-m','reviewed edit');
 assert.equal((await architect.generatedCommitPlan(root,['react'])).needsCommit,false);
}));

test('Solution Architect UI includes three progressive controls and all extra buttons are removed',()=>{
 for(const id of ['architectStackSelect','architectSaveStack','architectTestStack','architectApproveStack'])assert.match(host,new RegExp('id="'+id+'"'));
 assert.match(ui,/architectTestStack'\)\.classList\.remove\('hidden'\)/);
 assert.match(ui,/architectApproveStack'\)\.classList\.remove\('hidden'\)/);
 for(const id of ['architectInitialize','architectGenerate','architectCommit','architectPublish','architectRecommend','architectUseConfiguredRepo','architectCompanion'])assert.doesNotMatch(host,new RegExp('id="'+id+'"'));
 assert.match(host,/techStackPrepared/);
 assert.match(host,/orchestrator\.bootstrap\(/);
 assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/architect-stack-bootstrap.js'),'utf8'),/architect\.save\(root,\[stackId\]\)/);
 assert.match(host,/architectSimple\.generatedCommitPlan/);
 assert.match(host,/stack-dependency-helper/);
 assert.match(host,/gate\.approval\(verifiedProject,repo,actor\)/);
});

test('Developer role table requires architect approval to claim, and duplicate panels are absent',()=>{
 for(const removed of ['Developer · Jira Task Workbench','2 · Develop on a dedicated branch','3 · Run unit tests and review delivery','GitHub · Review','Completion flags are local planning records'])assert.doesNotMatch(host,new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(host,/id="roleJiraTable"/);
 assert.match(host,/roleId==='software-developer'&&mode==='assign'/);
 assert.match(ui,/roleId:selectedRole/);
 assert.match(host,/jiraAssignCurrentUser/);
});
