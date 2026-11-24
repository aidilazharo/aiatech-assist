'use strict';
// Independent ATGV: Workspace webview for Source main -> Destination pull request.
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const repoSync=require('./repo-sync-pr');
const repoCredentials=require('./repo-sync-credentials');
const releasePublisher=require('./repo-sync-release-publisher');
const SAVED_URL_KEYS=Object.freeze({Source:'atgvAssist.repoSync.lastSourceUrl',Destination:'atgvAssist.repoSync.lastDestinationUrl'});
const SAVED_LIST_KEYS=Object.freeze({Source:'atgvAssist.repoSync.savedSourceUrls',Destination:'atgvAssist.repoSync.savedDestinationUrls'});
const MAX_SAVED_REPOS=30;
const SAVED_FOLDER_KEY='atgvAssist.repoSync.lastDestinationFolder';
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
main{max-width:980px;margin:auto;padding:25px clamp(16px,4vw,40px) 45px}
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
#destinationLabel{font-size:11px;font-weight:500;overflow-wrap:anywhere;min-width:0;flex:1}
.actions{margin:19px 0 13px}.note{line-height:1.55}
.connection-action{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
.connection-status{font-size:12px;color:var(--vscode-descriptionForeground,#afb5bd)}
.connection-status[data-state=success]{color:var(--vscode-testing-iconPassed,#49c18b)}
.connection-status[data-state=error]{color:var(--vscode-errorForeground,#e4787d)}
ol{line-height:1.85;padding-left:20px}
.status{min-height:49px;border:1px solid var(--vscode-panel-border,#50535b);border-radius:6px;padding:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}
.status[data-state=success]{border-color:var(--vscode-testing-iconPassed,#3aaf80)}
.status[data-state=error]{border-color:var(--vscode-errorForeground,#e4787d)}
#reviewPanel[hidden]{display:none}
#reviewPanel textarea{resize:vertical;min-height:82px}
#sourceAnalysis{white-space:pre-wrap;font-size:12px}
.review-help{margin:8px 0 15px}
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
<p class="muted">The selected folder is remembered across VS Code restarts. If the folder moves, choose it again.</p><div class="folder"><button id="selectRepoB" type="button" class="secondary">Choose Destination folder</button><strong id="destinationLabel">No folder selected</strong></div>
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
<section class="card full"><h2>5. Publish Merged Release</h2><p class="muted">After the destination PR is merged into main, verify the source release and publish its assets directly through GitHub Releases. GitHub Actions remain disabled. Use the same Source and Destination connections.</p><label for="releasePrNumber">Destination PR number</label><input id="releasePrNumber" type="number" min="1" max="1000000000" step="1"><label for="releaseTag">Exact source release tag</label><input id="releaseTag" maxlength="180" placeholder="v0.0.84-build.123 or v0.0.8-source-build.38"><div class="actions"><button id="publishMergedRelease" type="button">Publish Merged Release</button><button id="openPublishedRelease" type="button" class="secondary" hidden disabled>Open Published Release</button></div></section></div></form>

</main>
<script nonce="__NONCE__">
'use strict';
const vscode=acquireVsCodeApi();
const get=id=>document.getElementById(id);
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
 get('publishMergedRelease').disabled=busy||!get('releasePrNumber').value||!get('releaseTag').value.trim();
 get('openPublishedRelease').hidden=!publishedRelease;get('openPublishedRelease').disabled=busy||!publishedRelease;
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
  vscode.postMessage({command:'forgetRepoConnection',kind,url:savedSelect(kind).value});
 });
}
function testRepository(kind){
 if(busy)return;
 invalidateReview();
 const raw=consumeUrl(kind==='Source'?'sourceUrl':'destinationRepo');
 busy=true;buttons();
 const node=connectionNode(kind);node.textContent='Testing GitHub permissions…';node.dataset.state='ready';
 vscode.postMessage({command:'testRepoConnection',kind,url:raw});
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
get('selectRepoB').addEventListener('click',()=>{invalidateReview();vscode.postMessage({command:'selectRepoB'});});
get('repoSyncForm').addEventListener('submit',e=>{
 e.preventDefault();
 if(busy||!folder||!get('repoSyncForm').reportValidity())return;
 busy=true;createdPr='';reviewReady=false;get('reviewPanel').hidden=true;buttons();show('Cloning and studying Source; Destination stays untouched.');
 vscode.postMessage({command:'prepareSyncReview',sourceUrl:consumeUrl('sourceUrl'),sourceBranch:get('sourceBranch').value.trim(),sourcePrNumber:get('sourcePrNumber').value.trim(),destinationUrl:consumeUrl('destinationRepo'),copyScope:get('copyScope').value.trim()||'.',baseBranch:get('baseBranch').value.trim()});
});
function publishReviewed(branchOnly){
 if(busy||!reviewReady)return;
 const fields=branchOnly?['reviewBranch','reviewCommit']:['reviewBranch','reviewCommit','reviewTitle','reviewDescription'];
 if(!fields.every(id=>get(id).value.trim()&&get(id).reportValidity())){
  show(branchOnly?'Enter a branch and commit message before pushing.':'Enter a branch, commit message, PR title and PR description before publishing.','error');return;
 }
 busy=true;buttons();show('Confirm final publication in VS Code. Source SHA is pinned to your review.');
 vscode.postMessage({command:'publishReviewedSync',branchOnly,branch:get('reviewBranch').value.trim(),
  commitMessage:get('reviewCommit').value.trim(),prTitle:get('reviewTitle').value.trim(),
  prDescription:get('reviewDescription').value.trim()});
}
get('publishReviewed').addEventListener('click',()=>publishReviewed(false));
get('pushBranchOnly').addEventListener('click',()=>publishReviewed(true));
get('redoReview').addEventListener('click',()=>get('repoSyncForm').requestSubmit());
get('openPr').addEventListener('click',()=>{if(createdPr)vscode.postMessage({command:'openCreatedPr'});});
for(const id of ['releasePrNumber','releaseTag'])get(id).addEventListener('input',buttons);
get('publishMergedRelease').addEventListener('click',()=>{
 if(busy||!get('releasePrNumber').reportValidity()||!get('releasePrNumber').value||!get('releaseTag').value.trim())return;
 busy=true;publishedRelease='';buttons();show('Verifying the merged PR and approved release…');
 vscode.postMessage({command:'publishMergedRelease',sourceUrl:consumeUrl('sourceUrl'),destinationUrl:consumeUrl('destinationRepo'),prNumber:Number(get('releasePrNumber').value),tag:get('releaseTag').value.trim()});
});
get('openPublishedRelease').addEventListener('click',()=>{if(publishedRelease)vscode.postMessage({command:'openPublishedRelease'});});
window.addEventListener('message',e=>{
 const data=e.data||{};
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
 if(data.type==='releasePublishResult'){busy=false;publishedRelease=data.success?String(data.url||''):'';buttons();show(data.message||'Release publication finished.',data.success?'success':'error');}
 if(data.type==='repoSyncResult'){busy=false;createdPr=data.success?String(data.prUrl||''):'';if(data.success&&createdPr&&data.releaseTag){get('releasePrNumber').value=createdPr.split('/').pop();get('releaseTag').value=data.releaseTag;}if(data.success){reviewReady=false;get('reviewPanel').hidden=true;}buttons();show(data.message||'Sync finished.',data.success?'success':'error');}
});
buttons();
vscode.postMessage({command:'getRepoSyncSaved'});
</script></body></html>`;
 return html.replaceAll('__CSP__',escapeHtml(csp).replaceAll('&#39;',"'")).replaceAll('__NONCE__',escapeHtml(nonce)).replaceAll('__VERSION__',escapeHtml(version));
}
function open(vscode,{version='0.0.0',onLog=()=>{},secrets=null,preferences=null,workspaceRoot='',describePr=async()=>'',planSync=async()=>null,testConnection=repoCredentials.verifyConnection,onWorkflowEvent=async()=>null}={}){
 if(panel){panel.reveal();return panel;}
 const current=vscode.window.createWebviewPanel('atgvAssist.workspace','ATGV: Workspace',vscode.ViewColumn.One,{enableScripts:true,retainContextWhenHidden:true});
 panel=current;
 let selectedFolder='',busy=false,createdPr='',pendingReview=null,publishedRelease='';
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
  const stored=preferences?.get?.(SAVED_FOLDER_KEY,'');
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
  if(preferences?.update)await preferences.update(SAVED_FOLDER_KEY,folder);
 }
 const patKey=(kind,repo)=>'atgvAssist.repoSync.'+kind+'.'+crypto.createHash('sha256').update(repo.name.toLowerCase()).digest('hex');
 function knownRepos(kind){
  const previous=preferences?.get?.(SAVED_URL_KEYS[kind],'');
  const raw=preferences?.get?.(SAVED_LIST_KEYS[kind],[]);
  const values=[...(Array.isArray(raw)?raw:[]),previous];
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
  await preferences.update(SAVED_LIST_KEYS[kind],list.map(item=>item.webUrl));
  await preferences.update(SAVED_URL_KEYS[kind],repo.webUrl);
  await postSavedRepos(kind);
 }
 async function restoreRepos(){
  for(const kind of ['Source','Destination']){
   await postSavedRepos(kind);
   const repo=safeStoredRepo(preferences?.get?.(SAVED_URL_KEYS[kind],''));
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
  await secrets.delete(patKey(kind,repo));
  const remaining=knownRepos(kind).filter(item=>item.name.toLowerCase()!==repo.name.toLowerCase());
  await preferences.update(SAVED_LIST_KEYS[kind],remaining.map(item=>item.webUrl));
  const last=preferences?.get?.(SAVED_URL_KEYS[kind],'');
  if(safeStoredRepo(last)?.name.toLowerCase()===repo.name.toLowerCase())
   await preferences.update(SAVED_URL_KEYS[kind],remaining[0]?.webUrl||'');
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
 const post=async data=>{if(panel===current)await current.webview.postMessage(data);};
 const sanitize=(error,tokens=[])=>{
  let message=String(error?.message||error);
  for(const token of tokens)if(token)message=message.split(token).join('[REDACTED]');
  return message.slice(0,550);
 };
 current.onDidDispose(()=>{if(panel===current)panel=null;});
 current.webview.onDidReceiveMessage(async message=>{
  if(!message||typeof message.command!=='string')return;
  if(message.command==='getRepoSyncSaved'){
   try{await restoreRepos();await restoreSelectedFolder();}
   catch(error){onLog('Repo Sync saved connection and folder restore: '+sanitize(error));}
   return;
  }
  if(message.command==='forgetRepoConnection'){
   const kind=message.kind;let repo=null;
   try{
    if(busy)throw Error('A repository operation is already running.');
    busy=true;
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
   if(busy)return;
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
   return;
  }
  if(message.command==='openCreatedPr'){if(createdPr)await vscode.env.openExternal(vscode.Uri.parse(createdPr));return;}
  if(message.command==='openPublishedRelease'){if(publishedRelease)await vscode.env.openExternal(vscode.Uri.parse(publishedRelease));return;}
  if(message.command==='publishMergedRelease'){
   if(busy){await post({type:'releasePublishResult',success:false,message:'A repository operation is already running.'});return;}
   busy=true;publishedRelease='';let source=null,destination=null,sourcePat='',destPat='';
   try{
    source=repoCredentials.parseCredentialUrl(message.sourceUrl);destination=repoCredentials.parseCredentialUrl(message.destinationUrl);
    const pair=releasePublisher.pairFor(source,destination);releasePublisher.tagInfo(message.tag,pair.kind);
    if(!Number.isSafeInteger(message.prNumber)||message.prNumber<1||message.prNumber>1000000000)throw Error('Enter the merged destination PR number.');
    const action='Publish Verified Release';
    const consent=await vscode.window.showWarningMessage('Publish '+message.tag+' from '+source.name+' to '+destination.name+' after verifying merged PR #'+message.prNumber+'? This creates a GitHub release and uploads verified assets. No GitHub Actions, main commit or PR merge will be performed.',{modal:true},action);
    if(consent!==action)throw Error('Release publication cancelled. No changes made.');
    sourcePat=(await verifiedPat('Source',source)).token;destPat=(await verifiedPat('Destination',destination)).token;
    await rememberRepo('Source',source);await rememberRepo('Destination',destination);
    const result=await releasePublisher.publish({source,destination,sourcePat,destPat,prNumber:message.prNumber,tag:message.tag,onProgress:message=>post({type:'repoSyncProgress',stage:'release-publish',message})});
    publishedRelease=result.url;await post({type:'releasePublishResult',success:true,url:result.url,message:'Published '+result.tag+' · '+result.assetCount+' verified assets · '+result.url});
   }catch(error){const reason=sanitize(error,[sourcePat,destPat,source?.token,destination?.token]);onLog('Release publication: '+reason);await post({type:'releasePublishResult',success:false,message:reason});}
   finally{busy=false;}
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
   const confirmAction=branchOnly?'Push Branch Only':isPublish?'Publish Reviewed PR':'Create Sync PR';
   const response=isPrepare?'Prepare Source Review':await vscode.window.showWarningMessage(
    'Source: '+source.name+' ('+(sourcePrNumber?'PR #'+sourcePrNumber:sourceBranch||'GitHub default branch (auto)')+')\nDestination: '+destination.name+' in '+selectedFolder+
    '\nScope: '+scope+'\nDestination base: '+(base||'GitHub default branch')+
    (branchOnly?'\n\nCommit and push the reviewed changes to '+reviewed.branch+' without creating a pull request?':
     isPublish?'\n\nPublish the reviewed branch, commit message, PR title and description?':'\n\nVerify both PATs, clone to temp and create the PR?'),
    {modal:true},confirmAction);
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
   const outcome=await repoSync.sync({
    sourceUrl:source.url,sourceBranch,sourcePrNumber,destinationFolder:selectedFolder,copyScope:scope,baseBranch:base,
    sourcePat,destPat,workspaceRoot,destinationUrl:destination.url,
    planSync,describePr,previewOnly:isPrepare,approvedReview:reviewed,branchOnly,
    onProgress:async event=>{
     await post({type:'repoSyncProgress',stage:event.stage,message:event.message});
     if(workflowJobId)try{await onWorkflowEvent({type:'stage',jobId:workflowJobId,stage:event.stage||'processing'});}
      catch(error){onLog('ATGV Workspace stage journal: '+String(error.message||error).slice(0,160));}
    }
   });
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
   const summary=outcome.unchanged?outcome.message:
    (branchOnly?'Branch pushed: '+outcome.branch:'PR created: '+outcome.prUrl)+'\nSource: '+outcome.sourceRepo+' / '+outcome.sourceBranch+' @ '+outcome.sourceSha+
    '\nDestination: '+outcome.destinationRepo+'/'+outcome.base+
    '\nBranch: '+outcome.branch+'\nFiles selected: '+outcome.fileCount;
   const enrichedSummary=summary+'\\nCopied code version: '+(outcome.codeVersion||'Not declared')+
    '\\nLatest published release: '+(outcome.releaseTag||'None published')+
    '\\nRelease assets included: '+String(outcome.releaseAssetCount||0)+
    '\\nRelease artifact paths: '+(outcome.releaseArtifactPaths||[]).join(', ');
   await post({type:'repoSyncResult',success:true,prUrl:createdPr,releaseTag:outcome.releaseTag||'',message:enrichedSummary+(createdPr&&outcome.releaseTag?'\nAfter the destination PR is merged, use Publish Merged Release.':'')});
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
 });
 current.webview.html=workspaceHtml({nonce:crypto.randomBytes(18).toString('base64'),version,cspSource:current.webview.cspSource});
 return current;
}
module.exports={open,workspaceHtml};
