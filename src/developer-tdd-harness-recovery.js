'use strict';
// Controlled legacy recovery. Only AI-authored RED test bytes proven to contain
// a harness defect and matching a verified checkpoint may be archived/rebased.
// Never mutate a locked test in place, the approved BR, or accepted app code.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const guard=require('./developer-tdd-harness-guard');
const {safeRelative}=require('./developer-br-pipeline');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function failingEvidence(evidence){return (evidence||[]).filter(row=>row&&row.passed===false).map(row=>String(row.failureDetails||'')+'\n'+String(row.logs||'')).join('\n');}
function matchesIssue(kind,logs){
 return kind==='unapproved-ui-network-assertion'?/(?:expected undefined to be defined|rejectedCreateResponse[^\n]{0,120}undefined)/i.test(logs):
  kind==='recursive-fetch-mock'?/Maximum call stack size exceeded/i.test(logs):false;
}
async function plan({worktree,criteria=[],failedIndex,brText,checkpoint,evidence=[],previousRebaselines=[]}){
 if(!Number.isInteger(failedIndex)||failedIndex<1||failedIndex>=criteria.length)return {status:'not-applicable',items:[]};
 const logs=failingEvidence(evidence),items=[],root=await fs.realpath(worktree);
 for(let index=0;index<=failedIndex;index++){
  const criterion=criteria[index];
  if(index<failedIndex&&!['complete','already-implemented'].includes(criterion?.status))continue;
  if(previousRebaselines.some(row=>row?.criterion===criterion?.id))continue;
  for(const input of criterion?.testFiles||[]){
   const relative=safeRelative(input),full=path.join(root,relative),content=await fs.readFile(full,'utf8');
   const digest=sha(content);
   if(checkpoint?.files?.[relative]!==digest)throw Error('Cannot review legacy RED harness: verified checkpoint mismatch for '+relative);
   const problems=guard.inspectGeneratedRedTests([{path:relative,content}],brText).filter(row=>matchesIssue(row.kind,logs));
   if(problems.length)items.push({index,criterion:criterion.id,path:relative,sha256:digest,kind:problems[0].kind,message:problems[0].message});
  }
 }
 const earlier=items.some(item=>item.index<failedIndex),current=items.some(item=>item.index===failedIndex);
 if(!earlier)return {status:'not-applicable',items};
 if(!current&&items.length<=12)return {status:'ready-earlier-only',items,earliestIndex:Math.min(...items.map(item=>item.index)),preservedIndex:failedIndex,reason:'Only independently proven earlier RED harness defects may be archived. The current failed criterion remains locked and is deferred solely during earlier criterion test execution.'};
 if(items.length>12)return {status:'review-required',items:[],reason:'Too many invalid harness files to rebaseline automatically.'};
 return {status:'ready',items,earliestIndex:Math.min(...items.map(item=>item.index))};
}
async function archive({worktree,storageRoot,projectId,brId,checkpoint,review}){
 if(!['ready','ready-earlier-only'].includes(review?.status)||!review.items?.length)throw Error('Verified legacy harness plan is required before archival.');
 const root=await fs.realpath(worktree),storage=await fs.realpath(storageRoot);
 if(root===storage||root.startsWith(storage+path.sep)===false)throw Error('Recovery worktree must be inside protected ATGV global storage.');
 const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');
 const folder=path.join(storage,'developer-red-harness-rebaselines',safe(projectId),safe(brId));
 const originals=[];
 for(const item of review.items){
  const rel=safeRelative(item.path),full=path.join(root,rel),real=await fs.realpath(full);
  if(!real.startsWith(root+path.sep))throw Error('RED harness is outside the worktree: '+rel);
  const content=await fs.readFile(full,'utf8'),digest=sha(content);
  if(digest!==item.sha256||digest!==checkpoint.files[rel])throw Error('Locked RED test checksum changed; no files removed: '+rel);
  originals.push({...item,path:rel,full,content});
 }
 await fs.mkdir(folder,{recursive:true,mode:0o700});
 const archives=[];
 // Every original is durably archived BEFORE removing any file.
 for(const row of originals){
  const filename=safe(row.criterion)+'-'+sha(row.path).slice(0,12)+'-'+row.sha256+'.txt';
  const target=path.join(folder,filename);
  try{await fs.writeFile(target,row.content,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST'||await fs.readFile(target,'utf8')!==row.content)throw error;}
  archives.push({criterion:row.criterion,path:row.path,sha256:row.sha256,kind:row.kind,archive:target});
 }
 for(const row of originals)if(sha(await fs.readFile(row.full))!==row.sha256)throw Error('RED test changed during archival; no files removed.');
 try{for(const row of originals)await fs.unlink(row.full);}
 catch(error){for(const row of originals)await fs.writeFile(row.full,row.content,'utf8');throw error;}
 return {at:new Date().toISOString(),reason:'Checkpoint-verified, AI-generated RED harness defects found during historical GREEN; test bytes archived for audited rebaseline, not changed to force GREEN.',archives};
}
// This is a non-destructive diagnostic fallback, NOT consent to unlock tests.
// Review files are copied only from the checkpoint-verified worktree to
// protected global storage; originals and the checkpoint stay unchanged.
async function prepareReview({worktree,storageRoot,projectId,brId,checkpoint,review,criteria=[],failedIndex}){
 if(review?.status!=='review-required'||!Number.isInteger(failedIndex)||failedIndex<0)
  throw Error('A blocked, verified legacy-harness review is required.');
 const root=await fs.realpath(worktree),storage=await fs.realpath(storageRoot);
 if(root===storage||!root.startsWith(storage+path.sep))throw Error('Recovery worktree must be inside protected ATGV global storage.');
 const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');
 const toCopy=new Set([...(review.items||[]).map(i=>i.path),...(criteria[failedIndex]?.testFiles||[])]);
 for(const app of ['src/App.tsx','src/App.jsx','server/index.mjs','server/index.js'])toCopy.add(app);
 const copies=[];
 for(const item of toCopy){
  const rel=safeRelative(item),full=path.join(root,rel);
  let real;try{real=await fs.realpath(full)}catch(error){if(error.code==='ENOENT'&&!review.items?.some(i=>i.path===rel)&&!criteria[failedIndex]?.testFiles?.includes(rel))continue;throw error;}
  if(!real.startsWith(root+path.sep))throw Error('Review file is outside the worktree: '+rel);
  const content=await fs.readFile(real),digest=sha(content);
  if(checkpoint?.files?.[rel]!==digest)throw Error('Cannot review changed or unverified source: '+rel);
  copies.push({path:rel,content,sha256:digest,criterion:criteria[failedIndex]?.testFiles?.includes(rel)?criteria[failedIndex].id:(review.items||[]).find(i=>i.path===rel)?.criterion||null});
 }
 if(!review.items?.length||!criteria[failedIndex]?.testFiles?.every(rel=>copies.some(x=>x.path===rel)))
  throw Error('Cannot prepare review: all required original locked tests must be checkpoint-verified.');
 const folder=path.join(storage,'developer-red-harness-review',safe(projectId),safe(brId),safe(checkpoint.files[copies[0].path].slice(0,16)));
 await fs.mkdir(folder,{recursive:true,mode:0o700});
 const manifest=[];
 for(const row of copies){
  const target=path.join(folder,sha(row.path).slice(0,12)+'-'+path.basename(row.path));
  try{await fs.writeFile(target,row.content,{flag:'wx',mode:0o600})}
  catch(error){if(error.code!=='EEXIST'||sha(await fs.readFile(target))!==row.sha256)throw error;}
  manifest.push({originalPath:row.path,copyFile:path.basename(target),sha256:row.sha256,criterion:row.criterion});
 }
 const summary={reason:review.reason,failedCriterion:criteria[failedIndex].id,issues:review.items.map(({criterion,path,kind,sha256})=>({criterion,path,kind,sha256})),files:manifest,action:'Review exact RED harness source against the approved BR; do not disable, edit, or automatically invalidate the failing criterion test. Restore verified checkpoint before rerunning.'};
 await fs.writeFile(path.join(folder,'REVIEW.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
 return {folder,summary};
}
// Historical RED repair can precede a different, already-locked failing AC.
// Exclude ONLY that later AC while executing the earlier RED/GREEN/REFACTOR
// suite. The original test remains byte-identical and is restored in finally.
// Never defer any earlier or currently regenerated acceptance tests.
async function withDeferredTests({worktree,storageRoot,projectId,brId,checkpoint,files=[],run}){
 if(typeof run!=='function')throw Error('A verified test runner is required for deferred harness execution.');
 if(!files.length)return run();
 const root=await fs.realpath(worktree),storage=await fs.realpath(storageRoot);
 if(root===storage||!root.startsWith(storage+path.sep))throw Error('Deferred RED tests require a protected ATGV worktree.');
 const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');
 const snapshot=[];
 for(const input of [...new Set(files)]){
  const rel=safeRelative(input),full=path.join(root,rel),real=await fs.realpath(full);
  if(!real.startsWith(root+path.sep))throw Error('Deferred RED test is outside the worktree: '+rel);
  const bytes=await fs.readFile(real),digest=sha(bytes);
  if(!checkpoint?.files||checkpoint.files[rel]!==digest)throw Error('Deferred locked RED test checkpoint mismatch: '+rel);
  snapshot.push({rel,full,bytes,digest});
 }
 const dir=path.join(storage,'developer-red-harness-deferred',safe(projectId),safe(brId),require('node:crypto').randomUUID());
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const manifest={worktree:root,projectId:String(projectId),brId:String(brId),files:snapshot.map(row=>({path:row.rel,sha256:row.digest,backup:sha(row.rel)+'-'+path.basename(row.rel)}))};
 const staged=[];
 let primaryError;
 try{
  // Complete EVERY durable backup before writing the recovery journal or
  // removing ANY test from discovery. A crash cannot leave a partial journal.
  for(const row of snapshot){
   const stagedPath=path.join(dir,sha(row.rel)+'-'+path.basename(row.rel));
   await fs.writeFile(stagedPath,row.bytes,{flag:'wx',mode:0o600});
   if(sha(await fs.readFile(stagedPath))!==row.digest)throw Error('Deferred RED test backup failed integrity check: '+row.rel);
  }
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  for(const row of snapshot){
   const stagedPath=path.join(dir,sha(row.rel)+'-'+path.basename(row.rel));
   await fs.unlink(row.full);
   staged.push({...row,stagedPath});
  }
  return await run();
 }catch(error){primaryError=error;throw error;}
 finally{
  let restoreError=null;
  for(const row of staged.reverse()){
   try{
    const current=await fs.readFile(row.full).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(current!==null){
     if(sha(current)!==row.digest)throw Error('Test path was rewritten while deferred; protected copy retained at '+row.stagedPath);
    }else await fs.writeFile(row.full,row.bytes,{flag:'wx',mode:0o600});
    if(sha(await fs.readFile(row.full))!==row.digest)throw Error('Deferred RED test failed restoration checksum: '+row.rel);
   }catch(error){restoreError=restoreError||error;}
  }
  if(!restoreError)await fs.rm(dir,{force:true,recursive:true});
  if(restoreError)throw Error('Deferred locked RED restoration failed; protected backup retained. '+restoreError.message+(primaryError?' Original test-run failure: '+primaryError.message:''));
 }
}
// A VS Code crash during an excluded test run may bypass JavaScript finally.
// Restore only files whose original SHA-256 is present in the saved checkpoint.
// Refuse to replace changed worktree files and retain the journal on errors.
async function restoreInterruptedDeferredTests({worktree,storageRoot,projectId,brId,checkpoint}){
 const root=await fs.realpath(worktree),storage=await fs.realpath(storageRoot);
 if(root===storage||!root.startsWith(storage+path.sep))throw Error('Deferred RED recovery requires protected storage.');
 const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');
 const base=path.join(storage,'developer-red-harness-deferred',safe(projectId),safe(brId));
 const entries=await fs.readdir(base,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
 let restored=0;
 for(const entry of entries){
  if(!entry.isDirectory())continue;
  const dir=path.join(base,entry.name);
  // No journal means backup preparation never finished and no test was
  // removed; it is safe to discard this incomplete, unused backup directory.
  const journal=await fs.readFile(path.join(dir,'manifest.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(journal===null){await fs.rm(dir,{recursive:true,force:true});continue;}
  const manifest=JSON.parse(journal);
  if(manifest.worktree!==root||manifest.projectId!==String(projectId)||manifest.brId!==String(brId))
   throw Error('Deferred RED recovery journal belongs to another worktree; no files modified.');
  const pending=[];
  for(const item of manifest.files||[]){
   const rel=safeRelative(item.path),destination=path.join(root,rel),backup=path.join(dir,item.backup);
   if(item.sha256!==checkpoint?.files?.[rel])throw Error('Deferred RED restore checkpoint differs: '+rel);
   const content=await fs.readFile(backup);
   if(sha(content)!==item.sha256)throw Error('Deferred RED restore backup corrupted: '+rel);
   const current=await fs.readFile(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(current!==null&&sha(current)!==item.sha256)throw Error('Deferred RED restore cannot overwrite changed test: '+rel);
   if(current===null)pending.push({destination,content});
  }
  for(const row of pending){await fs.writeFile(row.destination,row.content,{flag:'wx',mode:0o600});restored++;}
  await fs.rm(dir,{recursive:true,force:true});
 }
 return {restored};
}
module.exports={plan,archive,prepareReview,withDeferredTests,restoreInterruptedDeferredTests};
