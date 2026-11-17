'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const helper=require('../src/stack-dependency-helper'),recovery=require('../src/dependency-recovery');
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-dependency-recovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('recognizes only specific version errors and sorts stable versions newest first',()=>{
 assert.deepEqual(recovery.parseFailure('npm','npm error code ETARGET\nnpm error notarget No matching version found for @a/pkg@1.2.3.'),{package:'@a/pkg',version:'1.2.3'});
 assert.deepEqual(recovery.parseFailure('dotnet','error NU1102: Unable to find package Foo.Bar with version (>= 2.1.0)'),{package:'Foo.Bar',version:'2.1.0'});
 assert.deepEqual(recovery.parseFailure('maven','Could not find artifact com.example:thing:jar:3.2.1 in central'),{package:'com.example:thing',version:'3.2.1'});
 assert.equal(recovery.parseFailure('npm','ETARGET No matching version found for pkg@1.2.3: ECONNRESET'),null);
 assert.deepEqual(recovery.orderVersions(['1.0.1','1.3.0','2.0.0-rc.1','1.2.20','1.3.0']),['1.3.0','1.2.20','1.0.1']);
});

test('npm persists a version failure through stop and resumes with latest unfailed compatible version',async t=>{
 const root=temp(t),history=path.join(root,'history.json');fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{demo:'^1.0.0'}}));
 let attempts=0,stopped=false;const calls=[];
 const runner=async(bin,args)=>{
  calls.push(args.join(' '));
  if(args[0]==='view')return {stdout:JSON.stringify(['1.0.0','1.2.0','1.3.0']),stderr:''};
  if(args[0]==='install'&&!args.includes('--no-save')){attempts++;throw Object.assign(Error('npm failure'),{code:1,stderr:'npm ERR! code ETARGET\nnpm ERR! notarget No matching version found for demo@1.3.0.'});}
  if(args[0]==='install'&&args.includes('--no-save')){if(!stopped){stopped=true;throw Object.assign(Error('stopped'),{name:'AbortError',code:'ABORT_ERR'});}assert.ok(args.includes('demo@1.2.0'));fs.mkdirSync(path.join(root,'node_modules','demo'),{recursive:true});fs.writeFileSync(path.join(root,'node_modules','demo','package.json'),'{}');return {stdout:'installed',stderr:''};}
  return {stdout:'{}',stderr:''};
 };
 await assert.rejects(()=>helper.ensureForTarget(root,{kind:'npm',relative:''},{runner,historyFile:history}),/stopped/i);
 assert.equal((await recovery.failedVersions('npm','demo',{file:history})).has('1.3.0'),true);
 const result=await helper.ensureForTarget(root,{kind:'npm',relative:''},{runner,historyFile:history});
 assert.equal(result.verified,true);assert.equal(attempts,1,'bad version must not be attempted again on resume');
 assert.equal(calls.filter(x=>x.startsWith('install ')&&!x.includes('--no-save')).length,1);
 assert.ok(calls.some(x=>x.includes('demo@1.2.0')));assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).dependencies.demo,'^1.0.0');
});

test('npm recovery handles the direct packages used by React, Angular and NestJS',async t=>{
 const root=temp(t);
 for(const [stack,name] of [['react','vite'],['angular','@angular/core'],['nestjs','@nestjs/core']]){
  const cwd=path.join(root,stack),historyFile=path.join(root,stack+'-history.json');fs.mkdirSync(cwd);fs.writeFileSync(path.join(cwd,'package.json'),JSON.stringify({dependencies:{[name]:'^1.0.0'}}));
  const attempts=[];const runner=async(bin,args)=>{
   if(args[0]==='view')return {stdout:JSON.stringify(['1.1.0','1.2.0','1.3.0'])};
   if(args[0]==='install'){attempts.push(args);if(attempts.length===1)throw Object.assign(Error('npm failed'),{code:1,stderr:'ETARGET No matching version found for '+name+'@1.3.0.'});assert.ok(args.includes(name+'@1.2.0'));return {stdout:'ok'};}
   throw Error('Unexpected npm command');
  };
  await helper.installNpmWithCacheRecovery({cwd,runner,historyFile},async()=>{});
  assert.equal(attempts.length,2,stack);
 }
});

test('resume replaces a recorded failed version left in node_modules',async t=>{
 const root=temp(t),historyFile=path.join(root,'history.json'),moduleDir=path.join(root,'node_modules','demo');
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{demo:'^1.0.0'}}));fs.mkdirSync(moduleDir,{recursive:true});
 fs.writeFileSync(path.join(moduleDir,'package.json'),JSON.stringify({name:'demo',version:'1.3.0'}));
 await recovery.record({manager:'npm',package:'demo',version:'1.3.0',error:'ETARGET: not available',kind:'version'},{file:historyFile});
 const calls=[];const runner=async(bin,args)=>{
  calls.push(args);
  if(args[0]==='view')return {stdout:JSON.stringify(['1.2.0','1.3.0'])};
  if(args[0]==='install'){assert.ok(args.includes('demo@1.2.0'));fs.writeFileSync(path.join(moduleDir,'package.json'),JSON.stringify({name:'demo',version:'1.2.0'}));return {stdout:'installed'};}
  if(args[0]==='ls')return {stdout:'{}'};
  throw Error('Unexpected '+bin+' '+args.join(' '));
 };
 const result=await helper.ensureForTarget(root,{kind:'npm',relative:''},{runner,historyFile});
 assert.equal(result.installed,true);assert.equal(JSON.parse(fs.readFileSync(path.join(moduleDir,'package.json'))).version,'1.2.0');
 assert.equal(calls.filter(args=>args[0]==='install').length,1);
});

test('manifest changes stay within the original package and major version',()=>{
 const raw='<Project><PackageReference Include="Foo.Bar" Version="2.1.0" /></Project>';
 assert.throws(()=>recovery.rewriteManifest('dotnet',raw,'Foo.Bar','2.1.0','3.0.0'),/major version/);
 assert.throws(()=>recovery.rewriteManifest('dotnet',raw,'Other.Package','2.1.0','2.2.0'),/cannot be safely changed/);
 assert.throws(()=>recovery.rewriteManifest('dotnet',raw,'Foo.Bar','2.0.0','2.2.0'),/cannot be safely changed/);
});

test('Windows Maven invocation quotes fixed arguments and rejects shell metacharacters',()=>{
 const {mavenCommand}=require('../src/platform-process');
 const cmd=mavenCommand(['-B','-Dartifact=com.example:thing:[3,4)'],{platform:'win32',env:{ComSpec:'cmd.exe'}});
 assert.equal(cmd.bin,'cmd.exe');assert.match(cmd.args.at(-1),/"-Dartifact=com\.example:thing:\[3,4\)"/);
 assert.throws(()=>mavenCommand(['-Dartifact=example&whoami'],{platform:'win32'}),/Unsafe argument/);
});

test('NuGet retries a direct failed package at the latest unfailed same-major version',async t=>{
 const root=temp(t),history=path.join(root,'history.json'),file=path.join(root,'Api.csproj');
 fs.writeFileSync(file,'<Project><ItemGroup><PackageReference Include="Foo.Bar" Version="2.1.0" /></ItemGroup></Project>');
 fs.writeFileSync(path.join(root,'atgv.bootstrap.json'),JSON.stringify({schema:1,generatedFiles:['Api.csproj','atgv.bootstrap.json']}));
 let restores=0;const runner=async(bin,args)=>{
  if(args[0]==='--version')return {stdout:'10.0.0'};
  if(args[0]==='package')return {stdout:JSON.stringify({searchResult:[{packages:[{id:'Foo.Bar',versions:[{version:'2.3.0'},{version:'2.2.0'},{version:'2.1.0'},{version:'3.0.0'}]}]}]})};
  if(args[0]==='restore'){restores++;if(restores===1)throw Object.assign(Error('restore error'),{code:1,stderr:'error NU1102: Unable to find package Foo.Bar with version (>= 2.1.0)'});assert.match(fs.readFileSync(file,'utf8'),/Version="2.3.0"/);return {stdout:'restored'};}
  throw Error('Unexpected '+bin+' '+args.join(' '));
 };
 await helper.ensureForTarget(root,{kind:'dotnet',relative:''},{runner,historyFile:history,allowManifestRecovery:true});
 const meta=JSON.parse(fs.readFileSync(path.join(root,'atgv.bootstrap.json')));assert.deepEqual(meta.dependencyResolutions,[{path:'Api.csproj',manager:'dotnet',package:'Foo.Bar',from:'2.1.0',to:'2.3.0'}]);
 assert.equal((await recovery.failedVersions('dotnet','Foo.Bar',{file:history})).has('2.1.0'),true);
 const resumed=path.join(root,'resumed');fs.mkdirSync(resumed);fs.writeFileSync(path.join(resumed,'Api.csproj'),'<Project><PackageReference Include="Foo.Bar" Version="2.1.0" /></Project>');
 fs.writeFileSync(path.join(resumed,'atgv.bootstrap.json'),JSON.stringify({schema:1,generatedFiles:['Api.csproj','atgv.bootstrap.json']}));
 const resumeRunner=async(bin,args)=>{
  if(args[0]==='--version')return {stdout:'10.0.0'};
  if(args[0]==='package')return {stdout:JSON.stringify({searchResult:[{packages:[{id:'Foo.Bar',versions:[{version:'2.3.0'},{version:'2.1.0'}]}]}]})};
  if(args[0]==='restore'){assert.match(fs.readFileSync(path.join(resumed,'Api.csproj'),'utf8'),/Version="2.3.0"/);return {stdout:'restored'};}
  throw Error('Unexpected '+bin+' '+args.join(' '));
 };
 await helper.ensureForTarget(resumed,{kind:'dotnet',relative:''},{runner:resumeRunner,historyFile:history,allowManifestRecovery:true});
});

test('Maven retries a direct failed artifact using configured local metadata',async t=>{
 const root=temp(t),history=path.join(root,'history.json'),file=path.join(root,'pom.xml'),repo=path.join(root,'m2');
 fs.writeFileSync(file,'<project><dependencies><dependency><groupId>com.example</groupId><artifactId>thing</artifactId><version>3.2.0</version></dependency></dependencies></project>');
 fs.writeFileSync(path.join(root,'atgv.bootstrap.json'),JSON.stringify({schema:1,generatedFiles:['pom.xml','atgv.bootstrap.json']}));
 const metadata=path.join(repo,'com','example','thing');fs.mkdirSync(metadata,{recursive:true});fs.writeFileSync(path.join(metadata,'maven-metadata-central.xml'),'<metadata><versioning><versions><version>3.1.0</version><version>3.2.0</version><version>3.4.0</version><version>4.0.0</version></versions></versioning></metadata>');
 let restores=0;const runner=async(bin,args)=>{
  if(bin==='java'||args[0]==='--version')return {stdout:'ready'};
  if(args.includes('help:evaluate'))return {stdout:repo};
  if(args.some(x=>x.includes('maven-dependency-plugin')))return {stdout:'metadata fetched'};
  if(args.includes('dependency:go-offline')){restores++;if(restores===1)throw Object.assign(Error('maven failure'),{code:1,stderr:'Could not find artifact com.example:thing:jar:3.2.0 in central'});assert.match(fs.readFileSync(file,'utf8'),/<version>3.4.0<\/version>/);return {stdout:'restored'};}
  throw Error('Unexpected '+bin+' '+args.join(' '));
 };
 await helper.ensureForTarget(root,{kind:'maven',relative:''},{runner,historyFile:history,allowManifestRecovery:true});
 assert.equal((await recovery.failedVersions('maven','com.example:thing',{file:history})).has('3.2.0'),true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'atgv.bootstrap.json'))).dependencyResolutions[0].to,'3.4.0');
});

test('network failures are recorded without blacklisting a package version',async t=>{
 const root=temp(t),history=path.join(root,'history.json');fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{demo:'^1.0.0'}}));
 const runner=async()=>{throw Object.assign(Error('offline'),{code:1,stderr:'ETARGET No matching version found for demo@1.2.0: ECONNRESET'});};
 await assert.rejects(()=>helper.ensureForTarget(root,{kind:'npm',relative:''},{runner,historyFile:history}),/failed/);
 const data=await recovery.read(history);assert.equal(data.failures.length,1);assert.equal(data.failures[0].kind,'failure');assert.equal((await recovery.failedVersions('npm','demo',{file:history})).size,0);
});
