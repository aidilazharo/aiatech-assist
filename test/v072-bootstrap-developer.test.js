'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {skeletonFiles,generateSkeleton}=require('../src/project-skeleton');
const git=require('../src/developer-git');
const roles=require('../src/sdlc-catalog');
const fixture=require('./catalog-fixture');
async function temp(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv72-'));try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
function command(dir,...args){return execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
test('Tech Lead is built-in and disabled by default, without losing Developer role',async()=>{
 const all=await roles.allProjectRoles?.(null,null)||[];
 assert.ok(all.some(role=>role.id==='technical-lead'));
 await temp(async root=>{const project=path.join(root,'projects','demo');await fs.mkdir(path.join(project,'sdlc'),{recursive:true});const registry={fileFor:()=>path.join(project,'atgv.project.json')};const config=await roles.getRoleSettings(registry,'demo');assert.equal(config.enabled.includes('technical-lead'),false);assert.equal(config.enabled.includes('software-developer'),true);});
});
test('all five skeletons are loaded from pinned remote catalog and include API ORM and SQLite',()=>temp(async workspace=>{
 await fixture.activate(workspace);const root=path.join(workspace,'checkout');await fs.mkdir(root);
 for(const stack of ['react','angular','nestjs','spring-boot','dotnet']){
  const files=await skeletonFiles([stack],root);
  assert.ok(Object.keys(files).some(k=>k.endsWith('package.json')||k.endsWith('pom.xml')||k.endsWith('.csproj')),stack);
  assert.ok(Object.keys(files).some(k=>k.includes('src/')||k.endsWith('Program.cs')),stack);
  assert.ok(files['atgv.bootstrap.json']);assert.match(files['atgv.bootstrap.json'].toString(),/github-main-catalog/);
 }
 await assert.rejects(skeletonFiles(['react','angular'],root),/frontend and one backend/);
 const paired=await skeletonFiles(['react','nestjs'],root);assert.ok(Object.keys(paired).some(x=>x.startsWith('apps/web/')));
}));
test('project skeleton does not overwrite files and rejects symlinked destinations',()=>temp(async root=>{
 await fixture.activate(root);const original=await generateSkeleton(root,['react']);assert.ok(original.files.includes('package.json'));
 await assert.rejects(generateSkeleton(root,['react']),/overwrite/);
 assert.match(await fs.readFile(path.join(root,'src/main.jsx'),'utf8'),/ATGV React/);
}));
test('repository detection prevents branch creation against dirty worktrees',()=>temp(async root=>{
 command(root,'init','-b','main');command(root,'config','user.email','test@example.invalid');command(root,'config','user.name','Test');
 await fs.writeFile(path.join(root,'README.md'),'baseline\n');command(root,'add','README.md');command(root,'commit','-m','baseline');
 assert.equal((await git.repository(root)).clean,true);await fs.writeFile(path.join(root,'dirty.txt'),'unsaved');
 assert.equal((await git.repository(root)).clean,false);
 await assert.rejects(git.createBranch(root,'CLAIM-101'),/Uncommitted/);
 assert.throws(()=>git.jiraKey('!bad'),/valid Jira/);
 assert.equal(git.branchName('CLAIM-101','Validate Claim'),'feature/claim-101-validate-claim');
}));
test('story branches start at updated integration branch, not obsolete skeleton',()=>temp(async root=>{
 const bare=path.join(root,'remote.git'),repo=path.join(root,'repo');await fs.mkdir(repo);command(root,'init','--bare',bare);command(repo,'init','-b','main');command(repo,'config','user.email','test@example.invalid');command(repo,'config','user.name','Test');
 await fs.writeFile(path.join(repo,'README.md'),'initial');command(repo,'add','.');command(repo,'commit','-m','initial');command(repo,'remote','add','origin',bare);command(repo,'push','-u','origin','main');
 const first=await git.createBranch(repo,'CLAIM-101',{base:'main',summary:'First Story'});assert.equal(first.head,first.baseSha);
 await fs.writeFile(path.join(repo,'feature.txt'),'one');command(repo,'add','.');command(repo,'commit','-m','feature');command(repo,'switch','main');command(repo,'merge','--ff-only',first.branch);command(repo,'push','origin','main');
 const second=await git.createBranch(repo,'CLAIM-102',{base:'main'});assert.notEqual(second.baseSha,first.baseSha);assert.equal(second.head,second.baseSha);
 await assert.rejects(git.createBranch(repo,'CLAIM-102',{base:'main'}),/already exists/);
}));
test('an empty cloned repo can receive its initial baseline, scaffold branch and push to origin without overwriting README',()=>temp(async root=>{
 const bare=path.join(root,'empty.git'),clone=path.join(root,'cloned');
 command(root,'init','--bare',bare);execFileSync('git',['clone',bare,clone],{stdio:['ignore','pipe','pipe']});
 command(clone,'config','user.email','test@example.invalid');command(clone,'config','user.name','Test');
 await fixture.activate(root);const first=await git.initLocalBaseline(clone);assert.equal(first.branch,'main');
 const scaffold=await generateSkeleton(clone,['react']);assert.ok(scaffold.files.includes('package.json'));assert.ok(!scaffold.files.includes('README.md'));
 const committed=await git.commitBootstrap(clone,['react']);assert.equal(committed.branch,'bootstrap/initial-tech-stack');
 const published=await git.publishBootstrap(clone);assert.equal(published.published,true);
 assert.equal(command(clone,'ls-remote','--heads','origin','refs/heads/main').length>0,true);
 assert.equal(command(clone,'ls-remote','--heads','origin','refs/heads/bootstrap/initial-tech-stack').length>0,true);
 await assert.rejects(git.commitBootstrap(clone,['react']),/integration branch/);
}));
test('Architect exposes only Save, Test & Run and Approve; Developer uses the Jira assignment table',()=>{
 const html=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 for(const id of ['architectStackSelect','architectSaveStack','architectApproveStack','roleJiraTable','roleJiraRefresh']){
  assert.match(html,new RegExp(`id="${id}"`));assert.ok(ui.includes(`'${id}'`),`UI control ${id} missing its listener or reference`);
 }
 for(const removed of ['architectGenerate','architectInitialize','architectCommit','architectPublish','developerWorkbench','devLoadJira','devTest','workGithub'])assert.doesNotMatch(html,new RegExp(`id="${removed}"`));
 for(const command of ['architectSaveStack','architectTestStack','architectApproveStack','roleJiraIssues','roleJiraAssign'])assert.ok(html.includes(`case '${command}':`));
});
