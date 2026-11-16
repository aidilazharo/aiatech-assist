'use strict';
// Safe Git publication: no force-push, no mutation of the shared checkout,
// pinned approved stack SHA, and recoverable remote-first reconciliation.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
const SHA=/^[a-f0-9]{40}$/,JIRA=/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/;
const git=async(root,...args)=>(await exec('git',args,{cwd:root,timeout:60000,maxBuffer:4*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}})).stdout.trim();
const safeRef=s=>/^[a-z0-9][a-z0-9_/-]{0,110}$/.test(String(s||''))&&!s.includes('..')&&!s.includes('//')&&!s.endsWith('/');
const checkSha=s=>{if(!SHA.test(String(s||'')))throw Error('A complete approved Git SHA is required.');return s;};
async function assertRepo(root){const p=path.resolve(await fs.realpath(root)),top=path.resolve(await git(p,'rev-parse','--show-toplevel'));if(p!==top)throw Error('Select the Git repository root.');
 if(!await git(p,'remote','get-url','origin').catch(()=>''))throw Error('Git origin remote is not configured.');return p;}
async function remoteSha(root,ref){const out=await git(root,'ls-remote','--heads','origin','refs/heads/'+ref);const matched=out.split(/\s+/)[0]||'';return SHA.test(matched)?matched:'';}
async function publishApprovedStack({root,stackId,generation=1,sha}){
 checkSha(sha);if(!/^[a-z][a-z0-9-]{0,48}$/.test(stackId)||!Number.isInteger(generation)||generation<0||generation>9999)throw Error('Invalid approved technology stack.');
 const repo=await assertRepo(root),ref=`tech-stack/${stackId}-v${generation}`;
 if(await git(repo,'cat-file','-t',sha)!=='commit')throw Error('Approved stack SHA is not a local commit.');
 const existing=await remoteSha(repo,ref);
 // A previous stack generation may already own the conventional branch.
 // Never update or force-push it. Bind this approved commit to a unique,
 // deterministic revision-pinned alias instead so retries are idempotent.
 const resolved=existing&&existing!==sha?ref+'-'+sha.slice(0,12):ref;
 const remoteBefore=resolved===ref?existing:await remoteSha(repo,resolved);
 if(remoteBefore&&remoteBefore!==sha)
  throw Error('The revision-pinned approved stack branch '+resolved+' exists at another commit. No remote branches were overwritten.');
 if(!remoteBefore){
  try{await git(repo,'push','origin',sha+':refs/heads/'+resolved);}
  catch(error){
   // A racing publisher may have created the exact same branch. Adopt it
   // only after verifying the remote SHA, otherwise preserve both branches.
   if(await remoteSha(repo,resolved)!==sha)throw error;
  }
 }
 if(await remoteSha(repo,resolved)!==sha)throw Error('Remote approved stack SHA could not be verified.');
 return {branch:resolved,sha,remoteVerified:true,reused:!!remoteBefore,renamed:resolved!==ref,previousBranch:resolved!==ref?ref:null};
}
async function approvedBase(root,sha){
 checkSha(sha);const repo=await assertRepo(root);
 if(await git(repo,'cat-file','-t',sha)!=='commit')throw Error('Approved stack SHA is not available locally.');
 const main=await remoteSha(repo,'main');
 if(main){await git(repo,'fetch','--no-tags','origin','refs/heads/main:refs/remotes/origin/main');
  const ancestor=await git(repo,'merge-base','--is-ancestor',sha,'refs/remotes/origin/main').then(()=>true,()=>false);
  if(ancestor)return {sha:await git(repo,'rev-parse','refs/remotes/origin/main'),source:'main',approvedStackSha:sha};
 }
 return {sha,source:'approved-stack',approvedStackSha:sha};
}
function worktreePath(root,storyKey){const key=String(storyKey||'').toUpperCase();if(!JIRA.test(key))throw Error('Invalid parent Jira Story key.');
 const id=crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0,14);
 return path.join(path.dirname(path.resolve(root)),'.atgv-task-worktrees',id,key.toLowerCase());}
function featureRef(key){const k=String(key||'').toUpperCase();if(!JIRA.test(k))throw Error('Valid parent Jira Story key required.');return 'feature/'+k.toLowerCase();}
async function readManifest(root,key){const filename=`src/atgv-design/${String(key).toLowerCase()}/manifest.json`;
 const raw=await git(root,'show','HEAD:'+filename).catch(()=>'');return raw?JSON.parse(raw):null;}
async function publishDesign({root,storyKey,designKey,designRevision,approvedStackSha,files,validate=async()=>({passed:false,reason:'No build/test validation was supplied.'})}){
 const repo=await assertRepo(root),branch=featureRef(storyKey),worktree=worktreePath(repo,storyKey);
 if(!JIRA.test(String(designKey||''))||!Number.isInteger(designRevision)||designRevision<1)throw Error('Approved UI/UX design identity required.');
 const entries=Object.entries(files||{});if(!entries.length||entries.length>150)throw Error('No frontend source files to publish.');
 for(const [name,content] of entries)if(!/^src\/atgv-design\/[A-Za-z0-9/_-]+\.(?:tsx|ts|css|json|md)$/.test(name)||name.includes('..')||typeof content!=='string'||content.length>200000)throw Error('Frontend publication contains an unsafe file.');
 const manifestName=`src/atgv-design/${String(storyKey).toLowerCase()}/manifest.json`;
 if(entries.some(([name])=>name===manifestName))throw Error('Generated sources may not override their authoritative manifest.');
 const contentSha=crypto.createHash('sha256').update(JSON.stringify(entries.sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
 const existing=await remoteSha(repo,branch);
 if(existing){
  await git(repo,'fetch','--no-tags','origin','refs/heads/'+branch+':refs/remotes/origin/'+branch);
  const remote=await git(repo,'show','refs/remotes/origin/'+branch+':'+manifestName).catch(()=>'');
  const record=remote?JSON.parse(remote):null;
  if(record?.designKey===designKey&&record.designRevision===designRevision&&record.contentSha===contentSha&&record.approvedStackSha===approvedStackSha)
   return {branch,remoteSha:existing,reused:true,worktree:null};
  throw Error('A remote feature branch already exists with different design or Developer changes. Use reviewed change control.');
 }
 const base=await approvedBase(repo,approvedStackSha);
 const existingLocal=await git(repo,'show-ref','--verify','refs/heads/'+branch).then(()=>true,()=>false);
 if(existingLocal)throw Error('Local feature branch already exists. Review the interrupted publication before retrying.');
 if(await fs.lstat(worktree).then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e)))throw Error('Task worktree already exists. Inspect the previous attempt before retrying.');
 await fs.mkdir(path.dirname(worktree),{recursive:true,mode:0o700});
 await git(repo,'worktree','add','-b',branch,worktree,base.sha);
 for(const [relative,content] of entries){const dest=path.join(worktree,relative),parent=path.dirname(dest);await fs.mkdir(parent,{recursive:true,mode:0o700});
  const st=await fs.lstat(dest).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));if(st)throw Error('Refusing to overwrite existing application source '+relative);
  await fs.writeFile(dest,content,{flag:'wx',mode:0o600});}
 const manifest={schema:1,storyKey,designKey,designRevision,approvedStackSha,baseSha:base.sha,baseSource:base.source,contentSha,sourceFiles:entries.map(([name])=>name),publishedAt:new Date().toISOString()};
 const dest=path.join(worktree,manifestName);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const verification=await validate(worktree);if(!verification?.passed)throw Error('Frontend validation did not pass; unpublished task worktree retained for inspection: '+String(verification?.reason||''));
 // The approved stack may predate npm lockfiles. If validation generated a
 // reproducible lockfile inside this isolated worktree, publish it with the
 // design handoff. Never stage a modified package.json or an arbitrary file.
 const dependencyFiles=verification.dependencyFiles||[];
 if(!Array.isArray(dependencyFiles)||dependencyFiles.length>1||dependencyFiles.some(x=>x!=='package-lock.json'))throw Error('Story validator returned an unsafe dependency file. Publication blocked.');
 let lockSha='';
 if(dependencyFiles.length){
  const lockPath=path.join(worktree,'package-lock.json');
  const st=await fs.lstat(lockPath).catch(()=>null);
  if(!st?.isFile()||st.isSymbolicLink())throw Error('Story dependency lockfile is missing or not a regular file.');
  if(await git(worktree,'ls-files','--error-unmatch','package-lock.json').then(()=>true,()=>false))throw Error('Existing approved lockfile must not be replaced during design publication.');
  const raw=await fs.readFile(lockPath);lockSha=crypto.createHash('sha256').update(raw).digest('hex');
  const parsed=JSON.parse(raw);
  if(!Number.isInteger(parsed.lockfileVersion)||parsed.lockfileVersion<2)throw Error('Story dependency lockfile version is unsupported.');
 }
 manifest.dependencyFiles=dependencyFiles;
 if(lockSha)manifest.dependencyLockSha256=lockSha;
 await fs.writeFile(dest,JSON.stringify(manifest,null,2)+'\n');
 // Only the exact approved design paths, manifest and optional newly generated
 // lockfile may be committed. Unexpected modified application files block push.
 const allowed=new Set([...entries.map(([name])=>name),manifestName,...dependencyFiles]);
 const changed=(await git(worktree,'status','--porcelain','--untracked-files=all')).split('\n').filter(Boolean).map(row=>row.slice(3));
 if(changed.some(name=>!allowed.has(name)))throw Error('Story publication produced unexpected repository changes: '+changed.filter(name=>!allowed.has(name)).slice(0,5).join(', '));
 await git(worktree,'add','--',...entries.map(([name])=>name),manifestName,...dependencyFiles);
 await git(worktree,'-c','user.name=ATGV UI/UX Handoff','-c','user.email=atgv-local@users.noreply.github.com','commit','-m',`Design handoff ${designKey} v${designRevision} for ${storyKey}`);
 const head=await git(worktree,'rev-parse','HEAD');
 if(await remoteSha(repo,branch))throw Error('Remote branch appeared during publication; review before retrying.');
 await git(worktree,'push','--set-upstream','origin',branch);
 if(await remoteSha(repo,branch)!==head)throw Error('GitHub branch publish did not verify against the local commit.');
 return {branch,remoteSha:head,reused:false,worktree,baseSha:base.sha,baseSource:base.source};
}
async function verifyDeveloperHandoff({root,storyKey,designKey,designRevision,approvedStackSha}){
 const repo=await assertRepo(root),branch=featureRef(storyKey),sha=await remoteSha(repo,branch);
 if(!sha)throw Error('UI/UX code has not been published to a remote Story branch.');
 await git(repo,'fetch','--no-tags','origin','refs/heads/'+branch+':refs/remotes/origin/'+branch);
 const name=`src/atgv-design/${String(storyKey).toLowerCase()}/manifest.json`;
 const raw=await git(repo,'show','refs/remotes/origin/'+branch+':'+name).catch(()=>'');
 if(!raw)throw Error('Remote Story branch has no UI/UX handoff manifest.');
 const meta=JSON.parse(raw);
 if(meta.storyKey!==storyKey||meta.designKey!==designKey||meta.designRevision!==designRevision||meta.approvedStackSha!==approvedStackSha)throw Error('Published frontend branch does not match the approved design and stack.');
 return {branch,sha,manifest:meta,verified:true};
}
async function publishBackendStory({root,storyKey,approvedStackSha}){
 const repo=await assertRepo(root),branch=featureRef(storyKey),existing=await remoteSha(repo,branch);
 if(existing){
  await git(repo,'fetch','--no-tags','origin','refs/heads/'+branch+':refs/remotes/origin/'+branch);
  const isDescendant=await git(repo,'merge-base','--is-ancestor',checkSha(approvedStackSha),'refs/remotes/origin/'+branch).then(()=>true,()=>false);
  if(!isDescendant)throw Error('Existing remote Story branch does not contain the approved stack SHA.');
  return {branch,sha:existing,reused:true};
 }
 const base=await approvedBase(repo,approvedStackSha);
 await git(repo,'push','origin',base.sha+':refs/heads/'+branch);
 const verified=await remoteSha(repo,branch);
 if(verified!==base.sha)throw Error('Backend-only Story branch publication did not verify remotely.');
 return {branch,sha:verified,reused:false};
}
async function checkoutDeveloper({root,storyKey}){
 const repo=await assertRepo(root),branch=featureRef(storyKey),sha=await remoteSha(repo,branch);
 if(!sha)throw Error('Remote feature branch is missing; the Story handoff is not ready.');
 await git(repo,'fetch','--no-tags','origin','refs/heads/'+branch+':refs/remotes/origin/'+branch);
 const location=worktreePath(repo,storyKey);
 if(await fs.lstat(location).then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e))){
  const top=await git(location,'rev-parse','--show-toplevel').catch(()=>'');
  if(path.resolve(top)!==path.resolve(location))throw Error('Existing worktree path is not the expected Git worktree.');
  const changes=await git(location,'status','--porcelain');
  if(changes)throw Error('Story worktree contains uncommitted files. Review them before resuming development.');
  const head=await git(location,'rev-parse','HEAD');
  if(head!==sha)throw Error('Story worktree does not match latest published remote branch. Review changes before continuing.');
  return {root:location,branch,baseSha:sha,head:sha,action:'resumed-existing-story-worktree'};
 }
 const exists=await git(repo,'show-ref','--verify','refs/heads/'+branch).then(()=>true,()=>false);
 if(exists)throw Error('The Story branch already exists in another local checkout. Switch to its existing worktree instead.');
 await fs.mkdir(path.dirname(location),{recursive:true,mode:0o700});
 await git(repo,'worktree','add','-b',branch,location,'refs/remotes/origin/'+branch);
 const head=await git(location,'rev-parse','HEAD');
 if(head!==sha)throw Error('Isolated Developer worktree does not match verified remote Story SHA.');
 return {root:location,branch,baseSha:sha,head:sha,action:'checked-out-remote-story'};
}
// Permanently retire ONLY a feature branch whose tip is the single original
// ATGV-generated handoff commit. Later Developer commits, branch reuse and
// unknown/legacy branches are protected from automatic deletion.
async function inspectOwnedFeature({root,storyKey,designKeys=[]}){
 const repo=await assertRepo(root),branch=featureRef(storyKey),sha=await remoteSha(repo,branch);
 if(!sha)return {branch,status:'absent'};
 await git(repo,'fetch','--no-tags','origin','refs/heads/'+branch+':refs/remotes/origin/'+branch);
 const k=String(storyKey).toLowerCase(),filename=`src/atgv-design/${k}/manifest.json`;
 const raw=await git(repo,'show',sha+':'+filename).catch(()=>'');
 if(!raw)return {branch,sha,status:'protected',reason:'No ATGV design handoff manifest; branch may contain Developer work.'};
 let meta;try{meta=JSON.parse(raw);}catch{return {branch,sha,status:'protected',reason:'Invalid manifest; manual review required.'};}
 if(meta.schema!==1||meta.storyKey!==storyKey||!designKeys.includes(meta.designKey)||!SHA.test(meta.baseSha||''))
   return {branch,sha,status:'protected',reason:'Manifest is not exclusively owned by the deleted BR.'};
 const rawParents=await git(repo,'rev-list','--parents','-n','1',sha),parents=rawParents.split(/\s+/);
 const author=await git(repo,'show','-s','--format=%an',sha);
 if(parents.length!==2||parents[1]!==meta.baseSha||author!=='ATGV UI/UX Handoff')
   return {branch,sha,status:'protected',reason:'Branch tip includes Developer or unrecognised commits.'};
 const dependencyFiles=meta.dependencyFiles||[];
 if(!Array.isArray(dependencyFiles)||dependencyFiles.length>1||dependencyFiles.some(name=>name!=='package-lock.json'))
   return {branch,sha,status:'protected',reason:'Unknown dependency files in handoff manifest.'};
 if(dependencyFiles.length){
  if(!SHA.test(meta.dependencyLockSha256||''))return {branch,sha,status:'protected',reason:'Lockfile checksum is missing.'};
  const raw=await git(repo,'show',sha+':package-lock.json').catch(()=>'');
  if(!raw||!['valid','matched'].includes((()=>{
    // git() trims stdout, so compare both possible trailing-newline forms.
    const h1=crypto.createHash('sha256').update(raw).digest('hex');
    const h2=crypto.createHash('sha256').update(raw+'\n').digest('hex');
    return h1===meta.dependencyLockSha256||h2===meta.dependencyLockSha256?'matched':'invalid';
   })()))return {branch,sha,status:'protected',reason:'Lockfile checksum mismatch.'};
 }
 const touched=(await git(repo,'diff-tree','--no-commit-id','--name-only','-r',sha)).split('\n').filter(Boolean).sort();
 const expected=[...(meta.sourceFiles||[]),...dependencyFiles,filename].sort();
 if(!touched.length||JSON.stringify(touched)!==JSON.stringify(expected))
   return {branch,sha,status:'protected',reason:'Branch commit changes files outside the approved UI/UX handoff.'};
 return {branch,sha,status:'eligible',designKey:meta.designKey};
}
async function deleteOwnedFeature({root,storyKey,designKeys,expectedSha}){
 checkSha(expectedSha);
 const result=await inspectOwnedFeature({root,storyKey,designKeys});
 if(result.status==='absent')return {branch:result.branch,status:'absent'};
 if(result.status!=='eligible'||result.sha!==expectedSha)throw Error('Remote Story branch changed since the deletion preview. Branch preserved.');
 const repo=await assertRepo(root);
 await git(repo,'push',`--force-with-lease=refs/heads/${result.branch}:${expectedSha}`,'origin',':refs/heads/'+result.branch);
 if(await remoteSha(repo,result.branch))throw Error('Remote branch still exists after deletion. Review GitHub manually.');
 // The extension creates its own isolated worktrees. Remove one only when its
 // HEAD is the exact deleted handoff commit and the directory is clean.
 // Never force-remove a Developer worktree or an unknown local checkout.
 const local=worktreePath(repo,storyKey),st=await fs.lstat(local).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 let localStatus='absent';
 if(st){
  if(!st.isDirectory()||st.isSymbolicLink())localStatus='protected: unexpected worktree path';
  else {
   const top=await git(local,'rev-parse','--show-toplevel').catch(()=>'');
   const head=await git(local,'rev-parse','HEAD').catch(()=>'');
   const changed=await git(local,'status','--porcelain','--untracked-files=all').catch(()=>'unknown');
   if(path.resolve(top)!==path.resolve(local)||head!==expectedSha||changed)localStatus='protected: worktree has changed or is unverified';
   else {
    try{await git(repo,'worktree','remove',local);localStatus='deleted';}
    catch(error){localStatus='protected: '+String(error.message||error).slice(0,160);}
   }
  }
 }
 return {branch:result.branch,status:'deleted',sha:expectedSha,localStatus};
}
module.exports={inspectOwnedFeature,deleteOwnedFeature,publishApprovedStack,approvedBase,worktreePath,featureRef,publishDesign,verifyDeveloperHandoff,remoteSha,publishBackendStory,checkoutDeveloper};
