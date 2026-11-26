'use strict';
// Independent ATGV: Workspace webview for Source main -> Destination pull request.
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const gitExec=promisify(execFile);
const repoSync=require('./repo-sync-pr');
const repoCredentials=require('./repo-sync-credentials');
const releasePublisher=require('./repo-sync-release-publisher');
const {createQueue}=require('./repo-sync-release-queue');
let releaseQueue=null,releaseQueueTimer=null,releasePanelPost=null;
function startReleaseSync({preferences,secrets,onLog=()=>{}}){
 if(releaseQueueTimer)clearInterval(releaseQueueTimer);
 releaseQueue=createQueue({preferences,secrets,onLog,onChange:items=>{void releasePanelPost?.({type:'releaseQueueStatus',items});}});
 const tick=()=>releaseQueue.tick().catch(error=>onLog('Workspace release queue: '+String(error?.message||error).slice(0,160)));
 void tick();releaseQueueTimer=setInterval(tick,60*60*1000);releaseQueueTimer.unref?.();
 return {dispose(){clearInterval(releaseQueueTimer);releaseQueueTimer=null;releaseQueue=null;}};
}
const SAVED_URL_KEYS=Object.freeze({Source:'atgvAssist.repoSync.lastSourceUrl',Destination:'atgvAssist.repoSync.lastDestinationUrl'});
const SAVED_LIST_KEYS=Object.freeze({Source:'atgvAssist.repoSync.savedSourceUrls',Destination:'atgvAssist.repoSync.savedDestinationUrls'});
const MAX_SAVED_REPOS=30;
const SAVED_FOLDER_KEY='atgvAssist.repoSync.lastDestinationFolder';
const PROFILES=Object.freeze(['extension','library','project']);
const LIBRARY_SOURCE='https://github.com/aidilazharo/tech-stacks-skills';
const profileKey=(key,profile)=>profile==='extension'?key:key+'.'+profile;
async function managedCheckout(folder){
 if(await fs.realpath(folder)!==folder)throw Error('Selected folder changed. Choose it again.');
 const root=await fs.lstat(folder);
 if(!root.isDirectory()||root.isSymbolicLink())throw Error('Selected folder is no longer a real directory.');
 if((await fs.readdir(folder)).length)return null;
 const dir=await fs.mkdtemp(path.join(folder,'.atgv-sync-'));
 const stat=await fs.lstat(dir);
 return {folder,dir,dev:stat.dev,ino:stat.ino,rootDev:root.dev,rootIno:root.ino};
}
async function cleanManagedCheckout(checkout,outcome,{git=async(args,cwd)=>(await gitExec('git',args,{cwd,encoding:'utf8',maxBuffer:4*1024*1024,timeout:30000})).stdout.trim()}={}){
 if(!checkout||!outcome?.prUrl||outcome.unchanged)return false;
 const {folder,dir}=checkout;
 const root=await fs.lstat(folder),stat=await fs.lstat(dir);
 if(root.isSymbolicLink()||!root.isDirectory()||root.dev!==checkout.rootDev||root.ino!==checkout.rootIno||
    stat.isSymbolicLink()||!stat.isDirectory()||stat.dev!==checkout.dev||stat.ino!==checkout.ino||
    await fs.realpath(dir)!==dir||path.dirname(dir)!==folder||!path.basename(dir).startsWith('.atgv-sync-'))throw Error('Temporary checkout identity changed; preserved for review.');
 const pr=new URL(outcome.prUrl);
 if(pr.protocol!=='https:'||pr.hostname!=='github.com'||pr.username||pr.password||pr.search||pr.hash||
    !/^\/[^/]+\/[^/]+\/pull\/[1-9][0-9]*$/.test(pr.pathname)||pr.pathname.split('/').slice(1,3).join('/').toLowerCase()!==String(outcome.destinationRepo||'').toLowerCase())
  throw Error('PR identity could not be verified; temporary checkout preserved.');
 const dotGit=await fs.lstat(path.join(dir,'.git'));
 if(!dotGit.isDirectory()||dotGit.isSymbolicLink())throw Error('Temporary Git metadata changed; preserved for review.');
 const gitRoot=await git(['rev-parse','--show-toplevel'],dir);
 // Git for Windows prints forward slashes. Resolve the actual absolute path
 // without weakening the checkout identity and cleanliness guards.
 if(!path.isAbsolute(gitRoot)||await fs.realpath(gitRoot)!==dir||
    await git(['symbolic-ref','--quiet','--short','HEAD'],dir)!==outcome.branch||
    await git(['status','--porcelain','--untracked-files=all','--ignored'],dir))
  throw Error('Temporary checkout contains unexpected changes or files; preserved for review.');
 const latest=await fs.lstat(dir);
 if(latest.dev!==checkout.dev||latest.ino!==checkout.ino||latest.isSymbolicLink())throw Error('Temporary checkout changed during cleanup.');
 await fs.rm(dir,{recursive:true,force:false});
 return true;
}
function safeStoredRepo(input){
 if(typeof input!=='string')return null;
 try{
  const repo=repoCredentials.parseCredentialUrl(input);
  // No credential-bearing values are ever adopted from non-secret storage.
  return repo.token?null:repo;
 }catch{return null;}
}
let panel=null;
function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function workspaceHtml({nonce,version,cspSource}){
 const csp="default-src 'none'; img-src "+cspSource+" data:; style-src 'nonce-"+nonce+"'; script-src 'nonce-"+nonce+"'; form-action 'none'; connect-src 'none'";
 const html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="__CSP__">
<title>ATGV: Workspace</title>
<style nonce="__NONCE__">
:root{color-scheme:light dark;font:13px var(--vscode-font-family,system-ui)}
*{box-sizing:border-box}
body{margin:0;background:var(--vscode-editor-background,#202124);color:var(--vscode-foreground,#e8eaf0)}
header{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:21px clamp(16px,4vw,40px);background:var(--vscode-sideBar-background,#252933);border-bottom:1px solid var(--vscode-panel-border,#50535b)}
h1{font-size:23px;margin:0 0 5px}h2{font-size:15px;margin:0 0 10px}p{line-height:1.55}
.muted{color:var(--vscode-descriptionForeground,#afb5bd);font-size:12px}
main{max-width:1500px;margin:auto;padding:25px clamp(16px,4vw,40px) 45px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{min-width:0;padding:18px 20px;border:1px solid var(--vscode-panel-border,#50535b);border-radius:10px;background:var(--vscode-editorWidget-background,var(--vscode-editor-background,#25282d))}
.card.full{grid-column:1/-1}
label{font-weight:650;font-size:12px;display:block;margin:14px 0 6px}
input,select,textarea{width:100%;min-width:0;padding:10px;color:var(--vscode-input-foreground,var(--vscode-foreground));background:var(--vscode-input-background,#30343b);border:1px solid var(--vscode-input-border,var(--vscode-panel-border,#555));border-radius:5px;font:inherit}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--vscode-focusBorder,#6ab5ff);outline-offset:2px}
button{background:var(--vscode-button-background,#096db5);color:var(--vscode-button-foreground,#fff);border:0;border-radius:5px;min-height:37px;padding:10px 14px;font:inherit;cursor:pointer}
button.secondary{background:var(--vscode-button-secondaryBackground,#454c58);color:var(--vscode-button-secondaryForeground,#fff)}
button:hover:not(:disabled){filter:brightness(1.1)}button:disabled{opacity:.52;cursor:not-allowed}
.folder,.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
#destinationLabel,#library-destinationLabel,#project-destinationLabel{font-size:11px;font-weight:500;overflow-wrap:anywhere;min-width:0;flex:1}
.actions{margin:19px 0 13px}.note{line-height:1.55}
.connection-action{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
.connection-status{font-size:12px;color:var(--vscode-descriptionForeground,#afb5bd)}
.connection-status[data-state=success]{color:var(--vscode-testing-iconPassed,#49c18b)}
.connection-status[data-state=error]{color:var(--vscode-errorForeground,#e4787d)}
ol{line-height:1.85;padding-left:20px}
.status{min-height:49px;border:1px solid var(--vscode-panel-border,#50535b);border-radius:6px;padding:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}
.status[data-state=success]{border-color:var(--vscode-testing-iconPassed,#3aaf80)}
.status[data-state=error]{border-color:var(--vscode-errorForeground,#e4787d)}
#reviewPanel[hidden],#library-reviewPanel[hidden],#project-reviewPanel[hidden],#project-releaseQueueCard[hidden]{display:none}
#reviewPanel textarea,#library-reviewPanel textarea,#project-reviewPanel textarea{resize:vertical;min-height:82px}
#sourceAnalysis,#library-sourceAnalysis,#project-sourceAnalysis{white-space:pre-wrap;font-size:12px}
.review-help{margin:8px 0 15px}
.sync-profile{margin-bottom:28px}.sync-profile>h2{font-size:19px;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border,#50535b)}
@media(max-width:680px){.grid{grid-template-columns:1fr}.card.full{grid-column:auto}}
</style></head>
<body>
<header><div><h1>ATGV: Workspace</h1></div><div class="muted">AIATECH ASSIST v__VERSION__</div></header>
<main>
<form id="repoSyncForm"><div class="grid">
<section class="card"><h2>1. Source</h2>

<label for="sourceSavedRepos">Saved Source connections</label><select id="sourceSavedRepos" aria-label="Saved Source GitHub repositories"><option value="">+ Add another repository...</option></select>
<div class="connection-action"><button id="forgetSource" type="button" class="secondary" disabled>Forget selected</button></div>
<label for="sourceUrl">GitHub repository URL with PAT</label><input id="sourceUrl" type="password" required placeholder="https://USERNAME:TOKEN@github.com/OWNER/repo-a" autocomplete="off" spellcheck="false">
<div class="connection-action"><button id="testSource" type="button" class="secondary">Test Connection</button><span id="sourceConnection" class="connection-status" role="status" aria-live="polite">Not tested</span></div>
<label for="sourceBranch">Source branch (optional)</label><input id="sourceBranch" type="text" maxlength="110" placeholder="Auto: GitHub default branch, or choose another branch">
<label for="sourcePrNumber">Source PR number (optional)</label><input id="sourcePrNumber" type="number" min="1" step="1" placeholder="e.g. 2 · use original PR metadata as the initial suggestion">

<label for="copyScope">Copy scope</label><input id="copyScope" type="text" maxlength="280" value="." placeholder="src/components or .">

</section>
<section class="card"><h2>2. Destination</h2>

<label for="destinationSavedRepos">Saved Destination connections</label><select id="destinationSavedRepos" aria-label="Saved Destination GitHub repositories"><option value="">+ Add another repository...</option></select>
<div class="connection-action"><button id="forgetDestination" type="button" class="secondary" disabled>Forget selected</button></div>
<label for="destinationRepo">Destination GitHub URL with PAT</label><input id="destinationRepo" type="password" required placeholder="https://USERNAME:TOKEN@github.com/OWNER/repo-b" autocomplete="off" spellcheck="false">
<div class="connection-action"><button id="testDestination" type="button" class="secondary">Test Connection</button><span id="destinationConnection" class="connection-status" role="status" aria-live="polite">Not tested</span></div>
<label>Local Destination Git root or empty folder (outside ATGV workspace)</label>
<p class="muted">The folder is remembered for this repository pair. Empty folders use a temporary checkout removed after a successful PR. Existing Git checkouts and failed operations are preserved.</p><div class="folder"><button id="selectRepoB" type="button" class="secondary">Choose Destination folder</button><strong id="destinationLabel">No folder selected</strong></div>
<label for="baseBranch">Destination base branch</label><input id="baseBranch" type="text" maxlength="110" placeholder="GitHub default branch (auto)">

</section>
<section class="card full"><h2>3. Pull & Study Source</h2>

<div class="actions"><button id="createPr" type="submit">Pull & Study Source Code</button><button id="openPr" type="button" class="secondary" hidden disabled>Open Created PR</button></div>
<div id="syncStatus" class="status" role="status" aria-live="polite" data-state="ready">Paste username:PAT URLs, test both connections and select an existing Destination checkout or an empty external folder. Git is required; pull requests use GitHub HTTPS API with the Destination PAT. GitHub CLI (gh) is not needed.</div>
</section>
<section class="card full" id="reviewPanel" hidden aria-label="Review proposed source sync">
<h2>4. Review suggested Git and PR details</h2>

<div id="sourceAnalysis" class="status" role="status"></div>
<label for="reviewBranch">Destination branch name</label><input id="reviewBranch" type="text" maxlength="110">
<label for="reviewCommit">Commit message</label><textarea id="reviewCommit" rows="3" maxlength="12000"></textarea>
<label for="reviewTitle">PR title (for pull requests)</label><input id="reviewTitle" type="text" maxlength="110">
<label for="reviewDescription">PR description (for pull requests)</label><textarea id="reviewDescription" rows="4" maxlength="4000"></textarea>
<div class="actions"><button id="publishReviewed" type="button">Push & Create PR</button><button id="pushBranchOnly" type="button" class="secondary">Push Branch Only</button><button id="redoReview" type="button" class="secondary">Pull & Study Again</button></div>
</section>
<section class="card full" id="releaseQueueCard"><h2>5. Release Synchronization</h2><p class="muted">The latest available verified stable release is copied independently of source version. Missing or invalid releases do not block source sync. Previous managed artifacts are retained when no valid replacement exists. Destination GitHub Actions remain disabled.</p><div id="releaseQueueStatus" class="status" role="status" aria-live="polite">No queued release.</div><div class="actions"><button id="checkReleaseSync" type="button" class="secondary">Check Release Status</button></div></section></div></form>

</main>
<script nonce="__NONCE__">
'use strict';
const vscode=acquireVsCodeApi();
function initProfile(profile){
const get=id=>document.getElementById((profile==='extension'?'':profile+'-')+id);
const send=message=>vscode.postMessage({...message,profile});
let folder='',busy=false,createdPr='',reviewReady=false,publishedRelease='';
function invalidateReview(){
 if(!reviewReady)return;
 reviewReady=false;get('reviewPanel').hidden=true;buttons();
 show('Inputs changed. Pull & Study Source again to refresh the review. No Destination files were changed.');
}
function show(message,state){get('syncStatus').textContent=String(message||'');get('syncStatus').dataset.state=state||'ready';}
function buttons(){
 get('createPr').disabled=busy||!folder;
 get('publishReviewed').disabled=busy||!reviewReady;
 get('pushBranchOnly').disabled=busy||!reviewReady;
 get('redoReview').disabled=busy;
 get('selectRepoB').disabled=busy;
 get('testSource').disabled=busy;get('testDestination').disabled=busy;
 for(const kind of ['Source','Destination']){
  const select=get(kind==='Source'?'sourceSavedRepos':'destinationSavedRepos');
  select.disabled=busy;
  get(kind==='Source'?'forgetSource':'forgetDestination').disabled=busy||!select.value;
 }
 get('openPr').disabled=busy||!createdPr;get('openPr').hidden=!createdPr;
 get('checkReleaseSync').disabled=busy;
 get('repoSyncForm').setAttribute('aria-busy',String(busy));
}
function consumeUrl(id){
 const field=get(id),raw=field.value.trim();
 // Strip a credential-bearing URL immediately; retain only credential-free URL.
 try{
  const u=new URL(raw);
  field.value=u.protocol==='https:'&&u.hostname==='github.com'&&!u.search&&!u.hash?'https://github.com'+u.pathname:'';
 }catch{field.value='';}
 return raw;
}
const connectionNode=kind=>get(kind==='Source'?'sourceConnection':'destinationConnection');
const repoField=kind=>get(kind==='Source'?'sourceUrl':'destinationRepo');
const savedSelect=kind=>get(kind==='Source'?'sourceSavedRepos':'destinationSavedRepos');
function showSavedRepos(kind,entries){
 const select=savedSelect(kind),preferred=repoField(kind).value.trim()||select.value;
 select.replaceChildren();
 const add=document.createElement('option');add.value='';add.textContent='+ Add another repository...';select.append(add);
 for(const row of Array.isArray(entries)?entries:[]){
  let uri=null;
  try{uri=new URL(String(row?.safeUrl||''));}catch{continue;}
  if(uri.protocol!=='https:'||uri.hostname!=='github.com'||uri.username||uri.password||uri.port||uri.search||uri.hash||uri.pathname.split('/').filter(Boolean).length!==2)continue;
  const option=document.createElement('option');option.value=row.safeUrl;
  option.textContent=String(row.repo||row.safeUrl)+(row.credentialSaved?' · PAT saved':' · PAT required');
  select.append(option);
 }
 select.value=[...select.options].some(item=>item.value===preferred)?preferred:'';
 buttons();
}
function selectSavedRepo(kind){
 invalidateReview();
 const selection=savedSelect(kind).value;
 repoField(kind).value=selection;
 if(selection)send({command:'selectSavedRepo',kind,url:selection});
 const node=connectionNode(kind);
 node.textContent=selection?'Saved repository selected · Test to verify permissions':'New connection · Enter GitHub URL and PAT';
 node.dataset.state='ready';
 buttons();
}
for(const kind of ['Source','Destination']){
 savedSelect(kind).addEventListener('change',()=>selectSavedRepo(kind));
 get(kind==='Source'?'forgetSource':'forgetDestination').addEventListener('click',()=>{
  if(busy||!savedSelect(kind).value)return;
  busy=true;buttons();
  send({command:'forgetRepoConnection',kind,url:savedSelect(kind).value});
 });
}
function testRepository(kind){
 if(busy)return;
 invalidateReview();
 const raw=consumeUrl(kind==='Source'?'sourceUrl':'destinationRepo');
 busy=true;buttons();
 const node=connectionNode(kind);node.textContent='Testing GitHub permissions…';node.dataset.state='ready';
 send({command:'testRepoConnection',kind,url:raw});
}
get('testSource').addEventListener('click',()=>testRepository('Source'));
get('testDestination').addEventListener('click',()=>testRepository('Destination'));
for(const id of ['sourceUrl','sourceBranch','sourcePrNumber','destinationRepo','copyScope','baseBranch'])
 get(id).addEventListener('input',invalidateReview);
for(const id of ['sourceUrl','destinationRepo'])get(id).addEventListener('input',()=>{
 const kind=id==='sourceUrl'?'Source':'Destination';
 const node=connectionNode(kind);node.textContent='Not tested';node.dataset.state='ready';
 const select=savedSelect(kind);const value=get(id).value.trim();
 select.value=[...select.options].some(item=>item.value===value)?value:'';buttons();
});
get('selectRepoB').addEventListener('click',()=>{invalidateReview();send({command:'selectRepoB'});});
get('repoSyncForm').addEventListener('submit',e=>{
 e.preventDefault();
 if(busy||!folder||!get('repoSyncForm').reportValidity())return;
 busy=true;createdPr='';reviewReady=false;get('reviewPanel').hidden=true;buttons();show('Cloning and studying Source; Destination stays untouched.');
 send({command:'prepareSyncReview',sourceUrl:consumeUrl('sourceUrl'),sourceBranch:get('sourceBranch').value.trim(),sourcePrNumber:get('sourcePrNumber').value.trim(),destinationUrl:consumeUrl('destinationRepo'),copyScope:get('copyScope').value.trim()||'.',baseBranch:get('baseBranch').value.trim()});
});
function publishReviewed(branchOnly){
 if(busy||!reviewReady)return;
 const fields=branchOnly?['reviewBranch','reviewCommit']:['reviewBranch','reviewCommit','reviewTitle','reviewDescription'];
 if(!fields.every(id=>get(id).value.trim()&&get(id).reportValidity())){
  show(branchOnly?'Enter a branch and commit message before pushing.':'Enter a branch, commit message, PR title and PR description before publishing.','error');return;
 }
 busy=true;buttons();show('Confirm final publication in VS Code. Source SHA is pinned to your review.');
 send({command:'publishReviewedSync',branchOnly,branch:get('reviewBranch').value.trim(),
  commitMessage:get('reviewCommit').value.trim(),prTitle:get('reviewTitle').value.trim(),
  prDescription:get('reviewDescription').value.trim()});
}
get('publishReviewed').addEventListener('click',()=>publishReviewed(false));
get('pushBranchOnly').addEventListener('click',()=>publishReviewed(true));
get('redoReview').addEventListener('click',()=>get('repoSyncForm').requestSubmit());
get('openPr').addEventListener('click',()=>{if(createdPr)send({command:'openCreatedPr'});});
get('checkReleaseSync').addEventListener('click',()=>send({command:'checkReleaseSync'}));
window.addEventListener('message',e=>{
 const data=e.data||{};
 if(data.type==='releaseQueueStatus'&&profile==='project')return;
 if(data.type!=='releaseQueueStatus'&&(data.profile||'extension')!==profile)return;
 if(data.type==='repoSyncSavedList')showSavedRepos(data.kind,data.entries);
 if(data.type==='repoSyncSaved'){
  const id=data.kind==='Source'?'sourceUrl':'destinationRepo';
  if(data.safeUrl){
   get(id).value=String(data.safeUrl);
   const select=savedSelect(data.kind);
   if([...select.options].some(item=>item.value===data.safeUrl))select.value=data.safeUrl;
  }
  const node=connectionNode(data.kind);
  node.textContent=data.credentialSaved
   ?'Saved · '+String(data.repo||'repository')+' · PAT available in VS Code SecretStorage'
   :'Saved · '+String(data.repo||'repository')+' · PAT required';
  // A saved credential is not proof of a currently live connection.
  node.dataset.state='ready';
 }
 if(data.type==='repoBSelected'){folder=String(data.folder||'');get('destinationLabel').textContent=folder||'No folder selected';buttons();}
 if(data.type==='repoSyncFolderUnavailable'){
  folder='';get('destinationLabel').textContent='Saved folder unavailable · choose again';
  buttons();show(data.message||'Previously selected folder is unavailable. Choose another folder.','error');
 }
 if(data.type==='repoSyncProgress')show(data.message||'Synchronising…');
 if(data.type==='sourceReviewReady'){
  busy=false;reviewReady=true;createdPr='';get('reviewPanel').hidden=false;
  const review=data.review||{};
  get('reviewBranch').value=review.branch||'';
  get('reviewCommit').value=review.commitMessage||'';
  get('reviewTitle').value=review.prTitle||'';
  get('reviewDescription').value=review.prDescription||'';
  const analysis=review.sourceCode||{};
  get('sourceAnalysis').textContent='Source: '+String(review.sourceRepo||'')+' / '+String(review.sourceBranch||'')+
   ' @ '+String(review.sourceSha||'').slice(0,12)+'\\nFiles inspected: '+String(review.fileCount||0)+
   '\\nSource files: '+(analysis.keyFiles||[]).slice(0,8).join(', ')+
   '\\nSymbols inspected: '+(analysis.symbols||[]).slice(0,8).map(x=>x.name).join(', ')+
   '\\nDependencies: '+(analysis.dependencies||[]).slice(0,12).join(', ')+
   '\\nExcluded from copy: .github/ and GitHub Action manifests.'+
   '\\nExcluded commit paths: '+(review.excludedSourceCommitFiles||[]).slice(0,8).join(', ')+
   '\\nDestination base: '+String(review.base||'');
  get('sourceAnalysis').textContent +=
   '\\nCopied code version: '+String(review.codeVersion||'Not declared')+
   '\\nLatest published release: '+String(review.release?.tag||'None published')+
   '\\nRelease assets to include: '+String(review.release?.assets?.length||0)+
   (review.release?.assets?.length?' ('+review.release.assets.slice(0,8).map(a=>a.name).join(', ')+')':'')+
   (review.release?.skippedAssetCount?'\\nSkipped oversized or unsupported assets: '+review.release.skippedAssetCount:'')+
   (review.releaseNotice?'\\n'+review.releaseNotice:'')+
   (review.release?.targetCommitish&&review.release.targetCommitish!==review.sourceSha
    ?'\\nNote: latest release targets a different commit; both revisions will be recorded.':'');
  buttons();show('Source study completed. Review or edit the four suggestions, then approve the full operation. Destination is unchanged.','success');
 }
 if(data.type==='repoConnectionResult'){
  const id=data.kind==='Source'?'sourceUrl':'destinationRepo',node=connectionNode(data.kind);
  if(data.safeUrl){
   get(id).value=String(data.safeUrl);
   const select=savedSelect(data.kind);
   if([...select.options].some(item=>item.value===data.safeUrl))select.value=data.safeUrl;
  }
  node.textContent=String(data.message||'Connection test finished.');node.dataset.state=data.success?'success':'error';
  if(!data.duringSync){busy=false;buttons();}
 }
 if(data.type==='repoSyncForgot'){
  const kind=data.kind,field=repoField(kind);
  if(field.value===data.safeUrl){field.value='';savedSelect(kind).value='';}
  const node=connectionNode(kind);node.textContent='Saved connection forgotten';node.dataset.state='ready';
 }
 if(data.type==='repoSyncForgetResult'){
  busy=false;buttons();show(data.message||'Saved connection action finished.',data.success?'success':'ready');
 }
 if(data.type==='releaseQueueStatus'){const items=Array.isArray(data.items)?data.items:[];get('releaseQueueStatus').textContent=items.length?items.slice(-10).map(x=>x.destination+' #'+x.prNumber+' · '+x.tag+' · '+x.status+(x.detail?' — '+x.detail:'')+(x.url?' — '+x.url:'')).join('\\n'):'No queued release.';}
 if(data.type==='repoSyncResult'){busy=false;createdPr=data.success?String(data.prUrl||''):'';if(data.success){reviewReady=false;get('reviewPanel').hidden=true;}buttons();show(data.message||'Sync finished.',data.success?'success':'error');}
});
buttons();
send({command:'getRepoSyncSaved'});
}
initProfile('extension');initProfile('library');initProfile('project');
</script></body></html>`;
 const form=html.match(/<form id="repoSyncForm">[\s\S]*?<\/form>/)?.[0];
 if(!form)throw Error('Workspace sync form is unavailable.');
 const library=form.replace(/\b(id|for)="([^"]+)"/g,(_match,attr,id)=>attr+'="library-'+id+'"');
 const project=form.replace(/\b(id|for)="([^"]+)"/g,(_match,attr,id)=>attr+'="project-'+id+'"').replace('id="project-releaseQueueCard"','id="project-releaseQueueCard" hidden');
 const profiles=html.replace(form,'<section class="sync-profile"><h2>ATGV Extension</h2>'+form+'</section><section class="sync-profile"><h2>SDLC Library</h2>'+library+'</section><section class="sync-profile"><h2>Project Repository</h2>'+project+'</section>');
 return profiles.replaceAll('__CSP__',escapeHtml(csp).replaceAll('&#39;',"'")).replaceAll('__NONCE__',escapeHtml(nonce)).replaceAll('__VERSION__',escapeHtml(version));
}
function open(vscode,{version='0.0.0',onLog=()=>{},secrets=null,preferences=null,workspaceRoot='',describePr=async()=>'',planSync=async()=>null,testConnection=repoCredentials.verifyConnection,onWorkflowEvent=async()=>null}={}){
 if(panel){panel.reveal();return panel;}
 const current=vscode.window.createWebviewPanel('atgvAssist.workspace','ATGV: Workspace',vscode.ViewColumn.One,{enableScripts:true,retainContextWhenHidden:true});
 panel=current;
 let busy=false;
 const broadcast=async data=>{if(panel===current)await current.webview.postMessage(data);};
 releasePanelPost=broadcast;
 current.onDidDispose(()=>{if(panel===current){panel=null;releasePanelPost=null;}});
 function createProfile(profile){
 const urlKeys=Object.fromEntries(Object.entries(SAVED_URL_KEYS).map(([kind,key])=>[kind,profileKey(key,profile)]));
 const listKeys=Object.fromEntries(Object.entries(SAVED_LIST_KEYS).map(([kind,key])=>[kind,profileKey(key,profile)]));
 const folderKey=profileKey(SAVED_FOLDER_KEY,profile);
 let selectedFolder='',createdPr='',pendingReview=null;
 async function eligibleFolder(candidate){
  if(typeof candidate!=='string'||!path.isAbsolute(candidate))return '';
  const stat=await fs.lstat(candidate).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(!stat?.isDirectory()||stat.isSymbolicLink())return '';
  const resolved=await fs.realpath(candidate);
  if(workspaceRoot){
   const workspace=await fs.realpath(workspaceRoot).catch(()=>null);
   if(workspace&&(resolved===workspace||resolved.startsWith(workspace+path.sep)||
     workspace.startsWith(resolved+path.sep)))return '';
  }
  return resolved;
 }
 async function restoreSelectedFolder(){
  const stored=preferences?.get?.(folderKey,'');
  if(!stored)return;
  const resolved=await eligibleFolder(stored);
  if(!resolved){
   await post({type:'repoSyncFolderUnavailable',message:'Saved Destination folder is missing, invalid or overlaps ATGV. Choose a new folder.'});
   return;
  }
  selectedFolder=resolved;
  await post({type:'repoBSelected',folder:selectedFolder});
 }
 async function rememberSelectedFolder(folder){
  if(preferences?.update)await preferences.update(folderKey,folder);
 }
 const patKey=(kind,repo)=>'atgvAssist.repoSync.'+kind+'.'+crypto.createHash('sha256').update(repo.name.toLowerCase()).digest('hex');
 function knownRepos(kind){
  const previous=preferences?.get?.(urlKeys[kind],'');
  const raw=preferences?.get?.(listKeys[kind],[]);
  const values=[...(Array.isArray(raw)?raw:[]),previous,...(kind==='Source'&&profile==='library'&&preferences?.get?.(listKeys[kind],null)===null?[LIBRARY_SOURCE]:[])];
  const unique=[],seen=new Set();
  for(const value of values){
   const repo=safeStoredRepo(value);
   if(!repo||seen.has(repo.name.toLowerCase()))continue;
   unique.push(repo);seen.add(repo.name.toLowerCase());
   if(unique.length>=MAX_SAVED_REPOS)break;
  }
  return unique;
 }
 async function postSavedRepos(kind){
  const entries=[];
  for(const repo of knownRepos(kind)){
   entries.push({safeUrl:repo.webUrl,repo:repo.name,credentialSaved:!!(await secrets?.get?.(patKey(kind,repo)))});
  }
  await post({type:'repoSyncSavedList',kind,entries});
 }
 async function rememberRepo(kind,repo){
  // GlobalState stores URL metadata only; tokens remain independently in SecretStorage.
  if(!preferences?.update)return;
  const list=[repo,...knownRepos(kind).filter(item=>item.name.toLowerCase()!==repo.name.toLowerCase())].slice(0,MAX_SAVED_REPOS);
  await preferences.update(listKeys[kind],list.map(item=>item.webUrl));
  await preferences.update(urlKeys[kind],repo.webUrl);
  await postSavedRepos(kind);
 }
 async function restoreRepos(){
  for(const kind of ['Source','Destination']){
   await postSavedRepos(kind);
   const repo=safeStoredRepo(preferences?.get?.(urlKeys[kind],''))||(kind==='Source'&&profile==='library'&&preferences?.get?.(listKeys[kind],null)===null?safeStoredRepo(LIBRARY_SOURCE):null);
   if(!repo)continue;
   const credentialSaved=!!(await secrets?.get?.(patKey(kind,repo)));
   await post({type:'repoSyncSaved',kind,safeUrl:repo.webUrl,repo:repo.name,credentialSaved});
  }
 }
 async function forgetRepo(kind,input){
  if(!['Source','Destination'].includes(kind))throw Error('Unknown saved connection type.');
  const repo=safeStoredRepo(input);
  if(!repo||!knownRepos(kind).some(item=>item.name.toLowerCase()===repo.name.toLowerCase()))
   throw Error('Saved repository was not found.');
  if(!secrets?.delete||!preferences?.update)
   throw Error('SecretStorage deletion and VS Code globalState are required to forget a repository.');
  // Fail closed on secret deletion; never pretend a saved credential was forgotten.
  const usedElsewhere=PROFILES.filter(other=>other!==profile).some(other=>{
   const otherList=preferences?.get?.(profileKey(SAVED_LIST_KEYS[kind],other),[]);
   const otherLast=preferences?.get?.(profileKey(SAVED_URL_KEYS[kind],other),'');
   return [...(Array.isArray(otherList)?otherList:[]),otherLast].some(value=>safeStoredRepo(value)?.name.toLowerCase()===repo.name.toLowerCase());
  });
  if(!usedElsewhere)await secrets.delete(patKey(kind,repo));
  const remaining=knownRepos(kind).filter(item=>item.name.toLowerCase()!==repo.name.toLowerCase());
  await preferences.update(listKeys[kind],remaining.map(item=>item.webUrl));
  const last=preferences?.get?.(urlKeys[kind],'');
  if(safeStoredRepo(last)?.name.toLowerCase()===repo.name.toLowerCase())
   await preferences.update(urlKeys[kind],remaining[0]?.webUrl||'');
  await postSavedRepos(kind);
  await post({type:'repoSyncForgot',kind,safeUrl:repo.webUrl});
 }
 async function readPat(kind,repo){
  if(!secrets?.get||!secrets?.store)throw Error('VS Code SecretStorage is required to protect GitHub PATs.');
  const key=patKey(kind,repo),saved=repo.token?null:await secrets.get(key);
  let token=repo.token||saved;
  if(!token){
   token=await vscode.window.showInputBox({title:'GitHub '+kind+' PAT',prompt:'Enter the PAT for '+repo.name+'. ATGV stores it encrypted only after a successful access test.',password:true,ignoreFocusOut:true,validateInput:value=>value&&value.trim().length>=20?null:'Enter a PAT of at least 20 characters.'});
   if(!token)throw Error(kind+' PAT entry was cancelled. Nothing was copied.');
  }
  return {key,token:String(token).trim(),save:!saved||!!repo.token};
 }
 async function verifiedPat(kind,repo){
  const credentials=await readPat(kind,repo);
  const access=await testConnection(repo,credentials.token,kind);
  if(credentials.save)await secrets.store(credentials.key,credentials.token);
  return {...credentials,access};
 }
 const post=async data=>broadcast({...data,profile});
 const sanitize=(error,tokens=[])=>{
  let message=String(error?.message||error);
  for(const token of tokens)if(token)message=message.split(token).join('[REDACTED]');
  return message.slice(0,550);
 };
 return async message=>{
  if(!message||typeof message.command!=='string')return;
  if(message.command==='getRepoSyncSaved'){
   try{await restoreRepos();await restoreSelectedFolder();await post({type:'releaseQueueStatus',items:releaseQueue?.rows()||[]});}
   catch(error){onLog('Repo Sync saved connection and folder restore: '+sanitize(error));}
   return;
  }
  if(message.command==='selectSavedRepo'){
   if(busy)return;
   const kind=message.kind,repo=safeStoredRepo(message.url);
   if(['Source','Destination'].includes(kind)&&repo&&knownRepos(kind).some(item=>item.name.toLowerCase()===repo.name.toLowerCase())){
    pendingReview=null;
    await preferences?.update?.(urlKeys[kind],repo.webUrl);
   }
   return;
  }
  if(message.command==='forgetRepoConnection'){
   const kind=message.kind;let repo=null;
   if(busy){await post({type:'repoSyncForgetResult',kind,success:false,message:'A repository operation is already running.'});return;}
   busy=true;
   try{
    repo=safeStoredRepo(message.url);
    if(!repo)throw Error('Select a saved repository to forget.');
    const confirmed=await vscode.window.showWarningMessage('Forget the saved '+kind+' connection for '+repo.name+'? The stored PAT for this role will be deleted.',{modal:true},'Forget Connection');
    if(confirmed!=='Forget Connection'){
     await post({type:'repoSyncForgetResult',kind,success:false,message:'Cancelled. Saved connection unchanged.'});
     return;
    }
    await forgetRepo(kind,repo.webUrl);
    await post({type:'repoSyncForgetResult',kind,success:true,message:'Saved '+kind+' connection forgotten.'});
   }catch(error){
    await post({type:'repoSyncForgetResult',kind,success:false,message:sanitize(error,[repo?.token])});
   }finally{busy=false;}
   return;
  }
  if(message.command==='selectRepoB'){
   if(busy){await post({type:'repoSyncResult',success:false,message:'A repository operation is already running.'});return;}
   busy=true;
   try{
    const picked=await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'Select Destination Git root',title:'ATGV Workspace: Choose Destination Git root or an empty folder'});
    if(picked?.[0]){
     const resolved=await eligibleFolder(picked[0].fsPath);
     if(!resolved)throw Error('Choose an existing real folder outside ATGV workspace; symbolic links are not supported.');
     selectedFolder=resolved;pendingReview=null;
     await rememberSelectedFolder(selectedFolder);
     await post({type:'repoBSelected',folder:selectedFolder});
    }
   }catch(error){await post({type:'repoSyncResult',success:false,message:sanitize(error)});}
   finally{busy=false;}
   return;
  }
  if(message.command==='openCreatedPr'){if(createdPr)await vscode.env.openExternal(vscode.Uri.parse(createdPr));return;}
  if(message.command==='checkReleaseSync'){
   if(profile==='project')return;
   try{
    if(!releaseQueue)throw Error('Automatic release service is unavailable.');
    await releaseQueue.tick();
    await post({type:'releaseQueueStatus',items:releaseQueue.rows()});
   }catch(error){await post({type:'releaseQueueStatus',items:[{destination:'Release service',prNumber:'',tag:'',status:'retry',detail:sanitize(error)}]});}
   return;
  }
  if(message.command==='testRepoConnection'){
   const kind=message.kind;
   if(busy){await post({type:'repoConnectionResult',kind,success:false,message:'A repository operation is already running.'});return;}
   busy=true;let parsed=null,token='';
   try{
    if(!['Source','Destination'].includes(kind))throw Error('Select Source or Destination.');
    parsed=repoCredentials.parseCredentialUrl(message.url);
    pendingReview=null;
    const credentials=await verifiedPat(kind,parsed);token=credentials.token;
    await rememberRepo(kind,parsed);
    await post({type:'repoConnectionResult',kind,success:true,safeUrl:parsed.webUrl,message:'Connected · '+parsed.name+' · '+(kind==='Source'?'read':'write')+' access verified'});
   }catch(error){
    const reason=sanitize(error,[token,parsed?.token]);onLog('Repo '+String(kind||'')+' connection test: '+reason);
    await post({type:'repoConnectionResult',kind,success:false,safeUrl:parsed?.webUrl||'',message:reason});
   }finally{busy=false;}
   return;
  }
  const isPrepare=message.command==='prepareSyncReview';
  const isPublish=message.command==='publishReviewedSync';
  const branchOnly=isPublish&&message.branchOnly===true;
  if(!isPrepare&&!isPublish&&message.command!=='createSyncPr')return;
  if(busy){await post({type:'repoSyncResult',success:false,message:'A repository operation is already running.'});return;}
  busy=true;createdPr='';
  if(isPrepare)pendingReview=null;
  let sourcePat='',destPat='',source=null,destination=null;
  let workflowJobId=null,workflowFailure=null;
  try{
   if(!selectedFolder)throw Error('Choose a Destination Git folder outside ATGV workspace first.');
   if(isPublish&&(!pendingReview||pendingReview.folder!==selectedFolder))
    throw Error('Pull & Study Source before publishing. The destination folder or source review changed.');
   const input=isPublish?pendingReview.input:message;
   source=repoCredentials.parseCredentialUrl(input.sourceUrl);
   destination=repoCredentials.parseCredentialUrl(input.destinationUrl);
   const scope=repoSync.scopeName(input.copyScope||'.');
   const sourceBranch=input.sourceBranch?repoSync.baseName(input.sourceBranch):'';
   const sourcePrNumber=input.sourcePrNumber?String(input.sourcePrNumber).trim():'';
   if(sourcePrNumber&&(!/^[1-9][0-9]*$/.test(sourcePrNumber)||Number(sourcePrNumber)>1000000000))
    throw Error('Enter a valid positive source PR number.');
   const base=input.baseBranch?repoSync.baseName(input.baseBranch):'';
   const reviewed=isPublish?{...pendingReview.review,branch:message.branch,
    commitMessage:message.commitMessage,prTitle:message.prTitle,
    prDescription:message.prDescription}:null;
   if(reviewed)repoSync.validateReviewPresentation(reviewed,reviewed.sourceSha,{branchOnly});
   let distribution=false;try{releasePublisher.pairFor(source,destination);distribution=true;}catch{}
   if(profile==='project'&&distribution)throw Error('Use the ATGV Extension or SDLC Library section for official release distribution.');
   const confirmAction=branchOnly?'Push Branch Only':isPublish?'Publish Reviewed PR':'Create Sync PR';
   const response=isPrepare?'Prepare Source Review':await vscode.window.showWarningMessage(
    'Source: '+source.name+' ('+(sourcePrNumber?'PR #'+sourcePrNumber:sourceBranch||'GitHub default branch (auto)')+')\nDestination: '+destination.name+' in '+selectedFolder+
    '\nScope: '+scope+'\nDestination base: '+(base||'GitHub default branch')+
    (branchOnly?'\n\nCommit and push the reviewed changes to '+reviewed.branch+' without creating a pull request?':
     isPublish?'\n\nPublish the reviewed branch, commit message, PR title and description?':'\n\nVerify both PATs, clone to temp and create the PR?'),
    {modal:true,detail:distribution&&!branchOnly?'Includes the latest matching stable release in the same PR and authorizes automatic verified release publication after merge.':''},confirmAction);
   if(response!==(isPrepare?'Prepare Source Review':confirmAction)){
    await post({type:'repoSyncResult',success:false,message:'Cancelled. No files were changed.'});return;
   }
   try{
    // Source and destination fingerprints only; credentials and URLs are never
    // written to the persistent Workflow Jobs journal.
    const inputHash=crypto.createHash('sha256').update(JSON.stringify({
     source:source.name,destination:destination.name,scope,sourceBranch,sourcePrNumber,base,prepare:isPrepare,branchOnly
    })).digest('hex');
    workflowJobId=await onWorkflowEvent({type:'begin',
     command:isPrepare?'workspacePrepareSync':'workspacePublishSync',inputHash})||null;
   }catch(error){onLog('ATGV Workspace journal unavailable: '+String(error.message||error).slice(0,160));}
   await post({type:'repoSyncProgress',message:'Testing both GitHub PAT permissions…'});
   const sourceCredentials=await verifiedPat('Source',source);sourcePat=sourceCredentials.token;
   await rememberRepo('Source',source);
   await post({type:'repoConnectionResult',kind:'Source',duringSync:true,success:true,safeUrl:source.webUrl,message:'Connected · '+source.name+' · read access verified'});
   const destinationCredentials=await verifiedPat('Destination',destination);destPat=destinationCredentials.token;
   await rememberRepo('Destination',destination);
   await post({type:'repoConnectionResult',kind:'Destination',duringSync:true,success:true,safeUrl:destination.webUrl,message:'Connected · '+destination.name+' · write access verified'});
   let checkout=null;
   if(!isPrepare)checkout=await managedCheckout(selectedFolder);
   if(checkout)await post({type:'repoSyncProgress',message:'Temporary destination checkout: '+checkout.dir});
   let outcome;
   try{outcome=await repoSync.sync({
    sourceUrl:source.url,sourceBranch,sourcePrNumber,destinationFolder:checkout?.dir||selectedFolder,copyScope:scope,baseBranch:base,
    sourcePat,destPat,workspaceRoot,destinationUrl:destination.url,
    planSync,describePr,previewOnly:isPrepare,approvedReview:reviewed,branchOnly,
    onProgress:async event=>{
     await post({type:'repoSyncProgress',stage:event.stage,message:event.message});
     if(workflowJobId)try{await onWorkflowEvent({type:'stage',jobId:workflowJobId,stage:event.stage||'processing'});}
      catch(error){onLog('ATGV Workspace stage journal: '+String(error.message||error).slice(0,160));}
    }
   });}catch(error){throw Error(String(error.message||error)+(checkout?' Temporary checkout retained at '+checkout.dir:''));}
   if(isPrepare){
    if(!outcome.preview||!outcome.review)throw Error('No source review generated.');
    pendingReview={folder:selectedFolder,input:{
     sourceUrl:source.webUrl,destinationUrl:destination.webUrl,sourceBranch,sourcePrNumber,
     copyScope:scope,baseBranch:base
    },review:outcome.review};
    await post({type:'sourceReviewReady',review:outcome.review});
    return;
   }
   pendingReview=null;
   createdPr=outcome.prUrl||'';
   let releaseNotice='';
   if(distribution&&!branchOnly&&createdPr&&outcome.releaseTag){
    try{
     if(!releaseQueue)throw Error('Release queue is unavailable.');
     const prNumber=Number(new URL(createdPr).pathname.split('/').pop());
     await releaseQueue.enqueue({source,destination,prNumber,tag:outcome.releaseTag});
     releaseNotice='\nRelease queued for automatic publication after merge.';
    }catch(error){releaseNotice='\nPR was created, but automatic release queue failed: '+sanitize(error,[sourcePat,destPat]);}
   }
   const summary=outcome.unchanged?outcome.message:
    (branchOnly?'Branch pushed: '+outcome.branch:'PR created: '+outcome.prUrl)+'\nSource: '+outcome.sourceRepo+' / '+outcome.sourceBranch+' @ '+outcome.sourceSha+
    '\nDestination: '+outcome.destinationRepo+'/'+outcome.base+
    '\nBranch: '+outcome.branch+'\nFiles selected: '+outcome.fileCount;
   let cleanupNotice='';
   if(checkout){
    if(createdPr&&!branchOnly&&!outcome.unchanged){
     try{if(await cleanManagedCheckout(checkout,outcome))cleanupNotice='\nTemporary checkout removed. Selected folder retained for the next sync.';}
     catch(error){cleanupNotice='\nPR created; cleanup skipped: '+sanitize(error)+' · '+checkout.dir;}
    }else cleanupNotice='\nTemporary checkout preserved: '+checkout.dir;
   }else if(createdPr)cleanupNotice='\nExisting destination checkout preserved.';
   const enrichedSummary=summary+'\\nCopied code version: '+(outcome.codeVersion||'Not declared')+
    '\\nLatest published release: '+(outcome.releaseTag||'None published')+
    '\\nRelease assets included: '+String(outcome.releaseAssetCount||0)+
    '\\nRelease artifact paths: '+(outcome.releaseArtifactPaths||[]).join(', ')+(outcome.releaseNotice?'\n'+outcome.releaseNotice:'');
   await post({type:'repoSyncResult',success:true,prUrl:createdPr,releaseTag:outcome.releaseTag||'',message:enrichedSummary+releaseNotice+cleanupNotice});
   onLog('Repo Sync: '+summary);
  }catch(error){
   workflowFailure=error;
   const reason=sanitize(error,[sourcePat,destPat,source?.token,destination?.token]);
   onLog('Repo Sync failed: '+reason);
   await post({type:'repoSyncResult',success:false,message:reason});
  }finally{
   if(workflowJobId)try{await onWorkflowEvent({type:'finish',jobId:workflowJobId,error:workflowFailure});}
    catch(error){onLog('ATGV Workspace finish journal: '+String(error.message||error).slice(0,160));}
   busy=false;
  }
 };
 }
 const handlers=Object.fromEntries(PROFILES.map(profile=>[profile,createProfile(profile)]));
 current.webview.onDidReceiveMessage(message=>{const profile=message?.profile||'extension';if(PROFILES.includes(profile))return handlers[profile](message);});
 current.webview.html=workspaceHtml({nonce:crypto.randomBytes(18).toString('base64'),version,cspSource:current.webview.cspSource});
 return current;
}
module.exports={open,workspaceHtml,startReleaseSync,profileKey,managedCheckout,cleanManagedCheckout};
