'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validGithubBranch,normalizeExtensionSettings,projectConfig}=require('../src/projects');
const {listGithubBranches}=require('../src/clients');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const config=o=>({get:k=>o[k]||''});
const response=v=>({ok:true,status:200,json:async()=>v});

test('GitHub branch names support feature folders and reject unsafe ref syntax',()=>{
 assert.equal(validGithubBranch('main'),'main');
 assert.equal(validGithubBranch('release/2026-11'),'release/2026-11');
 assert.equal(validGithubBranch('feature/new_ui'),'feature/new_ui');
 for(const bad of ['../file','feature//bad','-rm','branch..x','release/.hidden','a.lock','a/../b','a@{b','a b','evil\\other']){
  assert.throws(()=>validGithubBranch(bad),/Invalid GitHub branch/);
 }
 const normalized=normalizeExtensionSettings({github:{owner:'example',repo:'myrepo',branch:'release/2026-11'}});
 assert.equal(normalized.github.branch,'release/2026-11');
 assert.equal(projectConfig(null,normalized).get('github.branch'),'release/2026-11');
 assert.equal(projectConfig({settings:{github:{branch:'develop'}}},normalized).get('github.branch'),'develop');
});

test('GitHub branch discovery retrieves actual remote branches and default branch',async()=>{
 const prior=global.fetch;const seen=[];
 global.fetch=async (url)=>{
  const u=new URL(url);seen.push(u.pathname+u.search);
  if(u.pathname==='/repos/demo/app')return response({default_branch:'main'});
  if(u.pathname==='/repos/demo/app/branches')return response([{name:'main',protected:true},{name:'develop',protected:false},{name:'feature/add-api',protected:false}]);
  throw Error('Unexpected URL: '+url);
 };
 try{
  const result=await listGithubBranches(config({'github.apiUrl':'https://api.github.com','github.owner':'demo','github.repo':'app'}),'token');
  assert.equal(result.defaultBranch,'main');
  assert.deepEqual(result.branches.map(b=>b.name),['main','develop','feature/add-api']);
  assert.equal(result.branches[0].protected,true);
  assert.equal(result.branches[2].default,false);
  assert.ok(seen.some(s=>s.includes('branches?per_page=100&page=1')));
 }finally{global.fetch=prior;}
});

test('Branch picker is saved only after GitHub test and routed through clone and bootstrap',()=>{
 const host=read('test/generated/extension-source.txt'),web=read('media/start.js'),css=read('media/start.css'),git=read('src/developer-git.js'),reset=read('src/architect-stack-reset.js');
 for(const id of ['githubBranch','listGithubBranches','githubBranchStatus'])assert.match(host,new RegExp('id="'+id+'"'));
 assert.match(host,/case 'listExtensionGithubBranches':/);
 assert.match(host,/listGithubBranches\(config,token/);
 assert.match(host,/fields\.branch/);
 assert.match(host,/requestJson\(`\$\{githubRepoInfo\(config\)\.route\}\/branches\//);
 assert.match(host,/developerGit\.cloneConfigured\(resolvedParent,fields\.owner,fields\.repo,fields\.branch\)/);
 assert.match(host,/orchestrator\.bootstrap\(\{root,stackId:id,generation:preparedProject\.techStackGeneration\|\|0,baseBranch/);
 assert.match(web,/function requestGithubBranches\(/);
 assert.match(web,/type==='githubBranchesResult'/);
 assert.match(web,/send\('saveGithub',\{settings:\{owner:read\('githubOwner'\),repo:read\('githubRepository'\),branch:read\('githubBranch'\)\}\}\)/);
 assert.match(css,/github-branch-input/);
 assert.match(git,/\['clone', \.\.\.\(selected\?\['--branch',selected\]/);
 assert.match(reset,/baseBranch=validGithubBranch\(/);
});
