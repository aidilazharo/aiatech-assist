'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const architect=require('../src/architect-simple-workflow');
const developerGit=require('../src/developer-git');
const fixture=require('./catalog-fixture');
const rootDir=path.join(__dirname,'..');
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();}
async function withRepo(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv183-'));try{
 await fixture.activate(root);const repo=path.join(root,'repo');await fs.mkdir(repo);git(repo,'init','-b','main');git(repo,'config','user.name','ATGV Test');git(repo,'config','user.email','atgv@example.invalid');
 return await fn(repo);
}finally{await fs.rm(root,{recursive:true,force:true});}}

test('Save Stack prepares real app in existing GitHub clone and preserves baseline files',()=>withRepo(async root=>{
 const readme='# Example real project\n';const ignore='# Do not overwrite ignore rules\n';
 await fs.writeFile(path.join(root,'README.md'),readme);
 await fs.writeFile(path.join(root,'.gitignore'),ignore);
 await fs.writeFile(path.join(root,'LICENSE'),'Existing license must not be overwritten\n');
 git(root,'add','.');git(root,'commit','-m','create GitHub starter');
 const result=await architect.save(root,['react']);
 assert.equal(result.generated,true);
 assert.equal(await fs.readFile(path.join(root,'README.md'),'utf8'),readme);
 assert.equal(await fs.readFile(path.join(root,'.gitignore'),'utf8'),ignore);
 assert.equal(await fs.readFile(path.join(root,'LICENSE'),'utf8'),'Existing license must not be overwritten\n');
 const inspection=await developerGit.inspectScripts(root);
 assert.equal(inspection.targets.length,1);
 assert.deepEqual(inspection.targets[0].scripts.sort(),['dev','build','test','start'].sort());
 const plan=await architect.generatedCommitPlan(root,['react']);
 assert.equal(plan.needsCommit,true);
 assert.ok(plan.files.includes('package.json'));
 assert.ok(!plan.files.includes('README.md'));
 assert.ok(!plan.files.includes('.gitignore'));
 await architect.commitGenerated(plan);
 assert.equal((await developerGit.repository(root)).clean,true);
 assert.equal((await architect.save(root,['react'])).generated,false);
}));

test('Save Stack rejects conflicting application files without partially generating or overwriting',()=>withRepo(async root=>{
 await fs.mkdir(path.join(root,'src'));
 await fs.writeFile(path.join(root,'src','main.jsx'),'real app preserved');
 git(root,'add','.');git(root,'commit','-m','existing app');
 await assert.rejects(architect.save(root,['react']),/Cannot overwrite existing application files/);
 assert.equal(await fs.readFile(path.join(root,'src','main.jsx'),'utf8'),'real app preserved');
 assert.equal(await fs.stat(path.join(root,'package.json')).then(()=>true,()=>false),false);
 assert.equal((await developerGit.repository(root)).clean,true);
}));

test('Save Stack rejects non-runnable npm project instead of reporting success',()=>withRepo(async root=>{
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'broken-existing-app',scripts:{lint:'echo lint'}}));
 git(root,'add','.');git(root,'commit','-m','existing JS project');
 await assert.rejects(architect.save(root,['react']),/needs test, build and run scripts/);
 assert.equal(await fs.stat(path.join(root,'atgv.bootstrap.json')).then(()=>true,()=>false),false);
}));

test('Settings accordions and architect stack sections use uniform widths, compact inputs and version',()=>{
 const css=require('node:fs').readFileSync(path.join(rootDir,'media/start.css'),'utf8');
 const host=require('node:fs').readFileSync(path.join(rootDir,'test/generated/extension-source.txt'),'utf8');
 const pkg=require('../package.json');
 assert.equal(pkg.atgvDisplayVersion,'0.3.52');
 assert.match(css,/:is\(#settingsView,#projectView\) \.ext-settings-accordion\{box-sizing:border-box;width:100%;max-width:none/);
 assert.match(css,/#workView #architectBootstrap>\.architect-simple-flow\{box-sizing:border-box;width:100%;max-width:none/);
 assert.match(css,/:is\(#settingsView,#projectView\) \.ext-settings-content \.form-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 for(const id of ['settingsJiraGroup','settingsConfluenceGroup','settingsGithubGroup','settingsCatalogGroup'])assert.match(host,new RegExp('id="'+id+'"'));
});
