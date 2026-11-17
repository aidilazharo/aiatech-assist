'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const sync=require('../src/repo-sync-pr');
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
test('Repo Sync: temp clone -> AI reads source info -> AI branch -> stage -> AI commit -> AI PR',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git unavailable');return;}
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-ai-repo-sync-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const a=path.join(temp,'repo-a'),aBare=path.join(temp,'repo-a.git');
 const b=path.join(temp,'repo-b'),bBare=path.join(temp,'repo-b.git');
 fs.mkdirSync(a);fs.mkdirSync(b);
 git(['init','-b','main'],a);git(['config','user.name','ATGV Test'],a);git(['config','user.email','atgv@example.invalid'],a);
 fs.writeFileSync(path.join(a,'package.json'),JSON.stringify({name:'source-portal',version:'1.0.0',description:'Source portal with test coverage'}));
 fs.writeFileSync(path.join(a,'README.md'),'Source app\n');
 fs.writeFileSync(path.join(a,'.env'),'API_SECRET=SECRET_DO_NOT_COPY\n');
 git(['add','--all'],a);git(['commit','-m','feat: create source portal'],a);
 const sha=git(['rev-parse','HEAD'],a);
 // Make source remote accessible to the mocked runner without internet.
 git(['init','--bare','-b','main',aBare],temp);
 git(['remote','add','origin',aBare],a);git(['push','-u','origin','main'],a);
 git(['init','--bare','-b','main',bBare],temp);
 git(['init','-b','main'],b);git(['config','user.name','ATGV Test'],b);git(['config','user.email','atgv@example.invalid'],b);
 fs.writeFileSync(path.join(b,'destination-only.txt'),'preserved\n');
 git(['add','--all'],b);git(['commit','-m','init destination'],b);
 const baseSha=git(['rev-parse','HEAD'],b);
 git(['remote','add','origin',bBare],b);git(['push','-u','origin','main'],b);
 const proposed='feat/source-portal-'+sha.slice(0,8);
 let seenFacts=null,createdTitle='',createdBody='';
 const githubApi={
  getRepository:async()=>({nameWithOwner:'Org/repo-b',defaultBranch:'main'}),
  findOpenPr:async()=>'', 
  createPr:async(repo,token,info)=>{
   assert.equal(repo.name,'Org/repo-b');
   assert.equal(token,'ghp_'+'b'.repeat(40));
   createdTitle=info.title;createdBody=info.body;
   return 'https://github.com/Org/repo-b/pull/123';
  }
 };
 const runner=async(bin,args,{cwd}={})=>{
  if(bin==='gh')throw Error('GitHub CLI must not be invoked.');
  if(bin==='git'&&args[0]==='clone'){git(['clone','--quiet','--branch','main',a,args[args.length-1]],temp);return '';}
  if(bin==='git'&&args[0]==='remote'&&args[1]==='get-url')return 'https://github.com/Org/repo-b.git';
  return git(args,cwd||temp);
 };
 const result=await sync.sync({
  sourceUrl:'https://github.com/Org/repo-a',sourceBranch:'main',destinationUrl:'https://github.com/Org/repo-b',
  destinationFolder:b,sourcePat:'ghp_'+'a'.repeat(40),destPat:'ghp_'+'b'.repeat(40),runner,githubApi,
  planSync:async facts=>{
   seenFacts=facts;
   assert.equal(facts.sourceSha,sha);
   assert.equal(facts.project.name,'source-portal');
   assert.equal(facts.files.includes('.env'),false);
   assert.equal(JSON.stringify(facts).includes('SECRET_DO_NOT_COPY'),false);
   return {branch:proposed,commitMessage:'feat: sync portal via AI review',
    prTitle:'Sync source portal improvements',prDescription:'AI summary: copy approved source portal files and review integration.'};
  }
 });
 assert.equal(seenFacts.sourceRepo,'Org/repo-a');
 assert.equal(result.branch,'feat/create-source-portal');
 assert.equal(result.commitMessage,'feat: Create source portal');
 assert.equal(createdTitle,'feat: Create source portal');
 assert.match(createdBody,/AI summary: copy approved source portal files/);
 assert.ok(createdBody.split('\n').every(line=>line.startsWith('- ')));
 assert.equal(result.prUrl,'https://github.com/Org/repo-b/pull/123');
 assert.equal(git(['rev-parse','refs/remotes/origin/main'],b),baseSha);
 assert.equal(fs.readFileSync(path.join(b,'destination-only.txt'),'utf8'),'preserved\n');
 assert.equal(fs.existsSync(path.join(b,'.env')),false);
 assert.equal(git(['log','-1','--pretty=%s'],b),'feat: Create source portal');
 assert.ok(fs.existsSync(path.join(b,'package.json')));
});
