'use strict';const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),handoff=require('../src/git-handoff-coordinator');
const run=promisify(execFile),cmd=async(cwd,...args)=>(await run('git',args,{cwd})).stdout.trim();
test('stack alias pins SHA; UI/UX branch is idempotent; developer verifies matching handoff',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-git-handoff-'));try{
  const bare=path.join(folder,'remote.git'),repo=path.join(folder,'repo');await fs.mkdir(bare);await cmd(bare,'init','--bare','-q');await fs.mkdir(repo);await cmd(repo,'init','-q');await cmd(repo,'config','user.email','test@example.org');await cmd(repo,'config','user.name','Test');
  await fs.writeFile(path.join(repo,'README.md'),'React template\n');await cmd(repo,'add','.');await cmd(repo,'commit','-qm','bootstrap');await cmd(repo,'branch','-M','main');await cmd(repo,'remote','add','origin',bare);await cmd(repo,'push','-q','-u','origin','main');const sha=await cmd(repo,'rev-parse','HEAD');
  const approved=await handoff.publishApprovedStack({root:repo,stackId:'react',generation:1,sha});assert.equal(approved.sha,sha);assert.equal(approved.remoteVerified,true);assert.equal((await handoff.publishApprovedStack({root:repo,stackId:'react',generation:1,sha})).reused,true);
  const opts={root:repo,storyKey:'TC-100',designKey:'TC-101',designRevision:1,approvedStackSha:sha,files:{'src/atgv-design/tc-100/Screens.tsx':'export const Screen = () => null;\n'},validate:async()=>({passed:true})};
  const first=await handoff.publishDesign(opts);assert.equal(first.reused,false);assert.ok(first.remoteSha);assert.equal(await cmd(repo,'branch','--show-current'),'main','shared checkout must not switch');
  const second=await handoff.publishDesign(opts);assert.equal(second.reused,true);assert.equal(second.remoteSha,first.remoteSha);
  const ready=await handoff.verifyDeveloperHandoff({root:repo,storyKey:'TC-100',designKey:'TC-101',designRevision:1,approvedStackSha:sha});assert.equal(ready.verified,true);
  await assert.rejects(handoff.publishDesign({...opts,designRevision:2}),/different design/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('refuses remote stack SHA drift without overwriting it',async()=>assert.rejects(handoff.publishApprovedStack({root:'/tmp',stackId:'react',sha:'abc'}),/complete approved/));
