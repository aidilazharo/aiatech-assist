'use strict';
// Independent ATGV: Workspace webview for Repo A main -> Repo B pull request.
const crypto=require('node:crypto');
const repoSync=require('./repo-sync-pr');
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
input{width:100%;min-width:0;padding:10px;color:var(--vscode-input-foreground,var(--vscode-foreground));background:var(--vscode-input-background,#30343b);border:1px solid var(--vscode-input-border,var(--vscode-panel-border,#555));border-radius:5px;font:inherit}
input:focus-visible,button:focus-visible{outline:2px solid var(--vscode-focusBorder,#6ab5ff);outline-offset:2px}
button{background:var(--vscode-button-background,#096db5);color:var(--vscode-button-foreground,#fff);border:0;border-radius:5px;min-height:37px;padding:10px 14px;font:inherit;cursor:pointer}
button.secondary{background:var(--vscode-button-secondaryBackground,#454c58);color:var(--vscode-button-secondaryForeground,#fff)}
button:hover:not(:disabled){filter:brightness(1.1)}button:disabled{opacity:.52;cursor:not-allowed}
.folder,.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
#destinationLabel{font-size:11px;font-weight:500;overflow-wrap:anywhere;min-width:0;flex:1}
.actions{margin:19px 0 13px}.note{line-height:1.55}
ol{line-height:1.85;padding-left:20px}
.status{min-height:49px;border:1px solid var(--vscode-panel-border,#50535b);border-radius:6px;padding:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}
.status[data-state=success]{border-color:var(--vscode-testing-iconPassed,#3aaf80)}
.status[data-state=error]{border-color:var(--vscode-errorForeground,#e4787d)}
@media(max-width:680px){.grid{grid-template-columns:1fr}.card.full{grid-column:auto}}
</style></head>
<body>
<header><div><h1>ATGV: Workspace</h1><div class="muted">Repo A main → Repo B branch, commit & pull request</div></div><div class="muted">AIATECH ASSIST v__VERSION__</div></header>
<main><p class="muted">Sync eligible tracked files from the latest Repo A main into a new branch of your local Repo B checkout. Create a review PR without changing Repo B main directly.</p>
<form id="repoSyncForm"><div class="grid">
<section class="card"><h2>1. Source · Repo A</h2>
<p class="muted">ATGV fetches the latest main commit.</p>
<label for="sourceUrl">GitHub repository URL</label><input id="sourceUrl" type="url" required placeholder="https://github.com/OWNER/repo-a" autocomplete="off" spellcheck="false">
<label for="copyScope">Copy scope</label><input id="copyScope" type="text" maxlength="280" value="." placeholder="src/components or .">
<p class="muted note">A dot copies all eligible tracked files. Secrets, Git internals, generated dependencies and release workflows are excluded.</p>
</section>
<section class="card"><h2>2. Destination · Repo B</h2>
<p class="muted">Choose an existing local Git repository with a clean working tree.</p>
<label>Local Repo B Git root</label><div class="folder"><button id="selectRepoB" type="button" class="secondary">Choose Repo B folder</button><strong id="destinationLabel">No folder selected</strong></div>
<label for="baseBranch">PR base branch</label><input id="baseBranch" type="text" maxlength="110" placeholder="GitHub default branch (auto)">
<p class="muted note">ATGV verifies Repo B origin and fetches the chosen base branch before creating a unique sync branch.</p>
</section>
<section class="card full"><h2>3. Publish pull request</h2>
<ol class="muted"><li>Verify Repo A main commit and eligible files</li><li>Create new Repo B branch and copy files</li><li>Commit with source SHA and push the branch</li><li>Create a PR with accurate source, destination and change details</li></ol>
<div class="actions"><button id="createPr" type="submit">Create Branch, Commit & PR</button><button id="openPr" type="button" class="secondary" hidden disabled>Open Created PR</button></div>
<div id="syncStatus" class="status" role="status" aria-live="polite" data-state="ready">Install Git and GitHub CLI, run gh auth login, then select your local Repo B folder.</div>
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
 get('openPr').disabled=busy||!createdPr;
 get('openPr').hidden=!createdPr;
 get('repoSyncForm').setAttribute('aria-busy',String(busy));
}
get('selectRepoB').addEventListener('click',()=>vscode.postMessage({command:'selectRepoB'}));
get('repoSyncForm').addEventListener('submit',e=>{
 e.preventDefault();
 if(busy||!folder||!get('repoSyncForm').reportValidity())return;
 busy=true;createdPr='';buttons();show('Confirm the operation in VS Code. No files have changed yet.');
 vscode.postMessage({command:'createSyncPr',sourceUrl:get('sourceUrl').value.trim(),copyScope:get('copyScope').value.trim()||'.',baseBranch:get('baseBranch').value.trim()});
});
get('openPr').addEventListener('click',()=>{if(createdPr)vscode.postMessage({command:'openCreatedPr'});});
window.addEventListener('message',e=>{
 const data=e.data||{};
 if(data.type==='repoBSelected'){folder=String(data.folder||'');get('destinationLabel').textContent=folder||'No folder selected';buttons();}
 if(data.type==='repoSyncProgress')show(data.message||'Synchronising…');
 if(data.type==='repoSyncResult'){busy=false;createdPr=data.success?String(data.prUrl||''):'';buttons();show(data.message||'Sync finished.',data.success?'success':'error');}
});
buttons();
</script></body></html>`;
 return html.replaceAll('__CSP__',escapeHtml(csp).replaceAll('&#39;',"'")).replaceAll('__NONCE__',escapeHtml(nonce)).replaceAll('__VERSION__',escapeHtml(version));
}
function open(vscode,{version='0.0.0',onLog=()=>{}}={}){
 if(panel){panel.reveal();return panel;}
 const current=vscode.window.createWebviewPanel('atgvAssist.workspace','ATGV: Workspace',vscode.ViewColumn.One,{enableScripts:true,retainContextWhenHidden:true});
 panel=current;
 let selectedFolder='',busy=false,createdPr='';
 const post=async data=>{if(panel===current)await current.webview.postMessage(data);};
 current.onDidDispose(()=>{if(panel===current)panel=null;});
 current.webview.onDidReceiveMessage(async message=>{
  if(!message||typeof message.command!=='string')return;
  try{
   if(message.command==='selectRepoB'){
    if(busy)return;
    const picked=await vscode.window.showOpenDialog({
     canSelectFolders:true,canSelectFiles:false,canSelectMany:false,
     openLabel:'Select Repo B Git root',
     title:'ATGV Workspace: Select existing local Repo B repository'
    });
    if(picked?.[0]){selectedFolder=picked[0].fsPath;await post({type:'repoBSelected',folder:selectedFolder});}
    return;
   }
   if(message.command==='openCreatedPr'){if(createdPr)await vscode.env.openExternal(vscode.Uri.parse(createdPr));return;}
   if(message.command!=='createSyncPr')return;
   if(busy){await post({type:'repoSyncResult',success:false,message:'A repository sync is already running.'});return;}
   busy=true;createdPr='';
   try{
    if(!selectedFolder)throw Error('Choose the Repo B Git folder first.');
    const source=repoSync.githubUrl(message.sourceUrl);
    const scope=repoSync.scopeName(message.copyScope||'.');
    const base=message.baseBranch?repoSync.baseName(message.baseBranch):'';
    const response=await vscode.window.showWarningMessage(
     'Repo A: '+source.name+' (latest main)\nRepo B: '+selectedFolder+
     '\nScope: '+scope+'\nPR base: '+(base||'GitHub default branch')+
     '\n\nCreate a new Repo B branch, copy files, commit, push and create a review PR?',
     {modal:true},'Create Sync PR'
    );
    if(response!=='Create Sync PR'){
     await post({type:'repoSyncResult',success:false,message:'Cancelled. No files were changed.'});
     return;
    }
    const outcome=await repoSync.sync({
     sourceUrl:source.url,destinationFolder:selectedFolder,copyScope:scope,baseBranch:base,
     onProgress:event=>post({type:'repoSyncProgress',stage:event.stage,message:event.message})
    });
    createdPr=outcome.prUrl||'';
    const summary=outcome.unchanged?outcome.message:
     'PR created: '+outcome.prUrl+'\nSource: '+outcome.sourceRepo+' main @ '+outcome.sourceSha+
     '\nDestination: '+outcome.destinationRepo+'/'+outcome.base+
     '\nBranch: '+outcome.branch+'\nFiles selected: '+outcome.fileCount;
    await post({type:'repoSyncResult',success:true,prUrl:createdPr,message:summary});
    onLog('Repo Sync: '+summary);
   }finally{busy=false;}
  }catch(error){
   onLog('Repo Sync failed: '+String(error.message||error));
   await post({type:'repoSyncResult',success:false,message:String(error.message||error)});
  }
 });
 current.webview.html=workspaceHtml({nonce:crypto.randomBytes(18).toString('base64'),version,cspSource:current.webview.cspSource});
 return current;
}
module.exports={open,workspaceHtml};
