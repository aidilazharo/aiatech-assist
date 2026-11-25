'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const git=require('../src/developer-git');
const {ensureCustom,ensureLocal}=require('../src/architect-repository');
const command=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-init-project-'));const map=new Map();const state={get:k=>map.get(k),update:async(k,v)=>map.set(k,v)};try{await fn(root,state);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('initialize Git in populated folder without staging or committing files',()=>fixture(async root=>{
 await fs.writeFile(path.join(root,'package.json'),'{"name":"existing"}');
 await fs.writeFile(path.join(root,'.env'),'local-only');
 const repo=await git.initializeProjectGit(root,'main');
 assert.equal(repo.branch,'main');assert.equal(repo.sha,'');assert.equal(repo.clean,false);
 assert.equal(command(root,'ls-files'),'');
 assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),'local-only');
 assert.equal((await git.initializeProjectGit(root,'main')).sha,'');
}));
test('initialize empty project directory with an unborn main branch',()=>fixture(async root=>{
 const repo=await git.initializeProjectGit(root,'main');assert.equal(repo.branch,'main');assert.equal(repo.sha,'');assert.equal(repo.clean,true);
}));
test('custom Save initializes existing source and configures origin without publishing',()=>fixture(async(root,state)=>{
 const dest=path.join(root,'repository','app');await fs.mkdir(dest,{recursive:true});await fs.writeFile(path.join(dest,'package.json'),'{"name":"app"}');
 const repo=await ensureCustom(state,'demo',git,{projectRoot:root,githubOwner:'acme',githubRepo:'app',githubBranch:'main',initializeExisting:true});
 assert.equal(repo.mode,'initialized');assert.equal(repo.sha,'');assert.equal(command(dest,'ls-files'),'');assert.equal(command(dest,'remote','get-url','origin'),'https://github.com/acme/app.git');
 assert.equal(state.get('atgvAssist.localRepo.demo'),dest);
}));
test('existing Git history and current working files are preserved',()=>fixture(async(root,state)=>{
 const dest=path.join(root,'repository','app');await fs.mkdir(dest,{recursive:true});await git.initializeProjectGit(dest,'main');
 command(dest,'config','user.name','ATGV Test');command(dest,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(dest,'README.md'),'initial');command(dest,'add','README.md');command(dest,'commit','-m','initial');
 const head=command(dest,'rev-parse','HEAD');await fs.writeFile(path.join(dest,'README.md'),'local edit');
 const repo=await ensureCustom(state,'demo',git,{projectRoot:root,githubOwner:'acme',githubRepo:'app',initializeExisting:true});
 assert.equal(repo.sha,head);assert.equal(await fs.readFile(path.join(dest,'README.md'),'utf8'),'local edit');
}));
test('catalog baseline can resume an already initialized empty Git folder',()=>fixture(async(root,state)=>{
 const dest=path.join(root,'repository','demo-react-g0');await fs.mkdir(dest,{recursive:true});await git.initializeProjectGit(dest,'main');
 command(dest,'config','user.name','ATGV Test');command(dest,'config','user.email','test@example.invalid');
 assert.equal(await ensureLocal(state,'demo',git,{projectRoot:root,stackId:'react'}),dest);
 assert.match(command(dest,'rev-parse','HEAD'),/^[a-f0-9]{40}$/);
}));
test('nested project is not initialized inside another repository',()=>fixture(async root=>{
 await git.initializeProjectGit(root,'main');const sub=path.join(root,'sub');await fs.mkdir(sub);await assert.rejects(git.initializeProjectGit(sub,'main'),/another Git repository/);
}));
