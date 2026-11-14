'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),handoff=require('../src/git-handoff-coordinator');
async function git(cwd,...args){return (await exec('git',args,{cwd,timeout:15000})).stdout.trim();}
test('GitHub cleanup only removes exact ATGV handoff commit; later Developer work is protected',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-git-delete-'));
 try{
  const origin=path.join(tmp,'origin.git'),repo=path.join(tmp,'source');
  await fs.mkdir(origin);await git(origin,'init','--bare');await fs.mkdir(repo);await git(repo,'init');
  await git(repo,'config','user.name','Test Person');await git(repo,'config','user.email','test@example.com');
  await git(repo,'remote','add','origin',origin);
  await fs.writeFile(path.join(repo,'README.md'),'base');await git(repo,'add','README.md');await git(repo,'commit','-m','stack');
  const baseSha=await git(repo,'rev-parse','HEAD');
  await git(repo,'switch','-c','feature/tc-392');
  const folder=path.join(repo,'src','atgv-design','tc-392');await fs.mkdir(folder,{recursive:true});
  const code='export const Design=()=>null';await fs.writeFile(path.join(folder,'Screens.tsx'),code);
  const manifest={schema:1,storyKey:'TC-392',designKey:'TC-413',designRevision:1,baseSha,sourceFiles:['src/atgv-design/tc-392/Screens.tsx']};
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest));
  await git(repo,'add','.');
  await git(repo,'-c','user.name=ATGV UI/UX Handoff','-c','user.email=atgv-local@users.noreply.github.com','commit','-m','Design handoff');
  await git(repo,'push','origin','feature/tc-392');
  const check=await handoff.inspectOwnedFeature({root:repo,storyKey:'TC-392',designKeys:['TC-413']});
  assert.equal(check.status,'eligible');
  await assert.rejects(handoff.deleteOwnedFeature({root:repo,storyKey:'TC-392',designKeys:['WRONG'],expectedSha:check.sha}),/changed since the deletion preview/);
  // Advance remote with independent Developer work: never delete it.
  await fs.writeFile(path.join(repo,'developer.js'),'doWork()');await git(repo,'add','developer.js');await git(repo,'commit','-m','developer work');await git(repo,'push','origin','feature/tc-392');
  const protectedBranch=await handoff.inspectOwnedFeature({root:repo,storyKey:'TC-392',designKeys:['TC-413']});
  assert.equal(protectedBranch.status,'protected');
  await assert.rejects(handoff.deleteOwnedFeature({root:repo,storyKey:'TC-392',designKeys:['TC-413'],expectedSha:check.sha}),/changed since the deletion preview/);
  const head=await handoff.remoteSha(repo,'feature/tc-392');assert.equal(head,await git(repo,'rev-parse','HEAD'));
  // A second, untouched ATGV handoff can be deleted with a remote SHA lease.
  await git(repo,'switch','-c','feature/tc-393',baseSha);
  const next=path.join(repo,'src','atgv-design','tc-393');await fs.mkdir(next,{recursive:true});
  await fs.writeFile(path.join(next,'Screens.tsx'),'export const Next=()=>null');
  await fs.writeFile(path.join(next,'manifest.json'),JSON.stringify({schema:1,storyKey:'TC-393',designKey:'TC-414',baseSha,sourceFiles:['src/atgv-design/tc-393/Screens.tsx']}));
  await git(repo,'add','.');await git(repo,'-c','user.name=ATGV UI/UX Handoff','-c','user.email=atgv-local@users.noreply.github.com','commit','-m','Design handoff');
  await git(repo,'push','origin','feature/tc-393');
  const owned=await handoff.inspectOwnedFeature({root:repo,storyKey:'TC-393',designKeys:['TC-414']});
  assert.equal(owned.status,'eligible');
  assert.equal((await handoff.deleteOwnedFeature({root:repo,storyKey:'TC-393',designKeys:['TC-414'],expectedSha:owned.sha})).status,'deleted');
  assert.equal(await handoff.remoteSha(repo,'feature/tc-393'),'');
  assert.equal((await handoff.remoteSha(repo,'feature/tc-392')),head);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
