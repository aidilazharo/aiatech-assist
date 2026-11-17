'use strict';
// Independent ATGV: Workspace webview for Repo A main -> Repo B pull request.
const crypto=require('node:crypto');
const repoSync=require('./repo-sync-pr');
const repoCredentials=require('./repo-sync-credentials');
const SAVED_URL_KEYS=Object.freeze({Source:'atgvAssist.repoSync.lastSourceUrl',Destination:'atgvAssist.repoSync.lastDestinationUrl'});
const SAVED_LIST_KEYS=Object.freeze({Source:'atgvAssist.repoSync.savedSourceUrls',Destination:'atgvAssist.repoSync.savedDestinationUrls'});
const MAX_SAVED_REPOS=30;
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
input,select{width:100%;min-width:0;padding:10px;color:var(--vscode-input-foreground,var(--vscode-foreground));background:var(--vscode-input-background,#30343b);border:1px solid var(--vscode-input-border,var(--vscode-panel-border,#555));border-radius:5px;font:inherit}
input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--vscode-focusBorder,#6ab5ff);outline-offset:2px}
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
@media(max-width:680px){.grid{grid-template-columns:1fr}.card.full{grid-column:auto}}
</style></head>
<body>
<header><div><h1>ATGV: Workspace</h1><div class="muted">Repo A branch → Repo B copy, push & AI-assisted pull request</div></div><div class="muted">AIATECH ASSIST v__VERSION__</div></header>
<main><p class="muted">Copy eligible tracked files from the selected Repo A branch into a matching, review-only branch of Repo B. Separate GitHub PATs authenticate each repository; Repo B main is never changed directly.</p>
<form id="repoSyncForm"><div class="grid">
<section class="card"><h2>1. Source · Repo A</h2>
<p class="muted">Select a saved read-access connection or add another. PATs are stored in VS Code SecretStorage.</p>
<label for="sourceSavedRepos">Saved Source connections</label><select id="sourceSavedRepos" aria-label="Saved Source GitHub repositories"><option value="">+ Add another repository...</option></select>
<div class="connection-action"><button id="forgetSource" type="button" class="secondary" disabled>Forget selected</button></div>
<label for="sourceUrl">GitHub repository URL with PAT</label><input id="sourceUrl" type="password" required placeholder="https://USERNAME:TOKEN@github.com/OWNER/repo-a" autocomplete="off" spellcheck="false">
<div class="connection-action"><button id="testSource" type="button" class="secondary">Test Connection</button><span id="sourceConnection" class="connection-status" role="status" aria-live="polite">Not tested</span></div>
<label for="sourceBranch">Source branch (optional)</label><input id="sourceBranch" type="text" maxlength="110" placeholder="Auto: GitHub default branch, or choose another branch">
<label for="sourcePrNumber">Source PR number (optional)</label><input id="sourcePrNumber" type="number" min="1" step="1" placeholder="e.g. 2 · copy original PR branch and details">
<p class="muted note">If selected, the source PR's head branch, commit message, title and description are preserved. The source PR branch must still exist.</p>
<label for="copyScope">Copy scope</label><input id="copyScope" type="text" maxlength="280" value="." placeholder="src/components or .">
<p class="muted note">A dot copies all eligible tracked files. Secrets, Git internals, generated dependencies and release workflows are excluded.</p>
</section>
<section class="card"><h2>2. Destination · Repo B</h2>
<p class="muted">Select a saved write-access connection or add another. Choose a clean Repo B checkout or an empty external folder.</p>
<label for="destinationSavedRepos">Saved Destination connections</label><select id="destinationSavedRepos" aria-label="Saved Destination GitHub repositories"><option value="">+ Add another repository...</option></select>
<div class="connection-action"><button id="forgetDestination" type="button" class="secondary" disabled>Forget selected</button></div>
<label for="destinationRepo">Destination GitHub URL with PAT</label><input id="destinationRepo" type="password" required placeholder="https://USERNAME:TOKEN@github.com/OWNER/repo-b" autocomplete="off" spellcheck="false">
<div class="connection-action"><button id="testDestination" type="button" class="secondary">Test Connection</button><span id="destinationConnection" class="connection-status" role="status" aria-live="polite">Not tested</span></div>
<label>Local Repo B Git root or empty folder (outside ATGV workspace)</label><div class="folder"><button id="selectRepoB" type="button" class="secondary">Choose Repo B folder</button><strong id="destinationLabel">No folder selected</strong></div>
<label for="baseBranch">PR base branch</label><input id="baseBranch" type="text" maxlength="110" placeholder="GitHub default branch (auto)">
<p class="muted note">ATGV clones Repo A to a temporary folder. AI reads verified source metadata and suggests a safe Repo B sync branch, commit message and PR details. The copy is staged with Git, committed and published only after validation.</p>
</section>
<section class="card full"><h2>3. Publish pull request</h2>
<ol class="muted"><li>Test Repo A read access and Repo B write access with independent PATs</li><li>Clone Repo A to a temporary folder and read safe source metadata for AI planning</li><li>Create/reuse an AI-named review branch in Repo B, copy eligible files and run git add</li><li>Commit with AI-generated message, push and create PR with AI-written details</li></ol>
<div class="actions"><button id="createPr" type="submit">Sync Repo A → Repo B · Push & Create PR</button><button id="openPr" type="button" class="secondary" hidden disabled>Open Created PR</button></div>
<div id="syncStatus" class="status" role="status" aria-live="polite" data-state="ready">Paste username:PAT URLs, test both connections and select an existing Repo B checkout or an empty external folder. Git is required; pull requests use GitHub HTTPS API with the Destination PAT. GitHub CLI (gh) is not needed.</div>
</section></div></form>
<p class="muted note">Repo B-only files and release workflows are preserved. The tool never merges the PR automatically. Review and test the changes before merging.</p>
</main>
<script nonce="__NONCE__">
'use strict';
const vscode=acquireVsCodeApi();
const get=id=>document.getElementById(id);
let folder='',busy=false,createdPr='';
function show(message,state){get('syncStatus').textContent=String(message||'');get('syncStatus').dataset.state=state||'ready';}
function buttons(){
 get('createPr').disabled=busy||!folder;
 get('selectRepoB').disabled=busy;
 get('testSource').disabled=busy;get('testDestination').disabled=busy;
 for(const kind of ['Source','Destination']){
  const select=get(kind==='Source'?'sourceSavedRepos':'destinationSavedRepos');
  select.disabled=busy;
  get(kind==='Source'?'forgetSource':'forgetDestination').disabled=busy||!select.value;
 }
 get('openPr').disabled=busy||!createdPr;get('openPr').hidden=!createdPr;
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
 const raw=consumeUrl(kind==='Source'?'sourceUrl':'destinationRepo');
 busy=true;buttons();
 const node=connectionNode(kind);node.textContent='Testing GitHub permissions…';node.dataset.state='ready';
 vscode.postMessage({command:'testRepoConnection',kind,url:raw});
}
get('testSource').addEventListener('click',()=>testRepository('Source'));
get('testDestination').addEventListener('click',()=>testRepository('Destination'));
for(const id of ['sourceUrl','destinationRepo'])get(id).addEventListener('input',()=>{
 const kind=id==='sourceUrl'?'Source':'Destination';
 const node=connectionNode(kind);node.textContent='Not tested';node.dataset.state='ready';
 const select=savedSelect(kind);const value=get(id).value.trim();
 select.value=[...select.options].some(item=>item.value===value)?value:'';buttons();
});
get('selectRepoB').addEventListener('click',()=>vscode.postMessage({command:'selectRepoB'}));
get('repoSyncForm').addEventListener('submit',e=>{
 e.preventDefault();
 if(busy||!folder||!get('repoSyncForm').reportValidity())return;
 busy=true;createdPr='';buttons();show('Confirm the operation in VS Code. No files have changed yet.');
 vscode.postMessage({command:'createSyncPr',sourceUrl:consumeUrl('sourceUrl'),sourceBranch:get('sourceBranch').value.trim(),sourcePrNumber:get('sourcePrNumber').value.trim(),destinationUrl:consumeUrl('destinationRepo'),copyScope:get('copyScope').value.trim()||'.',baseBranch:get('baseBranch').value.trim()});
});
get('openPr').addEventListener('click',()=>{if(createdPr)vscode.postMessage({command:'openCreatedPr'});});
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
 if(data.type==='repoSyncProgress')show(data.message||'Synchronising…');
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
 if(data.type==='repoSyncResult'){busy=false;createdPr=data.success?String(data.prUrl||''):'';buttons();show(data.message||'Sync finished.',data.success?'success':'error');}
});
buttons();
vscode.postMessage({command:'getRepoSyncSaved'});
</script></body></html>`;
 return html.replaceAll('__CSP__',escapeHtml(csp).replaceAll('&#39;',"'")).replaceAll('__NONCE__',escapeHtml(nonce)).replaceAll('__VERSION__',escapeHtml(version));
}
function open(vscode,{version='0.0.0',onLog=()=>{},secrets=null,preferences=null,workspaceRoot='',describePr=async()=>'',planSync=async()=>null,testConnection=repoCredentials.verifyConnection}={}){
 if(panel){panel.reveal();return panel;}
 const current=vscode.window.createWebviewPanel('atgvAssist.workspace','ATGV: Workspace',vscode.ViewColumn.One,{enableScripts:true,retainContextWhenHidden:true});
 panel=current;
 let selectedFolder='',busy=false,createdPr='';
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
   try{await restoreRepos();}catch(error){onLog('Repo Sync saved URL restore: '+sanitize(error));}
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
    const picked=await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'Select Repo B Git root',title:'ATGV Workspace: Choose Repo B Git root or an empty folder'});
    if(picked?.[0]){selectedFolder=picked[0].fsPath;await post({type:'repoBSelected',folder:selectedFolder});}
   }catch(error){await post({type:'repoSyncResult',success:false,message:sanitize(error)});}
   return;
  }
  if(message.command==='openCreatedPr'){if(createdPr)await vscode.env.openExternal(vscode.Uri.parse(createdPr));return;}
  if(message.command==='testRepoConnection'){
   const kind=message.kind;
   if(busy){await post({type:'repoConnectionResult',kind,success:false,message:'A repository operation is already running.'});return;}
   busy=true;let parsed=null,token='';
   try{
    if(!['Source','Destination'].includes(kind))throw Error('Select Source or Destination.');
    parsed=repoCredentials.parseCredentialUrl(message.url);
    const credentials=await verifiedPat(kind,parsed);token=credentials.token;
    await rememberRepo(kind,parsed);
    await post({type:'repoConnectionResult',kind,success:true,safeUrl:parsed.webUrl,message:'Connected · '+parsed.name+' · '+(kind==='Source'?'read':'write')+' access verified'});
   }catch(error){
    const reason=sanitize(error,[token,parsed?.token]);onLog('Repo '+String(kind||'')+' connection test: '+reason);
    await post({type:'repoConnectionResult',kind,success:false,safeUrl:parsed?.webUrl||'',message:reason});
   }finally{busy=false;}
   return;
  }
  if(message.command!=='createSyncPr')return;
  if(busy){await post({type:'repoSyncResult',success:false,message:'A repository operation is already running.'});return;}
  busy=true;createdPr='';
  let sourcePat='',destPat='',source=null,destination=null;
  try{
   if(!selectedFolder)throw Error('Choose a Repo B Git folder outside ATGV workspace first.');
   source=repoCredentials.parseCredentialUrl(message.sourceUrl);
   destination=repoCredentials.parseCredentialUrl(message.destinationUrl);
   const scope=repoSync.scopeName(message.copyScope||'.');
   const sourceBranch=message.sourceBranch?repoSync.baseName(message.sourceBranch):'';
   const sourcePrNumber=message.sourcePrNumber?String(message.sourcePrNumber).trim():'';
   if(sourcePrNumber&&(!/^[1-9][0-9]*$/.test(sourcePrNumber)||Number(sourcePrNumber)>1000000000))
    throw Error('Enter a valid positive source PR number.');
   const base=message.baseBranch?repoSync.baseName(message.baseBranch):'';
   const response=await vscode.window.showWarningMessage(
    'Repo A: '+source.name+' ('+(sourcePrNumber?'PR #'+sourcePrNumber:sourceBranch||'GitHub default branch (auto)')+')\nRepo B: '+destination.name+' in '+selectedFolder+
    '\nScope: '+scope+'\nPR base: '+(base||'GitHub default branch')+
    '\n\nVerify both PATs, clone to temp, preserve original source metadata, commit, push and open PR?',
    {modal:true},'Create Sync PR');
   if(response!=='Create Sync PR'){await post({type:'repoSyncResult',success:false,message:'Cancelled. No files were changed.'});return;}
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
    planSync,describePr,onProgress:event=>post({type:'repoSyncProgress',stage:event.stage,message:event.message})
   });
   createdPr=outcome.prUrl||'';
   const summary=outcome.unchanged?outcome.message:
    'PR created: '+outcome.prUrl+'\nSource: '+outcome.sourceRepo+' / '+outcome.sourceBranch+' @ '+outcome.sourceSha+
    '\nDestination: '+outcome.destinationRepo+'/'+outcome.base+
    '\nBranch: '+outcome.branch+'\nFiles selected: '+outcome.fileCount;
   await post({type:'repoSyncResult',success:true,prUrl:createdPr,message:summary});
   onLog('Repo Sync: '+summary);
  }catch(error){
   const reason=sanitize(error,[sourcePat,destPat,source?.token,destination?.token]);
   onLog('Repo Sync failed: '+reason);
   await post({type:'repoSyncResult',success:false,message:reason});
  }finally{busy=false;}
 });
 current.webview.html=workspaceHtml({nonce:crypto.randomBytes(18).toString('base64'),version,cspSource:current.webview.cspSource});
 return current;
}
module.exports={open,workspaceHtml};
