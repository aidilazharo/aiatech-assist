'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const repoSync=require('../src/repo-sync-pr');
const workspace=require('../src/repo-sync-workspace');
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
const srcPat='ghp_'+'s'.repeat(40),dstPat='ghp_'+'d'.repeat(40);
test('successful Source and Destination tests save canonical URLs, not embedded PATs, and restore on reopening',async()=>{
 let handler,disposed;const messages=[],state=new Map(),secrets=new Map();
 const makePanel=()=>({reveal(){},onDidDispose(fn){disposed=fn;},webview:{
  cspSource:'vscode-resource:',html:'',onDidReceiveMessage(fn){handler=fn;},
  async postMessage(message){messages.push(message);}
 }});
 const fake={ViewColumn:{One:1},Uri:{parse:v=>v},env:{openExternal:async()=>{}},window:{
  createWebviewPanel:()=>makePanel(),showInputBox:async()=>{throw Error('saved PAT should be available');},
  showOpenDialog:async()=>[],showWarningMessage:async()=> 'Create Sync PR'
 }};
 const preferences={get:(key,fallback='')=>state.get(key)??fallback,update:async(key,value)=>{state.set(key,value);}};
 const secretStorage={get:async key=>secrets.get(key),store:async(key,value)=>secrets.set(key,value)};
 const opts={version:'0.3.83',preferences,secrets:secretStorage,testConnection:async(repo,token,kind)=>{
  assert.equal(repo.name,kind==='Source'?'Acme/repo-a':'Acme/repo-b');
  assert.equal(token,kind==='Source'?srcPat:dstPat);return {repo:repo.name,permission:kind==='Source'?'pull':'push'};
 }};
 workspace.open(fake,opts);
 try{
  await handler({command:'testRepoConnection',kind:'Source',url:'https://aidil:'+srcPat+'@github.com/Acme/repo-a'});
  await handler({command:'testRepoConnection',kind:'Destination',url:'https://aidil:'+dstPat+'@github.com/Acme/repo-b'});
  assert.equal(state.get('atgvAssist.repoSync.lastSourceUrl'),'https://github.com/Acme/repo-a');
  assert.equal(state.get('atgvAssist.repoSync.lastDestinationUrl'),'https://github.com/Acme/repo-b');
  assert.ok([...secrets.values()].includes(srcPat));
  assert.ok([...secrets.values()].includes(dstPat));
  assert.ok(!JSON.stringify([...state.entries()]).includes('ghp_'));
  assert.ok(!JSON.stringify(messages).includes(srcPat));
  assert.ok(!JSON.stringify(messages).includes(dstPat));
 }finally{disposed?.();}
 messages.length=0;workspace.open(fake,opts);
 try{
  await handler({command:'getRepoSyncSaved'});
  const restored=messages.filter(v=>v.type==='repoSyncSaved');
  assert.equal(restored.length,2);
  for(const item of restored){
   assert.equal(item.credentialSaved,true);
   assert.match(item.safeUrl,/^https:\/\/github\.com\/Acme\/repo-[ab]$/);
   assert.equal(Object.prototype.hasOwnProperty.call(item,'token'),false);
  }
 }finally{disposed?.();}
});
test('sync clones Repo B into an empty external folder before creating review branch and PR',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git unavailable');return;}
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-empty-repo-b-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const a=path.join(tmp,'a'),aBare=path.join(tmp,'a.git'),b=path.join(tmp,'setup-b'),bBare=path.join(tmp,'b.git'),empty=path.join(tmp,'repo-b');
 fs.mkdirSync(a);fs.mkdirSync(b);fs.mkdirSync(empty);
 git(['init','-b','main'],a);git(['config','user.name','ATGV Test'],a);git(['config','user.email','atgv@example.invalid'],a);
 fs.writeFileSync(path.join(a,'README.md'),'Repo A document\n');git(['add','--all'],a);git(['commit','-m','feat: initial source'],a);
 git(['init','--bare','-b','main',aBare],tmp);git(['remote','add','origin',aBare],a);git(['push','origin','main'],a);
 git(['init','-b','main'],b);git(['config','user.name','ATGV Test'],b);git(['config','user.email','atgv@example.invalid'],b);
 fs.writeFileSync(path.join(b,'destination-only.txt'),'keep me\n');git(['add','--all'],b);git(['commit','-m','initial Repo B'],b);
 git(['init','--bare','-b','main',bBare],tmp);git(['remote','add','origin',bBare],b);git(['push','origin','main'],b);
 const baseSha=git(['rev-parse','HEAD'],b);
 const commands=[];
 const runner=async(bin,args,{cwd}={})=>{
  assert.equal(bin,'git');commands.push({args,cwd});
  if(args[0]==='clone'){
   if(args.at(-1)==='.'){assert.equal(cwd,empty);git(['clone','--quiet','--branch','main',bBare,'.'],empty);git(['config','user.name','ATGV Test'],empty);git(['config','user.email','atgv@example.invalid'],empty);}
   else git(['clone','--quiet','--branch','main',aBare,args.at(-1)],tmp);
   return '';
  }
  if(args[0]==='remote'&&args[1]==='get-url')return 'https://github.com/Acme/repo-b.git';
  if(args[0]==='fetch'&&cwd===empty)return git(['fetch',bBare,args.at(-1)],cwd);
  if(args[0]==='ls-remote'&&cwd===empty)return git(['ls-remote','--heads',bBare,args.at(-1)],cwd);
  if(args[0]==='push'&&cwd===empty)return git(['push','--set-upstream',bBare,args.at(-1)],cwd);
  return git(args,cwd||tmp);
 };
 let createdPr=0;
 const githubApi={
  getRepository:async(repo,token)=>{assert.equal(repo.name,'Acme/repo-b');assert.equal(token,dstPat);return {nameWithOwner:repo.name,defaultBranch:'main'};},
  findOpenPr:async()=>'',createPr:async(repo,token,pr)=>{
   assert.equal(repo.name,'Acme/repo-b');assert.equal(token,dstPat);assert.equal(pr.base,'main');createdPr++;
   return 'https://github.com/Acme/repo-b/pull/77';
  }
 };
 const result=await repoSync.sync({sourceUrl:'https://github.com/Acme/repo-a',sourceBranch:'main',
  destinationUrl:'https://github.com/Acme/repo-b',destinationFolder:empty,
  sourcePat:srcPat,destPat:dstPat,runner,githubApi});
 assert.equal(result.prUrl,'https://github.com/Acme/repo-b/pull/77');
 assert.equal(createdPr,1);
 assert.equal(git(['rev-parse','refs/heads/main'],empty),baseSha);
 assert.equal(git(['--git-dir',bBare,'rev-parse','refs/heads/main'],tmp),baseSha);
 assert.equal(fs.readFileSync(path.join(empty,'destination-only.txt'),'utf8'),'keep me\n');
 assert.equal(fs.readFileSync(path.join(empty,'README.md'),'utf8'),'Repo A document\n');
 assert.ok(commands.some(v=>v.args[0]==='clone'&&v.cwd===empty&&v.args.at(-1)==='.'));
 assert.ok(result.branch.startsWith('sync/repo-a/'));
});
test('populated non-Git Repo B folder is rejected without deleting files or cloning',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-unsafe-nongit-'));
 try{
  fs.writeFileSync(path.join(tmp,'important.txt'),'preserve');
  let cloneCalls=0,apiCalls=0;
  const runner=async(bin,args)=>{
   if(args[0]==='--version')return 'git version 2.0.0';
   if(args[0]==='rev-parse')throw Error('git rev-parse failed: fatal: not a git repository (or any of the parent directories): .git');
   if(args[0]==='clone')cloneCalls++;
   throw Error('Unexpected Git command: '+args.join(' '));
  };
  await assert.rejects(repoSync.sync({sourceUrl:'https://github.com/Acme/repo-a',destinationUrl:'https://github.com/Acme/repo-b',
   destinationFolder:tmp,sourcePat:srcPat,destPat:dstPat,runner,githubApi:{getRepository:async()=>{apiCalls++;}}}),/not a Git repository and is not empty/);
  assert.equal(cloneCalls,0);assert.equal(apiCalls,0);
  assert.equal(fs.readFileSync(path.join(tmp,'important.txt'),'utf8'),'preserve');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
