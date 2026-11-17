'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const sync=require('../src/repo-sync-pr'),workspace=require('../src/repo-sync-workspace');
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
test('Workspace has source review and separate approved publish action',()=>{
 const html=workspace.workspaceHtml({nonce:'r',version:'0.3.90',cspSource:'vscode-resource:'});
 for(const id of ['sourceAnalysis','reviewPanel','reviewBranch','reviewCommit','reviewTitle','reviewDescription','publishReviewed'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const str of ['Pull & Study Source Code','prepareSyncReview','sourceReviewReady','publishReviewedSync'])
  assert.ok(html.includes(str),str);
 const script=html.match(/<script nonce="r">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);assert.doesNotThrow(()=>new Function(script));
});
test('Study reads real source code and does not mutate Repo B until reviewed publish',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git unavailable');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),dest=path.join(dir,'dest'),bare=path.join(dir,'dest.git');
 fs.mkdirSync(source);fs.mkdirSync(dest);
 git(['init','-b','main'],source);git(['config','user.name','ATGV Test'],source);git(['config','user.email','atgv@example.invalid'],source);
 fs.mkdirSync(path.join(source,'src'));fs.writeFileSync(path.join(source,'src','service.js'),'function listBooks(){return [1];}\nmodule.exports={listBooks};\n');
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'book-service',scripts:{test:'node --test'},dependencies:{express:'*'}}));
 git(['add','.'],source);git(['commit','-m','feat: implement book service'],source);
 const sha=git(['rev-parse','HEAD'],source);
 git(['init','--bare','-b','main',bare],dir);git(['init','-b','main'],dest);
 git(['config','user.name','ATGV Test'],dest);git(['config','user.email','atgv@example.invalid'],dest);
 fs.writeFileSync(path.join(dest,'target.txt'),'keep\n');git(['add','.'],dest);git(['commit','-m','initial'],dest);
 git(['remote','add','origin',bare],dest);git(['push','-u','origin','main'],dest);
 const before=git(['rev-parse','HEAD'],dest),srcUrl='https://github.com/Acme/repo-a',dstUrl='https://github.com/Acme/repo-b';
 let actualPr;
 const githubApi={getRepository:async()=>({nameWithOwner:'Acme/repo-b',defaultBranch:'main'}),
  findOpenPr:async()=>'',createPr:async(r,pat,details)=>{actualPr=details;return 'https://github.com/Acme/repo-b/pull/20';}};
 const runner=async(bin,args,{cwd}={})=>{
  if(bin==='git'&&args[0]==='clone'&&args.at(-1)!=='.'){git(['clone','--quiet','--single-branch','--branch','main',source,args.at(-1)],dir);return '';}
  if(bin==='git'&&args[0]==='remote'&&args[1]==='get-url')return dstUrl+'.git';
  if(bin==='git'&&args[0]==='ls-remote'&&args.includes(dstUrl+'.git'))return git(args.map(v=>v===dstUrl+'.git'?bare:v),cwd||dir);
  return git(args,cwd||dir);
 };
 const opts={sourceUrl:srcUrl,sourceBranch:'main',destinationUrl:dstUrl,destinationFolder:dest,
  sourcePat:'ghp_'+'a'.repeat(40),destPat:'ghp_'+'b'.repeat(40),githubApi,runner,
  planSync:async facts=>{
   assert.equal(facts.sourceSha,sha);assert.ok(facts.codeOverview.symbols.some(v=>v.name==='listBooks'));
   return {branch:'feat/book-service-'+sha.slice(0,8),commitMessage:'feat: proposed book service',
    prTitle:'Book service update',prDescription:'- Implement book service.'};
  }};
 const preview=await sync.sync({...opts,previewOnly:true});
 assert.equal(preview.preview,true);assert.equal(preview.review.sourceSha,sha);
 assert.equal(preview.review.prTitle,'Book service update');
 assert.equal(git(['rev-parse','HEAD'],dest),before);
 assert.equal(git(['status','--porcelain'],dest),'');
 assert.equal(fs.existsSync(path.join(dest,'src')),false);
 await assert.rejects(()=>sync.sync({...opts,approvedReview:{...preview.review,sourceSha:'0'.repeat(40)}}),/changed since review/);
 assert.equal(git(['rev-parse','HEAD'],dest),before);
 const approvedReview={...preview.review,commitMessage:'feat: reviewed book service',prTitle:'Reviewed book service',
  prDescription:'- Copy service code and scripts.'};
 const result=await sync.sync({...opts,approvedReview});
 assert.equal(result.commitMessage,approvedReview.commitMessage);
 assert.equal(actualPr.branch,preview.review.branch);
 assert.equal(actualPr.title,approvedReview.prTitle);
 assert.equal(actualPr.body,approvedReview.prDescription);
 assert.equal(git(['log','-1','--pretty=%s'],dest),'feat: reviewed book service');
 assert.equal(git(['rev-parse','refs/remotes/origin/main'],dest),before);
 assert.equal(fs.readFileSync(path.join(dest,'target.txt'),'utf8'),'keep\n');
});
