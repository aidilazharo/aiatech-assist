'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const sync=require('../src/repo-sync-pr');
const api=require('../src/repo-sync-github-api');
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();

test('Source PR GitHub metadata is verified and its title/body are not modified',async()=>{
 const repo={owner:'Acme',repo:'original',name:'Acme/original'},sha='a'.repeat(40);
 const upstream={number:2,title:'Exactly the source PR title',body:'## Original description\n- Keep this text.',
  head:{ref:'fix/original-branch',sha,repo:{full_name:'Acme/original'}},base:{ref:'main'},html_url:'https://github.com/Acme/original/pull/2'};
 const request=async(r,token,method,suffix)=>{
  assert.equal(token,'source-pat');assert.equal(method,'GET');
  if(suffix==='/pulls/2')return {status:200,body:upstream};
  if(suffix==='/commits/'+sha+'/pulls?per_page=100')return {status:200,body:[upstream]};
  throw Error('Unexpected request '+suffix);
 };
 assert.deepEqual(await api.getSourcePullRequest(repo,'source-pat',2,request),
  {number:2,branch:'fix/original-branch',sha,title:upstream.title,body:upstream.body,url:upstream.html_url});
 assert.equal((await api.getSourcePrForCommit(repo,'source-pat',{sha,branch:'fix/original-branch'},request)).title,upstream.title);
 assert.equal(await api.getSourcePrForCommit(repo,'source-pat',{sha,branch:'main'},request),null);
 await assert.rejects(()=>api.getSourcePullRequest(repo,'source-pat',3,async()=>({status:404})),/Could not read source PR/);
});

test('Repo Sync preserves source PR branch, full commit message and exact PR details',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git unavailable');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-pr-metadata-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),dest=path.join(dir,'dest'),bare=path.join(dir,'dest.git');
 fs.mkdirSync(source);fs.mkdirSync(dest);
 git(['init','-b','main'],source);
 git(['config','user.name','ATGV Test'],source);git(['config','user.email','atgv@example.invalid'],source);
 fs.writeFileSync(path.join(source,'README.md'),'Initial\n');
 git(['add','.'],source);git(['commit','-m','Initial'],source);
 git(['switch','-c','fix/original-branch'],source);
 fs.writeFileSync(path.join(source,'feature.txt'),'Feature\n');
 git(['add','.'],source);
 const originalMessage='fix(catalog): exact source message\n\nPreserve body and title.';
 git(['commit','-m',originalMessage],source);
 const sourceSha=git(['rev-parse','HEAD'],source);
 git(['init','--bare','-b','main',bare],dir);
 git(['init','-b','main'],dest);
 git(['config','user.name','ATGV Test'],dest);git(['config','user.email','atgv@example.invalid'],dest);
 fs.writeFileSync(path.join(dest,'destination.txt'),'Retain\n');
 git(['add','.'],dest);git(['commit','-m','Dest initial'],dest);
 git(['remote','add','origin',bare],dest);git(['push','-u','origin','main'],dest);
 const originalPr={number:2,branch:'fix/original-branch',sha:sourceSha,title:'Source PR title exactly',
  body:'## Source PR body\nPreserve *this* exact text.',url:'https://github.com/Acme/repo-a/pull/2'};
 let observed=null,aiCalled=false;
 const githubApi={
  getRepository:async()=>({nameWithOwner:'Acme/repo-b',defaultBranch:'main'}),
  getSourcePullRequest:async()=>originalPr,
  findOpenPr:async()=>'',createPr:async(repo,token,details)=>{observed=details;return 'https://github.com/Acme/repo-b/pull/8';}
 };
 const runner=async(bin,args,{cwd}={})=>{
  if(bin==='git'&&args[0]==='clone'){
   assert.equal(args[args.indexOf('--branch')+1],'fix/original-branch');
   git(['clone','--quiet','--branch','fix/original-branch',source,args.at(-1)],dir);return '';
  }
  if(bin==='git'&&args[0]==='remote'&&args[1]==='get-url')return 'https://github.com/Acme/repo-b.git';
  return git(args,cwd||dir);
 };
 const outcome=await sync.sync({
  sourceUrl:'https://github.com/Acme/repo-a',sourcePrNumber:2,
  destinationUrl:'https://github.com/Acme/repo-b',destinationFolder:dest,
  sourcePat:'ghp_'+'a'.repeat(40),destPat:'ghp_'+'b'.repeat(40),githubApi,runner,
  planSync:async()=>{aiCalled=true;return {branch:'sync/ai-forced',commitMessage:'rewritten'};},
  describePr:async()=>{aiCalled=true;return 'rewritten body';}
 });
 assert.equal(outcome.branch,'fix/original-branch');
 assert.equal(outcome.commitMessage,originalMessage);
 assert.equal(outcome.sourcePrUrl,originalPr.url);
 assert.equal(observed.branch,'fix/original-branch');
 assert.equal(observed.title,originalPr.title);
 assert.equal(observed.body,originalPr.body);
 assert.equal(git(['log','-1','--pretty=%B'],dest),originalMessage);
 assert.equal(aiCalled,false);
 assert.equal(fs.readFileSync(path.join(dest,'destination.txt'),'utf8'),'Retain\n');
 assert.equal(fs.readFileSync(path.join(dest,'feature.txt'),'utf8'),'Feature\n');
});
