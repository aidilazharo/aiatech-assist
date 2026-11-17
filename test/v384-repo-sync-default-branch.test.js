'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const api=require('../src/repo-sync-github-api');
const sync=require('../src/repo-sync-pr');
const workspace=require('../src/repo-sync-workspace');
const srcPat='ghp_'+'s'.repeat(40),dstPat='ghp_'+'d'.repeat(40);
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();

test('source API reads the real default branch without requiring write access',async()=>{
 const repo={owner:'Acme',repo:'repo-a',name:'Acme/repo-a'};
 const request=async()=>({status:200,body:{full_name:'Acme/repo-a',default_branch:'master',permissions:{pull:true,push:false}}});
 assert.equal((await api.getSourceRepository(repo,srcPat,request)).defaultBranch,'master');
 await assert.rejects(()=>api.getSourceRepository(repo,srcPat,async()=>({status:200,body:{full_name:'Acme/repo-a',default_branch:'main',permissions:{pull:false}}})),/read access/);
 await assert.rejects(()=>api.getSourceRepository(repo,srcPat,async()=>({status:200,body:{full_name:'Other/repo-a',default_branch:'master',permissions:{pull:true}}})),/identity/);
 await assert.rejects(()=>api.getSourceRepository(repo,srcPat,async()=>({status:200,body:{full_name:'Acme/repo-a',default_branch:'',permissions:{pull:true}}})),/no default branch/);
});

test('Repo Sync UI uses automatic GitHub Source branch, not hard-coded main',()=>{
 const html=workspace.workspaceHtml({nonce:'test-safe',version:'0.3.84',cspSource:'vscode-resource:'});
 assert.match(html,/Source branch \(optional\)/);
 assert.match(html,/id="sourceBranch"[^>]*placeholder="Auto: GitHub default branch/);
 assert.doesNotMatch(html,/id="sourceBranch"[^>]*value="main"/);
 assert.match(html,/sourceBranch:get\('sourceBranch'\)\.value\.trim\(\)/);
 const implementation=fs.readFileSync(path.join(__dirname,'../src/repo-sync-workspace.js'),'utf8');
 assert.match(implementation,/sourceBranch=input\.sourceBranch\?repoSync\.baseName\(input\.sourceBranch\):''/);
});

test('blank Source branch resolves master; existing destination main remains intact',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git unavailable');return;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-source-default-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceLocal=path.join(root,'source'),sourceBare=path.join(root,'source.git');
 const destLocal=path.join(root,'seed-destination'),destBare=path.join(root,'destination.git'),dest=path.join(root,'destination');
 for(const dir of [sourceLocal,destLocal,dest])fs.mkdirSync(dir);
 const init=(dir,branch,file,body)=>{
  git(['init','-b',branch],dir);
  git(['config','user.name','ATGV Test'],dir);git(['config','user.email','atgv@example.invalid'],dir);
  fs.writeFileSync(path.join(dir,file),body);
  git(['add','--all'],dir);git(['commit','-m','init '+branch],dir);
 };
 init(sourceLocal,'master','source.txt','source from master\n');
 init(destLocal,'main','keep.txt','keep destination\n');
 git(['init','--bare','-b','master',sourceBare],root);
 git(['remote','add','origin',sourceBare],sourceLocal);
 git(['push','origin','master'],sourceLocal);
 git(['init','--bare','-b','main',destBare],root);
 git(['remote','add','origin',destBare],destLocal);
 git(['push','origin','main'],destLocal);
 const mainSha=git(['rev-parse','HEAD'],destLocal);
 const sourceUrl='https://github.com/Acme/repo-a.git',destUrl='https://github.com/Acme/repo-b.git';
 const seen=[];
 const runner=async(bin,args,options={})=>{
  assert.equal(bin,'git');seen.push([...args]);
  if(args[0]==='remote'&&args[1]==='get-url')return destUrl;
  const local=args.map(v=>v===sourceUrl?sourceBare:v===destUrl?destBare:v);
  if(local[0]==='clone'&&local.at(-1)==='.') {
   const answer=git(local,options.cwd||root);
   git(['config','user.name','ATGV Test'],dest);
   git(['config','user.email','atgv@example.invalid'],dest);
   return answer;
  }
  return git(local,options.cwd||root);
 };
 const githubApi={
  getRepository:async()=>({nameWithOwner:'Acme/repo-b',defaultBranch:'main'}),
  getSourceRepository:async(r,token)=>{
   assert.equal(r.name,'Acme/repo-a');assert.equal(token,srcPat);
   return {nameWithOwner:'Acme/repo-a',defaultBranch:'master'};
  },
  findOpenPr:async()=>'',createPr:async()=> 'https://github.com/Acme/repo-b/pull/9'
 };
 const options={sourceUrl,sourcePat:srcPat,destinationUrl:destUrl,destPat:dstPat,
  destinationFolder:dest,runner,githubApi};
 const result=await sync.sync(options);
 assert.equal(result.sourceBranch,'master');
 assert.equal(result.base,'main');
 assert.equal(result.prUrl,'https://github.com/Acme/repo-b/pull/9');
 assert.equal(fs.readFileSync(path.join(dest,'source.txt'),'utf8'),'source from master\n');
 assert.equal(fs.readFileSync(path.join(dest,'keep.txt'),'utf8'),'keep destination\n');
 assert.equal(git(['--git-dir',destBare,'rev-parse','refs/heads/main'],root),mainSha);
 assert.ok(seen.some(args=>args[0]==='clone'&&args.includes('master')));
 // An explicitly requested branch is never silently replaced with master.
 await assert.rejects(sync.sync({...options,sourceBranch:'missing'}),/Repo A has no source branch "missing"/);
});

test('empty Repo B branch gives actionable error and never clones or writes main',async()=>{
 const dest=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-repo-b-empty-'));
 try{
  const commands=[];
  const runner=async(_bin,args)=>{
   commands.push(args);
   if(args[0]==='--version')return 'git version 2.47.0';
   if(args[0]==='rev-parse')throw Error('git rev-parse failed: fatal: not a git repository');
   if(args[0]==='ls-remote')return '';
   throw Error('Unexpected Git operation '+args[0]);
  };
  await assert.rejects(sync.sync({
   sourceUrl:'https://github.com/Acme/repo-a',sourceBranch:'main',sourcePat:srcPat,
   destinationUrl:'https://github.com/Acme/repo-b',destinationFolder:dest,destPat:dstPat,
   runner,githubApi:{getRepository:async()=>({nameWithOwner:'Acme/repo-b',defaultBranch:'main'})}
  }),/Repo B has no branch "main".*first commit/);
  assert.equal(commands.some(args=>args[0]==='clone'),false);
  assert.deepEqual(fs.readdirSync(dest),[]);
 }finally{fs.rmSync(dest,{recursive:true,force:true});}
});
