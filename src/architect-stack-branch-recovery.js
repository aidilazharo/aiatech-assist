'use strict';
// Read-only recovery of a saved stack branch dropped by older project-registry
// normalization. Never switch branches, fetch, reset or change tracked files.
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const git=async(root,...args)=>(await exec('git',['-C',root,...args],{
 timeout:30000,windowsHide:true,maxBuffer:1024*1024,
 env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}
})).stdout.trim();
function recognizedBranch(branch,stackId){
 if(typeof branch!=='string'||!/^[a-z][a-z0-9-]{0,48}$/.test(stackId||''))return false;
 return new RegExp('^(?:bootstrap/'+stackId+'-(?:initial|reset-[0-9]+)|migration/'+stackId+'-catalog-[a-z0-9-]{1,80})$').test(branch);
}
async function recover({root,project,readRefs}={}){
 const prepared=project?.techStackPrepared,stackId=project?.techStackId;
 if(!prepared||!stackId||prepared.stackId!==stackId)throw Error('Save the selected technology stack before starting its application.');
 if(!root||path.resolve(prepared.root||'')!==path.resolve(root))throw Error('The saved stack checkout differs from the selected repository.');
 if(prepared.branch)return {project,recovered:false,branch:prepared.branch};
 const sha=String(prepared.sha||'');
 if(!/^[a-f0-9]{40}$/.test(sha)||prepared.remotePushed!==true)
  throw Error('Saved stack branch and verified Git revision are missing. Use Save Stack to restore the approved catalog branch; ATGV will not guess or rewrite it.');
 const top=path.resolve(await git(root,'rev-parse','--show-toplevel'));
 if(top!==path.resolve(root))throw Error('Saved stack repository is not the selected Git checkout.');
 const raw=readRefs?await readRefs(root):await git(root,'for-each-ref','--format=%(refname:short)%09%(objectname)','refs/heads/bootstrap','refs/heads/migration');
 const choices=String(raw||'').split('\n').map(x=>x.split('\t')).filter(x=>x.length===2&&x[1]===sha&&recognizedBranch(x[0],stackId)).map(x=>x[0]);
 if(choices.length!==1)throw Error(choices.length
  ?'Multiple ATGV stack branches match the recorded Git SHA. Select the verified branch manually; no branch was changed.'
  :'Saved stack branch is missing and no matching local migration/bootstrap branch exists at its recorded Git SHA. Fetch the original branch or use Save Stack to recover safely.');
 const recovered={...project,techStackPrepared:{...prepared,branch:choices[0]}};
 // Never invent approval or health evidence; retain the stored tested SHA.
 return {project:recovered,recovered:true,branch:choices[0]};
}
module.exports={recover,recognizedBranch};
