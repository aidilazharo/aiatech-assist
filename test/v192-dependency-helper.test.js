'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const helper=require('../src/stack-dependency-helper');
const source=()=>fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const webview=()=>fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
async function fixture(body){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-deps-'));try{return await body(folder);}finally{await fs.rm(folder,{recursive:true,force:true});}}
async function manifest(folder,data){await fs.writeFile(path.join(folder,'package.json'),JSON.stringify(data));}
async function fakeNpm(folder,commands){return async(bin,args)=>{commands.push([bin,...args].join(' '));if(args[0]==='install'){
 const data=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));
 for(const name of Object.keys({...data.dependencies,...data.devDependencies})){
  const file=path.join(folder,'node_modules',name,'package.json');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify({name}));
 }
 }return {stdout:'ok',stderr:''};};}
test('Repairs missing Express even if node_modules already exists',async()=>fixture(async root=>{
 await manifest(root,{dependencies:{react:'^19',express:'^4.21.0'}});
 const existing=path.join(root,'node_modules/react/package.json');await fs.mkdir(path.dirname(existing),{recursive:true});await fs.writeFile(existing,'{"name":"react"}');
 const logs=[],commands=[];
 const result=await helper.ensureForTarget(root,{kind:'npm',relative:''},{runner:await fakeNpm(root,commands),onDiagnostic:line=>logs.push(line)});
 assert.equal(result.verified,true);
 assert.deepEqual(await helper.missingNpmPackages(root),[]);
 assert.equal(commands.some(c=>c.includes('install --ignore-scripts --include=optional --include=dev --no-audit --no-fund --package-lock=false')),true);
 assert.equal(commands.some(c=>c.includes('ls --depth=0 --json')),true);
 assert.ok(logs.some(c=>c.includes('npm install')));
}));
test('Does not reinstall a healthy npm dependency tree',async()=>fixture(async root=>{
 await manifest(root,{dependencies:{express:'^4.21.0'}});
 await fs.mkdir(path.join(root,'node_modules/express'),{recursive:true});await fs.writeFile(path.join(root,'node_modules/express/package.json'),'{}');
 const calls=[];await helper.ensureForTarget(root,{kind:'npm',relative:''},{runner:await fakeNpm(root,calls)});
 assert.equal(calls.some(c=>c.includes(' install ')),false);
 assert.equal(calls.some(c=>c.includes(' ls ')),true);
}));
test('A failed npm health check triggers repair, even with all modules present',async()=>fixture(async root=>{
 await manifest(root,{dependencies:{express:'^4.21.0'}});
 await fs.mkdir(path.join(root,'node_modules/express'),{recursive:true});await fs.writeFile(path.join(root,'node_modules/express/package.json'),'{}');
 const commands=[];let first=true;
 await helper.ensureForTarget(root,{kind:'npm',relative:''},{runner:async(bin,args,options)=>{
  commands.push(args[0]);if(args[0]==='ls'&&first){first=false;throw Object.assign(Error('invalid dependency tree'),{code:1,stderr:'missing peer dependencies'});}return {stdout:'ok',stderr:''};
 }});
 assert.deepEqual(commands,['ls','install','ls']);
}));
test('Uses native restore commands for dotnet and Maven without changing SDKs',async()=>fixture(async root=>{
 const commands=[];const runner=async(bin,args)=>{commands.push([bin,...args].join(' '));return {stdout:'ok',stderr:''};};
 await helper.ensureAll(root,[{kind:'dotnet',relative:''},{kind:'maven',relative:''}],{runner});
 assert.deepEqual(commands,['dotnet --version','dotnet restore','java -version','mvn --version','mvn -B -ntp dependency:go-offline']);
}));
test('Failed install keeps stdout/stderr/exit code in diagnostics',async()=>fixture(async root=>{
 await manifest(root,{dependencies:{express:'^4.21.0'}});
 let logs='';await assert.rejects(helper.ensureForTarget(root,{kind:'npm',relative:''},{runner:async()=>{throw Object.assign(Error('registry connection lost'),{code:17,stdout:'npm start',stderr:'E404 express'});},onDiagnostic:line=>{logs+=line;}}),err=>{
 assert.match(err.diagnosticLogs,/Exit code: 17/);assert.match(err.diagnosticLogs,/E404 express/);return true;
 });assert.match(logs,/registry connection lost/);
}));
test('Missing project SDK has actionable instructions and diagnostics',async()=>fixture(async root=>{
 await assert.rejects(helper.ensureForTarget(root,{kind:'dotnet',relative:''},{runner:async()=>{throw Object.assign(Error('not found'),{code:'ENOENT'});}}),/Install its official runtime\/SDK/);
}));
test('Prevents path traversal and arbitrary project commands',async()=>fixture(async root=>{
 await assert.rejects(helper.ensureForTarget(root,{kind:'npm',relative:'../elsewhere'}),/Unsupported application directory/);
 await assert.rejects(helper.ensureForTarget(root,{kind:'ruby',relative:''}),/Unsupported project dependency manager/);
}));
test('Solution Architect UI and handlers wire the dependency helper',async()=>{
 const [host,ui]=await Promise.all([source(),webview()]);
 assert.doesNotMatch(host,/id="architectInstallDependencies"/);
 assert.doesNotMatch(host,/case 'architectInstallDependencies'/);
 assert.match(host,/stack-dependency-helper/);
 assert.match(host,/case 'architectSaveStack'/);
 assert.doesNotMatch(ui,/architectInstallDependencies.*addEventListener/);
});

test('Installs immediately using a reusable private cache, avoiding root-owned default npm cache',async()=>fixture(async root=>{
 await manifest(root,{dependencies:{react:'^19.0.0',express:'^4.21.0'}});
 const commands=[],trace=[];
 const runner=async(bin,args,options)=>{
  commands.push({bin,args,options});
  if(args[0]==='install'){
   assert.equal(options.env.npm_config_cache,options.env.NPM_CONFIG_CACHE);
   assert.ok(options.env.npm_config_cache.includes('.atgv-aiatech-assist'));
   assert.equal(options.env.npm_config_cache.startsWith(root),false,'cache must not be in Git checkout');
   for(const name of ['react','express']){
    const file=path.join(root,'node_modules',name,'package.json');
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify({name}));
   }
  }
  return {stdout:'ok',stderr:''};
 };
 const result=await helper.ensureForTarget(root,{kind:'npm',relative:''},{runner,onProgress:p=>trace.push(p),onDiagnostic:d=>trace.push(d)});
 assert.equal(result.verified,true);
 assert.equal(commands.filter(c=>c.args[0]==='install').length,1);
 assert.ok(trace.some(c=>c.includes('shared ATGV npm cache')));
 assert.ok(!trace.some(c=>c.includes('Default npm cache is not writable')));
 assert.deepEqual(await helper.missingNpmPackages(root),[]);
}));

test('Does not retry unrelated filesystem permission errors with another cache',async()=>fixture(async root=>{
 await manifest(root,{dependencies:{express:'^4.21.0'}});
 let attempts=0;
 await assert.rejects(helper.ensureForTarget(root,{kind:'npm',relative:''},{runner:async()=>{
  attempts++;
  throw Object.assign(Error('node_modules write denied'),{code:1,stderr:'npm error code EACCES\nnpm error path ./node_modules/express'});
 }}),/npm install.*failed/);
 assert.equal(attempts,1);
}));

test('Private npm cache failure reports the actual installation error without retrying through a broken global cache',async()=>fixture(async root=>{
 await manifest(root,{dependencies:{express:'^4.21.0'}});
 const diagnostics=[];let attempts=0;
 await assert.rejects(helper.ensureForTarget(root,{kind:'npm',relative:''},{runner:async()=>{
  attempts++;
  throw Object.assign(Error('registry not reachable'),{code:2,stderr:'npm error code ENOTFOUND\nDNS lookup failed'});
 },onDiagnostic:x=>diagnostics.push(x)}),error=>{
  assert.match(error.diagnosticLogs,/ENOTFOUND/);
  assert.equal(attempts,1);
  return true;
 });
 assert.equal(diagnostics.length,1);
}));
