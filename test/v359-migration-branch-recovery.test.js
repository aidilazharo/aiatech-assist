'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {normalizeProjectInput}=require('../src/projects');
const recovery=require('../src/architect-stack-branch-recovery');
const server=require('../src/architect-server');
const verification=require('../src/architect-server-verification');
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function fixture(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-migration-branch-'));
 try{
  git(dir,'init','-b','main');
  git(dir,'config','user.email','atgv@example.invalid');
  git(dir,'config','user.name','ATGV tests');
  await fs.writeFile(path.join(dir,'README.md'),'approved migration scaffold\n');
  git(dir,'add','README.md');
  git(dir,'commit','-m','catalog migration baseline');
  const sha=git(dir,'rev-parse','HEAD');
  const branch='migration/react-catalog-1-1-12-12345678';
  git(dir,'branch',branch);
  return await fn({dir,sha,branch});
 }finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
}
function project(dir,sha,branch){
 return {id:'test-migration-project',name:'Test Migration Project',techStackId:'react',techStackCompanionId:'',
  techStackPrepared:{stackId:'react',companionId:'',root:dir,branch,sha,remotePushed:true,previewUrl:'http://127.0.0.1:5173/'},
  techStackValidation:{status:'tested',stackId:'react',sha,companionId:''}};
}
test('registry preserves verified ATGV migration branch after Save Stack and later updates',()=>fixture(async({dir,sha,branch})=>{
 const saved=normalizeProjectInput(project(dir,sha,branch));
 assert.equal(saved.techStackPrepared.branch,branch);
 const updated=normalizeProjectInput({...saved,name:'Test Migration Project Renamed'},saved);
 assert.equal(updated.techStackPrepared.branch,branch);
 assert.equal(updated.techStackPrepared.sha,sha);
 assert.equal(updated.techStackValidation.sha,sha);
 const unsafe=normalizeProjectInput(project(dir,sha,'feature/unverified'));
 assert.equal(unsafe.techStackPrepared.branch,'');
}));
test('legacy saved migration with empty branch recovers exact local Git SHA without changing checkout',()=>fixture(async({dir,sha,branch})=>{
 const prior=git(dir,'branch','--show-current');
 const saved=normalizeProjectInput(project(dir,sha,''));
 const recovered=await recovery.recover({root:dir,project:saved});
 assert.equal(recovered.recovered,true);
 assert.equal(recovered.branch,branch);
 assert.equal(recovered.project.techStackPrepared.branch,branch);
 assert.equal(recovered.project.techStackValidation.sha,sha);
 assert.equal(git(dir,'branch','--show-current'),prior);
 assert.equal(git(dir,'status','--porcelain'),'');
 assert.equal(normalizeProjectInput(recovered.project,saved).techStackPrepared.branch,branch);
}));
test('branch recovery refuses ambiguous refs, mismatched SHAs and missing verification',()=>fixture(async({dir,sha,branch})=>{
 git(dir,'branch','bootstrap/react-initial');
 await assert.rejects(recovery.recover({root:dir,project:project(dir,sha,'')}),/Multiple ATGV stack branches/);
 git(dir,'branch','-D','bootstrap/react-initial');
 const other='e'.repeat(40);
 await assert.rejects(recovery.recover({root:dir,project:project(dir,other,'')}),/no matching local migration/);
 await assert.rejects(recovery.recover({root:dir,project:project(dir,'','')}),/verified Git revision are missing/);
 assert.equal(git(dir,'branch','--show-current'),'main');
 assert.equal(git(dir,'status','--porcelain'),'');
}));
test('isolated detached architect preview reports its approved logical branch only at exact SHA',async()=>{
 const root=path.join(os.tmpdir(),'atgv-detached-branch-test');
 const previewRoot=path.join(root,'preview'),sha='a'.repeat(40),branch='migration/react-catalog-1-1-12-12345678';
 let running=false,cwd='',launches=0,url='';
 const driver={
  catalogStackConfig:async()=>({previewUrl:'http://127.0.0.1:5173/'}),
  inspectScripts:async dir=>({repo:{root:dir,branch:dir===root?'feature/changed':'',clean:true,sha},
   targets:[{relative:'',kind:'npm',installed:true,scripts:['dev','test','build']}]}),
  localLogs:()=>({running,cwd,previewUrl:url,pid:running?7854:null}),
  runLocal:async(dir,options)=>{running=true;cwd=dir;url=options.previewUrl;launches++;},
  stopLocal:async()=>{running=false;},
 };
 const prepared={root,stackId:'react',branch,sha,remotePushed:true};
 const launch=await server.start({root,stackId:'react',prepared,driver,openBrowser:async()=>true,
  effects:{prepareWorktree:async()=>({root:previewRoot,branch,sha,isolated:true}),portAvailable:async()=>true,waitForHttp:async()=>{}}});
 assert.equal(launch.running,true);
 assert.equal(launch.branch,branch);
 assert.equal(launch.sha,sha);
 assert.equal(launches,1);
 const state=await server.verify({root,stackId:'react',driver,effects:{waitForHttp:async()=>{}}});
 assert.equal(state.healthy,true);
 assert.equal(state.branch,branch);
 const evidence=verification.evidenceIfHealthy({
  techStackId:'react',techStackCompanionId:'',techStackPrepared:prepared,
  techStackValidation:{status:'tested',stackId:'react',sha,companionId:''}},state);
 assert.ok(evidence);
 assert.equal(evidence.branch,branch);
 await server.stop({root,stackId:'react',driver});
});

test('Run Server and Test & Run recover the exact saved branch, not an inferred arbitrary branch',async()=>{
 const runtime=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const run=runtime.slice(runtime.indexOf("case 'architectRunServer':{"),runtime.indexOf("case 'architectStopServer':{"));
 const tests=runtime.slice(runtime.indexOf("case 'architectTestStack':{"),runtime.indexOf("case 'architectServerStatus':{"));
 assert.match(run,/architect-stack-branch-recovery/);
 assert.match(run,/registry\.update\(activeProject\.id,recovery\.project\)/);
 assert.match(tests,/architect-stack-branch-recovery/);
 assert.match(tests,/registry\.update\(activeProject\.id,recovered\.project\)/);
});
