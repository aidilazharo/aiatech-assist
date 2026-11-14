'use strict';
// Remove only ATGV-generated, isolated local worktrees belonging to a single BR.
// The approved checkout, Jira issue, remote branches and approved BR are never deleted here.
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const git=promisify(execFile);
const segment=/^BR-[0-9]{1,6}$/;
async function gitCommand(repo,...args){const r=await git('git',['-C',repo,...args],{timeout:45000,maxBuffer:1024*1024,windowsHide:true});return r.stdout.trim();}
function candidateName(name,brId){return new RegExp('^br-'+brId.toLowerCase()+'-[a-zA-Z0-9_-]{4,}$').test(name);}
function parseWorktreeList(text){
 return String(text||'').split(/\n\s*\n/).map(block=>{
  const lines=block.split('\n');return {
   dir:(lines.find(l=>l.startsWith('worktree '))||'').slice(9),
   branch:(lines.find(l=>l.startsWith('branch refs/heads/'))||'').slice(18)
  };
 }).filter(x=>x.dir);
}
async function removeLocalDevelopment({repoRoot,baseDirectory,brId,projectId,storageRoot}){
 if(!segment.test(String(brId||''))||!/^[\w.-]{1,100}$/.test(String(projectId||'')))throw Error('Invalid scoped BR cleanup target.');
 const removed=[];
 const parent=await fs.realpath(baseDirectory).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(parent){
  const expected=path.resolve(storageRoot,'developer-br-worktrees',projectId);
  if(parent!==expected)throw Error('Refusing to delete outside the project-specific generated worktree directory.');
  const registered=parseWorktreeList(await gitCommand(repoRoot,'worktree','list','--porcelain'));
  const entries=await fs.readdir(parent,{withFileTypes:true});
  for(const entry of entries){
   if(!entry.isDirectory()||entry.isSymbolicLink()||!candidateName(entry.name,brId))continue;
   const directory=path.join(parent,entry.name),real=await fs.realpath(directory);
   if(path.dirname(real)!==parent)throw Error('Generated worktree escaped its allowed directory.');
   const listed=registered.find(r=>path.resolve(r.dir)===real);
   if(!listed||!new RegExp('^feature/'+brId.toLowerCase()+'-ai-[a-f0-9]{8}$').test(listed.branch))throw Error('Refusing to remove a BR directory not registered as an ATGV-generated Git worktree.');
   await gitCommand(repoRoot,'worktree','remove','--force',real);
   await fs.rm(real,{recursive:true,force:true});
   await gitCommand(repoRoot,'branch','-D',listed.branch);
   removed.push(entry.name);
  }
 }
 const evidence=path.join(storageRoot,'developer-tdd-evidence',String(projectId).replace(/[^a-zA-Z0-9_-]/g,'_'),brId+'.json');
 await fs.rm(evidence,{force:true});
 return {deletedWorktrees:removed.length,removed,evidenceRemoved:true};
}
module.exports={candidateName,parseWorktreeList,removeLocalDevelopment};
