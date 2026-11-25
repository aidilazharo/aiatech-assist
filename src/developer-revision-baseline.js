'use strict';
// Only checkpoint-verified source in isolated worktrees; no automatic push.
const pipeline=require('./developer-br-pipeline');
const tdd=require('./developer-tdd');
const path=require('node:path');
function choose(previous,approvedSha){
 if(!previous)return approvedSha;
 if(previous.approvalSha!==approvedSha)throw Error('Previous application uses a different approved stack. Review an explicit migration before continuing.');
 if(!/^[a-f0-9]{40}$/.test(String(previous.completedCommit||'')))throw Error('Previous completed application has no verified source commit. Recover its source before regenerating.');
 return previous.completedCommit;
}
async function chooseCurrent(root,previous,approvedSha,currentSha,{git=pipeline.runGit}={}){
 const prior=choose(previous,approvedSha);
 if(!/^[a-f0-9]{40}$/i.test(String(currentSha||'')))throw Error('Project repository requires a valid current commit.');
 const ancestor=async(a,b)=>{try{await git(root,'merge-base','--is-ancestor',a,b);return true;}catch{return false;}};
 if(await ancestor(prior,currentSha)&&await ancestor(approvedSha,currentSha))return currentSha;
 if(await ancestor(currentSha,prior))return prior;
 throw Error('Current project source and approved development baseline have diverged. Reconcile the repository and ask the Solution Architect to review before development.');
}
async function saveCompleted(record,{worktree,storageRoot}){
 const expected=path.resolve(storageRoot)+path.sep;
 if(!path.resolve(worktree).startsWith(expected)||path.resolve(record.worktree)!==path.resolve(worktree))throw Error('Completion worktree is outside protected development storage.');
 await tdd.verifyCheckpoint(worktree,record.checkpoint);
 const current=await pipeline.runGit(worktree,'rev-parse','HEAD');
 if(current!==(record.baseSha||record.approvalSha))throw Error('Development baseline changed before completion.');
 if(await pipeline.runGit(worktree,'branch','--show-current')!==record.branch)throw Error('Development branch changed before completion.');
 const paths=Object.keys(record.checkpoint.files).map(pipeline.safeRelative);
 if(paths.some(p=>/\.(?:sqlite(?:3)?|db)(?:[-.].*)?$/i.test(p)))throw Error('Runtime databases cannot be committed as source.');
 if(await pipeline.runGit(worktree,'diff','--cached','--name-only'))throw Error('Review existing staged changes before recording a completed application.');
 await pipeline.runGit(worktree,'add','--',...paths);
 const staged=await pipeline.runGit(worktree,'diff','--cached','--name-only');
 if(staged){
  const allowed=new Set(paths);
  if(staged.split('\n').some(p=>!allowed.has(p)))throw Error('Unexpected staged source; review before completing.');
  await pipeline.runGit(worktree,'-c','user.name=ATGV','-c','user.email=atgv-local@localhost','commit','-m','ATGV '+record.brId+' verified revision '+record.revision);
 }
 const sha=await pipeline.runGit(worktree,'rev-parse','HEAD');
 await pipeline.runGit(worktree,'merge-base','--is-ancestor',record.approvalSha,sha);
 return sha;
}
module.exports={choose,chooseCurrent,saveCompleted};
