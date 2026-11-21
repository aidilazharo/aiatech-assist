'use strict';
// Read-only scan is required before this safe, explicit fast-forward pull.
// No reset, rebase, forced update, stash, commit or push is permitted.
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const developer=require('./developer-git');
const exec=promisify(execFile);
async function executeGit(root,...args){
 const {stdout}=await exec('git',['-C',root,...args],{
  timeout:120000,maxBuffer:2*1024*1024,windowsHide:true,
  env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}
 });
 return String(stdout||'').trim();
}
async function pull(root,{expectedSha,owner,name,driver=developer,run=executeGit}={}){
 const before=await driver.repository(root);
 if(!driver.matchesGithubRepo(before.remote,owner,name))
  throw Error('Origin does not match the GitHub project repository configured in Settings.');
 if(!/^[a-f0-9]{40}$/i.test(String(expectedSha||''))||before.sha!==expectedSha)
  throw Error('Repository revision changed after Scan Repository. Scan again before pulling.');
 if(!before.branch||!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,110}$/.test(before.branch)||
    before.branch.includes('..')||before.branch.includes('//')||before.branch.endsWith('/'))
  throw Error('Pull Repository requires a valid checked-out branch (detached HEAD is not supported).');
 if(!before.clean)throw Error('Local repository contains uncommitted changes. Commit or stash them manually before pulling; no files were overwritten.');
 if(driver.localLogs()?.running)
  throw Error('Stop the ATGV-managed application before pulling new repository code.');
 const ref='refs/remotes/origin/'+before.branch;
 await run(before.root,'fetch','--no-tags','origin','refs/heads/'+before.branch+':'+ref);
 const unchanged=await driver.repository(before.root);
 if(!unchanged.clean||unchanged.sha!==before.sha||unchanged.branch!==before.branch||
    !driver.matchesGithubRepo(unchanged.remote,owner,name))
  throw Error('Local worktree, branch or origin changed during the fetch. No merge was attempted.');
 const remoteSha=await run(before.root,'rev-parse','--verify',ref);
 if(!/^[a-f0-9]{40}$/i.test(String(remoteSha||'')))
  throw Error('Cannot verify the fetched origin branch revision. No merge was attempted.');
 if(remoteSha===before.sha)return {updated:false,branch:before.branch,sha:before.sha,
  message:'Repository is already up to date with origin/'+before.branch+'.'};
 try{await run(before.root,'merge-base','--is-ancestor',before.sha,remoteSha);}
 catch{throw Error('Local and remote branches have diverged or origin was force-pushed. Fast-forward pull is blocked; review Git history manually.');}
 await run(before.root,'merge','--ff-only',ref);
 const after=await driver.repository(before.root);
 if(after.sha!==remoteSha||after.branch!==before.branch||!after.clean)
  throw Error('Fast-forward completed but repository verification failed. Inspect the checkout before continuing.');
 return {updated:true,branch:after.branch,sha:after.sha,
  message:'Pulled latest origin/'+after.branch+' ('+before.sha.slice(0,12)+' → '+after.sha.slice(0,12)+'). Application targets re-scanned.'};
}
module.exports={executeGit,pull};
