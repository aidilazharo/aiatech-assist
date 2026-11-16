'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const sync=require('../src/repo-sync-pr');
const workspace=require('../src/repo-sync-workspace');
const pkg=require('../package.json');
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
test('ATGV: Workspace command launches its own webview and has a controlled CSP',()=>{
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
 assert.ok(pkg.activationEvents.includes('onCommand:atgvAssist.workspace'));
 assert.ok(pkg.contributes.commands.some(x=>x.command==='atgvAssist.workspace'&&x.title==='ATGV: Workspace'));
 const content=workspace.workspaceHtml({nonce:'safe-abc',version:'0.3.74',cspSource:'vscode-resource:'});
 assert.match(content,/<h1>ATGV: Workspace<\/h1>/);
 assert.match(content,/nonce-safe-abc/);
 assert.match(content,/Sync Repo A → Repo B · Push & Create PR/);
 assert.match(content,/id="selectRepoB"/);
 assert.match(content,/id="baseBranch"/);
 assert.match(content,/id="sourceBranch"/);
 assert.match(content,/id="destinationRepo"/);
 assert.match(content,/form-action 'none'; connect-src 'none'/);
 assert.doesNotMatch(content,/https:\/\/github\.com\/[^\s"'<>]+\/pull\/\d+/);
 const code=content.match(/<script nonce="safe-abc">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code);
 assert.doesNotThrow(()=>new Function(code));
});
test('GitHub repo URLs, base branches, copy scopes and exclusions are validated',()=>{
 assert.equal(sync.githubUrl('https://github.com/Acme/repo-a.git').name,'Acme/repo-a');
 assert.equal(sync.githubUrl('git@github.com:Acme/repo-b.git',{origin:true}).name,'Acme/repo-b');
 assert.throws(()=>sync.githubUrl('https://evil.example/Acme/repo'),/GitHub repository URL/);
 assert.throws(()=>sync.githubUrl('https://github.com/Acme/repo/other'),/GitHub repository URL/);
 assert.equal(sync.scopeName('src\\components'),'src/components');
 assert.equal(sync.scopeName('.'),'.');
 for(const invalid of ['../escape','C:\\Windows','/etc','.git','node_modules','.github/workflows','.env','src/../../etc'])
  assert.throws(()=>sync.scopeName(invalid));
 for(const file of ['.github/workflows/release.yml','.git/config','.env','.env.production','src/private.pem','node_modules/package.json'])
  assert.equal(sync.isAllowedPath(file),false,file);
 for(const file of ['src/index.js','README.md','docs/guide.md'])assert.equal(sync.isAllowedPath(file),true,file);
});
test('PR title, commit and metadata identify the immutable Repo A main commit',()=>{
 const sha='a'.repeat(40),branch=sync.branchName('repo-a',sha,new Date('2026-11-16T13:10:20.000Z'),'abcdef');
 assert.match(branch,/^sync\/repo-a-main-aaaaaaaaaa-20261116t131020-abcdef$/);
 const details=sync.prDetails({source:{name:'Org/repo-a'},destination:{name:'Org/repo-b'},sha,scope:'src',base:'main',branch,count:1,changedFiles:['src/main.js']});
 for(const text of [sha,'Org/repo-a','Org/repo-b','PR base: main','Files changed: 1','src/main.js'])
  assert.ok(details.body.includes(text),text);
 assert.match(details.title,/main @ aaaaaaaaaa/);
 assert.match(details.commit,/main \(aaaaaaaaaa\)/);
});
test('ATGV Workspace handles separate panel, local folder selection, review and open PR',async()=>{
 const messages=[];let handler,disposed,revealed=0,opened='',created=0;
 const memory=new Map();const secrets={get:async key=>memory.get(key),store:async(key,val)=>memory.set(key,val)};
 const panel={reveal:()=>revealed++,onDidDispose:fn=>{disposed=fn;},webview:{cspSource:'vscode-resource:',html:'',onDidReceiveMessage:fn=>{handler=fn;},postMessage:async data=>messages.push(data)}};
 const fake={
  ViewColumn:{One:1},Uri:{parse:value=>value},
  env:{openExternal:async url=>{opened=url;}},
  window:{createWebviewPanel:(kind,title)=>{assert.equal(kind,'atgvAssist.workspace');assert.equal(title,'ATGV: Workspace');created++;return panel;},
   showOpenDialog:async()=>[{fsPath:'/chosen/repo-b'}],showWarningMessage:async()=> 'Create Sync PR',showInputBox:async()=> 'ghp_'+'x'.repeat(40)}
 };
 const original=sync.sync;
 try{
  sync.sync=async args=>{assert.equal(args.destinationFolder,'/chosen/repo-b');assert.equal(args.copyScope,'src');assert.equal(args.sourceBranch,'main');assert.ok(args.sourcePat.startsWith('ghp_'));assert.ok(args.destPat.startsWith('ghp_'));return {prUrl:'https://github.com/Acme/repo-b/pull/12',sourceRepo:'Acme/repo-a',sourceSha:'b'.repeat(40),destinationRepo:'Acme/repo-b',base:'main',branch:'sync/test',fileCount:1};};
  const first=workspace.open(fake,{version:pkg.version,secrets,workspaceRoot:'/another/atgv',testConnection:async(repo,pat,kind)=>({repo:repo.name,permission:kind==='Source'?'pull':'push'})});
  assert.equal(first,panel);
  assert.equal(workspace.open(fake),panel);
  assert.equal(revealed,1);assert.equal(created,1);
  await handler({command:'selectRepoB'});
  assert.ok(messages.some(m=>m.type==='repoBSelected'&&m.folder==='/chosen/repo-b'));
  await handler({command:'createSyncPr',sourceUrl:'https://github.com/Acme/repo-a',destinationUrl:'https://github.com/Acme/repo-b',copyScope:'src'});
  assert.ok(messages.some(m=>m.type==='repoSyncResult'&&m.success&&m.prUrl.endsWith('/12')));
  await handler({command:'openCreatedPr'});
  assert.equal(opened,'https://github.com/Acme/repo-b/pull/12');
 }finally{sync.sync=original;disposed?.();}
});
test('sync copies real tracked files, skips release workflows and creates a review branch without modifying main',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git is unavailable');return;}
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-workspace-test-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const source=path.join(temp,'source'),sourceBare=path.join(temp,'source-bare.git');
 const target=path.join(temp,'target'),targetBare=path.join(temp,'target-bare.git');
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(target,{recursive:true});
 git(['init','-b','main'],source);
 git(['config','user.name','ATGV Test'],source);git(['config','user.email','atgv@example.invalid'],source);
 fs.mkdirSync(path.join(source,'src'),{recursive:true});
 fs.mkdirSync(path.join(source,'.github','workflows'),{recursive:true});
 fs.writeFileSync(path.join(source,'src','main.js'),'module.exports=42;\n');
 fs.writeFileSync(path.join(source,'README.md'),'Repo A readme\n');
 fs.writeFileSync(path.join(source,'.env'),'DO_NOT_COPY=secret\n');
 fs.writeFileSync(path.join(source,'.github','workflows','release.yml'),'source workflow\n');
 git(['add','--all'],source);git(['commit','-m','Initial Repo A'],source);
 const sourceSha=git(['rev-parse','HEAD'],source);
 git(['init','--bare','-b','main',sourceBare],temp);
 git(['remote','add','origin',sourceBare],source);git(['push','-u','origin','main'],source);
 git(['init','--bare','-b','main',targetBare],temp);
 git(['init','-b','main'],target);
 git(['config','user.name','ATGV Test'],target);git(['config','user.email','atgv@example.invalid'],target);
 fs.writeFileSync(path.join(target,'existing.txt'),'destination-only\n');
 fs.mkdirSync(path.join(target,'.github','workflows'),{recursive:true});
 fs.writeFileSync(path.join(target,'.github','workflows','release.yml'),'Repo B release workflow\n');
 git(['add','--all'],target);git(['commit','-m','Initial Repo B'],target);
 const originalTargetSha=git(['rev-parse','HEAD'],target);
 git(['remote','add','origin',targetBare],target);git(['push','-u','origin','main'],target);
 let prBody='',prOptions={};
 const githubApi={
  getRepository:async()=>({nameWithOwner:'Acme/repo-b',defaultBranch:'main'}),
  findOpenPr:async()=>'', 
  createPr:async(repo,token,options)=>{
   assert.equal(repo.name,'Acme/repo-b');
   assert.equal(token,'ghp_'+'d'.repeat(40));
   prOptions=options;prBody=options.body;
   return 'https://github.com/Acme/repo-b/pull/17';
  }
 };
 const runner=async(bin,args,{cwd}={})=>{
  if(bin==='gh')throw Error('GitHub CLI must not be invoked by Repo Sync.');
  if(bin==='git'&&args[0]==='clone'){
   git(['clone','--quiet','--branch','main',source,args[args.length-1]],temp);return '';
  }
  if(bin==='git'&&args[0]==='remote'&&args[1]==='get-url')return 'https://github.com/Acme/repo-b.git';
  return git(args,cwd||temp);
 };
 const result=await sync.sync({sourceUrl:'https://github.com/Acme/repo-a',destinationUrl:'https://github.com/Acme/repo-b',destinationFolder:target,sourcePat:'ghp_'+'s'.repeat(40),destPat:'ghp_'+'d'.repeat(40),runner,githubApi});
 assert.equal(result.prUrl,'https://github.com/Acme/repo-b/pull/17');
 await assert.rejects(()=>sync.sync({sourceUrl:'https://github.com/Acme/repo-a',destinationUrl:'https://github.com/Acme/wrong',destinationFolder:target,sourcePat:'ghp_'+'s'.repeat(40),destPat:'ghp_'+'d'.repeat(40),runner,githubApi}),/Repo B URL differs/);
 assert.equal(result.sourceSha,sourceSha);
 assert.equal(result.base,'main');
 assert.equal(result.fileCount,2);
 assert.match(result.branch,/^sync\/repo-a\/main$/);
 assert.equal(git(['rev-parse','refs/remotes/origin/main'],target),originalTargetSha);
 assert.equal(fs.readFileSync(path.join(target,'src','main.js'),'utf8'),'module.exports=42;\n');
 assert.equal(fs.readFileSync(path.join(target,'existing.txt'),'utf8'),'destination-only\n');
 assert.equal(fs.readFileSync(path.join(target,'.github','workflows','release.yml'),'utf8'),'Repo B release workflow\n');
 assert.equal(fs.existsSync(path.join(target,'.env')),false);
 assert.equal(prOptions.base,'main');assert.equal(prOptions.branch,result.branch);
 for(const field of [sourceSha,'Acme/repo-a','Acme/repo-b','src/main.js','README.md','Files changed: 2'])
  assert.ok(prBody.includes(field),field);
});

test('Repo Sync protects PATs in subprocess environment variables',async()=>{
 assert.throws(()=>sync.patEnvironment('short'),/Personal Access Token/);
 assert.throws(()=>sync.patEnvironment('x'.repeat(30)+String.fromCharCode(10)),/Personal Access Token/);
 const env=sync.patEnvironment('ghp_'+'s'.repeat(40));
 assert.ok(env.GIT_CONFIG_VALUE_0.startsWith('AUTHORIZATION: basic '));
 assert.equal('GH_TOKEN' in env,false);
 assert.equal('GITHUB_TOKEN' in env,false);
 assert.equal('ghp_'+'s'.repeat(40) in env,false);
});
