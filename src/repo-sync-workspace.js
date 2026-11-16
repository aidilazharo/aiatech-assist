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
<header><div><h1>ATGV: Workspace</h1><div class="muted">Repo A branch → Repo B copy, push & AI-assisted pull request</div></div><div class="muted">AIATECH ASSIST v__VERSION__</div></header>
<main><p class="muted">Copy eligible tracked files from the selected Repo A branch into a matching, review-only branch of Repo B. Separate GitHub PATs authenticate each repository; Repo B main is never changed directly.</p>
<form id="repoSyncForm"><div class="grid">
<section class="card"><h2>1. Source · Repo A</h2>
<p class="muted">Use a read-only Source PAT saved securely in VS Code. ATGV fetches the latest commit of the chosen branch.</p>
<label for="sourceUrl">GitHub repository URL</label><input id="sourceUrl" type="url" required placeholder="https://github.com/OWNER/repo-a" autocomplete="off" spellcheck="false">
<label for="sourceBranch">Source branch name</label><input id="sourceBranch" type="text" required maxlength="110" value="main" placeholder="main or feature/my-branch">
<label for="copyScope">Copy scope</label><input id="copyScope" type="text" maxlength="280" value="." placeholder="src/components or .">
<p class="muted note">A dot copies all eligible tracked files. Secrets, Git internals, generated dependencies and release workflows are excluded.</p>
</section>
<section class="card"><h2>2. Destination · Repo B</h2>
<p class="muted">Use a Destination PAT with repository write permission. Select a clean Repo B Git folder outside your current ATGV project/workspace. Both PATs are stored in VS Code SecretStorage, not this form.</p>
<label for="destinationRepo">Destination GitHub URL (optional; verifies local origin)</label><input id="destinationRepo" type="url" placeholder="https://github.com/OWNER/repo-b" autocomplete="off" spellcheck="false">
<label>Local Repo B Git root (must be outside ATGV workspace)</label><div class="folder"><button id="selectRepoB" type="button" class="secondary">Choose Repo B folder</button><strong id="destinationLabel">No folder selected</strong></div>
<label for="baseBranch">PR base branch</label><input id="baseBranch" type="text" maxlength="110" placeholder="GitHub default branch (auto)">
<p class="muted note">ATGV verifies Repo B origin, fetches its base, then creates or safely reuses sync/&lt;source-repo&gt;/&lt;source-branch&gt;. The original source commit message is reused with provenance trailers.</p>
</section>
<section class="card full"><h2>3. Publish pull request</h2>
<ol class="muted"><li>Prompt for Source and Destination PATs when not saved</li><li>Verify source branch, Git identity, and selected folder outside ATGV</li><li>Create/reuse the safe branch, copy files and retain the source commit message</li><li>Push using the Destination PAT and create/reuse a PR with a short AI description</li></ol>
<div class="actions"><button id="createPr" type="submit">Sync Repo A → Repo B · Push & Create PR</button><button id="openPr" type="button" class="secondary" hidden disabled>Open Created PR</button></div>
<div id="syncStatus" class="status" role="status" aria-live="polite" data-state="ready">Install Git and GitHub CLI, then select a separate Repo B Git folder. Source and Destination PATs will be requested securely when needed; no gh auth login is required.</div>
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
 vscode.postMessage({command:'createSyncPr',sourceUrl:get('sourceUrl').value.trim(),sourceBranch:get('sourceBranch').value.trim()||'main',destinationUrl:get('destinationRepo').value.trim(),copyScope:get('copyScope').value.trim()||'.',baseBranch:get('baseBranch').value.trim()});
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
function open(vscode,{version='0.0.0',onLog=()=>{},secrets=null,workspaceRoot='',describePr=async()=>''}={}){
 if(panel){panel.reveal();return panel;}
 const current=vscode.window.createWebviewPanel('atgvAssist.workspace','ATGV: Workspace',vscode.ViewColumn.One,{enableScripts:true,retainContextWhenHidden:true});
 panel=current;
 let selectedFolder='',busy=false,createdPr='';
 const patKey=(kind,repo)=>'atgvAssist.repoSync.'+kind+'.'+crypto.createHash('sha256').update(repo.name.toLowerCase()).digest('hex');
 async function readPat(kind,repo){
  if(!secrets?.get||!secrets?.store)throw Error('VS Code SecretStorage is required to protect GitHub PATs.');
  const key=patKey(kind,repo);let token=await secrets.get(key);
  if(!token){
   token=await vscode.window.showInputBox({title:'GitHub '+kind+' PAT',prompt:'Enter the Personal Access Token for '+repo.name+'. PAT is stored encrypted by VS Code, never in the webview or Git URL.',password:true,ignoreFocusOut:true,validateInput:value=>value&&value.trim().length>=20?null:'Enter a PAT (at least 20 characters).'});
   if(!token)throw Error(kind+' PAT entry was cancelled. Nothing was copied.');
   await secrets.store(key,token.trim());
  }
  return {key,token};
 }
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
    if(!selectedFolder)throw Error('Choose a Repo B Git folder outside the ATGV workspace first.');
    const source=repoSync.githubUrl(message.sourceUrl);
    const scope=repoSync.scopeName(message.copyScope||'.');
    const sourceBranch=repoSync.baseName(message.sourceBranch||'main');
    const expectedDestination=message.destinationUrl?repoSync.githubUrl(message.destinationUrl):null;
    const base=message.baseBranch?repoSync.baseName(message.baseBranch):'';
    const response=await vscode.window.showWarningMessage(
     'Repo A: '+source.name+' ('+sourceBranch+')\nRepo B: '+selectedFolder+
     '\nScope: '+scope+'\nPR base: '+(base||'GitHub default branch')+
     '\n\nCopy into a review branch, reuse the source commit message, push with the Destination PAT, and create a PR?',
     {modal:true},'Create Sync PR'
    );
    if(response!=='Create Sync PR'){
     await post({type:'repoSyncResult',success:false,message:'Cancelled. No files were changed.'});
     return;
    }
    const sourceCredentials=await readPat('Source',source);
    // Repo B PAT is keyed by the verified local origin, not a user supplied
    // untrusted arbitrary destination label.
    const {execFileSync}=require('node:child_process');
    const localOrigin=execFileSync('git',['remote','get-url','origin'],{cwd:selectedFolder,encoding:'utf8',windowsHide:true,timeout:15000}).trim();
    const localRepo=repoSync.githubUrl(localOrigin,{origin:true});
    if(expectedDestination&&expectedDestination.name.toLowerCase()!==localRepo.name.toLowerCase())throw Error('Destination GitHub URL must match the selected local repository origin.');
    const destinationCredentials=await readPat('Destination',localRepo);
    const outcome=await repoSync.sync({
     sourceUrl:source.url,sourceBranch,destinationFolder:selectedFolder,copyScope:scope,baseBranch:base,
     sourcePat:sourceCredentials.token,destPat:destinationCredentials.token,workspaceRoot,
     describePr,onProgress:event=>post({type:'repoSyncProgress',stage:event.stage,message:event.message})
    });
    createdPr=outcome.prUrl||'';
    const summary=outcome.unchanged?outcome.message:
     'PR created: '+outcome.prUrl+'\nSource: '+outcome.sourceRepo+' / '+outcome.sourceBranch+' @ '+outcome.sourceSha+
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
