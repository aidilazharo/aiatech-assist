'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const workspace=require('../src/repo-sync-workspace');
const sync=require('../src/repo-sync-pr');
const api=require('../src/repo-sync-github-api');
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}).trim();

test('Workspace remembers selected folder between panels and rejects a missing folder',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-workspace-folder-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const prefs=new Map(),messages=[];let handler,dispose;
 const vscode={ViewColumn:{One:1},window:{
  createWebviewPanel:()=>({reveal(){},onDidDispose:fn=>{dispose=fn;},webview:{
   cspSource:'vscode-resource:',html:'',onDidReceiveMessage:fn=>{handler=fn;},
   postMessage:async message=>messages.push(message)
  }}),
  showOpenDialog:async()=>[{fsPath:dir}]
 }};
 const preferences={get:(key,fallback)=>prefs.get(key)??fallback,update:async(key,val)=>prefs.set(key,val)};
 const open=()=>workspace.open(vscode,{preferences});
 open();await handler({command:'selectRepoB'});
 assert.equal(prefs.get('atgvAssist.repoSync.lastDestinationFolder'),dir);
 dispose();messages.length=0;
 open();await handler({command:'getRepoSyncSaved'});
 assert.ok(messages.some(m=>m.type==='repoBSelected'&&m.folder===dir));
 dispose();messages.length=0;
 fs.rmSync(dir,{recursive:true,force:true});
 open();await handler({command:'getRepoSyncSaved'});
 assert.ok(messages.some(m=>m.type==='repoSyncFolderUnavailable'));
 dispose();
});

test('Source version falls back to VERSION for SDLC Library without package.json',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-library-version-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 fs.writeFileSync(path.join(folder,'VERSION'),'0.0.7\n');
 fs.writeFileSync(path.join(folder,'catalog.json'),'{}\n');
 const facts=await sync.readSourceFacts({
  cloned:folder,source:{name:'Acme/library'},chosenBranch:'main',
  sha:'a'.repeat(40),sourceMessage:'fix: library contents',
  files:['VERSION','catalog.json'],destination:{name:'Acme/target'},base:'main'
 });
 assert.equal(facts.project.version,'0.0.7');
});

test('GitHub latest release lookup excludes prereleases, filters unsafe files, and pins checksums',async()=>{
 const repo={owner:'Acme',repo:'source',name:'Acme/source'};
 const sha='a'.repeat(40),digest='sha256:'+'b'.repeat(64);
 const request=async(r,token,method,suffix)=>{assert.equal(suffix,'/releases?per_page=10');
  return {status:200,body:[{
   tag_name:'v1.2.3-build.8',name:'Source v1.2.3',draft:false,prerelease:false,
   target_commitish:sha,published_at:'2026-11-24T03:00:00Z',
   html_url:'https://github.com/Acme/source/releases/tag/v1.2.3-build.8',
   assets:[
    {id:1,name:'source.vsix',size:12,digest},
    {id:2,name:'source.zip',size:32,digest},
    {id:3,name:'../../escape.vsix',size:5,digest},
    {id:4,name:'evil.exe',size:10,digest}
   ]
  },{tag_name:'v1.2.3-build.9',draft:false,prerelease:true,published_at:'2026-11-25T03:00:00Z'}]};
 };
 const release=await api.getLatestRelease(repo,'ghp_'+'x'.repeat(40),request);
 assert.equal(release.tag,'v1.2.3-build.8');
 assert.deepEqual(release.assets.map(a=>a.name),['source.vsix','source.zip']);
 assert.equal(release.assets[0].digest,digest);
 assert.equal(release.skippedAssetCount,2);
 assert.throws(()=>api.safeReleaseComponent('../etc/passwd'),/Unsafe/);
});

test('Reviewed PR includes latest release binaries and source version in the same Git commit',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git unavailable');return;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-release-sync-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const a=path.join(root,'source'),b=path.join(root,'destination'),bare=path.join(root,'destination.git');
 fs.mkdirSync(a);fs.mkdirSync(b);
 git(['init','-b','main'],a);git(['config','user.name','ATGV Test'],a);git(['config','user.email','atgv@example.invalid'],a);
 fs.mkdirSync(path.join(a,'src'));fs.writeFileSync(path.join(a,'src','app.js'),'module.exports=123;\n');
 fs.writeFileSync(path.join(a,'package.json'),JSON.stringify({name:'sample-app',version:'1.2.3'}));
 git(['add','--all'],a);git(['commit','-m','feat: add sample application'],a);
 const srcSha=git(['rev-parse','HEAD'],a);
 git(['init','-b','main'],b);git(['config','user.name','ATGV Test'],b);git(['config','user.email','atgv@example.invalid'],b);
 fs.writeFileSync(path.join(b,'destination-only.txt'),'preserve\n');
 git(['add','--all'],b);git(['commit','-m','Initial destination'],b);
 git(['init','--bare','-b','main',bare],root);
 git(['remote','add','origin',bare],b);git(['push','origin','main'],b);
 const payload=Buffer.from('Test VSIX binary bytes');
 const digest='sha256:'+crypto.createHash('sha256').update(payload).digest('hex');
 const targetUrl='https://github.com/Acme/target.git';
 let release={
  tag:'v1.2.3',name:'Sample v1.2.3',url:'https://github.com/Acme/source/releases/tag/v1.2.3',
  targetCommitish:srcSha,publishedAt:'2026-11-24T05:00:00Z',
  assets:[{id:123,name:'sample.vsix',size:payload.length,digest}]
 };
 let downloaded=0,prBody='',prCount=0;
 const githubApi={
  getRepository:async()=>({nameWithOwner:'Acme/target',defaultBranch:'main'}),
  getLatestRelease:async()=>release,
  downloadReleaseAsset:async(r,token,asset,local)=>{
   downloaded++;fs.writeFileSync(local,payload,{flag:'wx'});
   return {name:asset.name,size:payload.length,digest,verified:true};
  },
  findOpenPr:async()=>'',createPr:async(r,token,details)=>{prCount++;prBody=details.body;return 'https://github.com/Acme/target/pull/50';}
 };
 const runner=async(bin,args,{cwd}={})=>{
  assert.equal(bin,'git');
  if(args[0]==='clone'){git(['clone','--quiet','--branch','main',a,args.at(-1)],root);return '';}
  if(args[0]==='remote'&&args[1]==='get-url')return targetUrl;
  if(args[0]==='ls-remote'&&args.includes(targetUrl))return git(args.map(x=>x===targetUrl?bare:x),cwd||root);
  return git(args,cwd||root);
 };
 const params={sourceUrl:'https://github.com/Acme/source',sourceBranch:'main',
  destinationUrl:'https://github.com/Acme/target',destinationFolder:b,
  sourcePat:'ghp_'+'a'.repeat(40),destPat:'ghp_'+'b'.repeat(40),
  copyScope:'src',githubApi,runner};
 const preview=await sync.sync({...params,previewOnly:true});
 assert.equal(preview.review.codeVersion,'1.2.3','source version is detected outside copy scope');
 assert.equal(preview.review.release.tag,'v1.2.3');
 assert.equal(downloaded,0,'Preview must not download or write artifacts');
 release={...release,tag:'v1.2.4'};
 await assert.rejects(()=>sync.sync({...params,approvedReview:preview.review}),/release or application version changed since review/);
 assert.equal(downloaded,0);
 release={...release,tag:'v1.2.3'};
 const result=await sync.sync({...params,approvedReview:preview.review});
 assert.equal(result.prUrl,'https://github.com/Acme/target/pull/50');
 assert.equal(prCount,1);assert.equal(downloaded,1);
 assert.equal(result.codeVersion,'1.2.3');assert.equal(result.releaseTag,'v1.2.3');
 assert.equal(fs.readFileSync(path.join(b,'release-artifacts','v1.2.3','sample.vsix')).toString(),payload.toString());
 const manifest=JSON.parse(fs.readFileSync(path.join(b,'release-artifacts','v1.2.3','release.json'),'utf8'));
 assert.equal(manifest.sourceCommit,srcSha);
 assert.equal(manifest.codeVersion,'1.2.3');
 assert.equal(manifest.matchesSourceCommit,true);
 assert.equal(manifest.assets[0].digest,digest);
 assert.match(prBody,/Release artifacts: v1\.2\.3/);
 const changed=git(['diff','--name-only','main','HEAD'],b).split('\n').sort();
 assert.deepEqual(changed,[
  'release-artifacts/v1.2.3/release.json','release-artifacts/v1.2.3/sample.vsix','src/app.js'
 ]);
});

for(const mode of ['older','missing','corrupt'])test('Official Workspace main sync with '+mode+' release',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-independent-release-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const a=path.join(root,'source'),b=path.join(root,'destination'),bare=path.join(root,'destination.git');
 for(const dir of [a,b]){fs.mkdirSync(dir);git(['init','-b','main'],dir);git(['config','user.name','ATGV Test'],dir);git(['config','user.email','atgv@example.invalid'],dir);}
 fs.writeFileSync(path.join(a,'package.json'),' {"version":"0.0.95"}\n');
 git(['add','--all'],a);git(['commit','-m','feat: newer source'],a);
 const sha=git(['rev-parse','HEAD'],a),older='a'.repeat(40);
 fs.writeFileSync(path.join(b,'keep.txt'),'destination');
 git(['add','--all'],b);git(['commit','-m','initial destination'],b);
 git(['init','--bare','-b','main',bare],root);git(['remote','add','origin',bare],b);git(['push','origin','main'],b);
 const source='aidilazharo/aiatech-assist',destination='aiamalaysia/my-fow-technology-app-techassists-dev-sdlc',targetUrl='https://github.com/'+destination+'.git';
 const tag='v0.0.94-build.1',bytes=new Map();
 for(const [name,checksum] of require('../src/repo-sync-release-publisher').required('extension','0.0.94')){
  const value=Buffer.from('binary '+name);bytes.set(name,value);
  bytes.set(checksum,Buffer.from((mode==='corrupt'?'0'.repeat(64):crypto.createHash('sha256').update(value).digest('hex'))+'  '+name+'\n'));
 }
 const assets=[...bytes].map(([name,data],i)=>({id:i+1,name,size:data.length,digest:'sha256:'+crypto.createHash('sha256').update(data).digest('hex')}));
 const release=mode==='missing'?null:{tag,name:tag,url:'https://github.com/'+source+'/releases/tag/'+tag,targetCommitish:older,publishedAt:'2026-11-24T00:00:00Z',assets,skippedAssetCount:0};
 const githubApi={getRepository:async()=>({nameWithOwner:destination,defaultBranch:'main'}),getLatestRelease:async()=>release,downloadReleaseAsset:async(r,token,asset,local)=>{fs.writeFileSync(local,bytes.get(asset.name),{flag:'wx'});return {...asset,verified:true};},findOpenPr:async()=>'',createPr:async()=> 'https://github.com/'+destination+'/pull/50'};
 const runner=async(bin,args,{cwd}={})=>{if(args[0]==='clone'){git(['clone','--quiet','--branch','main',a,args.at(-1)],root);return '';}if(args[0]==='remote'&&args[1]==='get-url')return targetUrl;if(args[0]==='ls-remote'&&args.includes(targetUrl))return git(args.map(x=>x===targetUrl?bare:x),cwd||root);return git(args,cwd||root);};
 const params={sourceUrl:'https://github.com/'+source,sourceBranch:'main',destinationUrl:'https://github.com/'+destination,destinationFolder:b,sourcePat:'ghp_'+'a'.repeat(40),destPat:'ghp_'+'b'.repeat(40),copyScope:'.',githubApi,runner};
 const preview=await sync.sync({...params,previewOnly:true});
 const result=await sync.sync({...params,approvedReview:preview.review});
 assert.equal(result.codeVersion,'0.0.95');assert.equal(result.sourceSha,sha);
 assert.equal(JSON.parse(fs.readFileSync(path.join(b,'package.json'))).version,'0.0.95');
 const manifest=path.join(b,'release-artifacts',tag,'release.json');
 if(mode==='older'){
  assert.equal(result.releaseTag,tag);const record=JSON.parse(fs.readFileSync(manifest));
  assert.equal(record.sourceCommit,sha);assert.equal(record.releaseTargetCommitish,older);assert.equal(record.releaseVersion,'0.0.94');assert.equal(record.matchesSourceCommit,false);
 }else{assert.equal(result.releaseTag,'');assert.ok(!fs.existsSync(manifest));assert.equal(result.releaseAssetCount,0);}
});
