'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const policy=require('../src/npm-policy-recovery'),helper=require('../src/stack-dependency-helper');
const denial=v=>'npm error code E403\nnpm error 403 403 Forbidden - GET https://registry.npmjs.org/demo/-/demo-'+v+'.tgz';
test('recognizes package-specific tarball rejection, not generic auth or package prohibition',()=>{
 assert.deepEqual(policy.parse403(denial('1.2.3')),{package:'demo',version:'1.2.3',url:'https://registry.npmjs.org/demo/-/demo-1.2.3.tgz'});
 assert.equal(policy.parse403(denial('1.2.3')+'\npackage is prohibited'),null);
 assert.equal(policy.parse403('E403 authentication required'),null);
 assert.equal(policy.parse403('E403 403 Forbidden - GET https://registry.npmjs.org/@a/pkg/-/pkg-1.2.3.tgz').package,'@a/pkg');
});
test('approved same-module retry remembers verified versions across locked projects; no unapproved or major version',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-policy-recovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const historyFile=path.join(root,'history.json');
 await fs.writeFile(path.join(root,'npm-version-policy.json'),JSON.stringify({policyId:'test-approval',registry:'https://registry.npmjs.org/',expiresAt:new Date(Date.now()+86400000).toISOString(),packages:{demo:['1.2.2','1.2.1','1.3.0','2.0.0']}}));
 async function project(name){
  const cwd=path.join(root,name);await fs.mkdir(cwd);await fs.writeFile(path.join(cwd,'package.json'),JSON.stringify({dependencies:{demo:'^1.2.0'}}));
  await fs.writeFile(path.join(cwd,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{'node_modules/demo':{version:'1.2.3'}}}));return cwd;
 }
 const first=await project('first'),second=await project('second'),attempts=[];
 const runner=async(bin,args,{cwd})=>{
  // npmCommand may prepend npm-cli.js on Windows.
  const a=args[0]?.endsWith('npm-cli.js')?args.slice(1):args;
  if(a[0]==='config')return {stdout:'https://registry.npmjs.org/'};
  if(a[0]==='--version')return {stdout:'10.9.0'};
  if(a[0]==='view')return {stdout:JSON.stringify(['1.2.1','1.2.2','1.2.3','1.2.4','1.3.0','2.0.0'])};
  if(a[0]==='ci'){attempts.push('ci');throw Object.assign(Error('npm failed'),{code:1,stderr:denial('1.2.3')});}
  if(a[0]==='install'){
   const version=a.find(x=>x.startsWith('demo@'))?.split('@')[1];attempts.push(version);
   if(version==='1.2.2')throw Object.assign(Error('npm failed'),{code:1,stderr:denial(version)});
   assert.equal(version,'1.2.1');await fs.mkdir(path.join(cwd,'node_modules','demo'),{recursive:true});await fs.writeFile(path.join(cwd,'node_modules','demo','package.json'),JSON.stringify({name:'demo',version}));return {stdout:'ok'};
  }
  if(a[0]==='ls')return {stdout:'{}'};
  throw Error('Unexpected npm command '+a.join(' '));
 };
 for(const cwd of [first,second])assert.equal((await helper.ensureForTarget(cwd,{kind:'npm',relative:''},{runner,historyFile})).verified,true);
 assert.deepEqual(attempts,['ci','1.2.2','1.2.1','1.2.1']);
 assert.equal(JSON.parse(await fs.readFile(path.join(second,'package-lock.json'),'utf8')).packages['node_modules/demo'].version,'1.2.3');
});
test('403 without a current approved policy stops without testing alternatives',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-policy-denial-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{demo:'^1.0.0'}}));let attempts=0;
 const runner=async()=>{attempts++;throw Object.assign(Error('npm failed'),{code:1,stderr:denial('1.2.3')});};
 await assert.rejects(()=>helper.installNpmWithCacheRecovery({cwd:root,runner,historyFile:path.join(root,'history.json')},async()=>{}),/failed/);assert.equal(attempts,1);
});
