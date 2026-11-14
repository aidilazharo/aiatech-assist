'use strict';
// Detached, revision-pinned preview checkout for the Solution Architect.
// Never switches or cleans the Developer's working tree.
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const git=async (root,...args)=>(await exec('git',args,{cwd:root,windowsHide:true,timeout:30000,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}})).stdout.trim();
function previewLocation(root,sha){
 const id=crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0,12);
 return path.join(path.dirname(path.resolve(root)),'.atgv-architect-previews',id,sha);
}
async function prepare({root,branch,sha}={}){
 if(!root||!branch)throw Error('Approved stack branch is missing. Save and approve a technology stack first.');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)||branch.includes('..')||branch.includes('//')||branch.endsWith('.lock'))throw Error('Invalid approved stack branch.');
 const actual=path.resolve(await git(root,'rev-parse','--show-toplevel'));
 if(actual!==path.resolve(root))throw Error('The selected Git checkout does not match the saved stack repository.');
 const commit=await git(root,'rev-parse','--verify','refs/heads/'+branch+'^{commit}');
 if(sha&&commit!==sha)throw Error('Approved stack branch moved since validation. Verify the stack revision before running its server.');
 const target=previewLocation(root,commit);
 const existing=await fs.stat(target).then(s=>s.isDirectory(),e=>{if(e.code==='ENOENT')return false;throw e;});
 if(existing){
  const top=path.resolve(await git(target,'rev-parse','--show-toplevel').catch(()=>''));
  const head=await git(target,'rev-parse','HEAD').catch(()=>'');
  if(top!==target||head!==commit)throw Error('A preview checkout exists but does not match the approved revision. Inspect it manually; ATGV will not overwrite it.');
  // Runtime artifacts (node_modules etc.) are ignored, but tracked files must stay unchanged.
  const changes=await git(target,'status','--porcelain','--untracked-files=normal');
  if(changes)throw Error('The preview worktree has local changes. Review them before starting the approved server.');
 }else{
  await fs.mkdir(path.dirname(target),{recursive:true});
  await git(root,'worktree','add','--detach',target,commit);
 }
 return {root:target,sha:commit,branch,isolated:true};
}
module.exports={prepare,previewLocation};
