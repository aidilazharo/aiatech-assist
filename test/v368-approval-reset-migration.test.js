'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const handoff=require('../src/git-handoff-coordinator');
const reset=require('../src/architect-stack-reset');
const server=require('../src/architect-server');
const preview=require('../src/architect-preview-worktree');
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function repoFixture(fn){
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v368-'));
 try{
  const root=path.join(tmp,'repo'),remote=path.join(tmp,'remote.git');
  await fs.mkdir(root);
  execFileSync('git',['init','--bare',remote],{stdio:'ignore'});
  execFileSync('git',['init','-b','main',root],{stdio:'ignore'});
  git(root,'config','user.name','ATGV Test');git(root,'config','user.email','test@example.invalid');
  await fs.writeFile(path.join(root,'README.md'),'main baseline\n');
  git(root,'add','.');git(root,'commit','-m','main');
  const main=git(root,'rev-parse','HEAD');
  git(root,'remote','add','origin',remote);git(root,'push','origin','main');
  await fn({tmp,root,remote,main});
 }finally{await fs.rm(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
test('approve reuses exact remote branch without force-push and preserves a different old approval',()=>repoFixture(async({root,remote,main})=>{
 await fs.writeFile(path.join(root,'app.txt'),'new committed stack\n');
 git(root,'add','app.txt');git(root,'commit','-m','new stack version');
 const sha=git(root,'rev-parse','HEAD');
 git(root,'push','origin',main+':refs/heads/tech-stack/react-v1');
 const approval=await handoff.publishApprovedStack({root,stackId:'react',generation:1,sha});
 assert.equal(approval.branch,'tech-stack/react-v1-'+sha.slice(0,12));
 assert.equal(approval.previousBranch,'tech-stack/react-v1');
 assert.equal(approval.renamed,true);assert.equal(approval.remoteVerified,true);
 assert.equal(git(remote,'rev-parse','refs/heads/tech-stack/react-v1'),main);
 assert.equal(git(remote,'rev-parse','refs/heads/'+approval.branch),sha);
 const repeat=await handoff.publishApprovedStack({root,stackId:'react',generation:1,sha});
 assert.equal(repeat.reused,true);assert.equal(repeat.branch,approval.branch);
 assert.equal(git(remote,'rev-parse','refs/heads/tech-stack/react-v1'),main);
}));
test('reset a valid pinned migration branch, preserve its history and return cleanly to main',()=>repoFixture(async({root,main})=>{
 const branch='migration/react-catalog-1-1-14-07bbe5e6';
 git(root,'switch','-c',branch);
 await fs.writeFile(path.join(root,'app.txt'),'React\n');
 git(root,'add','app.txt');git(root,'commit','-m','migrate catalog');
 const sha=git(root,'rev-parse','HEAD');git(root,'push','origin',branch);
 const project={techStackId:'react',techStackGeneration:0,techStackPrepared:{stackId:'react',branch,root,baseBranch:'main',sha,remotePushed:true}};
 const plan=await reset.plan({root,project,force:true,allowFeatureRecovery:true});
 assert.equal(plan.currentBranch,branch);
 const result=await reset.reset({root,project,expectedPlan:plan,force:true,allowFeatureRecovery:true});
 assert.equal(result.nextGeneration,1);
 assert.equal(git(root,'branch','--show-current'),'main');
 assert.equal(git(root,'rev-parse','HEAD'),main);
 assert.equal(git(root,'rev-parse','refs/heads/'+branch),sha);
}));
test('migration reset still rejects an invalid or changed branch and never modifies main',()=>repoFixture(async({root,main})=>{
 const branch='migration/react-catalog-1-1-14-07bbe5e6';
 git(root,'switch','-c',branch);
 await fs.writeFile(path.join(root,'app.txt'),'one\n');
 git(root,'add','.');git(root,'commit','-m','migrated');
 const sha=git(root,'rev-parse','HEAD');
 const base={techStackId:'react',techStackGeneration:0,techStackPrepared:{stackId:'react',branch,root,sha,remotePushed:true}};
 await assert.rejects(reset.plan({root,project:{...base,techStackPrepared:{...base.techStackPrepared,sha:'f'.repeat(40)}},force:true}),/recorded Git revision/);
 await assert.rejects(reset.plan({root,project:{...base,techStackPrepared:{...base.techStackPrepared,branch:'migration/angular-catalog-1-1-14-07bbe5e6'}},force:true}),/not a recognized ATGV/);
 await assert.rejects(reset.plan({root,project:{...base,techStackPrepared:{...base.techStackPrepared,remotePushed:false}},force:true}),/saved, pushed Git revision/);
 assert.equal(git(root,'rev-parse','main'),main);assert.equal(git(root,'rev-parse','HEAD'),sha);
}));
test('reset stops only tracked project frontend/API group, including a preview checkout',async()=>{
 const root=path.join(os.tmpdir(),'atgv-stop-managed-project');
 const current=preview.previewLocation(root,'a'.repeat(40));
 let calls=0,running=true;
 const driver={localLogs:()=>({running,cwd:current,pid:123}),stopLocal:async()=>{calls++;running=false;}};
 const result=await server.stopProjectManaged({root,driver});
 assert.equal(result.stopped,1);assert.equal(calls,1);assert.equal(running,false);
});
test('reset never stops another project and blocks reset if an owned process cannot terminate',async()=>{
 const root=path.join(os.tmpdir(),'atgv-stop-safe-project');
 let stops=0;
 const foreign={localLogs:()=>({running:true,cwd:path.join(os.tmpdir(),'another-project','app'),pid:234}),stopLocal:async()=>{stops++;}};
 const skipped=await server.stopProjectManaged({root,driver:foreign});
 assert.equal(skipped.stopped,0);assert.equal(skipped.otherProjectRunning,true);assert.equal(stops,0);
 const owned={localLogs:()=>({running:true,cwd:path.join(root,'server'),pid:345}),stopLocal:async()=>{stops++;}};
 await assert.rejects(server.stopProjectManaged({root,driver:owned}),/still running/);
 assert.equal(stops,1);
});
test('host reset and stack-switch stop managed servers before reset and never force-push',async()=>{
 const host=await fs.readFile(path.join(__dirname,'..','src/lib/runtime/extension-runtime.js'),'utf8');
 const resetBlock=host.slice(host.indexOf("case 'architectResetStack':{"),host.indexOf("case 'architectSaveStack':{"));
 assert.match(resetBlock,/stopProjectManaged\(\{root\}\)/);
 assert.ok(resetBlock.indexOf('planProjectStackArchive(')<resetBlock.indexOf('stopProjectManaged({root})'));
 assert.ok(resetBlock.indexOf('stopProjectManaged({root})')<resetBlock.indexOf('service.resetWithProjectArchive('));
 const switchBlock=host.slice(host.indexOf("case 'architectSaveStack':{"),host.indexOf("case 'architectTestStack':{"));
 assert.match(switchBlock,/stopProjectManaged\(\{root\}\)/);
 assert.ok(switchBlock.indexOf('planProjectStackArchive(')<switchBlock.indexOf('stopProjectManaged({root})'));
 assert.ok(switchBlock.indexOf('stopProjectManaged({root})')<switchBlock.indexOf('resetService.resetWithProjectArchive('));
 const gitCode=await fs.readFile(path.join(__dirname,'..','src/git-handoff-coordinator.js'),'utf8');
 assert.doesNotMatch(gitCode.slice(gitCode.indexOf('async function publishApprovedStack'),gitCode.indexOf('async function approvedBase')),/--force|force-with-lease/);
});
