'use strict';
const vscode=acquireVsCodeApi();
const $=id=>document.getElementById(id);
// ATGV durable workflows: the webview only displays durable host state.
// Never replay remote writes from the UI, even after a VS Code restart.
let atgvJobItems=[],atgvJobProject='';
function atgvJobsModal(open){
 const modal=$('atgvJobsDialog');
 modal.classList.toggle('hidden',!open);
 modal.setAttribute('aria-hidden',open?'false':'true');
 if(open){send('getWorkflowJobs');$('atgvJobsClose').focus();}
 else $('atgvJobsButton').focus();
}
function atgvJobRow(job){
 const row=document.createElement('div');row.className='atgv-jobs-row';
 const heading=document.createElement('div');heading.className='atgv-jobs-row-heading';
 const label=document.createElement('strong');label.textContent=(job.role||'ATGV')+' · '+(job.command||'Operation');
 const state=document.createElement('span');state.className='atgv-job-state';
 state.dataset.status=job.status||'interrupted';state.textContent=job.status||'Unknown';
 heading.append(label,state);row.append(heading);
 const meta=document.createElement('p');meta.className='muted';
 const stage=job.phase||'Unknown stage',progress=Number.isFinite(job.progress)?job.progress:0;
 meta.textContent='Stage: '+stage+' · '+progress+'% · Last updated: '+(job.updatedAt?new Date(job.updatedAt).toLocaleString():'Unknown');row.append(meta);
 const progressBar=document.createElement('progress');progressBar.max=100;progressBar.value=progress;
 progressBar.setAttribute('aria-label','Completion for '+(job.command||'operation'));row.append(progressBar);
 if(job.error){const error=document.createElement('p');error.className='atgv-job-error';error.textContent=job.error;row.append(error);}
 if(job.status==='failed'||job.status==='interrupted'||job.status==='reconcile-required'){
  const button=document.createElement('button');button.type='button';button.className='secondary';
  if(job.kind==='write'||job.kind==='install'||!job.retryable){
   button.textContent='Manual reconciliation required';button.disabled=true;
   button.title='Check remote state and existing work before restarting this operation from its original role screen.';
  }else{
   button.textContent='Prepare Resume';button.addEventListener('click',()=>{
    $('atgvJobsRecovery').textContent='Checking whether this job can be resumed safely…';
    send('retryWorkflowJob',{jobId:job.id});
   });
  }
  row.append(button);
 }
 return row;
}
function renderAtgvJobs(items=[],projectId=''){
 const root=$('atgvJobsList');root.replaceChildren();
 atgvJobItems=Array.isArray(items)?items:[];atgvJobProject=projectId;
 $('atgvJobsSummary').textContent=!projectId?'Open an ATGV project to see job history.':
  atgvJobItems.length+' recent job(s) · '+atgvJobItems.filter(job=>job.status==='running').length+' running';
 if(!atgvJobItems.length){const text=document.createElement('p');text.className='muted';
  text.textContent='No recorded jobs yet. Start a workflow in any role to see processing history.';root.append(text);return;}
 for(const job of atgvJobItems.slice(0,30))root.append(atgvJobRow(job));
}
$('atgvJobsButton').addEventListener('click',()=>atgvJobsModal(true));
$('atgvJobsClose').addEventListener('click',()=>atgvJobsModal(false));
$('atgvJobsRefresh').addEventListener('click',()=>send('getWorkflowJobs'));
$('atgvJobsDialog').addEventListener('click',event=>{if(event.target===$('atgvJobsDialog'))atgvJobsModal(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('atgvJobsDialog').classList.contains('hidden')){event.preventDefault();atgvJobsModal(false);}});
window.addEventListener('message',event=>{
 const msg=event.data||{};
 if(msg.type==='atgvWorkflowJobs'){
  if(activeId&&msg.projectId!==activeId)return;
  renderAtgvJobs(msg.jobs,msg.projectId);
 }
 if(msg.type==='atgvWorkflowRecovery'&&(!activeId||msg.projectId===activeId)){
  $('atgvJobsRecovery').textContent=String(msg.message||'Resume available from the original role screen.').slice(0,500);
  if(msg.command==='processDiscoverySources')navigate('discovery');
 }
});
let restoreLibraryAfterVendorSync=document.querySelector('meta[name="atgv-resume-library"]')?.content==='yes';
// Consistent flat outline actions in the Business Requirements workspace.
const BA_ICONS={
 upload:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
 save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
 check:'M20 6 9 17l-5-5',
 eye:'M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
 refresh:'M20 11a8 8 0 0 0-14-5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14 5l2-2 M16 16h4v4',
 ticket:'M2 9a3 3 0 0 0 0 6v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a3 3 0 0 1 0-6V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z M13 5v2 M13 17v2 M13 11v2',
 history:'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
 link:'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1 M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1',
 trash:'M3 6h18 M8 6V4h8v2 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
 sparkles:'m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z M19 17l.6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17z',
 edit:'M12 20h9 M3 17.3V21h3.7L19 8.7l-3.7-3.7L3 17.3z M17 3l4 4',
 plus:'M12 5v14 M5 12h14',
 send:'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
 more:'M4 12h.01 M12 12h.01 M20 12h.01',
 shield:'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z M9 12l2 2 4-4'
};
// v0.1.21: Only the shared atgvDecorateControls() decorator may add action icons.
function decorateBAActionButtons(){
 const root=document.getElementById('discoveryView');
 atgvDecorateControls(root);
 atgvCompactRequirementActions(root);
}
// Compact only contextual BA actions. Preserve their real text, event listeners,
// disabled state, access checks and underlying actions; tooltips carry full names.
function atgvCompactRequirementActions(root){
 if(!root)return;
 const selectors=['.br-card-action-row > button','.ba-step-reopen > button',
  '.br-edit-card .stack.actions > button','.jira-publish-panel > .section-title .stack > button',
  '.ba-completed-actions .ba-step-reopen > button'];
 for(const button of root.querySelectorAll(selectors.join(','))){
  const full=String(button.textContent||'').replace(/^[✓✔\s]+/,'').trim();
  if(!full)continue;
  const kind=atgvActionKind(full)||'eye';
  if(!button.querySelector('svg.atgv-flat-icon')){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','atgv-flat-icon');
   svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
   svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');
   svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',BA_ICONS[kind]||BA_ICONS.eye);
   svg.append(path);button.prepend(svg);
  }
  const existing=button.getAttribute('title')||'';
  const oldFull=button.dataset.atgvFullLabel||'';
  let note='';
  // Keep genuine disabled explanations without accumulating tooltip labels.
  if(existing&&existing!==oldFull&& !existing.startsWith(oldFull+' — ') && existing!==full && !existing.startsWith(full+' — '))note=existing;
  else if(existing.startsWith(oldFull+' — ')&&oldFull)note=existing.slice(oldFull.length+3);
  if(note===full)note='';
  button.dataset.atgvFullLabel=full;
  button.setAttribute('aria-label',full);
  button.setAttribute('title',full+(note?' — '+note:''));
  button.classList.add('atgv-icon-action');
 }
}

// v0.1.20: consistent, accessible flat action icons. Never change an action's route,
// enabled state, label, confirmation or event handler. Existing icons are retained.
const ATGV_ACTION_ICONS={...BA_ICONS,settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4 4l2 2 M18 18l2 2 M2 12h2 M20 12h2 M4 20l2-2 M18 6l2-2',search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',close:'M18 6 6 18 M6 6l12 12',open:'M14 3h7v7 M10 14 21 3 M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6'};
function atgvMoreActionsSummary(label){
 const summary=document.createElement('summary');
 summary.className='atgv-more-actions-trigger';
 summary.setAttribute('aria-label','More actions for '+label);
 summary.title='More actions for '+label;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');
 svg.setAttribute('stroke-linecap','round');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',BA_ICONS.more);
 svg.append(path);summary.append(svg);return summary;
}
function atgvActionKind(label){
 const text=String(label||'').trim().toLowerCase();
 if(!text||text.length>100)return null;
 return /^(upload|import|attach)/.test(text)?'upload':/^(save|apply selected mapping)/.test(text)?'save':/^(approve|complete|confirm)/.test(text)?'check':/^(preview|review|view)/.test(text)?'eye':/^(regenerate|retry|refresh|sync|update)/.test(text)?'refresh':/^(history|compare)/.test(text)?'history':/^(delete|remove|retire)/.test(text)?'trash':/^(generate|create|add|initialize)/.test(text)?'plus':/^(publish|submit|send)/.test(text)?'send':/^(edit|rename)/.test(text)?'edit':/^(search|find)/.test(text)?'search':/^(open|launch)/.test(text)?'open':/^(close|cancel)/.test(text)?'close':/^(settings|configure|choose stack)/.test(text)?'settings':null;
}
function atgvDecorateControls(root=document){
 for(const button of root.querySelectorAll('button:not(.icon-only):not(.nav-item):not(.ba-phase):not(.workflow-step):not(.atgv-milestone):not(.ba-source-icon-btn)')){
  if(button.querySelector('svg,.atgv-flat-icon,.ba-flat-icon')||button.hasAttribute('data-no-action-icon'))continue;
  const kind=atgvActionKind(button.textContent);if(!kind)continue;
  const first=button.firstChild;
  if(first?.nodeType===Node.TEXT_NODE&&/^[\s]*[✓✔↻↪⚙✎✏↗⟳•]+[\s]+/.test(first.textContent))first.textContent=first.textContent.replace(/^[\s]*[✓✔↻↪⚙✎✏↗⟳•]+[\s]+/,'');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','atgv-flat-icon');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',ATGV_ACTION_ICONS[kind]);svg.append(path);button.prepend(svg);
 }
}
// v0.1.22: One semantic severity vocabulary throughout the webview.
// Priority is important: a blocked/failed action must never be rendered as completed.
function atgvSeverity(label){
 const value=String(label||'').trim().toLowerCase();
 if(/(?:error|failed|failure|rejected|conflict|invalid|unauthorized|cannot|unable|unavailable)/.test(value))return 'failure';
 if(/(?:blocked|warning|attention|action required|stale|outdated|pending review|review required|awaiting approval)/.test(value))return 'warning';
 if(/(?:completed|complete|approved|success|saved|published|synced|ready|passed|unchanged|on track|you own)/.test(value))return 'success';
 if(/(?:running|working|generating|saving|processing|in progress|in-progress|ai-draft|in-review|loading|checking)/.test(value))return 'running';
 return 'pending';
}
const ATGV_STATUS_BADGES='.delivery-status,.handoff-badge,.project-health-badge,.br-state,.owner-status-pill,.design-kind-meta,.design-card-progress-message,.ba-question-state,.ba-inline-status,.atgv-page-feedback';
function atgvSyncStatusBadges(root=document){
 for(const badge of root.querySelectorAll(ATGV_STATUS_BADGES)){
  if(badge.classList.contains('atgv-page-feedback')||badge.classList.contains('ba-inline-status'))continue;
  const existing=badge.getAttribute('data-atgv-status');
  const severity=atgvSeverity(badge.textContent);
  if(existing!==severity)badge.setAttribute('data-atgv-status',severity);
 }
}
const ATGV_NAV_PATHS={overview:'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z', 'sdlc-roles':'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-2a8 8 0 0 1 16 0v2',flow:BA_ICONS.refresh,documents:'M6 2h9l4 4v16H6z M9 11h7 M9 15h7 M9 19h5',planning:'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',knowledge:'M4 8a8 8 0 0 1 16 0c0 8-8 13-8 13S4 16 4 8z M9 9h6 M9 13h6',operations:BA_ICONS.shield,settings:ATGV_ACTION_ICONS.settings,library:'M3 4h7v16H3z M12 4h9v16h-9z M15 8h3 M15 12h3'};
function atgvSyncNavigationIcons(root=document){
 for(const button of root.querySelectorAll('.nav-item[data-nav]')){
  const slot=button.querySelector('.nav-icon');
  if(!slot||slot.querySelector('svg'))continue;
  const path=ATGV_NAV_PATHS[button.dataset.nav];if(!path)continue;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const mark=document.createElementNS('http://www.w3.org/2000/svg','path');mark.setAttribute('d',path);svg.append(mark);
  slot.textContent='';slot.setAttribute('aria-hidden','true');slot.append(svg);
 }
}
// Retains click handlers, disabled states and permissions while leaving a single
// contextual primary action visible. Applies only to work cards, never toolbars.
function atgvConsolidateHandoffActions(root=document){
 for(const card of root.querySelectorAll('.handoff-row:not([data-atgv-actions-grouped])')){
  const actions=[...card.children].filter(node=>node.tagName==='BUTTON');
  if(actions.length<2)continue;
  const main=actions.find(b=>/^(start work|resume work|selected)$/i.test(b.textContent.trim()))||actions.find(b=>!b.disabled)||actions[0];
  const secondary=actions.filter(b=>b!==main);
  const group=document.createElement('div');group.className='atgv-row-actions';
  const menu=document.createElement('details');menu.className='atgv-secondary-actions atgv-action-menu';
  menu.append(atgvMoreActionsSummary('work ownership'),...secondary);
  main.classList.toggle('secondary',main.disabled);group.append(main,menu);card.append(group);
  card.dataset.atgvActionsGrouped='true';
 }
}
function atgvCloseSecondaryMenus(event){
 if(event.type==='keydown'&&event.key!=='Escape')return;
 for(const details of document.querySelectorAll('details.atgv-secondary-actions[open],details.br-actions-menu[open]')){
  const clickedItem=event.type==='click'&&details.contains(event.target)&&
   !!event.target.closest('button,a,[role="menuitem"]');
  if(event.type==='keydown'||!details.contains(event.target)||clickedItem){
   details.open=false;
   // Escape returns keyboard focus to the control that opened the menu.
   if(event.type==='keydown'&&details.contains(document.activeElement))details.querySelector('summary')?.focus();
  }
 }
}
document.addEventListener('keydown',atgvCloseSecondaryMenus);
document.addEventListener('click',atgvCloseSecondaryMenus);
function atgvSynchronizeUi(){atgvDecorateControls();atgvSyncNavigationIcons();atgvSyncStatusBadges();atgvConsolidateHandoffActions();}
let atgvDecorationQueued=false;
const atgvDecorateSoon=()=>{if(atgvDecorationQueued)return;atgvDecorationQueued=true;queueMicrotask(()=>{atgvDecorationQueued=false;atgvSynchronizeUi();});};
// Covers generated cards and modal actions while avoiding repeated DOM writes.
new MutationObserver(atgvDecorateSoon).observe(document.body,{childList:true,subtree:true});
window.addEventListener('atgv:viewchange',atgvDecorateSoon);
let projects=[],activeId=null,editingId=null,view='landing',spaces=[],jiraProjects=[],extensionSettings={},techStacks=[],selectedTechStackId='',statusText='';
const testRevisions={jira:0,github:0};
let catalogState=null,catalogBusyUI=false;
let projectSdlcSummary=null,roleStepData={roles:[]},selectedRoleStep='',selectedNav='overview',selectedRole='business-analyst',roleData={roles:[],progress:{},files:{}},unifiedRepository=null;
let opsOwnerLoaded=false,opsOwnerMe=null,opsOwnerScope=null,opsOwnerBusy=false,handoffOwnerBusy=null,opsOwnerCached=false,opsOwnerPending=[];
let roleSettings={roles:[],enabled:[],revision:null},roleSettingsDirty=false,editingCustomRole=null,selectedHandoffBrId=null,handoffOwnership={me:null,documents:[],scope:null},timelineData={tasks:[],revision:null},roleTimelineDirty=false,bulkTimelineDirty=false,bulkTimelineSaving=false;
let opening={phase:'search',candidate:null,warnings:[]},gateBusy=false,workspaceOpened=false,workspaceFolderAvailable=false;
let healthData=null;
let usedRoleIds=new Set(),designState=null,approvedDesignHash='',designSelected=null,designBusy=false,designDirty=false,designBusyKind='',designProcessState={},designBatchPending=false;
let blueprintRegistry=null,blueprintAssessment=null,blueprintBusy=false;
let recentIds=[],projectReadiness={},unmanagedFolders=[],gateError='',gateOfflineAvailable=false;
let baShowChangeProposal=false;
let baReopenQuestions=false,baReopenDocuments=false,baViewedStep=null,baPreviousStage='',baLastActiveStep='',baProgressProjectId='',baFailedProcess='',baFailedMessage='';
// A resumable BR card is a return-to-work affordance, never an overlay during active editing.
let baResumeCardReady=false;
function baHasRecoverableBR(state){
 return !!state?.restartPending||!!(state?.sourceDocuments||[]).length||(state?.brs||[]).some(br=>!br.archivedFromRestart&&br.status!=='retired'&&(br.status!=='approved'||br.needsRefresh));
}

let jiraPublishState={phase:'idle',confirmed:0,total:0,message:'No Jira publication is running.',currentKey:'',error:''};
let jiraPublicationPlan=[],jiraPublicationConfirmed=new Map();
let jiraPreviewFieldsByPath={};
let jiraPlanForCR=[],jiraLinkCandidates=[],jiraPreflightBlocked=false,jiraProtectionForCR=[],jiraPreviewIssueTypes={},jiraPreviewProject='',discoveryAutosaving=false,discoveryAutosaveSnapshot=null;
let brRoleRepairPreview=null,brRoleRepairBusy=false;
let mappingRunPhase='',mappingRetryAvailable=false,mappingFailureMessage='',mappingFailurePhase='',baPreflightInfo=null,reviewStopReason='',restoredMappingEpoch=null,sourceSelectedDigests=new Set(),jiraBrowseBaseUrl='',discoveryData=null,discoveryDirty=false,discoveryImportProposal=null,discoveryImportQueue=[],discoveryImportBusy=false,sourceRemoving=false,discoveryReviewProposal=null,preserveReviewOnSave=false,applyingAiReview=false,flowData=null,brState=null,brEditing=null,brPlanRevision=null,brJiraPreviewApproved=false,brQuill=null,brReadOnly=false,baOwnerState=null,baBusyTask='',brEditorDirty=false,brEditorSaving=false,brApprovePending=false,brJiraPlanChanges=0,brJiraPlanConflicts=0,pendingUploadAfterClaim=false,reviewApplyRetry=null,reviewApplyPhase='',reviewApplyRetryAvailable=false,reviewStageState=null;
let mappingResumeAvailable=false;
let aiProposalSelected=null,aiServiceLastProject=null;
let deliveryState={items:[]},deliveryInfo=null,deliveryDraftDirty=false,deliveryBusy=false,deliveryTab='editor';
let spaceSearchSequence=0,gateSearchId=null,settingsSearchId=null,gateSearched=false,modelPickerChoice='',modelPickerCurrent='',modelPickerData=null,modelPickerSaving=false;
let activeDoc=null,quill=null,docDirty=false,docMode='quill',docComplex=false,docSaving=false,docBackTo='work',documentOwner=null,documentOwnerScope='local',documentOwnerMe=null,documentOwnerCached=false,activeDiagram=null,diagramCanvas=null,diagramDirty=false,diagramSaving=false;
const send=(command,extra={})=>vscode.postMessage({command,...extra});
for(const id of ['reportIssue','gateReportIssue'])$(id)?.addEventListener('click',()=>send('openIssueReport',{screen:id==='gateReportIssue'?'start':typeof view==='string'?view:''}));
let aiChangeResolutionView=window.ATGVAIChangeResolution.createChangeResolutionView(
 document.getElementById('atgv-ai-change-resolution'),
 {send:message=>send('aiChangeResolution',{action:message.action,issueId:message.issueId,instructions:message.instructions})}
);
function refreshAIChangeResolution(){if(activeId)send('aiChangeResolution',{action:'refresh'});}
window.addEventListener('message',event=>{
 const msg=event.data;
 if(!msg||!String(msg.type||'').startsWith('aiChangeResolution/'))return;
 if(msg.projectId&&msg.projectId!==activeId)return;
 aiChangeResolutionView.receive(msg);
});
let hostModalQueue=[],hostModalCurrent=null;
document.body.appendChild($('hostDialog'));
function hostDialogNext(){
 if(hostModalCurrent||!hostModalQueue.length)return;
 hostModalCurrent=hostModalQueue.shift();const req=hostModalCurrent;
 $('hostDialogTitle').textContent=req.dialogType==='confirm'?'Confirm action':req.dialogType==='select'?'Choose an option':'Enter information';
 $('hostDialogMessage').textContent=req.message;
 $('hostDialogViewDetails').classList.toggle('hidden',!req.hasDetails);
 $('hostDialogViewDetails').textContent=req.detailsLabel||'View Full Deletion Preview';
 const input=$('hostDialogInput');const showInput=req.dialogType!=='confirm';
 input.classList.toggle('hidden',!showInput);$('hostDialogInputLabel').classList.toggle('hidden',!showInput);
 if(req.dialogType==='select'){input.value='';input.classList.add('hidden');const select=$('hostDialogSelect');select.replaceChildren();select.classList.remove('hidden');for(const [index,entry] of (req.items||[]).entries()){const option=document.createElement('option');option.value=String(index);option.textContent=typeof entry==='string'?entry:entry.label||String(entry);select.append(option);}}
 else {input.value=req.value||'';input.type=req.password?'password':'text';input.placeholder=req.placeholder||'';}
 $('hostDialogError').textContent='';$('hostDialogConfirm').textContent=req.confirm||'Confirm';
 $('hostDialog').classList.remove('hidden');$('hostDialog').setAttribute('aria-hidden','false');
 (req.dialogType==='input'?input: req.dialogType==='select'?$('hostDialogSelect'):$('hostDialogConfirm')).focus();
}
function resolveHostDialog(accepted){
 const req=hostModalCurrent;if(!req)return;
 const input=$('hostDialogInput'),select=$('hostDialogSelect');
 let value=req.dialogType==='confirm'?(req.confirm||'Confirm'):req.dialogType==='input'?input.value:select?(req.items||[])[Number(select.value)]:undefined;
 if(req.dialogType==='input'&&accepted&&req.password&&!String(value).trim()){$('hostDialogError').textContent='A value is required.';input.focus();return;}
 $('hostDialog').classList.add('hidden');$('hostDialog').setAttribute('aria-hidden','true');if(select){select.classList.add('hidden');select.replaceChildren();}input.value='';input.type='text';
 hostModalCurrent=null;send('hostDialogResponse',{requestId:req.requestId,accepted,value:accepted?value:undefined});hostDialogNext();
}
$('hostDialogCancel').addEventListener('click',()=>resolveHostDialog(false));
$('hostDialogConfirm').addEventListener('click',()=>resolveHostDialog(true));
$('hostDialogViewDetails').addEventListener('click',e=>{e.preventDefault();if(hostModalCurrent?.hasDetails)send('hostDialogViewDetails',{requestId:hostModalCurrent.requestId});});
$('hostDialogInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();resolveHostDialog(true);}});
$('hostDialog').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();resolveHostDialog(false);}});

const val=(project,group,key)=>project?.settings?.[group]?.[key]||'';
function renderAIService(data){
 if(!data)return;
 const c=data.config||{enabled:false,interval:60,mode:'vscode'};
 if(aiServiceLastProject!==activeId){$('aiServiceEnabled').checked=!!c.enabled;$('aiServiceInterval').value=c.interval||60;$('aiServiceMode').value=c.mode||'vscode';aiServiceLastProject=activeId;}
 $('aiServiceBadge').textContent=data.error?'Unavailable':c.enabled?'Enabled':'Disabled';settingsServiceReady=!data.error&&!!c.enabled;updateExtensionSettingBadges();
 const runs=data.runs||[],last=runs[0];
 $('aiServiceSummary').textContent=data.error?'Memory: '+data.error:[`Memory: ${data.approved||0} approved BR revisions`,`${data.queued||0} pending proposals`,`${data.failed||0} failed jobs`,`Worker: ${data.worker||'Unavailable'}`,`Shared sync: ${data.sync||'Never'}`,`Last run: ${last?.started||'Never'} (${last?.status||'Idle'})`,`Next estimated run: ${data.nextRun||'Not scheduled'}`].join(' · ');
 const history=$('aiServiceHistory');history.replaceChildren();for(const item of runs.slice(0,10)){const row=document.createElement('div');row.className='ai-proposal-row';row.textContent=`${item.started} · ${item.status} · ${item.generated||0} generated${item.error?' · '+item.error:''}`;history.append(row);}if(!runs.length)history.textContent='No execution history yet.';
 const failures=$('aiServiceFailures');failures.replaceChildren();for(const job of (data.jobs||[]).filter(x=>x.state==='failed').slice(0,20)){const row=document.createElement('div');row.className='ai-proposal-row';const txt=document.createElement('span');txt.textContent=job.document_id+' · '+(job.error||'Generation failed');const retry=document.createElement('button');retry.textContent='Retry Check';retry.className='secondary';retry.addEventListener('click',()=>send('aiServiceRun'));row.append(txt,retry);failures.append(row);}if(!failures.childNodes.length)failures.textContent='No failed tasks.';
 const queue=$('aiServiceQueue');queue.replaceChildren();
 const pending=(data.proposals||[]).filter(x=>x.status==='pending');
 if(!pending.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='No AI proposals awaiting review.';queue.append(empty);}
 for(const item of pending){const row=document.createElement('div');row.className='ai-proposal-row';const title=document.createElement('span');title.textContent=`${item.document_id} · ${item.created||''}`;const button=document.createElement('button');button.className='secondary';button.textContent='Preview / Edit';button.addEventListener('click',()=>send('aiServiceGetProposal',{jobId:item.job_id}));row.append(title,button);queue.append(row);}
}
$('aiServiceSave').addEventListener('click',()=>{send('aiServiceSettings',{enabled:$('aiServiceEnabled').checked,interval:Number($('aiServiceInterval').value),mode:$('aiServiceMode').value});});
$('aiServiceInstall').addEventListener('click',()=>send('aiServiceInstall'));
$('aiServiceRemove').addEventListener('click',()=>send('aiServiceRemove'));
$('aiServiceRun').addEventListener('click',()=>send('aiServiceRun'));
$('aiServiceRefresh').addEventListener('click',()=>send('aiServiceRefresh'));
$('aiQueueRefresh').addEventListener('click',()=>send('aiServiceRefresh'));
$('aiProposalClose').addEventListener('click',()=>{$('aiServiceEditor').classList.add('hidden');aiProposalSelected=null;});
$('aiProposalAccept').addEventListener('click',()=>{if(aiProposalSelected)send('aiServiceProposalDecision',{jobId:aiProposalSelected.job_id,action:'accept',edited:$('aiProposalContent').value,expectedDigest:aiProposalSelected.base_digest});});
$('aiProposalReject').addEventListener('click',()=>{if(aiProposalSelected)send('aiServiceProposalDecision',{jobId:aiProposalSelected.job_id,action:'reject',expectedDigest:aiProposalSelected.base_digest});});
window.addEventListener('message',e=>{const m=e.data||{};if(m.type==='aiServiceState')renderAIService(m.value);if(m.type==='aiServiceProgress'){$('aiServiceProgressText').textContent=m.message||'Processing';$('aiServiceProgressBar').style.width=Math.max(0,Math.min(100,Number(m.percent)||0))+'%';}if(m.type==='aiServiceProposal'){aiProposalSelected=m.proposal;$('aiServiceEditor').classList.remove('hidden');$('aiProposalHeading').textContent=m.proposal.document_id;$('aiProposalBaseline').textContent='Baseline fingerprint: '+m.proposal.base_digest;$('aiProposalContent').value=m.proposal.content;}if(m.type==='aiServiceProposalDecided'){$('aiServiceEditor').classList.add('hidden');aiProposalSelected=null;send('aiServiceRefresh');}});
function renderModelPicker(){
 const root=$('modelPickerList');root.replaceChildren();
 const data=modelPickerData||{models:[],selected:'',recommended:''};
 const options=[{id:'',name:'Auto · Best available',vendor:'Recommended',detail:'Selects from currently accessible VS Code models'},...(data.models||[]).map(item=>({...item,detail:item.maxInputTokens?`${item.maxInputTokens.toLocaleString()} context tokens`:'Available in VS Code'}))];
 for(const item of options){
  const label=document.createElement('label');label.className='model-choice';
  const radio=document.createElement('input');radio.type='radio';radio.name='ai-model-choice';radio.value=item.id;radio.checked=modelPickerChoice===item.id;
  radio.addEventListener('change',()=>{modelPickerChoice=item.id;$('modelPickerApply').disabled=false;});
  const info=document.createElement('span');info.className='model-choice-info';
  const line=document.createElement('strong');line.textContent=item.name;
  const detail=document.createElement('small');detail.textContent=[item.vendor,item.detail].filter(Boolean).join(' · ');
  info.append(line,detail);label.append(radio,info);
  if(item.id&&item.id===data.recommended){const pill=document.createElement('span');pill.className='model-recommendation';pill.textContent='Best';label.append(pill);}
  root.append(label);
 }
 $('modelPickerStatus').textContent=data.error||(!data.models?.length?'No VS Code models are accessible. Connect an approved model or configure an endpoint in Model Settings.':'');
 $('modelPickerApply').disabled=modelPickerSaving||(modelPickerChoice!==''&&!(data.models||[]).some(item=>item.id===modelPickerChoice));
 $('modelPickerApply').textContent=modelPickerSaving?'Applying…':'Apply Model';
}
function openModelPicker(){
 modelPickerData=null;modelPickerSaving=false;modelPickerChoice='';
 $('modelPicker').classList.remove('hidden');$('modelPicker').setAttribute('aria-hidden','false');
 $('modelPickerList').textContent='Loading available models…';$('modelPickerApply').disabled=true;
 $('modelPickerStatus').textContent='Checking model availability…';
 send('listAiModels');$('modelPickerClose').focus();
}
function closeModelPicker(){if(modelPickerSaving)return;$('modelPicker').classList.add('hidden');$('modelPicker').setAttribute('aria-hidden','true');$('headerModel').focus();}
$('headerModel').addEventListener('click',openModelPicker);
$('modelPickerClose').addEventListener('click',closeModelPicker);
$('modelPickerCancel').addEventListener('click',closeModelPicker);
$('modelPicker').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModelPicker();});
$('modelPickerSettings').addEventListener('click',()=>send('openAiModelSettings'));
window.addEventListener('message',event=>{if(event.data?.type==='openAIProviderSettings'){$('modelPicker').classList.add('hidden');$('modelPicker').setAttribute('aria-hidden','true');navigate('settings');$('settingsAiGroup').open=true;requestAnimationFrame(()=>$('aiProvidersSection').scrollIntoView({block:'start',behavior:'smooth'}));}});
$('modelPickerApply').addEventListener('click',()=>{if($('modelPickerApply').disabled)return;modelPickerSaving=true;renderModelPicker();send('selectAiModel',{modelId:modelPickerChoice});});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modelPicker').classList.contains('hidden')){e.preventDefault();closeModelPicker();}});
window.addEventListener('message',e=>{
 const m=e.data;
 if(m?.type==='modelChoices'){
  modelPickerData=m;modelPickerCurrent=m.selected||'';
  if(!modelPickerSaving)modelPickerChoice=modelPickerCurrent;
  else{modelPickerSaving=false;modelPickerChoice=modelPickerCurrent;$('modelPicker').classList.add('hidden');$('modelPicker').setAttribute('aria-hidden','true');}
  renderModelPicker();
 }
 if(m?.type==='notice'&&m.error&&modelPickerSaving){modelPickerSaving=false;$('modelPickerStatus').textContent=m.message||'Model selection failed.';renderModelPicker();$('modelPickerStatus').textContent=m.message||'Model selection failed.';}
});

function renderWorkspaceSearch(scan){
 const status=scan?.status||'idle';
 const busy=status==='running'||status==='idle';
 const root=$('workspaceSearch');
 root.classList.toggle('hidden',!busy);
 const percent=Math.max(0,Math.min(100,Number(scan?.percent)||0));
 $('workspaceSearchFill').style.width=percent+'%';
 $('workspaceSearchPercent').textContent=percent+'%';
 $('workspaceSearchTrack').setAttribute('aria-valuenow',String(percent));
 $('workspaceSearchTitle').textContent=percent<35?'Searching current folder…':percent<90?'Loading project…':'Preparing workspace…';
 $('workspaceSearchMessage').textContent=scan?.message||'Checking for registered ATGV project files…';
 if(!busy&&scan?.message&&view==='gate')$('gateSearchMessage').textContent=scan.message;
}
const read=id=>$(id).value.trim();
const topNoticeQueue=[];
let pendingAiConsentId=null;
let topNoticeCurrent=null,topNoticeTimer=null,topNoticeLastKey='',topNoticeLastAt=0;
function topNoticeRoute(message,error=false,override=null){
 if(override)return override;
 const value=String(message||'').toLowerCase();
 if(/ownership|transfer|confluence/.test(value))return {label:'View Ownership',action:()=>navigate('operations')};
 if(/has not changed|uploaded|upload document|word|pdf/.test(value))return {label:'Uploaded Documents',action:()=>openBAWorkflowStep('upload')};
 if(/send document to ai|send to ai|select.*document|12.question mapping/.test(value))return {label:'Send to AI',action:()=>{if(openBAWorkflowStep('upload')&&!$('sourceProcessSubmit').disabled)$('sourceProcessSubmit').click();}};
 if(/jira/.test(value))return {label:'Jira Preview',action:()=>openBAWorkflowStep('jiraPreview')};
 return error?{label:'Dismiss',action:closeTopNotification}:null;
}
// Keep the live waveform in whichever shell row is actually visible. Reparent the
// existing canvas rather than restarting its animation or duplicating its state.
function syncMyWorkHeaderWaveHost(){
 if(typeof document==='undefined'||!document.body)return;
 const wave=$('myWorkHeaderWave'),header=$('appHeader'),notice=$('topNotification');
 if(!wave||!header||!notice)return;
 const aiVisible=document.body.classList.contains('atgv-mywork-chat-mode')||
  document.body.classList.contains('atgv-ba-ai-active')||
  document.body.classList.contains('atgv-global-ai-active');
 const host=topNoticeCurrent&&aiVisible?notice:header;
 if(wave.parentElement!==host)host.appendChild(wave);
}
if(typeof window!=='undefined'){
 window.ATGVSyncMyWorkHeaderWaveHost=syncMyWorkHeaderWaveHost;
 window.addEventListener('atgv:viewchange',syncMyWorkHeaderWaveHost);
}
function showTopNotification(item){
 topNoticeCurrent=item;
 syncMyWorkHeaderWaveHost();
 const target=$('topNotification');target.classList.remove('hidden','error','success','info');
 target.classList.add(item.error?'error':item.success?'success':'info');
 const severity=item.error?'error':item.success?'success':'warning';
 target.classList.remove('error','success','info','warning');target.classList.add(severity);
 const icons={error:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>',success:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',warning:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>'};
 $('topNotificationIcon').innerHTML=icons[severity];
 $('topNotificationText').textContent=item.message;
 const button=$('topNotificationAction');
 button.classList.toggle('hidden',!item.route);
 button.textContent=item.route?.label||'';
 $('appHeader').classList.add('hidden');
 clearTimeout(topNoticeTimer);
 // Process questions and actionable BA instructions stay visible until explicitly dismissed or acted upon.
 if(!item.consentRequestId&&!item.persistent)topNoticeTimer=setTimeout(closeTopNotification,item.error?20000:11000);
}
function closeTopNotification(){
 if(topNoticeCurrent?.consentRequestId){send('aiSendConsentResponse',{requestId:topNoticeCurrent.consentRequestId,accepted:false});pendingAiConsentId=null;}
 clearTimeout(topNoticeTimer);
 topNoticeCurrent=null;
 const next=topNoticeQueue.shift();
 if(next){showTopNotification(next);return;}
 $('topNotification').classList.add('hidden');
 $('appHeader').classList.remove('hidden');
 syncMyWorkHeaderWaveHost();
}
function notifyTop(message,{error=false,success=false,route=null,persistent=false}={}){
 const content=String(message||'').trim();if(!content)return;
 const now=Date.now(),key=content+'|'+error;
 if(key===topNoticeLastKey&&now-topNoticeLastAt<7000)return;
 topNoticeLastAt=now;topNoticeLastKey=key;
 const targetRoute=topNoticeRoute(content,error,route);
 const requiresAnswer=/\?\s*$/.test(content)||/select (?:the )?uploaded documents? and submit|human (?:review|approval) required/i.test(content);
 // Keep operational messages and errors in the process monitor, not in a disruptive top banner.
 // Explicit questions, consent requests and critical persistent instructions retain the banner.
 if(typeof view!=='undefined'&&view==='work'&&!persistent&&!requiresAnswer){if(!error&&!targetRoute)processActivityUpsert('status','Workspace Process',content,'done',100);return;}
 const item={message:content,error,success,persistent:!!(persistent||requiresAnswer),route:targetRoute};
 if(!topNoticeCurrent)showTopNotification(item);
 else if(error&&!topNoticeCurrent.error){topNoticeQueue.unshift(topNoticeCurrent);showTopNotification(item);}
 else {topNoticeQueue.push(item);if(topNoticeQueue.length>5){const removable=topNoticeQueue.findIndex(notice=>!notice.persistent&&!notice.consentRequestId);if(removable>=0)topNoticeQueue.splice(removable,1);}}
}
$('topNotificationDismiss').addEventListener('click',closeTopNotification);
$('topNotificationAction').addEventListener('click',()=>{const route=topNoticeCurrent?.route;if(topNoticeCurrent?.consentRequestId)topNoticeCurrent.consentRequestId=null;closeTopNotification();if(route)route.action();});
// Restart advice applies only while the workflow is on Upload. It must not
// remain on top after mapping, review, or generation has advanced.
function dismissObsoleteBARestartNotice(){
 const stale=item=>!!item&&/^(?:Business Requirements (?:started|restarted)|New Business Requirements cycle ready)\./i.test(item.message||'');
 const keep=topNoticeQueue.filter(item=>!stale(item));
 topNoticeQueue.splice(0,topNoticeQueue.length,...keep); // preserve const queue identity
 if(stale(topNoticeCurrent))closeTopNotification();
 const inline=$('baInlineStatus');
 if(inline&&/^(?:Business Requirements (?:started|restarted)|New Business Requirements cycle ready)\./i.test(inline.textContent||'')){
  inline.textContent='';inline.classList.add('hidden');
 }
}

function atgvInlineNotice(message,error=false){
 const pane=document.querySelector('#contentPane > main:not(.hidden)');if(!pane||pane.id==='gateView')return;
 // The AI-only My Work page displays global warnings in the top notification.
 // Never duplicate them inside the chat page; clean up any previous inline copy.
 if(pane.id==='myWorkView'){
  pane.querySelector('.atgv-page-feedback')?.remove();
  return;
 }
 // Errors are presented once in the global notification (and diagnostic logs),
 // never repeated in the right-hand content pane. Overview has no inline notices.
 if(error||pane.id==='landingView'){
  pane.querySelector('.atgv-page-feedback')?.remove();
  const inline=pane.id==='discoveryView'?pane.querySelector('#baInlineStatus'):null;
  if(inline){inline.textContent='';inline.classList.add('hidden');}
  return;
 }
 if(pane.id==='discoveryView'){
  const notice=$('baInlineStatus');if(!notice)return;
  if(error){notice.textContent='';notice.classList.add('hidden');return;} // Errors are shown once in the top notification.
  notice.textContent=String(message||'').slice(0,1000);
  notice.dataset.status=error?'error':atgvSeverity(message)==='warning'?'warning':atgvSeverity(message)==='success'?'success':'info';
  notice.setAttribute('role',error?'alert':'status');notice.setAttribute('aria-live',error?'assertive':'polite');
  notice.classList.toggle('hidden',!notice.textContent);return;
 }
 let region=pane.querySelector('.atgv-page-feedback');
 if(!region){
  region=document.createElement('div');region.className='atgv-page-feedback';
  const anchors={planningView:'#designStatus',workView:'#deliveryAiProgress',knowledgeView:'#knowledgeSyncStatus',documentEditorView:'#docEditorStatus',settingsView:'#jiraTestStatus'};
  const anchor=pane.querySelector(anchors[pane.id]||'.page-kicker');
  if(anchor)anchor.insertAdjacentElement('afterend',region);else pane.insertBefore(region,pane.firstChild);
 }
 region.textContent=String(message||'').slice(0,1000);
 region.dataset.status=error?'error':atgvSeverity(message)==='warning'?'warning':atgvSeverity(message)==='success'?'success':'info';
 region.setAttribute('role',error?'alert':'status');region.setAttribute('aria-live',error?'assertive':'polite');
 region.classList.toggle('hidden',!region.textContent);
}
// Unified, truthful per-process progress display in My Work. No synthetic percentages:
// undefined progress is rendered as indeterminate until a measured value arrives.
const atgvProcesses=new Map();let atgvProcessProject='';
function processActivityUpsert(id,title,message,state='running',percent=null){
 if(!id)return;
 if(atgvProcessProject!==String(activeId||'')){atgvProcesses.clear();atgvProcessProject=String(activeId||'');}
 const current=atgvProcesses.get(id)||{};
 atgvProcesses.delete(id);
 atgvProcesses.set(id,{id,title:title||current.title||'Operation',message:String(message||current.message||'').slice(0,1000),state,percent:Number.isFinite(Number(percent))&&percent!==null?Math.max(0,Math.min(100,Number(percent))):null,at:new Date().toLocaleTimeString()});
 while(atgvProcesses.size>16)atgvProcesses.delete(atgvProcesses.keys().next().value);
 renderProcessActivity();
}
function renderProcessMeter(data){
 const box=document.createElement('div');box.className='atgv-process-item is-'+data.state;
 const row=document.createElement('div');row.className='atgv-process-item-top';
 const title=document.createElement('strong');title.textContent=data.title;
 const state=document.createElement('span');state.className='atgv-process-state';state.textContent=data.state==='done'?'Complete':data.state==='failed'?'Failed':data.state==='pending'?'Pending':data.state==='blocked'?'Blocked':data.state==='cancelled'?'Cancelled':'Running';
 row.append(title,state);
 const progress=document.createElement('div');progress.className='atgv-process-meter'+(data.percent===null&&data.state==='running'?' indeterminate':'');
 progress.setAttribute('role','progressbar');progress.setAttribute('aria-label',data.title+' progress');
 if(data.percent!==null){progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');progress.setAttribute('aria-valuenow',String(data.percent));}
 else progress.setAttribute('aria-valuetext',state.textContent);
 const fill=document.createElement('span');fill.style.width=(data.percent??(data.state==='done'?100:0))+'%';progress.append(fill);
 const detail=document.createElement('p');detail.className='atgv-process-message';detail.textContent=data.message||state.textContent;
 box.append(row,progress,detail);return box;
}
function renderProcessActivity(){
 const target=$('processActivityRows');if(!target)return;
 target.replaceChildren();
 if(!atgvProcesses.size){const empty=document.createElement('p');empty.className='muted';empty.textContent='No recent operations. Select an action to view progress here.';target.append(empty);return;}
 for(const item of [...atgvProcesses.values()].reverse())target.append(renderProcessMeter(item));
}
function renderRoleProcesses(role,data){
 const target=$('roleProcessRows');if(!target)return;target.replaceChildren();
 if(!data?.steps?.length)return;
 const heading=document.createElement('strong');heading.className='atgv-process-subheading';heading.textContent=(role?.label||'Role')+' · Workflow steps';target.append(heading);
 for(const step of data.steps){
  const required=Number(step.requiredCount)||0,verified=Number(step.completed)||0;
  const percent=required>0?Math.round(Math.min(1,verified/required)*100):step.status==='completed'?100:null;
  const state=step.status==='completed'?'done':step.status==='blocked'?'blocked':'pending';
  const item=renderProcessMeter({title:step.title,message:verified+' of '+required+' outputs verified · '+(step.status||'pending'),state,percent});
  item.classList.add('atgv-role-process-item');item.tabIndex=0;item.setAttribute('role','button');item.setAttribute('aria-label','View '+step.title+' workflow details');
  const select=()=>{selectedRoleStep=step.id;renderRoleStepFlow(role);};
  item.addEventListener('click',select);item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
  target.append(item);
 }
}
function trackProcessEvent(m){
 if(!m||!m.type)return;
 if(m.type==='architectStackProgress')processActivityUpsert('stack', 'Technology Stack',m.message,'running',m.percent??null);
 else if(m.type==='architectStackState')processActivityUpsert('stack','Technology Stack',m.value?.message||'Stack process completed',/failed|error/i.test(m.value?.message||'')?'failed':'done',/failed|error/i.test(m.value?.message||'')?null:100);
 else if(m.type==='architectServerState')processActivityUpsert('server','Application Server',m.value?.message||'Server operation finished',/failed|error|unavailable/i.test(m.value?.message||'')?'failed':'done',/failed|error|unavailable/i.test(m.value?.message||'')?null:100);
 else if(m.type==='baProgress')processActivityUpsert('ba-'+(m.task||'workflow'),'Business Requirements · '+(m.task||'Workflow'),m.message||'Processing…',m.failed?'failed':m.done?'done':'running',m.done&&!m.failed?100:m.percent??null);
 else if(m.type==='deliveryProgress')processActivityUpsert('delivery','Document Delivery',m.message||'Processing…','running',m.percent??null);
 else if(m.type==='deliveryOperationCompleted')processActivityUpsert('delivery','Document Delivery',m.message||'Completed','done',100);
 else if(m.type==='deliveryOperationError')processActivityUpsert('delivery','Document Delivery',m.message||'Failed','failed');
 else if(m.type==='aiServiceProgress')processActivityUpsert('background-ai','Background AI Service',m.message||'Working…',m.percent===100?'done':'running',m.percent??null);
 else if(m.type==='devCopilotStartResult')processActivityUpsert('developer-ai','AI Development',m.value?.message||'Implementation proposal prepared','done',100);
 else if(m.type==='devCopilotStartError')processActivityUpsert('developer-ai','AI Development',m.message||'AI Development failed','failed');
 else if(m.type==='designProgress')processActivityUpsert('design-'+(m.kind||'generation'),'Solution Design',m.message||'Generating design…','running',m.percent??null);
 else if(m.type==='designActionError')processActivityUpsert('design-'+(m.kind||'generation'),'Solution Design',m.message||'Design generation failed','failed');
 else if(m.type==='designBatchDone')processActivityUpsert('design-generation','Solution Design',(m.count||0)+' design drafts generated','done',100);
 else if(m.type==='architectCatalogAction')processActivityUpsert('catalog','Remote SDLC Catalog',m.message||'Catalog checked',m.error?'failed':'done',m.error?null:100);
}
function status(message,error=false,{persistent=false}={}){if(message&&view==='work'){const serverError=error&&/(?:server|preview|approved stack branch|current branch|localhost)/i.test(message);const stackError=error&&!serverError&&/(?:stack|npm|dependency|git branch|bootstrap|build|install)/i.test(message);const id=serverError?'server':stackError?'stack':'status';processActivityUpsert(id,serverError?'Application Server':stackError?'Technology Stack':'Workspace Process',message,error?'failed':'done',error?null:100);}statusText=message||'';$('status').textContent=statusText;$('status').className='status hidden'+(error?' error':'');if(statusText){notifyTop(statusText,{error,success:!error&&atgvSeverity(statusText)==='success',persistent});atgvInlineNotice(statusText,error);}else atgvInlineNotice('',false);}
window.addEventListener('message',e=>trackProcessEvent(e.data));
function field(id,v=''){$(id).value=v;}

// Breadcrumbs are a presentation-only view of the existing navigation state.
// Never reinterpret an unsaved edit or publication gate as permission to leave.
let baBreadcrumbAtRequirements=false;
function workspaceBreadcrumbContext(){
 const modal=baRequirementModalTarget;
 const selectedBr=brEditing||modal?.scopeId||modal?.rootKey||'';
 const stage=baViewedStep||window.baLastGuideProgress?.find(step=>step.current)?.key||'start';
 return {view,roleId:selectedRole,stage,rootOnly:view==='discovery'&&!baBreadcrumbAtRequirements&&!modal&&!brEditing,
  requirementOpen:baBreadcrumbAtRequirements||!!modal||!!brEditing,
  brId:view==='discovery'?selectedBr:view==='uxPreview'?uxSelectedKey:
   view==='work'&&selectedRole==='software-developer'?$('developerBrSelect')?.value:'',
  documentTitle:view==='documentEditor'?$('docEditorTitle')?.textContent:''};
}
function workspaceBreadcrumbAction(action){
 if(!action)return;
 if(action==='my-work'){navigate('sdlc-roles');return;}
 if(action==='role-workspace'){navigate('role-workspace');return;}
 if(action==='br-home'){
  if(view!=='discovery'){navigate('discovery');return;}
  // Modals may contain unsaved edits: never discard them to navigate.
  if(brEditing&&!closeBREditor())return;
  if(baRequirementModalTarget)closeBARequirementModal();
  baBreadcrumbAtRequirements=action==='br-home';
  baViewedStep='start';
  renderDiscoverySummary();
  if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
  return;
 }
 if(action==='ux-work'){navigate('ux-designer');return;}
 navigate(action);
}
// Workspace pages now use their own page headings. Do not render duplicate
// blue navigation trails in the right pane or its modal dialogs.
function renderWorkspaceBreadcrumbs(){
 const roots=document.querySelectorAll('#contentPane > main, #brEditModal .br-edit-card, #baRequirementModal .ba-requirement-modal-card');
 for(const root of roots){
  root.querySelectorAll('.atgv-workspace-breadcrumbs').forEach(node=>node.remove());
  root.classList.remove('has-workspace-breadcrumb');
 }
}

function setView(next){
  // Hide every workspace page, not just a fixed list. A newly added page must
  // never remain visible behind another menu or expose the wrong workflow.
  const pages=[...document.querySelectorAll('#contentPane > main')];
  const targetId=next==='landing'?'landingView':['baOverview','discovery'].includes(next)?'workView':next+'View';
  const target=document.getElementById(targetId);
  if(!target||!pages.includes(target)){
    console.error('ATGV: Workspace page not found:',next);
    return;
  }
  // Show the in-progress BR summary only after leaving this page and returning.
  // An empty upload placeholder has no recoverable content and needs no card.
  // Navigation never stops an active host-side mapping, Jira publication or
  // another long-running process. Preserve the active BR step across screens.
  const baProcessRunning=(typeof discoveryImportBusy!=='undefined'&&discoveryImportBusy)||
    (typeof baBusyTask!=='undefined'&&!!baBusyTask)||
    (typeof mappingRunPhase!=='undefined'&&['preparing','preflight','repair','mapping','committing'].includes(mappingRunPhase));
  if(view==='discovery'&&next!=='discovery'){
    if(!baProcessRunning){baResumeCardReady=baHasRecoverableBR(brState);baViewedStep=null;}
  }else if(next==='discovery'&&view!=='discovery'&&baResumeCardReady&&!baProcessRunning){
    baViewedStep='start';
  }
  // The BR details dialog is now a visible workView overlay, not a child of
  // the hidden workflow panel. Close it whenever the user leaves the BA overview.
  if(view==='baOverview'&&next!=='baOverview'&&typeof baRequirementModalTarget!=='undefined'&&baRequirementModalTarget)
    closeBARequirementModal(false);
  for(const page of pages)page.classList.toggle('hidden',page!==target);
  if(next==='myWork')target.querySelector?.('.atgv-page-feedback')?.remove();
  // The BA workflow and project inventory are separate views in the role workspace.
  $('discoveryView').classList.toggle('hidden',next!=='discovery');
  $('baRequirementsOverview')?.classList.toggle('hidden',next!=='baOverview');
  $('workView')?.classList.toggle('ba-project-overview',next==='baOverview');
  view=next;
  if(typeof syncSdlcWorkspaceShell==='function')syncSdlcWorkspaceShell(next);
  if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
  // Only My Work owns a three-zone, full-height chat layout; all role work pages retain normal scrolling.
  document.body?.classList?.toggle?.('atgv-mywork-chat-mode',next==='myWork');
  $('contentPane').scrollTop=0;
  window.dispatchEvent(new Event('atgv:viewchange'));
}
function cell(row,text){const el=document.createElement('td');el.textContent=text;row.append(el);}
function showGate(){
  workspaceOpened=false;gateBusy=false;document.body.classList.add('gate-mode');
  setView('gate');renderGate();
}
function gateOpeningPercent(percent,message){
 const value=Math.max(0,Math.min(100,Number(percent)||0));
 $('gateOpenFill').style.width=value+'%';
 $('gateOpenPercent').textContent=value+'%';
 $('gateOpenTrack').setAttribute('aria-valuenow',String(value));
 $('gateOpenTrack').setAttribute('aria-valuetext',String(message||'Opening project'));
 $('gateProgressText').textContent=message||'Opening project…';
}
function launchFromGate(selection={}){
  if(gateBusy)return;
  gateError='';gateOfflineAvailable=false;gateBusy=true;
  $('gateProgress').classList.remove('hidden');
  gateOpeningPercent(5,'Selecting project…');
  renderGate();
  send('openingAuto',selection);
}
function renderGate(){
  // Project row actions already launch the complete opening sequence.
  $('gateFinder').classList.toggle('hidden',startupSetupRequired);
  $('gateProgress').classList.toggle('hidden',!gateBusy);
  $('gateOpeningError').textContent=gateError;
  $('gateOpeningError').classList.toggle('hidden',!gateError);
  $('gateRecovery').classList.toggle('hidden',!gateOfflineAvailable);
  $('gateOffline').disabled=gateBusy;
  $('gateSearchPrevious').disabled=gateBusy;
  renderGateResults();
}
function gateProjectRow(root,project,{recent=false}={}){
  const row=document.createElement('div');row.className='gate-result gate-project-card';
  const text=document.createElement('div');text.className='gate-result-title';
  const title=document.createElement('strong');title.textContent=project.name;
  const meta=document.createElement('small');meta.textContent=[project.settings?.confluence?.spaceKey||'Local project',projectReadiness[project.id]?'Ready':'Setup required'].join('  ·  ');
  text.append(title,meta);
  const action=document.createElement('button');action.type='button';action.textContent=projectReadiness[project.id]?'Open Project':'Set Up & Open';
  action.disabled=gateBusy;action.setAttribute('aria-busy',String(gateBusy));action.addEventListener('click',()=>launchFromGate({projectId:project.id}));
  row.append(text,action);root.append(row);
}
function renderGateResults(){
  const q=read('gateQuery').replace(/\s+/g,' ').toLocaleLowerCase();
  const all=projects.filter(p=>[p.name,p.id,p.settings?.confluence?.spaceKey||'',p.settings?.jira?.projectKey||''].some(x=>x.toLowerCase().includes(q)));
  const recent=$('gateRecent');recent.replaceChildren();
  const recentProjects=recentIds.map(id=>all.find(p=>p.id===id)).filter(Boolean);
  $('gateRecentSection').classList.toggle('hidden',recentProjects.length===0);
  for(const p of recentProjects)gateProjectRow(recent,p,{recent:true});
  const local=$('gateLocal');local.replaceChildren();
  const others=all.filter(p=>!recentIds.includes(p.id));
  $('gateWorkspaceSection').classList.toggle('hidden',!others.length&&!!recentProjects.length);
  if(!others.length&&!recentProjects.length){const p=document.createElement('p');p.className='muted';p.textContent=q?'No matching local projects. Search Confluence to discover more.':'No saved projects. Search Confluence or create a project.';local.append(p);}
  for(const p of others)gateProjectRow(local,p);
  const unregistered=$('gateUnmanaged');unregistered.replaceChildren();
  const candidates=unmanagedFolders.filter(item=>[item.folder,item.id,item.name].some(value=>value.toLowerCase().includes(q)));
  $('gateUnmanagedSection').classList.toggle('hidden',!candidates.length);
  for(const item of candidates){
    const row=document.createElement('div');row.className='gate-result gate-project-card';
    const info=document.createElement('div');info.className='gate-result-title';
    const title=document.createElement('strong');title.textContent=item.folder+' → '+item.id;
    const detail=document.createElement('small');detail.textContent=item.blocked?item.reason:item.hasManifest?'Existing ATGV configuration':'Unregistered folder';
    info.append(title,detail);
    const action=document.createElement('button');action.type='button';action.textContent=item.blocked?'Conflict':'Import Folder';
    action.className=item.blocked?'secondary':'';action.disabled=gateBusy||item.blocked;
    action.addEventListener('click',()=>send('importProjectFolder',{folder:item.folder}));
    row.append(info,action);unregistered.append(row);
  }
  const remote=$('gateRemote');remote.replaceChildren();
  const matched=spaces.filter(sp=>!all.some(p=>p.settings?.confluence?.spaceId===sp.id||(p.settings?.confluence?.spaceKey===sp.key&&p.settings?.confluence?.baseUrl===sp.baseUrl))).slice(0,10);
  $('gateRemoteSection').classList.toggle('hidden',!matched.length);
  $('gateResultsCount').textContent=`${matched.length} spaces`;
  for(const sp of matched){
    const row=document.createElement('div');row.className='gate-result';
    const text=document.createElement('div');text.className='gate-result-title';
    const title=document.createElement('strong');title.textContent=sp.name;
    const meta=document.createElement('small');meta.textContent=sp.key;
    text.append(title,meta);
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Set Up & Open';
    button.disabled=gateBusy;button.addEventListener('click',()=>launchFromGate({spaceId:sp.id}));
    row.append(text,button);remote.append(row);
  }
}
$('gateOpenFolder').addEventListener('click',()=>send('openWorkspaceFolder'));
for(const [id,provider] of [['guideJiraTokenLink','jira'],['guideConfluenceTokenLink','confluence'],['guideGithubTokenLink','github']])$(id).addEventListener('click',()=>send('guideTokenLink',{provider}));
$('gateSearch').addEventListener('click',()=>{
  if(gateBusy)return;
  const q=read('gateQuery');renderGateResults();
  if(q.length<2){status('Enter at least 2 characters to search Confluence spaces.',true);return;}
  const requestId=++spaceSearchSequence;gateSearchId=requestId;gateSearched=true;spaces=[];$('gateSearchMessage').textContent='';renderGateResults();
  $('gateProgress').classList.remove('hidden');$('gateProgressText').textContent='Searching Confluence…';
  send('discover',{query:q,origin:'gate',requestId});
});
$('gateQuery').addEventListener('input',()=>{gateSearchId=null;spaces=[];gateSearched=false;$('gateSearchMessage').textContent='';renderGateResults();});
$('gateQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('gateSearch').click();}});
$('gateManual').addEventListener('click',()=>openProject());
$('gateSearchPrevious').addEventListener('click',()=>{
 if(gateBusy)return;
 startupReturnToConnections=true;startupPage=1;
 showStartupStep(true);
 $(startupConnectionVerified?'startupTestSavedConnections':'startupJiraUrl').focus();
});
$('gateOffline').addEventListener('click',()=>{
  if(gateBusy||!gateOfflineAvailable)return;
  gateBusy=true;gateError='';gateOfflineAvailable=false;gateOpeningPercent(5,'Opening local workspace…');renderGate();send('openingOffline');
});
function renderSpaceTable(id,rows){
  const root=$(id);root.replaceChildren();
  if(!rows.length){const p=document.createElement('p');p.className='muted';p.textContent='No matching Confluence spaces found, or access has not been configured.';root.append(p);return;}
  const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr');
  for(const label of ['Space ID','Space Key','Space Name','Confluence URL','']){
    const th=document.createElement('th');th.textContent=label;header.append(th);
  }
  head.append(header);table.append(head);
  const body=document.createElement('tbody');
  for(const sp of rows){
    const tr=document.createElement('tr');
    for(const key of ['id','key','name','baseUrl'])cell(tr,sp[key]||'');
    const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';
    const matching=projects.find(p=>(p.settings?.confluence?.spaceId&&p.settings.confluence.spaceId===sp.id)||
      (p.settings?.confluence?.spaceKey===sp.key&&(p.settings?.confluence?.baseUrl||extensionSettings.jira?.baseUrl+'/wiki')===sp.baseUrl));
    button.textContent=view==='project'?(matching?.id===editingId?'Selected':'Select space'):(matching?'Open':'Use project');
    button.addEventListener('click',()=>{
      if(view!=='project'){openProject(matching?.id||null,sp);return;}
      // Choosing a space edits only the visible project's unsaved form.
      // Never switch to another project or update a remote mapping implicitly.
      for(const [key,value] of [['spaceId',sp.id],['spaceKey',sp.key],['spaceName',sp.name],['baseUrl',sp.baseUrl]])field('confluence.'+key,value||'');
      $('settingsSpaceMessage').textContent='Selected '+(sp.key||sp.name)+'. Save Project Settings to apply this space to '+(read('name')||'the new project')+'.'+(matching&&matching.id!==editingId?' This space is already mapped to '+matching.name+'; verify your choice.':'');
    });
    action.append(button);tr.append(action);body.append(tr);
  }
  table.append(body);root.append(table);
}
function renderDiscovered(){
  renderSpaceTable('settingsSpaces',spaces);
}
function renderTechStacks(){
  const root=$('techStackGrid');root.replaceChildren();
  const items=techStacks;
  $('clearTechStack').setAttribute('aria-pressed',String(selectedTechStackId===''));
  for(const stack of items){
    const button=document.createElement('button');button.type='button';button.className='tech-card';
    button.style.setProperty('--tech-accent',stack.accent);button.setAttribute('aria-pressed',String(selectedTechStackId===stack.id));
    const title=document.createElement('strong');title.className='tech-title';title.textContent=stack.label;
    const runtime=document.createElement('span');runtime.className='tech-runtime';runtime.textContent=stack.runtime+(stack.language?' • '+stack.language:'')+(stack.buildTool?' • '+stack.buildTool:'');
    const group=(label,values)=>{const wrap=document.createElement('div');wrap.className='tech-group';const heading=document.createElement('b');heading.textContent=label;const desc=document.createElement('span');desc.textContent=values.length?values.join(' • '):'TBD';wrap.append(heading,desc);return wrap;};
    button.append(title,runtime);
    if(stack.id){button.append(group('UNIT / COMPONENT',stack.unit),group('INTEGRATION / CONTRACT / E2E',[...stack.integration,...stack.e2e]),group('TEMPLATE', [stack.templateRepository]));}
    else{const note=document.createElement('span');note.textContent='Leave technology selection open';button.append(note);}
    button.addEventListener('click',()=>{selectedTechStackId=stack.id;renderTechStacks();});root.append(button);
  }
}
function openProject(id=null,source=null){
  editingId=id;const p=projects.find(x=>x.id===id);selectedTechStackId=p?.techStackId||'';renderTechStacks();
  field('name',p?.name||source?.name||'');field('id',p?.id||'');$('id').readOnly=!!p;
  field('projectStartDate',p?.schedule?.startDate||'');field('projectEndDate',p?.schedule?.endDate||'');
  $('projectPreviewWithoutTests').checked=p?.settings?.development?.previewWithoutTests===true;
  const confluence=p?.settings?.confluence||{};
  field('confluence.spaceId',confluence.spaceId||source?.id||'');
  field('confluence.spaceKey',confluence.spaceKey||source?.key||'');
  field('confluence.spaceName',confluence.spaceName||source?.name||'');
  field('confluence.baseUrl',confluence.baseUrl||source?.baseUrl||'');
  const matching=jiraProjects.find(x=>x.key.toLowerCase()===(source?.key||'').toLowerCase());
  field('jira.projectKey',val(p,'jira','projectKey')||matching?.key||'');
  for(const input of ['jira.baseUrl','jira.email','jira.jql','confluence.parentPageId','github.owner','github.repo','github.branch','github.pathPrefix','github.apiUrl']){
    const [group,key]=input.split('.');field(input,val(p,group,key));
  }
  field('github.branch','main');
  $('projectGithubRepositoryUrl').value=read('github.owner')&&read('github.repo')?'https://github.com/'+read('github.owner')+'/'+read('github.repo'):'';
                                                                              
  if(p?.settings?.atlassian){field('jira.baseUrl',p.settings.atlassian.baseUrl||'');field('jira.email',p.settings.atlassian.email||'');}
  $('formTitle').textContent=p?'Project Settings: '+p.name:'New Project';
  $('folderNote').textContent=p?`projects/${p.id}/atgv.project.json`:'Creates projects/<project-id>/atgv.project.json';
  $('save').textContent=p?'Save project settings':'Create project';
  $('showFolder').disabled=!p;
  $('connectionActions').classList.toggle('hidden',!p);
  // Avoid displaying roles and automation for another active project while editing.
  const activeScope=!!p&&p.id===activeId&&workspaceOpened;
  $('projectScopedOptions').classList.toggle('hidden',!activeScope);
  $('projectScopeLabel').textContent=p?'Scope: '+p.name:'Scope: New project';
  collapseProjectSettings();
  $('projectView').dataset.loadedFor=p?.id||'';
  setView('project');
}
function readProjectForm(){
  const projectRepoUrl=$('projectGithubRepositoryUrl').value.trim();
  const parsed=projectRepoUrl?parseGithubRepositoryUrl(projectRepoUrl):null;
  if(projectRepoUrl&&!parsed)throw Error('Enter a valid https://github.com/OWNER/REPOSITORY project URL.');
  field('github.owner',parsed?.owner||'');field('github.repo',parsed?.repo||'');
  const names=['confluence.spaceId','confluence.spaceKey','confluence.spaceName','confluence.baseUrl','confluence.parentPageId',
    'jira.baseUrl','jira.email','jira.projectKey','jira.jql','github.owner','github.repo','github.branch','github.pathPrefix','github.apiUrl'];
  const settings={jira:{},confluence:{},github:{},development:{previewWithoutTests:$('projectPreviewWithoutTests').checked}};
  for(const input of names){const [group,key]=input.split('.');settings[group][key]=read(input);}
  settings.github.branch='main';
  return {id:read('id'),name:read('name'),techStackId:selectedTechStackId,schedule:{startDate:read('projectStartDate'),endDate:read('projectEndDate')},settings};
}
function catalogFormConfig(){return {repositoryUrl:'https://github.com/aidilazharo/tech-stacks-skills',ref:'main',authentication:read('catalogAuth'),autoCheck:$('catalogAutoCheck').checked,offlineCache:true};}
// Show the actual configured Jira email, never a guessed full name.
function updateHeaderUserName(email){
 const address=String(email||'').trim().toLowerCase();
 const valid=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address);
 $('headerUserName').textContent=valid?address:'Not configured';
 $('headerUserName').title=valid?'Jira account: '+address:'Configure your Jira email in Settings';
}
function fitBrandVersionLines(){
 // The version line must match the rendered title width at both screen sizes,
 // while remaining inside the logo/title block. Measure actual font metrics.
 for(const [titleSelector,versionSelector,maxFont] of [
  ['.app-header .brand-name','.app-header .brand-versions',11],
  ['.gate-product-title h1','.gate-brand-versions',14]
 ]){
  const title=document.querySelector(titleSelector),version=document.querySelector(versionSelector);
  if(!title||!version)continue;
  const width=title.getBoundingClientRect().width;
  if(!width)continue;
  const context=document.createElement('canvas').getContext('2d');
  if(!context)continue;
  const style=getComputedStyle(version),label=version.textContent||'';
  version.style.letterSpacing='0';
  let low=6,high=maxFont;
  for(let i=0;i<16;i++){
   const mid=(low+high)/2;
   context.font=(style.fontWeight||'500')+' '+mid+'px '+(style.fontFamily||'sans-serif');
   if(context.measureText(label).width>width)high=mid;else low=mid;
  }
  version.style.fontSize=low.toFixed(2)+'px';
  version.style.maxWidth=width.toFixed(1)+'px';
 }
}
// The active workspace Library is distinct from a newer GitHub main release.
function updateBrandLibraryVersion(state){
 // The title shows only the active, verified workspace Library, never the GitHub available version.
 const installed=String(state?.installed?.version||'').trim();
 const label=installed?' · Library v'+installed:' · Library not installed';
 const title=installed?'Active Library v'+installed:'No active workspace Library. Pull Latest Library to install.';
 for(const id of ['headerLibraryVersion','gateLibraryVersion']){
  const element=$(id);
  if(element){element.textContent=label;element.title=title;}
 }
 fitBrandVersionLines();
}
window.addEventListener('resize',fitBrandVersionLines);
function renderCatalog(state,{forceFields=false}={}){
 if(!state)return;
 catalogState=state;
 renderRoleSkillHeader();
 updateBrandLibraryVersion(state);
 const form=$('catalogForm');if(!form)return;
 if(forceFields||!form.contains(document.activeElement)){
   field('catalogRepoUrl',state.config?.repositoryUrl||'');field('catalogRef',state.config?.ref||'main');field('catalogAuth',state.config?.authentication||'github');
   $('catalogAutoCheck').checked=state.config?.autoCheck!==false;
 }
 $('catalogTokenField').classList.toggle('hidden',read('catalogAuth')!=='token');
 $('catalogToken').placeholder=state.credentialSaved?'Token saved securely; leave blank to retain':'Read-only token with Contents: Read';
 const installed=state.installed;settingsCatalogInstalled=installed||null;updateExtensionSettingBadges();
 $('catalogInstalled').textContent=installed?(installed.offline?
  `Offline SDLC Library ZIP v${installed.version} · ${installed.filename||'validated archive'} · Preserved until an equal or newer verified GitHub version`:
  `Installed SDLC Catalogue v${installed.version} · Git SHA ${installed.sha.slice(0,12)} · ${installed.repository} · ${new Date(installed.installedAt).toLocaleString()}`):'No downloaded catalogue yet.';
 const counts=$('catalogContents');counts.replaceChildren();
 for(const [label,value] of [['Role skills',installed?.roleCount],['Tech stacks',installed?.stackCount],['Workflows',installed?.workflows],['Templates',installed?.templates]]){
  const span=document.createElement('span');span.textContent=`${label}: ${value??'—'}`;counts.append(span);
 }
 const remote=state.remote;
 $('catalogUpdates').textContent=installed?.offline?
  (remote?.version?`Installed ZIP v${installed.version} · GitHub main v${remote.version}. ${state.updateAvailable?'Newer version available.':'No newer version available.'}`:'Offline ZIP active. GitHub version has not been verified yet.'):
  remote?.version?(!installed?`Library v${remote.version} available on GitHub main. Open an ATGV workspace, then Pull Catalog to install.`:state.updateAvailable?`Library v${remote.version} available (installed v${installed.version}). Pull Catalog to download; project files will not be overwritten.`:`Library v${installed.version} is up to date.`):(state.lastCheck?`Last check: ${new Date(state.lastCheck).toLocaleString()}`:'No verified remote version yet.');
 if(state.error)$('catalogStatus').textContent=state.error;
 for(const id of ['catalogSave','catalogTest','catalogPull','catalogCheck'])$(id).disabled=!!state.busy||catalogBusyUI;
 $('pullLibraryFiles').disabled=!!state.busy||catalogBusyUI||softwareLibraryPulling;
}
// Extension Settings: Ready reflects a saved configuration, not an untested live service.
let settingsTokenState={jira:false,github:false},settingsCatalogInstalled=null,settingsModelReady=false,settingsAiTested=false,settingsServiceReady=false;
function updateExtensionSettingBadges(){
 const required=(name,ok)=>{const badge=$(name+'State');if(!badge)return;const state=ok?'ready':'required';badge.dataset.state=state;badge.textContent=ok?'Ready':'Required';};
 const optional=(name,ok)=>{const badge=$(name+'State');if(!badge)return;const state=ok?'ready':'optional';badge.dataset.state=state;badge.textContent=ok?'Ready':'Optional';};
 const jira=extensionSettings.jira||extensionSettings.atlassian||{};
 const jiraReady=!!(jira.baseUrl&&jira.email&&settingsTokenState.jira);
 required('settingsJiraGroup',jiraReady);
 const space=projects.find(p=>p.id===activeId)?.settings?.confluence;
 required('settingsConfluenceGroup',jiraReady&&!!(space?.spaceKey||space?.spaceId));
 const repo=extensionSettings.github||{};
 optional('settingsGithubGroup',!!(repo.owner&&repo.repo));
 optional('settingsCatalogGroup',!!(settingsCatalogInstalled?.sha||settingsCatalogInstalled?.offline));
 const provider=read('aiProviderChoice');
 required('settingsAiGroup',provider!=='none'&&(settingsAiTested||provider==='auto'&&settingsModelReady));
 const coordination=read('coordinationProvider');
 required('settingsCoordinationGroup',coordination==='local'||coordination==='service'||(coordination==='jira-confluence'&&jiraReady&&!!(space?.spaceKey||space?.spaceId)));
 required('settingsRolesGroup',!roleSettingsDirty&&(roleSettings?.roles||[]).some(r=>r.enabled));
 optional('settingsRagGroup',!!$('aiProviderChoice')?.value);
 optional('settingsServiceGroup',settingsServiceReady&&$('aiServiceEnabled').checked);
 optional('settingsScheduleGroup',!!(activeId&&timelineData?.tasks?.length));
 // Project Settings has a dedicated page. Technology stack is shown on that page.
}
function collapseExtensionSettings(){for(const details of document.querySelectorAll('#settingsView details.ext-settings-accordion'))details.open=false;}
function collapseProjectSettings(){const panel=$('projectSettingsPanel');if(panel)panel.open=false;for(const details of document.querySelectorAll('#projectView details.ext-settings-accordion'))details.open=false;}
function updateState(msg){
  if(activeId!==msg.activeId){mappingResumeAvailable=false;mappingRetryAvailable=false;if(baRequirementModalTarget)closeBARequirementModal(false);brDeletionBusy=false;hideBRDeletionProgress();roleJiraRequest++;baResumeCardReady=baHasRecoverableBR(msg.brState);baViewedStep=null;baPreflightInfo=null;mappingFailurePhase='';if(pmJiraTableInstance){pmJiraTableInstance.destroy?.();pmJiraTableInstance=null;} jiraInventoryRequest++;jiraInventoryLastChecked=0;jiraInventoryRunning=false;jiraInventoryLoaded=false;jiraInventoryError="";jiraInventoryItems=[];jiraInventoryProject="";jiraInventoryKey="";jiraInventoryViewerId="";aiChangeResolutionView.receive({type:'aiChangeResolution/state',cases:[]});baShowChangeProposal=false;restoredMappingEpoch=null;discoveryImportProposal=null;discoveryImportQueue=[];brState=msg.brState||null;reviewStageState=null;reviewApplyRetry=null;reviewApplyRetryAvailable=false;deliveryInfo=null;deliveryDraftDirty=false;deliveryState={items:[]};sourceSelectedDigests=new Set(Array.isArray(msg.baSelectedSources)?msg.baSelectedSources:[]);opsOwnerDocs=[];opsOwnerLoaded=false;opsOwnerMe=null;opsOwnerBusy=false;handoffOwnerBusy=null;baOwnerState=null;selectedHandoffBrId=null;handoffOwnership={me:null,documents:[],scope:null};}
  workspaceFolderAvailable=!!msg.workspace;
  $('gateFolderAlert').classList.toggle('hidden',workspaceFolderAvailable);
  $('gateManual').disabled=!workspaceFolderAvailable;
  $('gateSearch').disabled=!workspaceFolderAvailable;
  $('gateQuery').disabled=!workspaceFolderAvailable;
  if(!aiProviderLoaded){aiProviderLoaded=true;send('getAiProviderState');}
  projects=msg.projects||[];activeId=msg.activeId||null;healthData=msg.health||null;usedRoleIds=new Set(msg.usedRoles||[]);designState=msg.designState||null;approvedDesignHash=msg.approvedDesignHash||'';blueprintRegistry=msg.blueprintRegister||null;blueprintAssessment=msg.blueprintAssessment||null;extensionSettings=msg.extensionSettings||{};updateHeaderUserName(extensionSettings.jira?.email||extensionSettings.atlassian?.email||msg.startupSetup?.saved?.email);techStacks=msg.techStacks||[];renderCatalog(msg.catalog);jiraBrowseBaseUrl=msg.jiraBrowseBaseUrl||'';
  recentIds=msg.recentProjects||[];projectReadiness=msg.projectReadiness||{};unmanagedFolders=msg.unmanagedFolders||[];
   architectErrorLogProjectId=msg.activeId||'';architectErrorLogCount=Number(msg.architectErrorLogCount)||0;
  if(msg.aiService)renderAIService(msg.aiService);
  renderWorkspaceSearch(msg.startupScan);
  const prior=opening.phase;
  opening=msg.opening||{phase:'search',candidate:null,warnings:[]};
  // Intermediate selected/tested/initialized states are still opening.
  // Only a completed project or an explicit reset clears progress.
  if(opening.phase==='open'||(opening.phase==='search'&&prior!=='search'))gateBusy=false;
  if($('coordinationProvider')){
    $('coordinationProvider').value=msg.coordinationProvider||'jira-confluence';
    const provider=msg.coordinationProvider||'jira-confluence';
    $('coordinationHint').textContent=provider==='jira-confluence'?'Jira verifies the user; Confluence stores shared ownership and approval decisions.':provider==='service'?'Use the optional standalone ATGV Coordination Service.':'Local-only assignments are not shared with other ATGV users.';
    $('opsService').classList.toggle('hidden',provider!=='service');
  }
  $('sidebarSwitchProject').textContent=(projects.find(p=>p.id===activeId)?.name||'Choose Project')+' ▾';
  
  $('extensionToProjectSettings').disabled=!(activeId&&workspaceOpened);
  const model=msg.modelStatus||{name:'LLM',state:'inactive',message:'Not active'};
  const badge=$('headerModel');
  badge.classList.remove('ready','error','inactive');
  badge.classList.add(['ready','error'].includes(model.state)?model.state:'inactive');
  $('headerModelName').textContent=model.name||'LLM';
  $('headerModelState').textContent=model.state==='ready'?'Ready':model.state==='error'?'Offline':'Inactive';
  badge.title=(model.name||'LLM')+' · '+(model.message||model.state);
  roleData=msg.work||{roles:[],progress:{},files:{}};roleStepData=msg.roleSteps||{roles:[]};projectSdlcSummary=msg.consolidatedSdlc||null;if(selectedRoleStepScope!=='project')send('roleStepLoadScope',{scopeId:selectedRoleStepScope});unifiedRepository=msg.unifiedRepository||null;deliveryState=msg.delivery||{items:[]};
  if(!roleSettingsDirty){roleSettings=msg.roleSettings||{roles:[],enabled:[],revision:null};renderRoleSettings();}
  if(!roleTimelineDirty&&!bulkTimelineDirty&&!bulkTimelineSaving){timelineData=msg.timeline||{tasks:[],revision:null};renderRoleTimeline();if(selectedRole==='project-manager'&&view==='work')renderPMDashboard();}
  if(msg.brState)brState=msg.brState;
  if(msg.baMappingResumeAvailable&&!discoveryImportBusy&&brState){
   mappingResumeAvailable=true;
   if(!sourceSelectedDigests.size)sourceSelectedDigests=new Set((msg.baSelectedSources?.length?msg.baSelectedSources:brState.sourceDocuments.map(source=>source.digest)));
   if(!mappingRetryAvailable){mappingRetryAvailable=true;mappingFailureMessage='Previous AI progress is saved. Resume mapping from the last completed section.';mappingFailurePhase='';}
   renderMappingRecovery();
  }else if(msg.baMappingResumeAvailable===false&&!discoveryImportBusy&&mappingResumeAvailable){
   mappingResumeAvailable=false;
   if(mappingFailureMessage.startsWith('Previous AI progress is saved.'))mappingFailureMessage='The document or workflow changed. Retry mapping with the current information.';
   renderMappingRecovery();
  }
  if(Array.isArray(msg.exportRecoveryFailures)&&msg.exportRecoveryFailures.length)status(`${msg.exportRecoveryFailures.length} Business Requirements export(s) need recovery. Reopen this project after fixing folder permissions.`,true);
  if(msg.discovery&&!discoveryDirty){discoveryData=msg.discovery;renderDiscovery();}
  flowData=msg.flow||null;renderFlow();
  if(msg.brState){brState=msg.brState;renderBRs();renderDeveloperBrChoices();if(view==='discovery')refreshAIChangeResolution();}
  renderSidebarRole();
  renderOperationDocuments();
  if(msg.remoteLinks?.jiraKey&&!read('opsIssueKey'))field('opsIssueKey',msg.remoteLinks.jiraKey);

  $('opsAutoSync').checked=!!msg.autoSync;
  $('opsJiraAuto').checked=!!msg.jiraAutoSync;
                                                                              
  if(document.activeElement?.closest('form')!==$('extensionForm')){
    field('jiraBaseUrl',extensionSettings.jira?.baseUrl||extensionSettings.atlassian?.baseUrl||'');
    field('jiraEmail',extensionSettings.jira?.email||extensionSettings.atlassian?.email||'');
    field('jiraProjectKey',extensionSettings.jira?.projectKey||'');
  }
  if(document.activeElement?.closest('form')!==$('githubForm')){
    field('githubOwner',extensionSettings.github?.owner||'');field('githubRepository',extensionSettings.github?.repo||'');setGithubBranch();
    showGithubRepoPreview();
  }
  $('settingsBack').textContent=workspaceOpened?'← Back to Workspace':'← Back to Projects';
  $('extensionToProjectSettings').disabled=!(activeId&&workspaceOpened);
  const projectConfig=projects.find(p=>p.id===activeId)?.settings;
  const hasSpace=!!projectConfig?.confluence?.spaceKey;
  const hasJira=!!projectConfig?.jira?.projectKey;
  $('opsConfluenceSync').disabled=!hasSpace;
  $('opsAutoSync').disabled=!hasSpace;
  $('opsJiraCreate').disabled=!hasJira;
  $('opsJiraUpdate').disabled=!hasJira;
  $('jiraCredentialState').textContent=msg.jiraTokenSaved?'Token securely saved':'Token not configured';
  $('githubCredentialState').textContent=msg.githubTokenSaved?'Token securely saved':'Token not configured (optional)';
  settingsTokenState={jira:!!msg.jiraTokenSaved,github:!!msg.githubTokenSaved};settingsModelReady=msg.modelStatus?.state==='ready';updateExtensionSettingBadges();
  renderRoleWork();renderDocumentGroups();renderOperationDocuments();renderKnowledgeState(msg.summary||{});renderLiveRemoteState(msg.liveRemote);renderOverviewConnections(msg.projectConnections);renderOverviewRoles(msg.summary||{});ensureBAJiraInventory();ensurePMJiraInventory();

  if(editingId&&!projects.some(p=>p.id===editingId)){editingId=null;navigate('overview');}
  if(view==='project'&&editingId&&document.activeElement?.closest('form')!==$('projectForm')&&!document.activeElement?.closest('#projectScopedOptions'))openProject(editingId);
  else if(view==='project')renderTechStacks();
  if(opening.phase==='open'){
    if(!workspaceOpened){workspaceOpened=true;gateBusy=false;gateError='';document.body.classList.remove('gate-mode');$('extensionToProjectSettings').disabled=!activeId;renderSidebarRole();navigate('sdlc-roles');}
    if(restoreLibraryAfterVendorSync&&workspaceOpened){restoreLibraryAfterVendorSync=false;if(canUseLibraryStudio())navigate('library');}
  }else if(view!=='settings'&&view!=='project'){
    // Do not reset gateBusy on every background dashboard update. A refresh
    // can arrive between click and Jira/Confluence verification.
    if(gateBusy){document.body.classList.add('gate-mode');renderGate();}
    else showGate();
  }
  else if(!workspaceOpened)document.body.classList.add('gate-mode');
  renderGate();
  if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
}
let navigationRefreshRequestId=0;
function requestNavigationRefresh(destination){
 if(!workspaceOpened||!activeId)return;
 // A menu refresh updates the existing webview and must never reload the
 // document, abort a host process or discard the selected workflow step.
 queueMicrotask(()=>{
  if(!workspaceOpened||!activeId)return;
  send('viewNavigateRefresh',{projectId:activeId,destination,view,roleId:selectedRole,
   requestId:++navigationRefreshRequestId});
 });
}
// A single SDLC Workspace sidebar destination owns the four existing pages.
// Preserve their original view IDs and handlers; no document/approval state
// is moved or reconstructed when switching tabs.
const SDLC_WORKSPACE_VIEWS=new Set(['flow','documents','planning','knowledge','operations']);
function syncSdlcWorkspaceShell(next){
 const shell=$('sdlcWorkspaceShell');
 if(!shell)return;
 const active=SDLC_WORKSPACE_VIEWS.has(next);
 shell.classList.toggle('hidden',!active);
 shell.setAttribute('aria-hidden',String(!active));
 const overview=$('sdlcWorkspaceOverview');
 if(overview){
  overview.classList.toggle('current',next==='flow');
  overview.setAttribute('aria-pressed',String(next==='flow'));
 }
 for(const tab of shell.querySelectorAll('[data-sdlc-tab]')){
  const chosen=active&&tab.dataset.sdlcTab===next;
  tab.classList.toggle('current',chosen);
  tab.setAttribute('aria-selected',String(chosen));
  tab.tabIndex=chosen||active&&next==='flow'&&tab.dataset.sdlcTab==='documents'?0:-1;
 }
}
function navigate(destination){
  if(roleSettingsDirty&&view==='project'&&destination!=='project-settings'&&destination!=='tech'){status('Save project role settings before leaving Project Settings.',true);return;}
  if(view==='discovery'&&discoveryDirty){status('Save your discovery answers before leaving this screen.',true);return;}
  if(view==='discovery'&&destination!=='discovery'&&window.ATGVBusinessRequirements?.dirty()){status('Save your Business Requirements edits before leaving this screen.',true);return;}
  if(roleTimelineDirty&&destination!==selectedRole&&destination!=='sdlc-roles'){if($('sidebarRole'))$('sidebarRole').value=selectedRole;status('Save this role timeline before leaving.',true);return;}
  if(view==='documentEditor'&&docDirty){$('docEditorStatus').textContent='Save your document before leaving this screen.';status('Save your document before switching screens.',true);return;}
  if(view==='planning'&&designDirty&&destination!=='planning'){status('Save your design draft before leaving this screen.',true);return;}
  if(view==='planning'&&diagramDirty&&destination!=='planning'){status('Save your diagram before switching screens. Changes have not been written to disk.',true);return;}
  if(view==='library'&&destination!=='library'&&window.atgvLibraryStudio?.isDirty()){status('Save or restore your local library edits before leaving Library Studio.',true);return;}
  if(destination==='library'&&!canUseLibraryStudio()){
    status('Library Studio is only available in the Developer role. Switch to Developer to open it.',true);
    return;
  }
  if(destination==='projects'){
    if(workspaceOpened){send('openingBack');return;}
    showGate();return;
  }
  if(!workspaceOpened&&!['settings'].includes(destination)){
    showGate();return;
  }
  // Navigate locally without an automatic dashboard/webview refresh.
  const isRole=visibleRoles().some(role=>role.id===destination);
  const keepingWorkspace=isRole&&['work','baOverview','discovery','uxPreview'].includes(view);
  if(isRole&&activeId){usedRoleIds.add(destination);send('markRoleUsed',{roleId:destination});}
  selectedNav=destination==='role-workspace'||destination==='ba-overview'||destination==='discovery'||keepingWorkspace||
    isRole||destination==='sdlc-roles'?'sdlc-roles':
    SDLC_WORKSPACE_VIEWS.has(destination)?'flow':
    destination==='project-settings'||destination==='tech'?'settings':destination;
  for(const button of document.querySelectorAll('.sidebar [data-nav]')){
    const active=button.dataset.nav===selectedNav;
    button.classList.toggle('current',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  if(isRole){if(selectedRole!==destination)selectedHandoffBrId=null;selectedRole=destination;renderSidebarRole();}
  if(isRole||destination==='sdlc-roles'||destination==='role-workspace'){
    if(!visibleRoles().some(role=>role.id===selectedRole))selectedRole=visibleRoles()[0]?.id||'business-analyst';
    const baWorkspace=selectedRole==='business-analyst';
    const openWorkspace=destination==='role-workspace'||keepingWorkspace;
    if(baWorkspace&&openWorkspace)baBreadcrumbAtRequirements=false;
    setView(openWorkspace?(baWorkspace?'baOverview':'work'):'myWork');
    renderSidebarRole();renderRoleWork();
    if(baWorkspace&&openWorkspace){renderBAUncompleted();send('baOwnersRefresh');}
    renderRoleTimeline();ensurePMJiraInventory(true);ensureBAJiraInventory(true);send('roleHandoffOwners');return;
  }
  if(destination==='overview'){setView('landing');$('overviewGanttDetails').open=false;send('loadPlanning');send('myWorkRosterRefresh',{projectId:activeId,roleId:selectedRole});return;}
  if(destination==='settings'){$('settingsBack').textContent=workspaceOpened?'← Back to Workspace':'← Back to Projects';collapseExtensionSettings();setView('settings');updateExtensionSettingBadges();if(workspaceOpened)send('devRepositoryStatus');return;}
  if(destination==='library'){setView('library');window.atgvLibraryStudio?.refresh();return;}
  if(destination==='documents'){setView('documents');renderDocumentGroups();return;}
  if(destination==='knowledge'){setView('knowledge');send('refreshConnectedSources');return;}
  if(destination==='planning'){setView('planning');send('loadPlanning');renderDesignCards();return;}
  if(destination==='ba-overview'||destination==='discovery'){
    baBreadcrumbAtRequirements=destination==='discovery';
    selectedRole='business-analyst';renderSidebarRole();
    setView(destination==='discovery'?'discovery':'baOverview');renderRoleWork();send('baOwnersRefresh');
    if(view==='baOverview'){renderBAUncompleted();ensureBAJiraInventory(true);}
    else{renderDiscovery();refreshAIChangeResolution();}
    return;
  }
  if(destination==='flow'){setView('flow');renderFlow();return;}
  if(destination==='operations'){setView('operations');opsOwnerLoaded=false;renderOperationDocuments();send('refreshOwners');return;}
  if(destination==='project-settings'||destination==='tech'){
    // Tab switches retain unsaved project input values; navigating to another
    // project still initializes the form from that project's persisted scope.
    const returnToOpenProjectTab=destination==='project-settings'&&view==='settings'&&
      !!activeId&&editingId===activeId&&$('projectView').dataset.loadedFor===activeId;
    if(returnToOpenProjectTab){setView('project');collapseProjectSettings();}
    else openProject(activeId||null);
    selectedNav='settings';
    if(destination==='tech')requestAnimationFrame(()=>$('techStackGrid').scrollIntoView({block:'start',behavior:'smooth'}));
    return;
  }
}
for(const nav of document.querySelectorAll('.sidebar [data-nav]'))nav.addEventListener('click',()=>navigate(nav.dataset.nav));
// Internal tab navigation keeps the original five workflow views and guards.
$('sdlcWorkspaceOverview').addEventListener('click',()=>navigate('flow'));
for(const tab of $('sdlcWorkspaceTabs').querySelectorAll('[data-sdlc-tab]')){
 tab.addEventListener('click',()=>navigate(tab.dataset.sdlcTab));
 tab.addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  const tabs=[...$('sdlcWorkspaceTabs').querySelectorAll('[data-sdlc-tab]')];
  const index=tabs.indexOf(tab);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
   (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  event.preventDefault();tabs[next]?.focus();navigate(tabs[next].dataset.sdlcTab);
 });
}
function closeRoleMenu(){
 $('sidebarRoleMenu').classList.add('hidden');$('sidebarRoleTrigger').setAttribute('aria-expanded','false');
}
const roleNavColors={
 'business-analyst':['#2a3035','#66b8e7'],
 'project-manager':['#302e35','#c1a4e6'],
 'solution-architect':['#2b3436','#76d1da'],
 'technical-lead':['#2d3136','#9bb5df'],
 'software-developer':['#2b3430','#81d9ab'],
 'qa-engineer':['#363129','#e9bd73'],
 'product-owner':['#332f34','#d6a4db'],
 'scrum-master':['#2b3037','#a6c0ee'],
 'ux-designer':['#343036','#e5a5c9'],
 'security-engineer':['#342e30','#e6a7b2'],
 'data-engineer':['#2b3336','#85cbd7'],
 'uat-tester':['#34352e','#cad18c'],
 'release-manager':['#382f2e','#e5ad9f'],
 'technical-writer':['#2e3437','#afc6df'],
 'operations-support':['#33343a','#bdc6d8'],
 'business-owner':['#342f32','#d6b5ca'],
 'ai-ml-engineer':['#2c3339','#98caec'],
 'compliance-officer':['#35342e','#d4c494']
};
function applyRoleNavigationTheme(roleId){
 const fallback=[['#2c3036','#8bbbd4'],['#313039','#b6abde'],['#2b3430','#a1d7af'],['#35302f','#dfb3a0']];
 const sum=[...String(roleId||'')].reduce((n,c)=>n+c.charCodeAt(0),0);
 const colors=roleNavColors[roleId]||fallback[sum%fallback.length];
 const nav=document.querySelector('.sidebar');if(!nav)return;
 nav.style.setProperty('--role-pane-bg','#000000');nav.style.setProperty('--role-nav-accent',colors[1]);
}
function visibleRoles(){const enabled=new Set(roleSettings.enabled||[]),order=roleSettings.order||[];return (roleData.roles||[]).filter(role=>enabled.has(role.id)).sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});}
function visibleRoleLabel(role){return role.id==='ux-designer'?'UI/UX Designer':role.label;}
// Visibility and navigation must both follow the active role, not the set of
// roles a user happens to be assigned.
function canUseLibraryStudio(){
 return selectedRole==='software-developer'&&visibleRoles().some(role=>role.id==='software-developer');
}
function syncLibraryStudioVisibility(){
 const link=document.querySelector('.sidebar [data-nav="library"]');
 if(!link)return;
 const allowed=!!workspaceOpened&&canUseLibraryStudio();
 link.hidden=!allowed;
 link.classList.toggle('hidden',!allowed);
 link.setAttribute('aria-hidden',String(!allowed));
 link.tabIndex=allowed?0:-1;
 // When a role is removed by project settings, never leave Library Studio on
 // screen for an unauthorized role. The in-memory editor draft is untouched.
 if(!allowed&&view==='library'){
  selectedNav='sdlc-roles';
  for(const nav of document.querySelectorAll('.sidebar [data-nav]')){
   const current=nav.dataset.nav==='sdlc-roles';
   nav.classList.toggle('current',current);
   if(current)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');
  }
  setView('myWork');
 }
}
function renderSidebarRole(){
 const picker=$('sidebarRole'),roles=visibleRoles(),root=$('sidebarRoleMenu');
 picker.replaceChildren();root.replaceChildren();
 if(!roles.some(r=>r.id===selectedRole))selectedRole=roles[0]?.id||'business-analyst';
 for(const role of roles){
  const option=document.createElement('option');option.value=role.id;option.textContent=visibleRoleLabel(role);picker.append(option);
  const button=document.createElement('button');button.type='button';button.className='role-menu-item'+(selectedRole===role.id?' selected':'');button.role='option';button.setAttribute('aria-selected',selectedRole===role.id?'true':'false');
  const marker=document.createElement('span');marker.className='role-used-marker'+(usedRoleIds.has(role.id)?' is-used':'');marker.setAttribute('aria-label',usedRoleIds.has(role.id)?'Role used in this workspace':'Role not used in this workspace');marker.setAttribute('title',usedRoleIds.has(role.id)?'Role used in this workspace':'');button.append(marker);
  const name=document.createElement('span');name.className='role-menu-name';name.textContent=visibleRoleLabel(role);button.append(name);
  button.addEventListener('click',()=>{closeRoleMenu();navigate(role.id);});root.append(button);
 }
 picker.value=selectedRole;
 const active=roles.find(x=>x.id===selectedRole);
 $('sidebarRoleCurrent').textContent=active?visibleRoleLabel(active):'Choose role';
 applyRoleNavigationTheme(selectedRole);
 syncLibraryStudioVisibility();
 $('sidebarRoleTrigger').disabled=!workspaceOpened;
 if(!workspaceOpened)closeRoleMenu();
}
$('sidebarRoleTrigger').addEventListener('click',()=>{
 const root=$('sidebarRoleMenu');const show=root.classList.contains('hidden');root.classList.toggle('hidden',!show);$('sidebarRoleTrigger').setAttribute('aria-expanded',String(show));
 if(show){const active=root.querySelector('[aria-selected="true"]')||root.querySelector('button');active?.focus();}
});
$('sidebarRoleMenu').addEventListener('keydown',event=>{
 const items=[...$('sidebarRoleMenu').querySelectorAll('button')],i=items.indexOf(document.activeElement);
 if(event.key==='Escape'){closeRoleMenu();$('sidebarRoleTrigger').focus();}
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();items[(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
});
document.addEventListener('click',event=>{if(!event.target.closest('.role-select-wrap'))closeRoleMenu();});
$('sidebarRole').addEventListener('change',event=>navigate(event.target.value));
window.addEventListener('atgv:mywork-open-task',event=>{
 const detail=event.detail||{},target=String(detail.target||'');
 // A task button may only navigate from the currently selected project and role.
 if(!workspaceOpened||!activeId||view!=='myWork'||
    detail.projectId!==activeId||detail.roleId!==selectedRole||
    !visibleRoles().some(item=>item.id===selectedRole))return;
 if(!['role-workspace','discovery','project-settings'].includes(target))return;
 if(target==='discovery'&&selectedRole!=='business-analyst')return;
 if(target==='project-settings'&&selectedRole!=='project-manager')return;
 const jiraKey=String(detail.jiraKey||''),brId=String(detail.brId||'');
 navigate(target);
 if(target==='role-workspace'&&/^[A-Z][A-Z0-9_]{0,20}-[0-9]{1,12}$/.test(jiraKey))
  openJiraIssueModal(jiraKey);
 if(target==='discovery'&&/^BR-[0-9]{1,8}$/.test(brId)){
  // Navigate to the Business Requirements workflow. Select the requested BR
  // only when it remains in the project's currently verified local list.
  const requirement=activeBusinessRequirements().find(item=>item.id===brId);
  if(requirement){
   baBreadcrumbAtRequirements=true;
   renderDiscovery();
  }
 }
});
window.addEventListener('atgv:mywork-switch-role',event=>{
 const detail=event.detail||{},target=String(detail.targetRoleId||'');
 if(!workspaceOpened||!activeId||detail.projectId!==activeId||detail.fromRoleId!==selectedRole)return;
 if(!/^[a-z][a-z0-9-]{1,78}$/.test(target)||target===selectedRole)return;
 const candidate=(roleSettings.roles||[]).find(item=>item.id===target)||
  (roleData.roles||[]).find(item=>item.id===target);
 if(!candidate){status('Requested specialist role is not available in this project catalog.',true);return;}
 if(!visibleRoles().some(item=>item.id===target)){
   status('Enable '+visibleRoleLabel(candidate)+' in Project Role Settings before switching.');
   navigate('project-settings');
   return;
 }
 window.ATGVMyWorkChat?.saveHandoffDraft?.(String(detail.requestText||'').slice(0,4000));
 // Only this explicit button press changes the active role; never auto-assign.
 navigate(target);
});
function renderOverviewJira(){
 const tools=globalThis.ATGVJiraOverview;
 const data=tools?tools.summarize(brState?.synced):{count:0,byType:{},issues:[]};
 $('overviewJiraCount').textContent=String(data.count);
 const breakdown=Object.entries(data.byType).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 $('overviewJiraBreakdown').textContent=data.count?breakdown.map(([type,count])=>`${count} ${type}`).join(' · '):'No published issues';
 const details=$('overviewJiraDetails'),list=$('overviewJiraList');
 details.hidden=!data.count;
 $('overviewJiraDetailsCount').textContent=`(${data.count})`;
 list.replaceChildren();
 ATGVDataTables.mount(list,data.issues.map(issue=>({type:issue.kind||'Issue',title:issue.title||'',key:issue.key||''})),[
  {key:'type',label:'Issue type'},{key:'title',label:'Summary'},
  {key:'key',label:'Jira key',render:row=>{const url=tools.browseUrl(jiraBrowseBaseUrl,row.key);const link=document.createElement(url?'a':'span');link.textContent=row.key;link.className='overview-jira-key';if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.title='Open Jira issue '+row.key;}return link;}}
 ],{label:'Overview Jira issues',sortKey:'key',pageSize:5});
}
let projectConnectionsSnapshot={jira:{},confluence:{}};
let mappingModalKind='',mappingModalProjectId='',mappingRequestSerial=0,mappingVerified=null,mappingBusy=false,mappingPreviousFocus=null;
function mappingModalStatus(message,failed=false){
 const node=$('projectConnectionTestStatus');node.textContent=String(message||'');
 node.className='test-status '+(failed?'error':'muted');
}
function invalidateMappingTest(){
 mappingVerified=null;mappingRequestSerial++;mappingBusy=false;
 $('projectConnectionTest').disabled=false;$('projectConnectionSave').disabled=true;
 mappingModalStatus('Test permissions before saving.');
}
function closeProjectConnectionModal(){
 mappingModalKind='';mappingModalProjectId='';mappingVerified=null;mappingBusy=false;mappingRequestSerial++;
 $('projectConnectionModal').classList.add('hidden');$('projectConnectionModal').setAttribute('aria-hidden','true');
 $('projectConnectionTest').disabled=false;$('projectConnectionKey').disabled=false;$('projectConnectionSave').disabled=true;
 if(mappingPreviousFocus?.isConnected)mappingPreviousFocus.focus();
}
function openProjectConnectionModal(kind){
 if(!activeId||!['jira','confluence'].includes(kind))return;
 mappingPreviousFocus=document.activeElement;mappingModalKind=kind;mappingModalProjectId=activeId;
 const record=projectConnectionsSnapshot[kind]||{};
 const jira=kind==='jira';
 $('projectConnectionModalTitle').textContent=jira?'Jira Project Settings':'Confluence Space Settings';
 $('projectConnectionKeyLabel').textContent=jira?'Jira Project Key':'Confluence Space Key';
 $('projectConnectionKey').placeholder=jira?'e.g. TC':'e.g. TCC';
 $('projectConnectionModalDescription').textContent=jira?'Verify Browse Projects and Create Issues before saving.':'Verify space access and Create Page permission before saving.';
 $('projectConnectionKey').value=record.key||'';
 mappingBusy=false;invalidateMappingTest();
 $('projectConnectionModal').classList.remove('hidden');$('projectConnectionModal').setAttribute('aria-hidden','false');
 $('projectConnectionKey').focus();
}
$('overviewJiraMappingStatus').addEventListener('click',()=>openProjectConnectionModal('jira'));
$('overviewConfluenceMappingStatus').addEventListener('click',()=>openProjectConnectionModal('confluence'));
// A single project-scoped Jira scan powers Overview and Business Analyst My Work.
// Both views share the same effective Jira project mapping and nextPageToken pagination.
let jiraInventoryRequest=0,jiraInventoryProject='',jiraInventoryItems=[],jiraInventoryPage=0,jiraInventoryRunning=false,jiraInventoryLoaded=false,jiraInventoryKey='',jiraInventoryError='',jiraInventoryTruncated=false,jiraInventoryViewerId='',jiraInventoryLastChecked=0;
let baJiraView='list';
// An explicit BA Refresh requests review of stale saved Jira links after inventory completes.
// Automatic initial scans never reconcile references.
let jiraLinkReconcileAfterRefreshRequest=0;
let baJiraTableInstance=null;
let baRequirementModalTarget=null,baRequirementPriorFocus=null;
let baTransferState=null,baTransferRequest=0,baTransferBusy=false;
let brDeletionBusy=false;
let brDeletionDismissTimer=null;
function hideBRDeletionProgress(){
 if(brDeletionDismissTimer!==null){clearTimeout(brDeletionDismissTimer);brDeletionDismissTimer=null;}
 const panel=$('brDeletionProgress');if(!panel)return;
 panel.classList.add('hidden');panel.dataset.phase='idle';
 $('brDeletionProgressCount').textContent='';
 $('brDeletionDismiss').classList.add('hidden');
}
function showBRDeletionProgress(phase,message,deleted=0,total=0){
 const panel=$('brDeletionProgress');if(!panel)return;
 // Starting another deletion cancels any prior success-message auto-dismiss.
 if(brDeletionDismissTimer!==null){clearTimeout(brDeletionDismissTimer);brDeletionDismissTimer=null;}
 panel.classList.remove('hidden');panel.dataset.phase=phase;
 $('brDeletionProgressText').textContent=message||'Updating Business Requirements…';
 const count=Number(total)>0?Math.max(0,Math.min(Number(total),Number(deleted)||0))+' / '+Number(total):'';
 $('brDeletionProgressCount').textContent=count;
 const percentage=phase==='completed'?100:phase==='cleanup'?95:phase==='running'&&Number(total)>0?Math.min(90,Math.round(Math.max(0,Number(deleted)||0)/Number(total)*90)):phase==='failed'||phase==='cancelled'?0:12;
 $('brDeletionFill').style.width=percentage+'%';
 $('brDeletionTrack').setAttribute('aria-valuenow',String(percentage));
 $('brDeletionTrack').setAttribute('aria-valuetext',message||phase);
 brDeletionBusy=!['completed','cancelled','failed'].includes(phase);
 $('brDeletionDismiss').classList.toggle('hidden',brDeletionBusy);
 document.querySelectorAll('[data-br-delete-action]').forEach(node=>{node.disabled=brDeletionBusy;});
 if(phase==='completed'||phase==='cancelled'){
  const completedProject=activeId;
  brDeletionDismissTimer=setTimeout(()=>{
   brDeletionDismissTimer=null;
   if(activeId===completedProject&&panel.dataset.phase===phase)hideBRDeletionProgress();
  },phase==='completed'?3000:1500);
 }
}
$('brDeletionDismiss').addEventListener('click',hideBRDeletionProgress);
function requestBRDeletion(payload){
 if(!activeId||brDeletionBusy)return;
 showBRDeletionProgress('preparing','Checking affected records. VS Code will ask for deletion confirmation…');
 send('deleteBREverywhere',payload);
}
const JIRA_INVENTORY_PAGE_SIZE=5;
function filteredJiraInventory(){
 const query=$('jiraInventoryFilter').value.trim().toLocaleLowerCase();
 return query?jiraInventoryItems.filter(item=>[item.key,item.type,item.summary,item.status,item.creator].some(value=>String(value||'').toLocaleLowerCase().includes(query))):jiraInventoryItems;
}
function renderJiraInventory(){
 const items=filteredJiraInventory(),pages=Math.max(1,Math.ceil(items.length/JIRA_INVENTORY_PAGE_SIZE));
 jiraInventoryPage=Math.min(jiraInventoryPage,pages-1);
 const rows=$('jiraInventoryRows');rows.replaceChildren();
 const chunk=items.slice(jiraInventoryPage*JIRA_INVENTORY_PAGE_SIZE,(jiraInventoryPage+1)*JIRA_INVENTORY_PAGE_SIZE);
 if(!chunk.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent=jiraInventoryRunning?'Loading Jira items…':'No matching Jira items.';tr.append(td);rows.append(tr);}
 for(const item of chunk){
   const tr=document.createElement('tr');
   const first=document.createElement('td'),link=document.createElement('button');link.type='button';link.className='jira-issue-inline-link';link.textContent=item.key;link.addEventListener('click',()=>openJiraIssueModal(item.key));first.append(link);tr.append(first);
   for(const [field,value] of [['type',item.type],['summary',item.summary],['status',item.status],['creator',item.creator],['created',item.created]]){const td=document.createElement('td');td.textContent=value||'—';if(field==='creator'&&item.creatorId)td.title='Atlassian account ID: '+item.creatorId;tr.append(td);}
   rows.append(tr);
 }
 $('jiraInventoryPageInfo').textContent=items.length+' matching / '+jiraInventoryItems.length+' loaded · Page '+(jiraInventoryPage+1)+' of '+pages;
 $('jiraInventoryPrev').disabled=jiraInventoryPage===0;$('jiraInventoryNext').disabled=jiraInventoryPage>=pages-1;
}
function updateBAJiraFilterOptions(node,values,label){
 const selected=node.value;const options=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 // Keep dropdown focus and selection stable during paginated Jira scanning.
 if(node.options.length===options.length+1&&options.every((value,index)=>node.options[index+1].value===value))return;
 node.replaceChildren();const all=document.createElement('option');all.value='';all.textContent=label;node.append(all);
 for(const value of options){const option=document.createElement('option');option.value=value;option.textContent=value;node.append(option);}
 node.value=options.includes(selected)?selected:'';
}
// Default BA inventory order: issues created by the connected Jira account first.
// Jira returns issues in created-descending order; stable sorting preserves that
// order within each creator group. Clicking any table column overrides this default.
function prioritizeJiraCreators(items,accountId){
 const id=String(accountId||'').trim(),result=[...items];
 if(!id)return result;
 return result.sort((a,b)=>Number(b.creatorId===id)-Number(a.creatorId===id));
}
// Jira issues are rendered once: the BR cards link to this inventory rather
// than maintaining a second copy. Use exact mapped keys, not title matching.
function baJiraRequirementKeys(){
 const mapping=new Map();
 for(const group of ATGVCompletedBRHistory.group(completedBARecords())){
  const keys=new Set();
  for(const snapshot of group.snapshots||[]){
   const br=snapshot.br||{};
   if(br.jiraKey)keys.add(String(br.jiraKey));
   for(const issue of br.jiraIssues||[])if(issue.key)keys.add(String(issue.key));
  }
  mapping.set(group.id,{title:group.title,keys});
 }
 return mapping;
}
function baJiraScopeRows(items,brId){
 if(!brId)return items;
 const mapping=baJiraRequirementKeys().get(brId);
 if(!mapping)return [];
 const keys=new Set(mapping.keys);
 // Include linked role subtasks only when their Jira parent/source Story is
 // already mapped to the BR; no free-text or fuzzy matching.
 for(let changed=true;changed;){
  changed=false;
  for(const item of items){
   if(keys.has(item.key))continue;
   if(keys.has(item.parentKey)||keys.has(item.sourceStoryKey)){
    keys.add(item.key);changed=true;
   }
  }
 }
 return items.filter(item=>keys.has(item.key));
}
function renderBAJiraHierarchy(rows){
 const root=$('baJiraHierarchy');root.replaceChildren();
 if(baJiraView!=='tree')return;
 if(!rows.length){const p=document.createElement('p');p.className='muted';p.textContent='No Jira issues match these filters.';root.append(p);return;}
 const keys=new Set(rows.filter(item=>item._isJiraIssue!==false).map(item=>item.key));
 const children=new Map(),roots=[];
 for(const item of rows){
  const parent=item._isJiraIssue===false?'':[item.parentKey,item.sourceStoryKey].find(key=>key&&key!==item.key&&keys.has(key));
  if(parent){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(item);}
  else roots.push(item);
 }
 const seen=new Set();
 function appendItem(item,container,depth=0){
  const identity=item._isJiraIssue===false?'local:'+(item._brRoots?.[0]?.scopeId||item.summary):item.key;
  if(seen.has(identity))return;seen.add(identity);
  const kids=item._isJiraIssue===false?[]:children.get(item.key)||[];
  const node=document.createElement(kids.length?'details':'div');node.className='ba-jira-tree-item';
  if(depth<2&&kids.length)node.open=true;
  const line=document.createElement(kids.length?'summary':'div');line.className='ba-jira-tree-row';
  const button=document.createElement('button');button.type='button';button.className='jira-issue-inline-link';button.textContent=item._isJiraIssue===false?(item.brLabel||'Local BR'):item.key;
  button.addEventListener('click',event=>{event.stopPropagation();if(item._isJiraIssue===false)openBARequirementModal(item._brRoots?.[0]);else openJiraIssueModal(item.key);});
  const type=document.createElement('span');type.className='ba-jira-tree-type';type.textContent=item.type||'Issue';
  const title=document.createElement('span');title.className='ba-jira-tree-summary';title.textContent=item.summary||'Untitled';
  const status=document.createElement('span');status.className='ba-jira-tree-status';status.textContent=item.status||'Unknown';
  line.append(button,type,title,status);node.append(line);
  if(kids.length){const inner=document.createElement('div');inner.className='ba-jira-tree-children';for(const child of kids)appendItem(child,inner,depth+1);node.append(inner);}
  container.append(node);
 }
 for(const issue of roots)appendItem(issue,root);
 // Preserve access to badly linked Jira issues or cycles without a root.
 for(const issue of rows)appendItem(issue,root);
}
function openBRJiraInventory(brId){
 if(baRequirementModalTarget)closeBARequirementModal();
 if(view!=='baOverview')navigate('ba-overview');
 if(view!=='baOverview')return;
 const filter=$('baJiraBrFilter');filter.value=brId;
 baJiraView='list';renderBAJiraInventory();
 $('baJiraInventorySection').scrollIntoView({behavior:'smooth',block:'start'});
}
function syncBARequirementModal(){
 const target=baRequirementModalTarget;if(!target)return;
 if(target.projectId!==activeId){closeBARequirementModal(false);return;}
 const source=$(target.kind==='local'?'baCompletedList':'baJiraBackedEpics'),content=$('baRequirementModalContent');
 const matches=node=>target.kind==='local'?node.dataset.requirementTarget===target.scopeId:node.dataset.jiraKey===target.rootKey;
 const card=[...source.children].find(matches);
 if(!card){content.textContent='This requirement is no longer available in the current project. Refresh Jira items and try again.';return;}
 const scrollTop=content.scrollTop;if(card.parentElement!==content)content.replaceChildren(card);card.open=true;content.scrollTop=scrollTop;
 if(target.openAnswers){
  const tab=card.querySelector('.ba-completed-tabs [data-tab="answers"]');
  if(tab){for(let parent=tab.parentElement;parent&&parent!==card;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;tab.click();}
  target.openAnswers=false;
 }
}
function openBARequirementModal(ref,openAnswers=false){
 if(!ref||!activeId)return;
 baRequirementPriorFocus=document.activeElement;
 baRequirementModalTarget={kind:ref.kind,brId:ref.id||'',scopeId:ref.scopeId,rootKey:ref.rootKey,projectId:activeId,openAnswers};
 if(typeof resetBATransferPanel==='function')resetBATransferPanel();
 const transferButton=$('baTransferOpen');if(transferButton){transferButton.hidden=!ref.rootKey;transferButton.title='Transfer BR to another Business Analyst';transferButton.dataset.tooltip=transferButton.title;}
 baBreadcrumbAtRequirements=true;
 $('baRequirementModalTitle').textContent=ref.title||ref.label||'Business Requirement details';
 if(ref.kind==='local')renderBACompletedRecords();else renderBAJiraBackedEpics();
 $('baRequirementModal').classList.remove('hidden');$('baRequirementModal').setAttribute('aria-hidden','false');
 if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
 $('baRequirementModalClose').focus();
}
function closeBARequirementModal(restore=true){
 const target=baRequirementModalTarget;if(!target)return;baRequirementModalTarget=null;
 if(typeof resetBATransferPanel==='function')resetBATransferPanel();
 const content=$('baRequirementModalContent'),card=content.firstElementChild;
 if(card&&target.projectId===activeId)$(target.kind==='local'?'baCompletedList':'baJiraBackedEpics').append(card);
 content.replaceChildren();$('baRequirementModal').classList.add('hidden');$('baRequirementModal').setAttribute('aria-hidden','true');
 if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
 const previous=baRequirementPriorFocus;baRequirementPriorFocus=null;
 if(restore){if(previous?.isConnected)previous.focus();else $('baJiraBrFilter').focus();}
}
function renderBAJiraInventory(){
 const section=$('baJiraInventorySection'),statusNode=$('baJiraInventoryStatus'),root=$('baJiraInventoryTable');
 if(!section||!statusNode||!root)return;
 const key=projectConnectionsSnapshot.jira?.key||'';
 root.classList.add('ba-jira-project-table');
 $('baJiraInventoryTitle').textContent='All Jira Project Items'+(key?' · '+key:'');
 $('baJiraInventoryRefresh').disabled=!activeId||!key||jiraInventoryRunning;
 const hasDeleted=!!(brState?.deletedRequirements||[]).some(t=>t.remoteRecordsPreserved===true&&Array.isArray(t.jiraIssues)&&t.jiraIssues.some(i=>i.key));
 $('baReviewDeletedJira').classList.toggle('hidden',!hasDeleted);$('baReviewDeletedJira').disabled=!activeId||!key||jiraInventoryRunning;
 if(!activeId||!key){statusNode.textContent='Configure and test the Jira Project Key using the Jira card on Overview to list issues.';}
 else if(jiraInventoryProject!==activeId||jiraInventoryKey!==key){statusNode.textContent='Project '+key+' · Select Refresh Jira Items to retrieve current issues.';}
 else if(jiraInventoryError){statusNode.textContent='Jira '+key+' search failed: '+jiraInventoryError+' · '+jiraInventoryItems.length+' partial issue(s) available.';}
 else if(jiraInventoryRunning){statusNode.textContent='Loading Jira '+key+' · '+jiraInventoryItems.length+' issues received; more pages may follow…';}
 else if(jiraInventoryLoaded){statusNode.textContent=jiraInventoryItems.length+' Jira items from '+key+(jiraInventoryTruncated?' · 20,000-item safety limit reached.':' · Search complete.');}
 else {statusNode.textContent='Loading Jira project '+key+'…';}
 const brPicker=$('baJiraBrFilter'),oldBr=brPicker.value;
 const inScope=jiraInventoryProject===activeId&&jiraInventoryKey===key;
 const groups=activeId?ATGVCompletedBRHistory.group(completedBARecords()):[];
 const combined=ATGVBAJiraEpics.combine(inScope?jiraInventoryItems:[],groups,key);
 renderBAJiraBackedEpics(combined.unlinked);brPicker.replaceChildren();
 const allBr=document.createElement('option');allBr.value='';allBr.textContent='All BRs / project';brPicker.append(allBr);
 for(const ref of combined.refs){const option=document.createElement('option');option.value=ref.scopeId;option.textContent=ref.kind==='jira'?ref.label+' · Jira-only ('+ref.rootKey+')':ref.title;brPicker.append(option);}
 brPicker.value=combined.refs.some(ref=>ref.scopeId===oldBr)?oldBr:'';
 updateBAJiraFilterOptions($('baJiraTypeFilter'),combined.rows.map(item=>item.type),'All types');
 updateBAJiraFilterOptions($('baJiraStatusFilter'),combined.rows.map(item=>item.status),'All statuses');
 const type=$('baJiraTypeFilter').value,issueStatus=$('baJiraStatusFilter').value;
 const scoped=brPicker.value?combined.rows.filter(item=>item._brRefs.some(ref=>ref.scopeId===brPicker.value)):combined.rows;
 const rows=prioritizeJiraCreators(scoped.filter(item=>(!type||item.type===type)&&(!issueStatus||item.status===issueStatus)),jiraInventoryViewerId)
  .sort((a,b)=>Number(b._brRoots.length>0)-Number(a._brRoots.length>0));
 // BR owner is the Epic's live Jira Reporter, not the immutable Creator.
 // Populate a real sort value so the new DataTable column sorts correctly.
 const epicOwners=new Map(jiraInventoryItems.filter(item=>String(item.type||'').toLowerCase()==='epic')
  .map(item=>[item.key,String(item.reporter||'')]));
 for(const item of rows){
  const rootKey=(item._brRefs||[]).map(ref=>ref.rootKey).find(key=>epicOwners.has(key))||
   (String(item.type||'').toLowerCase()==='epic'?item.key:'');
  item.brOwner=rootKey?epicOwners.get(rootKey)||'':'';
 }

 const treeView=baJiraView==='tree';
 $('baJiraListView').setAttribute('aria-pressed',String(!treeView));$('baJiraTreeView').setAttribute('aria-pressed',String(treeView));
 root.classList.toggle('hidden',treeView);$('baJiraHierarchy').classList.toggle('hidden',!treeView);
 renderBAJiraHierarchy(rows);
 if(typeof ATGVDataTables==='undefined'){root.textContent='Jira DataTables are unavailable.';return;}
 if(baJiraTableInstance){baJiraTableInstance.setRows(rows);return;}
 const keyLink=item=>{if(item._isJiraIssue===false){const text=document.createElement('span');text.textContent=item.key||'—';text.title='No matching Jira issue is in the current results.';return text;}const btn=document.createElement('button');btn.type='button';btn.className='jira-issue-inline-link';btn.textContent=item.key;btn.title='View '+item.key+' details';btn.addEventListener('click',()=>openJiraIssueModal(item.key));return btn;};
 const brCell=item=>{
  const cell=document.createElement('div');cell.className='ba-jira-br-cell';
  if(!item._brRefs.length){cell.textContent='—';return cell;}
  for(const ref of item._brRefs){
   const line=document.createElement('div');line.className='ba-jira-br-entry';
   const open=document.createElement('button');open.type='button';open.className='jira-issue-inline-link';open.textContent=ref.label;
   open.title=ref.kind==='local'?'View '+ref.label+' details':'View Jira-only Epic details';open.addEventListener('click',event=>{event.stopPropagation();openBARequirementModal(ref);});line.append(open);
   if(ref.kind==='jira'){const badge=document.createElement('small');badge.className='ba-jira-br-origin';badge.textContent='Jira only · no local BR evidence';line.append(badge);}
   cell.append(line);
  }
  return cell;
 };
 baJiraTableInstance=ATGVDataTables.mount(root,rows,[
  {key:'brLabel',label:'Business Requirement',render:brCell},{key:'key',label:'Jira key',render:keyLink},{key:'type',label:'Type'},
  {key:'summary',label:'Summary'},{key:'status',label:'Status',render:item=>{
    const el=document.createElement('span');el.textContent=item.status||'Unknown';
    if(String(item.type||'').toLowerCase()==='epic'){
      const children=jiraInventoryItems.filter(child=>child.parentKey===item.key);
      const active=children.filter(child=>/in progress|review|doing/i.test(child.status));
      if(active.length){const detail=document.createElement('small');detail.style.display='block';detail.className='muted';detail.textContent=active.length+' child issue(s) in progress (Epic status unchanged)';el.append(detail);}
    }
    return el;
   }},
  {key:'brOwner',label:'BR owner',render:item=>{
    const roots=(item._brRefs||[]).map(ref=>ref.rootKey).filter(Boolean);
    const epic=String(item.type||'').toLowerCase()==='epic'&&roots.includes(item.key)?item:
      jiraInventoryItems.find(issue=>roots.includes(issue.key));
    const node=document.createElement('span');node.textContent=roots.length?(item.brOwner||'Unassigned'):'—';
    if(epic?.reporterId)node.title='Current Jira Reporter account ID: '+epic.reporterId;
    return node;
   }},
  {key:'creator',label:'Created by',render:item=>{const name=document.createElement('span');name.textContent=item.creator||'Unavailable';if(item.creatorId)name.title='Atlassian account ID: '+item.creatorId;return name;}},{key:'created',label:'Created',render:item=>{const stamp=document.createElement('time');const raw=String(item.created||'');const parsed=new Date(raw.replace(/([+-]\d{2})(\d{2})$/,'$1:$2'));stamp.title=raw;stamp.dateTime=Number.isNaN(parsed.getTime())?'':parsed.toISOString();stamp.textContent=Number.isNaN(parsed.getTime())?raw:(new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'})).format(parsed);return stamp;}}
 ],{label:'All Jira items and Business Requirements for '+(key||'project'),pageSize:5,sortKey:'',onRowClick:item=>{if(item._isJiraIssue===false)openBARequirementModal(item._brRoots[0]);else openJiraIssueModal(item.key);}});
}
// Project Manager My Work shares the exact paginated, project-scoped Jira scan with BA and Overview.
// Calculations are based on Jira's real assignee, priority, status, and due date fields.
let pmJiraTableInstance=null;
let pmJiraDisplayMode='table'; // Table is the default; Kanban is optional.
let pmKanbanPending=false;
let pmForecast=null;
let pmEffortEdits={};
function pmOptionList(id,values,defaultText){
 const node=$(id),selection=node.value;
 const entries=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 if(node.options.length===entries.length+1 && entries.every((v,i)=>node.options[i+1].value===v))return;
 node.replaceChildren();const all=document.createElement('option');all.value='';all.textContent=defaultText;node.append(all);
 for(const entry of entries){const item=document.createElement('option');item.value=entry;item.textContent=entry;node.append(item);}
 node.value=entries.includes(selection)?selection:'';
}
function pmJiraIssueType(type){
 const t=String(type||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
 if(['br','business requirement','business requirements'].includes(t))return 'br';
 if(t==='epic')return 'epic';
 if(['story','stories','user story','user stories'].includes(t))return 'story';
 if(t==='task')return 'task';
 if(['subtask','sub task','sub-task'].includes(t))return 'subtask';
 return 'other';
}
function pmToday(){const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');}
function pmText(tag,text,className=''){const node=document.createElement(tag);node.textContent=String(text??'');if(className)node.className=className;return node;}
function pmJiraLink(item){const link=document.createElement('button');link.type='button';link.className='jira-issue-inline-link';link.textContent=item.key;link.addEventListener('click',()=>openJiraIssueModal(item.key));return link;}
function syncPMJiraView(){
 const asKanban=pmJiraDisplayMode==='kanban';
 const table=$('pmJiraTableView'),board=$('pmJiraKanbanView');
 if(!table||!board)return;
 table.classList.toggle('hidden',asKanban);
 board.classList.toggle('hidden',!asKanban);
 $('pmShowTable').setAttribute('aria-pressed',String(!asKanban));
 $('pmShowKanban').setAttribute('aria-pressed',String(asKanban));
 $('pmShowTable').classList.toggle('active',!asKanban);
 $('pmShowKanban').classList.toggle('active',asKanban);
 if(!asKanban)window.ATGVKanban?.destroy?.();
}
function setPMJiraView(mode){
 if(!['table','kanban'].includes(mode)||pmJiraDisplayMode===mode)return;
 if(mode==='kanban'&&(!window.ATGVKanban||typeof window.ATGVKanban.render!=='function')){
   status('Kanban controller unavailable. Jira DataTable remains available; reload to retry.',true);return;
 }
 pmJiraDisplayMode=mode;syncPMJiraView();renderPMDashboard();
}
$('pmShowTable').addEventListener('click',()=>setPMJiraView('table'));
$('pmShowKanban').addEventListener('click',()=>setPMJiraView('kanban'));

function renderPMDashboard(){
 const root=$('pmDailyCockpit');if(!root||selectedRole!=='project-manager'||view!=='work')return;
 const key=projectConnectionsSnapshot.jira?.key||'';
 const scoped=jiraInventoryProject===activeId&&jiraInventoryKey===key;
 const items=scoped?jiraInventoryItems:[];
 const today=pmToday(),summary=ATGVPMDelivery.analyze(items,today);
 const statusNode=$('pmDataStatus');$('pmRefreshJira').disabled=!activeId||!key||jiraInventoryRunning;
  syncPMJiraView();
  const kanbanRoot=$('pmKanbanBoard');
  if(pmJiraDisplayMode==='kanban'&&kanbanRoot&&window.ATGVKanban){
    window.ATGVKanban.render(kanbanRoot,items,{
      busy:pmKanbanPending||jiraInventoryRunning,
      onOpen:item=>openJiraIssueModal(item.key),
      onMove:(item,target)=>{
        if(pmKanbanPending)return;
        pmKanbanPending=true;
        $('pmKanbanStatus').textContent='Checking Jira transitions for '+item.key+' → '+target+'…';
        // Restore the server-authoritative column while Jira checks permissions
        // and asks for confirmation; a successful transition triggers a fresh scan.
        queueMicrotask(()=>{if(pmKanbanPending)renderPMDashboard();});
        send('pmJiraTransition',{projectId:activeId,key:item.key,status:target,expectedUpdated:item.updated});
      }
    });
    if(!pmKanbanPending)$('pmKanbanStatus').textContent=jiraInventoryRunning?'Loading Jira issues…':'Drag a card or choose a status. Jira permission and confirmation are required.';
  }
 if(!activeId||!key)statusNode.textContent='Set and test the Jira Project Key using the Jira card on Overview to load PM delivery data.';
 else if(jiraInventoryError&&scoped)statusNode.textContent='Jira '+key+' retrieval failed: '+jiraInventoryError+'. Partial data may be displayed; do not treat it as complete.';
 else if(jiraInventoryRunning&&scoped)statusNode.textContent='Loading Jira '+key+' · '+items.length+' issues received… Metrics are provisional until the search completes.';
 else if(jiraInventoryLoaded&&scoped)statusNode.textContent=items.length+' Jira issues in '+key+(jiraInventoryTruncated?' · 20,000-item cap reached; report is incomplete.':' · Updated from Jira.');
 else statusNode.textContent='Jira '+key+' · Refresh to load current delivery data.';
 const cards=$('pmMetricCards');cards.replaceChildren();
 const ready=!!key&&scoped&&(jiraInventoryLoaded||jiraInventoryRunning||jiraInventoryError);
 const reviews=(deliveryState.items||[]).filter(x=>x.status==='in-review').length;
 for(const [label,value,hint] of [
  ['Open issues',ready?summary.open:'—','All non-completed issues'],
  ['Overdue',ready?summary.overdue:'—','Past due; unresolved'],
  ['Blocked',ready?summary.blocked:'—','Explicit blocked status'],
  ['Due next 7 days',ready?summary.dueSoon:'—','Today through next 7 days'],
  ['Reviews pending',reviews,'Local SDLC delivery reviews'],
  ['Completed',ready?summary.completed:'—','Completed Jira statuses']]){
  const card=pmText('div','','pm-metric');card.append(pmText('strong',value),pmText('span',label),pmText('small',hint,'muted'));cards.append(card);
 }
 const queue=$('pmActionQueue');queue.replaceChildren();
 if(!ready){queue.append(pmText('p','Refresh Jira to populate today’s actions.','muted'));}
 else if(!summary.queue.length)queue.append(pmText('p','No explicitly blocked, overdue or due-soon work found in the loaded Jira issues.','muted'));
 else{
  for(const item of summary.queue.slice(0,12)){
   const row=pmText('div','','pm-queue-row');const side=pmText('div','','pm-queue-main');
   const flag=item.pmState.blocked?'Blocked':item.pmState.overdue?'Overdue':'Due soon';
   side.append(pmJiraLink(item),pmText('strong',item.summary||'Untitled issue'),pmText('small',[item.assignee||'Unassigned',item.dueDate?'Due '+item.dueDate:'No due date',item.priority||''].filter(Boolean).join(' · '),'muted'));
   const badge=pmText('span',flag,'pm-queue-badge '+(item.pmState.blocked||item.pmState.overdue?'pm-warning':'pm-due'));
   row.append(side,badge);queue.append(row);
  }
  if(summary.queue.length>12)queue.append(pmText('p',(summary.queue.length-12)+' more flagged Jira issues appear in the table below.','muted'));
 }
 const forecastNode=$('pmForecastSummary'),forecastChart=$('pmForecastGantt');forecastChart.replaceChildren();
 const forecast=pmForecast&&!jiraInventoryRunning&&jiraInventoryLoaded&&!jiraInventoryTruncated?pmForecast:null;
 $('pmApproveEstimates').disabled=!forecast||!!forecast.error||!!forecast.provisional||!forecast.taskCount;
 if(!forecast)forecastNode.textContent='Refresh complete Jira data for an effort-weighted forecast.';
 else if(forecast.error)forecastNode.textContent='Forecast unavailable: '+forecast.error;
 else{
  const variance=forecast.varianceCalendarDays;
  forecastNode.textContent=`${forecast.completionPercent??0}% complete · ${forecast.earnedMd} / ${forecast.totalMd} man-days earned · ${forecast.remainingMd} MD remaining · Forecast ${forecast.forecastFinish||'—'} · Manual deadline ${forecast.deadline||'Not set'}${variance!==null?' · '+(variance>0?variance+' days late':Math.abs(variance)+' days early/on target'):''} · ${forecast.unapprovedEstimates} provisional estimates${forecast.baseline?.approvedAt?' · Baseline approved '+forecast.baseline.approvedAt.slice(0,10):''}.`;
  const bars=forecast.tasks.slice(0,24);for(const row of bars){const entry=pmText('div','','pm-milestone');
   const label=pmText('div','','pm-milestone-top');label.append(pmText('strong',row.key+' · '+row.summary));
   const field=document.createElement('label');field.className='muted';field.textContent='Estimated MD ';
   const amount=document.createElement('input');amount.type='number';amount.min='0.125';amount.max='1000';amount.step='0.125';amount.style.width='6rem';amount.value=String(pmEffortEdits[row.key]??row.md);
   amount.setAttribute('aria-label','Man-day estimate for '+row.key);
   amount.addEventListener('input',()=>{const number=Number(amount.value);if(Number.isFinite(number)&&number>=.125&&number<=1000)pmEffortEdits[row.key]=number;else delete pmEffortEdits[row.key];});
   field.append(amount);label.append(field,pmText('span',row.progress+'%','muted'));entry.append(label);
   entry.append(pmText('small',row.start+' → '+row.end+(row.dependencies?.length?' · Blocked by '+row.dependencies.join(', '):''),'muted'));forecastChart.append(entry);}
  if(forecast.tasks.length>24)forecastChart.append(pmText('p','Showing first 24 delivery tasks. Open the Gantt for the full timeline.','muted'));
 }
 const progress=$('pmDeliveryProgress');progress.replaceChildren();
 progress.append(pmText('strong',forecast&&forecast.completionPercent!==null?forecast.completionPercent+'% effort-weighted complete':ready&&summary.completionPercent!==null?summary.completionPercent+'% issue-count complete':'No Jira progress available'));
 const bar=pmText('div','','pm-progress-track'),fill=pmText('span','','pm-progress-fill');fill.style.width=forecast&&forecast.completionPercent!==null?forecast.completionPercent+'%':ready&&summary.completionPercent!==null?summary.completionPercent+'%':'0%';bar.append(fill);progress.append(bar);
 progress.append(pmText('p',forecast?'Verified delivery effort from leaf tasks; parent issues excluded.':'Waiting for a complete effort forecast.','muted'));
 const milestoneRoot=$('pmMilestones');milestoneRoot.replaceChildren();
 const milestones=ATGVPMDelivery.milestones(timelineData.tasks,today);
 if(!milestones.length)milestoneRoot.append(pmText('p','No saved role milestones. Set role dates in Project Settings.','muted'));
 for(const milestone of milestones){
   const row=pmText('div','','pm-milestone');
   const top=pmText('div','','pm-milestone-top');top.append(pmText('strong',milestone.label),pmText('span',milestone.percent+'%'+(milestone.late?' · Behind planned end':'') ,'muted'));row.append(top);
   const track=pmText('div','','pm-progress-track'),fill=pmText('span','','pm-progress-fill');fill.style.width=milestone.percent+'%';track.append(fill);row.append(track);
   row.append(pmText('small',(milestone.start||'No start')+' → '+(milestone.end||'No end'),'muted'));milestoneRoot.append(row);
 }
 const workload=$('pmWorkload');workload.replaceChildren();
 if(!ready)workload.append(pmText('p','Team workload appears after Jira issues load.','muted'));
 else if(!summary.workload.length)workload.append(pmText('p','No visible Jira issues.','muted'));
 else{
   const table=document.createElement('table');table.className='pm-workload-table';
   const head=document.createElement('thead'),tr=document.createElement('tr');for(const label of ['Assignee','Open','Overdue','Blocked','Total'])tr.append(pmText('th',label));head.append(tr);table.append(head);
   const body=document.createElement('tbody');
   for(const person of summary.workload.slice(0,20)){const line=document.createElement('tr');for(const label of [person.name,person.open,person.overdue,person.blocked,person.total])line.append(pmText('td',label));body.append(line);}
   table.append(body);workload.append(table);
   if(summary.workload.length>20)workload.append(pmText('p','Showing the 20 highest-attention assignees out of '+summary.workload.length+'.','muted'));
 }
 const governance=$('pmGovernanceChecklist');governance.replaceChildren();
 const role=(roleData.roles||[]).find(r=>r.id==='project-manager');
 const completed=roleData.progress?.['project-manager']||{};
 for(const task of role?.tasks||[]){const row=pmText('div','','pm-governance-row');const done=!!completed[task.id];row.append(pmText('span',done?'✓':'○',done?'pm-done':'muted'),pmText('span',task.label||task.id));governance.append(row);}
 if(!role?.tasks?.length)governance.append(pmText('p','Project Manager role tasks not configured.','muted'));
 pmOptionList('pmAssigneeFilter',items.map(x=>x.assignee||'Unassigned'),'All assignees');
 pmOptionList('pmStatusFilter',items.map(x=>x.status),'All statuses');
 pmOptionList('pmPriorityFilter',items.map(x=>x.priority),'All priorities');
 const typeFilter=$('pmTypeFilter').value,assignee=$('pmAssigneeFilter').value,status=$('pmStatusFilter').value,priority=$('pmPriorityFilter').value,due=$('pmDueFilter').value,term=$('pmJiraFilter').value.trim().toLowerCase();
 const matches=summary.items.filter(item=>(!typeFilter||pmJiraIssueType(item.type)===typeFilter)&&(!assignee||(item.assignee||'Unassigned')===assignee)&&(!status||item.status===status)&&(!priority||item.priority===priority)&&
 (!due||(due==='overdue'&&item.pmState.overdue)||(due==='soon'&&item.pmState.dueSoon)||(due==='none'&&!item.dueDate))&&
 (!term||[item.key,item.summary,item.assignee,item.status,item.priority].some(v=>String(v||'').toLowerCase().includes(term))));
 // Default: explicit blocker first, overdue second, due-soon third, then Jira's created-descending order.
 const rank=x=>x.pmState.blocked?0:x.pmState.overdue?1:x.pmState.dueSoon?2:3;
 matches.sort((a,b)=>rank(a)-rank(b)||(b.created||'').localeCompare(a.created||''));
 const grid=$('pmJiraTable');
 if(typeof ATGVDataTables==='undefined'){grid.textContent='Jira DataTables are unavailable.';return;}
 if(pmJiraTableInstance){pmJiraTableInstance.setRows(matches);return;}
 pmJiraTableInstance=ATGVDataTables.mount(grid,matches,[
  {key:'key',label:'Jira Key',render:pmJiraLink},{key:'summary',label:'Summary'},
  {key:'type',label:'Type'},{key:'assignee',label:'Assignee',render:item=>item.assignee||'Unassigned'},
  {key:'priority',label:'Priority'},{key:'status',label:'Status'},
  {key:'dueDate',label:'Due Date',render:item=>item.dueDate||'—'},
  {key:'updated',label:'Updated'}
 ],{label:'Project Manager Jira work items',pageSize:5,sortKey:'',onRowClick:item=>openJiraIssueModal(item.key)});
}
function ensurePMJiraInventory(force=false){
 if(view!=='work'||selectedRole!=='project-manager')return;
 renderPMDashboard();
 const key=projectConnectionsSnapshot.jira?.key||'';
 if(activeId&&key&&!jiraInventoryRunning&&(force||jiraInventoryProject!==activeId||jiraInventoryKey!==key||Date.now()-jiraInventoryLastChecked>=300000))searchJiraInventory();
}
$('pmRefreshJira').addEventListener('click',searchJiraInventory);
$('pmApproveEstimates').addEventListener('click',()=>send('pmApproveEffortBaseline',{projectId:activeId,overrides:pmEffortEdits}));
for(const id of ['pmJiraFilter','pmTypeFilter','pmAssigneeFilter','pmStatusFilter','pmPriorityFilter','pmDueFilter'])$(id).addEventListener(id==='pmJiraFilter'?'input':'change',renderPMDashboard);
$('pmOpenDocuments').addEventListener('click',()=>navigate('documents'));
$('pmOpenApprovals').addEventListener('click',()=>navigate('operations'));
$('pmOpenGantt').addEventListener('click',()=>{navigate('overview');$('overviewGanttDetails').open=true;send('loadPlanning');});

function searchJiraInventory(){
 pmForecast=null;
 const key=projectConnectionsSnapshot.jira?.key||'';
 if(!activeId||!key){renderBAJiraInventory();return;}
 jiraInventoryLastChecked=Date.now();
 jiraInventoryProject=activeId;jiraInventoryRequest++;jiraInventoryItems=[];jiraInventoryPage=0;jiraInventoryRunning=true;jiraInventoryLoaded=false;jiraInventoryError='';jiraInventoryTruncated=false;jiraInventoryViewerId='';
 jiraInventoryKey=key;
 $('jiraInventoryModalTitle').textContent='Jira project '+jiraInventoryKey+' · All items';
 $('jiraInventoryStatus').textContent='Loading all visible issues from Jira '+jiraInventoryKey+'…';
 $('jiraInventoryRefresh').disabled=true;renderJiraInventory();renderBAJiraInventory();renderPMDashboard();
 send('searchProjectJiraInventory',{projectId:activeId,requestId:jiraInventoryRequest});
}
function ensureBAJiraInventory(force=false){
 if(view!=='baOverview'||selectedRole!=='business-analyst')return;
 renderBAJiraInventory();
 const key=projectConnectionsSnapshot.jira?.key||'';
 if(!activeId||!key)return;
 if(!jiraInventoryRunning&&(force||jiraInventoryProject!==activeId||jiraInventoryKey!==key||Date.now()-jiraInventoryLastChecked>=300000))searchJiraInventory();
}
function openJiraInventory(){
 if(!activeId||!projectConnectionsSnapshot.jira?.key){status('Configure a Jira Project Key in Project Connections first.',true);return;}
 $('jiraInventoryModal').classList.remove('hidden');$('jiraInventoryModal').setAttribute('aria-hidden','false');$('jiraInventoryClose').focus();
 if(jiraInventoryProject!==activeId||jiraInventoryKey!==projectConnectionsSnapshot.jira.key||!jiraInventoryRunning&&Date.now()-jiraInventoryLastChecked>=300000)searchJiraInventory();
 else {renderJiraInventory();$('jiraInventoryStatus').textContent=jiraInventoryRunning?'Scanning Jira '+jiraInventoryKey+'…':jiraInventoryItems.length+' Jira issues loaded.';}
}
function closeJiraInventory(){
 $('jiraInventoryModal').classList.add('hidden');$('jiraInventoryModal').setAttribute('aria-hidden','true');
 // Jira inventory scans remain active in the host even when the modal closes.
 // Keep request IDs and partial pages so returning to the page resumes live data.
 $('overviewJiraInventory').focus();
}
$('overviewJiraInventory').addEventListener('click',openJiraInventory);
$('jiraInventoryClose').addEventListener('click',closeJiraInventory);
$('jiraInventoryModal').addEventListener('click',event=>{if(event.target===$('jiraInventoryModal'))closeJiraInventory();});
$('jiraInventoryModal').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeJiraInventory();}});
$('jiraInventoryRefresh').addEventListener('click',searchJiraInventory);
$('jiraInventoryFilter').addEventListener('input',()=>{jiraInventoryPage=0;renderJiraInventory();});
$('jiraInventoryPrev').addEventListener('click',()=>{jiraInventoryPage--;renderJiraInventory();});
$('jiraInventoryNext').addEventListener('click',()=>{jiraInventoryPage++;renderJiraInventory();});
$('baJiraInventoryRefresh').addEventListener('click',()=>{
 searchJiraInventory();
 if(jiraInventoryRunning)jiraLinkReconcileAfterRefreshRequest=jiraInventoryRequest;
});

function resetBATransferPanel(){
 baTransferRequest++;
 baTransferState=null;baTransferBusy=false;
 $('baTransferPanel').classList.add('hidden');
 $('baTransferUsers').disabled=true;$('baTransferUsers').replaceChildren();
 $('baTransferCommit').disabled=true;
 $('baTransferCancel').disabled=false;
 $('baTransferProgress').hidden=true;$('baTransferFill').style.width='0%';
 $('baTransferProgress').setAttribute('aria-valuenow','0');
 $('baTransferStatus').textContent='';
}
function setBATransferProgress(percent,message){
 const value=Math.max(0,Math.min(100,Number(percent)||0));
 $('baTransferProgress').hidden=false;
 $('baTransferFill').style.width=value+'%';
 $('baTransferProgress').setAttribute('aria-valuenow',String(value));
 $('baTransferStatus').textContent=message||'Verifying transfer…';
}
$('baTransferOpen').addEventListener('click',()=>{
 const selected=baRequirementModalTarget;
 if(!selected?.rootKey||baTransferBusy)return;
 resetBATransferPanel();
 $('baTransferPanel').classList.remove('hidden');
 $('baTransferTitle').textContent='Transfer '+(selected.brId||selected.rootKey);
 $('baTransferStatus').textContent='Loading verified Business Analysts from the project roster…';
 const option=document.createElement('option');option.value='';option.textContent='Loading Business Analysts…';
 $('baTransferUsers').append(option);
 send('baJiraTransferCandidates',{roleId:selectedRole,projectId:activeId,jiraKey:selected.rootKey,brId:selected.brId,requestId:baTransferRequest});
});
$('baTransferUsers').addEventListener('change',()=>{
 $('baTransferCommit').disabled=!baTransferState||baTransferBusy||!$('baTransferUsers').value;
});
$('baTransferCancel').addEventListener('click',()=>{if(!baTransferBusy)resetBATransferPanel();});
$('baTransferCommit').addEventListener('click',()=>{
 const context=baTransferState,target=$('baTransferUsers').value;
 if(baTransferBusy||!context||!target||!context.users.some(user=>user.accountId===target))return;
 baTransferBusy=true;$('baTransferCommit').disabled=true;$('baTransferUsers').disabled=true;
 $('baTransferCancel').disabled=true;
 setBATransferProgress(10,'Requesting Jira BR ownership transfer…');
 send('baJiraTransferOwner',{roleId:selectedRole,projectId:activeId,jiraKey:context.jiraKey,brId:context.brId,
   accountId:target,expectedUpdated:context.updated,expectedOwnerId:context.ownerId,requestId:baTransferRequest});
});
window.addEventListener('message',event=>{
 const m=event.data||{};
 if(m.type==='baJiraTransferCompleted'&&m.projectId===activeId){
  jiraInventoryLastChecked=0;
  if(view==='baOverview'&&selectedRole==='business-analyst')searchJiraInventory();
  status('Transfer completed. Jira BR ownership has been verified and project items are refreshing.');
 }
 if(m.projectId!==activeId||m.requestId!==baTransferRequest||!baRequirementModalTarget||
    m.jiraKey!==baRequirementModalTarget.rootKey||$('baTransferPanel').classList.contains('hidden'))return;
 if(m.type==='baJiraTransferCandidatesResult'){
  baTransferState={...m,users:Array.isArray(m.users)?m.users:[]};
  const list=$('baTransferUsers');list.replaceChildren();
  const choose=document.createElement('option');choose.value='';choose.textContent='Select Business Analyst';list.append(choose);
  for(const user of baTransferState.users){
   const option=document.createElement('option');option.value=user.accountId;option.textContent=user.name;list.append(option);
  }
  list.disabled=!baTransferState.users.length;
  $('baTransferStatus').textContent=baTransferState.users.length?
    'Current BR owner: '+(m.ownerName||'Unassigned')+'. Choose another registered Business Analyst.':
    'No eligible Business Analysts were found. Ask them to enter My Work with the Business Analyst role.';
  $('baTransferCommit').disabled=true;
 }else if(m.type==='baJiraTransferProgress'&&baTransferBusy){
  setBATransferProgress(m.percent,m.message);
 }else if(m.type==='baJiraTransferCompleted'){
  baTransferBusy=false;setBATransferProgress(100,'Transfer completed');
  $('baTransferCancel').disabled=false;$('baTransferCancel').textContent='Close';
  $('baTransferCommit').disabled=true;
  // The project-level completion handler refreshes Jira even if the modal was closed.
 }else if(m.type==='baJiraTransferError'){
  baTransferBusy=false;$('baTransferCancel').disabled=false;
  $('baTransferCancel').textContent='Cancel';
  $('baTransferUsers').disabled=!baTransferState?.users?.length;
  $('baTransferCommit').disabled=!$('baTransferUsers').value;
  $('baTransferStatus').textContent='Transfer failed: '+String(m.message||'Refresh and try again.');
  $('baTransferProgress').hidden=true;
 }else if(m.type==='baJiraTransferCancelled'){
  baTransferBusy=false;$('baTransferCancel').disabled=false;
  $('baTransferUsers').disabled=!baTransferState?.users?.length;
  $('baTransferCommit').disabled=!$('baTransferUsers').value;
  $('baTransferProgress').hidden=true;
  $('baTransferStatus').textContent='Transfer cancelled. No Jira issue was changed.';
 }
});

$('baRequirementModalClose').addEventListener('click',()=>closeBARequirementModal());
$('baRequirementModal').addEventListener('click',event=>{if(event.target===$('baRequirementModal'))closeBARequirementModal();});
$('baRequirementModal').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeBARequirementModal();return;}
 if(event.key==='Tab'){
  const controls=[...$('baRequirementModal').querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(node=>node.getClientRects().length);
  if(!controls.length){event.preventDefault();return;}
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
window.addEventListener('atgv:viewchange',()=>{if(!['baOverview','discovery'].includes(view)&&baRequirementModalTarget)closeBARequirementModal(false);});
$('baReviewDeletedJira').addEventListener('click',()=>send('reviewPreviouslyDeletedJira'));
$('baJiraBrFilter').addEventListener('change',renderBAJiraInventory);
$('baJiraListView').addEventListener('click',()=>{baJiraView='list';renderBAJiraInventory();});
$('baJiraTreeView').addEventListener('click',()=>{baJiraView='tree';renderBAJiraInventory();});
$('baJiraTypeFilter').addEventListener('change',renderBAJiraInventory);
$('baJiraStatusFilter').addEventListener('change',renderBAJiraInventory);
window.addEventListener('message',event=>{
 const msg=event.data||{};
 if(msg.type==='brDeletedEverywhere'){
  // Never remove issues belonging to a different BR merely because a BR was
  // deleted. A successful Delete Everywhere invalidates the inventory and
  // requests a fresh Jira scan; saved BR links come from the updated register.
  if(msg.projectId!==activeId)return;
  // Invalidate every role's Jira/BR cache, not only the visible BA table.
  roleJiraRequest++;roleJiraLoaded=false;roleJiraLoading=false;roleJiraItems=[];
  roleJiraProject='';roleJiraIncomplete=false;
  assignedJiraLoaded=false;assignedJiraLoading=false;assignedJiraProject='';
  selectedHandoffBrId=null;roleStepScopedData=null;
  jiraInventoryRequest++; // Reject any pre-deletion in-flight Jira batches.
  jiraLinkReconcileAfterRefreshRequest=0;
  jiraInventoryItems=[];jiraInventoryPage=0;jiraInventoryRunning=false;
  jiraInventoryLoaded=false;jiraInventoryLastChecked=0;jiraInventoryError='';jiraInventoryTruncated=false;jiraInventoryViewerId='';
  if(baJiraTableInstance)baJiraTableInstance.setRows([]);
  if(pmJiraTableInstance)pmJiraTableInstance.setRows([]);
  // Also clear the previous Jira publication preview/progress cache; it can
  // otherwise show keys that are no longer present in the BR register.
  jiraPublicationPlan=[];jiraPublicationConfirmed.clear();jiraPlanForCR=[];jiraLinkCandidates=[];jiraPreflightBlocked=false;jiraProtectionForCR=[];
  jiraPublishState={phase:'idle',confirmed:0,total:0,message:'No Jira publication is running.',currentKey:'',error:''};
  brPlanRevision=null;brJiraPreviewApproved=false;brJiraPlanChanges=0;brJiraPlanConflicts=0;
  $('jiraInventoryStatus').textContent='Jira links updated. Refreshing the remote Jira inventory…';
  renderJiraApprovalTable();renderJiraPublicationState();renderPublishedJira();
  renderJiraInventory();renderBAJiraInventory();renderPMDashboard();
  // Jira inventory is shared by BA, PM and Overview: refresh for every role.
  if(activeId&&projectConnectionsSnapshot.jira?.key)searchJiraInventory();
  if(view==='work'&&['software-developer','ux-designer'].includes(selectedRole))loadRoleJiraIssues(true);
  if(view==='work'&&selectedRole==='software-developer')loadAssignedJiraTasks(true);
  if(view==='work')renderRoleWork();
  return;
 }
 if(msg.type==='projectDeliveryForecast'){
  if(msg.projectId!==activeId||msg.requestId!==jiraInventoryRequest)return;
  pmForecast=msg.forecast||null;renderPMDashboard();
  if(view==='landing'&&$('overviewGanttDetails').open)renderGantt(timelineData);
  return;
 }
 if(msg.type==='orphanJiraCleanupCompleted'){status('Verified historical Jira cleanup completed. Refreshing project items.');searchJiraInventory();return;}
 if(msg.type==='orphanJiraCleanupProgress'){status('Deleting verified historical Jira issues: '+msg.deleted+' of '+msg.total);return;}
 if(msg.projectId!==jiraInventoryProject||msg.requestId!==jiraInventoryRequest)return;
 if(msg.type==='pmJiraTransitionResult'&&msg.projectId===activeId){
    pmKanbanPending=false;
    $('pmKanbanStatus').textContent=msg.success?'Jira transition saved. Refreshing statuses…':'Jira transition not applied: '+(msg.message||'Transition unavailable.');
    if(msg.success)searchJiraInventory();
    else{
      renderPMDashboard();
      $('pmKanbanStatus').textContent='Jira transition not applied: '+(msg.message||'Transition unavailable.');
    }
    return;
  }
  if(msg.type==='jiraInventoryViewer'){
    jiraInventoryViewerId=String(msg.accountId||'');
    renderBAJiraInventory();renderPMDashboard();
 }
 if(msg.type==='jiraInventoryBatch'){
    jiraInventoryItems.push(...(msg.issues||[]));
    $('jiraInventoryStatus').textContent='Scanning Jira '+jiraInventoryKey+' · '+jiraInventoryItems.length+' issues loaded across '+msg.page+' page(s)…';
    renderJiraInventory();renderBAJiraInventory();renderPMDashboard();
 }
 if(msg.type==='jiraInventoryCompleted'){
    const reviewStaleLinks=jiraLinkReconcileAfterRefreshRequest===msg.requestId;
    if(reviewStaleLinks)jiraLinkReconcileAfterRefreshRequest=0;
    jiraInventoryRunning=false;jiraInventoryLoaded=true;jiraInventoryLastChecked=Date.now();jiraInventoryTruncated=!!msg.truncated;
    $('jiraInventoryRefresh').disabled=false;
    $('jiraInventoryStatus').textContent=msg.count+' Jira items loaded'+(msg.truncated?' · 20,000-item safety cap reached; additional Jira records may exist.':' · search complete.');
    renderJiraInventory();renderBAJiraInventory();renderPMDashboard();
    if(reviewStaleLinks)send('reconcileBRJiraLinks',{brId:'*',projectId:activeId});
 }
 if(msg.type==='jiraInventoryError'){
    if(jiraLinkReconcileAfterRefreshRequest===msg.requestId)jiraLinkReconcileAfterRefreshRequest=0;
    jiraInventoryRunning=false;jiraInventoryError=msg.message||'Unknown error';
    $('jiraInventoryRefresh').disabled=false;
    $('jiraInventoryStatus').textContent='Jira search failed after '+jiraInventoryItems.length+' item(s): '+jiraInventoryError;
    renderJiraInventory();renderBAJiraInventory();renderPMDashboard();
 }
});

$('projectConnectionModalClose').addEventListener('click',closeProjectConnectionModal);
$('projectConnectionCancel').addEventListener('click',closeProjectConnectionModal);
$('projectConnectionModal').addEventListener('click',event=>{if(event.target===$('projectConnectionModal'))closeProjectConnectionModal();});
$('projectConnectionKey').addEventListener('input',invalidateMappingTest);
$('projectConnectionTest').addEventListener('click',()=>{
 if(!mappingModalKind||!mappingModalProjectId||mappingBusy)return;
 const key=$('projectConnectionKey').value.trim().toUpperCase();
 if(!/^[A-Z0-9_-]{1,40}$/.test(key)){mappingModalStatus('Enter a valid project or space key.',true);return;}
 invalidateMappingTest();mappingBusy=true;
 $('projectConnectionTest').disabled=true;$('projectConnectionSave').disabled=true;
 mappingModalStatus('Checking remote access and permissions…');
 send('testProjectConnectionMapping',{kind:mappingModalKind,key,projectId:mappingModalProjectId,requestId:mappingRequestSerial});
});
$('projectConnectionForm').addEventListener('submit',event=>{
 event.preventDefault();if(!mappingVerified||mappingBusy)return;
 const key=$('projectConnectionKey').value.trim().toUpperCase();
 if(key!==mappingVerified.key){invalidateMappingTest();return;}
 mappingBusy=true;$('projectConnectionTest').disabled=true;$('projectConnectionSave').disabled=true;
 mappingModalStatus('Saving verified project mapping…');
 send('saveProjectConnectionMapping',{kind:mappingModalKind,key,projectId:mappingModalProjectId,requestId:mappingRequestSerial});
});
let lastRosterProject='';
function renderOverviewConnections(data){
 if(activeId&&lastRosterProject!==activeId){lastRosterProject=activeId;send('myWorkRosterRefresh',{projectId:activeId,roleId:selectedRole});}
 if(!activeId)lastRosterProject='';
 projectConnectionsSnapshot=data||{jira:{},confluence:{}};
 const jira=data?.jira||{},space=data?.confluence||{};
 const configured=record=>record.source==='project'||record.source==='extension';
 const status=(id,record)=>{
  const el=$(id),ready=configured(record);
  el.textContent='Project setting';el.title=!ready?'Configure and test this destination':record.source==='extension'?'Override inherited default for this project':'Edit project mapping after permission check';
  el.classList.toggle('needs-mapping',!ready);
 };
 status('overviewJiraMappingStatus',jira);
 status('overviewConfluenceMappingStatus',space);
 $('overviewJiraProjectKey').textContent=jira.key||'Not selected';
 $('overviewConfluenceSpaceKey').textContent=space.key||'Not selected';
 const jiraDetails=[];
 if(jira.key)jiraDetails.push('Project key: '+jira.key);
 if(jira.site)jiraDetails.push('Site: '+jira.site);
 $('overviewJiraProjectInfo').textContent=jiraDetails.join(' · ')||'Select a Jira project in Project Settings.';
 const spaceDetails=[];
 if(space.name)spaceDetails.push(space.name);
 if(space.key)spaceDetails.push('Space key: '+space.key);
 if(space.spaceId)spaceDetails.push('Space ID: '+space.spaceId);
 if(space.site)spaceDetails.push('Site: '+space.site);
 $('overviewConfluenceSpaceInfo').textContent=spaceDetails.join(' · ')||'Select a Confluence space in Project Settings.';
}
function renderOverviewSdlcPhases(){
 const container=$('overviewPhaseCircles');
 if(!container)return;
 const aggregator=globalThis.atgvOverviewSdlcPhases;
 if(!aggregator||typeof aggregator.aggregate!=='function'){
  $('overviewPhaseSummary').textContent='Phase progress unavailable';return;
 }
 const phases=aggregator.aggregate(roleData.roles,roleData.progress);
 container.replaceChildren();
 let total=0,completed=0;
 for(const phase of phases){
  total+=phase.total;completed+=phase.completed;
  const node=document.createElement('div');node.className='overview-phase';node.dataset.phase=phase.id;node.dataset.state=phase.state;
  const circle=document.createElement('div');circle.className='overview-phase-ring';
  circle.setAttribute('role','progressbar');circle.setAttribute('aria-valuemin','0');circle.setAttribute('aria-valuemax','100');
  circle.setAttribute('aria-valuenow',String(phase.percent));
  circle.setAttribute('aria-valuetext',phase.total?`${phase.completed} of ${phase.total} local tasks complete`:'No local tasks recorded');
  circle.setAttribute('aria-label',phase.label+' phase progress');
  circle.style.setProperty('--phase-percent',phase.percent+'%');
  const center=document.createElement('span');center.className='overview-phase-value';center.textContent=phase.total?phase.percent+'%':'—';
  circle.append(center);
  const label=document.createElement('strong');label.className='overview-phase-label';label.textContent=phase.label;
  const count=document.createElement('small');count.className='overview-phase-count';
  count.textContent=phase.total?`${phase.completed} / ${phase.total} tasks`:'No tracked tasks';
  node.append(circle,label,count);container.append(node);
 }
 $('overviewPhaseSummary').textContent=total?`${completed} / ${total} local tasks complete`:'No local SDLC tasks recorded';
}
function renderOverviewRoles(summary){
  $('overviewActive').textContent=projects.find(p=>p.id===activeId)?.name||'None selected';
  $('overviewDocs').textContent=String(summary.documents||0);
  renderOverviewJira();
  const roles=roleData.roles||[];
  const total=roles.reduce((n,r)=>n+r.tasks.length,0);
  const done=roles.reduce((n,r)=>n+r.tasks.filter(t=>roleData.progress?.[r.id]?.[t.id]===true).length,0);
  $('overviewProgress').textContent=done+' / '+total;
  renderOverviewSdlcPhases();
  const h=healthData||{label:'Not Scheduled',tone:'neutral',startDate:'',endDate:'',completed:done,total,percent:total?Math.round(done/total*100):0};
  const badge=$('overviewStatus');badge.textContent=h.label;badge.className='project-health-badge '+(h.tone||'neutral');
  $('overviewSchedule').textContent=h.startDate&&h.endDate?`${h.startDate} – ${h.endDate}`:'Set project dates in Settings';
  $('overviewHealthDetail').textContent=`${h.completed??done} of ${h.total??total} work items completed · ${h.percent??0}% actual progress${h.startDate&&h.endDate?' · '+(h.expectedPercent??0)+'% expected':''}`;
}
function renderHandoffs(){
  const root=$('handoffList');root.replaceChildren();
  const handoff=roleData.readiness?.handoffs?.find(r=>r.roleId===selectedRole);
  const items=handoff?.items||[];
  $('handoffReadyCount').textContent=String(handoff?.ready||0);
  $('handoffBlockedCount').textContent=String(handoff?.blocked||0);
  $('handoffDoneCount').textContent=String(handoff?.completed||0);
  const state=(handoff?.blocked||0)>0&&!handoff?.ready?'Blocked':handoff?.ready?'Ready':handoff?.completed?'Completed':'Awaiting Business Requirements';
  $('handoffRoleStatus').textContent=state;
  $('handoffOwnerStatus').textContent=handoffOwnership.me?'Account: '+handoffOwnership.me:handoffOwnership.scope==='local'?'Local identity required':'Ownership not loaded';
  for(const item of items){
    const row=document.createElement('div');row.className='handoff-row'+(selectedHandoffBrId===item.brId?' selected':'');
    const info=document.createElement('div');info.className='handoff-item-info';
    const name=document.createElement('strong');name.textContent=item.brId==='project'?'Project-level work':item.brId+' · '+item.brTitle;
    const sub=document.createElement('small');sub.textContent=item.blockers.length?item.blockers.join(' · '):item.jiraKey?item.jiraKey+' · BR revision '+item.brRevision:'No prerequisites';
    info.append(name,sub);
    const badge=document.createElement('span');badge.className='handoff-badge '+item.status;badge.textContent=item.status==='ready'?'Ready':item.status==='completed'?'Complete':'Blocked';
    row.append(info,badge);
    {
      const id='handoff-'+item.id,record=handoffOwnership.documents.find(d=>d.documentId===id)||{revision:0,ownerId:null,pending:null};
      const me=handoffOwnership.me,mine=!!me&&record.ownerId===me,pending=record.pending;
      const presentation=ATGVOwnershipPresentation.display(record,me,{cached:!!handoffOwnership.cached});
      const ownerStatus=document.createElement('span');ownerStatus.className='ownership-state-text '+presentation.state;ownerStatus.textContent=presentation.text;row.append(ownerStatus);
      const actions=[presentation.primary,presentation.secondary].filter(Boolean);
      for(const operation of actions){
        const label=ATGVOwnershipPresentation.actionLabel(operation);
        const action=document.createElement('button');action.type='button';action.className='secondary';action.textContent=handoffOwnerBusy===id?'Processing…':label;
        action.disabled=handoffOwnerBusy!==null||(!me&&handoffOwnership.scope!=='local')||!!handoffOwnership.cached&&['approve-transfer','reject-transfer','cancel-transfer'].includes(operation);
        if(operation&&!action.disabled){action.addEventListener('click',()=>{handoffOwnerBusy=id;renderHandoffs();send('roleHandoffAction',{handoffId:item.id,action:operation,revision:record.revision});});}
        row.append(action);
      }
    }
    const owner=handoffOwnership.documents.find(d=>d.documentId==='handoff-'+item.id);
    if(item.status!=='blocked'&&handoffOwnership.me&&owner?.ownerId===handoffOwnership.me){
      const open=document.createElement('button');open.type='button';open.textContent=selectedHandoffBrId===item.brId?'Selected':'Start Work';open.className=selectedHandoffBrId===item.brId?'secondary':'';
      open.disabled=selectedHandoffBrId===item.brId;
      open.addEventListener('click',()=>{selectedHandoffBrId=item.brId;renderRoleWork();});row.append(open);
    }
    root.append(row);
  }
  if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='No work items available.';root.append(p);}
}
function deliveryText(value){return value===null||value===undefined?'—':String(value);}
function deliveryElement(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=deliveryText(text);if(className)el.className=className;return el;}
function renderDelivery(){
 const root=$('deliveryQueue');if(!root)return;root.replaceChildren();
 const all=deliveryState.items||[],filter=$('deliveryFilter').value;
 const roles=$('deliveryRoleFilter');roles.replaceChildren();
 for(const role of roleData.roles||[]){const option=document.createElement('option');option.value=role.id;option.textContent=role.label;roles.append(option);}
 // My Work follows the sidebar role: the second picker is a role switch, never an independent all-roles filter.
 roles.value=selectedRole;
 const roleItems=all.filter(item=>item.role_id===selectedRole);
 const assignedToMe=item=>!!handoffOwnership.me&&(item.owner===handoffOwnership.me||handoffOwnership.documents.some(doc=>doc.documentId==='handoff-'+item.role_id+'-'+item.br_id&&doc.ownerId===handoffOwnership.me));
 const visible=roleItems.filter(item=>filter==='all'||(filter==='mine'&&assignedToMe(item))||(filter==='ai-drafts'&&(item.generation_status==='ready'||item.backgroundDraftCount>0))||(filter==='awaiting-review'&&item.status==='in-review')||item.status===filter);
 $('deliveryStats').textContent=roleItems.length+' deliverables · '+visible.length+' matching';
 if(deliveryState.error){root.append(deliveryElement('p',deliveryState.error,'muted'));return;}
 const tableRows=[];
 for(const item of visible){
  const card=deliveryElement('div',undefined,'delivery-row');
  const main=deliveryElement('div',undefined,'delivery-row-main');
  const title=deliveryElement('strong',item.title);
  const meta=deliveryElement('span',[item.br_id,item.br_revision?'r'+item.br_revision:'',item.jira_key||'Project work',item.jira_type,item.owner?'Owner: '+item.owner:'Unassigned'].filter(Boolean).join(' · '),'muted');
  const baSourceTask=item.role_id==='business-analyst'&&item.br_id==='project'&&['discovery','requirements','stories'].includes(item.task_id);
  const badge=deliveryElement('span',baSourceTask?'BA workflow':item.status.replace(/-/g,' '),'delivery-status '+(baSourceTask?'workflow':item.status));
  main.append(title,meta);
  if(item.blockers?.length)main.append(deliveryElement('small',item.blockers.join('; '),'delivery-blockers'));
  if(item.generation_status==='ready')main.append(deliveryElement('small','AI proposal available','delivery-ready'));
  if(item.backgroundDraftCount)main.append(deliveryElement('small',item.backgroundDraftCount+' background AI draft(s) in Approvals & Handoffs','delivery-ready'));
  // BA source mapping and generated BRs belong to the immutable nine-step workflow, not a duplicate delivery draft.
  const handoff=roleData.readiness?.handoffs?.find(x=>x.roleId===item.role_id)?.items.find(x=>x.brId===item.br_id);
  const ownerDoc=handoffOwnership.documents.find(x=>x.documentId==='handoff-'+(handoff?.id||item.role_id+'-'+item.br_id));
  const me=handoffOwnership.me;
  const isOwner=!!me&&ownerDoc?.ownerId===me;
  const reviewable=item.status==='in-review';
  const isReviewer=!!me&&['business-owner','product-owner','project-manager'].some(role=>handoffOwnership.documents.some(d=>d.documentId==='handoff-'+role+'-'+item.br_id&&d.ownerId===me));
  const action=deliveryElement('button',undefined,'secondary');action.type='button';
  if(baSourceTask){
   action.textContent='Open Business Requirements';action.disabled=!activeId;
   action.title='Continue the nine-step Business Requirements workflow. Generated drafts are not separate delivery assignments.';
   action.addEventListener('click',()=>navigate('discovery'));
  }else if(!isOwner&&!reviewable){
   const operation=ownerDoc?.ownerId?'request-transfer':'claim';
   action.textContent=operation==='claim'?'Assign to Me':'Request Transfer';
   action.disabled=!me||!handoff||!!handoffOwnerBusy||item.status==='blocked'||item.status==='completed'||item.status==='stale'||!!ownerDoc?.pending;
   action.title=!me?'Connect Jira/Confluence or select a local identity before claiming work.':!handoff?'Refresh role handoffs to claim this work.':ownerDoc?.pending?'Ownership request pending.':item.blockers?.join('; ')||'Claim the role handoff before starting this deliverable.';
   action.addEventListener('click',()=>{if(action.disabled)return;handoffOwnerBusy='handoff-'+handoff.id;renderRoleWork();send('roleHandoffAction',{handoffId:handoff.id,action:operation,revision:ownerDoc?.revision||0});});
  }else{
   action.textContent=reviewable&&!isOwner?'Review':deliveryInfo?.item?.id===item.id?'Resume Work':'Start Work';
   action.disabled=reviewable?!(isOwner||isReviewer):!isOwner||(item.owner&&item.owner!==me)||item.status==='blocked'||item.status==='completed'||item.status==='stale';
   action.title=reviewable?'Open authorized review context':item.owner&&item.owner!==me?'Delivery work is assigned to another user. Refresh ownership or request a transfer.':item.blockers?.join('; ')||'Open Work Execution Workbench';
   action.addEventListener('click',()=>{deliveryBusy=true;$('deliveryAiProgress').textContent='Opening work and checking ownership…';send(reviewable||item.status==='stale'?'deliveryInspect':'deliveryStart',{id:item.id});});
  }
  tableRows.push({title:item.title,description:meta.textContent,status:badge.textContent,owner:item.owner||'Unassigned',main,badge,action});
 }
 ATGVDataTables.mount(root,tableRows,[{key:'title',label:'Deliverable',render:item=>item.main},{key:'status',label:'Status',render:item=>item.badge},{key:'owner',label:'Owner'},{key:'action',label:'Action',sortable:false,render:item=>item.action}],{label:'My Work deliverables',pageSize:5,sortKey:'title'});
 if(deliveryInfo)renderDeliveryWorkbench();
}

function renderDeliveryWorkbench(){
 if(!deliveryInfo?.item)return;
 const item=deliveryInfo.item;const ownerRecord=handoffOwnership.documents.find(x=>x.documentId==='handoff-'+item.role_id+'-'+item.br_id);
 const myItem=!!handoffOwnership.me&&ownerRecord?.ownerId===handoffOwnership.me&&item.owner===handoffOwnership.me;
 const canReview=!!handoffOwnership.me&&!myItem&&handoffOwnership.scope!=='local'&&['business-owner','product-owner','project-manager'].some(role=>handoffOwnership.documents.some(x=>x.documentId==='handoff-'+role+'-'+item.br_id&&x.ownerId===handoffOwnership.me));
 const open=$('deliveryWorkbench');open.classList.remove('hidden');
 const context=$('deliveryContext');context.replaceChildren();
 for(const [heading,value] of [['Role',item.role_id],['Deliverable',item.title],['JIRA',item.jira_key||'Project-level work'],['JIRA type',item.jira_type],['Issue summary',item.jira_title],['Approved Business Requirements',item.br_id+' · revision '+item.br_revision],['Status',item.status],['Owner',item.owner||'Unassigned'],['Dependencies',item.blockers.length?item.blockers.join('; '):'None']]){
  const line=deliveryElement('div',undefined,'delivery-fact');line.append(deliveryElement('small',heading,'muted'),deliveryElement('strong',value));context.append(line);
 }
 if(deliveryInfo.approved){const details=deliveryElement('details');details.append(deliveryElement('summary','Approved Business Requirement'));const body=deliveryElement('pre',JSON.stringify(deliveryInfo.approved,null,2),'delivery-context-code');details.append(body);context.append(details);}
 if(!deliveryDraftDirty){$('deliveryMode').value=item.mode;$('deliveryContent').value=item.content||'';$('deliveryEvidence').value=(item.evidence||[]).join('\n');}
 $('deliveryEditorStatus').textContent=item.status.replace(/-/g,' ')+' · draft revision '+item.draft_revision+' · '+(item.updated||'');
 const editable=myItem&&!deliveryBusy&&['in-progress','ai-draft-ready','needs-input','changes-requested','ready'].includes(item.status);
 $('deliveryContent').disabled=!editable;$('deliveryEvidence').disabled=!editable;$('deliveryMode').disabled=!editable;
 $('deliverySave').disabled=!editable;$('deliverySubmit').disabled=!editable||!item.draft_revision;
 $('deliveryComplete').disabled=!myItem||deliveryBusy||item.status!=='approved';
 $('deliverySyncHandoff').disabled=!myItem||deliveryBusy||item.status!=='completed';
 $('deliveryApplyDocument').disabled=!myItem||deliveryBusy||!item.path||!['approved','completed'].includes(item.status);
 $('deliveryGenerate').disabled=!editable;$('deliveryImprove').disabled=!editable;$('deliveryValidate').disabled=!editable;
 $('deliveryApprove').disabled=!canReview||deliveryBusy||item.status!=='in-review';$('deliveryRequestChanges').disabled=!canReview||deliveryBusy||item.status!=='in-review';
 $('deliveryOpenQuill').disabled=!item.path;$('deliveryCompare').disabled=item.draft_revision<2;
 $('deliveryRebase').disabled=!myItem||deliveryBusy||item.status!=='stale'||item.blockers.length>0;
 const suggestions=$('deliverySuggestions');suggestions.replaceChildren();
 for(const suggestion of deliveryInfo.suggestions||[]){
  const block=deliveryElement('div',undefined,'delivery-suggestion');block.append(deliveryElement('strong','AI proposal · '+suggestion.status));
  const preview=deliveryElement('pre',suggestion.content,'delivery-context-code');block.append(preview);
  if(suggestion.assumptions.length)block.append(deliveryElement('p','Assumptions: '+suggestion.assumptions.join('; '),'muted'));
  if(suggestion.questions.length)block.append(deliveryElement('p','Needs input: '+suggestion.questions.join('; '),'delivery-blockers'));
  if(suggestion.sources.length)block.append(deliveryElement('p','References: '+suggestion.sources.join('; '),'muted'));
  if(suggestion.status==='pending'){
   const buttons=deliveryElement('div',undefined,'stack');for(const [action,label] of [['accept','Apply Suggestion'],['reject','Reject Suggestion']]){
    const button=deliveryElement('button',label,action==='reject'?'secondary':'');button.disabled=deliveryBusy;
    button.addEventListener('click',()=>{deliveryBusy=true;send('deliveryResolveSuggestion',{id:item.id,suggestionId:suggestion.id,action});});buttons.append(button);
   }block.append(buttons);
  }suggestions.append(block);
 }
 if(!deliveryInfo.suggestions?.length)suggestions.append(deliveryElement('p','No AI suggestions yet. Start with Generate Draft or write the document manually.','muted'));
 const history=$('deliveryHistory');history.replaceChildren();for(const revision of deliveryInfo.history||[])history.append(deliveryElement('div','Revision '+revision.revision+' · '+revision.actor+' · '+revision.created,'muted'));
 for(const panel of document.querySelectorAll('[data-delivery-panel]'))panel.classList.toggle('delivery-panel-active',panel.dataset.deliveryPanel===deliveryTab);
 for(const button of document.querySelectorAll('[data-delivery-tab]'))button.setAttribute('aria-selected',String(button.dataset.deliveryTab===deliveryTab));
}
function deliverAction(name,payload={}){if(!deliveryInfo?.item||deliveryBusy)return;deliveryBusy=true;$('deliveryEditorStatus').textContent='Working…';send(name,{id:deliveryInfo.item.id,...payload});}
$('deliveryRefresh').addEventListener('click',()=>{send('deliveryRefresh');send('roleHandoffOwners');});
$('brOpenDelivery').addEventListener('click',()=>{navigate('sdlc-roles');$('deliveryWorkspace').scrollIntoView({block:'start',behavior:'smooth'});send('deliveryRefresh');send('roleHandoffOwners');});
$('deliveryFilter').addEventListener('change',renderDelivery);
$('deliveryRoleFilter').addEventListener('change',event=>navigate(event.target.value));
$('deliveryClose').addEventListener('click',()=>{$('deliveryWorkbench').classList.add('hidden');deliveryInfo=null;deliveryDraftDirty=false;});
$('deliveryContent').addEventListener('input',()=>deliveryDraftDirty=true);
$('deliveryEvidence').addEventListener('input',()=>deliveryDraftDirty=true);
$('deliveryMode').addEventListener('change',()=>deliveryDraftDirty=true);
$('deliveryRebase').addEventListener('click',()=>deliverAction('deliveryRebase'));
$('deliveryCompare').addEventListener('click',()=>{if(deliveryInfo?.item?.draft_revision>1)deliverAction('deliveryCompare',{revision:deliveryInfo.item.draft_revision-1});});
$('deliverySave').addEventListener('click',()=>{deliverAction('deliverySave',{content:$('deliveryContent').value,revision:deliveryInfo.item.draft_revision,mode:$('deliveryMode').value,evidence:$('deliveryEvidence').value.split('\n').map(s=>s.trim()).filter(Boolean)});});
$('deliverySubmit').addEventListener('click',()=>deliverAction('deliverySubmit',{revision:deliveryInfo.item.draft_revision}));
$('deliveryComplete').addEventListener('click',()=>deliverAction('deliveryComplete',{revision:deliveryInfo.item.draft_revision}));
$('deliverySyncHandoff').addEventListener('click',()=>deliverAction('deliverySyncHandoff'));
$('deliveryApplyDocument').addEventListener('click',()=>deliverAction('deliveryApplyDocument',{revision:deliveryInfo.item.draft_revision}));
$('deliveryOpenQuill').addEventListener('click',()=>deliverAction('deliveryOpenDocument'));
$('deliveryGenerate').addEventListener('click',()=>deliverAction('deliveryGenerate'));
$('deliveryImprove').addEventListener('click',()=>{const node=$('deliveryContent'),selection=node.value.slice(node.selectionStart,node.selectionEnd);if(!selection.trim()){status('Select a part of your draft to improve.',true);return;}deliverAction('deliveryGenerate',{intent:'improve',selection});});
$('deliveryValidate').addEventListener('click',()=>deliverAction('deliveryGenerate',{intent:'validate'}));
$('deliveryApprove').addEventListener('click',()=>deliverAction('deliveryReview',{action:'approve',revision:deliveryInfo.item.draft_revision,remarks:$('deliveryReviewNotes').value}));
$('deliveryRequestChanges').addEventListener('click',()=>deliverAction('deliveryReview',{action:'changes-requested',revision:deliveryInfo.item.draft_revision,remarks:$('deliveryReviewNotes').value}));
for(const button of document.querySelectorAll('[data-delivery-tab]'))button.addEventListener('click',()=>{deliveryTab=button.dataset.deliveryTab;renderDeliveryWorkbench();});
// The redundant Developer Workbench is removed. Jira assignment stays in the role table.
function setupDeveloperFocusedLayout(){ $('workView')?.classList.remove('atgv-developer-mode'); }
// The developer task list is sourced from Jira assignee=currentUser(), not
// simulated/copied from the BR register, and it never reassigns issues.
let architectLastMessage='', architectActionBusy=false;
// Save state tracks the selected project and stays locked after a verified save
// until the user explicitly changes the technology-stack selection.
let architectSaveSelectionProjectId='',architectSaveSelectionChanged=false,architectSavePendingSelection=null;
// Live status is scoped to the selected project and remote catalog stack.
// An item is never reported as ready merely because it is listed in the catalog.
let architectChecklistLive={projectId:'',stackId:'',completed:new Set(),active:'',failed:''};
let architectPendingAction='';
function architectChecklistSession(stackId){
 if(architectChecklistLive.projectId!==activeId||architectChecklistLive.stackId!==stackId)
  architectChecklistLive={projectId:activeId,stackId,completed:new Set(),active:'',failed:''};
 return architectChecklistLive;
}
function architectProgressTask(message){
 const value=String(message||'').toLowerCase();
 if(/checking github main|checking checkout|git status/.test(value))return 'git';
 if(/preparing bootstrap|copying.*skeleton|starter files/.test(value))return 'scaffold';
 if(/dependencies|npm |nuget|dotnet restore|maven|installing |restoring /.test(value))return 'dependencies';
 if(/running test|testing, building|test checks/.test(value))return 'tests';
 if(/running build|build checks/.test(value))return 'build';
 if(/launching|reusing.*application|running application|opening the running application|checking application server preview port/.test(value))return 'server';
 if(/committing|pushing|push to github/.test(value))return 'push';
 return '';
}
function architectChecklistAdvance(message){
 const selected=$('architectStackSelect').value;
 if(!selected)return;
 const live=architectChecklistSession(selected),task=architectProgressTask(message);
 if(!task)return;
 if(live.active&&live.active!==task&&live.failed!==live.active)live.completed.add(live.active);
 live.active=task;live.failed='';
 renderArchitectRequirements(projects.find(p=>p.id===activeId));
}
function architectLiveServerReady(project,stackId){
 const prepared=project?.techStackPrepared,validated=project?.techStackValidation,live=architectServerSnapshot;
 return !!(prepared&&prepared.stackId===stackId&&project.techStackId===stackId&&validated?.status==='tested'&&validated.stackId===stackId&&
  (!validated.sha||validated.sha===prepared.sha)&&live?.running===true&&live.healthy===true&&
  live.sha===prepared.sha&&live.branch===prepared.branch&&architectServerSnapshotProjectId===activeId);
}
function architectServerRequirementReady(project,stackId){
 const prepared=project?.techStackPrepared,validated=project?.techStackValidation,proof=project?.techStackServerVerification;
 return !!(prepared&&prepared.stackId===stackId&&project.techStackId===stackId&&prepared.remotePushed===true&&
   validated?.status==='tested'&&validated.stackId===stackId&&(!validated.sha||validated.sha===prepared.sha)&&
   proof?.status==='verified'&&proof.sha===prepared.sha&&proof.branch===prepared.branch&&
   proof.root===prepared.root&&proof.stackId===stackId);
}
function renderArchitectRequirements(project){
 const stackId=$('architectStackSelect').value;
 const stack=techStacks.find(item=>item.id===stackId);
 const container=$('architectRequiredComponents');
 if(stackId==='custom'){
  // Custom Stack has its own scan/repair lifecycle; never hide or zero its progress.
  container.classList.add('hidden');
  const percent=Math.min(100,Math.max(0,Number(architectCustomProgressPercent)||0));
  $('architectStackProgressFill').style.width=percent+'%';
  $('architectStackProgress').setAttribute('aria-valuenow',String(percent));
  $('architectStackProgressText').textContent='Custom Stack · '+(architectCustomProgressLabel||'Ready to scan')+' · '+percent+'%';
  return;
 }
 container.classList.toggle('hidden',!stack);
 if(!stack){
  $('architectRequirementsList').replaceChildren();$('architectRequirementsCount').textContent='0 of 0 ready';$('architectPackageToggle')?.classList.add('hidden');
  $('architectStackProgressFill').style.width='0%';$('architectStackProgress').setAttribute('aria-valuenow','0');
  $('architectStackProgressText').textContent='Choose a stack to view requirements · 0%';return;
 }
 const live=architectChecklistSession(stackId);
 const saved=!!(project?.techStackId===stackId&&project?.techStackPrepared?.stackId===stackId);
 const tested=saved&&project?.techStackValidation?.status==='tested'&&project.techStackValidation.stackId===stackId;
 const approved=tested&&project?.techStackApproval?.status==='approved'&&project.techStackApproval.stackId===stackId;
 const pushed=saved&&project?.techStackPrepared?.remotePushed===true;
 const verified=saved&&(tested||pushed);
 const unit=Array.isArray(stack.unit)?stack.unit.join(', '):'';
 const checks=[
  ['catalog','Remote catalog',stack.name+' · downloaded descriptor',true],
  ['git','Git checkout','Clean main and safe working branch',saved],
  ['toolchain','Toolchain',stack.runtime+' · '+(stack.runCommand||stack.buildTool),verified],
  ['scaffold','Starter skeleton','Generated application files',saved],
  ['api','REST API',stack.apiBaseUrl||'Catalog API routes',saved&&Boolean(stack.apiBaseUrl)],
  ['orm','ORM',stack.orm||'Not declared by this catalog',saved&&Boolean(stack.orm)],
  ['sqlite','Database',stack.database||'Not declared by this catalog',saved&&Boolean(stack.database)],
  ['dependencies','Dependencies','Required packages / native restore',verified],
  ['tests','Automated tests',unit||'Selected stack test command',tested],
  ['build','Application build',stack.buildCommand||'Selected stack build command',tested],
  ['server','Application server',architectServerRequirementReady(project,stackId)?'HTTP health verified for saved Git revision'+(architectServerSnapshot.running?' · Running · '+(architectServerSnapshot.url||project?.techStackPrepared?.previewUrl||stack.previewUrl):' · Stopped'):(architectServerSnapshot.url||project?.techStackPrepared?.previewUrl||stack.previewUrl||'Selected stack preview'),architectServerRequirementReady(project,stackId)],
  ['push','Remote stack branch',project?.techStackPrepared?.branch||'Push verified bootstrap/migration branch (main unchanged)',pushed],
  ['approval','Architect approval','Required before Developer workflow',approved]
 ];
 // Package names and version constraints come only from the activated GitHub
 // scaffold manifests. This includes npm dependencies, NuGet and Maven.
 const packages=Array.isArray(stack.dependencyPackages)?stack.dependencyPackages:[];
 const packageRows=packages.slice(0,80).filter(item=>item&&typeof item.name==='string'&&typeof item.manager==='string');
 const dependencyAt=checks.findIndex(item=>item[0]==='dependencies')+1;
 checks.splice(dependencyAt,0,...packageRows.map((item,i)=>['package:'+i,item.manager+' · '+item.name,(item.version?item.version+' · ':'')+(item.scope||'runtime'),verified]));
 const root=$('architectRequirementsList');root.replaceChildren();
 let done=0;
 for(const [id,title,description,actual] of checks){
  const unavailable=(id==='api'&&!stack.apiBaseUrl)||(id==='orm'&&!stack.orm)||(id==='sqlite'&&!stack.database);
  const complete=!unavailable&&(['server','push'].includes(id)?actual:(actual||live.completed.has(id)));
  const running=!unavailable&&!complete&&!live.failed&&(live.active===id||(id.startsWith('package:')&&live.active==='dependencies'));
  const failed=unavailable||(!complete&&(live.failed===id||(id.startsWith('package:')&&live.failed==='dependencies')));
  if(complete)done++;
  const item=document.createElement('div');item.className='architect-requirement-item';item.dataset.state=complete?'complete':failed?'failure':running?'running':'pending';item.dataset.kind=id.startsWith('package:')?'package':'core';item.setAttribute('role','listitem');
  const icon=document.createElement('span');icon.className='architect-requirement-indicator';icon.setAttribute('aria-hidden','true');icon.textContent=complete?'✓':failed?'!':running?'…':'○';
  const content=document.createElement('div');content.className='architect-requirement-body';
  const name=document.createElement('strong');name.textContent=title;
  const detail=document.createElement('span');detail.textContent=description;detail.title=description;
  content.append(name,detail);
  if(id==='push'&&failed){detail.textContent='Push failed; inspect Download All Error Logs for the exact GitHub response. Main was not changed.';detail.title=detail.textContent;}
  const state=document.createElement('span');state.className='architect-requirement-state';
  const successLabel=['api','orm','sqlite','scaffold'].includes(id)?'Prepared':['tests','build'].includes(id)?'Passed':id==='push'?'Pushed':id==='approval'?'Approved':'Ready';
  state.textContent=complete?successLabel:unavailable?'Not defined':failed?'Failed':running?'Checking':'Pending';
  item.append(icon,content,state);root.append(item);
 }
 const percent=Math.round(done*100/checks.length);
 $('architectRequirementsTitle').textContent=stack.name;
 $('architectRequirementsCount').textContent=done+' of '+checks.length+' ready';
 const packageToggle=$('architectPackageToggle');
 if(packageToggle){
  packageToggle.classList.toggle('hidden',!packageRows.length);
  packageToggle.textContent=(root.classList.contains?.('show-package-details')?'Hide':'Show')+' '+packageRows.length+' package'+(packageRows.length===1?'':'s');
  packageToggle.setAttribute('aria-expanded',String(!!root.classList.contains?.('show-package-details')));
 }
 $('architectStackProgressFill').style.width=percent+'%';
 $('architectStackProgress').setAttribute('aria-valuenow',String(percent));
 $('architectStackProgressText').textContent=done+' of '+checks.length+' requirements ready · '+percent+'%'+(live.failed?' · Check failed item':'');
}

// The project registry is cleared by Reset Tech Stack, but the architect's
// pending selection must survive dashboard refreshes until the next Save.
$('architectPackageToggle')?.addEventListener('click',()=>{
 const list=$('architectRequirementsList');
 list.classList.toggle('show-package-details');
 const shown=list.classList.contains('show-package-details');
 const button=$('architectPackageToggle');
 button.setAttribute('aria-expanded',String(shown));
 const count=list.querySelectorAll('[data-kind=package]').length;
 button.textContent=(shown?'Hide':'Show')+' '+count+' package'+(count===1?'':'s');
});
let architectStackDraft={projectId:'',stackId:''};
function architectStackSelection(project){
 if(architectStackDraft.projectId!==activeId){
  architectStackDraft={projectId:activeId,stackId:project?.techStackId||''};
 }
 const known=architectStackDraft.stackId==='custom'||techStacks.some(stack=>stack.id===architectStackDraft.stackId);
 if(!known)architectStackDraft.stackId=techStacks.some(stack=>stack.id===project?.techStackId)?project.techStackId:'';
 return architectStackDraft.stackId;
}
function refreshArchitectStageClasses(project){
 const stackId=$('architectStackSelect').value,prepared=project?.techStackPrepared;
 const saved=!!(stackId&&prepared?.stackId===stackId&&project?.techStackId===stackId);
 const tested=saved&&project?.techStackValidation?.status==='tested'&&project.techStackValidation.stackId===stackId;
 const approved=tested&&project?.techStackApproval?.status==='approved'&&project.techStackApproval.stackId===stackId;
 const customStack=stackId==='custom';
 const preview=project?.techStackCustomPreview;
 const mockReady=!!(customStack&&saved&&preview?.status==='verified'&&preview.mockOnly===true&&
  preview.sha===prepared.sha&&preview.branch===prepared.branch);
 const serverReady=customStack?mockReady:architectServerRequirementReady(project,stackId);
 for(const [id,done,current] of [
  ['architectSaveStage',saved,!saved],['architectDependenciesStage',tested,saved&&!tested],
  ['architectTestStage',tested,tested&&!serverReady],['architectApproveStage',approved,serverReady&&!approved]
 ]){
  const step=$(id);step.classList.toggle('complete',!!done);step.classList.toggle('current',!!current);
  step.setAttribute('aria-label',step.textContent.trim()+': '+(done?'Completed':current?'Current step':'Pending'));
 }
 $('architectApprovalStatus').textContent=customStack?(approved?'Developer MOCK handoff approved · '+String(project.techStackApproval.remoteBranch||'')+' · real integrations remain unverified.':mockReady?'Mock preview verified. Approve for Developers will validate real test/build checks and publish a separate reviewed handoff branch; no main merge.':'Complete Install & Run before approving a Custom Stack development handoff.'):approved?'Approved for Developers · '+new Date(project.techStackApproval.approvedAt||Date.now()).toLocaleString():serverReady?(architectLiveServerReady(project,stackId)?'Server running and verified · ready for architect approval.':'Application server was verified for this commit and is now stopped. Ready for Architect approval.'):tested?'Run Server successfully to enable approval.':saved?'Complete Test & Run, then Run Server.':'';
}
function syncArchitectStackButtons(project){
 const stackId=$('architectStackSelect').value;
 const prepared=project?.techStackPrepared;
 const savedStackId=prepared?.stackId||project?.techStackId;
 const switching=!!(stackId&&savedStackId&&savedStackId!==stackId&&(prepared?.stackId||stackId==='custom'));
 const saved=!!(prepared?.stackId===stackId&&project?.techStackId===stackId);
 const tested=saved&&project?.techStackValidation?.status==='tested'&&project.techStackValidation.stackId===stackId;
 const approved=tested&&project?.techStackApproval?.status==='approved'&&project.techStackApproval.stackId===stackId;
 const proof=project?.techStackServerVerification;
 const serverVerified=!!(saved&&tested&&architectServerRequirementReady(project,stackId));
 const canRequestApproval=!!(saved&&tested&&prepared?.remotePushed===true);
 const save=$('architectSaveStack');
 if(architectSaveSelectionProjectId!==activeId){
  architectSaveSelectionProjectId=activeId;architectSaveSelectionChanged=false;
 }
 const persisted=stackId==='custom'?project?.techStackId==='custom':saved;
 const locked=!!(stackId&&persisted&&!architectSaveSelectionChanged);
 save.classList.toggle('atgv-stack-saved',locked);
 save.setAttribute('aria-label',locked?'Technology stack saved. Change the selection to enable Save Stack.':'Save selected technology stack');
 save.disabled=architectActionBusy||!activeId||!stackId||locked;
 save.textContent=locked?'Saved Stack':switching?'Switch & Save Stack':'Save Stack';
 $('architectResetStack').disabled=architectActionBusy||!activeId||!savedStackId||savedStackId==='custom';
 if(stackId==='custom'){
  save.title=locked?'Custom Stack saved. Change the stack selection to save again.':switching?'Use the current Git checkout as Custom Stack and clear the saved stack approval after confirmation.':'Save Custom Stack: clone the configured project GitHub repository into its missing or empty repository folder. Never overwrite existing files.';
  $('architectTestStack').disabled=true;
  // A verified mock preview unlocks REQUESTING handoff validation, not
  // approval itself. Host execution checks every target and confirms a push.
  const preview=project?.techStackCustomPreview;
  const mockReady=!!(saved&&preview?.status==='verified'&&preview.mockOnly===true&&
    preview.root===prepared.root&&preview.sha===prepared.sha&&preview.branch===prepared.branch);
  const handedOff=!!(mockReady&&approved&&project?.techStackApproval?.scope==='development-mock'&&
    project.techStackApproval.remoteVerified===true&&project.techStackApproval.remoteSha===prepared.sha);
  const handoff=$('architectApproveStack');
  handoff.disabled=architectActionBusy||!mockReady||handedOff;
  handoff.textContent=handedOff?'Development Handoff Approved':'Approve for Developers';
  $('architectTestStack').title='Real test/build checks run with explicit consent during Custom Stack handoff.';
  handoff.title=handedOff?'Development-only handoff pinned to a verified remote SHA; real integrations remain unverified.':
    mockReady?'Run test/build for every runnable application and request explicit approval to push the mock-only handoff branch, without merging main.':
    'Complete Install & Run to verify a committed, local synthetic preview first.';
  return;
 }
 $('architectApproveStack').textContent='Approve for Developers';
 // A different prepared stack can be replaced only through a confirmed,
 // clean-checkout Git reset. Keep the action available and explain that path.
 save.title=locked?'Technology stack saved. Change the selection to save again.':switching?'Review Git safety checks and confirm switching from '+prepared.stackId+' to '+stackId+'. Previous branches remain intact.':'';
 $('architectTestStack').disabled=architectActionBusy||!saved||approved;
 // Leave the action available once Save and Test & Run have been verified.
 // Host-side approval requires SHA-pinned HTTP verification and passed tests.
 // A cleanly stopped server retains this verification for the saved revision.
 // Keep the button clickable to surface a precise error if evidence is missing.
 $('architectApproveStack').disabled=architectActionBusy||!canRequestApproval||approved;
 $('architectApproveStack').title=!tested?'Complete Test & Run first.':!prepared?.remotePushed?'Push the verified stack branch using Save Stack before approval.':!serverVerified?'Run Server once to verify HTTP health for the saved and tested revision.':'Confirm approval for Developers.';
}

let roleJiraProject='',roleJiraLoading=false,roleJiraLoaded=false,roleJiraItems=[],roleJiraIncomplete=false,roleJiraRequest=0;
let jiraModalKey='',jiraModalRequest=0,jiraModalPreviousFocus=null,jiraModalUrl='';
let jiraModalDetail=null,jiraModalEditing=false,jiraModalSaving=false,jiraModalSaveRequest=0,roleJiraRefreshAfterSave=false;
let jiraModalAssigneeRequest=0,jiraModalAssigneeBusy=false,jiraModalAssigneeData=null;
let jiraModalFieldInputs=[];
function jiraFieldInput(field){
 const select=field.kind==='select'||field.kind==='boolean';
 const control=document.createElement(select?'select':field.kind==='textarea'?'textarea':'input');
 if(select){
  control.multiple=field.multiple;
  if(field.multiple)control.size=Math.min(6,Math.max(2,field.options.length));
  const options=field.kind==='boolean'?[{value:'true',label:'True'},{value:'false',label:'False'}]:[...field.options];
  const current=new Set((Array.isArray(field.value)?field.value:[field.value]).filter(value=>value!==''));
  if(!field.multiple)options.unshift({value:'',label:field.required?'Select a Jira value':'None'});
  for(const value of current)if(!options.some(option=>option.value===value))options.push({value,label:'Current value · '+value});
  for(const {value,label} of options){
   const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=current.has(value);control.append(option);
  }
 }else{
  if(field.kind==='date')control.type='date';
  if(field.kind==='textarea')control.rows=3;
  control.value=Array.isArray(field.value)?field.value.join('\n'):field.value;
  if(field.multiple)control.placeholder='One Jira value per line';
 }
 const read=()=>select&&field.multiple?Array.from(control.selectedOptions,option=>option.value):control.value;
 return {id:field.id,control,read,original:JSON.stringify(read())};
}
function changedJiraFieldInputs(inputs){
 return Object.fromEntries(inputs.filter(input=>JSON.stringify(input.read())!==input.original).map(input=>[input.id,input.read()]));
}
function resetJiraIssueEditor(){
 jiraModalEditing=false;jiraModalSaving=false;jiraModalDetail=null;jiraModalFieldInputs=[];
 $('jiraIssueEditFields')?.replaceChildren();
 jiraModalAssigneeRequest++;jiraModalAssigneeBusy=false;jiraModalAssigneeData=null;
 $('jiraIssueEditPanel').classList.add('hidden');$('jiraIssueModalBody').classList.remove('hidden');
 $('jiraIssueModalEdit').classList.add('hidden');$('jiraIssueModalSave').classList.add('hidden');$('jiraIssueModalCancelEdit').classList.add('hidden');
 $('jiraIssueEditStatus').textContent='';
}
function beginJiraIssueEdit(){
 if(!jiraModalDetail||jiraModalSaving)return;
 jiraModalEditing=true;
 $('jiraIssueEditSummary').value=jiraModalDetail.summary||'';
 $('jiraIssueEditDescription').value=jiraModalDetail.description||'';
 $('jiraIssueEditSummary').readOnly=jiraModalDetail.coreEditable?.summary===false;
 $('jiraIssueEditDescription').readOnly=jiraModalDetail.coreEditable?.description===false;
 const extra=$('jiraIssueEditFields');extra.replaceChildren();
 jiraModalFieldInputs=(jiraModalDetail.editors||[]).map(field=>{
  const input=jiraFieldInput(field);
  const label=document.createElement('label');
  label.textContent=field.name+(field.required?' · Required':'');
  label.append(input.control);extra.append(label);
  return input;
 });
 const select=$('jiraIssueEditStatusSelect');select.replaceChildren();
 const unchanged=document.createElement('option');unchanged.value='';unchanged.textContent='Keep current status ('+jiraModalDetail.status+')';select.append(unchanged);
 for(const transition of jiraModalDetail.transitions||[]){
  const option=document.createElement('option');option.value=transition.id;option.textContent=transition.to+' · '+transition.name;select.append(option);
 }
 $('jiraIssueEditPanel').classList.remove('hidden');$('jiraIssueModalBody').classList.add('hidden');
 $('jiraIssueModalEdit').classList.add('hidden');$('jiraIssueModalSave').classList.remove('hidden');$('jiraIssueModalCancelEdit').classList.remove('hidden');
 $('jiraIssueEditStatus').textContent='Changes are saved directly to remote Jira. BR review state updates after verification.';
 $('jiraIssueEditSummary').focus();
}
function saveJiraIssueEdit(){
 if(!jiraModalEditing||jiraModalSaving||!jiraModalDetail)return;
 const summary=$('jiraIssueEditSummary').value.trim(),description=$('jiraIssueEditDescription').value,transitionId=$('jiraIssueEditStatusSelect').value;
 if(!summary||summary.length>254){$('jiraIssueEditStatus').textContent='Summary must contain 1–254 characters.';return;}
 jiraModalSaving=true;$('jiraIssueModalSave').disabled=true;$('jiraIssueModalCancelEdit').disabled=true;
 $('jiraIssueEditStatus').textContent='Saving and verifying Jira issue…';
 send('roleJiraIssueSave',{key:jiraModalKey,summary,description,transitionId,fieldValues:changedJiraFieldInputs(jiraModalFieldInputs),expectedUpdated:jiraModalDetail.updated,requestId:++jiraModalSaveRequest});
}
function closeJiraIssueModal(){const panel=$('jiraIssueModal');panel.classList.add('hidden');panel.setAttribute('aria-hidden','true');jiraModalKey='';jiraModalUrl='';jiraModalRequest++;jiraModalSaveRequest++;resetJiraIssueEditor();if(jiraModalPreviousFocus?.isConnected)jiraModalPreviousFocus.focus();}
function openJiraIssueModal(key){resetJiraIssueEditor();if(!/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(String(key||'')))return;jiraModalPreviousFocus=document.activeElement;jiraModalKey=key;jiraModalUrl='';$('jiraIssueModalTitle').textContent='Jira '+key;$('jiraIssueModalSubtitle').textContent='Loading live issue details…';$('jiraIssueModalBody').textContent='Retrieving Jira details…';$('jiraIssueModalOpen').disabled=true;$('jiraIssueModal').classList.remove('hidden');$('jiraIssueModal').setAttribute('aria-hidden','false');$('jiraIssueModalClose').focus();refreshJiraIssueModal();}
function refreshJiraIssueModal(){if(!jiraModalKey)return;resetJiraIssueEditor();jiraModalUrl='';$('jiraIssueModalOpen').disabled=true;$('jiraIssueModalTitle').textContent='Jira '+jiraModalKey;$('jiraIssueModalReload').disabled=true;$('jiraIssueModalSubtitle').textContent='Refreshing ticket details…';$('jiraIssueModalBody').textContent='Loading from Jira…';send('roleJiraIssueDetails',{key:jiraModalKey,requestId:++jiraModalRequest});}
function jiraIssueAssigneeEditor(value){
 const wrap=document.createElement('div');wrap.className='jira-assignee-editor';
 const current=pmText('span','Current: '+(value.assignee||'Unassigned'),'muted');
 const select=document.createElement('select');select.id='jiraIssueAssigneeSelect';select.setAttribute('aria-label','Select verified SDLC role assignee');select.disabled=true;
 const loading=document.createElement('option');loading.value='';loading.textContent='Loading eligible team members…';select.append(loading);
 const apply=document.createElement('button');apply.type='button';apply.className='secondary';apply.id='jiraIssueAssigneeApply';apply.textContent='Assign';apply.disabled=true;
 const note=document.createElement('p');note.id='jiraIssueAssigneeStatus';note.className='muted';note.setAttribute('role','status');note.textContent='Checking Jira permissions and role-matched users…';
 const sameSelection=()=>select.value===(value.assigneeId||'__unassigned__');
 select.addEventListener('change',()=>{apply.disabled=jiraModalAssigneeBusy||!jiraModalAssigneeData||!select.value||sameSelection();});
 apply.addEventListener('click',()=>{
  if(apply.disabled||jiraModalAssigneeBusy||!jiraModalAssigneeData||value.key!==jiraModalKey)return;
  jiraModalAssigneeBusy=true;apply.disabled=true;select.disabled=true;
  note.textContent='Confirming Jira assignment scope and permissions…';
  send('pmJiraSetAssignee',{projectId:activeId,key:value.key,accountId:select.value==='__unassigned__'?null:select.value,
    expectedUpdated:value.updated,requestId:++jiraModalAssigneeRequest});
 });
 wrap.append(current,select,apply,note);
 send('pmJiraAssignableUsers',{projectId:activeId,key:value.key,requestId:++jiraModalAssigneeRequest});
 return wrap;
}
function applyJiraAssigneeUsers(msg){
 if(msg.key!==jiraModalKey||!jiraModalDetail||msg.projectId!==activeId||msg.requestId!==jiraModalAssigneeRequest)return;
 const select=document.getElementById('jiraIssueAssigneeSelect'),apply=document.getElementById('jiraIssueAssigneeApply'),note=document.getElementById('jiraIssueAssigneeStatus');
 if(!select||!apply||!note)return;
 const current=jiraModalDetail.assigneeId||'';
 jiraModalAssigneeData=msg;select.replaceChildren();
 const empty=document.createElement('option');empty.value='__unassigned__';empty.textContent='Unassigned';select.append(empty);
 let found=!current;
 for(const user of (msg.users||[])){
  const option=document.createElement('option');option.value=user.accountId;option.textContent=user.name;select.append(option);
  if(option.value===current)found=true;
 }
 if(current&&!found){
  const old=document.createElement('option');old.value=current;old.disabled=true;old.textContent=(jiraModalDetail.assignee||'Current user')+' (not currently eligible)';select.append(old);
 }
 select.value=current||'__unassigned__';
 select.disabled=false;apply.disabled=true;
 const scope=msg.scope?' · '+msg.scope.count+' development items; '+msg.scope.excludedCount+' specialist-role items excluded':'';
 note.textContent='Required role: '+msg.role+scope+'. '+(msg.message||'Select an eligible user, then click Assign.');
}
function renderJiraIssueModal(value){if(!value||value.key!==jiraModalKey)return;resetJiraIssueEditor();jiraModalDetail=value;$('jiraIssueModalEdit').classList.toggle('hidden',!(value.coreEditable?.summary||value.coreEditable?.description||value.editors?.length||value.transitions?.length));const root=$('jiraIssueModalBody');root.replaceChildren();jiraModalUrl=value.url||'';$('jiraIssueModalOpen').disabled=!jiraModalUrl;$('jiraIssueModalReload').disabled=false;$('jiraIssueModalTitle').textContent=value.key+' · '+value.summary;$('jiraIssueModalSubtitle').textContent=value.type+' · '+value.status;
 const fields=[['Status',value.status],['Priority',value.priority],['Type',value.type],['Reporter',value.reporter],['Created',value.created],['Updated',value.updated],['Due date',value.dueDate],['Assignee',value.assignee]];const grid=document.createElement('dl');grid.className='jira-issue-detail-grid';for(const [label,val] of fields){if(!val)continue;const wrapper=document.createElement('div');const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');if(label==='Assignee'&&selectedRole==='project-manager'&&view==='work')dd.append(jiraIssueAssigneeEditor(value));else dd.textContent=val;wrapper.append(dt,dd);grid.append(wrapper);}root.append(grid);
 const section=(label,text)=>{const box=document.createElement('section');box.className='jira-issue-detail-block';const heading=document.createElement('h3');heading.textContent=label;const content=document.createElement('p');content.textContent=text||'Not provided';box.append(heading,content);root.append(box);return box;};
 section('Description',value.description||'No description provided.');
 if(value.parent){const box=section('Parent',value.parent.key+' · '+(value.parent.summary||''));const btn=document.createElement('button');btn.className='jira-issue-inline-link';btn.type='button';btn.textContent='View '+value.parent.key;btn.addEventListener('click',()=>{jiraModalKey=value.parent.key;refreshJiraIssueModal();});box.append(btn);}
 if(value.subtasks?.length){const box=document.createElement('section');box.className='jira-issue-detail-block';const heading=document.createElement('h3');heading.textContent='Subtasks ('+value.subtasks.length+')';box.append(heading);for(const sub of value.subtasks){const btn=document.createElement('button');btn.type='button';btn.className='jira-issue-subtask';btn.textContent=sub.key+' · '+sub.summary+' · '+sub.status;btn.addEventListener('click',()=>{jiraModalKey=sub.key;refreshJiraIssueModal();});box.append(btn);}root.append(box);}
 if(value.labels?.length)section('Labels',value.labels.join(', '));if(value.components?.length)section('Components',value.components.join(', '));if(value.fixVersions?.length)section('Fix versions',value.fixVersions.join(', '));
}
$('jiraIssueModalEdit').addEventListener('click',beginJiraIssueEdit);
$('jiraIssueModalSave').addEventListener('click',saveJiraIssueEdit);
$('jiraIssueModalCancelEdit').addEventListener('click',()=>{if(!jiraModalSaving)resetJiraIssueEditor();if(jiraModalDetail)$('jiraIssueModalEdit').classList.remove('hidden');});
$('jiraIssueModalClose').addEventListener('click',closeJiraIssueModal);$('jiraIssueModalReload').addEventListener('click',refreshJiraIssueModal);$('jiraIssueModalOpen').addEventListener('click',()=>{if(jiraModalUrl)send('openExternalUrl',{url:jiraModalUrl});});$('jiraIssueModal').addEventListener('click',event=>{if(event.target===$('jiraIssueModal'))closeJiraIssueModal();});$('jiraIssueModal').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeJiraIssueModal();}if(event.key==='Tab'){const focusables=[...$('jiraIssueModal').querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')].filter(el=>!el.closest('.hidden')&&!el.classList.contains('hidden'));if(!focusables.length)return;const at=focusables.indexOf(document.activeElement);if(event.shiftKey&&at===0){event.preventDefault();focusables.at(-1).focus();}else if(!event.shiftKey&&at===focusables.length-1){event.preventDefault();focusables[0].focus();}}});

// One ticket-scoped six-stage UI/UX workflow. All review actions stay local.
let uxSelectedKey='',uxDrafts={wireframe:null,mockup:null},uxPipeline=null,uxPipelineBusy=false,uxPipelineStage=0,uxPendingOpenKey='',uxReferenceAvailable=false,uxPipelineStopping=false,uxCanStop=true,uxFramework='',uxFrameworks=[];
let uxFrontendPublishing=false;
const UX_STAGES=['Upload Design Reference (Optional)','User Flow','Wireframe','UI Mockup','Interactive Prototype','Developer Handoff'];
const uxReadyForPreview=()=>!!uxPipeline?.exists&&['review','approved'].includes(uxPipeline.status);
function setUxStatus(message){const status=$('uxDesignStatus');status.textContent=String(message||'');status.classList.toggle('hidden',!status.textContent);}
function renderUxProgress(){
 const root=$('uxProgressSteps');root.replaceChildren();
 UX_STAGES.forEach((label,index)=>{
  const step=document.createElement('div');step.className='ux-workflow-step';step.setAttribute('role','listitem');
  const ready=uxReadyForPreview();
  const complete=!(index===0&&!uxReferenceAvailable)&&( (ready&&(index<5||uxPipeline.status==='approved'))||(uxPipelineBusy&&index<uxPipelineStage-1) );
  const running=uxPipelineBusy&&index===uxPipelineStage-1;
  const awaitingApproval=uxPipeline?.status==='review'&&index===5&&!uxPipelineBusy;
  const optionalSkipped=index===0&&!uxReferenceAvailable&&!running;
  const starting=!uxPipelineBusy&&!ready&&(!uxPipeline||uxPipeline.status==='rejected')&&index===1;
  step.classList.toggle('complete',complete);
  step.classList.toggle('running',running);
  step.classList.toggle('current',running||starting);
  step.classList.toggle('review',awaitingApproval);
  step.classList.toggle('skipped',optionalSkipped&&!complete);
  const circle=document.createElement('span');circle.className='ux-workflow-number';circle.setAttribute('aria-hidden','true');circle.textContent=complete?'✓':String(index+1);
  const name=document.createElement('span');name.className='ux-workflow-label';name.textContent=label;
  const indicator=document.createElement('small');indicator.className='ux-workflow-state';
  indicator.textContent=running?'Running…':complete?'Completed':awaitingApproval?'Awaiting approval':optionalSkipped?(ready?'Skipped':'Optional'):starting?'Ready':'Pending';
  step.setAttribute('aria-label',label+': '+indicator.textContent);
  if(running){step.setAttribute('aria-current','step');circle.setAttribute('title','Generating '+label);}
  step.append(circle,name,indicator);root.append(step);
 });
 const completed=root.querySelectorAll('.ux-workflow-step.complete').length;
 const skipped=root.querySelectorAll('.ux-workflow-step.skipped').length;
 const summary=$('uxProgressSummary');
 if(summary){
  summary.textContent=uxPipelineBusy?`Generating ${UX_STAGES[Math.max(0,uxPipelineStage-1)]} · ${completed} complete`:
   uxPipeline?.status==='review'?`${completed} complete · awaiting approval`:
   uxPipeline?.status==='approved'?`${completed} complete${skipped?' · '+skipped+' skipped':''} · approved`:
   uxSelectedKey?`${completed} complete${skipped?' · '+skipped+' optional':''}`:'Select a Business Requirement to begin';
 }
}
// A pinned catalogue is downloaded globally, but must also be activated in the
// current workspace. Explain that distinction and allow explicit reactivation.
function renderUxFrameworkAvailability(data={}){
 const bar=$('uxFrameworkAvailabilityBar'),text=$('uxFrameworkAvailability'),button=$('uxFrameworkReactivate');
 const source=$('uxFrameworkSource');
 const unavailable=Array.isArray(data.unavailable)?data.unavailable:[];
 const declared=Number(data.declared||0),available=Array.isArray(data.frameworks)?data.frameworks.length:uxFrameworks.length;
 const sha=String(data.snapshot?.sha||'').slice(0,12);
 source.textContent=(available?`${available}${declared?'/'+declared:''} design systems · `:'')+'Catalog '+String(data.snapshot?.version||'not active')+(sha?' · '+sha:'');
 const problem=unavailable.length||declared>available||!available||data.updateAvailable||!!data.error;
 bar.classList.toggle('hidden',!problem);
 if(!problem){text.textContent='';return;}
 const details=[String(data.error||''),data.updateAvailable?'Installed catalogue '+String(data.installedVersion||'newer')+' is not yet activated for this workspace.':'',...unavailable.map(v=>String(v.label||v.id)+': '+String(v.reason||'Unavailable'))].filter(Boolean).join(' · ');
 text.textContent=declared?`${available}/${declared} frameworks active${sha?' · '+sha:''}. ${details||'Activated workspace snapshot may be outdated.'}`:
  (details || 'No activated design frameworks. Pull the SDLC Catalog in Settings, then activate it for this workspace.');
 button.disabled=false;
 button.title='Use the verified downloaded catalog to repair the workspace activation. No network request or repository changes.';
}

// All reference metadata is untrusted. Only textContent and locally authored
// styles are used; no GitHub HTML/CSS/JS is injected or executed in the webview.
let uxGuideData=null,uxGuideFilter='',uxGuideSection='all';
function uxGuideNode(tag,cls='',content=''){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(content!==undefined&&content!==null)el.textContent=String(content);
 return el;
}
function uxGuidePreview(item,framework,primary){
 const root=uxGuideNode('div','ux-visual-sample'),name=String(item.name||'').toLowerCase();
 const add=(tag,cls,text,parent=root)=>{const node=uxGuideNode(tag,cls,text);parent.append(node);return node;};
 const button=(text,cls)=>{const b=add('span','ux-example-button '+cls,text);return b;};
 if(name.includes('button')||name.includes('action')){
  button('Primary','primary');button('Secondary','outline');button('Disabled','disabled');
 }else if(/color|theme/i.test(name)){
  for(const val of ['Primary','Success','Warning'])add('span','ux-example-chip',val);
 }else if(/input|text field|form control|select|dropdown|textarea|checkbox|radio|switch|range|file|validation|floating|password/i.test(name)){
  const field=add('div','ux-example-field','');add('label','',item.name,field);
  if(name.includes('checkbox')||name.includes('radio')||name.includes('switch')){const choice=add('div','ux-example-inline','',field);add('span','ux-example-check','✓',choice);add('span','', 'Enabled',choice);}
  else if(name.includes('select')||name.includes('dropdown')){const select=add('div','ux-example-input','Choose option  ▾',field);select.setAttribute('role','presentation');}
  else add('div','ux-example-input','Sample value',field);
 }else if(/table|list group|data table/i.test(name)){
  const table=add('div','ux-example-table','');for(const [a,b] of [['Name','Status'],['Item A','Active'],['Item B','Pending']]){const row=add('div','ux-example-table-row','',table);add('span','',a,row);add('span','',b,row);}
 }else if(/badge|tag|pill|status/i.test(name)){
  for(const [text,cls] of [['Active','ok'],['Pending','warn'],['Error','error']])add('span','ux-example-chip '+cls,text);
 }else if(/alert|toast|notification|feedback/i.test(name)){
  add('div','ux-example-alert','✓ Operation completed successfully');
 }else if(/progress|spinner|loading|skeleton/i.test(name)){
  const rail=add('div','ux-example-progress','');add('span','ux-example-progress-fill','',rail);
 }else if(/card|kpi|statistic/i.test(name)){
  const card=add('div','ux-example-stat','');add('small','','Monthly total',card);add('strong','','1,284',card);add('span','','+12.4% this period',card);
 }else if(/grid|container|layout|gutter|flex|shell/i.test(name)){
  const grid=add('div','ux-example-grid','');for(let i=1;i<=3;i++)add('span','','Column '+i,grid);
 }else if(/nav|tab|breadcrumb|pagination|menu/i.test(name)){
  const nav=add('div','ux-example-nav','');for(const t of ['Overview','Details','Settings'])add('span',t==='Overview'?'active':'',t,nav);
 }else if(/modal|dialog|popover|offcanvas|tooltip/i.test(name)){
  const panel=add('div','ux-example-dialog','');add('strong','','Dialog heading',panel);add('small','','Example supporting information',panel);add('span','ux-example-button primary','Confirm',panel);
 }else if(/typography|heading|display|text/i.test(name)){
  add('strong','ux-example-display','Design starts here');add('span','','Clear, readable body text.');
 }else if(/avatar|image|media|figure/i.test(name)){
  add('span','ux-example-avatar','UI');add('span','','Profile image placeholder');
 }else{
  const chip=add('span','ux-example-generic',item.name);chip.title='Illustrative component presentation';
 }
 return root;
}
function renderUxFrameworkGuide(message){
 const framework=String(message.framework||'');
 if(!['aia-qi','bootstrap-5.3'].includes(framework)&&!/^[a-z][a-z0-9-]{0,48}$/.test(framework))return;
 if(!message.catalog||!Array.isArray(message.catalog.components))return;
 uxGuideData={...message,components:message.catalog.components.slice(0,200).filter(x=>x&&typeof x.name==='string'&&typeof x.category==='string')};
 uxGuideFilter='';uxGuideSection='all';$('uxGuideSearch').value='';
 $('uxDesignWorkspace').classList.add('ux-guide-open');$('uxFrameworkRightPane').classList.remove('hidden');
 $('uxGuideTitle').textContent=String(message.label||framework)+' · Visual Style Guide';
 $('uxGuideSource').textContent=`Active SDLC Catalogue v${message.source?.version||'unknown'} · Framework Kit v${message.source?.kitVersion||message.catalog.version||'unknown'} · Git SHA ${String(message.source?.sha||'').slice(0,12)} · ${message.source?.repository||'SDLC Catalog'} / ${message.source?.ref||'main'}`;
 $('uxGuideNotice').textContent=framework==='aia-qi'?'Independent Qi-inspired starter — not the official AIA Qi component library. Visual samples are illustrative, using approved catalogue tokens.':'Bootstrap component examples based on the pinned catalogue. Interactive Bootstrap JavaScript is not executed in this reference pane.';
 $('uxGuideCount').textContent=uxGuideData.components.length+' components';
 const categories=[...new Set(uxGuideData.components.map(x=>String(x.category||'other').toLowerCase()))].sort();
 const select=$('uxGuideCategory');select.replaceChildren();const all=uxGuideNode('option','', 'All categories');all.value='all';select.append(all);
 for(const category of categories){const option=uxGuideNode('option','',category[0].toUpperCase()+category.slice(1));option.value=category;select.append(option);}
 const palette=Array.isArray(message.palette)?message.palette.filter(x=>x&&typeof x.name==='string'&&/^#[0-9a-f]{6}$/i.test(x.hex)).slice(0,24):[];
 const primary=palette.find(x=>/Primary 500|^Primary$/i.test(x.name))?.hex||(framework==='aia-qi'?'#d31145':'#0d6efd');
 $('uxFrameworkRightPane').style.setProperty('--ux-guide-primary',primary);
 uxGuideDraw();$('uxGuideClose').focus();
}
function uxGuideDraw(){
 if(!uxGuideData)return;
 const root=$('uxGuideCanvas');root.replaceChildren();
 const entries=uxGuideData.components.filter(x=>(uxGuideSection==='all'||String(x.category).toLowerCase()===uxGuideSection)&&
  [x.name,x.category,x.use,...(Array.isArray(x.classes)?x.classes:[])].join(' ').toLowerCase().includes(uxGuideFilter));
 const framework=uxGuideData.framework,palette=Array.isArray(uxGuideData.palette)?uxGuideData.palette:[];
 const primary=framework==='aia-qi'?'#d31145':'#0d6efd';
 if(uxGuideSection==='all'&&!uxGuideFilter){
  const foundation=uxGuideNode('section','ux-guide-foundation');foundation.append(uxGuideNode('h4','', 'Foundation · Colour, typography & grid'));
  const colors=uxGuideNode('div','ux-guide-palette');
  for(const item of palette.slice(0,16)){
   if(!/^#[a-f0-9]{6}$/i.test(item.hex))continue;
   const swatch=uxGuideNode('div','ux-guide-swatch');const sample=uxGuideNode('span','ux-guide-swatch-color');sample.style.backgroundColor=item.hex;swatch.append(sample,uxGuideNode('small','',item.name),uxGuideNode('code','',item.hex));colors.append(swatch);
  }
  foundation.append(colors);
  const foundationGrid=uxGuideNode('div','ux-guide-foundation-grid');
  const font=uxGuideNode('div','ux-guide-type');font.append(uxGuideNode('small','', 'TYPOGRAPHY'),uxGuideNode('strong','', 'Aa  Design with clarity'),uxGuideNode('span','', 'Heading / body · 16px · Responsive typography'));
  const grid=uxGuideNode('div','ux-guide-grid-overview');grid.append(uxGuideNode('small','', 'RESPONSIVE LAYOUT'));
  const sample=uxGuideNode('div','ux-example-grid');for(let i=1;i<=4;i++)sample.append(uxGuideNode('span','',String(i)));grid.append(sample);
  foundationGrid.append(font,grid);foundation.append(foundationGrid);root.append(foundation);
 }
 if(!entries.length){root.append(uxGuideNode('p','ux-guide-empty','No components match this search.'));return;}
 const groups=new Map();for(const x of entries){const c=String(x.category).toLowerCase();if(!groups.has(c))groups.set(c,[]);groups.get(c).push(x);}
 for(const [category,items] of groups){
  const section=uxGuideNode('section','ux-guide-section'),head=uxGuideNode('div','ux-guide-section-heading');
  head.append(uxGuideNode('h4','',category[0].toUpperCase()+category.slice(1)),uxGuideNode('span','',items.length+' components'));section.append(head);
  const cards=uxGuideNode('div','ux-guide-cards');
  for(const item of items){
   const card=uxGuideNode('article','ux-guide-card');card.append(uxGuideNode('h5','',item.name));
   const preview=uxGuidePreview(item,framework,primary);preview.setAttribute('aria-label','Illustrative preview of '+item.name);card.append(preview);
   if(typeof item.use==='string')card.append(uxGuideNode('p','ux-guide-usage',item.use.slice(0,350)));
   const classes=(Array.isArray(item.classes)?item.classes:[]).filter(x=>typeof x==='string').slice(0,24);
   const tags=uxGuideNode('div','ux-guide-classes');for(const cls of classes)tags.append(uxGuideNode('code','',cls.slice(0,100)));card.append(tags);
   const details=uxGuideNode('details','ux-guide-details'),summary=uxGuideNode('summary','', 'Usage & markup');details.append(summary);
   const code=uxGuideNode('pre','',`<div class="${classes.filter(c=>/^[a-zA-Z0-9_-]{1,60}$/.test(c)).slice(0,2).join(' ')}">${String(item.name).replace(/[&<>"']/g,'')}</div>`);details.append(code);
   if(Array.isArray(item.states)&&item.states.length)details.append(uxGuideNode('small','','States: '+item.states.map(x=>String(x)).join(' · ').slice(0,200)));
   if(typeof item.semantic==='string'&&item.semantic)details.append(uxGuideNode('small','','Semantics: '+item.semantic.slice(0,260)));
   const copy=uxGuideNode('button','secondary ux-guide-copy','Copy markup');copy.type='button';copy.addEventListener('click',()=>{send('uxFrameworkCopyMarkup',{markup:code.textContent});});details.append(copy);
   card.append(details);cards.append(card);
  }
  section.append(cards);root.append(section);
 }
}
function updateUxFrameworkDocs(){
 const selected=uxFrameworks.find(item=>item.id===$('uxDesignFramework').value);
 const button=$('uxFrameworkDocs');
 button.disabled=!selected;
 button.setAttribute('aria-label','Open '+(selected?.label||'selected framework')+' components from SDLC Catalog');
 button.title=selected?'Show '+selected.label+' visual style guide in the right pane':'Pull and activate the SDLC Catalog to view frameworks';
}
function renderUxFrameworkOptions(frameworks,selected){
 const picker=$('uxDesignFramework');
 if(!Array.isArray(frameworks)){
   uxFramework=uxFrameworks.some(item=>item.id===selected)?selected:uxFramework;
   picker.value=uxFramework;
   updateUxFrameworkDocs();return;
 }
 // Catalog IDs legitimately contain periods (e.g. bootstrap-5.3). Match the host catalog ID grammar.
 uxFrameworks=frameworks.filter(item=>item&&/^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(item.id)&&typeof item.label==='string').slice(0,30);
 picker.replaceChildren();
 if(!uxFrameworks.length){const option=document.createElement('option');option.value='';option.textContent='Pull Catalog for design frameworks';picker.append(option);}
 for(const item of uxFrameworks){const option=document.createElement('option');option.value=item.id;option.textContent=item.label;picker.append(option);}
 uxFramework=uxFrameworks.some(item=>item.id===selected)?selected:uxFrameworks[0]?.id||'';
 picker.value=uxFramework;
 // Reviewed/approved designs lock changes, not the ability to inspect available choices.
 picker.disabled=!uxFrameworks.length || uxPipelineBusy;
 updateUxFrameworkDocs();
}
function setUxRejectFeedback(open){
 $('uxReviewActions').classList.toggle('hidden',!open);
 $('uxRejectDesign').setAttribute('aria-expanded',String(open));
 $('uxRejectDesign').textContent=open?'Confirm Disapproval':'Disapprove Design';
 if(!open)$('uxRejectReason').value='';
}
function renderUxActions(){
 const state=$('uxDesignState');
 if(state){
  const status=uxPipelineBusy?'generating':uxPipeline?.status||'not-started';
  const text={generating:uxPipelineStopping?'Stopping':'Generating',review:'Awaiting approval',approved:'Approved',rejected:'Disapproved','not-started':uxSelectedKey?'Ready to generate':'Not started'};
  state.textContent=text[status]||'Not started';
  state.dataset.status=status;
 }
 const button=$('uxGenerateUIUX');
 button.textContent=uxPipelineBusy?(uxPipelineStopping?'Stopping UI/UX…':'Stop UI/UX'):(uxReadyForPreview()?'Preview UI/UX':'Generate UI/UX');
 button.classList.toggle('ux-stop-action',uxPipelineBusy);
 button.disabled=!uxSelectedKey||(!uxReadyForPreview()&&!uxFramework)||(uxPipelineBusy&&(!uxCanStop||uxPipelineStopping));
 $('uxDeleteEntireDesign').disabled=!uxSelectedKey||uxPipelineBusy||!uxPipeline?.exists;
 $('uxPreviewDeleteEntireDesign').disabled=!uxSelectedKey||uxPipelineBusy||!uxPipeline?.exists;
 $('uxUploadReference').disabled=!uxSelectedKey||uxPipelineBusy;
 $('uxSelectedTicket').disabled=uxPipelineBusy;
 // Framework availability is workspace-wide, not gated by Jira assignment.
 $('uxDesignFramework').disabled=!uxFrameworks.length||uxPipelineBusy;
 updateUxFrameworkDocs();
 renderUxProgress();
}
function renderUxTickets(rows){
 const picker=$('uxSelectedTicket'),previous=uxSelectedKey,mine=rows.filter(item=>item.mine&&item.brRoot);
 picker.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select an assigned Business Requirement';picker.append(placeholder);
 for(const item of mine){const option=document.createElement('option');option.value=item.key;option.textContent=item.key+' · '+(item.summary||'Jira issue');picker.append(option);}
 uxSelectedKey=mine.some(item=>item.key===previous)?previous:mine[0]?.key||'';picker.value=uxSelectedKey;
 if(!uxSelectedKey){uxPipeline=null;uxDrafts={wireframe:null,mockup:null};setUxStatus('Assign an entire BR to begin designing the full application.');$('uxDesignVersionInfo').replaceChildren();$('uxReferenceInfo').textContent='';$('uxReferencePreview').replaceChildren();$('uxReferencePreview').classList.add('hidden');$('uxDesignFramework').value=uxFramework||'';showUxBuilder();renderUxActions();send('uxFrameworkRead',{key:''});return;}
 if(previous!==uxSelectedKey){uxPipeline=null;uxReferenceAvailable=false;uxDrafts={wireframe:null,mockup:null};uxFramework='';$('uxDesignFramework').value=uxFramework;showUxBuilder();}
 renderUxActions();loadUxDrafts();
}
function loadUxDrafts(){
 if(!activeId)return;
 if(!uxSelectedKey){send('uxFrameworkRead',{key:''});return;}
 setUxStatus('Loading UI/UX design for '+uxSelectedKey+'…');
 send('uxFrameworkRead',{key:uxSelectedKey});
 send('uxPipelineRead',{key:uxSelectedKey});
 for(const kind of ['wireframe','mockup'])send('uxDesignRead',{key:uxSelectedKey,kind});
 send('uxDesignReferenceRead',{key:uxSelectedKey});
}
const UX_REFERENCE_SLOTS=['Overview','Navigation','Dashboard','Forms','Tables','Mobile','Components','Colors','States','Accessibility'];
function renderUxReference(reference){
 const info=$('uxReferenceInfo'),preview=$('uxReferencePreview');preview.replaceChildren();
 const images=(reference?.images||[]).slice(0,10);
 if(!images.length){info.textContent='';preview.classList.add('hidden');return;}
 info.textContent=images.length+' / 10 reference images';
 for(let i=0;i<10;i++){
  const item=images[i],figure=document.createElement('figure');figure.className='ux-reference-thumb';
  if(item?.preview&&item.mime?.startsWith('image/')){
   const img=document.createElement('img');img.src=item.preview;img.alt='Design reference '+item.originalName;img.loading='lazy';
   const remove=document.createElement('button');remove.type='button';remove.className='ux-reference-delete';remove.title='Delete '+item.originalName;
   remove.setAttribute('aria-label','Delete design reference '+item.originalName);remove.textContent='×';
   remove.disabled=uxPipelineBusy;
   remove.addEventListener('click',()=>{if(uxPipelineBusy)return;remove.disabled=true;send('uxDesignReferenceDelete',{key:uxSelectedKey,imageId:item.id});});
   const caption=document.createElement('figcaption');caption.textContent=item.originalName;caption.title=item.originalName;
   figure.append(img,remove,caption);
  }else{
   figure.classList.add('ux-reference-placeholder');
   const label=document.createElement('span');label.textContent=UX_REFERENCE_SLOTS[i];label.setAttribute('aria-label','Suggested reference '+UX_REFERENCE_SLOTS[i]);figure.append(label);
  }
  preview.append(figure);
 }
 preview.classList.remove('hidden');
}
function showUxBuilder(){
 $('uxDesignBuilder').classList.remove('hidden');
 if(view==='uxPreview'){setView('work');renderRoleWork();}
}
function openUxDesignForIssue(key){
 if(selectedRole!=='ux-designer'||!roleJiraItems.some(row=>row.key===key&&row.mine))return;
 const picker=$('uxSelectedTicket');
 if(!Array.from(picker.options).some(option=>option.value===key))renderUxTickets(roleJiraItems);
 picker.value=key;uxSelectedKey=key;uxReferenceAvailable=false;uxPipeline=null;uxDrafts={wireframe:null,mockup:null};uxPendingOpenKey=key;uxFramework='';$('uxDesignFramework').value=uxFramework;
 showUxBuilder();renderUxActions();loadUxDrafts();
 $('uxDesignWorkspace').scrollIntoView({behavior:'smooth',block:'start'});picker.focus();
}
function renderUxVersionInfo(){
 const root=$('uxDesignVersionInfo');root.replaceChildren();if(!uxPipeline?.exists)return;
 const current=document.createElement('div');current.className='ux-revision-current';
 const revision=document.createElement('strong');revision.className='ux-revision-id';
 revision.textContent=uxSelectedKey+' · Version '+uxPipeline.revisionNumber;
 const state=document.createElement('span');state.className='ux-revision-state';
 state.dataset.status=String(uxPipeline.status||'');
 state.textContent=uxPipeline.status==='review'?'Awaiting approval':uxPipeline.status==='approved'?'Approved':'Disapproved';
 current.append(revision,state);root.append(current);
 const meta=document.createElement('p');meta.className='ux-revision-meta';
 const generated=new Date(uxPipeline.generatedAt);
 const generatedLabel=Number.isNaN(generated.valueOf())?'Date unavailable':generated.toLocaleString();
 meta.textContent='Generated '+generatedLabel+' · Designer: '+String(uxPipeline.designer||'Not recorded');
 meta.title=meta.textContent;root.append(meta);
 if(uxPipeline.history?.length){
  const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Previous versions ('+uxPipeline.history.length+')';details.append(summary);
  for(const item of [...uxPipeline.history].reverse()){
   const row=document.createElement('p');row.className='muted';row.textContent='v'+item.version+' · '+new Date(item.generatedAt).toLocaleString()+' · '+item.designer+' · '+item.status;details.append(row);
  }root.append(details);
 }
}
function renderUxFlow(flow){
 const root=$('uxFlowDiagram');root.replaceChildren();if(!flow?.nodes?.length)return;
 const ns='http://www.w3.org/2000/svg',nodes=flow.nodes,columns=nodes.length<4?2:3,width=860;
 const rows=Math.ceil(nodes.length/columns),height=rows*130+40;
 const make=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
 const toolbar=document.createElement('div');toolbar.className='ux-flow-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','User flow zoom and layout controls');
 const viewport=document.createElement('div');viewport.className='ux-flow-viewport';viewport.tabIndex=0;
 viewport.setAttribute('aria-label','Draggable user flow. Drag a node or use arrow keys to reposition it.');
 const svg=make('svg',{viewBox:'0 0 '+width+' '+height,role:'group','aria-label':'Moveable user flow nodes and directional connections'});
 const defs=make('defs'),marker=make('marker',{id:'ux-flow-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'});
 marker.append(make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#83b7ea'}));defs.append(marker);svg.append(defs);
 const positions=new Map(),groups=new Map(),edges=[];let scale=1;
 nodes.forEach((node,i)=>{const c=i%columns,r=Math.floor(i/columns);positions.set(node.id,{x:38+c*280,y:22+r*130});});
 const linkLayer=make('g',{'aria-hidden':'true'});svg.append(linkLayer);
 for(const edge of flow.edges||[]){if(!positions.has(edge.from)||!positions.has(edge.to))continue;
  const path=make('path',{fill:'none',stroke:'#83b7ea','stroke-width':1.7,'marker-end':'url(#ux-flow-arrow)'});linkLayer.append(path);edges.push({...edge,path});
 }
 const redraw=()=>{
  for(const [id,group] of groups){const pos=positions.get(id);group.setAttribute('transform','translate('+pos.x+' '+pos.y+')');}
  for(const edge of edges){const from=positions.get(edge.from),to=positions.get(edge.to);
   const x1=from.x+110,y1=from.y+35,x2=to.x+110,y2=to.y+35;
   edge.path.setAttribute('d','M '+x1+' '+y1+' Q '+((x1+x2)/2+25)+' '+((y1+y2)/2)+' '+x2+' '+y2);
  }
 };
 const setScale=value=>{scale=Math.max(.4,Math.min(2.5,value));svg.style.width=(width*scale)+'px';svg.style.height=(height*scale)+'px';svg.style.minWidth='0';zoomLabel.textContent=Math.round(scale*100)+'%';};
 let drag=null;
 for(const node of nodes){
  const color=node.kind==='decision'?'#664d18':node.kind==='end'?'#155740':'#263f59';
  const group=make('g',{'data-id':node.id,tabindex:0,role:'button','aria-label':'Move node: '+node.label});group.classList.add('ux-flow-node');
  group.append(make('rect',{x:0,y:0,width:220,height:70,rx:9,fill:color,stroke:'#83b7ea','stroke-width':1.2}));
  const text=make('text',{x:110,y:27,'text-anchor':'middle','font-size':12,fill:'#f1f5fa','pointer-events':'none'});
  const words=String(node.label).split(/\s+/),lines=[];let current='';
  for(const word of words){if((current+' '+word).length>28&&current){lines.push(current);current=word;}else current=(current?current+' ':'')+word;}
  if(current)lines.push(current);
  lines.slice(0,2).forEach((line,i)=>{const tspan=make('tspan',{x:110,dy:i?17:0});tspan.textContent=line.slice(0,32);text.append(tspan);});group.append(text);svg.append(group);groups.set(node.id,group);
  group.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();const pos=positions.get(node.id);drag={id:node.id,x:event.clientX,y:event.clientY,startX:pos.x,startY:pos.y};group.setPointerCapture(event.pointerId);group.classList.add('dragging');});
  group.addEventListener('pointermove',event=>{if(!drag||drag.id!==node.id)return;const pos=positions.get(node.id);pos.x=Math.max(0,Math.min(width-220,drag.startX+(event.clientX-drag.x)/scale));pos.y=Math.max(0,Math.min(height-70,drag.startY+(event.clientY-drag.y)/scale));redraw();});
  const stop=()=>{drag=null;group.classList.remove('dragging');};group.addEventListener('pointerup',stop);group.addEventListener('pointercancel',stop);
  group.addEventListener('keydown',event=>{const delta=event.shiftKey?25:10,dx=event.key==='ArrowLeft'?-delta:event.key==='ArrowRight'?delta:0,dy=event.key==='ArrowUp'?-delta:event.key==='ArrowDown'?delta:0;
   if(!dx&&!dy)return;event.preventDefault();const pos=positions.get(node.id);pos.x=Math.max(0,Math.min(width-220,pos.x+dx));pos.y=Math.max(0,Math.min(height-70,pos.y+dy));redraw();});
 }
 const zoomLabel=document.createElement('span');zoomLabel.className='ux-flow-zoom-label';
 const action=(name,description,callback)=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=name;button.setAttribute('aria-label',description);button.addEventListener('click',callback);toolbar.append(button);};
 action('−','Zoom out user flow',()=>setScale(scale-.2));action('+','Zoom in user flow',()=>setScale(scale+.2));
 action('Fit','Fit diagram to available width',()=>{setScale((viewport.clientWidth-20)/width);viewport.scrollTo({left:0,top:0});});
 toolbar.append(zoomLabel);viewport.append(svg);root.append(toolbar,viewport);redraw();setScale(1);
}
function renderUxVisuals(target,kind){
 const root=$(target);root.replaceChildren();const draft=uxDrafts[kind];if(!draft?.exists){root.textContent='Saved draft images unavailable. Reload the design workspace.';return;}
 for(const image of draft.previews||[]){
  const article=document.createElement('article');article.className='ux-visual-screen';const head=document.createElement('div');head.className='ux-visual-heading';
  const title=document.createElement('strong');title.textContent=image.name;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary';toggle.textContent='Expand Image';
  toggle.addEventListener('click',()=>{const value=article.classList.toggle('expanded');toggle.textContent=value?'Close Image':'Expand Image';});
  head.append(title,toggle);article.append(head);
  const img=document.createElement('img');img.alt=kind+' screen '+image.name;img.className='ux-visual-image';img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(image.svg);article.append(img);root.append(article);
 }
}
function renderUxHandoff(){
 const root=$('uxDeveloperHandoff');root.replaceChildren();if(!uxPipeline?.handoff)return;
 const handoff=uxPipeline.handoff;const intro=document.createElement('p');intro.textContent='Jira '+handoff.jiraKey+' · Version '+uxPipeline.revisionNumber+' · '+handoff.status;root.append(intro);
 const group=(name,items)=>{if(!Array.isArray(items)||!items.length)return;const heading=document.createElement('h4');heading.textContent=name;root.append(heading);const ul=document.createElement('ul');items.forEach(value=>{const li=document.createElement('li');li.textContent=value;ul.append(li);});root.append(ul);};
 group('Screens',handoff.screenNames);group('Interactions',handoff.interactions);group('Accessibility checklist',handoff.accessibility);group('Open questions',handoff.questions);
}
function openUxPipelinePreview(){
 if(!uxReadyForPreview())return;
 $('uxDesignBuilder').classList.remove('hidden');setView('uxPreview');
 $('uxPreviewHeading').textContent='Jira '+uxSelectedKey+' - UI/UX Design Preview';
 if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
 $('uxPreviewVersion').textContent=(uxPipeline.status==='approved'?'Approved':'Draft')+' v'+uxPipeline.revisionNumber;
 $('uxPreviewVersion').classList.toggle('ux-approved',uxPipeline.status==='approved');
 $('uxPreviewMetadata').textContent='Generated by '+uxPipeline.designer+' · On '+new Date(uxPipeline.generatedAt).toLocaleString()+' · AI '+(uxPipeline.aiModel||'Not recorded')+' · Jira '+uxSelectedKey;
 $('uxPreviewGuidance').textContent=uxPipeline.status==='approved'?'Approved design. The developer handoff is ready; use the prototype and artifacts below as the implementation reference.':'Review the flow, wireframes, mockups and interactive prototype before approving the developer handoff.';
 const flowCount=uxPipeline.flow?.nodes?.length||0;
 const screenCount=uxPipeline.prototype?.screens?.length||0;
 $('uxPreviewArtifacts').textContent=flowCount+' flow nodes · '+screenCount+' screens';
 $('uxFlowCount').textContent=flowCount+' nodes';
 $('uxWireframeCount').textContent=screenCount+' screens';
 $('uxMockupCount').textContent=screenCount+' screens';
 $('uxHandoffState').textContent=uxPipeline.status==='approved'?'Ready':'Pending approval';
 $('uxPreviewDeleteEntireDesign').disabled=uxPipelineBusy;
 $('uxPreviewReviewState').textContent='';$('uxPreviewReviewState').classList.add('hidden');
 setUxRejectFeedback(false);$('uxApproveDesign').classList.toggle('hidden',uxPipeline.status==='approved');$('uxRejectDesign').classList.toggle('hidden',uxPipeline.status==='approved');
 $('uxApproveDesign').disabled=false;$('uxRejectDesign').disabled=false;$('uxCancelDisapproval').disabled=false;
 $('uxPublishFrontend').classList.toggle('hidden',uxPipeline.status!=='approved');$('uxPublishFrontend').disabled=uxFrontendPublishing;
 renderUxFlow(uxPipeline.flow);renderUxVisuals('uxWireframePreviews','wireframe');renderUxVisuals('uxMockupPreviews','mockup');renderUxHandoff();
 $('uxPrototypeBrowserStatus').textContent='';$('uxOpenPrototypeBrowser').disabled=false;
 $('uxDesignPreviewPage').querySelectorAll('details.ux-preview-group').forEach(panel=>{panel.open=['flow','mockup'].includes(panel.dataset.uxArtifact);});
 $('contentPane').scrollTop=0;
}
$('uxSelectedTicket').addEventListener('change',()=>{
 uxPendingOpenKey='';uxSelectedKey=$('uxSelectedTicket').value;uxReferenceAvailable=false;uxPipeline=null;uxReferenceAvailable=false;uxDrafts={wireframe:null,mockup:null};uxFramework='';$('uxDesignFramework').value=uxFramework;showUxBuilder();renderUxActions();loadUxDrafts();
});
$('uxDesignFramework').addEventListener('change',()=>{
 if(uxPipelineBusy)return;
 if(uxPipeline?.exists&&uxPipeline.status!=='rejected'){
  // Read-only reviewed/approved designs cannot switch frameworks silently.
  $('uxDesignFramework').value=uxFramework;
  setUxStatus('This design is locked to '+(uxFrameworks.find(x=>x.id===uxFramework)?.label||uxFramework)+'. Disapprove it before changing the design system.');
  return;
 }
 uxFramework=$('uxDesignFramework').value;
 updateUxFrameworkDocs();
 if(uxSelectedKey)send('uxFrameworkSave',{key:uxSelectedKey,framework:uxFramework});
});
$('uxFrameworkSync').addEventListener('click',()=>{
 $('uxFrameworkSync').disabled=true;
 $('uxFrameworkSource').textContent='Refreshing design systems from GitHub main…';
 send('uxFrameworkSync',{key:uxSelectedKey||''});
});
$('uxFrameworkDocs').addEventListener('click',()=>{if(!$('uxDesignFramework').value)return;send('uxFrameworkOpenDocs',{framework:$('uxDesignFramework').value});});
$('uxFrameworkReactivate').addEventListener('click',()=>{send('uxFrameworkReactivate',{key:uxSelectedKey||''});});
$('uxGuideClose').addEventListener('click',()=>{$('uxDesignWorkspace').classList.remove('ux-guide-open');$('uxFrameworkRightPane').classList.add('hidden');$('uxFrameworkDocs').disabled=false;$('uxFrameworkDocs').focus();});
$('uxGuideSearch').addEventListener('input',()=>{uxGuideFilter=$('uxGuideSearch').value.toLowerCase().trim().slice(0,80);uxGuideDraw();});
$('uxGuideCategory').addEventListener('change',()=>{uxGuideSection=$('uxGuideCategory').value;uxGuideDraw();});
$('uxUploadReference').addEventListener('click',()=>{if(!uxSelectedKey||uxPipelineBusy)return;send('uxDesignReferenceUpload',{key:uxSelectedKey});});
function requestUxEntireDesignDeletion(){
 if(!uxSelectedKey||!uxPipeline?.exists||uxPipelineBusy)return;
 uxPipelineBusy=true;renderUxActions();$('uxDeleteDesignStatus').textContent='Confirm deletion in VS Code…';
 send('uxPipelineDelete',{key:uxSelectedKey,expectedRevision:uxPipeline.revision});
}
$('uxDeleteEntireDesign').addEventListener('click',requestUxEntireDesignDeletion);
$('uxPreviewDeleteEntireDesign').addEventListener('click',requestUxEntireDesignDeletion);
$('uxPublishFrontend').addEventListener('click',()=>{if(uxPipeline?.status!=='approved'||uxFrontendPublishing)return;uxFrontendPublishing=true;$('uxPublishFrontend').disabled=true;const message='Preparing to generate, validate and publish the Jira Story frontend code…';setUxStatus(message);$('uxPreviewReviewState').textContent=message;$('uxPreviewReviewState').classList.remove('hidden');send('uxPublishFrontend',{key:uxSelectedKey,expectedRevision:uxPipeline.revision});});
$('uxOpenPrototypeBrowser').addEventListener('click',()=>{if(!uxReadyForPreview()||uxPipelineBusy)return;$('uxOpenPrototypeBrowser').disabled=true;$('uxPrototypeBrowserStatus').textContent='Opening the local interactive prototype in your browser…';send('uxPrototypeOpenBrowser',{key:uxSelectedKey,expectedRevision:uxPipeline.revision});});
$('uxGenerateUIUX').addEventListener('click',()=>{
 if(!uxSelectedKey)return;
 if(uxPipelineBusy){
  if(uxPipelineStopping||!uxCanStop)return;
  uxPipelineStopping=true;renderUxActions();setUxStatus('Stopping UI/UX generation…');send('uxPipelineStop',{key:uxSelectedKey});return;
 }
 if(uxReadyForPreview()){openUxPipelinePreview();return;}
 uxPipelineBusy=true;uxPipelineStopping=false;uxCanStop=true;uxPipelineStage=1;renderUxActions();setUxStatus('Preparing full UI/UX design for '+uxSelectedKey+'…');
 send('uxPipelineGenerate',{key:uxSelectedKey,expectedRevision:uxPipeline?.revision||'',framework:uxFramework});
});
$('uxBackToBuilder').addEventListener('click',()=>{if(view==='uxPreview')navigate('sdlc-roles');showUxBuilder();});
$('uxApproveDesign').addEventListener('click',()=>{
 if(!uxReadyForPreview()||uxPipelineBusy)return;
 $('uxApproveDesign').disabled=true;$('uxRejectDesign').disabled=true;$('uxPreviewReviewState').textContent='Recording approval…';$('uxPreviewReviewState').classList.remove('hidden');
 send('uxPipelineDecide',{key:uxSelectedKey,decision:'approved',expectedRevision:uxPipeline.revision});
});
$('uxRejectDesign').addEventListener('click',()=>{
 if(!uxReadyForPreview()||uxPipelineBusy)return;
 if($('uxReviewActions').classList.contains('hidden')){
  setUxRejectFeedback(true);$('uxRejectReason').focus();return;
 }
 const reason=$('uxRejectReason').value.trim();if(!reason){$('uxRejectReason').focus();$('uxPreviewReviewState').textContent='Provide rejection feedback before disapproving this design.';$('uxPreviewReviewState').classList.remove('hidden');return;}
 $('uxApproveDesign').disabled=true;$('uxRejectDesign').disabled=true;$('uxCancelDisapproval').disabled=true;$('uxPreviewReviewState').textContent='Recording rejection…';$('uxPreviewReviewState').classList.remove('hidden');
 send('uxPipelineDecide',{key:uxSelectedKey,decision:'rejected',expectedRevision:uxPipeline.revision,reason});
});
$('uxCancelDisapproval').addEventListener('click',()=>{
 setUxRejectFeedback(false);$('uxCancelDisapproval').disabled=false;
 $('uxPreviewReviewState').textContent='';$('uxPreviewReviewState').classList.add('hidden');$('uxRejectDesign').focus();
});
window.addEventListener('message',event=>{
 const m=event.data||{};if(m.projectId!==activeId)return;
 if(m.type==='uxFrameworkLoaded'&&m.key===uxSelectedKey){renderUxFrameworkOptions(m.frameworks,m.value);renderUxFrameworkAvailability(m);$('uxFrameworkSync').disabled=false;$('uxFrameworkReactivate').disabled=false;renderUxActions();if(!uxFramework)setUxStatus(m.error||'No activated design framework. Pull and activate the SDLC Catalog in Settings.');}
 if(m.type==='uxFrameworkCatalogChanged'){renderUxFrameworkOptions(m.frameworks,uxFramework);renderUxFrameworkAvailability(m);$('uxFrameworkSync').disabled=false;renderUxActions();}
 if(m.type==='uxFrameworkCatalogRefreshError'){$('uxFrameworkSync').disabled=false;const info=$('uxFrameworkSource');info.textContent='Catalog update unavailable: '+String(m.message||'Check your GitHub connection.').slice(0,320)+' · Using local design systems.';}
 if(m.type==='uxFrameworkCatalogueLoaded'){renderUxFrameworkGuide(m);updateUxFrameworkDocs();}
 if(m.type==='uxDesignReferenceLoaded'&&m.key===uxSelectedKey){uxReferenceAvailable=!!m.value?.exists;renderUxReference(m.value);renderUxProgress();if(m.uploaded)setUxStatus('Design references saved for '+m.key+'.');if(m.deleted)setUxStatus('Design reference image deleted for '+m.key+'.');}
 if(m.type==='uxDesignReferenceCancelled'&&m.key===uxSelectedKey)loadUxDrafts();
 if(m.type==='uxDesignLoaded'&&m.value?.key===uxSelectedKey){uxDrafts[m.value.kind]=m.value;if(view==='uxPreview'){renderUxVisuals('uxWireframePreviews','wireframe');renderUxVisuals('uxMockupPreviews','mockup');}}
 if(m.type==='uxPipelineDeleted'&&m.key===uxSelectedKey){uxPipeline=m.value;uxDrafts={wireframe:null,mockup:null};uxPipelineBusy=false;uxPipelineStopping=false;uxPipelineStage=0;showUxBuilder();renderUxActions();renderUxVersionInfo();$('uxDeleteDesignStatus').textContent='Design deleted. Reference images retained. Select Generate UI/UX to regenerate.';setUxStatus('Design deleted from this ticket. Ready to regenerate.');return;}
 if(m.type==='uxPipelineDeleteCancelled'&&m.key===uxSelectedKey){uxPipelineBusy=false;renderUxActions();$('uxDeleteDesignStatus').textContent='Design deletion cancelled.';return;}
 if(m.type==='uxPipelineWorking'&&m.key===uxSelectedKey){uxPipelineBusy=true;uxPipelineStage=Math.max(1,Math.min(6,m.stage||1));uxCanStop=m.canStop!==false;if(!uxPipelineStopping)setUxStatus(m.message||'Generating UI/UX…');renderUxActions();}
 if(m.type==='uxPipelineStopping'&&m.key===uxSelectedKey){uxPipelineStopping=true;renderUxActions();}
 if(m.type==='uxPipelineStopped'&&m.key===uxSelectedKey){uxPipelineBusy=false;uxPipelineStopping=false;uxCanStop=true;uxPipelineStage=0;setUxStatus('UI/UX generation stopped. No new design was saved.');renderUxActions();}
 if(m.type==='uxPipelineLoaded'&&m.key===uxSelectedKey){
  uxPipeline=m.value;uxPipelineBusy=false;uxPipelineStopping=false;uxCanStop=true;uxPipelineStage=0;renderUxActions();renderUxVersionInfo();
  setUxStatus(m.generated?'UI/UX v'+uxPipeline.revisionNumber+' generated. Select Preview UI/UX to review and approve.':m.reviewed?'UI/UX review decision recorded.':uxPipeline?.status==='rejected'?'Design disapproved. Generate UI/UX to create a new version.':'');
  if(m.reviewed){if(uxPipeline.status==='rejected')showUxBuilder();else openUxPipelinePreview();}
  else if(uxPendingOpenKey===uxSelectedKey&&uxReadyForPreview()){uxPendingOpenKey='';openUxPipelinePreview();}
 }
 if(m.type==='uxFrontendPublishProgress'&&m.key===uxSelectedKey){const message=String(m.message||'Generating and publishing UI/UX code…');setUxStatus(message);$('uxPreviewReviewState').textContent=message;$('uxPreviewReviewState').classList.remove('hidden');}
 if(m.type==='uxFrontendPublishCancelled'&&m.key===uxSelectedKey){uxFrontendPublishing=false;$('uxPublishFrontend').disabled=false;setUxStatus('Frontend code publication cancelled. No changes were published.');$('uxPreviewReviewState').textContent='Publication cancelled.';$('uxPreviewReviewState').classList.remove('hidden');}
 if(m.type==='uxFrontendPublished'&&m.key===uxSelectedKey){uxFrontendPublishing=false;$('uxPublishFrontend').disabled=false;const message='Generated and published '+m.storyKey+' frontend on '+m.branch+' @ '+m.sha.slice(0,12)+'. Developer branch ready.';setUxStatus(message);$('uxPreviewReviewState').textContent=message;$('uxPreviewReviewState').classList.remove('hidden');}
 if(m.type==='uxPrototypeBrowserOpened'&&m.key===uxSelectedKey){$('uxOpenPrototypeBrowser').disabled=false;$('uxPrototypeBrowserStatus').textContent='Interactive prototype opened in your external browser.';}
 if(m.type==='uxDesignError'&&selectedRole==='ux-designer'){
  uxPipelineBusy=false;uxPipelineStopping=false;uxCanStop=true;uxPipelineStage=0;renderUxActions();
  $('uxApproveDesign').disabled=false;$('uxRejectDesign').disabled=false;$('uxCancelDisapproval').disabled=false;
  setUxStatus('UI/UX action failed: '+String(m.message||'Check the Jira and AI settings.'));
  $('uxPreviewReviewState').textContent='Review failed: '+String(m.message||'Try again.');$('uxPreviewReviewState').classList.remove('hidden');
  uxFrontendPublishing=false;$('uxOpenPrototypeBrowser').disabled=false;$('uxPublishFrontend').disabled=false;$('uxPrototypeBrowserStatus').textContent=String(m.message||'Could not open the prototype.');
 }
});

// BR-first autonomous Developer workflow. Jira issue linkage is derived from the selected BR.
let developerBrProjectId='',developerBrSelected='',developerBrBusy=false,developerBrStage='idle',developerBrDone=false,developerBrTab='logs',developerBrRecovery=null,developerBrPreviewOnly=false;
// A draft uses only its actual preview phases. TDD, unit-test and build circles must never be reported as passed.
const developerBrDraftPhases=['analyze','plan','local','verify'];
let developerBrDraftPhase='analyze',developerBrDraftReady=false;
function projectDraftPreviewEnabled(){return projects.some(project=>project.id===activeId&&project.settings?.development?.previewWithoutTests===true);}
let developerAssignedMine=[],developerBrArchitecture={tables:[],endpoints:[],files:[]},developerBrAssignmentBusy=false;
let developerBrStopping=false,developerBrCycleIndex=0,developerBrCycleTotal=0,developerBrJiraKey='',developerBrJiraCriterion='',developerBrEpicKey='';
let developerBrFiles=[],developerBrEvidence=[],developerBrActivity=[],developerBrBranch='',developerBrWorktree='',developerBrUrl='',developerBrSummary='',developerBrServerLogs='',developerBrCanRetry=false,developerBrServerRunning=false,developerBrServerBusy=false;
const developerBrStages=['analyze','plan','red','green','refactor','tests','build','local','verify'];
const developerBrNodes=['developerBrStepAnalyze','developerBrStepPlan','developerBrStepRed','developerBrStepGreen','developerBrStepRefactor','developerBrStepTest','developerBrStepBuild','developerBrStepLocal','developerBrStepVerify'];
const developerBrGroupTabs={development:['frontend','backend','database','integration'],testing:['testing','tests'],files:['code'],logs:['server'],history:['repair-history'],activity:['logs']};
const developerBrGroupDefault={development:'frontend',testing:'tests',files:'code',logs:'server',history:'repair-history',activity:'logs'};
const developerBrTabGroup=tab=>Object.keys(developerBrGroupTabs).find(group=>developerBrGroupTabs[group].includes(tab))||'files';
const developerBrGroupSelection={...developerBrGroupDefault};

const developerBrArtifactGroups=[
 ['frontend','Frontend',p=>/(^|\/)(src|client|web|pages|components|public)\/|\.(jsx?|tsx?|css|html)$/.test(p)&&!/(^|\/)(server|api|tests?)\//.test(p)],
 ['backend','API / Backend',p=>/(^|\/)(server|api|backend)\/|(^|\/)routes?\//.test(p)&&!/[._](test|spec)\./.test(p)],
 ['database','Database',p=>/(database|db|schema|migrat|sqlite|drizzle|prisma)/i.test(p)],
 ['integration','Integration',p=>/(integrat|e2e|playwright|contract)/i.test(p)],
 ['testing','Unit Test',p=>/(^|\/)(__tests__|tests?|specs?)\/|[._](test|spec)\.|_test\.|Test\.(java|cs)$/.test(p)]
];
function renderDeveloperBrCategory(){
 const panel=$('developerBrCategoryPanel');panel.replaceChildren();
 const group=developerBrArtifactGroups.find(row=>row[0]===developerBrTab);if(!group)return;
 const [,title,match]=group,arch=developerBrArchitecture||{};
 // A table or route can live in server/index.mjs, even if its filename contains
 // neither 'database' nor 'schema' and was not part of the latest generated write.
 const discovered=developerBrTab==='database'?(arch.tables||[]).map(x=>x.file):developerBrTab==='backend'?(arch.endpoints||[]).map(x=>x.file):[];
 const files=[...new Set([...developerBrFiles.map(x=>String(x||'')).filter(match),...discovered.filter(Boolean)])];
 const heading=textElement('div','', 'developer-br-category-heading');
 heading.append(textElement('strong',title),textElement('span',files.length+` matching generated file${files.length===1?'':'s'}`,'muted'));
 panel.append(heading);
 if(files.length){const list=document.createElement('ul');list.className='developer-br-category-files';for(const file of files)list.append(textElement('li',file));panel.append(list);}
 else panel.append(textElement('p',developerBrFiles.length?'No files matched this area. Check Generated Files for paths that were not automatically classified.':'Generate the application to populate this area.','muted'));
 if(developerBrTab==='testing'){
  const checks=textElement('div','', 'developer-br-category-checks');checks.append(textElement('strong','Executed checks'));
  if(!developerBrEvidence.length)checks.append(textElement('p','No executed test or build evidence yet.','muted'));
  for(const evidence of developerBrEvidence){const expected=evidence.redVerified&&!evidence.passed;const item=textElement('div',`${expected?'EXPECTED RED':evidence.passed?'PASS':'FAIL'} · ${evidence.phase||'FINAL'} · ${evidence.operation||'check'} · ${evidence.target||'application'}`,expected?'developer-br-check-red':evidence.passed?'developer-br-check-pass':'developer-br-check-fail');checks.append(item);}
  panel.append(checks);
 }
 // Show relevant architecture evidence only in its own development subtab.
 // The original implementation appended both Database and API cards to every tab.
 if(developerBrTab==='database'||developerBrTab==='backend'){
  const arch=developerBrArchitecture||{};
  const section=textElement('section','', 'developer-br-architecture');
  const article=textElement('article','','developer-br-architecture-group');
  if(developerBrTab==='database'){
   article.append(textElement('h4','Database schema'));
   if(!arch.tables?.length)article.append(textElement('p','No table definitions detected in the generated source.','muted'));
   for(const table of (arch.tables||[])){article.append(textElement('strong',table.name));article.append(textElement('small',table.file,'muted'));article.append(textElement('pre',(table.columns||[]).join('\n')));}
  }else{
   article.append(textElement('h4','API endpoints'));
   if(!arch.endpoints?.length)article.append(textElement('p','No explicit API route declarations detected in the generated source.','muted'));
   for(const route of (arch.endpoints||[])){const line=textElement('div',`${route.method} ${route.path}`,'developer-br-endpoint');line.title=route.file;article.append(line);}
  }
  section.append(article);panel.append(section);
 }
}
function renderDeveloperBrOutput(){
 let text='';
 if(developerBrTab==='code')text=[developerBrBranch?'Branch: '+developerBrBranch:'',developerBrWorktree?'Worktree: '+developerBrWorktree:'',developerBrSummary,developerBrFiles.length?'Generated/updated files ('+developerBrFiles.length+'):':'No files have been generated.',...developerBrFiles.map(x=>'  '+x)].filter(Boolean).join('\n');
 else if(developerBrTab==='tests')text=developerBrEvidence.length?developerBrEvidence.map(row=>`${row.redVerified&&!row.passed?'EXPECTED RED':row.passed?'PASS':'FAIL'} · ${row.phase||'FINAL'} · ${row.operation||'check'} · ${row.target||'application'} · ${row.at||''}\n${row.logs||''}`).join('\n\n---\n\n'):'Tests and build have not run.';
 else if(developerBrTab==='server')text=developerBrServerLogs||'No server output. Use Start Server after generating and testing the application.';
 else if(developerBrTab==='logs')text=developerBrActivity.length?developerBrActivity.slice().reverse().join('\n'):'No activity recorded.';
 else text=developerBrActivity.length?developerBrActivity.join('\n'):'No activity recorded.';
 $('developerBrDownloadDiagnostics').disabled=!developerBrSelected;
 const output=$('developerBrOutput');output.textContent=text;
 // Activity is newest-first, including live updates. Do not reposition other tabs.
 if(developerBrTab==='logs')output.scrollTop=0;
 const artifactsOpen=developerBrTab==='artifacts';
 const categoryOpen=developerBrArtifactGroups.some(row=>row[0]===developerBrTab);
 const recoveryOpen=developerBrTab==='repair-history';
 $('developerBrOutput').classList.toggle('hidden',artifactsOpen||categoryOpen||recoveryOpen);
 $('developerBrRecoveryHistory').classList.toggle('hidden',!recoveryOpen);
 $('developerBrCategoryPanel').classList.toggle('hidden',!categoryOpen);
 $('developerBrArtifactsPanel').classList.toggle('hidden',!artifactsOpen);
 if(artifactsOpen)renderDeveloperBrArtifacts();
 if(categoryOpen)renderDeveloperBrCategory();
 const group=developerBrTabGroup(developerBrTab);developerBrGroupSelection[group]=developerBrTab;
 for(const btn of document.querySelectorAll('[data-developer-br-group]')){const active=btn.dataset.developerBrGroup===group;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));}
 for(const btn of document.querySelectorAll('[data-developer-br-tab]')){const active=btn.dataset.developerBrTab===developerBrTab;btn.classList.toggle('selected',active);btn.classList.toggle('hidden',!developerBrGroupTabs[group].includes(btn.dataset.developerBrTab));btn.setAttribute('aria-pressed',String(active));}
 $('developerBrSubtabs').classList.toggle('hidden',group==='history'||group==='logs');
 $('developerBrOpenWorktree').classList.toggle('hidden',group!=='files');
}
function renderDeveloperBrArtifacts(){
 const groups=developerBrArtifactGroups;
 const wrap=$('developerBrAutoArtifacts');wrap.replaceChildren();
 const files=developerBrFiles.map(v=>String(v||''));
 for(const [type,title,match] of groups){
  const matches=files.filter(match);const node=document.createElement('article');node.className='developer-br-auto-artifact';node.setAttribute('role','listitem');
  node.append(textElement('strong',title),textElement('span',matches.length?`${matches.length} generated file${matches.length===1?'':'s'}`:'No generated files in this category','muted'));
  if(matches.length){
   const contents=textElement('code',matches.slice(0,4).join('\n'));node.append(contents);
   if(matches.length>4)node.append(textElement('small',`+${matches.length-4} more files`,'muted'));
  }
  wrap.append(node);
 }
 $('developerBrArtifactsSummary').textContent=developerBrSelected?(developerBrFiles.length?`${developerBrFiles.length} files generated for ${developerBrSelected} · ${developerBrEvidence.filter(x=>x.passed).length} successful check records. Review Code opens the isolated worktree.`:`No generated files for ${developerBrSelected} yet. Use Start Development to create implementation evidence.`):'Select an approved BR to see generated implementation evidence.';
 const hasJira=!!(developerSelectedTicket&&developerTaskInfo?.key===developerSelectedTicket);
 $('developerArtifactsSection').classList.toggle('hidden',!hasJira);
 $('developerBrArtifactJiraNote').textContent=hasJira?`Jira ${developerSelectedTicket} · saved artifact drafts are separate from generated files. Expand below to review or save them.`:'Saved Jira artifact drafts require an assigned Jira issue linked to this BR.';
 // Saved Jira artifact drafts remain collapsed until explicitly opened.
}
function syncBrDeliveryGate(){
 const linked=!!(developerSelectedTicket&&developerTaskInfo?.key===developerSelectedTicket);
 const ready=linked&&developerBrDone&&!developerBrPreviewOnly&&!developerBrBusy;
 if(!developerDeliveryBusy){
  $('developerDeliveryRunChecks').disabled=!ready;
  $('developerDeliveryVerify').disabled=!developerBrDone||developerBrPreviewOnly||developerBrBusy||!matchingDeveloperBrTickets().length;
 }
 $('developerDeliveryComplete').disabled=!ready||!developerDeliveryProof?.ready||developerArtifactDirty||developerDeliveryBusy;
}
function matchingDeveloperBrTickets(){
 if(!developerBrSelected)return [];
 const br=developerBrSelected.toUpperCase();
 return developerAssignedMine.filter(item=>item.brRoot&&item.brId===br);
}
function syncDeveloperBrJira(){
 const linked=matchingDeveloperBrTickets();const select=$('developerBrJiraSelect');
 const keep=linked.some(item=>item.key===developerSelectedTicket)?developerSelectedTicket:'';
 const selected=keep||(linked.length===1?linked[0].key:'');
 select.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=!developerBrSelected?'Select an approved BR first':!linked.length?'No assigned Jira issues linked to this BR':linked.length>1?'Choose a linked Jira issue':'Loading linked Jira issue';select.append(placeholder);
 for(const item of linked){const option=document.createElement('option');option.value=item.key;option.textContent=item.key+' · '+String(item.summary||'Jira task').slice(0,125);select.append(option);}
 select.value=selected;select.disabled=!linked.length||developerBrBusy;
 $('developerBrJiraStatus').textContent=!developerBrSelected?'Select an approved BR to link delivery evidence.':!linked.length?'No assigned Jira task matching this BR was found. Assign the issue to yourself in Jira, then refresh the Jira task list.':linked.length>1&&!selected?'Multiple linked issues found. Select the Jira issue whose delivery you want to complete.':`Linked to ${selected}. Jira completion still requires approved acceptance evidence and a reviewed feature branch.`;
 if(!developerBrSelected||!linked.length||!selected)$('developerDeliveryStatus').textContent=!developerBrSelected?'Select an approved BR to begin.':!linked.length?'No assigned Jira issue matches this BR. Assign the corresponding Jira issue to yourself before completing delivery.':'Select the Jira issue in the Verify Delivery review.';
 if(selected&&selected!==developerSelectedTicket)selectDeveloperTicket(selected);
 if(!selected&&developerSelectedTicket){developerSelectedTicket='';developerTaskInfo=null;developerArtifactInfo=null;developerArtifactDirty=false;resetDeveloperDelivery();$('developerArtifactViewer').classList.add('hidden');}
 syncBrDeliveryGate();
 if(developerBrTab==='artifacts')renderDeveloperBrArtifacts();
}
$('developerBrJiraSelect').addEventListener('change',()=>{
 const picked=$('developerBrJiraSelect').value;
 if(!matchingDeveloperBrTickets().some(item=>item.key===picked))return;
 if(developerArtifactDirty){$('developerBrJiraSelect').value=developerSelectedTicket;return;}
 if(picked!==developerSelectedTicket)selectDeveloperTicket(picked);
});
function setCurrentDeveloperJira({jiraKey='',criterionId='',epicJiraKey=''}={}){
 const valid=key=>/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(String(key||''))?String(key):'';
 developerBrJiraKey=valid(jiraKey);
 developerBrJiraCriterion=/^AC-\d{2}$/.test(String(criterionId||''))?criterionId:'';
 developerBrEpicKey=valid(epicJiraKey)||developerBrEpicKey;
 const label=$('developerBrCurrentJira');
 if(!label)return;
 label.disabled=!developerBrJiraKey;
 if(developerBrJiraKey){label.textContent='Jira '+developerBrJiraKey;label.title='Current '+(developerBrJiraCriterion||'development criterion')+' · verified published Jira issue '+developerBrJiraKey;}
 else if(developerBrJiraCriterion){label.textContent=developerBrJiraCriterion+' · Jira unmapped';label.title='No verified Jira issue is mapped to this criterion.'+(developerBrEpicKey?' BR Epic: '+developerBrEpicKey:'');}
 else if(developerBrEpicKey){label.textContent='Epic '+developerBrEpicKey;label.title='Parent BR Epic. Current acceptance criterion not yet mapped to a specific Jira item.';}
 else{label.textContent='Jira —';label.title='Select a published BR to see its Jira issue.';}
}
$('developerBrCurrentJira').addEventListener('click',()=>{if(developerBrJiraKey)openJiraIssueModal(developerBrJiraKey);});
function resetDeveloperBr(stage='idle'){
 developerBrJiraKey='';developerBrJiraCriterion='';developerBrEpicKey='';setCurrentDeveloperJira();
 developerBrRecovery=null;developerBrPreviewOnly=false;$('developerBrRecoveryHistory').textContent='No repair attempts recorded.';developerBrDraftPhase='analyze';developerBrDraftReady=false;
 updateDeveloperIssueStats(null);
 developerBrStopping=false;developerBrCycleIndex=0;developerBrCycleTotal=0;developerBrBusy=false;developerBrDone=false;developerBrStage=stage;developerBrFiles=[];developerBrEvidence=[];developerBrActivity=[];developerBrBranch='';developerBrWorktree='';developerBrUrl='';developerBrSummary='';developerBrServerLogs='';developerBrCanRetry=false;developerBrServerRunning=false;developerBrServerBusy=false;developerBrArchitecture={tables:[],endpoints:[],files:[]};developerBrTab='logs';
 $('developerBrStatus').textContent='Choose an approved Business Requirement to generate code in an isolated worktree.';
 renderDeveloperBrStages();renderDeveloperBrOutput();
}
function renderDeveloperBrStages(){
 const current=developerBrStages.indexOf(developerBrStage);
 let completed=0;
 developerBrNodes.forEach((id,i)=>{
  const el=$(id);if(!el)return;
  let state;
  if(developerBrPreviewOnly){
   const phase=developerBrStages[i];
   const draftStep=developerBrDraftPhases.indexOf(phase);
   const activeStep=Math.max(0,developerBrDraftPhases.indexOf(developerBrDraftPhase));
   const blocked=['failed','stopped','needs-attention','server-stopped','idle'].includes(developerBrStage);
   // Non-preview TDD phases stay skipped: never present RED, GREEN, refactor, tests or build as completed.
   state=draftStep<0?'preview-skipped':developerBrDraftReady||draftStep<activeStep?'preview-complete':draftStep===activeStep?(blocked?(['failed','stopped','needs-attention'].includes(developerBrStage)?'failed':'pending'):'preview-current'):'pending';
  }else{
   state=developerBrDone?'complete':developerBrStage==='server-stopped'?(i<7?'complete':'pending'):['failed','stopped','needs-attention'].includes(developerBrStage)?(i<developerBrStages.indexOf(windowDeveloperBrFailedAt())?'complete':i===developerBrStages.indexOf(windowDeveloperBrFailedAt())?'failed':'pending'):
    current<0?'pending':i<current?'complete':i===current?'current':'pending';
  }
  if(state==='complete'||state==='preview-complete')completed++;
  el.className='developer-workflow-step developer-br-stage '+state;
  if(state==='current'||state==='preview-current')el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
  const small=el.querySelector('small');if(small)small.textContent=state==='complete'?'Completed':state==='preview-complete'?'Draft step done':state==='preview-current'?'Draft in progress…':state==='preview-skipped'?'Skipped (draft)':state==='current'?'In progress…':state==='failed'?'Needs attention':'Pending';
 });
 const hasSelectedBr=!!developerBrSelected;
 // Only hide the BR-specific tabbed workspace and delivery controls. Keep the progress steps visible.
 $('developerBrDetails').classList.remove('hidden');
 $('developerBrWorkArea').classList.toggle('hidden',!hasSelectedBr);
 // Keep the BR selector, nine-stage progress, count and disabled Start button visible
 // before selection. Only the tabbed work area and delivery actions are gated.
 $('developerBrProgressCount').classList.remove('hidden');
 $('developerBrStart').parentElement?.classList.remove('hidden');
 const counter=$('developerBrProgressCount');counter.textContent=developerBrPreviewOnly?`Draft preview · ${completed} of 4 phases · tests/build skipped`:completed+' of 9 steps'+(typeof developerBrCycleTotal!=='undefined'&&developerBrCycleTotal?` · AC ${developerBrCycleIndex}/${developerBrCycleTotal}`:'');
 renderDeveloperCriterionProgress();
 const indicator=$('developerBrServerIndicator');indicator.classList.toggle('running',developerBrServerRunning);indicator.classList.toggle('busy',developerBrBusy||developerBrServerBusy);
 const start=$('developerBrStart');
 const processing=developerBrBusy&&!developerBrDone;
 start.textContent=developerBrStopping?'Stopping Development…':processing?'■ Stop Development':developerBrStage==='needs-attention'?'↻ Retry Development':developerBrCanRetry||developerBrDone?'↻ Restart Development':'▶ Start Development';
 start.disabled=!developerBrSelected||developerBrStopping||developerBrAssignmentBusy;
 const preview=$('developerBrPreviewDraft');preview.classList.toggle('hidden',!projectDraftPreviewEnabled());preview.disabled=!projectDraftPreviewEnabled()||!developerBrSelected||developerBrBusy||developerBrServerRunning||developerBrServerBusy||developerBrAssignmentBusy;preview.title='Preview Draft — create and open an untested local application. Tests and builds are skipped; approval and delivery remain locked.';
 start.classList.toggle('is-stopping',developerBrStopping);
 start.classList.toggle('is-running',processing&&!developerBrStopping);
 start.title=processing?'Stop the current AI development process':(typeof developerBrRecovery!=='undefined'&&developerBrRecovery?.available)?'Resume from the failed criterion using persisted repair history and the currently selected AI model':developerBrCanRetry||developerBrDone?'Regenerate from the approved BR using a fresh RED → GREEN → REFACTOR cycle':'Start automatic TDD development immediately';
 const inDevelopment=developerBrBusy||developerBrServerRunning||developerBrServerBusy;
 const stop=$('developerBrStop');stop.disabled=!inDevelopment;stop.classList.toggle('hidden',true);
 $('developerBrOpenWorktree').disabled=developerBrBusy||!developerBrWorktree;
 $('developerBrOpenPreview').disabled=!developerBrServerRunning||!developerBrUrl;
 $('developerBrOpenPreview').classList.toggle('hidden',!developerBrServerRunning||!developerBrUrl);
 $('developerBrRetryLocal').disabled=developerBrBusy||!developerBrCanRetry||!developerBrWorktree;
 const toggle=$('developerBrServerToggle');
 toggle.textContent=developerBrServerRunning?'■ Stop Server':developerBrServerBusy||developerBrBusy&&developerBrStage==='local'?'Starting Server…':'▶ Start Server';
 toggle.classList.toggle('is-running',developerBrServerRunning);
 toggle.disabled=developerBrBusy||developerBrServerBusy||!developerBrSelected||(!developerBrServerRunning&&(!(developerBrCanRetry||developerBrPreviewOnly&&projectDraftPreviewEnabled())||!developerBrWorktree));
 toggle.title=developerBrServerRunning?'Stop this local application':developerBrPreviewOnly?'Restart the untested draft preview; production test gates remain unchanged':developerBrCanRetry?'Run the tested generated application and open it in the external browser':'Plan, develop, test and build the BR application first';
 // The entire BR-only panel is hidden above; server controls remain part of its tabs.
 $('developerBrSelect').disabled=developerBrBusy||developerBrServerBusy||developerBrAssignmentBusy;
 // Assignment actions are rendered in Jira issue rows.
 $('developerBrJiraSelect').disabled=developerBrBusy||!matchingDeveloperBrTickets().length;
 syncBrDeliveryGate();
}
let developerBrFailedAt='analyze';
function windowDeveloperBrFailedAt(){return developerBrFailedAt;}
function developerBrStatusOf(br){
 if(['retired','cancelled','canceled','rejected'].includes(String(br.status||'').toLowerCase()))return 'cancelled';
 // Jira is authoritative: only a role-eligible issue actually assigned to the
 // current developer (not a UI/UX issue assigned to the same Jira account)
 // can turn this Business Requirement into In Progress.
 if(selectedRole==='software-developer'&&roleJiraLoaded&&roleJiraProject===activeId&&
    developerAssignedMine.some(item=>item.mine&&item.brRoot&&item.brId===String(br.id||'').toUpperCase()))return 'in-progress';
 return Number(br.approvedRevision||1)>1?'updated':'new';
}
function selectedBrLinkedJira(){
 if(!developerBrSelected)return [];
 const regex=new RegExp('(?:^|[^A-Z0-9])'+developerBrSelected+'(?![0-9])','i');
 return roleJiraItems.filter(item=>regex.test(String(item.summary||'')));
}
function renderDeveloperBrAssignment(){
 // Assignment controls belong exclusively to the matching Jira issue row.
}
function updateDeveloperBrChangeBadge(br){
 const badge=$('developerBrChangeBadge');if(!badge)return;
 const status=br?developerBrStatusOf(br):'';
 const label={new:'New',updated:'Updated',cancelled:'Cancelled','in-progress':'In Progress'}[status]||'';
 badge.textContent=label;
 badge.className='developer-br-change-badge'+(status?' status-'+status:' hidden');
 badge.setAttribute('aria-label',label?'Business Requirement status: '+label:'');
}
function renderDeveloperBrChoices(){
 const select=$('developerBrSelect');if(!select)return;
 if(developerBrProjectId!==activeId){developerBrProjectId=activeId;developerBrSelected='';resetDeveloperBr();}
 const all=(brState?.brs||[]);
 const eligible=all.filter(br=>br.status==='approved'&&!br.needsRefresh&&br.approvedContent&&br.approvedRevision);
 const cancelled=all.filter(br=>['retired','cancelled','canceled'].includes(String(br.status||'').toLowerCase()));
 const previous=developerBrSelected;
 select.replaceChildren();
 const prompt=document.createElement('option');prompt.value='';prompt.textContent=eligible.length?'Select approved Business Requirement':'No approved Business Requirements';select.append(prompt);
 for(const br of [...eligible,...cancelled]){
  const status=developerBrStatusOf(br),option=document.createElement('option');option.value=br.id;
  option.textContent=br.id+' · '+String(br.approvedContent?.title||br.title||'Untitled requirement').slice(0,130)+' · '+(br.approvedRevision?'Approved R'+br.approvedRevision:'');
  option.disabled=status==='cancelled';select.append(option);
 }
 developerBrSelected=eligible.some(br=>br.id===previous)?previous:'';
 select.value=developerBrSelected;
 const chosen=eligible.find(x=>x.id===developerBrSelected);
 if(!chosen)setCurrentDeveloperJira();
 else if(!developerBrJiraCriterion&&!developerBrJiraKey)setCurrentDeveloperJira({epicJiraKey:brState?.synced?.[chosen.id]?.key||''});
 updateDeveloperBrChangeBadge(chosen);
 select.title=chosen?'Approved '+chosen.id+' · '+$('developerBrChangeBadge').textContent:'Select approved Business Requirement';
 $('developerBrRevision').textContent=chosen?'Approved R'+chosen.approvedRevision+' · development uses this exact revision':'Only approved and unchanged revisions can start development.';
 syncDeveloperBrJira();renderDeveloperBrAssignment();renderDeveloperBrStages();
}
$('developerBrSelect').addEventListener('change',()=>{
 if(developerBrBusy)return;
 developerBrSelected=$('developerBrSelect').value;
 resetDeveloperBr();developerBrTab='logs';renderDeveloperBrChoices();if(developerBrSelected){send('developerBrLogs',{brId:developerBrSelected});send('developerBrRecoveryInfo',{brId:developerBrSelected});}
 if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
});
function stopDeveloperBr(){
 if(developerBrStopping||!developerBrSelected||!(developerBrBusy||developerBrServerRunning||developerBrServerBusy))return;
 developerBrStopping=true;
 $('developerBrStatus').textContent='Stopping development and the generated application server…';
 renderDeveloperBrStages();send('developerBrStop',{brId:developerBrSelected});
}
$('developerBrPreviewDraft').addEventListener('click',()=>{
 if(!projectDraftPreviewEnabled()||!developerBrSelected||developerBrBusy||developerBrServerRunning||developerBrServerBusy)return;
 resetDeveloperBr('analyze');developerBrPreviewOnly=true;developerBrBusy=true;developerBrStage='analyze';developerBrDraftPhase='analyze';developerBrDraftReady=false;
 $('developerBrStatus').textContent='UNTESTED LOCAL PREVIEW — generating a draft without TDD or production build. Not eligible for approval.';renderDeveloperBrStages();
 send('developerBrPreviewDraft',{brId:developerBrSelected});
});
$('developerBrStart').addEventListener('click',()=>{
 if(!developerBrSelected||developerBrStopping)return;
 if(developerBrBusy){stopDeveloperBr();return;}
 if(developerBrServerBusy)return;
 resetDeveloperBr('analyze');developerBrBusy=true;developerBrStage='analyze';
 $('developerBrStatus').textContent='Checking approved BR and the project stack…';
 developerBrPreviewOnly=false;renderDeveloperBrStages();send('developerBrRun',{brId:developerBrSelected});
});
$('developerBrStop').addEventListener('click',stopDeveloperBr);
$('developerBrServerToggle').addEventListener('click',()=>{
 if(developerBrBusy||developerBrServerBusy||!developerBrSelected)return;
 if(developerBrServerRunning){developerBrServerBusy=true;$('developerBrStatus').textContent='Stopping the generated application server…';renderDeveloperBrStages();send('developerBrStop',{brId:developerBrSelected});return;}
 if(!developerBrCanRetry&&!developerBrPreviewOnly||!developerBrWorktree)return;
 developerBrServerBusy=true;developerBrBusy=true;developerBrDone=false;developerBrStage='local';developerBrServerRunning=false;
 $('developerBrStatus').textContent='Starting the tested application and verifying local HTTP health…';renderDeveloperBrStages();
 send('developerBrStartServer',{brId:developerBrSelected});
});
$('developerBrOpenWorktree').addEventListener('click',()=>send('developerBrOpenWorktree'));
$('developerBrOpenPreview').addEventListener('click',()=>send('developerBrOpenPreview'));
$('developerBrRetryLocal').addEventListener('click',()=>{if(developerBrBusy||!developerBrCanRetry)return;developerBrBusy=true;developerBrDone=false;developerBrUrl='';developerBrStage='local';$('developerBrStatus').textContent='Restarting server from the previously tested generated BR worktree…';renderDeveloperBrStages();send('developerBrRetryLocal',{brId:developerBrSelected});});
for(const button of document.querySelectorAll('[data-developer-br-tab]'))button.addEventListener('click',()=>{developerBrTab=button.dataset.developerBrTab;if(developerBrTab==='server')send('developerBrLogs',{brId:developerBrSelected});renderDeveloperBrOutput();});
for(const button of document.querySelectorAll('[data-developer-br-group]'))button.addEventListener('click',()=>{const group=button.dataset.developerBrGroup;developerBrTab=developerBrGroupSelection[group]||developerBrGroupDefault[group];if(developerBrTab==='server')send('developerBrLogs',{brId:developerBrSelected});renderDeveloperBrOutput();});
$('developerBrDownloadDiagnostics').addEventListener('click',()=>{if(developerBrSelected)send('developerBrDownloadDiagnostics',{brId:developerBrSelected,activity:developerBrActivity.slice(-200)});});
function renderDeveloperCriterionProgress(){
 const criterion=/^AC-\d+$/i.test(developerBrJiraCriterion)?developerBrJiraCriterion.toUpperCase():developerBrCycleIndex>0?'AC-'+String(developerBrCycleIndex).padStart(2,'0'):'AC —';
 const index=developerBrCycleIndex>0?developerBrCycleIndex:(/^AC-(\d+)$/.test(criterion)?Number(criterion.slice(3)):0);
 $('developerBrCriterionProgress').textContent=developerBrCycleTotal>0&&index>0?criterion+' ('+index+'/'+developerBrCycleTotal+')':criterion;
}
function updateDeveloperIssueStats(stats){
 // Keep the issue ledger for diagnostics while showing the active AC instead of issue totals.
 const found=Math.max(0,Number(stats?.found)||0);
 const resolved=Math.min(found,Math.max(0,Number(stats?.resolved)||0));
 $('developerBrIssueStats').title='Current acceptance criterion. Diagnostic issues: '+found+' found, '+resolved+' resolved, '+(found-resolved)+' open.';
 renderDeveloperCriterionProgress();
}
function onDeveloperBrMessage(msg){
 if(msg.projectId!==activeId||msg.brId&&msg.brId!==developerBrSelected)return false;
 if(!['developerBrIssueStats','developerBrRecoveryInfo','developerBrProgress','developerBrFailed','developerBrCancelled','developerBrStopped','developerBrLogState','developerBrBrowserOpened','developerBrActionError','developerBrAssignmentResult','developerBrDiagnosticSaved'].includes(msg.type))return false;
 if(msg.type==='developerBrDiagnosticSaved'){
  $('developerBrStatus').textContent=msg.message||'Troubleshooting log saved.';return true;
 }
 if(msg.type==='developerBrIssueStats'){
  updateDeveloperIssueStats(msg.value);
  return true;
 }
 if(msg.type==='developerBrRecoveryInfo'){
  developerBrRecovery=msg.value||null;
  updateDeveloperIssueStats(developerBrRecovery?.issueStats);
  if(!developerBrBusy&&developerBrRecovery?.criterion)setCurrentDeveloperJira({jiraKey:developerBrRecovery.jiraKey||'',criterionId:developerBrRecovery.criterion,epicJiraKey:developerBrRecovery.epicJiraKey||''});
  const show=!!developerBrRecovery&&(developerBrRecovery.available||developerBrRecovery.events?.length||developerBrRecovery.requiresNewRevision);
  const info=developerBrRecovery;
  $('developerBrRecoveryHistory').textContent=show?((info.events||[]).map(row=>`${row.at||''} · ${row.criterion||''} · ${row.phase||''} · ${row.outcome||''} · attempt ${row.attempt||0} · ${row.model||'auto'}
${row.message||''}`).join('\n\n')||info.lastError||'No repair attempts recorded.'):'No repair attempts recorded.';
  if(show&&info.available&&!developerBrPreviewOnly&&!developerBrBusy&&!developerBrDone){developerBrStage='needs-attention';developerBrFailedAt='green';$('developerBrStatus').textContent='Recovery ready: '+info.criterion+'. '+(info.lastError?'Last failure: '+String(info.lastError).slice(0,220):'Verified source and repair history preserved.');}
  renderDeveloperBrStages();return true;
 }
 if(msg.type==='developerBrAssignmentResult'){
  developerBrAssignmentBusy=false;
  if(msg.action==='unassign'&&msg.success&&msg.brId===developerBrSelected){resetDeveloperBr();}
  $('roleJiraStatus').textContent=msg.message||'Assignment updated.';
  roleJiraLoaded=false;loadRoleJiraIssues(true);loadAssignedJiraTasks(true);
  renderDeveloperBrStages();return true;
 }
 if(msg.type==='developerBrProgress'){
  if(Object.prototype.hasOwnProperty.call(msg,'jiraKey'))setCurrentDeveloperJira({jiraKey:msg.jiraKey,criterionId:msg.criterionId||'',epicJiraKey:msg.epicJiraKey||''});
  else if(msg.epicJiraKey&&!developerBrJiraCriterion)setCurrentDeveloperJira({epicJiraKey:msg.epicJiraKey});
  if(Number.isInteger(msg.cycleTotal)&&msg.cycleTotal>0){developerBrCycleIndex=Number(msg.cycleIndex)||0;developerBrCycleTotal=msg.cycleTotal;}
  if(msg.previewOnly===true)developerBrPreviewOnly=true;
 if(developerBrPreviewOnly){
   // Backend preview events track real work without pretending TDD gates ran.
   const phase=msg.stage==='code'?'plan':msg.stage==='complete'?'verify':msg.stage;
   if(developerBrDraftPhases.includes(phase))developerBrDraftPhase=phase;
   developerBrDraftReady=msg.stage==='complete';
   developerBrStage=phase;
  }else developerBrStage=msg.stage==='test'?'tests':['code','repair'].includes(msg.stage)?'green':msg.stage==='complete'?'verify':msg.stage;
  developerBrDone=msg.stage==='complete'&&!developerBrPreviewOnly;
  if(msg.stage==='complete'){developerBrStopping=false;developerBrServerRunning=true;developerBrServerBusy=false;}
  if(msg.branch)developerBrBranch=msg.branch;
  if(msg.worktree)developerBrWorktree=msg.worktree;
  if(Array.isArray(msg.files))developerBrFiles=msg.files;
  if(Array.isArray(msg.evidence))developerBrEvidence=msg.evidence;
  if(msg.architecture)developerBrArchitecture=msg.architecture;
  if(msg.summary)developerBrSummary=msg.summary;
  if(msg.previewUrl)developerBrUrl=msg.previewUrl;
  if(typeof msg.serverLogs==='string')developerBrServerLogs=msg.serverLogs;
  if(msg.issueStats)updateDeveloperIssueStats(msg.issueStats);
  if(msg.canRetry===true)developerBrCanRetry=true;
  developerBrBusy=msg.stage!=='complete';
  $('developerBrStatus').textContent=msg.message||'';
  developerBrActivity.push(new Date().toLocaleTimeString()+' · '+String(msg.stage||'')+' · '+String(msg.message||''));
 }else if(msg.type==='developerBrFailed'){
  if(msg.previewOnly===true)developerBrPreviewOnly=true;
  developerBrFailedAt=developerBrStages.includes(developerBrStage)?developerBrStage:'analyze';
  if(developerBrPreviewOnly)developerBrDraftReady=false;
  developerBrStage=msg.stage==='stopped'?'stopped':msg.stage==='needs-attention'?'needs-attention':'failed';developerBrStopping=false;developerBrBusy=false;developerBrDone=false;developerBrServerRunning=false;developerBrServerBusy=false;
  if(Array.isArray(msg.files))developerBrFiles=msg.files;
  if(Array.isArray(msg.evidence))developerBrEvidence=msg.evidence;
  if(msg.architecture)developerBrArchitecture=msg.architecture;
  if(msg.worktree)developerBrWorktree=msg.worktree;
  if(msg.branch)developerBrBranch=msg.branch;
  if(typeof msg.serverLogs==='string')developerBrServerLogs=msg.serverLogs;
  if(msg.canRetry===true)developerBrCanRetry=true;
  $('developerBrStatus').textContent=(msg.stage==='needs-attention'?'Auto-repair paused — review required':msg.stage==='stopped'?'Generation stopped':'Generation failed')+': '+String(msg.message||'Unknown error');
  developerBrActivity.push((msg.stage==='needs-attention'?'NEEDS ATTENTION':'ERROR')+' · '+String(msg.message||''));
  if(developerBrSelected&&!developerBrPreviewOnly)send('developerBrRecoveryInfo',{brId:developerBrSelected});
 }else if(msg.type==='developerBrCancelled'){
  developerBrStopping=false;developerBrBusy=false;developerBrServerBusy=false;developerBrStage='idle';if(developerBrPreviewOnly)developerBrDraftReady=false;$('developerBrStatus').textContent=msg.message||'Cancelled.';
 }else if(msg.type==='developerBrStopped'){
  developerBrStopping=!!msg.pending;developerBrUrl='';developerBrDone=false;developerBrBusy=!!msg.pending;developerBrServerRunning=false;developerBrServerBusy=false;developerBrCanRetry=developerBrCanRetry||developerBrEvidence.length>0;
  if(developerBrPreviewOnly){developerBrDraftReady=false;developerBrDraftPhase='local';}
  if(developerBrCanRetry&&!msg.pending)developerBrStage='server-stopped';
  $('developerBrStatus').textContent=msg.message||'Local server stopped. Start Server to run it again.';
 }else if(msg.type==='developerBrLogState'){
  if(typeof msg.serverLogs==='string')developerBrServerLogs=msg.serverLogs;
  if(msg.worktree&&(!developerBrWorktree||developerBrWorktree===msg.worktree)){
   developerBrWorktree=msg.worktree;
   if(msg.branch)developerBrBranch=msg.branch;
   if(Array.isArray(msg.files))developerBrFiles=msg.files;
   if(Array.isArray(msg.evidence))developerBrEvidence=msg.evidence;
  if(msg.architecture)developerBrArchitecture=msg.architecture;
   if(msg.summary)developerBrSummary=msg.summary;
   developerBrCanRetry=msg.canRetry===true||developerBrCanRetry;
   if(msg.previewOnly===true)developerBrPreviewOnly=true;
   if(!developerBrBusy){
    developerBrServerRunning=!!msg.running&&!!msg.previewUrl;
    developerBrDone=developerBrServerRunning&&!developerBrPreviewOnly;
    developerBrUrl=developerBrServerRunning?msg.previewUrl:'';
    if(developerBrPreviewOnly&&developerBrServerRunning){developerBrDraftPhase='verify';developerBrDraftReady=true;}
    developerBrStage=developerBrServerRunning?'verify':developerBrCanRetry?'server-stopped':developerBrStage;
    if(developerBrServerRunning)$('developerBrStatus').textContent=(developerBrPreviewOnly?'UNTESTED PREVIEW ONLY — no AC, test or build approval. ':'Generated application is running at ')+developerBrUrl+'. Open Browser to review the implementation.';
    else if(developerBrCanRetry)$('developerBrStatus').textContent='Tested application is ready. Click Start Server to run and open it in your browser.';
   }
  }else if(msg.running===false&&developerBrServerRunning){
   developerBrServerRunning=false;developerBrDone=false;developerBrUrl='';developerBrStage='server-stopped';if(developerBrPreviewOnly){developerBrDraftReady=false;developerBrDraftPhase='local';}
  }
 }else if(msg.type==='developerBrBrowserOpened'){
  if(msg.opened===false)$('developerBrStatus').textContent='Local server is running, but the external browser did not open. Use Open Browser to retry.';
  else developerBrActivity.push(new Date().toLocaleTimeString()+' · External browser opened for '+String(msg.url||'local application'));
 }else if(msg.type==='developerBrActionError'){
  developerBrStopping=false;developerBrServerBusy=false;developerBrBusy=false;developerBrServerRunning=false;developerBrDone=false;
  developerBrStage=developerBrCanRetry?'server-stopped':'failed';
  $('developerBrStatus').textContent='Server action failed: '+String(msg.message||'Review Server Logs.');
 }
 renderDeveloperBrStages();renderDeveloperBrOutput();return true;
}
let developerSelectedTicket='',developerTaskInfo=null,developerArtifactInfo=null,developerArtifactDirty=false,developerTaskLoading=false,developerDeliveryProof=null,developerDeliveryBusy=false,developerAiBusy=false;
let developerStageEvidence={key:'',aiReady:false,checksPassed:false,checksFailed:false,verified:false,completed:false};
function resetDeveloperStageEvidence(key=''){
 developerStageEvidence={key,aiReady:false,checksPassed:false,checksFailed:false,verified:false,completed:false};
 renderDeveloperWorkflowSteps();
}
function renderDeveloperWorkflowSteps(){
 const selected=!!(developerSelectedTicket&&developerTaskInfo?.key===developerSelectedTicket);
 const hasTask=!!developerSelectedTicket;
 const evidence=developerStageEvidence.key===developerSelectedTicket?developerStageEvidence:{};
 const completed=!!(evidence.completed||(selected&&/^(done|completed|closed|resolved)$/i.test(developerTaskInfo.status||'')));
 const checksPassed=!!(evidence.checksPassed||evidence.verified||completed);
 const testsRunning=!!(developerDeliveryBusy&&$('developerDeliveryRunChecks').disabled);
 const stages=[
  {id:'developerStepSelect',done:selected,active:!selected,label:selected?'Jira task selected':hasTask?'Loading Jira task':'Choose a Jira task'},
  {id:'developerStepAi',done:!!evidence.aiReady,skip:(checksPassed||testsRunning||evidence.checksFailed)&&!evidence.aiReady,active:selected&&!checksPassed&&!testsRunning&&!evidence.checksFailed&&!evidence.aiReady,label:evidence.aiReady?'Proposal ready · implementation still required':checksPassed?'Skipped (optional)':developerAiBusy?'Preparing proposal':'Optional AI proposal'},
  {id:'developerStepTests',done:checksPassed,failed:!!evidence.checksFailed&&!checksPassed,active:selected&&!checksPassed&&(!!evidence.aiReady||testsRunning),label:checksPassed?'Tests & build passed':evidence.checksFailed?'Checks failed':developerDeliveryBusy&&$('developerDeliveryRunChecks').disabled?'Running checks':'Run after implementing code'},
  {id:'developerStepComplete',done:completed,active:selected&&checksPassed&&!completed,label:completed?'Jira delivery completed':evidence.verified?'Verified · ready to complete':checksPassed?'Verify delivery evidence':'Awaiting test evidence'}
 ];
 // Only the earliest actionable incomplete step is current; later steps may remain pending.
 if(!selected){stages[1].active=false;stages[2].active=false;stages[3].active=false;}
 if(selected&&!checksPassed&&!evidence.aiReady&&!developerAiBusy&&!testsRunning&&!evidence.checksFailed){stages[1].active=true;stages[2].active=false;}
 if(completed)stages.forEach(stage=>stage.active=false);
 stages.forEach(stage=>{
  const node=$(stage.id);if(!node)return;
  const state=stage.done?'complete':stage.skip?'skipped':stage.failed?'failed':stage.active?'current':'pending';
  node.className='developer-workflow-step '+state;
  if(stage.active)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');
  node.querySelector('small').textContent=stage.label;
 });
 const status=$('developerWorkflowStatus');if(!status)return;
 status.textContent=completed?'Jira delivery completed.':!selected?hasTask?'Loading the selected Jira task…':'Choose an assigned Jira task to begin.':evidence.verified?'Delivery evidence verified. Confirm Complete Delivery.':checksPassed?'Tests & build passed. Review the applicable artifacts and verify delivery.':evidence.checksFailed?'Tests or build failed. Correct the code and run checks again.':evidence.aiReady?'AI proposal prepared. Implement and commit the code before running tests.':developerAiBusy?'Preparing the AI development proposal…':'Start AI Development for a proposal, or implement the task directly and run tests.';
}
function textElement(tag,text,className=''){
 const node=document.createElement(tag);node.textContent=String(text||'');if(className)node.className=className;return node;
}
function showDeveloperAssignedTickets(items){
 const root=$('developerAssignedTickets');
 const mine=(Array.isArray(items)?items:[]).filter(item=>item.mine&&item.brRoot);
 developerAssignedMine=mine;renderDeveloperBrAssignment();
 // Refresh status immediately after Jira ownership data loads or changes.
 updateDeveloperBrChangeBadge((brState?.brs||[]).find(br=>br.id===developerBrSelected));
 root.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=mine.length?'Select assigned Business Requirement':'No assigned Business Requirements';root.append(placeholder);
 $('developerAssignedTaskCount').textContent='('+mine.length+' BRs)';
 $('developerTaskStatus').textContent=mine.length?`${mine.length} complete Business Requirement${mine.length===1?'':'s'} assigned to you.`:'No BR assigned to you. Use Assign Entire BR in the Jira register after stack approval.';
 for(const item of mine){
  const option=document.createElement('option');option.value=item.key;
  option.textContent=`${item.key} · ${item.summary||'Untitled Jira issue'} · ${item.status||'Unknown'}`;
  root.append(option);
 }
 const keep=mine.some(item=>item.key===developerSelectedTicket);
 if(!keep){
  developerSelectedTicket='';developerTaskInfo=null;developerArtifactInfo=null;developerArtifactDirty=false;
  developerAiBusy=false;$('developerTaskRefresh').disabled=false;$('developerAiDraftPanel').classList.add('hidden');
  $('developerTaskDetails').classList.add('hidden');$('developerArtifactViewer').classList.add('hidden');
  resetDeveloperStageEvidence();
  // A BR-driven workspace must never silently select an unrelated Jira issue.
 }else{root.value=developerSelectedTicket;renderDeveloperWorkflowSteps();}
 syncDeveloperBrJira();
}
$('developerAssignedTickets').addEventListener('change',()=>{
 const root=$('developerAssignedTickets'),chosen=root.value;
 if(developerArtifactDirty){root.value=developerSelectedTicket;$('developerArtifactMessage').textContent='Save or close the current artifact before switching tickets.';return;}
 if(chosen)selectDeveloperTicket(chosen);
 else{root.value=developerSelectedTicket||'';}
});
function selectDeveloperTicket(key){
 if(!/^([A-Z][A-Z0-9]{1,19}-[1-9][0-9]*)$/.test(String(key||'')))return;
 if(developerArtifactDirty){$('developerArtifactMessage').textContent='Save or close the current artifact before switching tickets.';return;}
 developerSelectedTicket=key;developerTaskInfo=null;developerArtifactInfo=null;developerTaskLoading=true;
 developerAiBusy=false;$('developerTaskRefresh').disabled=false;$('developerAiDraftPanel').classList.add('hidden');
 $('developerArtifactViewer').classList.add('hidden');$('developerTaskDetails').classList.add('hidden');resetDeveloperDelivery();
 $('developerTaskStatus').textContent=`Loading ${key} from Jira…`;
 $('developerAssignedTickets').value=key;
 resetDeveloperStageEvidence(key);
 syncBrDeliveryGate();
 send('developerTaskDetail',{key});
}
const developerArtifactLabels={frontend:'Frontend',backend:'API / Backend',database:'Database',integration:'Integration',testing:'Testing'};
function renderDeveloperTaskDetail(info){
 if(!info||info.key!==developerSelectedTicket||selectedRole!=='software-developer')return;
 developerTaskLoading=false;developerTaskInfo=info;developerArtifactInfo=null;developerArtifactDirty=false;resetDeveloperDelivery();
 document.querySelectorAll('#developerDeliveryAreas input').forEach(input=>{input.checked=!!(info.artifacts||[]).find(a=>a.type===input.value&&a.exists);});
 $('developerTaskDetails').classList.remove('hidden');$('developerArtifactViewer').classList.add('hidden');
 $('developerArtifactsSection').open=developerBrTab==='artifacts';
 $('developerArtifactsCount').textContent=(info.artifacts||[]).filter(item=>item.exists).length+' of 5 saved';
 renderDeveloperWorkflowSteps();
 $('developerTaskStatus').textContent=`Showing ${info.key}, assigned to your Jira account.`+( /^(done|completed|closed|resolved)$/i.test(info.status||'')?' This ticket is completed; choose an open ticket for AI Development.':'');
 $('developerTicketTitle').textContent=`${info.key} · ${info.summary||'Jira issue'}`;
 $('developerTicketMetadata').textContent=`${info.issueType||'Task'} · Updated ${info.updated||'not available'}`;
 $('developerTicketBadge').textContent=info.status||'Unknown';
 const progress=info.progress||{percent:0,basis:'workflow',label:'Not available'};
 const percent=Math.max(0,Math.min(100,Number(progress.percent)||0));
 $('developerTicketProgressLabel').textContent=progress.basis==='subtasks'?`${percent}% · ${progress.label}`:progress.label;
 $('developerTicketProgressFill').style.width=percent+'%';
 $('developerTicketProgressBar').setAttribute('aria-valuenow',String(percent));
 $('developerTicketProgressBar').setAttribute('aria-valuetext',progress.label||'');
 $('developerTicketProgressBasis').textContent='Measured from completed Jira subtasks.';
 $('developerTicketProgressBar').closest('.developer-ticket-progress').classList.toggle('hidden',progress.basis!=='subtasks');
 const cards=$('developerArtifactCards');cards.replaceChildren();
 for(const [type,label] of Object.entries(developerArtifactLabels)){
  const artifact=(info.artifacts||[]).find(item=>item.type===type);
  const button=document.createElement('button');button.type='button';button.className='developer-artifact-card';
  const heading=textElement('strong',label),state=textElement('span',artifact?.exists?'Draft available':'Not started','muted');
  button.append(heading,state);button.title=`Open ${label} artifact for ${info.key}`;
  button.addEventListener('click',()=>{
    if(developerArtifactDirty){$('developerArtifactMessage').textContent='Save or close the current artifact before selecting another.';return;}
    developerArtifactInfo=null;$('developerArtifactViewer').classList.remove('hidden');$('developerArtifactContent').value='';
    $('developerArtifactTitle').textContent=label;$('developerArtifactState').textContent='Loading…';
    $('developerArtifactMessage').textContent='Loading artifact from this project…';
    cards.querySelectorAll('button').forEach(card=>card.setAttribute('aria-pressed',String(card===button)));
    send('developerArtifactRead',{key:info.key,artifactType:type});
  });cards.append(button);
 }
 if(developerBrTab==='artifacts')renderDeveloperBrArtifacts();
 syncBrDeliveryGate();
 const refs=$('developerTaskReferences');refs.replaceChildren();
 if(!(info.references||[]).length)refs.append(textElement('p','No saved mockup, database, API or architecture designs are available for this project.','muted'));
 for(const ref of info.references||[]){
  const button=document.createElement('button');button.type='button';button.className='secondary developer-reference-card';
  button.append(textElement('strong',ref.title||ref.label),textElement('span',`${ref.label} · ${ref.status} · Project reference`, 'muted'));
  button.title=ref.scope||'Check relevance to this Jira task';
  button.addEventListener('click',()=>{if(developerArtifactDirty){$('developerArtifactMessage').textContent='Save or close the artifact before opening a design.';return;}navigate('planning');if(view==='planning')openDesignPreview(ref.kind,ref.proposalId);});
  refs.append(button);
 }
}
function developerArtifactTemplate(info,type){
 return ['# '+developerArtifactLabels[type]+' — '+info.key,'',`Jira task: ${info.summary||info.key}`,'','## Scope and acceptance criteria','','- Confirm against the Jira task and approved requirements.','','## Actual implementation and file references','','- ','','## Verification evidence','','- Record real evidence only; a draft does not mean the implementation passed.','','## Outstanding decisions','','- ',''].join('\n');
}
function renderDeveloperArtifact(value){
 if(!value||value.key!==developerSelectedTicket||!developerTaskInfo)return;
 developerArtifactInfo=value;developerArtifactDirty=false;$('developerArtifactSave').disabled=false;
 $('developerArtifactViewer').classList.remove('hidden');
 $('developerArtifactTitle').textContent=value.title;
 $('developerArtifactState').textContent=value.exists?'Saved draft':'New draft · not yet saved';
 $('developerArtifactPath').textContent=value.path;
 $('developerArtifactContent').value=value.exists?value.content:developerArtifactTemplate(developerTaskInfo,value.type);
 $('developerArtifactMessage').textContent=value.exists?'Review the draft or edit and save.':'No draft exists yet. Save explicitly to create a Markdown artifact.';
}
function resetDeveloperDelivery(message='Select applicable artifacts, run checks and verify delivery readiness.'){
 developerDeliveryProof=null;developerDeliveryBusy=false;
 if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}
 $('developerDeliveryComplete').disabled=true;
 $('developerDeliveryRunChecks').disabled=false;$('developerDeliveryVerify').disabled=false;
 $('developerDeliveryAcceptance').checked=false;
 $('developerDeliveryStatus').textContent=message;
 $('developerDeliveryGates').replaceChildren();
}
function deliveryRequiredTypes(){return Array.from(document.querySelectorAll('#developerDeliveryAreas input:checked')).map(input=>input.value);}
function renderDeveloperDeliveryReadiness(info){
 if(!info||info.key!==developerSelectedTicket||selectedRole!=='software-developer')return;
 developerDeliveryBusy=false;$('developerDeliveryVerify').disabled=false;$('developerDeliveryRunChecks').disabled=false;
 developerDeliveryProof=info.ready?info:null;
 if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=!!info.ready;renderDeveloperWorkflowSteps();}
 $('developerDeliveryComplete').disabled=!info.ready||developerArtifactDirty;
 $('developerDeliveryStatus').textContent=info.ready?'All delivery gates passed. Review the evidence and confirm Complete Delivery.':'Delivery blocked: resolve the failed checks, then verify again.';
 const gates=$('developerDeliveryGates');gates.replaceChildren();
 for(const gate of info.gates||[]){
  const row=textElement('div',`${gate.ok?'✓':'×'} ${gate.detail}`,gate.ok?'developer-gate-pass':'developer-gate-fail');
  row.title=gate.id;gates.append(row);
 }
}
$('developerDeliveryAreas').addEventListener('change',()=>{developerDeliveryProof=null;if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}$('developerDeliveryComplete').disabled=true;$('developerDeliveryStatus').textContent='Applicable artifacts changed. Verify Delivery again.';});
$('developerDeliveryAcceptance').addEventListener('change',()=>{developerDeliveryProof=null;if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}$('developerDeliveryComplete').disabled=true;$('developerDeliveryStatus').textContent='Acceptance confirmation changed. Verify Delivery again.';});
$('developerDeliveryRunChecks').addEventListener('click',()=>{
 if(!developerBrDone||!developerSelectedTicket||developerDeliveryBusy||developerArtifactDirty)return;
 developerDeliveryBusy=true;$('developerDeliveryRunChecks').disabled=true;$('developerDeliveryComplete').disabled=true;
 if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.checksFailed=false;developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}
 $('developerDeliveryStatus').textContent='Requesting local test and build execution…';
 send('developerDeliveryRunChecks',{key:developerSelectedTicket});
});
$('developerDeliveryVerify').addEventListener('click',()=>{
 if(!developerBrDone||developerDeliveryBusy||developerArtifactDirty||!matchingDeveloperBrTickets().length)return;
 const dialog=$('developerDeliveryEvidence');if(!dialog.open)dialog.showModal();
});
$('developerDeliveryCancelReview').addEventListener('click',()=>$('developerDeliveryEvidence').close());
$('developerDeliveryConfirmReview').addEventListener('click',()=>{
 if(!developerBrDone||developerDeliveryBusy||developerArtifactDirty)return;
 if(!developerSelectedTicket||developerTaskInfo?.key!==developerSelectedTicket){$('developerBrJiraStatus').textContent='Select the matching assigned Jira task and allow its details to load before verifying.';return;}
 if(!$('developerDeliveryAcceptance').checked){$('developerBrJiraStatus').textContent='Confirm that you reviewed the Jira acceptance criteria and attached evidence before verifying.';return;}
 $('developerDeliveryEvidence').close();
 developerDeliveryBusy=true;$('developerDeliveryVerify').disabled=true;$('developerDeliveryComplete').disabled=true;
 if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}
 $('developerDeliveryStatus').textContent='Verifying live Jira, Git, GitHub and local evidence…';
 send('developerDeliveryPreview',{key:developerSelectedTicket,requiredTypes:deliveryRequiredTypes(),accepted:true});
});
$('developerDeliveryComplete').addEventListener('click',()=>{
 if(!developerBrDone||!developerDeliveryProof?.ready||developerDeliveryBusy||developerArtifactDirty)return;
 developerDeliveryBusy=true;$('developerDeliveryComplete').disabled=true;
 $('developerDeliveryStatus').textContent='Rechecking evidence before remote completion…';
 send('developerDeliveryComplete',{key:developerSelectedTicket,requiredTypes:deliveryRequiredTypes(),accepted:$('developerDeliveryAcceptance').checked,expectedRevision:developerDeliveryProof.revision});
});
function finishDeveloperAi(message){
 developerAiBusy=false;$('developerTaskRefresh').disabled=false;
 renderDeveloperWorkflowSteps();
 $('developerAiDraftStatus').textContent=message;
}
function startDeveloperAi(){
 if(developerAiBusy)return;
 const key=developerSelectedTicket;
 $('developerAiDraftPanel').classList.remove('hidden');
 $('developerAiDraftContent').textContent='';
 if(!key||!developerTaskInfo||developerTaskInfo.key!==key){finishDeveloperAi('Select an assigned Jira ticket and load its details first.');return;}
 if(/^(done|completed|closed|resolved)$/i.test(developerTaskInfo.status||'')){finishDeveloperAi(key+' is completed in Jira. Select an unfinished ticket to start AI Development.');return;}
 const project=projects.find(item=>item.id===activeId);
 if(project?.techStackApproval?.status!=='approved'){
  finishDeveloperAi('Solution Architect approval is required before AI Development.');return;
 }
 if(!project.techStackPrepared?.branch){finishDeveloperAi('The approved stack does not have a saved bootstrap branch. Ask the Solution Architect to Save Stack again.');return;}
 developerAiBusy=true;$('developerTaskRefresh').disabled=true;
 renderDeveloperWorkflowSteps();
 processActivityUpsert('developer-ai','AI Development','Checking Jira, Git branch and approved stack…','running');
 $('developerAiDraftStatus').textContent='Starting '+key+' from '+project.techStackPrepared.branch+' · checking Jira, Git and AI consent…';
 send('devCopilotStart',{key,base:project.techStackPrepared.branch});
}
$('developerTaskRefresh').addEventListener('click',startDeveloperAi);
$('developerAiDraftClose').addEventListener('click',()=>{$('developerAiDraftPanel').classList.add('hidden');});
$('developerArtifactContent').addEventListener('input',()=>{if(developerArtifactInfo){developerArtifactDirty=true;developerDeliveryProof=null;if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}$('developerDeliveryComplete').disabled=true;$('developerArtifactMessage').textContent='Unsaved changes';}});
$('developerArtifactClose').addEventListener('click',()=>{developerArtifactDirty=false;developerArtifactInfo=null;$('developerArtifactViewer').classList.add('hidden');});
$('developerArtifactSave').addEventListener('click',()=>{
 const info=developerArtifactInfo;
 if(!info||info.key!==developerSelectedTicket)return;
 $('developerArtifactSave').disabled=true;$('developerArtifactMessage').textContent='Saving artifact draft…';
 send('developerArtifactSave',{key:info.key,artifactType:info.type,content:$('developerArtifactContent').value,expectedRevision:info.revision});
});
function loadRoleJiraIssues(force=false){
 if(!activeId||roleJiraLoading)return;
 if(!force&&roleJiraLoaded&&roleJiraProject===activeId)return;
 roleJiraProject=activeId;roleJiraLoaded=false;roleJiraLoading=true;
 $('roleJiraStatus').textContent='Retrieving live Jira issues…';send('roleJiraIssues',{roleId:selectedRole,requestId:++roleJiraRequest});
}
function jiraIssueLinkedBr(item){
 const approved=id=>(brState?.brs||[]).some(br=>br.id===id&&br.status==='approved'&&!br.needsRefresh);
 // Jira Story/Subtask summaries often omit BR-007. Follow the canonical
 // publication path (BR-007/feature/...); Jira's parent key is a fallback.
 const mapped=brState?.synced||{};
 for(const key of [item?.key,item?.parentKey]){
  if(!key)continue;
  const entry=Object.entries(mapped).find(([,issue])=>String(issue?.key||'').toUpperCase()===String(key).toUpperCase());
  if(entry){const id=String(entry[0]).split('/')[0].toUpperCase();if(approved(id))return id;}
 }
 const match=String(item?.summary||'').match(/(?:^|[^A-Z0-9])(BR-[0-9]{1,6})(?![0-9])/i);
 const id=match?.[1]?.toUpperCase()||'';
 return id&&approved(id)?id:'';
}
function renderRoleJiraIssues(items,incomplete=false){
 const rows=Array.isArray(items)?items:[],root=$('roleJiraTable');
 roleJiraItems=rows;roleJiraIncomplete=incomplete;
 if(selectedRole==='software-developer')showDeveloperAssignedTickets(rows);
 if(selectedRole==='ux-designer')renderUxTickets(rows);
 $('roleJiraStatus').textContent=`${rows.length} Jira project item(s)${incomplete?' · results truncated':''} · All issue types are visible. Only approved BR Epic rows support Assign/Release Entire BR.`;
 if(typeof ATGVDataTables==='undefined'){root.textContent='Jira DataTables component is unavailable.';return;}
 const project=projects.find(p=>p.id===activeId),jiraBase=project?.settings?.jira?.baseUrl||extensionSettings.jira?.baseUrl||'';
 ATGVDataTables.mount(root,rows,[
  {key:'key',label:'Jira ID',render:item=>{const btn=document.createElement('button');btn.type='button';btn.className='jira-issue-inline-link';btn.textContent=item.key;btn.title='View Jira '+item.key+' details';btn.addEventListener('click',()=>openJiraIssueModal(item.key));return btn;}},
  {key:'issueType',label:'Type'},
  {key:'brId',label:'BR',render:item=>item.brId?(item.brId+(item.brStatus==='Updated'?' · Updated':'')):'—'},
  {key:'descendantCount',label:'Child Issues',render:item=>item.brRoot?String(item.descendantCount||0):'—'},
  {key:'summary',label:'Summary',render:item=>{const btn=document.createElement('button');btn.type='button';btn.className='jira-issue-summary-link';btn.textContent=item.summary;btn.addEventListener('click',()=>openJiraIssueModal(item.key));return btn;}},
  {key:'status',label:'Status'},
  {key:'priority',label:'Priority'},
  {key:'assignee',label:'Assignee'},
  {key:'key',label:'Action',sortable:false,render:item=>{
   const developer=selectedRole==='software-developer',designer=selectedRole==='ux-designer';
   const brId=item.brRoot?item.brId:'';
   const allowClaim=!!projects.find(p=>p.id===activeId)?.techStackApproval?.status;
   const cell=document.createElement('div');cell.className='jira-row-actions';
   const btn=document.createElement('button');btn.type='button';btn.className='secondary';
   btn.textContent=!item.brRoot?'View Only':item.mine?'Release Entire BR':item.unassigned?'Assign Entire BR':'Assigned to Other';
   btn.disabled=developerBrAssignmentBusy||developerBrBusy||!item.brRoot||(!item.mine&&!item.unassigned)||developer&&item.unassigned&&!allowClaim;
   btn.title=item.brRoot?'This action covers the entire '+item.brId+' including '+item.descendantCount+' descendants; it never claims a subtask separately.':'Children inherit BR ownership.';
   btn.setAttribute('aria-label',item.mine?`Unassign Jira ${item.key}`:`Assign Jira ${item.key} to me`);
   btn.addEventListener('click',()=>{
    if(developerBrAssignmentBusy||developerBrBusy)return;
    if(designer&&item.mine){
     btn.disabled=true;btn.textContent='Releasing BR…';$('roleJiraStatus').textContent='Releasing '+item.brId+'…';
     send('roleJiraUnassign',{key:item.key,brId:item.brId,expectedUpdated:item.updated,roleId:'ux-designer'});return;
    }
    if(developer&&brId){
     developerBrAssignmentBusy=true;btn.disabled=true;btn.textContent=item.mine?'Unassigning…':'Assigning…';
     $('roleJiraStatus').textContent=(item.mine?'Reviewing unassignment of ':'Assigning ')+item.key+'…';
     send('developerBrAssignment',{brId,key:item.key,action:item.mine?'unassign':'assign',expectedUpdated:item.updated});return;
    }
    btn.disabled=true;btn.textContent='Assigning…';$('roleJiraStatus').textContent='Assigning '+item.key+'…';
    send('roleJiraAssign',{key:item.key,brId:item.brId,expectedUpdated:item.updated,roleId:selectedRole});
   });cell.append(btn);
   if(designer&&item.mine&&item.brRoot){
    const open=document.createElement('button');open.type='button';open.className='secondary';
    open.textContent='Open Design';open.title='Open or edit the UI/UX design for '+item.key;
    open.setAttribute('aria-label',`Open or edit design for Jira ${item.key}`);
    open.addEventListener('click',()=>openUxDesignForIssue(item.key));cell.append(open);
   }
   return cell;
  }}
 ],{label:'Jira issues for '+visibleRoleLabel(roleData.roles.find(r=>r.id===selectedRole)||{label:'My Work'}),pageSize:5,sortKey:'key',pinFirst:selectedRole==='ux-designer'?(item=>item.mine):undefined,onRowClick:item=>openJiraIssueModal(item.key)});
}
$('roleJiraRefresh').addEventListener('click',()=>loadRoleJiraIssues(true));
let assignedJiraProject='',assignedJiraLoaded=false,assignedJiraLoading=false;
function loadAssignedJiraTasks(force=false){
 if(!activeId||assignedJiraLoading||!$('devAssignedJiraList'))return;
 if(!force&&assignedJiraLoaded&&assignedJiraProject===activeId)return;
 assignedJiraProject=activeId;assignedJiraLoaded=false;assignedJiraLoading=true;
 const statusNode=$('devAssignedJiraStatus');if(statusNode)statusNode.textContent='Loading your assigned Jira tasks…';
 send('devCopilotTasks');send('devRepositoryStatus');
}
function renderAssignedJiraTasks(items,incomplete=false){
 const root=$('devAssignedJiraList'),info=$('devAssignedJiraStatus');if(!root||!$('devJiraKey'))return;
 root.replaceChildren();const current=read('devJiraKey').trim().toUpperCase();
 const tasks=Array.isArray(items)?items:[];
 if(info)info.textContent=tasks.length+' assigned Jira issue(s) loaded'+(incomplete?' (more results are available in Jira)':'')+'.';
 for(const item of tasks){
  const button=document.createElement('button');button.type='button';button.className='secondary dev-jira-choice';
  button.textContent=item.key+' · '+(item.priority||'No priority')+' · '+(item.summary||'');
  button.title='Load '+item.key+' · '+(item.status||'');
  button.setAttribute('aria-pressed',String(item.key===current));
  button.addEventListener('click',()=>{$('devJiraKey').value=item.key;send('devLoadJira',{key:item.key});openJiraIssueModal(item.key);root.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
  root.append(button);const detail=document.createElement('button');detail.type='button';detail.className='jira-issue-inline-link';detail.textContent='Details';detail.addEventListener('click',()=>openJiraIssueModal(item.key));root.append(detail);
 }
 if(!tasks.length){const message=document.createElement('p');message.className='muted';message.textContent='No issues are assigned to your Jira account in this project.';root.append(message);}
 // Auto-open the first assigned issue if there is not already one selected.
 if(tasks.length&&!tasks.some(item=>item.key===current)){$('devJiraKey').value=tasks[0].key;send('devLoadJira',{key:tasks[0].key});}
}

let selectedRoleStepScope='project';
function roleStepsForScope(){return selectedRoleStepScope==='project'?roleStepData:(roleStepScopedData||roleStepData);}
let roleStepScopedData=null;
function renderProjectSdlcSummary(){
 const box=$('roleConsolidation'),info=$('roleConsolidatedOverview'),list=$('roleConsolidatedList');
 if(!box||!info||!list)return;
 const summary=projectSdlcSummary;
 if(!summary){info.textContent='No shared project state loaded.';list.replaceChildren();return;}
 info.textContent=(summary.roles?.length||0)+' enabled roles · '+(summary.scopes||0)+' tracked scopes · '+(summary.verifiedEvidence||0)+' locally verified outputs. This is a project evidence index, not an approval or automatic document merge.';
 list.replaceChildren();
 for(const role of summary.roles||[]){
  const row=document.createElement('div');row.className='task-row';
  const title=document.createElement('strong');title.textContent=role.label;
  const detail=document.createElement('span');detail.className='muted';detail.textContent=role.completedSteps+' / '+role.totalSteps+' steps · '+role.verifiedOutputs+' verified outputs · '+role.scopes+' scopes';
  row.append(title,detail);list.append(row);
 }
}
function renderRoleStepFlow(role){
 const data=roleStepsForScope().roles?.find(r=>r.roleId===role.id);
 renderRoleProcesses(role,data);
 const wrapper=$('roleStepFlow');if(!wrapper)return;
 wrapper.classList.toggle('hidden',!data);
 if(!data){$('roleStepButtons').replaceChildren();$('roleStepStatus').textContent='No role workflow data available.';return;}
 const steps=data.steps||[];
 if(!steps.some(s=>s.id===selectedRoleStep))selectedRoleStep=steps.find(s=>s.status!=='completed')?.id||steps[0]?.id||'';
 const selected=steps.find(s=>s.id===selectedRoleStep);
 const buttons=$('roleStepButtons');buttons.replaceChildren();
 buttons.style.setProperty('--role-step-count',String(Math.max(1,steps.length)));
 for(const [index,step] of steps.entries()){
  const isCurrent=step.id===selectedRoleStep;
  const button=document.createElement('button');button.type='button';
  button.className='role-circle-step'+(isCurrent?' selected':'');
  button.dataset.status=step.status;
  button.setAttribute('aria-pressed',String(isCurrent));
  button.setAttribute('aria-label','Step '+(index+1)+': '+step.title+', '+step.completed+' of '+step.requiredCount+' outputs verified, '+step.status);
  button.title=step.title+' — '+step.status+' · '+step.completed+'/'+step.requiredCount+' verified';
  const circle=document.createElement('span');circle.className='role-circle-step-marker';circle.setAttribute('aria-hidden','true');
  circle.textContent=step.status==='completed'?'✓':step.status==='blocked'?'!':String(index+1);
  const title=document.createElement('span');title.className='role-circle-step-title';title.textContent=step.title;
  const count=document.createElement('small');count.className='role-circle-step-count';count.textContent=step.completed+'/'+step.requiredCount+' outputs';
  button.append(circle,title,count);
  button.addEventListener('click',()=>{
   selectedRoleStep=step.id;
   renderRoleStepFlow(role);
   if(role.id==='software-developer')$('roleStepFlow').scrollIntoView({block:'start',behavior:'smooth'});
  });
  buttons.append(button);
 }
 $('roleStepProgressFill').style.width=data.percent+'%';$('roleStepProgress').setAttribute('aria-valuenow',String(data.percent));
 $('roleStepStatus').textContent=data.completed+' of '+data.total+' steps locally verified · '+selectedRoleStepScope+' scope · '+(selected?.title||'');
 const outputs=$('roleStepOutputs');outputs.replaceChildren();
 if(!selected)return;
 for(const output of selected.outputs||[]){
  const row=document.createElement('div');row.className='task-row';
  const info=document.createElement('div');info.className='task-info';
  const title=document.createElement('strong');title.textContent=output.title;
  const note=document.createElement('p');note.className='muted';note.textContent=(output.evidence||'No evidence yet')+' · '+output.status;
  info.append(title,note);row.append(info);
  const evidenceInput=document.createElement('input');evidenceInput.type='text';evidenceInput.placeholder='Evidence URL or project file';evidenceInput.maxLength=1000;evidenceInput.value=output.evidence||'';
  evidenceInput.title='Actual evidence required before verification';
  if(output.status!=='verified')row.append(evidenceInput);
  if(output.status==='draft'||output.status==='blocked'){
   const submit=document.createElement('button');submit.className='secondary';submit.textContent='Submit for Review';submit.disabled=!activeId;
   submit.addEventListener('click',()=>send('roleStepAction',{kind:'set-status',roleId:role.id,scopeId:selectedRoleStepScope,stepId:selected.id,outputId:output.id,status:'in-review'}));row.append(submit);
  }else if(output.status==='in-review'){
   const verify=document.createElement('button');verify.className='secondary';verify.textContent='Verify';verify.disabled=!activeId;
   verify.title='Local verification of a real document or evidence link; does not approve Jira or BR';
   verify.addEventListener('click',()=>{const reviewer=$('roleStepReviewer').value.trim();if(!reviewer){status('Enter the local reviewer identity before verifying an output.',true);return;}send('roleStepAction',{kind:'set-status',roleId:role.id,scopeId:selectedRoleStepScope,stepId:selected.id,outputId:output.id,status:'verified',reviewer,evidence:evidenceInput.value.trim()});});row.append(verify);
  }
  outputs.append(row);
 }
 if(!selected.outputs?.length){const hint=document.createElement('p');hint.className='muted';hint.textContent='Add a document or output, attach real evidence, submit for review and verify it before completion.';outputs.append(hint);}
 const next=$('roleStepNext'),idx=steps.findIndex(s=>s.id===selected.id);
 next.hidden=selected.status!=='completed'||idx===steps.length-1;
 next.onclick=()=>{selectedRoleStep=steps[idx+1].id;renderRoleStepFlow(role);};
 $('roleStepAddOutput').disabled=!activeId;
}
$('roleStepLoadScope').addEventListener('click',()=>{
 const value=$('roleStepScope').value.trim().toUpperCase();
 if(value!=='PROJECT'&&!/^BR-[0-9]{1,12}$/.test(value)&&! /^[A-Z][A-Z0-9_]{1,16}-[0-9]{1,12}$/.test(value)){
   status('Enter project, a BR ID or a Jira issue key.',true);return;
 }
 selectedRoleStepScope=value==='PROJECT'?'project':value;
 if(selectedRoleStepScope==='project'){roleStepScopedData=null;selectedRoleStep='';renderRoleWork();return;}
 send('roleStepLoadScope',{scopeId:selectedRoleStepScope});
});
$('roleStepAddOutput').addEventListener('click',()=>{
 const role=roleData.roles.find(r=>r.id===selectedRole);if(!role||!selectedRoleStep)return;
 send('roleStepAction',{kind:'add',roleId:role.id,scopeId:selectedRoleStepScope,stepId:selectedRoleStep,title:$('roleStepNewTitle').value,evidence:$('roleStepNewEvidence').value});
});
function renderBAWorkDashboard(){
 const metrics=$('baMyWorkMetrics');
 if(!metrics)return;
 // Count unique BR identities across both the active cycle and immutable published
 // history. Restarting an upload cycle must not make approved BRs disappear from
 // My Work; a new revision of the same BR must never be counted twice.
 const requirementStates=new Map();
 for(const group of ATGVCompletedBRHistory.group(completedBARecords())){
  requirementStates.set(group.id,{approved:true,actionRequired:false});
 }
 for(const br of activeBusinessRequirements()){
  const previous=requirementStates.get(br.id)||{approved:false,actionRequired:false};
  const needsAction=ATGVCompletedBRHistory.requiresAttention(br);
  requirementStates.set(br.id,{approved:ATGVCompletedBRHistory.currentlyApproved(br),actionRequired:needsAction,hasApprovedRevision:previous.approved||!!br.approvedContent});
 }
 const requirements=[...requirementStates.values()];
 const approved=requirements.filter(br=>br.approved).length;
 const actionRequired=requirements.filter(br=>br.actionRequired).length;
 metrics.replaceChildren();
 for(const [label,value] of [['Total',requirements.length],['Approved',approved],['Action required',actionRequired]]){
  const item=document.createElement('div');item.className='ba-my-work-metric';
  const number=document.createElement('strong');number.textContent=String(value);
  const caption=document.createElement('span');caption.textContent=label;
  item.append(number,caption);metrics.append(item);
 }
}
$('baMyWorkOpen').addEventListener('click',()=>navigate('ba-overview'));
$('baAutoBack').addEventListener('click',()=>navigate('ba-overview'));
function applyFocusedRoleLayout(roleId){
 const work=$('workView');
 const focused=roleId!=='business-analyst'&&roleId!=='software-developer';
 const jiraRole=roleId==='software-developer'||roleId==='ux-designer';
 $('roleJiraWork').classList.toggle('hidden',!jiraRole);
 $('developerTaskDashboard').classList.toggle('hidden',roleId!=='software-developer');
 $('uxDesignWorkspace').classList.toggle('hidden',roleId!=='ux-designer');
 if(jiraRole){if(roleJiraLoaded&&roleJiraProject===activeId)renderRoleJiraIssues(roleJiraItems,roleJiraIncomplete);else loadRoleJiraIssues();}
 work.classList.toggle('role-progress-only',focused);
 // The old My Work circular steps are retained for unaffected roles.
 // Developer delivery progress belongs under Developer Tasks; Architect uses its stack steps.
 const architect=roleId==='solution-architect';
 work.classList.toggle('role-solution-architect',architect);
 work.classList.toggle('role-software-developer',roleId==='software-developer');
 work.classList.toggle('role-ux-designer',roleId==='ux-designer');
 const legacySteps=work.querySelector('.role-legacy-hidden');
 if(legacySteps)legacySteps.setAttribute('aria-hidden','false');
 work.classList.toggle('role-ba-simplified',roleId==='business-analyst');
 // The actual BR workflow replaces the old My Work dashboard; its metrics remain available internally.
 $('baMyWorkDashboard').classList.add('hidden');
 $('pmDailyCockpit').classList.toggle('hidden',roleId!=='project-manager');
 work.classList.toggle('role-pm-dashboard',roleId==='project-manager');
}
// Only show identifiers verified in the active downloaded SDLC Catalog.
// Never infer e.g. `ba.standard` from a role's display name.
function catalogRoleAcronym(roleId){
 const known={'business-analyst':'BA','solution-architect':'SA','ux-designer':'UX','software-developer':'DEV','project-manager':'PM'};
 return known[roleId]||String(roleId||'').split('-').map(part=>part[0]||'').join('').toUpperCase().slice(0,5);
}
function renderRoleSkillHeader(roleId=selectedRole){
 const host=$('workSkill'),role=$('workSkillRole'),select=$('workSkillSelect');
 if(!host||!role||!select)return;
 const acronym=catalogRoleAcronym(roleId);
 role.textContent=acronym;
 select.setAttribute('aria-label',acronym+' catalog role variant');
 const entries=Array.isArray(catalogState?.roleSkillOptions?.[roleId])?catalogState.roleSkillOptions[roleId]:[];
 const choices=entries.filter(item=>typeof item?.id==='string'&&item.id.length<=128&&typeof item?.source==='string'&&item.source.startsWith('roles/'+roleId+'/'));
 const wanted=catalogState?.roleSkillSelections?.[roleId];
 const selected=choices.find(entry=>entry.id===wanted)||choices.find(entry=>entry.default)||choices[0];
 select.replaceChildren();
 if(!choices.length){const opt=document.createElement('option');opt.value='';opt.textContent='Not loaded';select.append(opt);select.disabled=true;host.dataset.available='false';}
 else{
  for(const item of choices){const opt=document.createElement('option');opt.value=item.id;opt.textContent=String(item.label||item.id).slice(0,90);opt.title=item.source;select.append(opt);}
  select.value=selected.id;select.disabled=false;host.dataset.available='true';
 }
 if(typeof window!=='undefined')window.ATGVBusinessRequirements?.placeSkill();
 host.title=choices.length?`${acronym}: ${selected?.source||''}\n${choices.length} catalog variant(s) · ${catalogState?.installed?.version||'unknown'} · ${String(catalogState?.installed?.sha||'').slice(0,12)}`:'No role variants installed. Pull Catalog in Settings.';
}
$('workSkillSelect').addEventListener('change',()=>{
 const select=$('workSkillSelect');
 if(!selectedRole||!activeId||!select.value)return;
 select.disabled=true;
 send('selectRoleSkill',{roleId:selectedRole,skillId:select.value});
});
function renderRoleWork(){
  const role=roleData.roles.find(item=>item.id===selectedRole);
  if(!role)return;
  applyFocusedRoleLayout(role.id);
  renderBAWorkDashboard();
  if(role.id==='project-manager')renderPMDashboard();
  renderRoleSkillHeader(role.id);
  $('workTitle').textContent=visibleRoleLabel(role);
  // The BA landing dashboard already identifies its function through the Business Requirements heading.
  // Only hide this redundant role title; keep the other roles' headings intact.
  $('workTitle').classList.toggle('hidden',role.id==='business-analyst');
  $('workStage').textContent=role.stage;
  $('roleChecklistHeading').textContent=role.id==='business-analyst'?'Business Requirements':'Delivery checklist';
  $('roleChecklistHint').textContent=role.id==='business-analyst'?'Open the Business Requirements guide to continue.':'Open or create documents, then mark each item complete. Progress is stored locally in this project.';
  const selectedItem=roleData.readiness?.handoffs?.find(x=>x.roleId===role.id)?.items.find(x=>x.brId===selectedHandoffBrId&&x.status!=='blocked');
  if(selectedHandoffBrId&&!selectedItem)selectedHandoffBrId=null;
  if(selectedItem&&handoffOwnership.me&&!handoffOwnership.documents.some(d=>d.documentId==='handoff-'+selectedItem.id&&d.ownerId===handoffOwnership.me))selectedHandoffBrId=null;
  const selectedLedger=roleData.handoffProgress?.[role.id+'|'+selectedHandoffBrId];
  const progress=role.id==='business-analyst'?roleData.progress?.[role.id]||{}:selectedHandoffBrId==='project'?roleData.progress?.[role.id]||{}:selectedItem&&selectedLedger?.revision===selectedItem.brRevision?selectedLedger.tasks:{};
  const files=roleData.files?.[role.id]||{};
  if(role.id==='business-analyst'){
    const activeBrs=activeBusinessRequirements(),allSaved=activeBrs.length>0&&activeBrs.every(br=>br.draftSavedAt||br.approvedContent),allApproved=activeBrs.length>0&&activeBrs.every(br=>br.status==='approved');
    const durable=[baMappingComplete(),(discoveryData?.readiness?.filled||0)===12&&!discoveryDirty,baReviewCurrent()&&baReviewFinalized(),activeBrs.length>0,allSaved&&!activeBrs.some(br=>br.status==='draft'&&br.needsRefresh&&br.staleReason==='Discovery answers changed'),allApproved&&!activeBrs.some(br=>br.needsRefresh),baPublishedCurrent(),progress.review===true];
    const completed=durable.filter(Boolean).length,percent=Math.round(completed/durable.length*100);
    $('rolePercent').textContent=percent+'%';$('roleProgressFill').style.width=percent+'%';$('roleProgressText').textContent=completed+' of '+durable.length+' BA workflow stages completed';
    $('roleDocsReady').textContent=activeBrs.length?`${activeBrs.filter(br=>br.draftSavedAt||br.approvedContent).length} / ${activeBrs.length} Business Requirements`:'0 Business Requirements';$('roleRemaining').textContent=String(durable.length-completed);
    const labels=['Upload & map source','Complete 12 questions','Run AI Review','Generate Business Requirements documents','Preview and save all Business Requirements','Approve all Business Requirements','Publish approved Jira preview','Complete stakeholder review'];$('roleNext').textContent=labels[durable.findIndex(v=>!v)]||'Business Requirement flow completed';
  }else{
    const completed=role.tasks.filter(task=>progress[task.id]===true).length;const percent=Math.round(completed/role.tasks.length*100);
    $('rolePercent').textContent=percent+'%';$('roleProgressFill').style.width=percent+'%';$('roleProgressText').textContent=selectedItem?completed+' of '+role.tasks.length+' completed · '+(selectedItem.brId==='project'?'Project':selectedItem.brId+' r'+selectedItem.brRevision):'Select an assigned handoff to start';
    $('roleDocsReady').textContent=role.tasks.filter(t=>t.document&&files[t.id]).length+' / '+role.tasks.filter(t=>t.document).length;$('roleRemaining').textContent=String(role.tasks.length-completed);$('roleNext').textContent=selectedItem?role.tasks.find(t=>!progress[t.id])?.label||'All local activities completed':'Select a ready handoff';
  }
  const scopeInput=$('roleStepScope');if(scopeInput&&selectedRoleStepScope==='project'&&role.id==='software-developer'&&$('devJiraKey')?.value?.trim()){
    scopeInput.value=$('devJiraKey').value.trim().toUpperCase();
  }
  renderRoleStepFlow(role);renderProjectSdlcSummary();
  setupDeveloperFocusedLayout(role.id==='software-developer');
  renderRoleTimeline();renderHandoffs();renderDelivery();
  const project=projects.find(p=>p.id===activeId);
  $('architectBootstrap').classList.toggle('hidden',role.id!=='solution-architect');
  if(role.id==='solution-architect'){
    const picker=$('architectStackSelect');picker.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='Select a technology stack';picker.append(empty);
    for(const stack of techStacks){const option=document.createElement('option');option.value=stack.id;option.textContent=stack.name;picker.append(option);}
    const customOption=document.createElement('option');customOption.value='custom';customOption.textContent='Custom Stack (scan existing repository)';picker.append(customOption);
    picker.value=architectStackSelection(project);
    renderArchitectCustomPanel();
    // Restore all action buttons (including Save) after Reset or Save completes.
    // The previous implementation only recalculated Reset/Test/Approve and left
    // Save disabled by architectBegin() even after the operation had finished.
    syncArchitectStackButtons(project);
    // Preserve action feedback across dashboard refreshes; never silently erase a Save outcome.
    $('architectBootstrapStatus').textContent=architectLastMessage;
    const prepared=project?.techStackPrepared;
    const saved=!!(prepared&&prepared.stackId===picker.value&&prepared.stackId===project.techStackId&&prepared.companionId===(project.techStackCompanionId||''));
    $('architectStackSummary').textContent=picker.value==='custom'?'Scan and run the configured project Git checkout. The catalog skeleton and existing project files will not be overwritten.':prepared?.stackId&&prepared.stackId!==picker.value?'Prepared stack: '+prepared.stackId+'. Switching to '+picker.value+' will require confirmation and a clean Git checkout.':saved?(prepared.remotePushed?'Branch: '+prepared.branch+' · pushed to GitHub':'Repository prepared.'):project?.techStackId?'Save to prepare the project repository.':'Select a stack and save it to begin.';
    const tested=saved&&project?.techStackValidation?.status==='tested'&&project.techStackValidation.stackId===project.techStackId;
    const approved=tested&&project?.techStackApproval?.status==='approved'&&project.techStackApproval.stackId===project.techStackId;
    $('architectTestStack').classList.remove('hidden');
    $('architectApproveStack').classList.remove('hidden');
    renderArchitectRequirements(project);
    const badge=$('architectStackStatusBadge');badge.textContent=picker.value==='custom'?'Custom Stack':approved?'Approved':tested?'Tested':saved?'Saved':'Not configured';badge.dataset.state=approved?'approved':tested?'tested':saved?'saved':'pending';
    refreshArchitectStageClasses(project);
    updateArchitectServerControls(saved);
    updateArchitectFailureLogButtons();
    if(activeId)send('architectServerStatus',{requestId:++architectServerStatusRequest});
    renderArchitectCatalogStatus();
  }

  const root=$('taskList');root.replaceChildren();
  if(!activeId){const note=document.createElement('p');note.className='muted';note.textContent='Select a project to create documents and record completion. The items below describe the recommended workflow.';root.append(note);}
  if(role.id==='business-analyst'){
    const ready=discoveryData?.readiness||{filled:0,total:12,canReview:false};
    const card=document.createElement('div');card.className='discovery-entry-card';
    const info=document.createElement('div');info.className='discovery-entry-copy';
    const eyebrow=document.createElement('span');eyebrow.className='discovery-entry-label';eyebrow.textContent='BUSINESS REQUIREMENT';
    const heading=document.createElement('strong');heading.textContent='Create and approve Business Requirements';
    const note=document.createElement('p');note.className='muted';note.textContent=baPublishedCurrent()?'Jira is up to date.':'Continue the next required Business Requirements step.';
    info.append(eyebrow,heading,note);
    const side=document.createElement('div');side.className='discovery-entry-side';
    const badge=document.createElement('span');badge.className='pill'+(ready.canReview?' ready':'');badge.textContent=`${ready.filled||0} / ${ready.total||12} answered`;
    const open=document.createElement('button');open.type='button';open.textContent='Open Business Requirement';open.disabled=!activeId;open.addEventListener('click',()=>navigate('discovery'));
    side.append(badge,open);card.append(info,side);root.append(card);
  }
  const visibleTasks=role.id==='business-analyst'?role.tasks.filter(task=>!['discovery','requirements','stories'].includes(task.id)):role.tasks;
  for(const task of visibleTasks){
    const row=document.createElement('div');row.className='task-row'+(progress[task.id]?' done':'');
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='task-check';checkbox.checked=progress[task.id]===true;checkbox.disabled=!activeId;
    checkbox.setAttribute('aria-label','Complete: '+task.label);
    if(role.id!=='business-analyst'){
      const selectedOwned=!!selectedItem&&handoffOwnership.documents.some(d=>d.documentId==='handoff-'+selectedItem.id&&d.ownerId===handoffOwnership.me&&!!handoffOwnership.me);
      checkbox.disabled=!selectedOwned;checkbox.title=selectedOwned?'Update '+selectedItem.brId+' work':'Assign to Me and select Start Work';
    }
    checkbox.addEventListener('change',()=>send('toggleTask',{roleId:role.id,brId:role.id==='business-analyst'?null:selectedItem?.brId,brRevision:role.id==='business-analyst'?null:selectedItem?.brRevision,taskId:task.id,completed:checkbox.checked}));
    const info=document.createElement('div');info.className='task-info';
    const title=document.createElement('span');title.className='task-title';title.textContent=task.label;
    const hint=document.createElement('div');hint.className='task-note';hint.textContent=task.document?('documents/'+task.document):task.note||'Local checklist activity';
    info.append(title,hint);row.append(checkbox,info);
    if(task.document){const badge=document.createElement('span');badge.className='doc-badge'+(files[task.id]?' ready':'');badge.textContent=files[task.id]?'File ready':'Not created';row.append(badge);
      const button=document.createElement('button');button.className='secondary task-action';button.textContent=files[task.id]?'Open document':(task.sourceOnly?'View location':'Create document');button.disabled=!activeId;button.addEventListener('click',()=>send('openTaskDocument',{roleId:role.id,taskId:task.id}));row.append(button);}
    root.append(row);
  }
  // Share role-scoped, minimal progress metadata with the read-only My Work AI.
  // No document contents, credentials, other users' tasks or hidden workflow actions.
  if(view==='myWork')window.ATGVMyWorkAI?.update({
    projectId:activeId,roleId:role.id,roleName:visibleRoleLabel(role),
    progress:$('rolePercent')?.textContent||'',
    next:$('roleNext')?.textContent||'',
    tasks:(role.tasks||[]).map(task=>({title:task.label,done:progress[task.id]===true})),
    assigned:((role.id==='software-developer'||role.id==='ux-designer')&&Array.isArray(roleJiraItems)?roleJiraItems.filter(item=>item.mine):[]).map(item=>({key:item.key,status:item.status})),
    requirements:role.id==='business-analyst'?activeBusinessRequirements().map(item=>({id:item.id,status:item.status})):[]
  });
}
function renderUnifiedDocumentRepository(){
 const docs=unifiedRepository?.documents||[],summary=$('unifiedDocumentSummary'),root=$('unifiedDocumentTable'),proposals=$('unifiedProposalList');
 if(!root||!proposals)return;
 summary.textContent=`${docs.length} canonical artifacts · ${unifiedRepository.pendingProposals||0} AI proposals for review · ${unifiedRepository.pendingSync||0} changes awaiting eligible synchronization`;
 const rows=docs.map(doc=>{
  const action=document.createElement('button');action.type='button';action.className='secondary';
  action.textContent=doc.kind==='br'?'View approved BR':doc.kind==='design'?'Open design':doc.kind==='alias'?'Open Business Requirements':doc.status==='placeholder'?'Create / Open':'Open';
  action.addEventListener('click',()=>{
   if(doc.kind==='br'){send('previewApprovedBR',{brId:doc.id.split(':').at(-1)});return;}
   if(doc.kind==='design'){navigate('planning');return;}
   if(doc.kind==='alias'){navigate('discovery');return;}
   send('openTaskDocument',{roleId:doc.roleId,taskId:doc.taskId});
  });
  const actions=document.createElement('span');actions.className='stack';actions.append(action);
  if(doc.kind==='role'&&doc.status==='approved'){
   const revise=document.createElement('button');revise.className='secondary';revise.type='button';revise.textContent='New Draft Revision';
   revise.addEventListener('click',()=>send('unifiedBeginRevision',{roleId:doc.roleId,taskId:doc.taskId}));actions.append(revise);
  }
  if(doc.kind==='role'&&doc.status==='draft'){
   const approval=document.createElement('button');approval.className='secondary';approval.type='button';approval.textContent='Request Approval';approval.disabled=!['business-owner','product-owner','project-manager','solution-architect','qa-engineer','release-manager'].includes(selectedRole);
   approval.title='Requires an independent reviewer with a claimed role handoff.';
   approval.addEventListener('click',()=>send('unifiedApproveDocument',{roleId:doc.roleId,taskId:doc.taskId,reviewerRole:selectedRole,digest:doc.digest}));actions.append(approval);
  }
  return {...doc,action:actions,role:doc.roleId||doc.kind,source:(doc.sourceRefs||[]).map(x=>x.id+' r'+x.revision).join(', ')||'—',sync:doc.confluence?.state||'not-synced'};
 });
 ATGVDataTables.mount(root,rows,[{key:'title',label:'Document'},{key:'role',label:'Role / type'},{key:'status',label:'State'},{key:'source',label:'Approved BR evidence'},{key:'sync',label:'Confluence'},{key:'action',label:'Action',sortable:false,render:row=>row.action}],{label:'Unified SDLC project documents',pageSize:5,sortKey:'title'});
 proposals.replaceChildren();
 for(const p of unifiedRepository.proposals||[]){
  const line=document.createElement('div');line.className='doc-row';
  const doc=docs.find(x=>x.id===p.documentId),label=document.createElement('span');label.textContent=(doc?.title||p.documentId)+' · '+p.status+' · '+p.actor;
  line.append(label);
  const allowed=['business-owner','product-owner','project-manager','solution-architect','qa-engineer','release-manager'].includes(selectedRole);
  const inspect=document.createElement('button');inspect.type='button';inspect.className='secondary';inspect.textContent='View Full Draft';
  const draftPreview=document.createElement('pre');draftPreview.className='unified-proposal-preview hidden';draftPreview.dataset.unifiedPreviewId=p.id;
  draftPreview.setAttribute('aria-label','AI proposal document content for review');
  inspect.addEventListener('click',()=>{if(draftPreview.dataset.loaded==='yes'){draftPreview.classList.toggle('hidden');return;}send('unifiedProposalPreview',{proposalId:p.id});});
  line.append(inspect);
  if(p.status==='pending')for(const decision of ['approve','reject']){
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=decision==='approve'?'Review & Approve':'Reject';button.disabled=!allowed;
   button.title=!allowed?'Select an authorized reviewer role and claim its handoff.':'An independently owned reviewer handoff is required.';
   button.addEventListener('click',()=>send('unifiedProposalReview',{proposalId:p.id,roleId:selectedRole,decision}));line.append(button);
  }
  if(p.status==='review-approved'&&doc?.kind==='role'){
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Apply Reviewed Draft';button.addEventListener('click',()=>send('unifiedProposalApply',{proposalId:p.id,roleId:doc.roleId,taskId:doc.taskId}));line.append(button);
  }
  proposals.append(line,draftPreview);
 }
 if(!proposals.childNodes.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='No AI document proposals need review.';proposals.append(empty);}
 const inbox=$('unifiedGovernanceInbox');if(inbox){
  const pending=unifiedRepository.proposals||[];
  ATGVDataTables.mount(inbox,pending.map(p=>({...p,title:docs.find(x=>x.id===p.documentId)?.title||p.documentId,source:(p.sourceRefs||[]).map(r=>r.id+' r'+r.revision).join(', ')})),[
   {key:'title',label:'Document'},{key:'status',label:'Decision pending'},{key:'actor',label:'Proposer'},{key:'source',label:'Requirements evidence'},
   {key:'action',label:'Action',sortable:false,render:p=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Review in Repository';b.addEventListener('click',()=>navigate('documents'));return b;}}
  ],{label:'Unified governance inbox',pageSize:5,sortKey:'created'});
 }
}
function renderDocumentGroups(){
  const root=$('documentGroups');root.replaceChildren();
  if(unifiedRepository&&!unifiedRepository.error&&Array.isArray(unifiedRepository.documents)){
    root.classList.add('hidden');renderUnifiedDocumentRepository();return;
  }
  root.classList.remove('hidden');
  $('unifiedDocumentTable')?.replaceChildren();$('unifiedProposalList')?.replaceChildren();
  for(const role of roleData.roles){
    if(role.id==='business-analyst'){
      const section=document.createElement('section');section.className='doc-role';const heading=document.createElement('h2');heading.textContent='Business Analyst';section.append(heading);
      const row=document.createElement('div');row.className='doc-row';const name=document.createElement('span');name.textContent='Business Requirement workspace';
      const active=activeBusinessRequirements(),approved=active.filter(br=>br.status==='approved').length;const label=document.createElement('span');label.className='doc-badge'+(active.length?' ready':'');label.textContent=active.length?`${active.length} Business Requirements · ${approved} approved`:'12 questions + Business Requirements documents';
      const btn=document.createElement('button');btn.className='secondary';btn.textContent='Open Business Requirement';btn.disabled=!activeId;btn.addEventListener('click',()=>navigate('discovery'));row.append(name,label,btn);section.append(row);root.append(section);continue;
    }
    const section=document.createElement('section');section.className='doc-role';
    const heading=document.createElement('h2');heading.textContent=role.label;
    const count=document.createElement('small');count.textContent=role.tasks.filter(t=>t.document&&roleData.files?.[role.id]?.[t.id]).length+' / '+role.tasks.filter(t=>t.document).length+' files';heading.append(count);section.append(heading);
    for(const task of role.tasks.filter(t=>t.document)){
      const row=document.createElement('div');row.className='doc-row';const name=document.createElement('span');name.textContent=task.label;
      const ready=roleData.files?.[role.id]?.[task.id];const label=document.createElement('span');label.className='doc-badge'+(ready?' ready':'');label.textContent=ready?'Ready':'Not created';
      const btn=document.createElement('button');btn.className='secondary';btn.textContent=ready?'Open':'Create / Open';btn.disabled=!activeId;
      btn.addEventListener('click',()=>send('openTaskDocument',{roleId:role.id,taskId:task.id}));row.append(name,label,btn);section.append(row);
    }root.append(section);
  }
  if(brState?.brs?.some(br=>br.approvedContent)){
    const section=document.createElement('section');section.className='doc-role';
    const heading=document.createElement('h2');heading.textContent='Approved Business Requirements';section.append(heading);
    for(const br of brState.brs.filter(br=>br.approvedContent)){
      const row=document.createElement('div');row.className='doc-row';
      row.append(brElement('span','',br.id+' · '+br.approvedContent.title));
      row.append(brElement('span','doc-badge ready',br.status==='retired'?'Retired snapshot':'Approved snapshot'));
      const button=brElement('button','secondary','View approved Business Requirements');button.type='button';
      button.addEventListener('click',()=>send('previewApprovedBR',{brId:br.id}));row.append(button);section.append(row);
    }
    root.prepend(section);
  }
}
function renderKnowledgeState(summary){$('knowledgeDocs').textContent=String(summary.documents||0);$('knowledgeChunks').textContent=String(summary.chunks||0);$('knowledgeSync').disabled=!activeId;}
function renderLiveRemoteState(value){
 if(!value||value.projectId!==activeId)return;
 const node=$('knowledgeSyncStatus');if(!node)return;
 if(value.phase==='running'){node.textContent='Fetching current Jira and Confluence data automatically…';return;}
 if(value.phase==='offline'){node.textContent='Offline mode · cached data retained; live refresh is paused.';return;}
 const results=Object.entries(value.results||{}).map(([name,count])=>name+': '+count+' fetched');
 const errors=Object.entries(value.errors||{}).map(([name,message])=>name+': unavailable ('+String(message).slice(0,130)+')');
 node.textContent=[...results,...errors].join(' · ')||'Automatic Jira and Confluence refresh enabled; no connected sources found.';
 if(value.lastAttempt)node.textContent+=' · Checked '+new Date(value.lastAttempt).toLocaleString();
}
function roleUnsaved(){roleSettingsDirty=true;updateExtensionSettingBadges();$('saveRoleSettings').disabled=false;$('roleSettingsStatus').textContent='Unsaved changes';}
function renderRoleSettings(){
  const list=$('roleSettingsList');list.replaceChildren();
  const available=!!activeId&&!!roleSettings.revision;
  $('roleSettingsHint').textContent=available?'Enable roles, set their order, and expand to review skills or prerequisites.':'Open a project first to manage its SDLC roles.';
  $('addCustomRole').disabled=!available;
  $('saveRoleSettings').disabled=!available||!roleSettingsDirty;
  $('roleSettingsCount').textContent=(roleSettings.roles||[]).filter(x=>x.enabled).length+' enabled';
  const orderedRoles=roleSettings.roles||[];
  for(const role of orderedRoles){
    const card=document.createElement('div');card.className='role-config-card';
    const header=document.createElement('div');header.className='role-config-heading';
    const label=document.createElement('label');label.className='check-row';
    const check=document.createElement('input');check.type='checkbox';check.checked=role.enabled;check.disabled=!available;
    check.addEventListener('change',()=>{role.enabled=check.checked;roleUnsaved();$('roleSettingsCount').textContent=roleSettings.roles.filter(x=>x.enabled).length+' enabled';});
    const info=document.createElement('span');info.className='role-config-name';info.textContent=role.label;label.append(check,info);header.append(label);
    const type=document.createElement('span');type.className='pill';type.textContent=role.custom?'Custom':role.optional?'Optional':'Core';header.append(type);
    if(role.custom){const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Edit';edit.disabled=!available;edit.addEventListener('click',()=>openCustomRoleEditor(role));header.append(edit);}
    const ordering=document.createElement('label');ordering.className='role-order-label';ordering.textContent='Order';
    const orderInput=document.createElement('select');orderInput.setAttribute('aria-label','Order for '+role.label);
    const position=orderedRoles.findIndex(item=>item.id===role.id);
    for(let i=0;i<orderedRoles.length;i++){const option=document.createElement('option');option.value=String(i);option.textContent=String(i+1);orderInput.append(option);}orderInput.value=String(position);orderInput.disabled=!available;
    orderInput.addEventListener('change',()=>{const oldIndex=roleSettings.roles.findIndex(item=>item.id===role.id);const newIndex=Number(orderInput.value);roleSettings.roles.splice(oldIndex,1);roleSettings.roles.splice(newIndex,0,role);roleSettings.order=roleSettings.roles.map(item=>item.id);roleUnsaved();renderRoleSettings();});
    ordering.append(orderInput);header.append(ordering);
    card.append(header);
    const installedSkill=catalogState?.roleSkillDescriptions?.[role.id];
    const skill=document.createElement('details');skill.className='role-skill-details';const skillSummary=document.createElement('summary');skillSummary.textContent=installedSkill?'AI skill · roles/'+role.id+'/SKILL.md':'AI skill · Not in downloaded catalog';skill.append(skillSummary);
    const skillDescription=document.createElement('p');skillDescription.textContent=installedSkill||'No verified skill for this role in the installed SDLC catalog. Pull the catalog to check for updates.';skill.append(skillDescription);card.append(skill);
    const details=document.createElement('details');details.className='role-config-deps';
    const summary=document.createElement('summary');summary.textContent='Prerequisites · '+(role.dependsOn?.length||0);details.append(summary);
    const deps=document.createElement('div');deps.className='role-dependency-options';
    for(const candidate of roleSettings.roles.filter(r=>r.id!==role.id)){
      const option=document.createElement('label');option.className='check-row';
      const input=document.createElement('input');input.type='checkbox';input.checked=(role.dependsOn||[]).includes(candidate.id);input.disabled=!available;
      input.addEventListener('change',()=>{const existing=role.dependsOn||[];role.dependsOn=input.checked?[...existing,candidate.id]:existing.filter(id=>id!==candidate.id);summary.textContent='Prerequisites · '+role.dependsOn.length;roleUnsaved();});
      const text=document.createElement('span');text.textContent=candidate.label;option.append(input,text);deps.append(option);
    }
    details.append(deps);card.append(details);list.append(card);
  }
}
$('roleSettingsForm').addEventListener('submit',e=>{
  e.preventDefault();if(!activeId)return;
  const enabled=roleSettings.roles.filter(r=>r.enabled).map(r=>r.id);
  if(!enabled.length){$('roleSettingsStatus').textContent='Enable at least one role.';return;}
  const dependencies=Object.fromEntries(roleSettings.roles.map(r=>[r.id,r.dependsOn||[]]));
  $('saveRoleSettings').disabled=true;send('saveRoleSettings',{enabled,dependencies,order:roleSettings.roles.map(role=>role.id),revision:roleSettings.revision});
});
function openCustomRoleEditor(role=null){
  editingCustomRole=role;
  $('customRoleEditor').classList.remove('hidden');
  $('customRoleHeading').textContent=role?'Edit SDLC Role':'Create SDLC Role';
  $('customRoleName').value=role?.label||'';
  $('customRoleStage').value=role?.stage||'Delivery';
  $('customRoleDescription').value=role?.description||'';
  $('customRoleDocuments').value=(role?.tasks||[]).map(x=>x.label).join('\n');
  $('deleteCustomRole').classList.toggle('hidden',!role);
  $('customRoleStatus').textContent='';
  $('customRoleName').focus();
}
$('addCustomRole').addEventListener('click',()=>{if(roleSettingsDirty){$('roleSettingsStatus').textContent='Save role settings first.';return;}openCustomRoleEditor();});
$('cancelCustomRole').addEventListener('click',()=>{$('customRoleEditor').classList.add('hidden');editingCustomRole=null;});
$('customRoleEditor').addEventListener('submit',e=>{
  e.preventDefault();if(roleSettingsDirty){$('customRoleStatus').textContent='Save role settings first.';return;}
  const fields={label:read('customRoleName'),stage:read('customRoleStage'),description:read('customRoleDescription'),documents:$('customRoleDocuments').value};
  if(!fields.label||!fields.stage||!fields.description||!fields.documents.trim()){$('customRoleStatus').textContent='Complete all fields.';return;}
  $('saveCustomRole').disabled=true;
  send(editingCustomRole?'updateCustomRole':'createCustomRole',{fields,roleId:editingCustomRole?.id,definitionRevision:editingCustomRole?.definitionRevision});
});
$('deleteCustomRole').addEventListener('click',()=>{if(!editingCustomRole)return;if(roleSettingsDirty){$('customRoleStatus').textContent='Save role settings first.';return;}$('deleteCustomRole').disabled=true;send('deleteCustomRole',{roleId:editingCustomRole.id,definitionRevision:editingCustomRole.definitionRevision});});
function timelineEndFromDuration(start,days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isInteger(days)||days<1||days>3651)return '';
  const parsed=new Date(start+'T00:00:00Z');if(Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==start)return '';
  parsed.setUTCDate(parsed.getUTCDate()+days-1);
  return parsed.toISOString().slice(0,10);
}
function timelineDuration(start,end){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return 0;
  const first=Date.parse(start+'T00:00:00Z'),last=Date.parse(end+'T00:00:00Z');
  const days=Math.round((last-first)/86400000)+1;
  return Number.isFinite(days)&&days>=1&&days<=3651?days:0;
}
function timelineFor(roleId=selectedRole){return (timelineData.tasks||[]).find(t=>t.id===roleId)||null;}
function populateRoleTimelineRoles(){
  const select=$('roleTimelineRole');if(!select)return;
  const current=select.value||selectedRole;
  select.replaceChildren();
  for(const role of visibleRoles()){const option=document.createElement('option');option.value=role.id;option.textContent=visibleRoleLabel(role);select.append(option);}
  select.value=visibleRoles().some(r=>r.id===current)?current:visibleRoles().some(r=>r.id===selectedRole)?selectedRole:(visibleRoles()[0]?.id||'');
}
function fillTimelineForm(roleId=selectedRole){
  populateRoleTimelineRoles();
  const select=$('roleTimelineRole');if(select&&roleId)select.value=roleId;
  const task=timelineFor(roleId);
  $('roleTimelineStart').value=task?.start||'';
  $('roleTimelineEnd').value=task?.end||'';
  $('roleTimelineDuration').value=String(timelineDuration(task?.start||'',task?.end||'')||7);
  $('roleTimelineProgress').value=String(task?.progress??0);
  $('roleTimelineSave').disabled=!task;
}
function openTimelineModal(roleId=selectedRole){
  if(!activeId)return;
  fillTimelineForm(roleId);$('timelineModalStatus').textContent='';
  $('timelineModal').classList.remove('hidden');
  $('timelineModal').setAttribute('aria-hidden','false');
}
function closeTimelineModal(force=false){
  if(roleTimelineDirty&&!force&&!confirm('Discard unsaved timeline changes?'))return;
  roleTimelineDirty=false;$('roleTimelineSave').disabled=true;
  $('timelineModal').classList.add('hidden');
  $('timelineModal').setAttribute('aria-hidden','true');
}
function renderRoleTimeline(){
  const role=roleData.roles.find(r=>r.id===selectedRole),task=timelineFor(selectedRole);
  $('openRoleTimelineModal').disabled=!activeId||!role;
  $('openPlanningTimelineModal').disabled=!activeId||!(roleData.roles||[]).length;
  $('settingsRoleScheduleState').textContent=activeId?`${(roleData.roles||[]).length} role schedules available · edit all dates together.`:'Select a project to manage role dates.';
  $('roleTimelineSummaryStart').textContent=task?.start||'—';
  $('roleTimelineSummaryEnd').textContent=task?.end||'—';
  $('roleTimelineSummaryProgress').textContent=((task?.progress??0))+'%';
  if(roleTimelineDirty)return;
  fillTimelineForm(selectedRole);
}
$('openRoleTimelineModal').addEventListener('click',()=>openTimelineModal(selectedRole));

$('closeTimelineModal').addEventListener('click',()=>closeTimelineModal());
$('timelineModalCancel').addEventListener('click',()=>closeTimelineModal());
$('timelineModal').addEventListener('click',event=>{if(event.target===event.currentTarget)closeTimelineModal();});
$('roleTimelineRole').addEventListener('change',event=>{if(roleTimelineDirty&&!confirm('Discard unsaved timeline changes for this role?')){event.target.value=selectedRole;return;}selectedRole=event.target.value;renderSidebarRole();renderRoleWork();roleTimelineDirty=false;$('roleTimelineStatus').textContent='';$('timelineModalStatus').textContent='';fillTimelineForm(selectedRole);});
function markRoleTimelineDirty(){
  roleTimelineDirty=true;$('roleTimelineSave').disabled=false;$('roleTimelineStatus').textContent='Unsaved timeline changes';$('timelineModalStatus').textContent='Unsaved changes';
}
for(const id of ['roleTimelineStart','roleTimelineDuration']){
  $(id).addEventListener('input',()=>{
    const duration=Number(read('roleTimelineDuration'));
    const end=timelineEndFromDuration(read('roleTimelineStart'),duration);
    if(end)$('roleTimelineEnd').value=end;
    markRoleTimelineDirty();
  });
}
$('roleTimelineEnd').addEventListener('input',()=>{
  const duration=timelineDuration(read('roleTimelineStart'),read('roleTimelineEnd'));
  $('roleTimelineDuration').value=duration?String(duration):'';
  markRoleTimelineDirty();
});
$('roleTimelineProgress').addEventListener('input',markRoleTimelineDirty);
$('roleTimelineForm').addEventListener('submit',e=>{
  e.preventDefault();const roleId=read('roleTimelineRole')||selectedRole;if(!activeId||!roleId||!timelineData.revision)return;
  const start=read('roleTimelineStart'),end=read('roleTimelineEnd'),progress=Number(read('roleTimelineProgress'));
  if(!start||!end||end<start||timelineDuration(start,end)!==Number(read('roleTimelineDuration'))||!Number.isInteger(progress)||progress<0||progress>100){$('roleTimelineStatus').textContent='Check dates, duration and progress (0–100).';$('timelineModalStatus').textContent='Check dates, duration and progress (0–100).';return;}
  $('roleTimelineSave').disabled=true;$('timelineModalStatus').textContent='Saving timeline…';
  send('saveRoleTimeline',{roleId,start,end,progress,revision:timelineData.revision});
});
function openBulkTimelineModal(){
  if(!activeId||!timelineData.revision||!(roleData.roles||[]).length)return;
  const body=$('bulkTimelineRows');body.replaceChildren();
  for(const role of roleData.roles){
    const task=timelineFor(role.id);
    if(!task)continue;
    const row=document.createElement('tr');row.dataset.roleId=role.id;
    const name=document.createElement('th');name.scope='row';name.textContent=role.label;row.append(name);
    const inputs={};
    for(const [key,type,value] of [
      ['start','date',task.start],['duration','number',String(timelineDuration(task.start,task.end)||7)],
      ['end','date',task.end],['progress','number',String(task.progress||0)]
    ]){
      const cell=document.createElement('td'),input=document.createElement('input');
      input.type=type;input.value=value;input.dataset.field=key;
      input.setAttribute('aria-label',role.label+' '+key);
      if(key==='duration'){input.min='1';input.max='3651';input.step='1';}
      if(key==='progress'){input.min='0';input.max='100';input.step='1';}
      cell.append(input);row.append(cell);inputs[key]=input;
    }
    for(const key of ['start','duration'])inputs[key].addEventListener('input',()=>{
      const end=timelineEndFromDuration(inputs.start.value,Number(inputs.duration.value));
      if(end)inputs.end.value=end;
      bulkTimelineDirty=true;$('bulkTimelineStatus').textContent='Unsaved timeline changes';
    });
    inputs.end.addEventListener('input',()=>{
      const duration=timelineDuration(inputs.start.value,inputs.end.value);
      inputs.duration.value=duration?String(duration):'';
      bulkTimelineDirty=true;$('bulkTimelineStatus').textContent='Unsaved timeline changes';
    });
    inputs.progress.addEventListener('input',()=>{bulkTimelineDirty=true;$('bulkTimelineStatus').textContent='Unsaved timeline changes';});
    body.append(row);
  }
  bulkTimelineDirty=false;bulkTimelineSaving=false;$('bulkTimelineSave').disabled=false;
  $('bulkTimelineStatus').textContent='Changes to every role are saved together.';
  $('bulkTimelineModal').classList.remove('hidden');$('bulkTimelineModal').setAttribute('aria-hidden','false');
}
function closeBulkTimelineModal(force=false){
  if(bulkTimelineSaving&&!force)return;
  if(bulkTimelineDirty&&!force&&!confirm('Discard unsaved role timeline changes?'))return;
  bulkTimelineDirty=false;bulkTimelineSaving=false;
  $('bulkTimelineModal').classList.add('hidden');$('bulkTimelineModal').setAttribute('aria-hidden','true');
}
$('openPlanningTimelineModal').addEventListener('click',openBulkTimelineModal);
$('bulkTimelineClose').addEventListener('click',()=>closeBulkTimelineModal());
$('bulkTimelineCancel').addEventListener('click',()=>closeBulkTimelineModal());
$('bulkTimelineModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBulkTimelineModal();});
$('bulkTimelineSave').addEventListener('click',()=>{
  if(!activeId||!timelineData.revision||bulkTimelineSaving)return;
  const updates=[];
  for(const row of $('bulkTimelineRows').querySelectorAll('tr[data-role-id]')){
    const value=field=>row.querySelector('[data-field="'+field+'"]').value.trim();
    const start=value('start'),end=value('end'),duration=Number(value('duration')),progress=Number(value('progress'));
    if(!start||!end||timelineDuration(start,end)!==duration||!Number.isInteger(progress)||progress<0||progress>100||!value('progress')){
      $('bulkTimelineStatus').textContent='Check dates, duration and progress for '+roleData.roles.find(role=>role.id===row.dataset.roleId)?.label+'.';return;
    }
    updates.push({roleId:row.dataset.roleId,start,end,progress});
  }
  if(updates.length!==roleData.roles.length){$('bulkTimelineStatus').textContent='Reload the workspace to update all enabled roles.';return;}
  bulkTimelineSaving=true;$('bulkTimelineSave').disabled=true;$('bulkTimelineStatus').textContent='Saving all role dates…';
  send('saveBulkRoleTimelines',{updates,revision:timelineData.revision});
});
function renderGantt(timeline){
  const root=$('ganttChart');if(!$('overviewGanttDetails').open)return;root.replaceChildren();$('ganttFallback').replaceChildren();
  const projectTasks=pmForecast&&!pmForecast.error&&!pmForecast.provisional&&jiraInventoryLoaded&&!jiraInventoryTruncated?pmForecast.tasks.map(row=>({id:row.key,name:row.key+' · '+row.summary,start:row.start,end:row.end,progress:row.progress,dependencies:row.dependencies.filter(dep=>pmForecast.tasks.some(t=>t.key===dep)).join(',')})):[];
  if(projectTasks.length)timeline={tasks:projectTasks};
  if(typeof Gantt==='function' && timeline?.tasks?.length){
    try{new Gantt('#ganttChart',timeline.tasks,{view_mode:'Week',readonly:true,bar_height:18,padding:10,column_width:64});return;}catch(e){console.warn('Frappe Gantt rendering error',e);}
  }
  const info=document.createElement('p');info.textContent=timeline?.tasks?.length?'Schedule table view (interactive Gantt unavailable).':'No role schedules are available. Configure role dates in Settings.';$('ganttFallback').append(info);
  const table=document.createElement('table');const head=document.createElement('tr');
  for(const text of ['Stage','Start','End','Progress']){const th=document.createElement('th');th.textContent=text;head.append(th);}table.append(head);
  for(const t of timeline?.tasks||[]){const row=document.createElement('tr');for(const v of [t.name,t.start,t.end,t.progress+'%']){const td=document.createElement('td');td.textContent=v;row.append(td);}table.append(row);}$('ganttFallback').append(table);
}
$('overviewGanttDetails').addEventListener('toggle',()=>{if($('overviewGanttDetails').open)renderGantt(timelineData);});
const designKinds=[['design','Product & UI Design'],['ux','User Experience Flows'],['mockup','Screen Mockups'],['architecture','Architecture Diagram'],['api','API Design'],['database','Database Design']];
let pendingArchitectureImport=null,designEditMode=null,designPreviewZoom=1,designActiveScreen=0,designListScrollTop=0;
const designExpandedKinds=new Set();
const designOutputs={design:['design-specification.md','design-tokens.json','components.json'],ux:['user-flows.drawio','user-flows.mmd','user-flows.json'],mockup:['screen-mockups.html','screen-inventory.json'],prototype:['interactive-prototype.html','prototype-screens.json','prototype-navigation.json'],architecture:['architecture.drawio','architecture.json'],api:['openapi.yaml','openapi.json'],database:['schema.sql','database-erd.drawio','database-erd.json']};
function designCurrentItem(){return designSelected?(designState?.designs?.[designSelected.kind]||[]).find(x=>x.id===designSelected.id):null;}
function updateDesignPreviewActions(item,readonly){
 const editAllowed=!readonly&&item.status==='draft';
 const saving=editAllowed&&designDirty;
 $('designSaveDraft').classList.toggle('hidden',!saving);
 $('designApprove').classList.toggle('hidden',!editAllowed||saving);
 $('designExport').classList.toggle('hidden',item.status!=='approved');
}
function designReviewControls(item,readonly){
 updateDesignPreviewActions(item,readonly);
 const stale=!!(approvedDesignHash&&item.sourceHash!==approvedDesignHash),unsynced=!!item.manuallyEdited;
 $('designApprove').disabled=designBusy||designDirty||readonly||item.status!=='draft'||stale||unsynced;
 $('designExport').disabled=designBusy||designDirty||item.status!=='approved'||stale||unsynced;
 $('designReviewNotice').textContent=stale?'Approved Business Requirements changed. Regenerate the design before approval or export.':unsynced?'The Markdown was edited separately. Structured artifacts are out of sync; save a reconciled structured JSON draft.':item.status==='approved'?'Approved · read-only. Export available.':'';
}
function renderApiDesignPreview(root,design){
 const api=globalThis.ATGVApiSimulator;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
 const endpoints=design?.endpoints||[];
 const hero=el('div','atgv-api-hero');
 const eyebrow=el('div','atgv-api-eyebrow','OPENAPI 3.1 · CONTRACT WORKBENCH');
 const heading=el('h3','atgv-api-hero-title','API Workbench');
 const description=el('p','atgv-api-hero-summary','Explore endpoints and simulate request/response scenarios.');
 const badges=el('div','atgv-api-hero-badges');
 for(const b of [endpoints.length+' operations'])badges.append(el('span','atgv-api-hero-badge',b));
 hero.append(eyebrow,heading,description,badges);root.append(hero);
 const notice=el('div','atgv-api-safety-notice');notice.append(el('strong','','Offline simulation · no HTTP requests are sent'),el('span','','Responses are examples, not results from a live service.'));root.append(notice);
 const methods={GET:0,POST:0,PUT:0,PATCH:0,DELETE:0};for(const e of endpoints)if(Object.hasOwn(methods,e.method))methods[e.method]++;
 const filterBar=el('div','atgv-api-filterbar');filterBar.append(el('span','atgv-api-filter-title','Operations'));
 const filters=[['ALL',endpoints.length],...Object.entries(methods).filter(x=>x[1])];let activeMethod='ALL';const entries=[];
 const showFilter=()=>{for(const entry of entries)entry.hidden=activeMethod!=='ALL'&&entry.dataset.method!==activeMethod;for(const b of filterBar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.method===activeMethod));};
 for(const [method,count] of filters){const b=el('button','atgv-api-filter',method+' '+count);b.type='button';b.dataset.method=method;b.addEventListener('click',()=>{activeMethod=method;showFilter()});filterBar.append(b);}
 root.append(filterBar);
 for(let i=0;i<endpoints.length;i++){
  const endpoint=endpoints[i],method=String(endpoint.method||'GET').toUpperCase();
  const entry=el('details','atgv-api-operation atgv-api-method-'+method.toLowerCase());entry.dataset.method=method;entry.open=i===0;
  const summary=el('summary','atgv-api-operation-head');const methodBadge=el('span','atgv-api-method',method),route=el('code','atgv-api-route',endpoint.path),label=el('span','atgv-api-operation-label',endpoint.operation||'Proposed operation'),arrow=el('span','atgv-api-chevron','⌄');summary.append(methodBadge,route,label,arrow);entry.append(summary);
  const body=el('div','atgv-api-operation-body');
  const meta=el('div','atgv-api-operation-meta');const auth=el('div','');auth.append(el('strong','','Authorization'),el('span','',endpoint.authorization||'Not specified'));const lifecycle=el('div','');lifecycle.append(el('strong','','Implementation'),el('span','','Proposed · not deployed'));meta.append(auth,lifecycle);body.append(meta);
  const workbench=el('div','atgv-api-workbench');const form=el('div','atgv-api-request-panel');form.append(el('h4','','Request builder'));
  const params=[...String(endpoint.path||'').matchAll(/\{([^{}]+)\}/g)].map(x=>x[1]);const paramInputs={};
  for(const name of params){const field=el('label','atgv-api-field');field.append(el('span','',name+' · path parameter'));const input=el('input','atgv-api-input');input.type='text';input.placeholder='Enter '+name;input.setAttribute('aria-label','Path parameter '+name);input.autocomplete='off';field.append(input);form.append(field);paramInputs[name]=input;}
  const hasBody=!['GET','DELETE'].includes(method);
  let editor=null;
  if(hasBody){const field=el('label','atgv-api-field');field.append(el('span','','Request body · JSON'));editor=el('textarea','atgv-api-textarea');editor.spellcheck=false;editor.setAttribute('aria-label',method+' '+endpoint.path+' request JSON');editor.value=api?.initialRequest(endpoint)||'{}';field.append(editor);form.append(field);if(!endpoint.requestSchema)form.append(el('div','atgv-api-hint','Request schema not defined. JSON syntax is checked, but the full API contract is unverified.'));}
  else form.append(el('div','atgv-api-hint','No request body is required for this method in the simulator.'));
  const scenarioField=el('label','atgv-api-field');scenarioField.append(el('span','','Response scenario'));const scenario=el('select','atgv-api-input');scenario.setAttribute('aria-label','Simulation response scenario');for(const [value,text] of [['success','Success (contract example)'],['unauthorized','401 · Unauthorized'],['forbidden','403 · Forbidden'],['notFound','404 · Not Found'],['conflict','409 · Conflict'],['validation','422 · Validation error'],['server','500 · Server error']]){const opt=el('option','',text);opt.value=value;scenario.append(opt);}scenarioField.append(scenario);form.append(scenarioField);
  const actions=el('div','atgv-api-test-actions');const execute=el('button','atgv-api-execute','▶ Simulate Request');execute.type='button';const reset=el('button','atgv-api-reset','Reset');reset.type='button';actions.append(execute,reset);form.append(actions);
  const responsePanel=el('div','atgv-api-response-panel');responsePanel.append(el('h4','','Response preview'));const result=el('div','atgv-api-result atgv-api-result-empty');result.setAttribute('role','status');result.setAttribute('aria-live','polite');result.append(el('span','atgv-api-empty-symbol','{ }'),el('span','','Run a simulation to view the response status, headers and JSON body.'));responsePanel.append(result);
  const renderResult=(r)=>{result.replaceChildren();result.className='atgv-api-result';result.classList.add(r.status>=400?'atgv-api-result-failed':'atgv-api-result-success');const statusRow=el('div','atgv-api-response-status');statusRow.append(el('span','atgv-api-status-badge','HTTP '+r.status+' '+r.label),el('span','atgv-api-local-badge','LOCAL SIMULATION'));result.append(statusRow);const pathLabel=el('div','atgv-api-response-path',method+' '+r.requestPath);result.append(pathLabel);result.append(el('div','atgv-api-response-subtitle','Headers'));result.append(el('pre','atgv-api-code',Object.keys(r.headers).length?Object.entries(r.headers).map(([k,v])=>k+': '+v).join('\n'):'—'));result.append(el('div','atgv-api-response-subtitle','Response body'));result.append(el('pre','atgv-api-code',r.body===null?'(empty response)':JSON.stringify(r.body,null,2)));if(!r.contract&&r.status<400&&r.status!==204)result.append(el('p','atgv-api-contract-warning','No response JSON schema was provided in this draft; this example is illustrative only.'));};
  const run=()=>{if(!api){result.textContent='Offline simulator is unavailable. Reload the ATGV workspace.';return;}const fields=Object.fromEntries(Object.entries(paramInputs).map(([k,v])=>[k,v.value]));renderResult(api.simulate(endpoint,{params:fields,requestText:editor?.value,scenario:scenario.value}));};
  execute.addEventListener('click',run);reset.addEventListener('click',()=>{for(const input of Object.values(paramInputs))input.value='';if(editor)editor.value=api?.initialRequest(endpoint)||'{}';scenario.value='success';result.className='atgv-api-result atgv-api-result-empty';result.replaceChildren(el('span','','Inputs reset. Select a scenario and run the simulation.'));});
  workbench.append(form,responsePanel);body.append(workbench);entry.append(body);root.append(entry);entries.push(entry);
 }
 showFilter();
}
function renderDesignTechnical(kind,design){
 const root=$('designTechnicalPreview');root.replaceChildren();root.classList.toggle('hidden',!['api','database','ux'].includes(kind));root.classList.toggle('atgv-api-preview',kind==='api');
 if(kind==='api')renderApiDesignPreview(root,design);
 if(kind==='database'){
  
  for(const e of design?.entities||[]){const entry=document.createElement('article');entry.className='design-technical-row';const header=document.createElement('strong');header.textContent=e.name;entry.append(header);const table=document.createElement('table');const head=document.createElement('tr');for(const col of ['Column','Type','Constraints']){const th=document.createElement('th');th.textContent=col;head.append(th);}table.append(head);for(const f of e.fields||[]){const tr=document.createElement('tr');for(const value of [f.name,f.type,[f.key?'Primary key':'',f.required?'Required':''].filter(Boolean).join(', ')||'—']){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}entry.append(table);for(const rel of e.relationships||[]){const r=document.createElement('small');r.textContent=typeof rel==='string'?rel:[rel.field,rel.target,rel.targetField,rel.cardinality].filter(Boolean).join(' → ');entry.append(r);}root.append(entry);}
 }
 if(kind==='ux'){
  for(const f of design?.flows||[]){const line=document.createElement('div');line.className='design-technical-row';line.textContent=f;root.append(line);}
 }
}
function renderDesignDeliverables(kind){
 const root=$('designDeliverableList');root.replaceChildren();const heading=document.createElement('strong');heading.textContent='Expected export files';root.append(heading);
 for(const file of [...(designOutputs[kind]||[]),'design-specification.md','design-specification.json','manifest.json']){if(file==='design-specification.md'&&(designOutputs[kind]||[]).includes(file))continue;const chip=document.createElement('span');chip.className='design-artifact-chip';chip.textContent=file;root.append(chip);}
}

function designProcessSnapshot(kind,last){
 const live=designProcessState[kind];if(live)return live;
 if(!last)return {percent:0,message:'Not started',state:'idle'};
 if(approvedDesignHash&&last.sourceHash!==approvedDesignHash)return {percent:0,message:'Business Requirements changed · regenerate required',state:'warning'};
 if(last.status==='approved')return {percent:100,message:'Approved and ready for artifact export',state:'success'};
 return {percent:90,message:'Draft generated · review and approval required',state:'draft'};
}
function setDesignProcess(kind,percent,message,state='running'){
 if(!kind)return;
 const safe=Math.max(0,Math.min(100,Number.isFinite(Number(percent))?Number(percent):0));
 designProcessState[kind]={percent:safe,message:String(message||''),state};
}
function clearDesignProcess(kind){if(kind)delete designProcessState[kind];}
function syncDesignProcessFromState(kind){
 if(!kind)return;const last=designState?.designs?.[kind]?.at(-1);
 if(!last){clearDesignProcess(kind);return;}
 if(approvedDesignHash&&last.sourceHash!==approvedDesignHash)setDesignProcess(kind,0,'Business Requirements changed · regenerate required','warning');
 else if(last.status==='approved')setDesignProcess(kind,100,'Approved and ready for artifact export','success');
 else setDesignProcess(kind,90,'Draft generated · review and approval required','draft');
}
function renderDesignMilestones(processes){
 const root=$('designMilestones');if(!root)return;
 root.replaceChildren();
 // Independent designs may complete out of order. Never paint unfinished links as completed.
 const completePrefix=processes.findIndex(p=>p.state!=='success');
 const connected=completePrefix<0?processes.length:completePrefix;
 root.style.setProperty('--milestone-width',(connected>1?((connected-1)/processes.length)*100:0)+'%');
 for(const [[kind,label],process] of designKinds.map((item,i)=>[item,processes[i]])){
  const button=document.createElement('button');button.type='button';button.className='atgv-milestone design-milestone';
  const state=process.state==='success'?'success':process.state==='error'?'failure':process.state==='warning'?'warning':process.state==='draft'?'warning':'pending';
  button.dataset.status=state;button.title=label+' · '+process.message;
  button.setAttribute('aria-label',label+': '+process.message+' · show design');
  button.disabled=designDirty||designBusy;
  const circle=document.createElement('span');circle.className='milestone-circle';circle.setAttribute('aria-hidden','true');
  const number=document.createElement('span');number.className='milestone-number';number.textContent=String(designKinds.findIndex(([k])=>k===kind)+1);
  const tick=document.createElement('span');tick.className='milestone-tick';tick.textContent='✓';circle.append(number,tick);
  const name=document.createElement('span');name.className='milestone-label';name.textContent=label;
  button.append(circle,name);
  button.addEventListener('click',()=>{
   if(designDirty||designBusy)return;
   // Reuse the existing accordion and its action buttons. No duplicate Generate route.
   designExpandedKinds.clear();designExpandedKinds.add(kind);
   if(!$('designPreview').classList.contains('hidden')){
    $('designPreview').classList.add('hidden');$('planningView').classList.remove('design-preview-open');designSelected=null;
   }
   renderDesignCards();
   requestAnimationFrame(()=>document.querySelector('#designCards [data-design-kind="'+kind+'"]')?.scrollIntoView({block:'nearest'}));
  });
  root.append(button);
 }
}
function renderDesignWorkspaceProgress(){
 const total=designKinds.length;
 const processes=designKinds.map(([kind])=>designProcessSnapshot(kind,designState?.designs?.[kind]?.at(-1)));
 const percent=Math.round(processes.reduce((sum,p)=>sum+p.percent,0)/total);
 const active=designBusyKind&&designProcessState[designBusyKind]?.state==='running'?designProcessState[designBusyKind]:null;
 const completed=processes.filter(p=>p.state==='success').length;
 const drafts=processes.filter(p=>p.state==='draft').length;
 const warnings=processes.filter(p=>p.state==='warning'||p.state==='error').length;
 const root=$('designWorkspaceProgress');root.setAttribute('aria-label',percent+'% overall design process completion');renderDesignMilestones(processes);
 root.classList.toggle('has-warning',warnings>0);root.classList.toggle('is-complete',completed===total);
 $('designWorkspaceProgressFill').style.width=percent+'%';
 const generated=processes.filter(p=>p.percent>0).length;
 const synced=(unifiedRepository?.documents||[]).filter(d=>d.kind==='design'&&d.confluence?.state==='synced').length;
 $('designWorkspaceProgressText').textContent=`${generated} of ${total} generated · ${completed} approved · ${synced} synced${drafts?' · '+drafts+' awaiting review':''}${warnings?' · '+warnings+' need attention':''} · ${percent}% draft preparation`;
 if(active)$('designStatus').textContent=designKinds.find(([kind])=>kind===designBusyKind)?.[1]+': '+active.message;
}
function deleteDesign(kind,item){
 if(designBusy||designDirty||!activeId||!item)return;
 designBusy=true;renderDesignCards();$('designStatus').textContent='Confirm deletion of '+(item.design?.title||kind)+'…';
 send('designDelete',{kind,proposalId:item.id,revision:designState.revision});
}
function openMockupBrowser(kind,item){
 if(kind!=='mockup'||designDirty||!item)return;
 $('designStatus').textContent='Opening the complete clickable Screen Mockups website in your external browser…';
 send('designOpenMockupBrowser',{kind,proposalId:item.id});
}
function setDesignPreviewZoom(value){
 designPreviewZoom=Math.max(.4,Math.min(3,Math.round(value*100)/100));
 const svg=$('designArchitecturePreview').querySelector('svg');if(svg)svg.style.width=Math.round(designPreviewZoom*100)+'%';
 $('designPreviewZoomValue').textContent=Math.round(designPreviewZoom*100)+'%';
 $('designPreviewZoomOut').disabled=designPreviewZoom<=.4;
 $('designPreviewZoomIn').disabled=designPreviewZoom>=3;
}
$('designPreviewZoomIn').addEventListener('click',()=>setDesignPreviewZoom(designPreviewZoom*1.25));
$('designPreviewZoomOut').addEventListener('click',()=>setDesignPreviewZoom(designPreviewZoom/1.25));
$('designPreviewZoomFit').addEventListener('click',()=>{setDesignPreviewZoom(1);$('designArchitecturePreview').scrollTo({left:0,top:0,behavior:'smooth'});});
$('designOpenMockupBrowser').addEventListener('click',()=>{const item=designCurrentItem();if(item)openMockupBrowser(designSelected.kind,item);});
function renderBlueprint(){
 const button=$('blueprintGenerate'),label=$('blueprintStatus'),approve=$('blueprintApprovePlan'),details=$('blueprintPlanDetails'),preview=$('blueprintPlanPreview');
 if(!button||!label||!approve||!details||!preview)return;
 const current=blueprintAssessment;
 const plan=blueprintRegistry?.plans?.at(-1);
 if(!current?.ready){label.textContent=current?.reason||'Approve a Business Requirement to prepare your SDLC blueprint.';button.disabled=true;button.textContent='Generate / Update All Artifacts';}
 else{
  const create=(current.plan?.action==='create'||current.plan?.action==='regenerate')?1:0;
  const count=create+(current.designs||[]).length;
  const blocked=(current.skipped||[]).filter(x=>/manual|unverified|retired/i.test(x.reason)).length+(current.plan?.action==='manual-review'?1:0);
  const ids=(current.changedBrIds||[]).join(', ');
  label.textContent=(count?count+' artifact draft(s) need generation.':'No outdated artifact drafts detected.')+(ids?' Updated BRs: '+ids+'.':'')+(blocked?' '+blocked+' require manual reconciliation.':'')+' Approved artifacts are never replaced automatically.';
  button.textContent=count?'Generate / Update '+count+' Artifact Draft(s)':'All Artifacts Current';
  button.disabled=!count||blueprintBusy||designBusy||designDirty;
 }
 details.classList.toggle('hidden',!plan);
 approve.classList.toggle('hidden',!plan||plan.status!=='draft');
 approve.disabled=!plan||plan.status!=='draft'||plan.sourceHash!==current?.approvedHash||blueprintBusy;
 preview.replaceChildren();
 if(plan){
   const header=document.createElement('p');header.textContent='Revision '+plan.number+' · '+plan.status.toUpperCase()+' · BR revision binding '+plan.sourceHash.slice(0,12);preview.append(header);
   const content=document.createElement('pre');content.textContent=plan.markdown||'No plan content.';preview.append(content);
 }
}
$('blueprintGenerate').addEventListener('click',()=>{
 if(!blueprintAssessment?.ready||blueprintBusy||designBusy||designDirty)return;
 blueprintBusy=true;designBatchPending=true;renderBlueprint();
 $('blueprintProgress').textContent='Preparing SDLC Blueprint generation request…';
 send('blueprintGenerate');
});
$('blueprintApprovePlan').addEventListener('click',()=>{
 const latest=blueprintRegistry?.plans?.at(-1);
 if(!latest||latest.status!=='draft'||blueprintBusy)return;
 send('blueprintApprovePlan',{proposalId:latest.id,revision:blueprintRegistry.revision});
});
function affectedDesignKinds(){
 const revisions=new Map((brState?.brs||[]).filter(br=>br.status==='approved'&&!br.needsRefresh&&Number.isSafeInteger(Number(br.approvedRevision))&&Number(br.approvedRevision)>0).map(br=>[String(br.id),Number(br.approvedRevision)]));
 return designKinds.filter(([kind])=>{
  const last=designState?.designs?.[kind]?.at(-1);
  if(!last||!Array.isArray(last.sourceBusinessRequirements)||!last.sourceBusinessRequirements.length||last.status==='draft'&&last.manuallyEdited)return false;
  // Unrelated requirements are not confirmed dependencies; the host planner validates selection.
  // The host refuses uncertain provenance. Do not advertise an action that
  // the backend must reject; missing or unapproved roots need human review.
  if(last.sourceBusinessRequirements.some(ref=>!ref||!revisions.has(String(ref.id||''))||
    !Number.isSafeInteger(Number(ref.revision))||Number(ref.revision)<1))return false;
  return last.sourceBusinessRequirements.some(ref=>revisions.get(String(ref.id))!==Number(ref.revision));
 }).map(([kind])=>kind);
}
function refreshImpactedDesignAction(){
 const button=$('designGenerateImpacted'),message=$('designImpactMessage');
 if(!button||!message)return;
 const impacted=affectedDesignKinds();
 button.classList.toggle('hidden',!impacted.length);
 button.disabled=!impacted.length||designBusy||designDirty||!activeId;
 message.textContent=impacted.length?impacted.length+' affected design(s) require new draft review':'';
}
$('designGenerateImpacted').addEventListener('click',()=>{
 const kinds=affectedDesignKinds();if(!kinds.length||designBusy||designDirty)return;
 designBusy=true;designBatchPending=true;designBusyKind=kinds[0];setDesignProcess(kinds[0],10,'Preparing impacted design regeneration…','running');
 renderDesignCards();send('designRegenerateAffected',{kinds});
});
function renderDesignCards(){
 if(typeof renderBlueprint==='function')renderBlueprint();
 const root=$('designCards');
 // Keep the preview permanently mounted in the workspace right pane.
 root.replaceChildren();
 for(const [kind,label] of designKinds){
  const history=designState?.designs?.[kind]||[],last=history.at(-1);
  const process=designProcessSnapshot(kind,last);
  const panel=document.createElement('details');panel.className='design-kind-panel';panel.dataset.designKind=kind;
  panel.open=designExpandedKinds.has(kind)||(designSelected?.kind===kind);
  panel.addEventListener('toggle',()=>{
   if(!panel.isConnected)return;
   if(panel.open)designExpandedKinds.add(kind);else designExpandedKinds.delete(kind);
  });
  const summary=document.createElement('summary');summary.className='design-kind-summary';
  const title=document.createElement('strong');title.textContent=label;
  const meta=document.createElement('span');meta.className='design-kind-meta';
  meta.textContent=!last?'Not started':(process.state==='warning'?'Outdated · ':process.state==='error'?'Failed · ':'')+(last.status==='approved'?'Approved':'Draft')+' · revision '+last.number;
  const compact=document.createElement('div');compact.className='design-compact-progress is-'+process.state;
  compact.setAttribute('role','progressbar');compact.setAttribute('aria-label',label+' process progress');compact.setAttribute('aria-valuemin','0');compact.setAttribute('aria-valuemax','100');compact.setAttribute('aria-valuenow',String(process.percent));
  const track=document.createElement('div');track.className='design-card-progress-track';const fill=document.createElement('span');fill.className='design-card-progress-fill';fill.style.width=process.percent+'%';track.append(fill);
  const value=document.createElement('span');value.textContent=Math.round(process.percent)+'%';compact.append(track,value);
  summary.append(title,meta,compact);panel.append(summary);
  const content=document.createElement('div');content.className='design-kind-detail';
  // The progress meter appears once, in the header. The current status belongs underneath it.
  const status=document.createElement('p');status.className='design-card-progress-message is-'+process.state;status.setAttribute('role','status');status.textContent=process.message;content.append(status);
  const actions=document.createElement('div');actions.className='design-kind-actions';
  const primary=document.createElement('button');primary.type='button';primary.disabled=designBusy||designDirty||!activeId;
  if(!last){
   primary.textContent='Generate Design';
   primary.addEventListener('click',()=>generateDesignKind(kind,label));
  }else{
   primary.textContent=last.status==='approved'?'View Approved Design':'Review Draft';
   primary.disabled=designDirty;primary.setAttribute('title','Review this design in the ATGV right-side preview pane');primary.addEventListener('click',()=>openDesignPreview(kind,last.id));
  }
  actions.append(primary);
  if(last){
   const regen=document.createElement('button');regen.type='button';regen.className='secondary';regen.textContent='Regenerate';regen.disabled=designBusy||designDirty||!activeId;
   regen.addEventListener('click',()=>generateDesignKind(kind,label));
   // Keep regeneration immediately visible; no overflow or three-dot menu.
   actions.append(regen);
  }
  content.append(actions);
  if(history.length){
   // All revisions, including the current one, are managed in one collapsed location.
   const revisions=document.createElement('details');revisions.className='design-revisions';
   const heading=document.createElement('summary');heading.textContent='Revision history & deletion ('+history.length+')';revisions.append(heading);
   for(const item of [...history].reverse()){
    const latest=item.id===last.id;
    const row=document.createElement('div');row.className='design-revision-row';
    const info=document.createElement('div');info.className='design-revision-info';
    const name=document.createElement('strong');name.textContent=(latest?'Latest · ':'')+(item.design?.title||label);
    const detail=document.createElement('small');detail.textContent=(item.status==='approved'?'Approved':'Draft')+' r'+item.number+' · '+(item.at?new Date(item.at).toLocaleString():'Unknown date')+(approvedDesignHash&&item.sourceHash!==approvedDesignHash?' · Outdated':'');info.append(name,detail);
    const tools=document.createElement('div');tools.className='generated-design-actions';
    if(!latest){const view=document.createElement('button');view.type='button';view.className='secondary';view.textContent='View Revision';view.disabled=designBusy||designDirty;view.setAttribute('title','View revision in the ATGV right-side preview pane');view.addEventListener('click',()=>openDesignPreview(kind,item.id));tools.append(view);}
    const remove=document.createElement('button');remove.type='button';remove.className='secondary design-delete-button';remove.textContent='Delete';remove.setAttribute('aria-label','Delete '+label+' revision '+item.number);remove.disabled=designBusy||designDirty;remove.addEventListener('click',()=>deleteDesign(kind,item));
    // Revision actions use normal labeled buttons, including Delete.
    tools.append(remove);
    row.append(info,tools);revisions.append(row);
   }
   content.append(revisions);
  }else{
   const hint=document.createElement('p');hint.className='muted design-empty-hint';
   hint.textContent=kind==='prototype'?'Create a clickable, offline prototype for browser review.':'Generates a design draft from approved Business Requirements.';content.append(hint);
  }
  panel.append(content);root.append(panel);
 }
 renderDesignWorkspaceProgress();if(typeof refreshImpactedDesignAction==='function')refreshImpactedDesignAction();
}
function generateDesignKind(kind,label){
 if(designBusy||designDirty||!activeId)return;
 designBusy=true;designBusyKind=kind;designExpandedKinds.add(kind);
 setDesignProcess(kind,10,'Preparing '+label+'…','running');$('designStatus').textContent='';renderDesignCards();send('designGenerate',{kind});
}

function renderProductFoundations(kind,item){
 const root=$('designProductFoundation');root.replaceChildren();root.classList.toggle('hidden',kind!=='design');if(kind!=='design')return;
 const d=item.design||{},tokens=d.tokens||{},colors=tokens.colors||{},screens=d.screens||[];
 const heading=document.createElement('h3');heading.textContent='Product Design System';root.append(heading);
 const metrics=document.createElement('div');metrics.className='design-product-metrics';
 for(const [label,value] of [['Screens',screens.length],['Color tokens',Object.keys(colors).length],['Components',screens.reduce((sum,x)=>sum+(x.components?.length||0),0)]]){
  const metric=document.createElement('div');const valueElement=document.createElement('strong');valueElement.textContent=String(value);const name=document.createElement('span');name.textContent=label;metric.append(valueElement,name);metrics.append(metric);
 }root.append(metrics);
 const palette=document.createElement('div');palette.className='design-product-palette';
 for(const [name,color] of Object.entries(colors).slice(0,24)){
  const token=document.createElement('div');token.className='design-product-token';const swatch=document.createElement('span');swatch.className='design-product-swatch';if(/^#[0-9a-f]{3,8}$/i.test(String(color)))swatch.style.backgroundColor=String(color);const key=document.createElement('strong');key.textContent=name;const val=document.createElement('small');val.textContent=String(color);token.append(swatch,key,val);palette.append(token);
 }if(palette.children.length){const title=document.createElement('h4');title.textContent='Color foundations';root.append(title,palette);}
 const type=document.createElement('div');type.className='design-product-type';const title=document.createElement('h4');title.textContent='Typography and layout';const sample=document.createElement('p');sample.textContent='The quick brown fox — Product experience design';const details=document.createElement('small');details.textContent='Font: '+String(tokens.typography?.fontFamily||'Project default')+' · Spacing: '+JSON.stringify(tokens.spacing||{}).slice(0,180);type.append(title,sample,details);root.append(type);
}
function renderDesignScreens(kind,item){
 const screens=Array.isArray(item?.design?.screens)?item.design.screens:[];
 const tabs=$('designScreenTabs'),root=$('designScreenMockups'),status=$('designScreenActionStatus');
 tabs.replaceChildren();root.replaceChildren();status.textContent='';status.classList.add('hidden');
 const show=['mockup','prototype','design','ux'].includes(kind)&&screens.length>0;
 tabs.classList.toggle('hidden',!show);root.classList.toggle('hidden',!show);
 if(!show)return;
 designActiveScreen=Math.max(0,Math.min(designActiveScreen,screens.length-1));
 function selectScreen(index){
  designActiveScreen=index;tabs.replaceChildren();root.replaceChildren();status.textContent='';status.classList.add('hidden');
  for(const [i,screen] of screens.entries()){
   const tab=document.createElement('button');tab.type='button';tab.className='design-screen-tab'+(index===i?' is-active':'');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(index===i));tab.tabIndex=index===i?0:-1;tab.textContent=screen.name||`Screen ${i+1}`;
   tab.addEventListener('click',()=>selectScreen(i));tabs.append(tab);
  }
  const screen=screens[index];
  const frame=document.createElement('section');frame.className='design-mockup-frame';
  const browser=document.createElement('div');browser.className='design-mockup-browser';
  const dots=document.createElement('span');dots.className='design-mockup-dots';dots.textContent='●  ●  ●';
  const address=document.createElement('span');address.textContent='Design preview · simulated interactions';browser.append(dots,address);frame.append(browser);
  const nav=document.createElement('div');nav.className='design-mockup-nav';
  const brand=document.createElement('strong');brand.textContent=item.design?.title||'Application';nav.append(brand);
  const crumb=document.createElement('span');crumb.textContent='Home  ›  '+(screen.name||`Screen ${index+1}`);nav.append(crumb);frame.append(nav);
  const panel=document.createElement('div');panel.className='design-mockup-page';
  const eyebrow=document.createElement('span');eyebrow.className='design-mockup-eyebrow';eyebrow.textContent='SCREEN '+(index+1)+' / '+screens.length;
  const heading=document.createElement('h4');heading.textContent=screen.name||`Screen ${index+1}`;
  const purpose=document.createElement('p');purpose.className='design-mockup-purpose';purpose.textContent=screen.purpose||'Review the screen layout and expected interactions.';
  panel.append(eyebrow,heading,purpose);
  const components=document.createElement('div');components.className='design-mockup-components';
  for(const raw of screen.components||[]){
   const name=typeof raw==='string'?raw:String(raw?.label||raw?.name||raw?.description||'Component');
   const tile=document.createElement('div');tile.className='design-mockup-tile';
   const isButton=/(button|submit|save|cancel|continue|approve|reject|login|search|back|next|create|edit|delete)/i.test(name);
   const isField=/(input|field|email|password|date|filter|name|amount|selection|dropdown|text area|upload)/i.test(name);
   if(isButton){tile.classList.add('is-action');const button=document.createElement('button');button.type='button';button.textContent=name;button.addEventListener('click',()=>{
    if(/next|continue/i.test(name)&&index<screens.length-1){selectScreen(index+1);return;}
    if(/back|cancel/i.test(name)&&index>0){selectScreen(index-1);return;}
    status.textContent='Simulated action: '+name+' · No information was saved or submitted.';status.classList.remove('hidden');
   });tile.append(button);
   }else if(isField){const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.type='text';input.placeholder=name;input.setAttribute('aria-label',name);label.append(input);tile.append(label);
   }else{const text=document.createElement('span');text.textContent=name;tile.append(text);}
   components.append(tile);
  }
  panel.append(components);frame.append(panel);root.append(frame);
 }
 selectScreen(designActiveScreen);
}
function openDesignPreview(kind,proposalId=null){
 // Render inside ATGV's own right-side preview pane. No VS Code editor split is used.
 const history=designState?.designs?.[kind]||[],last=proposalId?history.find(item=>item.id===proposalId):history.at(-1);if(!last)return;
 const readonly=last.id!==history.at(-1)?.id||last.status==='approved';
 if(!designSelected||designSelected.kind!==kind||designSelected.id!==last.id)designActiveScreen=0;
 if(!designSelected)designListScrollTop=$('planningView').closest('.content-pane')?.scrollTop||0;
 designSelected={kind,id:last.id};designExpandedKinds.add(kind);designDirty=false;designEditMode=null;$('designSaveDraft').disabled=true;$('designDraftText').readOnly=readonly;$('designStructuredText').readOnly=readonly;$('designPreview').classList.remove('hidden');$('planningView').classList.add('design-preview-open');$('designPreviewKind').textContent=(designKinds.find(([id])=>id===kind)?.[1]||'Design').toUpperCase();$('designVisualTitle').textContent=designKinds.find(([id])=>id===kind)?.[1]||'Design Preview';$('designVisualTitle').closest('.design-preview-visual-title').classList.toggle('hidden',kind==='api');$('designPreviewSummary').textContent=last.design?.summary||'';
 const metadata=[last.actor||last.createdBy||last.generatedBy||'Unknown user',last.createdAt||last.generatedAt||last.updatedAt||null,last.model||last.aiModel||last.aiProvider||'AI model not recorded'];
 $('designPreviewMeta').replaceChildren();for(const [i,value] of metadata.entries()){const part=document.createElement('span');part.textContent=(i===0?'Generated by ':i===1?'On ':'AI ')+(i===1&&value?new Date(value).toLocaleString():value||'Not recorded');$('designPreviewMeta').append(part);}
 $('designPreviewTitle').textContent=last.design?.title||'Design draft';$('designPreviewVersion').textContent=(last.status==='approved'?'Approved':'Draft')+' r'+last.number+(readonly?' · Read-only':'');$('designDraftText').value=last.content||'';$('designStructuredText').value=JSON.stringify(last.design||{},null,2);$('designExportResult').replaceChildren();renderDesignDeliverables(kind);renderDesignTechnical(kind,last.design);designReviewControls(last,readonly);
 const arch=$('designArchitecturePreview');arch.replaceChildren();
 $('designOpenMockupBrowser').classList.toggle('hidden',kind!=='mockup');$('designOpenMockupBrowser').disabled=designBusy||designDirty||kind!=='mockup';$('designOpenMockupBrowser').textContent='Open Full Website in Browser';
 $('designLoadArchitecture').classList.toggle('hidden',kind!=='architecture');$('designLoadArchitecture').disabled=kind!=='architecture'||!last.design?.diagram;
 let diagram=last.design?.diagram||null;
 if(kind==='ux'&&!diagram&&last.design?.screens?.length){const screens=last.design.screens;diagram={nodes:screens.map((s,i)=>({id:'screen'+i,label:s.name,x:50+(i%3)*260,y:50+Math.floor(i/3)*150,width:210,height:65})),edges:screens.slice(1).map((x,i)=>({from:'screen'+i,to:'screen'+(i+1),label:'Proposed transition'}))};}
 if(kind==='database'&&last.design?.entities?.length){const entities=last.design.entities;const indices=new Map(entities.map((e,i)=>[e.name,i]));diagram={nodes:entities.map((e,i)=>({id:'entity'+i,label:e.name+'\n'+e.fields.slice(0,5).map(f=>f.name+': '+f.type).join('\n'),x:last.design.layout?.[e.name]?.x??40+(i%3)*300,y:last.design.layout?.[e.name]?.y??50+Math.floor(i/3)*200,width:255,height:130})),edges:entities.flatMap((e,i)=>(e.relationships||[]).filter(r=>r&&typeof r==='object'&&indices.has(r.target)).map(r=>({from:'entity'+i,to:'entity'+indices.get(r.target),label:r.cardinality||'relationship'})))};}
 arch.classList.toggle('hidden',!diagram);$('designPreviewDiagramToolbar').classList.toggle('hidden',!diagram);
 $('designSavePositions').classList.add('hidden');$('designSavePositions').disabled=true;
 if(diagram){
  const svgNS='http://www.w3.org/2000/svg',xMax=Math.max(800,...diagram.nodes.map(n=>n.x+n.width+80)),yMax=Math.max(350,...diagram.nodes.map(n=>n.y+n.height+80));
  const canvas=document.createElementNS(svgNS,'svg');canvas.setAttribute('viewBox',`0 0 ${xMax} ${yMax}`);canvas.setAttribute('width','100%');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',kind==='database'?'Draft entity relationship diagram':kind==='ux'?'Draft user journey diagram':'Draft system architecture');
  const positions=new Map(diagram.nodes.map(n=>[n.id,{...n}])),lines=[];
  function redrawEdges(){for(const {line,edge} of lines){const from=positions.get(edge.from),to=positions.get(edge.to);if(!from||!to)continue;for(const [key,value] of Object.entries({x1:from.x+from.width/2,y1:from.y+from.height/2,x2:to.x+to.width/2,y2:to.y+to.height/2}))line.setAttribute(key,String(value));}}
  for(const edge of diagram.edges){if(!positions.has(edge.from)||!positions.has(edge.to))continue;const line=document.createElementNS(svgNS,'line');line.setAttribute('stroke','#aab9c9');line.setAttribute('stroke-width','2');line.setAttribute('pointer-events','none');canvas.append(line);lines.push({line,edge});}
  const moveAllowed=!readonly&&!designDirty&&!designBusy&&last.status==='draft';
  for(const node of diagram.nodes){const group=document.createElementNS(svgNS,'g');const rect=document.createElementNS(svgNS,'rect');for(const [key,value] of Object.entries({x:node.x,y:node.y,width:node.width,height:node.height,rx:8,fill:'#243749',stroke:'#8ea5bb','stroke-width':2}))rect.setAttribute(key,String(value));group.append(rect);
   const label=document.createElementNS(svgNS,'text');label.setAttribute('x',String(node.x+12));label.setAttribute('y',String(node.y+Math.min(node.height-12,26)));label.setAttribute('fill','#fff');label.setAttribute('font-size','12');label.setAttribute('pointer-events','none');for(const [i,txt] of String(node.label).split('\n').slice(0,6).entries()){const tspan=document.createElementNS(svgNS,'tspan');tspan.setAttribute('x',String(node.x+12));tspan.setAttribute('dy',i?'16':'0');tspan.textContent=txt.slice(0,33);label.append(tspan);}group.append(label);canvas.append(group);
   if(moveAllowed){group.style.cursor='grab';group.style.touchAction='none';let active=null;
    group.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();const p=positions.get(node.id);active={pointer:event.pointerId,x:event.clientX,y:event.clientY,startX:p.x,startY:p.y};group.setPointerCapture(event.pointerId);group.style.cursor='grabbing';});
    group.addEventListener('pointermove',event=>{if(!active||active.pointer!==event.pointerId)return;const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;const scale=canvas.viewBox.baseVal.width/box.width;const x=Math.max(0,Math.min(10000,Math.round(active.startX+(event.clientX-active.x)*scale)));const y=Math.max(0,Math.min(10000,Math.round(active.startY+(event.clientY-active.y)*scale)));const p=positions.get(node.id);p.x=x;p.y=y;group.setAttribute('transform',`translate(${x-node.x} ${y-node.y})`);redrawEdges();$('designSavePositions').classList.remove('hidden');$('designSavePositions').disabled=false;});
    const end=event=>{if(active&&active.pointer===event.pointerId){active=null;group.style.cursor='grab';}};group.addEventListener('pointerup',end);group.addEventListener('pointercancel',end);group.addEventListener('lostpointercapture',end);
   }
  }
  redrawEdges();arch.append(canvas);setDesignPreviewZoom(1);
  $('designSavePositions').onclick=()=>{if(!moveAllowed||!designSelected||designDirty||designBusy)return;
   const updated=JSON.parse(JSON.stringify(last.design));
   if(kind==='database'){updated.layout=updated.layout||{};for(const [id,pos] of positions){const index=Number(id.replace(/^entity/,''));const entity=updated.entities?.[index];if(entity)updated.layout[entity.name]={x:pos.x,y:pos.y};}}
   else if(kind==='architecture'||kind==='ux'){updated.diagram=updated.diagram||JSON.parse(JSON.stringify(diagram));for(const n of updated.diagram.nodes||[]){const pos=positions.get(n.id);if(pos){n.x=pos.x;n.y=pos.y;}}}
   else return;
   $('designSavePositions').disabled=true;$('designReviewNotice').textContent='Saving diagram node positions to the design draft…';send('designEditStructured',{kind,proposalId:last.id,revision:designState.revision,proposal:updated});
  };
 }
 renderProductFoundations(kind,last);
 renderDesignScreens(kind,last);
 renderDesignCards();
 $('designPreview').closest('.content-pane')?.scrollTo({top:0,behavior:'auto'});
}
$('designLoadArchitecture').addEventListener('click',()=>{if(diagramDirty){$('designStatus').textContent='Save or reload the current diagram first.';return;}if(!designSelected||designSelected.kind!=='architecture'||designDirty)return;pendingArchitectureImport=designState?.designs?.architecture?.find(x=>x.id===designSelected.id)?.design?.diagram||null;if(pendingArchitectureImport)send('loadDiagram');});
function designEditorChanged(mode){
 if(mode==='markdown'&&$('designDraftText').readOnly||mode==='json'&&$('designStructuredText').readOnly)return;
 if(designEditMode&&designEditMode!==mode){$('designStatus').textContent='Save your current '+designEditMode+' changes before editing the other format.';return;}
 designEditMode=mode;designDirty=true;if(mode==='json')$('designDraftText').readOnly=true;else $('designStructuredText').readOnly=true;$('designSaveDraft').disabled=false;$('designSaveDraft').textContent=mode==='json'?'Save Structured Draft':'Save Markdown Draft';renderDesignCards();const item=designCurrentItem();if(item)designReviewControls(item,false);
}
$('designDraftText').addEventListener('input',()=>designEditorChanged('markdown'));
$('designStructuredText').addEventListener('input',()=>designEditorChanged('json'));
$('designClosePreview').addEventListener('click',()=>{if(designDirty){$('designReviewNotice').textContent='Save the draft before returning to Solution Designs.';return;}$('designPreview').classList.add('hidden');$('planningView').classList.remove('design-preview-open');designSelected=null;renderDesignCards();$('designPreview').closest('.content-pane')?.scrollTo({top:designListScrollTop,behavior:'auto'});});
$('designSaveDraft').addEventListener('click',()=>{
 if(!designSelected||!designState||!designEditMode)return;
 const base={kind:designSelected.kind,proposalId:designSelected.id,revision:designState.revision};
 if(designEditMode==='json'){
  let proposal;try{proposal=JSON.parse($('designStructuredText').value);}catch(e){$('designStatus').textContent='Invalid JSON: '+e.message;return;}
  $('designSaveDraft').disabled=true;$('designStatus').textContent='Validating and saving structured design…';send('designEditStructured',{...base,proposal});
 }else{$('designSaveDraft').disabled=true;$('designStatus').textContent='Saving Markdown only (structured artifacts will need reconciliation)…';send('designEdit',{...base,content:$('designDraftText').value});}
});
$('designApprove').addEventListener('click',()=>{const item=designCurrentItem();if(!item||designDirty)return;designBusy=true;renderDesignCards();$('designStatus').textContent='Reviewing approval request…';send('designApprove',{kind:designSelected.kind,proposalId:item.id,revision:designState.revision});});
$('designExport').addEventListener('click',()=>{const item=designCurrentItem();if(!item||designDirty)return;$('designExport').disabled=true;$('designStatus').textContent='Writing approved artifacts to the project…';send('designExport',{kind:designSelected.kind,proposalId:item.id});});
$('openDiagramSource').addEventListener('click',()=>send('openDiagramSource'));
$('closeDiagramEditor').addEventListener('click',()=>{if(diagramDirty){diagramStatus('Save the diagram before closing.');return;}$('diagramEditorPanel').classList.add('hidden');$('generatedDesignsSection').classList.add('hidden');});
$('openDiagram').addEventListener('click',()=>{if(diagramDirty){$('diagramStatus').textContent='Save or reload the current diagram before opening another.';return;}send('loadDiagram');});
function diagramStatus(message){$('diagramStatus').textContent=message;}
function diagramChanged(){diagramDirty=true;$('diagramSave').disabled=false;diagramStatus('Unsaved local diagram changes.');}
function editDiagram(model){
  $('diagramWorkbench').classList.remove('hidden');diagramDirty=false;diagramSaving=false;$('diagramSave').disabled=true;
  diagramCanvas=new window.AtgvDiagramCanvas($('diagramCanvas'),model,{onChange:diagramChanged,onSelect:node=>{$('diagramRename').disabled=!node;$('diagramConnect').disabled=!node;$('diagramDelete').disabled=!node;},onLink:diagramStatus});
  for(const id of ['diagramRename','diagramConnect','diagramDelete'])$(id).disabled=true;
  diagramStatus('Offline diagram ready. Changes are not saved until Save Diagram is clicked.');
}
$('diagramAddNode').addEventListener('click',()=>diagramCanvas?.addNode());
$('diagramFit').addEventListener('click',()=>diagramCanvas?.fit());
$('diagramZoomIn').addEventListener('click',()=>diagramCanvas?.zoom(0.8));
$('diagramZoomOut').addEventListener('click',()=>diagramCanvas?.zoom(1.25));
$('diagramRename').addEventListener('click',()=>{
  if(!diagramCanvas?.selected)return;const node=diagramCanvas.model.nodes.find(n=>n.id===diagramCanvas.selected);
  const next=prompt('Node label',node?.label||'');if(next!==null)diagramCanvas.renameSelected(next);
});
$('diagramConnect').addEventListener('click',()=>diagramCanvas?.startLink());
$('diagramDelete').addEventListener('click',()=>{if(diagramCanvas?.selected&&confirm('Delete selected node and its connections?'))diagramCanvas.deleteSelected();});
$('diagramSave').addEventListener('click',()=>{
  if(!diagramCanvas||!activeDiagram||!diagramDirty||diagramSaving)return;
  diagramSaving=true;$('diagramSave').disabled=true;diagramStatus('Saving diagram…');
  send('saveDiagram',{revision:activeDiagram.revision,model:diagramCanvas.serialize()});
});
function msgTemplateText(v){return v?.status==='approved'?`Approved by ${v.approvedBy} on ${v.approvedAt} · ${v.items?.length||0} DoD items. Use Jira Preview to suggest content.`:`Proposed TRM Story template · ${v?.items?.length||0} DoD items. Requires explicit BA approval.\n`+(v?.items||[]).map(x=>'- '+x).join('\n');}
function projectKnowledgeSubmit(kind){
 const input=$('overviewRagQuery');const query=input.value.trim();
 if(!query){$('overviewKnowledgeStatus').textContent='Enter a project knowledge question or search phrase.';input.focus();return;}
 if(!activeId){$('overviewKnowledgeStatus').textContent='Open a project first.';return;}
 $('overviewKnowledgeStatus').textContent=kind==='ragAsk'?'Generating a grounded answer…':'Searching indexed project sources…';
 $('overviewRagResult').classList.remove('hidden');$('overviewRagAnswer').textContent='Working…';$('overviewRagSources').replaceChildren();
 $('ragQuery').value=query;send(kind,{query});
}
$('overviewKnowledgeSearch').addEventListener('click',()=>projectKnowledgeSubmit('ragSearch'));
$('overviewKnowledgeAsk').addEventListener('click',()=>projectKnowledgeSubmit('ragAsk'));
$('overviewRagQuery').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();projectKnowledgeSubmit('ragSearch');}});
$('overviewKnowledgeSync').addEventListener('click',()=>{if(!activeId){$('overviewKnowledgeStatus').textContent='Open a project first.';return;}$('overviewKnowledgeSync').disabled=true;$('overviewKnowledgeStatus').textContent='Refreshing indexed project knowledge…';send('sync',{id:activeId});});
window.addEventListener('message',event=>{
 const data=event.data||{};
 if(data.type!=='liveRemoteState'||data.value?.projectId!==activeId)return;
 renderLiveRemoteState(data.value);
 // Full Jira inventory is refreshed only after the 5-minute freshness window.
 if(data.value.phase!=='ready'&&data.value.phase!=='partial')return;
 if(!Object.prototype.hasOwnProperty.call(data.value.results||{},'Jira'))return;
 if(!jiraInventoryRunning&&jiraInventoryLoaded&&Date.now()-jiraInventoryLastChecked>=300000
  &&view==='work'&&['business-analyst','project-manager'].includes(selectedRole))
  searchJiraInventory();
});
$('knowledgeSync').addEventListener('click',()=>{if(!activeId)return;$('knowledgeSync').disabled=true;$('knowledgeSyncStatus').textContent='Syncing local project documents and available connected sources…';send('sync',{id:activeId});});
$('jiraTemplatePreview').addEventListener('click',()=>send('jiraTemplatePreview'));
$('jiraTemplateApprove').addEventListener('click',()=>send('jiraTemplateApprove'));
$('jiraTemplateSync').addEventListener('click',()=>send('jiraTemplateSync'));
$('knowledgeSearch').addEventListener('click',()=>send('ragSearch',{query:read('ragQuery')}));
$('knowledgeAsk').addEventListener('click',()=>send('ragAsk',{query:read('ragQuery')}));
$('knowledgeRagSettings').addEventListener('click',()=>send('ragSettings'));
$('knowledgeApiKey').addEventListener('click',()=>send('llmToken'));
for(const [button,command] of [['backupLocalContent','backupLocalContent'],['restoreLocalContent','restoreLocalContent']]){
 $(button).addEventListener('click',()=>{
  $('backupLocalContent').disabled=true;$('restoreLocalContent').disabled=true;
  $('localBackupStatus').className='test-status muted';
  $('localBackupStatus').textContent=command==='backupLocalContent'?'Preparing local backup…':'Inspecting selected backup…';
  send(command);
 });
}
window.addEventListener('message',event=>{
 const message=event.data||{};
 if(message.type!=='localBackupAction')return;
 $('backupLocalContent').disabled=false;$('restoreLocalContent').disabled=false;
 $('localBackupStatus').className=message.success?'test-status success':'test-status error';
 $('localBackupStatus').textContent=message.message||'Backup or restore operation finished.';
});


let latestSoftwareUpdateState=null,softwareLibraryPulling=false;
function renderSoftwareLibraryPullProgress(event){
 const box=$('softwareLibraryPullProgress');
 const stage=event.stage==='completed'?'completed':event.stage==='failed'?'failed':'running';
 const percent=Math.max(0,Math.min(100,Math.round(Number(event.percent)||0)));
 softwareLibraryPulling=stage==='running';
 box.classList.remove('hidden');
 box.dataset.state=stage;
 $('softwareLibraryPullBar').setAttribute('aria-valuenow',String(percent));
 $('softwareLibraryPullIndicator').style.width=percent+'%';
 $('softwareLibraryPullPercent').textContent=percent+'%';
 $('softwareLibraryPullTitle').textContent=String(event.title||'Pulling SDLC Library files…').slice(0,150);
 $('softwareLibraryPullMessage').textContent=String(event.message||'Checking GitHub main and verifying library files.').slice(0,700);
 $('pullLibraryFiles').disabled=softwareLibraryPulling||!!catalogBusyUI||!!catalogState?.busy;
 $('pullLibraryFiles').textContent=softwareLibraryPulling?'Pulling Library…':stage==='failed'?'Retry Pull Library Files':'Pull Library Files';
}
function renderSoftwareUpdates(data,force=false){
 if(!data)return;
 latestSoftwareUpdateState=data;
 const version=data.installedVersion||'?';
 const latestVersion=data.extensionLatest?.version||data.latest?.version||'';
 // A public mirror can lag behind an installed private-source build. Never
 // present an older public artifact as an available upgrade or 'latest' ATGV.
 const semverParts=value=>{const parts=String(value||'').split('.');return parts.length===3&&parts.every(part=>/^[0-9]+$/.test(part))?parts.map(Number):null;};
 const publishedParts=semverParts(latestVersion),installedParts=semverParts(version);
 const publicBehind=!!publishedParts&&!!installedParts&&publishedParts.some((part,index)=>part!==installedParts[index])&&
  publishedParts.findIndex((part,index)=>part!==installedParts[index])>=0&&
  publishedParts[publishedParts.findIndex((part,index)=>part!==installedParts[index])]<installedParts[publishedParts.findIndex((part,index)=>part!==installedParts[index])];
 const checked=data.extensionLastCheck?' (checked '+new Date(data.extensionLastCheck).toLocaleString()+').':'';
 $('softwareExtensionStatus').textContent=data.extensionError?`Extension: ${data.extensionError}`:
  publicBehind?`Installed extension v${version} · public release mirror is behind (v${latestVersion}). No downgrade available${checked}`:
  latestVersion&&!data.extensionLatest?.installable&&!data.latest?`Public release v${latestVersion}: verified VSIX or checksum not available.`:
  data.latest?`Extension v${data.latest.version} available (installed v${version}). Release: ${data.latest.tag}.`:
  data.extensionLastCheck?`Installed extension v${version}${latestVersion?' · latest public release v'+latestVersion:' · no public release found'}${checked}`:
  `Installed extension: v${version}; not checked yet.`;
 const installedLibrary=data.libraryInstalledVersion||catalogState?.installed?.version||'';
 const sourceLibrary=data.librarySourceVersion||catalogState?.remote?.version||'';
 const mirrorLibrary=data.libraryLatest||'';
 const compareSemver=(a,b)=>{
  const aa=semverParts(a),bb=semverParts(b);
  if(!aa||!bb)return null;
  for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;
  return 0;
 };
 const mirrorBehind=!!installedLibrary&&compareSemver(mirrorLibrary,installedLibrary)<0;
 const sourceBehind=!!installedLibrary&&compareSemver(sourceLibrary,installedLibrary)<0;
 const sourceAhead=!!installedLibrary&&compareSemver(sourceLibrary,installedLibrary)>0;
 $('softwareLibraryStatus').textContent=data.libraryError?`Library: ${data.libraryError}`:
  sourceAhead?`Library source main v${sourceLibrary} is newer than active v${installedLibrary}. Pull Library Files to verify and update the selected source.`:
  mirrorBehind?`Active Library v${installedLibrary} is newer than public mirror v${mirrorLibrary}. ${sourceLibrary?'Selected source main v'+sourceLibrary+(sourceBehind?' is also older.':' is verified.'):'Check selected GitHub source main for newer commits.'} No downgrade available.`:
  installedLibrary&&mirrorLibrary&&compareSemver(mirrorLibrary,installedLibrary)===0?`Active Library v${installedLibrary} matches the verified public release. Check selected source main for updates.`:
  data.libraryLatest?`Library public release: v${mirrorLibrary}${data.libraryLatestAvailable?'. Pull Library Files to check source main first and install only a newer verified version.':'; verified ZIP or checksum is unavailable or the installed Library is newer.'}`:
  `Library: no public release yet. Check selected GitHub source main for updates.`;
 $('viewExtensionRelease').disabled=!data.extensionLatest;
 $('installExtensionRelease').disabled=!data.latest;
 $('checkSoftwareUpdates').disabled=!!data.busy;
 $('pullLibraryFiles').disabled=softwareLibraryPulling||!!catalogBusyUI||!!catalogState?.busy;
}
window.addEventListener('message',event=>{
 const m=event.data||{};
 if(m.type==='state'&&m.updates)renderSoftwareUpdates(m.updates);
 if(m.type==='softwareUpdateState')renderSoftwareUpdates(m.value);
});
$('checkSoftwareUpdates').addEventListener('click',()=>{
 $('softwareExtensionStatus').textContent='Checking public extension releases…';
 $('softwareLibraryStatus').textContent='Checking public SDLC Library releases…';
 send('checkSoftwareUpdates');
});
$('pullLibraryFiles').addEventListener('click',()=>{
 if(softwareLibraryPulling||!!catalogBusyUI||!!catalogState?.busy)return;
 renderSoftwareLibraryPullProgress({stage:'running',percent:0,
  title:'Checking selected GitHub Library source…',
  message:'Verifying the selected organization’s Library main branch first, then checking the public release mirror as a fallback. No downgrades.'});
 send('catalogPull');
});
$('viewExtensionRelease').addEventListener('click',()=>send('viewExtensionRelease'));
$('installExtensionRelease').addEventListener('click',()=>send('installExtensionRelease'));

$('settingsBack').addEventListener('click',()=>{if(roleSettingsDirty){status('Save role settings before leaving Settings.',true);return;}if(workspaceOpened)navigate('overview');else{spaces=[];showGate();}});
$('settingsSpaceSearch').addEventListener('click',()=>{
  const query=read('settingsSpaceQuery');
  if(query.length<2){$('settingsSpaceMessage').textContent='Enter at least 2 characters.';return;}
  const requestId=++spaceSearchSequence;settingsSearchId=requestId;
  $('settingsSpaces').replaceChildren();$('settingsSpaceMessage').textContent='Searching…';
  send('discover',{query,origin:'settings',requestId});
});
$('settingsSpaceQuery').addEventListener('input',()=>{settingsSearchId=null;$('settingsSpaces').replaceChildren();$('settingsSpaceMessage').textContent='Enter a space name or key to search.';});
$('settingsSpaceQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('settingsSpaceSearch').click();}});
$('settingsExtensionTab').addEventListener('click',()=>{});
$('extensionToProjectSettings').addEventListener('click',()=>{if(workspaceOpened&&activeId)navigate('project-settings');else status('Open a project to edit Project Settings.',true);});
$('projectSettingsTab').addEventListener('click',()=>{});
// Standard keyboard navigation between the two scoped Settings tabs.
for(const id of ['settingsExtensionTab','extensionToProjectSettings','projectToExtensionSettings','projectSettingsTab']){
  $(id).addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const toProject=event.key==='End'||(['ArrowLeft','ArrowRight'].includes(event.key)&&['settingsExtensionTab','projectToExtensionSettings'].includes(id));
    if(toProject&&(!workspaceOpened||!activeId))return;
    navigate(toProject?'project-settings':'settings');
    requestAnimationFrame(()=>$((toProject?'projectSettingsTab':'settingsExtensionTab')).focus());
  });
}
$('projectToExtensionSettings').addEventListener('click',()=>navigate('settings'));
$('sidebarSwitchProject').addEventListener('click',()=>navigate('projects'));

function setGithubBranch(){field('githubBranch','main');}
function showGithubRepoPreview(){
 const owner=read('githubOwner').trim(),repo=read('githubRepository').trim();
 const url=$('githubRepositoryUrl');url.value=owner&&repo?'https://github.com/'+owner+'/'+repo:'';url.setCustomValidity('');
}
function parseGithubRepositoryUrl(value){
 const input=String(value||'').trim();
 if(!input)return null;
 const match=/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(input);
 return match?{owner:match[1],repo:match[2]}:null;
}
function syncGithubRepositoryUrl(){
 const input=$('githubRepositoryUrl'),text=input.value.trim();
 if(!text){field('githubRepository','');input.setCustomValidity('');return;}
 const parsed=parseGithubRepositoryUrl(text);
 if(!parsed){field('githubRepository','');input.setCustomValidity('Enter a valid https://github.com/OWNER/REPOSITORY URL.');return;}
 input.setCustomValidity('');
 field('githubOwner',parsed.owner);field('githubRepository',parsed.repo);
}
function testIds(section){return section==='jira'?['testAtlassian','saveAtlassian','jiraTestStatus']:['testGithub','saveGithub','githubTestStatus'];}
function invalidateTest(section){
  ++testRevisions[section];
  const [testId,saveId,statusId]=testIds(section);
  $(testId).disabled=false;
  $(saveId).disabled=true;$(saveId).classList.add('hidden');
  $(statusId).textContent='';$(statusId).className='test-status muted';
}
for(const id of ['jiraBaseUrl','jiraEmail','jiraProjectKey','jiraToken']){
  $(id).addEventListener('input',()=>invalidateTest('jira'));
}
$('githubOwner').addEventListener('input',()=>{if(read('githubRepository'))showGithubRepoPreview();invalidateTest('github');});
$('githubRepositoryUrl').addEventListener('input',()=>{syncGithubRepositoryUrl();invalidateTest('github');});
$('githubPersonalToken').addEventListener('input',()=>invalidateTest('github'));
function requestTest(section){
  const [testId,saveId,statusId]=testIds(section);
  const form=section==='jira'?'extensionForm':'githubForm';
  if(!$(form).reportValidity())return;
  const requestId=++testRevisions[section];
  $(testId).disabled=true;$(saveId).disabled=true;$(saveId).classList.add('hidden');
  $(statusId).className='test-status muted';$(statusId).textContent='Testing connection…';
  if(section==='jira')send('testExtensionJira',{requestId,settings:{jira:{baseUrl:read('jiraBaseUrl'),email:read('jiraEmail'),projectKey:read('jiraProjectKey')}},token:read('jiraToken')});
  else send('testExtensionGithub',{requestId,settings:{owner:read('githubOwner'),repo:read('githubRepository'),branch:read('githubRepository')?'main':''},token:read('githubPersonalToken')});
}
$('testAtlassian').addEventListener('click',()=>requestTest('jira'));
$('testGithub').addEventListener('click',()=>requestTest('github'));
$('extensionForm').addEventListener('submit',e=>{
  e.preventDefault();if($('saveAtlassian').disabled)return;
  send('saveExtension',{settings:{jira:{baseUrl:read('jiraBaseUrl'),email:read('jiraEmail'),projectKey:read('jiraProjectKey')}}});
});
$('githubForm').addEventListener('submit',e=>{
  e.preventDefault();if($('saveGithub').disabled)return;
  send('saveGithub',{settings:{owner:read('githubOwner'),repo:read('githubRepository'),branch:read('githubRepository')?'main':''}});
});
let aiProviderEditing=false,aiProviderLoaded=false;
function renderAIProviderState(data){
 if(!data)return;settingsAiTested=false;
 if(!aiProviderEditing){$('aiProviderChoice').value=data.provider||'auto';$('aiProviderModel').value=data.model||'';$('aiProviderEndpoint').value=data.endpoint||'';$('aiCodexTransport').value=data.codexTransport||'https';}
 const chosen=read('aiProviderChoice');
 $('aiProviderState').textContent=chosen==='codex'?(data.codexInstalled?`Codex runtime: ${data.codexVersion||'installed'}. Connection: ${data.codexTransport==='default'?'Codex default (WebSocket possible)':'HTTPS only'}. Run Test AI Connection to verify sign-in.`:'Codex runtime not detected. Use Install Codex Automatically.'):['openai','anthropic','azure-openai','openai-compatible'].includes(chosen)?`API key: ${data.tokenSaved?'saved':'not saved'}. Run Test AI Connection.`:'Use Test AI Connection to confirm availability.';
 updateExtensionSettingBadges();
 $('aiCodexInstall').classList.toggle('hidden',!!data.codexInstalled||read('aiProviderChoice')!=='codex');$('aiCopilotSdkInstall').classList.toggle('hidden',!!data.copilotSdkInstalled||read('aiProviderChoice')!=='copilot-sdk');
 $('aiProviderToken').closest('.field').classList.toggle('hidden',!['openai','anthropic','azure-openai','openai-compatible'].includes(read('aiProviderChoice')));syncAIProviderFields();
}
function syncAIProviderFields(){
 const provider=read('aiProviderChoice');
 $('aiCodexTransportField').classList.toggle('hidden',provider!=='codex');
 $('aiProviderEndpointField').classList.toggle('hidden',!['azure-openai','ollama','openai-compatible'].includes(provider));
 $('aiProviderModel').placeholder=provider==='codex'||provider==='copilot-sdk'?'Optional: use the provider default model':'Enter approved model ID';
}
$('aiProviderChoice').addEventListener('change',()=>{aiProviderEditing=true;const p=read('aiProviderChoice');$('aiCodexInstall').classList.toggle('hidden',p!=='codex');$('aiCopilotSdkInstall').classList.toggle('hidden',p!=='copilot-sdk');$('aiProviderToken').closest('.field').classList.toggle('hidden',!['openai','anthropic','azure-openai','openai-compatible'].includes(p));syncAIProviderFields();});
for(const id of ['aiProviderModel','aiProviderEndpoint','aiCodexTransport'])$(id).addEventListener('input',()=>{aiProviderEditing=true;});
$('aiProviderSave').addEventListener('click',()=>{aiProviderEditing=false;send('saveAiProvider',{provider:read('aiProviderChoice'),model:read('aiProviderModel'),endpoint:read('aiProviderEndpoint'),token:read('aiProviderToken'),codexTransport:read('aiCodexTransport')});$('aiProviderState').textContent='Saving provider…';});
$('aiProviderTest').addEventListener('click',()=>{$('aiProviderState').textContent='Testing selected saved provider…';send('testAiProvider');});
$('aiCodexInstall').addEventListener('click',()=>{$('aiProviderState').textContent='Preparing installation request…';send('installCodexRuntime');});
$('aiCopilotSdkInstall').addEventListener('click',()=>{$('aiProviderState').textContent='Installing Copilot SDK…';send('installCopilotSdk');});
$('aiProviderRefresh').addEventListener('click',()=>send('getAiProviderState'));
window.addEventListener('message',event=>{const msg=event.data||{};if(msg.type==='aiProviderState')renderAIProviderState(msg.state);if(msg.type==='aiProviderAction'){$('aiProviderState').textContent=msg.message||'';$('aiProviderState').className=msg.success?'test-status success':'test-status error';if(msg.success){$('aiProviderToken').value='';settingsAiTested=true;}else settingsAiTested=false;updateExtensionSettingBadges();}});
$('catalogAuth').addEventListener('change',()=>$('catalogTokenField').classList.toggle('hidden',read('catalogAuth')!=='token'));
$('catalogForm').addEventListener('submit',event=>{event.preventDefault();$('catalogStatus').textContent='Saving catalog settings…';send('catalogSave',{config:catalogFormConfig(),token:read('catalogToken')});});
$('catalogTest').addEventListener('click',()=>{$('catalogStatus').textContent='Testing GitHub connection…';send('catalogTest',{config:catalogFormConfig(),token:read('catalogToken')});});
$('catalogPull').addEventListener('click',()=>{$('catalogStatus').textContent='Pulling and validating the GitHub catalog…';send('catalogPull');});
$('catalogCheck').addEventListener('click',()=>{$('catalogStatus').textContent='Checking approved catalog version…';send('catalogCheck');});
$('clearTechStack').addEventListener('click',()=>{selectedTechStackId='';renderTechStacks();});
$('back').addEventListener('click',()=>{if(roleSettingsDirty){status('Save project role settings before leaving Project Settings.',true);return;}if(workspaceOpened)navigate('overview');else showGate();});
$('projectGithubRepositoryUrl').addEventListener('input',()=>{
 const value=$('projectGithubRepositoryUrl').value.trim();
 const parsed=value?parseGithubRepositoryUrl(value):null;
 $('projectGithubRepositoryUrl').setCustomValidity(!value||parsed?'':'Enter https://github.com/OWNER/REPOSITORY.');
});
$('projectForm').addEventListener('submit',e=>{
 e.preventDefault();
 if(!$('projectForm').reportValidity())return;
 try{send(editingId?'update':'create',{project:readProjectForm()});}
 catch(error){status(error.message,true);}
});
$('showFolder').addEventListener('click',()=>send('showFolder',{id:editingId}));
$('atlassianToken').addEventListener('click',()=>send('token',{id:editingId,kind:'atlassian'}));
$('githubToken').addEventListener('click',()=>send('token',{id:editingId,kind:'github'}));
function editorEscape(text){return String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function markdownToQuillHtml(md){
  const complex=/(^|\n)\s*\|[^\n]+\|\s*\n\s*\|\s*:?-{3}|(^|\n)\s*```|<\/?[a-z][^>]*\s+[a-z][^>]*>|<\/[a-z][^>]*>|\[[^\]]+\]\([^)]+\)/im.test(md);
  const inline=text=>editorEscape(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code>$1</code>');
  const lines=md.split(/\r?\n/),out=[];
  for(const line of lines){
    if(/^#{1,3}\s/.test(line)){const m=line.match(/^(#{1,3})\s+(.*)$/);out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);}
    else if(/^\s*[-*]\s+/.test(line))out.push('<ul><li>'+inline(line.replace(/^\s*[-*]\s+/,''))+'</li></ul>');
    else if(/^\s*\d+\.\s+/.test(line))out.push('<ol><li>'+inline(line.replace(/^\s*\d+\.\s+/,''))+'</li></ol>');
    else if(/^>\s?/.test(line))out.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');
    else out.push('<p>'+(line?inline(line):'<br>')+'</p>');
  }
  return {html:out.join(''),complex};
}
function markDocumentDirty(){
  if(docSaving)return;
  docDirty=true;$('docSave').disabled=false;$('docEditorStatus').textContent='Unsaved changes';
}
function quillMount(){
                                                                            
                                                                              
  quill=null;
  const wrapper=$('editorWysiwyg');wrapper.replaceChildren();
  const mount=document.createElement('div');mount.id='quillEditor';mount.setAttribute('aria-label','WYSIWYG document editor');wrapper.append(mount);
}
function enterMarkdownMode(){
  if(docMode==='markdown')return;
  if(docDirty&&quill){
                                                                               
                                                                     
    $('docEditorStatus').textContent='Save your WYSIWYG changes before switching modes.';return;
  }
  docMode='markdown';$('editorWysiwyg').classList.add('hidden');$('editorMarkdown').classList.remove('hidden');
  $('docMarkdownSource').value=activeDoc?.markdown||'';
  $('docOpenSource').textContent=docComplex?'Markdown Editor':'Use WYSIWYG';
  $('docOpenSource').disabled=docComplex;
  $('docEditorStatus').textContent=docComplex?'Complex Markdown: editing source safely in this pane.':'Markdown editor ready.';
}
function openQuillDocument(doc){
  activeDoc=doc;docDirty=false;docSaving=false;docMode='quill';
  documentOwner=null;$('docOwnerStatus').textContent='Owner: Checking…';$('docAssign').disabled=true;
  $('docEditorTitle').textContent=doc.title;$('docEditorPath').textContent=doc.path;
  if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
  $('docSave').disabled=true;$('docMarkdownSource').readOnly=true;$('docOpenSource').disabled=false;$('docOpenSource').textContent='Edit Markdown';
  $('editorWysiwyg').classList.remove('hidden');$('editorMarkdown').classList.add('hidden');
  quillMount();
  const parsed=markdownToQuillHtml(doc.markdown);docComplex=parsed.complex;
  if(parsed.complex||typeof Quill!=='function'){
    enterMarkdownMode();
    if(!parsed.complex)$('docEditorStatus').textContent='Quill unavailable. You can edit this document as Markdown.';
  }else{
    quill=new Quill('#quillEditor',{
      theme:'snow',placeholder:'Write your project document…',
      modules:{toolbar:[[{header:[1,2,3,false]}],['bold','italic','strike'],[{list:'ordered'},{list:'bullet'}],['blockquote','code-block'],['link'],['clean']]},
      formats:['header','bold','italic','strike','code','list','blockquote','code-block','link']
    });
    quill.clipboard.dangerouslyPasteHTML(parsed.html,'api');quill.enable(false);
    $('docEditorStatus').textContent='Ready to edit';
    quill.on('text-change',(_delta,_old,source)=>{if(source==='user')markDocumentDirty();});
  }
  setView('documentEditor');
  send('getDocumentOwnership',{roleId:doc.roleId,taskId:doc.taskId});
}
$('docRejectTransfer').addEventListener('click',()=>{if(activeDoc&&documentOwner?.pending&&!documentOwnerCached)send('documentOwnershipAction',{roleId:activeDoc.roleId,taskId:activeDoc.taskId,action:'reject-transfer',revision:documentOwner.revision});});
$('docMarkdownSource').addEventListener('input',markDocumentDirty);
$('docBack').addEventListener('click',()=>navigate(docBackTo));
$('docOpenSource').addEventListener('click',()=>{
  if(!activeDoc)return;
  if(docMode==='quill'){enterMarkdownMode();return;}
  if(docComplex||docDirty){$('docEditorStatus').textContent='Save your Markdown before switching to WYSIWYG.';return;}
  openQuillDocument(activeDoc);
});
$('docSave').addEventListener('click',()=>{
  if(!activeDoc||!docDirty||docSaving||!documentOwner?.isMe)return;
  docSaving=true;$('docSave').disabled=true;$('docEditorStatus').textContent='Saving…';
  const common={roleId:activeDoc.roleId,taskId:activeDoc.taskId,revision:activeDoc.revision,brId:selectedHandoffBrId};
  if(docMode==='markdown')send('saveRoleMarkdown',{...common,markdown:$('docMarkdownSource').value});
  else if(quill)send('saveRoleDocument',{...common,delta:quill.getContents()});
});
function updateDocumentOwnership(){
  if(!activeDoc)return;
  const docId=activeDoc.roleId+'--'+activeDoc.taskId;
  const owner=documentOwner;
  const label=$('docOwnerStatus'),action=$('docAssign');
  const presentation=ATGVOwnershipPresentation.display(owner,documentOwnerMe,{cached:!!documentOwnerCached});
  label.textContent=presentation.text;label.className='ownership-state-text '+presentation.state;
  const alreadyOwned=owner?.isMe===true;
  action.classList.toggle('hidden',!presentation.primary);
  action.textContent=ATGVOwnershipPresentation.actionLabel(presentation.primary);
  action.disabled=!presentation.primary||!documentOwnerScope||!!documentOwnerCached&&['approve-transfer','reject-transfer','cancel-transfer'].includes(presentation.primary);
  const reject=$('docRejectTransfer');reject.classList.toggle('hidden',presentation.secondary!=='reject-transfer');reject.disabled=presentation.secondary!=='reject-transfer'||!!documentOwnerCached;
  $('docMarkdownSource').readOnly=!alreadyOwned;
  if(quill)quill.enable(alreadyOwned);
  $('docSave').disabled=!alreadyOwned||!docDirty||docSaving;
}
$('docAssign').addEventListener('click',()=>{
  if(!activeDoc||docSaving)return;
  if(!documentOwnerScope){send('getDocumentOwnership',{roleId:activeDoc.roleId,taskId:activeDoc.taskId});return;}
  const action=ATGVOwnershipPresentation.display(documentOwner,documentOwnerMe).primary;
  if(action)send('documentOwnershipAction',{roleId:activeDoc.roleId,taskId:activeDoc.taskId,action,revision:documentOwner?.revision??0});
});

const BA_QUESTIONS=[
 ['problem','Business problem and expected outcome'],
 ['stakeholders','Users, stakeholders and decision makers'],
 ['currentProcess','Current process'],
 ['targetProcess','Target process'],
 ['scope','In scope and out of scope'],
 ['businessRules','Business rules and policies'],
 ['acceptance','Acceptance criteria'],
 ['data','Data classification and sensitivity'],
 ['dependencies','Systems, teams, vendors and dependencies'],
 ['constraints','Constraints and non-functional requirements'],
 ['measures','Measurable success criteria'],
 ['questions','Open decisions and unresolved questions']
];
function activeProjectRecord(){return projects.find(project=>project.id===activeId)||null;}
function formatDateTime(value){
  if(!value)return 'Not saved yet.';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Updated: '+value;
  return 'Updated: '+date.toLocaleString();
}
function setWorkflowStep(id,active){const node=$(id);if(node)node.classList.toggle('active',!!active);}
function noOpenDecisions(value){return /^(?:none|no (?:open|outstanding|unresolved) (?:decisions|questions|issues)|n\/a)[.!]?$/i.test(String(value||'').trim());}
function currentDiscoveryReadiness(){
  if(!discoveryDirty||!$('discoveryQuestions')?.children.length)return discoveryData?.readiness||{filled:0,total:12,missing:[],canReview:false,needsDecision:false};
  const answers=Object.fromEntries(BA_QUESTIONS.map(([key])=>[key,$('ba-'+key)?.value.trim()||'']));
  const missing=BA_QUESTIONS.filter(([key])=>!answers[key]).map(([key,label])=>({key,label}));
  const unresolved=answers.questions||'';
  return {filled:12-missing.length,total:12,missing,needsDecision:!!unresolved&&!noOpenDecisions(unresolved),canReview:missing.length===0,canApprove:missing.length===0&&(!unresolved||noOpenDecisions(unresolved))};
}
function refreshDiscoveryGroupCounts(){
  for(const section of $('discoveryQuestions')?.querySelectorAll('.discovery-group')||[]){
    const from=Number(section.dataset.from),to=Number(section.dataset.to),pill=section.querySelector('.discovery-group-pill');
    if(!pill||!Number.isInteger(from)||!Number.isInteger(to))continue;
    const count=BA_QUESTIONS.slice(from,to).filter(([key])=>$('ba-'+key)?.value.trim()).length;
    pill.textContent=`${count} / ${to-from}`;
  }
}
function baOwner(documentId){return baOwnerState?.documents?.find(x=>x.documentId===documentId)||{ownerId:null,revision:0,pending:null};}
function baCanEdit(documentId){if(documentId==='ba-discovery')return !!activeId&&selectedRole==='business-analyst'&&!!baOwnerState?.me;return !!baOwnerState?.me&&baOwner(documentId).ownerId===baOwnerState.me;}
function baOwnershipLabel(documentId){
 const record=baOwner(documentId);
  return ATGVOwnershipPresentation.display(record,baOwnerState?.me,{loaded:!!baOwnerState,cached:!!baOwnerState?.cached}).text;
}
function baAction(documentId,override){
 const record=baOwner(documentId);
 if(!baOwnerState?.me&&baOwnerState?.scope!=='local')return;
 const mine=!!baOwnerState.me&&record.ownerId===baOwnerState.me;
 const action=override||(!record.ownerId?'claim':mine?record.pending?.from===baOwnerState.me?'approve-transfer':null:record.pending?.to===baOwnerState.me?'cancel-transfer':record.pending?null:'request-transfer');
 if(action)send('baOwnerAction',{document:documentId,action,revision:record.revision});
}
function stageProgress(task,message,percent){
 for(const id of ['brGenerationProgress']){const box=$(id);if(box&&task!=='generate')box.classList.add('hidden');}
 if(['review','stopReview','skipReview','applyReview','stopApplyReview'].includes(task)){
  reviewStageState={task,message:message||'Processing…',percent};
  const label=$('baReviewStageMessage');label.textContent=reviewStageState.message;label.classList.remove('hidden');
  refreshBAHeadingProgress();
  return;
 }
 const id=task==='generate'?'brGenerationProgress':null; // Jira progress is shown only in the main workflow meter.
 if(!id)return;
 const root=$(id);root.classList.remove('hidden');root.replaceChildren();
 const text=document.createElement('div');text.className='ba-stage-message';
 const spinner=document.createElement('span');spinner.className='ba-spinner';spinner.setAttribute('aria-hidden','true');spinner.classList.toggle('hidden',Number.isFinite(percent));
 const label=document.createElement('span');label.textContent=message||'Processing…';text.append(spinner,label);
 const track=document.createElement('div');track.className='ba-stage-track';const bar=document.createElement('div');bar.className='ba-stage-fill';
 if(Number.isFinite(percent)){bar.style.width=Math.max(0,Math.min(100,percent))+'%';root.setAttribute('aria-valuenow',String(Math.max(0,Math.min(100,percent))));}else{bar.classList.add('indeterminate');root.removeAttribute('aria-valuenow');}
 root.setAttribute('aria-label',label.textContent);track.append(bar);root.append(text,track);
}
function jiraKeyNode(key){
 const value=String(key||'—'),base=String(jiraBrowseBaseUrl||'').replace(/\/$/,'');
 let allowed=false;try{const uri=new URL(base);allowed=uri.protocol==='https:'||uri.hostname==='localhost'&&uri.protocol==='http:';}catch{}
 const linked=allowed&&/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(value);
 const node=document.createElement(linked?'a':'span');node.textContent=value;
 if(linked){node.href=base+'/browse/'+encodeURIComponent(value);node.target='_blank';node.rel='noopener noreferrer';node.title='Open Jira issue '+value;}
 return node;
}
function jiraLinkCandidate(entry){
 return entry?.action==='create'?jiraLinkCandidates.find(item=>item.path===entry.path):null;
}
function jiraFixLinkButton(path,key){
 const fix=brElement('button','secondary jira-link-repair-action','Fix Jira Link');
 fix.type='button';fix.title='Verify the existing Jira issue and restore its ATGV link without creating, changing or deleting an issue.';
 fix.setAttribute('aria-label','Fix Jira link for '+key+' · '+path);
 fix.addEventListener('click',()=>{
  if(!brPlanRevision||baBusyTask||fix.disabled)return;
  fix.disabled=true;fix.textContent='Verifying…';
  baBusy('jiraFixLink','Verifying Jira link '+key+'…');
  send('brJiraFixLink',{revision:brPlanRevision,path,key});
 });
 return fix;
}
function jiraDetailsActions(entry,readOnly=false){
 const group=document.createElement('div');group.className='jira-preview-row-actions';
 group.append(jiraDetailsButton(entry,readOnly));
 const candidate=jiraLinkCandidate(entry);
 if(candidate)group.append(jiraFixLinkButton(entry.path,candidate.key));
 return group;
}
function renderJiraApprovalTable(){
 const root=$('brJiraApprovalTable');if(!root)return;
 const rows=jiraPlanForCR.map(entry=>({action:String(entry.action||'').toUpperCase(),kind:entry.kind||'Issue',type:jiraPreviewIssueTypes[entry.path]||'Not verified',path:entry.path||'',title:entry.title||'',key:entry.key||'—',approval:entry.requiresApproval?'Approval required':'Standard',entry}));
 ATGVDataTables.mount(root,rows,[
  {key:'action',label:'Action'},{key:'kind',label:'ATGV type'},{key:'type',label:'Jira type'},{key:'path',label:'BR path'},{key:'title',label:'Summary'},{key:'key',label:'Existing Jira key',render:row=>jiraKeyNode(row.key)},{key:'approval',label:'Approval'},
  {key:'details',label:'Details',sortable:false,render:row=>jiraDetailsActions(row.entry,true)}
 ],{label:'Jira preview items awaiting approval',pageSize:5,pinFirst:row=>!!jiraLinkCandidate(row.entry)});
}
function closeJiraIssuePreview(){
 const dialog=$('brJiraIssueModal');if(!dialog)return;
 dialog.classList.add('hidden');dialog.setAttribute('aria-hidden','true');
 $('brJiraIssueModalContent')?.replaceChildren();
}
$('brJiraIssueModalClose')?.addEventListener('click',closeJiraIssuePreview);
$('brJiraIssueModal')?.addEventListener('click',event=>{if(event.target===$('brJiraIssueModal'))closeJiraIssuePreview();});
document.addEventListener?.('keydown',event=>{if(event.key==='Escape'&&!$('brJiraIssueModal')?.classList.contains('hidden'))closeJiraIssuePreview();});
function jiraDetailsButton(entry,readOnly=false){
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=readOnly||entry.action==='retire'?'View details':'Edit Jira item';
 button.setAttribute('aria-label',button.textContent+' '+String(entry.title||entry.path));
 button.addEventListener('click',()=>renderJiraIssueDetails(entry,readOnly));return button;
}
function renderJiraIssueDetails(entry,readOnly=false,{automatic=false}={}){
 const dialog=$('brJiraIssueModal');
 const root=dialog?$('brJiraIssueModalContent'):$(readOnly?'brJiraApprovalDetails':'brJiraDetailsPanel');if(!root)return;
 root.replaceChildren();root.classList.remove('hidden');
 if(dialog){
  dialog.classList.remove('hidden');dialog.setAttribute('aria-hidden','false');
  const caption=$('brJiraIssueModalTitle');if(caption)caption.textContent='Jira Issue Preview · '+String(entry.key||entry.title||entry.path);
  $('brJiraIssueModalClose')?.focus?.();
 }
 const fieldPlan=typeof jiraPreviewFieldsByPath==='undefined'?null:jiraPreviewFieldsByPath?.[entry.path];
 const fieldInputs=[];
 const heading=document.createElement('h3');heading.textContent='Jira issue details';root.append(heading);
 const addValue=(label,value)=>{const group=document.createElement('div');group.className='jira-preview-detail';const title=document.createElement('strong');title.textContent=label;const text=document.createElement('div');text.className='jira-preview-detail-value';text.textContent=String(value||'Not specified');group.append(title,text);root.append(group);};
 addValue('Summary',entry.title);addValue('Action',String(entry.action||'').toUpperCase());addValue('Jira project',jiraPreviewProject||'Not verified');
 addValue('Jira issue type',jiraPreviewIssueTypes[entry.path]||'Not verified');
 addValue('ATGV issue type and path',(entry.kind||'Issue')+' · '+entry.path);
 const parentKey=entry.parent?brState?.synced?.[entry.parent]?.key:'';
 addValue('Parent',entry.parent?(entry.parent+(parentKey?' · '+parentKey:' · key assigned during publication')):'None');addValue('Existing Jira key',entry.key||'Not created yet');
 if(entry.action!=='retire'){
  addValue('Jira description to publish',fieldPlan?.description||entry.description||'Not specified');
  const approved=brState?.brs?.find(br=>br.id===String(entry.path||'').split('/')[0])?.approvedContent;
  addValue('Approved BR acceptance criteria (reference)',approved?.acceptanceCriteria||'Not specified');
  const hint=document.createElement('p');hint.className='muted';hint.textContent=entry.staleJiraDetails?'The approved BR changed. Review these saved details and save them again before approving the Jira preview.':'Criteria and completion checks use the configured Jira fields. The preview includes their description fallback when required.';root.append(hint);
  const form=document.createElement('div');form.className='jira-preview-detail-form';
  const inputs={};
  const originalText={};
  if(fieldPlan&&!readOnly){
   const saved=entry.staleJiraDetails||entry.jiraDetails||{};
   for(const [field,label,max] of [['summary','Summary',254],['description','Description',32000]]){
    const wrap=document.createElement('label');wrap.textContent=label;
    const input=document.createElement(field==='summary'?'input':'textarea');
    input.maxLength=max;
    if(field==='description')input.rows=5;
    input.value=field==='summary'?saved.summary??entry.title:saved.description??fieldPlan.baseDescription??entry.description;
    originalText[field]=input.value;inputs[field]=input;wrap.append(input);form.append(wrap);
   }
  }
  for(const [field,label] of [['acceptanceCriteria','Issue-specific acceptance criteria'],['definitionOfDone','Definition of done']]){
   const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('textarea');input.rows=4;input.maxLength=5000;input.value=entry.staleJiraDetails?.[field]||entry.jiraDetails?.[field]||fieldPlan?.details?.[field]||'';input.placeholder='Not specified';input.readOnly=readOnly;wrap.append(input);form.append(wrap);inputs[field]=input;
  }
  root.append(form);
  if(!readOnly){
   const propose=document.createElement('button');propose.type='button';propose.className='secondary';propose.textContent='Suggest AC & DoD (TRM reference)';
   const note=document.createElement('p');note.className='muted';note.classList.add('jira-template-suggestion-status');
   propose.addEventListener('click',()=>send('jiraTemplateSuggest',{path:entry.path,hash:entry.hash,revision:brPlanRevision,automatic,projectId:activeId,roleId:selectedRole}));
   root.append(propose,note);
   if(typeof window!=='undefined')window.atgvPendingJiraDetails={path:entry.path,acceptance:inputs.acceptanceCriteria,done:inputs.definitionOfDone};
 }
 if(!readOnly){const save=document.createElement('button');save.type='button';save.textContent='Save Jira details & refresh preview';save.addEventListener('click',()=>{
   if(!brPlanRevision||baBusyTask)return;
   baBusy('jiraDetails','Saving Jira details and refreshing the preview…');
   const draft={revision:brPlanRevision,path:entry.path,hash:entry.hash,acceptanceCriteria:inputs.acceptanceCriteria.value,definitionOfDone:inputs.definitionOfDone.value};
   if(fieldPlan){
    for(const field of ['summary','description'])if(inputs[field]?.value!==originalText[field])draft[field]=inputs[field].value;
    draft.fieldValues=changedJiraFieldInputs(fieldInputs);
   }
   if(automatic)Object.assign(draft,{automatic,projectId:activeId,roleId:selectedRole});
   send('brJiraSaveDetails',draft);
  });root.append(save);}
 }else addValue('Retirement','The existing issue will be marked obsolete; no description is replaced.');
 if(fieldPlan){
  const section=document.createElement('section');section.className='jira-preview-field-list';
  const title=document.createElement('h3');title.textContent='All available Jira fields ('+(fieldPlan.fields||[]).length+')';section.append(title);
  const explanation=document.createElement('p');explanation.className='muted';explanation.textContent='Values come from the approved BR, Jira defaults, or an existing issue. Choose valid Jira values for fields that need input.';section.append(explanation);
  const totals=fieldPlan.autofillSummary;
  if(totals){const summary=document.createElement('p');summary.className='muted';summary.textContent='Auto-filled: '+totals.mapped+' · Text placeholders: '+totals.textPlaceholders+' · Existing Jira values: '+totals.preserved+' · Jira defaults: '+totals.jiraDefaults+' · Preview-only / needs valid Jira value: '+totals.previewOnly;section.append(summary);}
  for(const field of fieldPlan.fields||[]){
   const row=document.createElement('div');row.className='jira-preview-field';
   const caption=document.createElement('strong');caption.textContent=field.name+(field.required?' · Required':'');
   const value=document.createElement('div');value.className='jira-preview-detail-value';value.textContent=field.display||'Information not available in the approved Business Requirements document.';
   const status=document.createElement('small');status.textContent='Field ID: '+field.id+' · Type: '+field.type+' · '+field.status+' · Source: '+field.source;
   row.append(caption,value,status);
   if(!readOnly&&entry.action!=='retire'&&field.editor&&!field.detailText){
    const input=jiraFieldInput(field.editor);
    input.control.setAttribute('aria-label',field.name);
    fieldInputs.push(input);row.append(input.control);
   }
   section.append(row);
  }
  for(const message of fieldPlan.blocking||[]){
   const warning=document.createElement('p');warning.setAttribute('role','alert');warning.textContent='Jira field requires attention: '+message;section.append(warning);
  }
  root.append(section);
 }
 const close=document.createElement('button');close.type='button';close.className='secondary jira-preview-details-close';close.textContent='Close';close.addEventListener('click',()=>{if(dialog)closeJiraIssuePreview();else{root.classList.add('hidden');root.replaceChildren();}});root.append(close);
 if(!dialog)root.scrollIntoView?.({block:'nearest',behavior:'smooth'});
}
function renderJiraPublishedItems(){
 const root=$('brJiraPublishedTable');if(!root||!brState)return;
 const plan=jiraPublicationPlan.length?jiraPublicationPlan:(brJiraPreviewApproved&&brPlanRevision?jiraPlanForCR:[]);
 const activeIds=activeBusinessRequirements().map(br=>br.id);
 const confirmed=Object.fromEntries(jiraPublicationConfirmed);
 const rows=ATGVJiraWorkflowTables.publishedRows({plan,confirmed,synced:brState.synced||{},activeIds,completed:jiraPublishState.phase==='completed'});
 ATGVDataTables.mount(root,rows,[
  {key:'action',label:'Action'},{key:'type',label:'Issue type'},{key:'path',label:'BR path'},{key:'title',label:'Summary'},
  {key:'key',label:'Jira key',render:row=>jiraKeyNode(row.key)},{key:'status',label:'Publication status'}
 ],{label:'Jira items in current Business Requirements publication',pageSize:5});
}
function renderJiraPublicationState(){
 const progress=$('jiraStageProgress'),statusNode=$('brJiraPublishStatus'),summary=$('brJiraPublishSummary'),resume=$('brJiraResume');
 if(!progress||!statusNode||!summary||!resume)return;
 const state=jiraPublishState;
 const phase=state.phase||'idle',total=Math.max(0,Number(state.total)||0),done=Math.min(total,Math.max(0,Number(state.confirmed)||0));
 const percent=phase==='completed'?100:total>0?Math.min(99,Math.floor(done/total*100)):0;
 const busy=['preparing','publishing','verifying'].includes(phase);
 const active=phase!=='idle';
 progress.classList.toggle('hidden',!busy);
 progress.classList.toggle('jira-progress-failed',phase==='failed');
 progress.setAttribute('aria-valuenow',String(phase==='completed'?100:percent));
 progress.setAttribute('aria-valuetext',`${done} of ${total} Jira changes confirmed, ${phase}`);
 progress.replaceChildren();
 if(active){
  const row=document.createElement('div');row.className='jira-progress-caption';
  const label=document.createElement('strong');label.textContent=phase==='completed'?'Publication completed':phase==='failed'?'Publication interrupted':phase==='verifying'?'Verifying publication':phase==='cancelled'?'Publication cancelled':'Publishing to Jira';
  const count=document.createElement('span');count.textContent=`${done} / ${total} confirmed · ${phase==='completed'?100:percent}%`;row.append(label,count);
  const track=document.createElement('div');track.className='ba-stage-track';const bar=document.createElement('div');bar.className='ba-stage-fill';bar.style.width=(phase==='completed'?100:percent)+'%';track.append(bar);progress.append(row,track);
 }
 statusNode.textContent=phase==='completed'?`Published · ${done} of ${total} Jira changes confirmed.`:phase==='idle'?'':state.message||'Jira publication needs attention.';
 statusNode.dataset.phase=phase;
 statusNode.classList.toggle('hidden',phase==='idle'||busy);
 const pending=Object.values(brState?.pending||{}).filter(item=>item&&item.action).length;
 summary.textContent=active?`${done} of ${total} confirmed Jira operations${pending?' · '+pending+' operation(s) awaiting reconciliation':''}`:`${brJiraPlanChanges} approved-plan changes${pending?' · '+pending+' pending Jira operation(s) require reconciliation':''}`;
 renderJiraPublishedItems();
 // A retry requires regenerating and approving a fresh preview, never resending a stale CREATE batch.
 const needsReconcile=phase==='failed'||(!busy&&pending>0);
 resume.classList.toggle('hidden',!needsReconcile);
 resume.disabled=busy||!!baBusyTask||!activeId;
}
function renderJiraApprovalSummary(){
 const root=$('brJiraApprovalSummary');if(!root)return;
 const actions=jiraPlanForCR||[];
 const counts={create:0,update:0,retire:0};for(const item of actions)if(Object.hasOwn(counts,item.action))counts[item.action]++;
 const quality=typeof ATGVJiraWorkflowTables==='undefined'?null:ATGVJiraWorkflowTables;
 const skipped=Math.max(0,Object.keys(brState?.synced||{}).length-counts.update-counts.retire);
 const storyMissing=actions.filter(e=>e.kind==='Story'&&e.action!=='retire'&&(!e.jiraDetails?.acceptanceCriteria||!e.jiraDetails?.definitionOfDone)).length;
 const message=jiraPreflightBlocked?`Jira Preflight blocked: ${brJiraPlanConflicts} issue(s) need resolution before preview. No Jira Preview has been created.`:!brPlanRevision?'Generate and inspect a Jira preview before approval.':`${actions.length} changes in the current approved Business Requirements cycle · ${counts.create} CREATE · ${counts.update} UPDATE · ${counts.retire} RETIRE. ${brJiraPlanConflicts?'Resolve '+brJiraPlanConflicts+' conflict(s) before approval.':'No blocking conflicts in preview.'}`;
 root.textContent=message+` · ${skipped} existing issue(s) unchanged (SKIP).`+(storyMissing?` ${storyMissing} Story item(s) need AC/DoD review; use View details → Suggest AC & DoD.`:'')+(brJiraPreviewApproved?' Preview approved; proceed to Step 10 to publish.':'');
}
function baBusy(task,message,percent){
 if(task)stageProgress(task,message,percent);
 else $('brGenerationProgress')?.classList.add('hidden');
 baBusyTask=task||'';
 $('baRunning').classList.toggle('hidden',!baBusyTask);
 if(task==='jiraSync'||task==='generate')$('baRunning').classList.add('hidden');
 $('baRunning').setAttribute('aria-busy',baBusyTask?'true':'false');
 $('baRunningText').textContent=message||'Processing…';
 $('baRunning').setAttribute('aria-label',`${message||'Processing…'}${Number.isFinite(percent)?' '+Math.round(percent)+'%':''}`);
 $('baRunning').querySelector('[role=progressbar]')?.setAttribute('aria-valuetext',message||'Processing…');
 renderDiscoverySummary();
}
function baReviewSkipped(){try{return JSON.parse(brState?.reviewText||'{}').skipped===true;}catch{return false;}}
function baReviewLocked(){try{const r=JSON.parse(brState?.reviewText||'{}');return (r.skipped===true||r.applied===true)&&brState.reviewRevision===brState.discoveryRevision;}catch{return false;}}
function baReviewCurrent(){return !!(brState?.reviewRevision&&brState.reviewRevision===brState.discoveryRevision&&!discoveryDirty);}
function baReviewMode(){return baReviewSkipped()?'skip':'run';}
function baReviewFinalized(){
 if(!baReviewCurrent())return false;
 const readiness=currentDiscoveryReadiness();
 if(readiness.filled!==readiness.total)return false;
 let review;try{review=JSON.parse(brState?.reviewText||'{}');}catch{return false;}
 return !!(review.skipped||review.applied||review.confirmed||(brState?.brs||[]).some(br=>br.status!=='retired'&&br.source?.discoveryRevision===brState.discoveryRevision));
}
function refreshBAHeadingProgress(){
 // The document count pill replaces the redundant full-width capacity bar.
 // Keep the hook for older view controllers without creating a progress element.
}
function sourceLifecycleForUI(doc){
 const selected=brState?.processedSources||[];
 const mapped=selected.includes(doc.digest)||(brState?.processedSources===null&&!!brState?.importEpoch)||(brState?.sourceHistory||[]).some(row=>row.action==='sources-selected'&&(row.digests||[]).includes(doc.digest));
 const dependent=(brState?.brs||[]).some(br=>(br.evidence||[]).some(item=>item.digest===doc.digest)||String(br.source?.name||'').split(' + ').includes(doc.name)||(mapped&&br.source?.digest===brState.importDigest));
 return mapped||dependent||!!(brState?.brs||[]).length&&!selected.length&&!!brState?.importEpoch;
}
// Archived files and their Jira/BR evidence remain in the project store, but
// archive management is no longer surfaced in Business Analysis.
function renderArchivedSources(){
 const root=$('archivedSources');if(!root)return;
 root.replaceChildren();root.classList.add('hidden');
}
function hasDedicatedPreflightRecovery(){
 return mappingRetryAvailable&&!discoveryImportBusy&&mappingFailurePhase==='preflight'&&baPreflightInfo?.phase==='blocked';
}
function renderSourcePreflight(){
 const panel=$('baSourcePreflight');if(!panel)return;
 const saved=(brState?.mappingCompleted?.preflights||[])[0];
 const savedCurrent=!discoveryImportBusy&&saved&&(brState?.sourceDocuments||[]).some(doc=>doc.digest===saved.digest);
 const info=baPreflightInfo|| (savedCurrent?{phase:'ready',sourceName:(brState?.sourceDocuments||[]).find(x=>x.digest===saved.digest)?.name||'',summary:saved.summary,applied:saved.applied,issues:saved.issues,resolutions:saved.resolutions,reportAvailable:true}:null);
 panel.classList.toggle('hidden',!info);
 const download=$('baPreflightDownload');
 if(download){const available=!!(info?.reportAvailable||(savedCurrent&&!baPreflightInfo));download.classList.toggle('hidden',!info);download.disabled=!available||!activeId;}
 const workingDownload=$('baWorkingBrDownload');
 if(workingDownload){const available=!!(savedCurrent&&saved?.workingBR);workingDownload.classList.toggle('hidden',!available);workingDownload.disabled=!available||!activeId;}
 const retry=$('baPreflightRetry');
 if(retry){const showRetry=hasDedicatedPreflightRecovery();retry.textContent=mappingResumeAvailable?'Resume AI Mapping':'Retry Mapping';retry.classList.toggle('hidden',!showRetry);retry.disabled=!showRetry||!brState||!sourceSelectedDigests.size||selectedRole!=='business-analyst'||!activeId;}
 const skip=$('baPreflightSkip');if(skip){
  const available=hasDedicatedPreflightRecovery();skip.classList.toggle('hidden',!available);
  skip.disabled=!available||!!baBusyTask||!brState||!sourceSelectedDigests.size||selectedRole!=='business-analyst'||!activeId;
 }
 window.ATGVBusinessRequirements?.syncDocumentActions?.();
 if(!info)return;
 const phase=info.phase||'checking',running=['preflight','repair','checking'].includes(phase);
 panel.dataset.phase=running?'running':phase;
 // Each new preflight phase defaults collapsed; reopening is the user's choice.
 if(panel.dataset.lastPhase!==phase){panel.open=false;panel.dataset.lastPhase=phase;}
 $('baSourcePreflightTitle').textContent=running?'AI document preflight · checking…':phase==='ready'?'AI document preflight · ready':phase==='blocked'?'AI document preflight · needs attention':'AI document preflight';
 $('baSourcePreflightMessage').textContent=info.summary||'Checking source quality and potential Developer RED/GREEN test blockers without changing the original uploaded file.';
 const fixes=Array.isArray(info.applied)?info.applied.length:0;
 const resolvedIssues=new Set((info.resolutions||[]).map(x=>String(x.issue||'').trim().toLowerCase()));
 const unresolvedIssues=(info.issues||[]).filter(x=>!resolvedIssues.has(String(x.detail||'').trim().toLowerCase()));
 const risks=unresolvedIssues.filter(x=>x.severity==='warning').length;
 const blockers=unresolvedIssues.filter(x=>x.severity==='blocker').length;
 $('baSourcePreflightCounts').textContent=`${fixes} safe text correction(s) · ${(info.resolutions||[]).length} industry-standard recommendation(s) (provisional) · ${risks} unresolved warning(s) · ${blockers} business blocker(s) · Original unchanged`;
 const detail=$('baSourcePreflightFindings');detail.replaceChildren();
 for(const fix of (info.applied||[]).slice(0,5)){
  const li=document.createElement('li');li.textContent=`Working BR: “${String(fix.before||'').slice(0,90)}” → “${String(fix.after||'').slice(0,90)}”`;detail.append(li);
 }
 for(const item of (info.resolutions||[]).slice(0,8)){
  const li=document.createElement('li');li.textContent='AI default ('+item.standard+', provisional): '+item.resolution;detail.append(li);
 }
 for(const item of unresolvedIssues.slice(0,8)){
  const li=document.createElement('li');li.textContent=(item.severity==='blocker'?'Unresolved business conflict: ':'AI observation: ')+item.detail+(item.suggestion?' — '+item.suggestion:'');detail.append(li);
 }
}
$('baPreflightDownload').addEventListener('click',()=>{
 const button=$('baPreflightDownload');
 if(button.disabled||!activeId)return;
 button.disabled=true;
 send('downloadDocumentPreflight',{projectId:activeId});
});
$('baWorkingBrDownload').addEventListener('click',()=>{
 if($('baWorkingBrDownload').disabled||!activeId)return;
 $('baWorkingBrDownload').disabled=true;send('downloadISO29148BRPDF',{projectId:activeId});
});
function renderSourceDocuments(){
 const root=$('sourceDocuments');root.replaceChildren();
 const fileToolbar=$('baAutoFileActions');if(fileToolbar)fileToolbar.replaceChildren();
 renderSourcePreflight();
 const files=brState?.sourceDocuments||[];
 // Older interrupted mappings could persist a source selection without a
 // completed mapping. Restore that selection so the analyst can retry it.
 if(!baMappingComplete()&&!discoveryImportBusy&&!sourceSelectedDigests.size){
  const processed=brState?.processedSources||[];
  for(const file of files)if(processed.includes(file.digest))sourceSelectedDigests.add(file.digest);
 }
 refreshBAHeadingProgress();
 const validSelection=[...sourceSelectedDigests].filter(x=>files.some(f=>f.digest===x));
 if(validSelection.length!==sourceSelectedDigests.size){sourceSelectedDigests=new Set(validSelection);if(activeId)send('baSourceSelection',{digests:validSelection});}
 $('sourceDocumentCount').textContent=`${files.length} / 1`;
 if(!files.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='No active documents. Upload a Word or PDF file. Approved BRs and Jira are preserved.';root.append(empty);renderArchivedSources();renderSourceSelection();return;}
 for(const doc of files){
  const item=document.createElement('div');item.className='source-document-row';
  const info=document.createElement('div');info.className='source-document-info';
  const selector=document.createElement('input');selector.type='checkbox';selector.className='source-select-radio';selector.setAttribute('aria-label','Select '+doc.name+' for 12-question processing');selector.checked=sourceSelectedDigests.has(doc.digest);
  selector.disabled=!!baBusyTask||baMappingComplete()||!baCanEdit('ba-discovery');
  selector.classList.remove('hidden'); // Locked sources remain visible for audit after mapping.
  selector.addEventListener('change',()=>{if(selector.checked)sourceSelectedDigests.add(doc.digest);else sourceSelectedDigests.delete(doc.digest);send('baSourceSelection',{digests:[...sourceSelectedDigests]});renderSourceSelection();});
  const name=document.createElement('strong');name.textContent=doc.name;
  const exactFileVerified=/^[a-f0-9]{64}$/.test(String(doc.byteDigest||''));
  const fullMeta=['Uploaded by '+(doc.uploadedBy||'Legacy source · uploader unavailable'),doc.uploadedAt?formatDateTime(doc.uploadedAt):doc.addedAt?formatDateTime(doc.addedAt):'',Number(doc.characters||0).toLocaleString()+' characters',doc.version?'Version '+doc.version:'Version 1',!doc.storedName?'Re-upload required to process':exactFileVerified?'Original file fingerprint recorded':'Legacy source: re-upload required to verify original bytes'].filter(Boolean).join(' · ');
  const detail=document.createElement('small');
  detail.textContent=[doc.version?'Version '+doc.version:'Version 1',doc.uploadedAt?formatDateTime(doc.uploadedAt):doc.addedAt?formatDateTime(doc.addedAt):'',Number(doc.characters||0).toLocaleString()+' characters'].filter(Boolean).join(' · ');
  detail.title=fullMeta;
  info.title=doc.name+' · '+fullMeta;
  info.append(name,detail);
  const actions=document.createElement('div');actions.className='source-document-actions';
  const replace=document.createElement('button');replace.type='button';replace.className='secondary ba-process-btn';
  replace.textContent='Replace & Reprocess';replace.title='Safely replace this source with an updated Word/PDF (even with a different filename). Old evidence, approved BR history and existing Jira keys are retained; remapping runs automatically.';
  replace.disabled=!!baBusyTask||!!sourceRemoving||discoveryImportBusy||brDeletionBusy||!baCanEdit('ba-discovery')||Object.keys(brState?.pending||{}).length>0;
  replace.addEventListener('click',()=>{
    if(replace.disabled||discoveryImportBusy)return;
    setDiscoveryImportBusy(true,'Select the updated document; old evidence and Jira remain unchanged until validation succeeds…');
    send('replaceDiscoverySource',{roleId:selectedRole,digest:doc.digest,revision:brState.revision});
  });
  const remove=document.createElement('button');remove.type='button';remove.className='secondary ba-process-btn archive-remote-delete br-danger';
  remove.textContent='Delete';remove.title='Destructive: permanently delete this source and its linked BR/Jira/Confluence records after verification and separate confirmation. Replace & Reprocess retains existing approvals and Jira.';
  remove.dataset.brDeleteAction='true';
  remove.disabled=!!baBusyTask||!!sourceRemoving||brDeletionBusy||!baCanEdit('ba-discovery');
  remove.addEventListener('click',()=>{if(remove.disabled)return;requestBRDeletion({target:'active-source',digest:doc.digest,revision:brState.revision});});
  actions.append(replace,remove);
  // Keep document tools in a single toolbar; preserve their original click handlers.
  if(fileToolbar&&$('discoveryView')?.classList.contains('ba-automatic-view')){
   fileToolbar.append(actions);item.append(selector,info);
  }else item.append(selector,info,actions);
  root.append(item);
 }
 renderArchivedSources();
 renderSourceSelection();
 window.ATGVBusinessRequirements?.syncDocumentActions?.();
}
function renderSourceSelection(){
 const count=sourceSelectedDigests.size;
 $('sourceSelectionCount').textContent=count?`${count} of ${(brState?.sourceDocuments||[]).length} selected`:'';
 updateSourceSubmitButton();
 $('sourceSelectionActions').classList.remove('hidden');
}
// The submit control becomes an explicit next-step action only when the
// submitted source mapping has finished. No premature transition during AI work.
function updateSourceSubmitButton(){
 const button=$('sourceProcessSubmit');
 const complete=baMappingComplete();
 const processing=discoveryImportBusy||!!baBusyTask;
 button.dataset.action=complete?'next':processing?'processing':'submit';
 button.textContent=complete?'Next Step · Map & Save 12':processing?'Processing Documents…':'Submit Selected Documents';
 button.title=complete?'Open Map & Save 12':processing?'Document mapping is in progress':'Submit selected documents for discovery mapping';
 const selectable=!!(brState?.sourceDocuments||[]).length&&!!activeId&&selectedRole==='business-analyst';
 button.disabled=processing||!selectable||(complete?false:!sourceSelectedDigests.size||!!discoveryImportProposal||!baCanEdit('ba-discovery'));
 button.classList.toggle('ba-step-next-complete',complete);
 button.classList.toggle('secondary',complete);
 button.classList.toggle('hidden',complete); // Navigation now lives in #baStepNavigation.
}
// The persistent header action starts a new BR cycle and opens the native upload
// picker. If a fresh cycle already exists (e.g. a cancelled picker), resume it
// without archiving history or creating another empty cycle.
function beginNewBusinessRequirement(event){
 if(event?.currentTarget?.disabled||!brState||!activeId)return;
 // The action is always clickable in Start, including during an unfinished
 // requirement. Block unsafe interruption explicitly instead of disabling it.
 if(baBusyTask||discoveryImportBusy||brEditorSaving||discoveryDirty||brEditorDirty||window.ATGVBusinessRequirements?.dirty()||Object.keys(brState.pending||{}).length){
  status('Finish the current operation, save unsaved changes and resolve pending Jira operations before starting a new Business Requirement.',true);
  return;
 }
 if(brState.restartPending&&!(brState.sourceDocuments||[]).length){
  if(view!=='discovery')navigate('discovery');
  baViewedStep='upload';renderDiscoverySummary();triggerDiscoveryImport();return;
 }
 // The host confirms archival of an unfinished cycle before any changes.
 send('startOrRestartBusinessRequirements',{revision:brState.revision,openUploadImmediately:true});
}
$('baNewRequirement').addEventListener('click',beginNewBusinessRequirement);
$('baStartMyWork').addEventListener('click',()=>{navigate('sdlc-roles');send('deliveryRefresh');send('roleHandoffOwners');});
$('baStartSolutionDesigns').addEventListener('click',()=>navigate('planning'));
$('baStartSDLCReadiness').addEventListener('click',()=>navigate('flow'));
// The review confirmation is an explicit BA action, not an implicit status
// transition. Keep it clickable when cached UI ownership or readiness is stale;
// show a precise reason instead of silently swallowing clicks. The host always
// revalidates saved answers, current review and verified BA identity.
function confirmSavedBAReview(){
 if(baBusyTask){
  status('Another Business Requirements operation is still running ('+baBusyTask+'). Finish or stop it before confirming AI Review.',true);
  return;
 }
 if(discoveryImportBusy){
  status('Document mapping is still running. Finish or stop mapping before confirming AI Review.',true);
  return;
 }
 if(!activeId||selectedRole!=='business-analyst'){
  status('Open Business Analyst · My Work for this project before confirming the review.',true);
  return;
 }
 if(!brState?.reviewRevision||brState.reviewRevision!==brState.discoveryRevision){
  status('The AI Review is no longer current. Save your discovery answers and run AI Review again.',true);
  return;
 }
 if(discoveryDirty||discoveryAutosaving){
  status('Save the edited discovery answers before confirming AI Review. The saved review cannot be applied to unsaved changes.',true);
  return;
 }
 const readiness=currentDiscoveryReadiness();
 if(readiness.filled!==readiness.total){
  const missing=(readiness.missing||[]).slice(0,3).map(x=>x.label).filter(Boolean);
  status('Complete and save all 12 discovery answers before confirming AI Review ('+readiness.filled+'/'+readiness.total+' complete'+(missing.length?'; missing: '+missing.join(', '):'')+').',true);
  return;
 }
 // The host verifies the current identity directly; a delayed owner poll must
 // not make this visibly available action impossible to click.
 baBusy('confirmReview','Verifying saved AI findings and Business Analyst identity…');
 send('confirmDiscoveryReview',{projectId:activeId,discoveryRevision:brState.discoveryRevision});
}
$('baReviewFinish').addEventListener('click',confirmSavedBAReview);
$('baOpenChangeProposal').addEventListener('click',()=>{baShowChangeProposal=!baShowChangeProposal;renderDiscoverySummary();if(baShowChangeProposal){const pane=document.querySelector('.change-proposal-panel');pane.open=true;pane.scrollIntoView({block:'start',behavior:'smooth'});}});
$('baReviewRegenerate').addEventListener('click',()=>{
 if($('baReviewRegenerate').disabled||baBusyTask||discoveryDirty)return;
 reviewStopReason='';baBusy('review','Regenerating and validating AI Review with your feedback…');
 send('copilotDiscovery',{feedback:$('baReviewFeedback').value.slice(0,1500)});
});

$('sourceProcessSubmit').addEventListener('click',()=>{
 if($('sourceProcessSubmit').disabled||!brState)return;
 if($('sourceProcessSubmit').dataset.action==='next'){
  openBAWorkflowStep('mapping');return;
 }
 if($('sourceProcessSubmit').dataset.action!=='submit')return;
 mappingRetryAvailable=false;mappingFailureMessage='';mappingFailurePhase='';mappingRunPhase='preparing';
 baPreflightInfo=null;renderSourcePreflight();
 discoveryImportProposal=null;discoveryImportQueue=[];renderDiscoveryImportProposal();
 dismissObsoleteBARestartNotice();
 setDiscoveryImportBusy(true,'Preparing selected documents for 12-question mapping…');
 send('processDiscoverySources',{digests:[...sourceSelectedDigests],revision:brState.revision});
});
function baPublishedCurrent(){
 if(!brState||(!Object.keys(brState.synced||{}).length&&!(brState.jiraLinkReconciliations||[]).length)||brState.jiraPendingChanges!==0)return false;
 if(Object.keys(brState.pending||{}).length)return false;
 if((brState.inboundJira||[]).some(x=>x.status==='pending'||x.status==='reviewed'))return false;
 const active=activeBusinessRequirements();
 return active.length>0&&active.every(br=>br.status==='approved'&&!br.needsRefresh&&!br.externalReviewRequired&&!br.roleReviewRequired&&!br.dependencyReviewRequired);
}
// Read-only completed cycle index: live approved BRs and persisted cycle snapshots.
// No historical action is allowed to silently change an approved BR or Jira issue.
function completedBARecords(){
 const history=[...(brState?.completedCycles||[])];
 if(baPublishedCurrent()){
  const active=activeBusinessRequirements().filter(br=>br.status==='approved'&&br.approvedContent);
  history.push({id:'current',completedAt:'',isCurrent:true,
   sources:brState?.sourceDocuments||[],discoveryAnswers:brState?.discoveryAnswers||{},relatedDocuments:brState?.links||{},
   requirements:active.map(br=>({id:br.id,title:br.approvedContent.title,
    approvedRevision:br.approvedRevision||br.revisionNumber||0,sourceName:br.source?.name||'',approvedContent:br.approvedContent,
    jiraKey:brState.synced?.[br.id]?.key||'',jiraIssues:Object.entries(brState.synced||{}).filter(([path])=>path===br.id||path.startsWith(br.id+'/')).map(([path,issue])=>({path,key:issue.key,kind:issue.kind||'',title:issue.title||''})).filter(item=>item.key)}))});
 }
 if(!history.length){
  // Migration view for projects restarted before completedCycles existed.
  const archived=(brState?.brs||[]).filter(br=>br.archivedFromRestart&&br.approvedContent);
  if(archived.length)history.push({id:'legacy',completedAt:'',isCurrent:false,sources:brState?.archivedSources||[],relatedDocuments:brState?.links||{},requirements:archived.map(br=>({id:br.id,title:br.approvedContent.title,approvedRevision:br.approvedRevision||0,sourceName:br.source?.name||'',jiraKey:brState?.synced?.[br.id]?.key||'',jiraIssues:Object.entries(brState?.synced||{}).filter(([path])=>path===br.id||path.startsWith(br.id+'/')).map(([path,issue])=>({path,key:issue.key,kind:issue.kind||'',title:issue.title||''}))}))});
 }
 // Do not edit published-cycle snapshots. Hide explicitly reconciled (404)
 // Jira links only in the presentation; retain the originals for auditing.
 const reconciled=(brState?.jiraLinkReconciliations||[]);
 return ATGVCompletedBRHistory.recover(history.reverse(),brState||{}).map(cycle=>({...cycle,requirements:(cycle.requirements||[]).map(br=>{
  const keys=new Set(reconciled.filter(entry=>entry.brId===br.id).flatMap(entry=>(entry.rows||[]).map(row=>row.key)));
  if(!keys.size)return br;
  return {...br,jiraIssues:(br.jiraIssues||[]).filter(issue=>!keys.has(issue.key)),jiraKey:keys.has(br.jiraKey)?'':br.jiraKey};
 })}));
}
// Keep Jira-only Epics discoverable when the local BR register is missing or
// a different project folder was opened. This is not an approval recovery tool:
// no Jira issue becomes a completed ATGV BR without its original evidence.
function renderBAJiraBackedEpics(){
 const root=$('baJiraBackedEpics');if(!root)return;
 // Preserve expanded Jira-only BRs across inventory refreshes just like completed BRs.
 const expandedKeys=new Set([...root.querySelectorAll('details.ba-jira-only-br-section[open]')].map(node=>node.dataset.jiraKey));
 root.replaceChildren();
 const projectKey=String(projectConnectionsSnapshot.jira?.key||'').trim().toUpperCase();
 const inScope=!!activeId&&jiraInventoryProject===activeId&&jiraInventoryKey===projectKey;
 const supplied=Array.isArray(arguments[0]),known=new Set();
 if(!supplied)for(const group of ATGVCompletedBRHistory.group(completedBARecords())){
  for(const snapshot of group.snapshots||[]){
   if(snapshot.br?.jiraKey)known.add(String(snapshot.br.jiraKey));
   for(const issue of snapshot.br?.jiraIssues||[])if(issue.key)known.add(String(issue.key));
  }
 }
 const rows=supplied?arguments[0]:inScope&&typeof ATGVBAJiraEpics!=='undefined'
  ?ATGVBAJiraEpics.unlinkedEpics(jiraInventoryItems,known,projectKey):[];
 if(!rows.length){if(typeof baRequirementModalTarget!=='undefined'&&baRequirementModalTarget?.kind==='jira')syncBARequirementModal();return;}
 const visibleRows=rows.slice(0,50);
 if(typeof baRequirementModalTarget!=='undefined'&&baRequirementModalTarget?.kind==='jira'){
  const selected=rows.find(item=>item.key===baRequirementModalTarget.rootKey);
  if(selected&&!visibleRows.includes(selected))visibleRows.push(selected);
 }
 for(const item of visibleRows){
  // Use the same details/summary/classes as approved BR history: only the data
  // and available actions differ, never the visual style or accordion behavior.
  const card=document.createElement('details');card.className='ba-completed-br-section ba-jira-only-br-section';
  card.dataset.jiraKey=item.key;card.open=expandedKeys.has(item.key);
  const heading=document.createElement('summary');heading.className='ba-completed-br-heading';
  const title=String(item.summary||'').replace(/^\s*BR-[0-9]+\s*(?:[:·.\-–—]|\s)\s*/i,'').trim();
  heading.append(brElement('strong','ba-completed-br-title',item.brId?item.brId+' · '+(title||item.summary):item.summary));
  heading.append(brElement('span','ba-completed-br-meta',(item.status||'Status unknown')+' · Unlinked to local BR'));
  // Mirror the completed BR's action alignment, but never present missing
  // discovery answers as accessible or reconstructed from Jira.
  const answers=baIconAction(brElement('button','secondary ba-view-br-answers ba-jira-answers-unavailable'),'▤','Discovery answers unavailable in this project');
  answers.type='button';answers.disabled=true;answers.title='Discovery answers unavailable in this ATGV project';
  answers.setAttribute('aria-label','View 12 Answers unavailable: discovery evidence is not stored in this ATGV project');
  heading.append(answers);
  const open=baIconAction(brElement('button','secondary ba-view-jira'),'↗','View Jira · '+item.linkedIssueCount+' linked issues');
  open.type='button';open.title='Open Jira Epic '+item.key;
  open.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openJiraIssueModal(item.key);});
  open.addEventListener('keydown',event=>event.stopPropagation());
  heading.append(open);
  if(item.brId){
   const recover=baIconAction(brElement('button','secondary ba-recover-confluence'),'↺','Recover BR from verified Confluence source');
   recover.type='button';recover.title='Restore only from the verified Confluence Source Vault. No Jira issue is deleted.';
   recover.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();
    send('recoverJiraOnlyBR',{projectId:activeId,brId:item.brId,jiraKey:item.key});
   });
   heading.append(recover);
   const remove=baIconAction(brElement('button','secondary ba-jira-only-delete','🗑'),'🗑','Review and delete this Jira BR and linked issues');
   remove.type='button';
   remove.title='Eligible only when your Jira account ID matches this Epic Creator or Reporter AND Jira grants Delete Issues permission. Review all descendants first.';
   remove.setAttribute('aria-label','Review deletion eligibility and complete Jira hierarchy for '+item.brId);
   remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();
    send('deleteJiraOnlyBROwned',{projectId:activeId,brId:item.brId,jiraKey:item.key});
   });
   heading.append(remove);
  }
  card.append(heading);
  const body=brElement('div','ba-completed-br-body');
  const info=brElement('div','ba-jira-recovery-info');
  info.append(brElement('small','muted',item.key+' · '+(item.status||'Status unknown')+' · '+item.linkedIssueCount+' Jira descendant(s) verified by parent links · Unlinked to local BR'));
  info.append(brElement('small','muted ba-jira-evidence-help','Original 12 discovery answers and uploaded file are not stored in this project; Jira alone cannot reconstruct it. Recover from verified Confluence evidence when possible. A matching Jira Epic Creator or Reporter may request deletion of this Epic and its complete parent-linked hierarchy, with Jira permissions and confirmation.'));
  body.append(info);card.append(body);root.append(card);
 }
 if(rows.length>50)root.append(brElement('p','muted',String(rows.length-50)+' additional unlinked Epics: use the Jira inventory below.'));
 if(jiraInventoryRunning)root.append(brElement('p','muted','Jira search is still running; counts may increase.'));
 if(typeof baRequirementModalTarget!=='undefined'&&baRequirementModalTarget?.kind==='jira')syncBARequirementModal();
}
function renderBACompletedRecords(){
 const section=$('baCompletedSection'),root=$('baCompletedList'),actions=$('baCompletedActions');
 const evidenceScopes=[root,$('baRequirementModalContent')];
 const expandedBrIds=new Set(evidenceScopes.flatMap(scope=>[...scope.querySelectorAll('details.ba-completed-br-section[open]')]).map(item=>item.dataset.requirementTarget));
 const activeEvidenceTabs=new Map(evidenceScopes.flatMap(scope=>[...scope.querySelectorAll('.ba-completed-tabs[data-tab-key]')]).map(node=>[node.dataset.tabKey,node.querySelector('[role="tab"][aria-selected="true"]')?.dataset.tab||'requirement']));
 const records=completedBARecords();root.replaceChildren();
 const grouped=ATGVCompletedBRHistory.group(records);
 renderBAJiraBackedEpics();
 // Visibility is controlled by the selected Start milestone in renderDiscoverySummary().
 const toolbar=document.querySelector('.ba-step-reopen');
 if(toolbar){
  // Reparent the SAME controls, never duplicate event handlers or actions.
  const target=baPublishedCurrent()?actions:document.querySelector('#brCompareModal');
  if(baPublishedCurrent()&&toolbar.parentElement!==actions)actions.append(toolbar);
  else if(!baPublishedCurrent()&&toolbar.parentElement===actions)target.before(toolbar);
 }
 // A BR is the top-level unit, not a publication cycle. Revisions of that BR
 // remain within its own section even if it was published in several cycles.
 function completedJiraLink(node){
  const base=String(jiraBrowseBaseUrl||'').replace(/\/$/,'');
  const safe=/^https:\/\/[A-Za-z0-9.-]+$/.test(base)&&/^[A-Z][A-Z0-9_]+-\d+$/.test(node.key);
  const link=document.createElement(safe?'a':'span');link.className='ba-jira-node-link';link.textContent=node.key;
  if(safe){link.href=base+'/browse/'+encodeURIComponent(node.key);link.target='_blank';link.rel='noopener noreferrer';link.addEventListener('click',event=>event.stopPropagation());}
  return link;
 }
 function completedJiraNode(node,depth=0){
  const hasChildren=node.children.length>0;
  const wrapper=document.createElement(hasChildren?'details':'div');wrapper.className='ba-jira-tree-node';
  if(hasChildren&&depth===0)wrapper.open=true;
  const heading=brElement(hasChildren?'summary':'div','ba-jira-tree-line');
  heading.append(completedJiraLink(node));
  if(depth>0)heading.append(brElement('span','ba-jira-tree-kind',node.kind));
  if(node.title&&depth>0)heading.append(brElement('span','ba-jira-tree-title',node.title));
  if(hasChildren)heading.append(brElement('span','ba-jira-tree-children',`${node.descendants} linked`));
  wrapper.append(heading);
  if(hasChildren){
   const children=brElement('div','ba-jira-tree-children-list');
   for(const child of node.children)children.append(completedJiraNode(child,depth+1));
   wrapper.append(children);
  }
  return wrapper;
 }
 function renderCompletedJiraTable(card,br,tree){
  if(!tree.count)return;
  const grid=brElement('div','ba-completed-jira-table');
  card.append(grid);
  if(typeof ATGVDataTables==='undefined'){
   // Keep all mappings discoverable if the UI component is unavailable.
   tree.roots.forEach(node=>grid.append(completedJiraNode(node)));return;
  }
  const roots=tree.roots.map(node=>({...node,search:node.searchText}));
  ATGVDataTables.mount(grid,roots,[
   {key:'key',label:'Jira issue',render:node=>completedJiraNode(node)},
   {key:'kind',label:'Type'},
   {key:'title',label:'Summary'},
   {key:'descendants',label:'Linked issues',render:node=>node.descendants?String(node.descendants):'—'}
  ],{label:'Published Jira issues for '+br.id,pageSize:5});
  const search=grid.querySelector('.atgv-datatable-search');
  if(search)search.addEventListener('input',()=>{
   // A matching descendant remains accessible even when the parent was collapsed.
   if(search.value.trim())grid.querySelectorAll('.ba-jira-tree-node').forEach(item=>{if(item.tagName==='DETAILS')item.open=true;});
  });
 }
 function appendSnapshot(card,br,cycle){
  card.append(brElement('small','muted',`Approved revision ${br.approvedRevision||1} · ${cycle.isCurrent?'Current published cycle':cycle.completedAt?'Published '+formatDateTime(cycle.completedAt):'Previous published cycle'}`));
  const sources=(cycle.sources||[]).filter(source=>String(br.sourceName||'').split(' + ').includes(source.name));
  const tree=ATGVCompletedBRHistory.jiraTree(br);
  const sourceBox=brElement('div','ba-completed-ref ba-completed-source');
  sourceBox.append(brElement('b','','Source documents: '));
  if(sources.length){
   sources.forEach((source,index)=>{
    if(index)sourceBox.append(document.createTextNode(', '));
    const label=`${source.name} (v${source.version||1})`;
    if(source.digest&&source.storedName){
     const link=brElement('button','ba-completed-source-download',label);link.type='button';
     link.title='Download source document: '+source.name;link.setAttribute('aria-label','Download source document '+source.name);
     link.dataset.noActionIcon='true';
     link.addEventListener('click',()=>send('downloadBRSourceDocument',{brId:br.id,sourceDigest:source.digest}));
     sourceBox.append(link);
    }else sourceBox.append(document.createTextNode(label));
   });
  }else sourceBox.append(document.createTextNode(br.sourceName||'Not available'));
  if(tree.count)sourceBox.append(brElement('span','ba-completed-source-count',` · ${tree.count} issue${tree.count===1?'':'s'}`));
  card.append(sourceBox);
  const reconciled=(brState?.jiraLinkReconciliations||[]).filter(entry=>entry.brId===br.id).flatMap(entry=>entry.rows||[]);
  if(reconciled.length)card.append(brElement('small','muted',`${new Set(reconciled.map(row=>row.key)).size} Jira reference(s) reconciled locally (HTTP 404 / permission ambiguity); original links retained in the audit.`));
  const related=Object.entries(cycle.relatedDocuments||{}).filter(([key])=>key===br.id||key.startsWith(br.id+'/'));
  if(related.length){const docs=brElement('div','ba-completed-ref');docs.append(brElement('b','','Related documents: '),document.createTextNode(related.map(([key])=>key).join(', ')));card.append(docs);}
  const sdlcDocs=(unifiedRepository?.documents||[]).filter(doc=>doc.kind!=='br'&&doc.kind!=='alias'&&
   (doc.sourceRefs||[]).some(ref=>ref.id===br.id)&&doc.status!=='placeholder');
  if(sdlcDocs.length){
   const relatedBox=brElement('div','ba-completed-related');relatedBox.append(brElement('b','','Related SDLC documents'));
   for(const doc of sdlcDocs){
    const row=brElement('div','ba-completed-related-row');
    row.append(brElement('span','',`${doc.title||doc.id} · ${doc.status||'draft'} · Confluence: ${doc.confluence?.state||'not synced'}`));
    const btn=brElement('button','secondary','Open');btn.type='button';
    btn.addEventListener('click',()=>{if(doc.kind==='design')navigate('planning');else if(doc.roleId&&doc.taskId)send('openTaskDocument',{roleId:doc.roleId,taskId:doc.taskId});});
    btn.disabled=doc.kind!=='design'&&(!doc.roleId||!doc.taskId);
    row.append(btn);relatedBox.append(row);
   }card.append(relatedBox);
  }
  const approved=br.approvedContent||brState?.brs?.find(item=>item.id===br.id)?.approvedContent;
  const answers=Object.entries(cycle.discoveryAnswers||{});
  if(approved||answers.length){
   const evidence=brElement('div','ba-completed-evidence-tabs');
   const tabs=brElement('div','ba-completed-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',`Evidence for ${br.id}`);
   // Historical revisions have independent tabs and preserve selection after a refresh.
   const tabKey=String(cycle.id||'current')+':'+br.id+':'+String(br.approvedRevision||1);
   tabs.dataset.tabKey=tabKey;
   const options=[];
   if(approved)options.push({id:'requirement',label:'Approved Requirement',tooltip:'View approved requirement',body:'Objective\n'+(approved.objective||'')+'\n\nScope\n'+(approved.scope||'')+'\n\nAcceptance criteria\n'+(approved.acceptanceCriteria||'')});
   if(answers.length)options.push({id:'answers',label:'Discovery Answers',tooltip:'View saved discovery answers',body:answers.map(([key,value])=>key+'\n'+value).join('\n\n')});
   const panels=[];
   for(const option of options){
    const tab=brElement('button','secondary ba-completed-tab',option.label);tab.type='button';tab.dataset.tab=option.id;
    tab.title=option.tooltip;tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.tabIndex=-1;
    const panel=brElement('section','ba-completed-tab-panel');panel.setAttribute('role','tabpanel');panel.hidden=true;
    const panelId='ba-evidence-'+String(br.id).replace(/[^A-Za-z0-9_-]/g,'-')+'-'+String(cycle.id||'current').replace(/[^A-Za-z0-9_-]/g,'-')+'-'+String(br.approvedRevision||1)+'-'+option.id;const tabId=panelId+'-tab';
    tab.id=tabId;panel.id=panelId;tab.setAttribute('aria-controls',panelId);panel.setAttribute('aria-labelledby',tabId);
    panel.append(brElement('pre','',option.body));
    tabs.append(tab);panels.push({tab,panel,id:option.id});evidence.append(panel);
   }
   function selectEvidenceTab(id){
    for(const item of panels){const selected=item.id===id;item.tab.setAttribute('aria-selected',String(selected));item.tab.tabIndex=selected?0:-1;item.panel.hidden=!selected;}
   }
   for(const item of panels){
    item.tab.addEventListener('click',()=>selectEvidenceTab(item.id));
    item.tab.addEventListener('keydown',event=>{
     if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
     event.preventDefault();const index=panels.indexOf(item);const next=event.key==='Home'?0:event.key==='End'?panels.length-1:(index+(event.key==='ArrowRight'?1:-1)+panels.length)%panels.length;
     selectEvidenceTab(panels[next].id);panels[next].tab.focus();
    });
   }
   evidence.prepend(tabs);
   selectEvidenceTab(activeEvidenceTabs.get(tabKey)&&options.some(o=>o.id===activeEvidenceTabs.get(tabKey))?activeEvidenceTabs.get(tabKey):options[0].id);
   card.append(evidence);
  }
 }
 let groupIndex=0;
 for(const group of grouped){
  const target=group.id||'local-index:'+groupIndex;groupIndex++;
  const details=document.createElement('details');details.className='ba-completed-br-section';details.dataset.requirementId=group.id;details.dataset.requirementTarget=target;details.open=expandedBrIds.has(target);
  const heading=document.createElement('summary');heading.className='ba-completed-br-heading';
  heading.append(brElement('strong','ba-completed-br-title',group.title));
  const latest=group.snapshots[0]?.br;
  const localBR=brState?.brs?.find(b=>b.id===group.id);
  const updatedBR=localBR?.externalReviewRequired||localBR?.needsRefresh;
  heading.append(brElement('span','ba-completed-br-meta',`${group.snapshots.length>1?group.snapshots.length+' published revisions · ':''}Approved R${latest?.approvedRevision||1}${updatedBR?' · Updated · Review required':' · Completed'}`));
  const latestTree=latest?ATGVCompletedBRHistory.jiraTree(latest):{count:0};
  if(group.snapshots.some(snapshot=>Object.keys(snapshot.cycle?.discoveryAnswers||{}).length>0)){
   const viewAnswers=baIconAction(brElement('button','secondary ba-view-br-answers'),'▤','View saved discovery answers');
   viewAnswers.type='button';viewAnswers.title='Expand the completed BR and view saved discovery answers';
   viewAnswers.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();details.open=true;
    const answerTab=details.querySelector('.ba-completed-tabs [data-tab="answers"]');
    if(answerTab)answerTab.click();
    details.scrollIntoView?.({behavior:'smooth',block:'nearest'});
   });
   viewAnswers.addEventListener('keydown',event=>event.stopPropagation());
   heading.append(viewAnswers);
  }
  if(latestTree.count){
   const viewJira=baIconAction(brElement('button','secondary ba-view-jira'),'↗','View Jira · '+latestTree.count+' linked issues');
   viewJira.type='button';viewJira.title=`View Jira · ${latestTree.count} linked`;
   viewJira.addEventListener('click',event=>{event.stopPropagation();openBRJiraInventory(group.id);});
   viewJira.addEventListener('keydown',event=>event.stopPropagation());
   heading.append(viewJira);
  }
  details.append(heading);
  const body=brElement('div','ba-completed-br-body');
  if(group.snapshots.length){
   const current=brElement('div','ba-completed-br');appendSnapshot(current,group.snapshots[0].br,group.snapshots[0].cycle);body.append(current);
  }
  const registered=brState?.brs?.find(item=>item.id===group.id);
  if(registered&&baCanEdit('ba-br-'+group.id)){
   const actionBar=brElement('div','ba-completed-actionbar');actionBar.setAttribute('role','group');actionBar.setAttribute('aria-label','Business Requirement actions');
   function iconAction(icon,label,danger=false){
    const button=brElement('button',(danger?'br-danger ':'secondary ')+'ba-completed-icon-action');
    button.type='button';button.title=label;button.setAttribute('aria-label',label);
    button.dataset.noActionIcon='true';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','atgv-flat-icon');
    svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',BA_ICONS[icon]);svg.append(path);button.append(svg);
    return button;
   }
   const repair=iconAction('refresh','Regenerate Jira Tasks');
   repair.disabled=!!baBusyTask||brRoleRepairBusy||!brState?.revision;
   repair.addEventListener('click',()=>{if(repair.disabled)return;brRoleRepairBusy=true;repair.disabled=true;status('Checking published Jira tasks for '+group.id+'…');send('brRoleTaskRepairPreview',{brId:group.id,revision:brState.revision});});
   actionBar.append(repair);
   if(brRoleRepairPreview?.brId===group.id){
     const plan=brRoleRepairPreview,section=brElement('section','ba-completed-evidence');
     section.append(brElement('h3','','Jira role subtask reconciliation'));
     section.append(brElement('p','muted',`${plan.existing} existing · ${plan.adopt} available to link · ${plan.missing} missing · ${plan.conflicts} conflicts. Existing Jira work will be preserved.`));
     const table=brElement('div','ba-role-repair-table');
     ATGVDataTables.mount(table,(plan.rows||[]).map(r=>({jira:r.key||'—',role:r.role,story:r.storyKey,task:r.title,result:r.status.toUpperCase(),reason:r.reason||''})),[
      {key:'jira',label:'Jira issue',render:r=>jiraKeyNode(r.jira)}, {key:'role',label:'Role'}, {key:'story',label:'Source Story',render:r=>jiraKeyNode(r.story)},
      {key:'task',label:'Deliverable'}, {key:'result',label:'Repair action'}, {key:'reason',label:'Reason'}
     ],{label:'Jira role task repair',pageSize:5});section.append(table);
     const action=brElement('button','secondary','Publish Missing Jira Subtasks');action.type='button';
     action.disabled=!!plan.conflicts||!(plan.missing+plan.adopt)||brRoleRepairBusy||!brState||plan.revision!==brState.revision;
     action.title=plan.conflicts?'Resolve Jira conflicts and preview again before publishing.':'Create only missing tasks; link existing verified matches.';
     action.addEventListener('click',()=>{if(action.disabled)return;brRoleRepairBusy=true;action.disabled=true;status('Publishing approved Jira role task changes…');send('brRoleTaskRepairPublish',{brId:group.id,hash:plan.hash});});
     section.append(action);
     if(plan.conflicts)section.append(brElement('p','muted','Resolve each conflict in Jira or reconcile links, then regenerate the preview. No automatic deletion or reassignment.'));
     body.append(section);
   }
   const reconcile=iconAction('link','Reconcile Jira Links');reconcile.disabled=!!baBusyTask;
   reconcile.addEventListener('click',()=>send('reconcileBRJiraLinks',{brId:group.id,revision:brState.revision}));
   actionBar.append(reconcile);
   const deleteButton=iconAction('trash','Delete Business Requirement',true);
   deleteButton.dataset.brDeleteAction='true';
   deleteButton.disabled=!!baBusyTask||brDeletionBusy;
   deleteButton.addEventListener('click',()=>requestBRDeletion({target:'br',brId:group.id,revision:brState.revision}));
   actionBar.append(deleteButton);body.append(actionBar);
  }
  if(group.snapshots.length>1){
   const history=document.createElement('details');history.className='ba-completed-revision-history';
   history.append(brElement('summary','',`Earlier published revisions (${group.snapshots.length-1})`));
   for(const {br,cycle} of group.snapshots.slice(1)){
    const older=brElement('div','ba-completed-br');appendSnapshot(older,br,cycle);history.append(older);
   }
   body.append(history);
  }
  details.append(body);root.append(details);
 }
 if(baRequirementModalTarget?.kind==='local')syncBARequirementModal();
 if(baJiraTableInstance&&view==='baOverview'&&selectedRole==='business-analyst')renderBAJiraInventory();
}
// Change-only publication keeps the original nine approval milestones plus Start; never add a duplicate Publish action.
function atgvSetBAActionLabel(id,label){
 const button=$(id);if(!button)return;
 const text=[...button.childNodes].find(child=>child.nodeType===Node.TEXT_NODE);
 if(text){if(text.textContent!==label)text.textContent=label;}
 else if(!button.querySelector('[data-action-label]')){const span=document.createElement('span');span.dataset.actionLabel='true';span.textContent=label;button.append(span);}
 else button.querySelector('[data-action-label]').textContent=label;
 button.setAttribute('aria-label',label);
}
function renderBAButtons(){
 const mine=baCanEdit('ba-discovery'),imported=!!brState?.importName&&(brState.processedSources===null||brState.processedSources===undefined||brState.processedSources.length>0),reviewCurrent=baReviewCurrent();
 renderSourceDocuments();
 const current=currentDiscoveryReadiness(),saved=!!discoveryData?.updatedAt&&brState?.discoveryRevision===discoveryData?.revision;
 const reviewGood=reviewCurrent&&baMappingComplete()&&baReviewFinalized();
 const brs=brState?.restartPending?[]:activeBusinessRequirements(),pendingDraft=brs.some(br=>br.status==='draft');
 // A newly generated draft has needsRefresh=true until human review. That does
 // NOT mean AI generation failed. Only stale source/discovery evidence or an
 // outstanding non-draft refresh should stop Preview & Save.
 const staleDrafts=brs.filter(br=>br.status==='draft'&&(br.staleReason==='Discovery answers changed'||br.staleReason==='New source mapping completed'||br.source?.discoveryRevision!==brState?.discoveryRevision||br.source?.digest!==brState?.importDigest));
 const generatingDone=brs.length>0&&!staleDrafts.length&&!brs.some(br=>br.status!=='draft'&&br.needsRefresh);
 const freshDraftPending=brs.some(br=>br.status==='draft'&&!staleDrafts.includes(br));
 const approved=brs.some(br=>br.status==='approved'&&!br.needsRefresh);
 const retiredJiraPending=Object.keys(brState?.synced||{}).some(nodePath=>brState?.brs?.some(br=>br.id===nodePath.split('/')[0]&&br.status==='retired'));
 const hasPublishedJira=Object.values(brState?.synced||{}).some(item=>!!item?.key);
 atgvSetBAActionLabel('brJiraPreview',hasPublishedJira?'Preview Jira Changes':'Generate Jira Preview');
 atgvSetBAActionLabel('brJiraApprove',hasPublishedJira?'Approve Jira Changes':'Approve Jira Preview');
 atgvSetBAActionLabel('brJiraSync',hasPublishedJira?'Publish Jira Updates':'Publish Jira');
 // Completed Jira publishing is read-only; expose this action again only for an approved new plan.
 $('brJiraSync').classList.toggle('hidden',!brPlanRevision&&(baPublishedCurrent()||jiraPublishState.phase==='completed'));
 const tasks={
  discoveryImport:!!baBusyTask||discoveryImportBusy||baMappingComplete()||selectedRole!=='business-analyst'||!activeId,
  discoveryImportApply:!!baBusyTask||!discoveryImportProposal||!mine,
  discoverySave:saved&&!discoveryDirty&&baMappingComplete()?!!baBusyTask:!!baBusyTask||!mine||!baMappingComplete()||!!discoveryImportProposal||!!discoveryImportQueue.length||(!discoveryDirty&&saved),
  discoveryCopilot:baBusyTask==='review'?false:!!baBusyTask||!mine||!baMappingComplete()||!!discoveryImportProposal||!!discoveryImportQueue.length||!saved||discoveryDirty,
  baReviewSkip:baBusyTask==='review'?false:!!baBusyTask||!mine||!baMappingComplete()||!!discoveryImportProposal||!!discoveryImportQueue.length||!saved||current.filled!==current.total||discoveryDirty,
  brGenerate:!!baBusyTask||!mine||!(brState?.sourceDocuments||[]).length||!reviewGood||freshDraftPending||generatingDone,
  brJiraPreview:!!baBusyTask||!reviewGood||!brs.length||brs.some(br=>br.status!=='approved'&&!(br.status==='retire-proposed'&&br.approvedContent)||br.status==='approved'&&br.needsRefresh)||(!approved&&!retiredJiraPending)||baPublishedCurrent()||(!!brPlanRevision&&brJiraPlanChanges>0),
  brApproveRetirements:!!baBusyTask||!brPlanRevision||!brJiraPlanChanges,
  brJiraApprove:!!baBusyTask||!brPlanRevision||!brJiraPlanChanges||!!brJiraPlanConflicts||brJiraPreviewApproved,
  brJiraSync:!!baBusyTask||!brPlanRevision||!brJiraPreviewApproved
 };
 for(const [id,disabled] of Object.entries(tasks)){
  const element=$(id);if(!element||id==='brApproveRetirements'&&element.classList.contains('hidden'))continue;
  element.disabled=disabled;
  element.classList.add('ba-process-btn');
 }
 const apply=$('discoveryReviewApply');apply.classList.add('ba-process-btn');
 const selected=$('discoveryReviewSuggestions').querySelectorAll('input[data-review-key]:checked').length;
 apply.disabled=!!baBusyTask||!mine||!reviewCurrent||baReviewLocked()||baReviewMode()==='skip'||!selected;
 decorateBAActionButtons();
 const applying=baBusyTask==='applyReview'||baBusyTask==='stopApplyReview';
 const canStop=baBusyTask==='applyReview'&&reviewApplyPhase!=='saving';
 const stop=$('baReviewApplyStop'),retry=$('baReviewRetry');
 stop.classList.toggle('hidden',!applying);stop.disabled=!canStop;
 retry.classList.toggle('hidden',applying||!reviewApplyRetryAvailable||!!baReviewLocked());
 retry.disabled=!!baBusyTask||!reviewApplyRetryAvailable||!reviewApplyRetry||!mine||!reviewCurrent||discoveryData?.revision!==reviewApplyRetry?.revision;
 for(const node of $('discoveryReviewSuggestions').querySelectorAll('input[data-review-key]'))node.disabled=!!baBusyTask||!mine||baReviewLocked();
 const running=baBusyTask==='review';
 const reviewAdvanceReady=baReviewFinalized()&&!running;
 $('discoveryCopilot').textContent=reviewAdvanceReady?'Next Step · Generate Requirements':running?'Stop AI Review':(reviewStopReason||reviewCurrent)?'Re-run AI Review':'Run AI Review';
 $('discoveryCopilot').dataset.action=reviewAdvanceReady?'next-generate':'review';
 $('discoveryCopilot').disabled=reviewAdvanceReady?!!baBusyTask||discoveryDirty:$('discoveryCopilot').disabled;
 $('discoveryCopilot').classList.toggle('ba-review-next-action',reviewAdvanceReady);
 $('discoveryCopilot').classList.toggle('ba-step-next-complete',reviewAdvanceReady);
 $('discoveryCopilot').classList.toggle('secondary',reviewAdvanceReady);
 $('discoveryCopilot').classList.toggle('ba-review-stop',running);
 $('baReviewSkip').disabled=tasks.baReviewSkip||baReviewLocked();
 $('baReviewRegenerate').disabled=!!baBusyTask||!mine||!reviewCurrent||discoveryDirty;
 const reviewComplete=baReviewFinalized();
 for(const name of ['discoveryCopilot','discoveryReviewApply','baReviewSkip']){
  const item=$(name);const hide=reviewComplete&&!running&&name!=='discoveryCopilot';item.classList.toggle('hidden',hide);item.setAttribute('aria-hidden',hide?'true':'false');
 }
 const finish=$('baReviewFinish');
 const unresolvedFindings=discoveryHasReviewBlockers();
 finish.textContent='Approve AI Review & Continue';
 finish.title=current.filled!==current.total?'Complete and save all 12 answers, then re-run AI Review.':unresolvedFindings?'Approve the AI proposal with clearly marked provisional decisions; final BR approval remains separate.':'Approve the current AI Review proposal.';
 finish.classList.toggle('hidden',!reviewCurrent||baReviewFinalized()&&!unresolvedFindings);
 // Never silently disable a visible acknowledgement because of a stale
 // ownership cache or readiness badge. The handler explains prerequisites,
 // and the host checks permissions and saved revisions before any write.
 finish.disabled=baBusyTask==='confirmReview';
 finish.setAttribute('aria-disabled',finish.disabled?'true':'false');
 const legacySources=(brState?.sourceDocuments||[]).filter(source=>(brState?.processedSources||[]).includes(source.digest)&&!/^[a-f0-9]{64}$/.test(String(source.byteDigest||'')));
 $('brLegacySourceRecovery').classList.toggle('hidden',!legacySources.length);
 $('brReuploadOriginalSource').disabled=!legacySources.length||!!baBusyTask||discoveryImportBusy||selectedRole!=='business-analyst'||!activeId;
 $('brReuploadOriginalSource').title=legacySources.length?`Re-upload exact originals: ${legacySources.map(source=>source.name).join(', ')}`:'';
 for(const button of $('discoveryReviewPanel').querySelectorAll('button'))button.setAttribute('aria-disabled',button.disabled?'true':'false');
 $('discoveryReviewPanel').classList.toggle('ba-review-skipped',baReviewSkipped()&&baReviewCurrent());
 $('discoveryReviewPanel').open=running||$('discoveryReviewPanel').open&&!baReviewSkipped();
 refreshBAHeadingProgress();
 const stageMap=[['discoveryImport',imported],['discoverySave',saved&&!discoveryDirty],['discoveryCopilot',reviewCurrent],['brGenerate',generatingDone],['brJiraPreview',!!brPlanRevision||baPublishedCurrent()],['brJiraApprove',brJiraPreviewApproved||baPublishedCurrent()],['brJiraSync',baPublishedCurrent()]];
 for(const [id,complete] of stageMap)$(id).classList.toggle('ba-completed',!!complete);
 $('brGenerate').classList.toggle('hidden',staleDrafts.length>0||generatingDone);
 $('brGenerateAffected').classList.toggle('hidden',!staleDrafts.length);$('brGenerateAffected').disabled=!!baBusyTask||!mine||!reviewGood||!staleDrafts.length;
 const regenerableDrafts=brs.filter(br=>br.status==='draft'&&!staleDrafts.includes(br)&&!br.approvedContent);
 $('brRegenerateProposal').disabled=!!baBusyTask||!mine||!reviewGood||!regenerableDrafts.length;
 $('brGenerate').textContent=brs.length?'Update Business Requirements Documents':'Generate Business Requirements Documents';
 $('brGenerate').title=freshDraftPending?'Review or approve current drafts first.':staleDrafts.length?'Regenerate outdated drafts; prior manual edits are kept in history.':generatingDone?'Business Requirements are up to date.':'Generate Business Requirements documents.';
 $('brGenerate').setAttribute('aria-label',freshDraftPending?'Approve or review current drafts before updating':(brs.length?'Update Business Requirements Documents':'Generate Business Requirements Documents'));
 const displayedStage=baViewedStep||window.baLastGuideProgress?.find(step=>step.current)?.key||'start';
 // Keep document generation and the next-stage action in the same bottom toolbar.
 $('brGenerate').classList.toggle('hidden',displayedStage!=='generate'||staleDrafts.length>0||generatingDone);
 $('brGenerateAffected').classList.toggle('hidden',displayedStage!=='generate'||!staleDrafts.length);
 const nextPreview=$('brNextPreviewSave');
 const canPreview=generatingDone&&displayedStage==='generate'&&pendingDraft&&(window.baLastGuideProgress||[]).some(step=>step.key==='save'&&step.selectable);
 nextPreview.classList.add('hidden'); // Preview navigation is in the standalone toolbar.
 nextPreview.disabled=!canPreview||!!baBusyTask||brEditorSaving||discoveryDirty;
 nextPreview.classList.toggle('ba-step-next-complete',canPreview);
 renderMappingRecovery();
}
function renderBAOwner(){
 const canEdit=baCanEdit('ba-discovery');
 $('discoveryImport').disabled=selectedRole!=='business-analyst'||!!baBusyTask||!(brState?.restartPending||(brState?.sourceDocuments||[]).length&&!baMappingComplete());
 for(const node of document.querySelectorAll('#discoveryQuestions textarea'))node.readOnly=!canEdit;
 renderDiscoverySummary();
}
function baMappingComplete(){
 const docs=brState?.sourceDocuments||[];
 if(!docs.length||!brState?.importEpoch)return false;
 const processed=brState.processedSources||[];
 const mapped=brState.mappingCompleted;
 if(mapped){
  if(mapped.epoch!==brState.importEpoch||JSON.stringify(mapped.digests)!==JSON.stringify(processed))return false;
  return JSON.stringify(mapped.sourceDigests||[])===JSON.stringify(docs.map(doc=>doc.digest).sort());
 }
 return !!(brState.discoveryRevision&&brState.importName&&processed.length);
}
// Resume an unfinished cycle from persisted project data. Never create another
// BR, re-run AI, or change an approved revision merely to reopen a milestone.
function renderBAUncompleted(){
 const panel=$('baUncompletedPanel');
 if(!panel||view!=='baOverview')return;
 const progress=window.ATGVBusinessRequirements?.stageSummary();
 const unfinished=baHasRecoverableBR(brState)&&(!baPublishedCurrent()||!!brState?.baPendingReopen||progress?.running);
 const active=activeBusinessRequirements().filter(br=>br.status!=='retired');
 const first=active[0];
 const sources=(brState?.sourceDocuments||[]).map(item=>item.name).filter(Boolean);
 const busy=!!baBusyTask||discoveryImportBusy||brEditorSaving||progress?.running;
 $('baIncompleteTitle').textContent=!unfinished?'Business Requirements':active.length>1?`${active.length} Business Requirements in progress`:first?`${first.id} · ${first.title}`:'Business Requirement in progress';
 $('baIncompleteMeta').textContent=unfinished?(progress?.label||'Prepare Source'):'';
 $('baIncompleteMeta').hidden=!unfinished;
 $('baIncompleteSource').textContent=sources.join(', ');
 $('baIncompleteSource').hidden=!unfinished||!sources.length;
 panel.querySelector('.ba-incomplete-kicker').hidden=!unfinished;
 $('baResumeIncomplete').classList.toggle('hidden',!unfinished);
 $('baResumeIncomplete').textContent='Resume';
 $('baResumeIncomplete').disabled=!activeId||!brState;
 $('baDeleteIncomplete').classList.toggle('hidden',!unfinished);
 const deleting=busy||discoveryAutosaving||brDeletionBusy||selectedRole!=='business-analyst';
 $('baDeleteIncomplete').disabled=deleting||(!sources.length&&!active.length&&!brState?.restartPending);
 $('baDeleteIncomplete').title=deleting?'Finish or discard active editing before deletion.':'Delete the current in-progress BR and its scoped artifacts everywhere after verification.';
}
$('baResumeIncomplete').addEventListener('click',()=>{
 if($('baResumeIncomplete').disabled)return;
 navigate('discovery');
});
$('baDeleteIncomplete').addEventListener('click',()=>{
 if($('baDeleteIncomplete').disabled||!brState||!activeId)return;
 requestBRDeletion({target:'in-progress',revision:brState.revision});
});
// v0.1.21: The nine milestones are the sole Business Requirements navigation.
function baGuideRender(progress,displayed,details){
 const saved=$('baDiscoverySaveStatus');
 if(saved)saved.textContent=ATGVCompletedBRHistory.discoveryStatus(details);
}
function renderDiscoverySummary(){
  const readiness=currentDiscoveryReadiness();
  const total=readiness.total||12,filled=readiness.filled||0,missing=readiness.missing||[];
  const percent=Math.max(0,Math.min(100,Math.round((filled/Math.max(total,1))*100)));
  $('discoveryReadiness').textContent=`${filled} / ${total} answered`;
  const missingPreview=missing.slice(0,3).map(item=>item.label).join(' · ');
  $('discoveryMissing').textContent=missing.length?`${missing.length} question${missing.length===1?'':'s'} remaining${missingPreview?': '+missingPreview:''}${missing.length>3?' …':''}`:readiness.needsDecision?'12 answers complete · Question 12 records open decisions (draft review allowed).':'All 12 questions completed.';
  $('discoveryProgress').textContent=`${filled} / ${total} answered`;
  $('discoveryProgressFill').style.width=percent+'%';
  $('discoveryProgressHint').textContent=filled===total?'12 answers complete. Open decisions are allowed in drafts but block final approval.':'Save the available answers to run AI Review. Complete all 12 before generating requirements.';
  const imported=!!brState?.importName&&(brState.processedSources===null||brState.processedSources===undefined||brState.processedSources.length>0);
  const reviewReady=!!(brState?.reviewRevision&&brState.reviewRevision===brState.discoveryRevision&&!discoveryDirty);
  const activeBrs=activeBusinessRequirements(); // Exclude preserved history, as the BR card list does.
  const generated=activeBrs.length>0&&!brState?.restartPending;
  const savedBrs=activeBrs.filter(br=>!!br.draftSavedAt||!!br.approvedContent).length;
  const approved=activeBrs.filter(br=>br.status==='approved').length;
  const published=baPublishedCurrent();
  const savedDiscovery=ATGVBAProgress.savedAnswersReady(discoveryData,brState,discoveryDirty,!!discoveryImportProposal||!!discoveryImportQueue.length);
  const hasSources=(brState?.sourceDocuments||[]).length>0;
  const mappingDone=baMappingComplete();
  if(mappingDone&&brState?.mappingCompleted?.epoch===brState.importEpoch&&restoredMappingEpoch!==brState.importEpoch){
    restoredMappingEpoch=brState.importEpoch;
    const proposals=brState.mappingCompleted.proposals||[];
    if(!savedDiscovery&&!discoveryImportProposal&&!discoveryImportQueue.length&&proposals.length){
      discoveryImportProposal={filename:proposals[0].filename,answers:proposals[0].answers};
      discoveryImportQueue=proposals.slice(1).map(item=>({filename:item.filename,answers:item.answers}));
      renderDiscoveryImportProposal();
    }
  }
  const allApproved=generated&&activeBrs.every(br=>br.status==='approved'&&!br.needsRefresh||br.status==='retire-proposed'&&!!br.approvedContent);
  const pendingChange=(brState?.changeQueue||[]).some(item=>item.status==='pending')||
   (brState?.discoveryProposals||[]).some(item=>item.status==='pending')||
   (brState?.sourceConflicts||[]).some(item=>item.status!=='resolved')||
   activeBrs.some(br=>br.needsRefresh&&br.status==='approved');
  const reviewFinalized=baReviewFinalized();
  const status=ATGVBAStageFlow.select({hasSources,mappingDone,mappingProposal:!!discoveryImportProposal,savedDiscovery,reviewCurrent:reviewReady,reviewFinalized,generated,allApproved,publishedCurrent:baPublishedCurrent(),reopenQuestions:baReopenQuestions,reopenDocuments:baReopenDocuments,pendingJiraInbound:(brState?.inboundJira||[]).some(entry=>entry.status==='pending'||entry.status==='reviewed'),pendingChangeResolution:pendingChange});
  if(baProgressProjectId!==activeId){baViewedStep=null;baPreviousStage='';baLastActiveStep='';baProgressProjectId=activeId;jiraPublicationPlan=[];jiraPublicationConfirmed.clear();jiraPublishState={phase:'idle',confirmed:0,total:0,message:'No Jira publication is running.',currentKey:'',error:''};}
  // Upload remains the active first milestone until mapping actually starts. Merely attaching a file must not hide Submit.
  const mappingSubmitted=mappingDone||discoveryImportBusy;
  const progress=ATGVBAProgress.derive({started:hasSources||!!brState?.restartPending,hasSources:hasSources&&mappingSubmitted,mappingDone,savedDiscovery,reviewFinalized,reviewWarnings:discoveryHasReviewBlockers(),generated,totalBrs:activeBrs.length,savedBrs,allApproved,approvalBlocked:readiness.needsDecision||discoveryHasReviewBlockers(),jiraPreview:!!brPlanRevision,jiraApproved:brJiraPreviewApproved,published:baPublishedCurrent(),failedStep:baFailedProcess});
  const activeStep=progress.find(step=>step.current)?.key||'start';
  // Keep the just-completed milestone visible until the user chooses Next Step.
  // Initial load still opens the current milestone; previously viewed completed milestones stay reviewable.
  if(baLastActiveStep&&baLastActiveStep!==activeStep&&!baViewedStep&&!baReopenQuestions&&!baReopenDocuments&&progress.some(step=>step.key===baLastActiveStep&&step.complete))baViewedStep=baLastActiveStep;
  if(baViewedStep&&!progress.some(step=>step.key===baViewedStep&&step.selectable))baViewedStep=null;
  baPreviousStage=status.stage;baLastActiveStep=activeStep;
  const displayed=baViewedStep||activeStep;
  window.baLastGuideProgress=progress;
  const stageError=$('baMilestoneError');
  stageError.classList.toggle('hidden',!baFailedProcess||!baFailedMessage);
  stageError.textContent=baFailedProcess&&baFailedMessage?`${(ATGVBAProgress.definitions.find(item=>item[0]===baFailedProcess)||[,'','Process'])[2]} failed: ${baFailedMessage}`:'';
  baGuideRender(progress,displayed,{published:baPublishedCurrent(),pendingChange,busy:!!baBusyTask,unsaved:discoveryDirty,saved:savedDiscovery,filled,total});
  // A connected green line only represents consecutive completed steps; gaps never imply completion.
  const firstIncomplete=progress.findIndex(step=>!step.complete);
  const completedPrefix=firstIncomplete<0?progress.length:firstIncomplete;
  // A published BR is not an in-progress BR. Show neutral numbered circles until
  // a new upload/revision cycle starts; historical approvals remain unchanged.
  const hasOpenBrCycle=!!brState?.restartPending ||
    ((hasSources||activeBrs.length>0)&&!baPublishedCurrent());
  const idleMilestones=!hasOpenBrCycle;
  const milestoneLine=idleMilestones?0:completedPrefix>1?((completedPrefix-1)/progress.length)*100:0;
  document.querySelector('#discoveryView .discovery-workflow').style.setProperty('--milestone-width',milestoneLine+'%');
  document.querySelector('#discoveryView .discovery-workflow').classList.toggle('ba-milestones-idle',idleMilestones);
  for(const step of progress){
   const node=$(step.id);node.classList.remove('hidden');
   node.classList.toggle('done',!idleMilestones&&step.complete);
   node.classList.toggle('current',!idleMilestones&&step.key===displayed);
   node.classList.toggle('active-milestone',!idleMilestones&&step.current);
   node.dataset.status=idleMilestones?'idle':step.state;
   node.disabled=idleMilestones?step.key!=='start':!step.selectable;
   node.setAttribute('aria-pressed',String(!idleMilestones&&step.key===displayed));
   node.setAttribute('aria-label',`${step.index+1} ${step.label}: ${idleMilestones?'No active Business Requirement':step.state}${!idleMilestones&&step.key===displayed?', currently displayed':''}`);
   node.title=idleMilestones?'No Business Requirement in progress · start a new requirement':(step.state==='failure'?baFailedMessage:step.state==='success'?'Completed · select to review':step.state==='warning'?'Needs attention · select to continue':'Complete earlier steps first');
  }
  const viewing=progress.find(step=>step.key===displayed);
  $('baProgressSelected').textContent=`${viewing?.index+1||1} of ${progress.length} · ${viewing?.label||'Upload'}${baViewedStep&&baViewedStep!==activeStep?' · Previous step':''}`;
  $('baGeneralizationGuidance').textContent=ATGVBAProgress.guidanceFor(displayed);
  // Step 2 becomes active as soon as a PDF is uploaded, *before* the user
 // has selected/submitted it. Never hide the source selection prematurely.
 // Hide the panel only after mapping was actually submitted; preserve the
 // Restart in the Business Requirements header remains the explicit way to replace sources.
 const sourceMappingStarted=mappingDone||discoveryImportBusy;
 const showSources=displayed==='upload'; // Step 1 only; review later stages without duplicate source panels.
  const showMapping=displayed==='mapping'&&!!discoveryImportProposal;
  const showQuestions=displayed==='mapping'&&mappingDone&&!discoveryImportProposal;
  const showReview=displayed==='review'&&savedDiscovery;
  const showDocuments=['generate','save','approve'].includes(displayed)&&reviewFinalized;
  const showJira=['jiraPreview','jiraApprove','publish'].includes(displayed)&&allApproved&&(!baPublishedCurrent()||baViewedStep!==null);
  // v0.1.49: an already-approved current BR cannot be held at the approval step by archived BR records.
  const stageLabels={start:'Start or review completed Business Requirements',upload:'Upload source documents',mapping:'Review mapping and save discovery answers',questions:'Save 12 Discovery Questions',review:'AI Review & Suggestions',documents:'Generate, preview and approve Business Requirements',jira:'Preview, approve and publish Jira',complete:'Published · workflow completed'};
  const currentMilestone=progress.find(step=>step.current)||progress.at(-1);
  $('discoveryReadiness').textContent=progress.every(step=>step.complete)?'Published':currentMilestone?.label||'Start';
  // Give the BA an actionable question number and label instead of only '1 answer remaining'.
  const missingQuestionDetails=missing.slice(0,2).map(item=>{const index=BA_QUESTIONS.findIndex(([key])=>key===item.key);return `Q${index+1}: ${item.label}`;}).join(' · ');
  $('discoveryMissing').textContent=missing.length&&mappingDone?`${missing.length} unanswered — ${missingQuestionDetails}${missing.length>2?' …':''}. AI Review can identify gaps; complete all answers before generation.`:status.stage==='questions'&&readiness.needsDecision?'Open decisions recorded; approval requires resolution.':progress.every(step=>step.complete)?'Jira publishing completed.':currentMilestone?.label==='AI Review'?'Inspect saved AI Review evidence and suggestions.':currentMilestone?.label||'Upload';
  $('baDiscoveryProgress').classList.toggle('hidden',!showQuestions);
  // Never offer a save when all 12 answers match the persisted revision.
  // The same inline action advances to AI Review after the persisted 12 answers are ready.
  // Uncommitted edits always restore Save mode; navigation cannot save or discard them.
  const discoveryAdvanceReady=savedDiscovery&&mappingDone;
  const discoveryAction=$('discoverySave');
  discoveryAction.type=discoveryAdvanceReady?'button':'submit';
  discoveryAction.textContent=discoveryAdvanceReady?'Next Step · AI Review':'Save 12 Questions';
  discoveryAction.classList.toggle('ba-next-review-action',discoveryAdvanceReady);
  discoveryAction.classList.toggle('ba-step-next-complete',discoveryAdvanceReady);
  discoveryAction.classList.toggle('secondary',discoveryAdvanceReady);
  discoveryAction.classList.toggle('hidden',discoveryAdvanceReady); // Already saved: use standalone Next Step.
  discoveryAction.disabled=discoveryAdvanceReady?!!baBusyTask:(!discoveryDirty&&!!discoveryData?.updatedAt&&brState?.discoveryRevision===discoveryData?.revision)||!baCanEdit('ba-discovery')||!!baBusyTask||!mappingDone||!!discoveryImportProposal||!!discoveryImportQueue.length;
  $('discoveryQuestionsBadge').textContent=savedDiscovery&&filled===total?'Ready':`${filled} / ${total} answered${savedDiscovery?' · saved':''}`;
  $('discoveryQuestionsBadge').classList.toggle('ba-ready',savedDiscovery&&filled===total);
  const questionsPanel=$('discoveryQuestionsPanel');
  questionsPanel.classList.toggle('hidden',!showQuestions);
  if(showQuestions&&questionsPanel.dataset.lastSaved!==String(savedDiscovery)){
   questionsPanel.open=true;questionsPanel.dataset.lastSaved=String(savedDiscovery);
  }
  const restartOpen=!!brState?.restartPending&&!hasSources;
  // Start must always offer New Business Requirement, even when another cycle
  // is unfinished. The host prompts before archiving active work.
  $('baNewRequirement').classList.toggle('hidden',displayed!=='start');
  $('baNewRequirement').disabled=displayed!=='start'||!activeId||!brState;
  $('baNewRequirement').title=restartOpen?'Open document upload for the newly started Business Requirement':'Start a new independent Business Requirement; unfinished work will be archived only after confirmation.';
  renderBAUncompleted();
  if(displayed!=='start'&&baRequirementModalTarget)closeBARequirementModal(false);
  renderBACompletedRecords();
  // Always show the BR register at Start, even if the local completed-cycle
  // index is absent. Jira-only Epic discovery must not silently disappear.
  $('baStartPanel').classList.toggle('hidden',displayed!=='start');
  $('baCompletedSection').classList.toggle('hidden',displayed!=='start');
  document.querySelector('.source-documents-panel').classList.toggle('hidden',!showSources);
  $('sourceSelectionActions').classList.toggle('hidden',!showSources);
 $('brRerun').disabled=!activeId||!!baBusyTask||selectedRole!=='business-analyst';
  const sourceWindowOpen=!!brState?.restartPending||hasSources&&!sourceMappingStarted;
 const sourceLocked=!sourceWindowOpen||sourceMappingStarted||!!baBusyTask||discoveryImportBusy;
  $('discoveryImport').disabled=sourceLocked||selectedRole!=='business-analyst'||!activeId;
  for(const button of document.querySelectorAll('#sourceDocuments .ba-source-icon-btn'))button.disabled=!!baBusyTask||!!sourceRemoving||!baCanEdit('ba-discovery');
  for(const input of document.querySelectorAll('#sourceDocuments .source-select-radio'))input.disabled=sourceLocked||!baCanEdit('ba-discovery');
  for(const checkbox of document.querySelectorAll('#sourceDocuments .source-select-radio'))checkbox.classList.remove('hidden');
  updateSourceSubmitButton();
 document.querySelector('.source-documents-panel').classList.toggle('ba-source-locked',sourceLocked);
  $('discoveryImportPanel').classList.toggle('hidden',!showMapping);
  const reviewPanel=$('discoveryReviewPanel');
  reviewPanel.classList.toggle('hidden',!showReview);
  if(showReview)reviewPanel.open=true;
  const documentsPanel=document.querySelector('.br-workflow-panel');
  documentsPanel.classList.toggle('hidden',!showDocuments);
  documentsPanel.dataset.step=displayed;
  const documentStageCopy={
   generate:['Generate Requirements','Create or update Business Requirements drafts from the reviewed discovery answers. No document is saved or approved automatically.'],
   save:['Preview & Save','Review each generated document, make edits, and explicitly save its draft. Approval is a separate milestone.'],
   approve:['Approve Requirements','Review saved draft revisions and record explicit approval. This milestone does not regenerate or silently edit requirements.']
  };
  const stageCopy=documentStageCopy[displayed]||['Business Requirements Documents',''];
  $('brStageTitle').textContent=stageCopy[0];
  $('brStageDescription').textContent=stageCopy[1];
  $('brGenerateSummary').classList.toggle('hidden',displayed!=='generate');
  $('brRegenerateProposal').classList.toggle('hidden',!showDocuments||!['generate','save','approve'].includes(displayed)||!activeBrs.some(br=>br.status==='draft'&&!br.approvedContent));
  $('brGenerateSummary').textContent=!activeBrs.length?'No Business Requirements generated yet. Use Generate Business Requirements Documents.':
   activeBrs.length+' Business Requirements generated · '+savedBrs+' saved draft(s) · '+approved+' approved. Select Next Step to open the separate Preview & Save screen.';
  document.querySelector('.change-proposal-panel').classList.toggle('hidden',!showDocuments||!generated||!baShowChangeProposal);
  $('baOpenChangeProposal').classList.toggle('hidden',!showDocuments||!generated);
  $('baOpenChangeProposal').textContent=baShowChangeProposal?'Close Change Proposal':'Propose Requirement Change';
  document.querySelector('.trace-impact-panel').classList.add('hidden');
  $('atgv-ai-change-resolution').classList.toggle('hidden',!status.showChangeResolution||!showDocuments);
  document.querySelector('.jira-publish-panel').classList.toggle('hidden',!showJira);
  $('brJiraPreviewStep').classList.toggle('hidden',!showJira||displayed!=='jiraPreview');
  $('brJiraApprovalStep').classList.toggle('hidden',!showJira||displayed!=='jiraApprove');
  $('brJiraPublishStep').classList.toggle('hidden',!showJira||displayed!=='publish');
  $('baCRPanel').classList.toggle('hidden',!showJira||displayed!=='jiraPreview'||!hasRelevantJiraChangeRequests(brState,jiraProtectionForCR,brPlanRevision));
  renderJiraApprovalSummary();renderJiraPublicationState();
  // One dedicated navigation panel for the entire BA workflow. The panel
  // never moves into individual sections; business actions stay in those sections.
  // Start deliberately has no Next Step · Upload (use New Business Requirement).
  const nextIndex=progress.findIndex(step=>step.key===displayed);
  const currentDefinition=progress[nextIndex];
  const previousDefinition=nextIndex>0?progress[nextIndex-1]:null;
  const nextDefinition=nextIndex>=0?progress[nextIndex+1]:null;
  const navigatingBusy=!!baBusyTask||discoveryImportBusy||discoveryDirty||brEditorDirty||brEditorSaving;
  const next=ATGVJiraWorkflowTables.getNextStep(progress,displayed,navigatingBusy);
  const navigation=$('baStepNavigation'),nextButton=$('baNextStep'),previousButton=$('baPreviousStep');
  navigation.classList.toggle('hidden',displayed==='start');
  previousButton.dataset.previousStep=previousDefinition?.key||'';
  previousButton.textContent=previousDefinition?'Previous Step · '+previousDefinition.label:'Previous Step';
  previousButton.dataset.milestoneState=previousDefinition?.complete?'completed':'pending';
  previousButton.classList.toggle('secondary',!!previousDefinition?.complete);
  previousButton.disabled=!previousDefinition?.selectable||navigatingBusy;
  previousButton.title=previousButton.disabled?'Complete or save your current work before navigating back.':'Return to '+previousDefinition.label;
  nextButton.dataset.nextStep=next?.key||'';
  nextButton.dataset.stage=displayed;
  // An unfinished AI Review can use Next to confirm its already-saved findings.
  const canConfirm=displayed==='review'&&reviewReady&&!reviewFinalized&&!navigatingBusy&&savedDiscovery;
  // A completed milestone alone does not guarantee its NEXT action can run.
  // Generation must have an eligible draft preview; saved BRs must resolve
  // outstanding Discovery decisions before entering the approval milestone.
  // Keep the Preview & Save stage accessible while approval is pending.
  const previewActionReady=displayed!=='generate'||!$('brNextPreviewSave').disabled;
  // Question 12 and acknowledged AI risks are FINAL APPROVAL safeguards, not
 // navigation safeguards. Let saved drafts reach the approval-review screen;
 // actual approval still validates these conditions in the extension host.
 const approvalActionReady=displayed!=='save'||!!currentDefinition?.complete;
  const ready=ATGVJiraWorkflowTables.nextActionReady({next,complete:!!currentDefinition?.complete,canConfirm,previewReady:previewActionReady,approvalReady:approvalActionReady});
  nextButton.dataset.confirmReview=canConfirm?'true':'false';
  nextButton.dataset.milestoneState=ready?'ready':'blocked';
  nextButton.classList.toggle('secondary',!ready);
  nextButton.disabled=!ready;
  nextButton.setAttribute('aria-disabled',String(!ready));
  nextButton.classList.toggle('ba-step-next-complete',ready);
  nextButton.textContent=nextDefinition?'Next Step · '+nextDefinition.label:'Workflow Complete';
  if(canConfirm)nextButton.textContent='Approve AI Review & Continue';
  nextButton.title=!nextDefinition?'The final Business Requirements milestone.':ready?'Continue to '+nextDefinition.label:
   !approvalActionReady?'Save all generated drafts before reviewing approval readiness.':
   !previewActionReady?'Current-source BR drafts are unavailable or outdated. Regenerate stale drafts before opening Preview & Save.':
   currentDefinition?.complete?'Next step is unavailable until its prerequisites are satisfied.':'Complete this milestone before continuing.';
  document.querySelector('.jira-inbound-panel').classList.toggle('hidden',!status.showJiraInbound||!showJira);
  $('discoveryImportStatus').classList.toggle('hidden',!showSources&&!showMapping);
  $('baPostPublishActions').classList.toggle('hidden',!baPublishedCurrent());
  const hints={upload:'Upload and select the documents to process.',mapping:'Review and apply the selected AI document mapping.',questions:'Complete and save the 12 discovery answers.',review:'Run AI Review, apply selected suggestions, or continue with documented findings.',documents:'Generate drafts, preview, save and approve them before Jira.',jira:'Review and approve the Jira preview before publishing.',complete:'The current requirements are published. New changes require a new reviewed revision.'};
  const stepHints={upload:'Select source documents and submit for AI mapping.',mapping:'Select uploaded documents for mapping, then review and save the 12 answers.',review:'Inspect saved AI findings, sources and individual answers before confirming the review.',generate:'Generate Business Requirements drafts.',save:'Preview and save every draft.',approve:'Check and approve Business Requirements.',jiraPreview:'Inspect the generated Jira plan.',jiraApprove:'Approve the current Jira preview.',publish:'Publish the approved Jira plan.'};
  $('discoveryProgressHint').textContent=stepHints[displayed]||hints[status.stage]||'';
  renderBAButtons();
  window.ATGVBusinessRequirements?.render();
  if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
}
function openBAWorkflowStep(key){
  navigate('discovery');
  if(view!=='discovery')return false; // Respect unsaved changes and workspace guards.
  if(window.ATGVBusinessRequirements?.active())return window.ATGVBusinessRequirements.openStage(key);
  const definition=ATGVBAProgress.definitions.find(([name])=>name===key);
  const node=definition&&$(definition[1]);
  if(!node||node.disabled){
    status('This Business Requirements step is not available yet. Complete the current milestone first.',true);
    return false;
  }
  node.click();
  requestAnimationFrame(()=>node.scrollIntoView({block:'nearest',inline:'nearest'}));
  return true;
}
for(const definition of ATGVBAProgress.definitions){
 const node=$(definition[1]);
 node.addEventListener('click',()=>{
  if(node.disabled)return;
  baViewedStep=definition[0];
  baBreadcrumbAtRequirements=true;
  renderDiscoverySummary();
 });
}
function renderDiscovery(){
  if(!discoveryData)return;
  const root=$('discoveryQuestions');
  if(discoveryDirty){renderDiscoverySummary();return;}
  const openGroups=new Set([...root.querySelectorAll('.discovery-group[open]')].map(group=>group.dataset.from));
  root.replaceChildren();
  const groups=[['Business context',0,4],['Requirements and rules',4,8],['Delivery and open questions',8,12]];
  for(const [heading,from,to] of groups){
    const section=document.createElement('details');section.className='discovery-group';section.dataset.from=String(from);section.dataset.to=String(to);
    const summary=document.createElement('summary');summary.className='discovery-group-head';
    const filledInGroup=BA_QUESTIONS.slice(from,to).filter(([key])=>(discoveryData.answers?.[key]||'').trim()).length;
    section.open=openGroups.has(String(from))||filledInGroup<to-from;
    const headingWrap=document.createElement('div');const title=document.createElement('strong');title.textContent=heading;const range=document.createElement('small');range.textContent=`Questions ${from+1}–${to}`;headingWrap.append(title,range);
    const pill=document.createElement('span');pill.className='discovery-group-pill';pill.textContent=`${filledInGroup} / ${to-from}`;summary.append(headingWrap,pill);section.append(summary);
    for(let idx=from;idx<to;idx++){
      const [key,label]=BA_QUESTIONS[idx];
      const wrap=document.createElement('div');wrap.className='field ba-question';
      const answer=discoveryData.answers?.[key]||'';
      if(answer.trim())wrap.classList.add('complete');
      const labelRow=document.createElement('div');labelRow.className='ba-question-head';
      const questionLabel=document.createElement('label');questionLabel.htmlFor='ba-'+key;questionLabel.textContent=(idx+1)+'. '+label;
      const state=document.createElement('span');state.className='ba-question-state';state.textContent=answer.trim()?'Answered':'Required';
      labelRow.append(questionLabel,state);
      const area=document.createElement('textarea');area.id='ba-'+key;area.rows=5;area.maxLength=100000;area.placeholder='Add the evidence, context or decision for this question.';
      area.value=answer;area.readOnly=!baCanEdit('ba-discovery');
      const counter=document.createElement('small');counter.className='discovery-answer-count';
      const helper=document.createElement('small');helper.className='muted';helper.textContent=key==='questions'?'Record genuine open decisions with owner and due date when known. You do not need to enter “None” to generate or preview drafts. Only confirm “No open decisions” if that is accurate; final approval requires open decisions to be resolved.':'Use evidence from the uploaded document or confirmed business context.';
      let noDecisionCheckbox=null,noDecisionChoice=null;
      if(key==='questions'){
        noDecisionChoice=document.createElement('label');noDecisionChoice.className='ba-no-open-decisions';
        noDecisionCheckbox=document.createElement('input');noDecisionCheckbox.type='checkbox';noDecisionCheckbox.id='ba-no-open-decisions';noDecisionCheckbox.disabled=area.readOnly;
        const checkboxLabel=document.createElement('span');checkboxLabel.textContent='No open decisions (confirmed)';
        noDecisionChoice.append(noDecisionCheckbox,checkboxLabel);
        noDecisionCheckbox.addEventListener('change',()=>{
          if(noDecisionCheckbox.checked&&area.value.trim()&&!noOpenDecisions(area.value)){
            noDecisionCheckbox.checked=false;
            status('Question 12 contains unresolved decisions. Review and resolve them before confirming that none remain.',true);
            return;
          }
          if(noDecisionCheckbox.checked)area.value='No open decisions';
          else if(noOpenDecisions(area.value))area.value='';
          area.dispatchEvent(new Event('input',{bubbles:true})); // Manual Save is still required.
        });
      }
      const updateCounter=()=>{counter.textContent=area.value.length.toLocaleString()+' / 100,000';state.textContent=area.value.trim()?'Answered':'Required';wrap.classList.toggle('complete',!!area.value.trim());if(noDecisionCheckbox)noDecisionCheckbox.checked=noOpenDecisions(area.value);};
      updateCounter();area.addEventListener('input',()=>{if(!applyingAiReview)preserveReviewOnSave=false;discoveryDirty=true;$('discoverySave').disabled=!baCanEdit('ba-discovery');updateCounter();refreshDiscoveryGroupCounts();renderDiscoverySummary();$('baDiscoverySaveStatus').textContent='Unsaved changes · click Save 12 Questions to save manually';});
      wrap.append(labelRow,area,helper);if(noDecisionChoice)wrap.append(noDecisionChoice);wrap.append(counter);section.append(wrap);
    }
    root.append(section);
  }
  $('discoverySave').disabled=true;
  renderDiscoverySummary();
}

function brElement(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;}
function baIconAction(node,icon,tooltip){
 node.classList.add('ba-br-icon-action');
 node.textContent=icon;
 node.title=tooltip;
 node.dataset.tooltip=tooltip;
 node.setAttribute('aria-label',tooltip);
 return node;
}
let brActiveFilter='all',brFilterProjectId=null;
function activeBusinessRequirements(){return (brState?.brs||[]).filter(br=>br.status!=='retired'&&!br.archivedFromRestart);}
function brImpactType(br){return brState?.impact?.find(x=>x.id===br.id)?.change||(br.needsRefresh?'modified':br.status==='approved'?'unchanged':'new');}
function displayBRStatus(br){
 if(br.status==='retire-proposed')return ['Removal pending','remove'];
 if(br.externalReviewRequired&&br.status==='approved')return ['Updated · Review required','stale'];
 if(br.needsRefresh&&br.status==='approved')return ['Review required','stale'];
 if(br.status==='approved')return ['Approved','approved'];
 if(br.status==='draft'&&br.draftSavedAt)return ['Draft saved','saved'];
 return ['Draft','generated'];
}
function brMetric(name,count,key){
 const el=brElement('button','br-metric'+(brActiveFilter===key?' active':''));el.type='button';
 el.append(brElement('strong','',String(count)),brElement('span','',name));
 el.addEventListener('click',()=>{brActiveFilter=key;renderBRs();});return el;
}
function openBRComparison(id){
 const br=brState?.brs?.find(x=>x.id===id);if(!br)return;
 const base=br.approvedContent,root=$('brCompareContent');root.replaceChildren();
 $('brCompareTitle').textContent=id+' · Revision comparison';
 const columns=[['Previous approval',base],['Current draft',br]];
 for(const [label,data] of columns){
  const panel=brElement('section','br-compare-column');panel.append(brElement('h3','',label));
  if(!data){panel.append(brElement('span','muted','Not available'));root.append(panel);continue;}
  for(const [heading,value] of [['Title',data.title],['Objective',data.objective],['Scope',data.scope],['Acceptance criteria',data.acceptanceCriteria],['Features',(data.features||[]).map(f=>`${f.id||''} ${f.title}\n${f.description}\n${(f.stories||[]).map(x=>'  '+(x.id||'')+' '+x.title).join('\n')}`).join('\n\n')]]){
   const section=brElement('div','br-compare-section');section.append(brElement('strong','',heading),brElement('pre','',value||'—'));
   panel.append(section);
  }
  root.append(panel);
 }
 if(br.previousDrafts?.length){
  const previous=brElement('details','br-previous-drafts');
  const summary=brElement('summary','',`${br.previousDrafts.length} earlier draft snapshot(s) · read-only`);previous.append(summary);
  for(const [index,item] of [...br.previousDrafts].reverse().entries()){
   const section=brElement('section','br-compare-section');
   section.append(brElement('h3','',`Draft ${br.previousDrafts.length-index} · ${item.at||'Date unavailable'}`));
   for(const [label,value] of [['Title',item.content?.title],['Objective',item.content?.objective],['Scope',item.content?.scope],['Acceptance criteria',item.content?.acceptanceCriteria]])section.append(brElement('strong','',label),brElement('pre','',value||'—'));
   previous.append(section);
  }
  root.append(previous);
 }
 $('brCompareModal').classList.remove('hidden');$('brCompareModal').setAttribute('aria-hidden','false');
}
$('brCompareClose').addEventListener('click',()=>{$('brCompareModal').classList.add('hidden');$('brCompareModal').setAttribute('aria-hidden','true');});
$('brCompareModal').addEventListener('click',e=>{if(e.target===e.currentTarget)$('brCompareClose').click();});
function discoveryHasReviewBlockers(){
 let result={};try{result=JSON.parse(brState?.reviewText||'{}');}catch{}
 const sourceFindings=(brState?.mappingCompleted?.preflights||[]).some(item=>item?.status==='needs-review');
 const issues=sourceFindings||result.readiness==='Needs attention'||(result.suggestions||[]).some(x=>x.severity==='Critical');
 const accepted=brState?.reviewRiskAccepted?.revision===brState?.discoveryRevision&&
  brState?.reviewRiskAccepted?.sourceFingerprint===brState?.importDigest;
 return !!issues&&!accepted;
}
function renderPublishedJira(){
 $('brOpenDelivery').classList.toggle('hidden',!Object.keys(brState?.synced||{}).length);
 const root=$('brPublishedJira');if(!root)return;
 const synced=Object.values(brState?.synced||{}).filter(x=>x?.key);
 const base=String(jiraBrowseBaseUrl||'').replace(/\/$/,'');let valid=false;
 try{const address=new URL(base);valid=address.protocol==='https:'||address.hostname==='localhost'&&address.protocol==='http:';}catch{}
 const rows=synced.map(item=>({type:item.kind==='Task'?'Task · '+(item.issueType||'Subtask'):item.issueType||item.kind||'Issue',title:item.title||'Untitled issue',key:String(item.key||'')}));
 ATGVDataTables.mount(root,rows,[{key:'type',label:'Issue type',render:row=>{const node=document.createElement('span');node.className='br-state';node.textContent=row.type;return node;}},{key:'title',label:'Summary'},{key:'key',label:'Jira key',render:row=>{const key=row.key,canLink=valid&&/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(key);const node=document.createElement(canLink?'a':'span');node.textContent=key;if(canLink){node.href=base+'/browse/'+encodeURIComponent(key);node.target='_blank';node.rel='noopener noreferrer';node.setAttribute('aria-label','Open JIRA ticket '+key);}else node.className='muted';return node;}}],{label:'Published Jira tickets',pageSize:5,sortKey:'key'});
}
function renderDiscoveryProposals(){
 const root=$('brDiscoveryProposals');if(!root)return;root.replaceChildren();
 const proposals=(brState?.discoveryProposals||[]).filter(x=>x.status==='pending').slice(-40).reverse();
 if(!proposals.length){root.append(brElement('p','muted','No Discovery suggestions from Business Requirements edits.'));return;}
 for(const proposal of proposals){
  const row=brElement('article','trace-impact-item');row.append(brElement('strong','',proposal.brId+' · '+proposal.key+' · proposed by '+proposal.actor));
  const detail=brElement('details','trace-field');detail.append(brElement('summary','','Compare Discovery answer'));
  const comparison=brElement('div','trace-before-after');comparison.append(brElement('pre','',proposal.before||'—'),brElement('pre','',proposal.after||'—'));detail.append(comparison);row.append(detail);
  const actions=brElement('div','stack actions');
  for(const [decision,title] of [['accept','Apply to Discovery'],['reject','Reject']]){
   const button=brElement('button',decision==='reject'?'secondary':'',title);button.type='button';button.disabled=!baCanEdit('ba-discovery');
   button.addEventListener('click',()=>send('brDiscoveryProposalDecision',{proposalId:proposal.id,decision}));actions.append(button);
  }
  row.append(actions);root.append(row);
 }
}
function renderSourceConflicts(){
 const root=$('brSourceConflicts');if(!root)return;root.replaceChildren();const conflicts=brState?.sourceConflicts||[];
 if(!conflicts.length){root.append(brElement('p','muted','No cross-source contradictions flagged by rule-based screening.'));return;}
 for(const item of conflicts){
  const reviewed=brState?.sourceConflictDecisions?.[item.id]===true;
  const row=brElement('article','trace-impact-item');row.append(brElement('strong','',item.brId+' · Potential contradiction · '+(reviewed?'Reviewed':'Review required')));
  const comparison=brElement('div','trace-before-after');comparison.append(brElement('pre','',item.excerptA),brElement('pre','',item.excerptB));row.append(comparison);if(!reviewed){const button=brElement('button','secondary','Acknowledge Evidence Conflict');button.type='button';button.disabled=!baCanEdit('ba-br-'+item.brId);button.addEventListener('click',()=>send('brSourceConflictReview',{conflictId:item.id}));row.append(button);}root.append(row);
 }
}
function renderTraceImpact(){
 renderDiscoveryProposals();renderSourceConflicts();
 const root=$('traceImpactChanges');if(!root)return;root.replaceChildren();
 const traces=brState?.traceability||{},coverage=traces.coverage||{};
 const changes=(traces.lastChanges||[]).filter(item=>!(item.change==='added'&&['question','discovery','review','source'].includes(item.type)));
 const brs=brState?.brs||[],active=brs.filter(item=>item.status!=='retired'&&item.status!=='retire-proposed');
 const activeIds=new Set(active.map(item=>item.id));
 const missing=(coverage.missingEvidence||[]).filter(id=>activeIds.has(id)).length;
 $('traceImpactCount').textContent=changes.length+' change'+(changes.length===1?'':'s');
 $('traceCoverage').textContent=active.length+' active Business Requirements · '+(brs.length-active.length)+' historical/pending retirement · '+missing+' without verified source evidence · '+(coverage.duplicateTitles?.length||0)+' title warnings';
 if(!changes.length){root.append(brElement('p','muted','No pending changes to display. Existing approved BRs remain preserved.'));return;}
 for(const change of changes.slice(-35).reverse()){
  const row=brElement('article','trace-impact-item');
  const question=change.type==='question'?BA_QUESTIONS.find(item=>item[0]===change.id.replace(/^QUESTION:/,'')):null;
  const readable=question?question[1]:change.type==='discovery'?'Discovery Questions':change.title||change.id;
  const label=brElement('strong','',change.type==='br'?change.id+' · '+readable:readable);const state=brElement('span','br-state',change.change.toUpperCase());
  const heading=brElement('div','section-title');heading.append(label,state);row.append(heading);
  const fields=change.fieldChanges||[];
  for(const field of fields){const detail=brElement('details','trace-field');detail.append(brElement('summary','',field.field));const panels=brElement('div','trace-before-after');
   const before=brElement('pre','',field.before||'—'),after=brElement('pre','',field.after||'—');panels.append(before,after);detail.append(panels);row.append(detail);}
  root.append(row);
 }
}
function renderChangeProposals(){
 const root=$('brChangeQueue'),target=$('brProposalTarget');if(!root||!target)return;
 const selected=target.value;target.replaceChildren();
 for(const br of brState?.brs||[])if(br.status!=='retired'&&br.status!=='retire-proposed'){
  const option=document.createElement('option');option.value=br.id;option.textContent='Business Requirements · '+br.id+' · '+br.title;target.append(option);
  for(const feature of br.features||[]){
   const f=document.createElement('option');f.value=br.id+'/'+feature.id;f.textContent='  Feature · '+feature.id+' · '+feature.title;target.append(f);
   for(const story of feature.stories||[]){
    const s=document.createElement('option');s.value=f.value+'/'+story.id;s.textContent='    Story · '+story.id+' · '+story.title;target.append(s);
    for(const task of story.tasks||[]){const t=document.createElement('option');t.value=s.value+'/'+task.id;t.textContent='      Task · '+task.id+' · '+task.title;target.append(t);}
   }
  }
 }
 if([...target.options].some(x=>x.value===selected))target.value=selected;
 $('brProposalSubmit').disabled=!activeId||!target.value||!$('brProposalValue').value.trim()||!!baBusyTask;
 root.replaceChildren();
 const isChild=target.value.includes('/');for(const option of $('brProposalField').options)option.disabled=option.value==='description'?!isChild:isChild&&option.value!=='title';if($('brProposalField').selectedOptions[0]?.disabled)$('brProposalField').value=isChild?'description':'objective';
 const proposals=(brState?.changeQueue||[]).filter(x=>x.status==='pending');
 const conflicts=new Set(),byTarget=new Map();let conflictGroups=0;
 for(const change of proposals)for(const id of change.targetIds){const key=id+'|'+change.field;if(!byTarget.has(key))byTarget.set(key,[]);byTarget.get(key).push(change);}
 for(const group of byTarget.values())if(new Set(group.map(x=>x.value)).size>1){conflictGroups++;for(const change of group)conflicts.add(change.id);}
 const resolve=$('brProposalResolution'),summary=$('brProposalConflictSummary'),reject=$('brRejectConflicting');
 resolve.classList.toggle('hidden',!proposals.length);
 summary.textContent=conflicts.size?`${conflicts.size} conflicting proposals across ${conflictGroups} requirement/field combinations. Review and reject conflicting proposals in one audited decision, or reject individually before accepting your preferred replacement.`:`${proposals.length} pending proposal${proposals.length===1?'':'s'} requiring a decision before approval.`;
 reject.classList.toggle('hidden',!conflicts.size);reject.disabled=!conflicts.size||!!baBusyTask||!baOwnerState?.me||proposals.filter(item=>conflicts.has(item.id)).some(item=>!item.targetIds.every(id=>baCanEdit('ba-br-'+id.split('/')[0])));
 if(!proposals.length){root.append(brElement('p','muted','No changes awaiting review.'));return;}
 if(proposals.length>40)root.append(brElement('p','muted',`Showing all ${proposals.length} pending proposals in this scrollable list. Review each proposal or use the confirmed conflict action above.`));
 for(const change of proposals.slice().reverse()){
  const row=brElement('article','trace-impact-item');row.append(brElement('strong','',change.origin.toUpperCase()+' · '+change.field+' · '+change.targetIds.join(', ')));
  const content=brElement('p','',change.value);row.append(content);
  const actions=brElement('div','stack actions');const allowed=change.targetIds.every(id=>baCanEdit('ba-br-'+id.split('/')[0]));
  for(const [action,label] of [['accept','Accept into Business Requirements drafts'],['reject','Reject']]){
   const button=brElement('button',action==='reject'?'secondary':'',label);button.type='button';button.disabled=!allowed||!!baBusyTask;
   if(action==='accept'&&conflicts.has(change.id))button.disabled=true;
   button.addEventListener('click',()=>send('brChangeDecision',{proposalId:change.id,decision:action}));actions.append(button);
  }
  row.append(actions);root.append(row);
 }
}
$('brRejectConflicting').addEventListener('click',()=>{
 if($('brRejectConflicting').disabled||!brState)return;
 baBusy('resolveProposals','Reviewing conflicting proposals…');
 send('brRejectConflictingProposals',{revision:brState.revision});
});
$('brProposalTarget').addEventListener('change',renderChangeProposals);
$('brProposalValue').addEventListener('input',()=>{$('brProposalSubmit').disabled=!$('brProposalValue').value.trim()||!$('brProposalTarget').value;});
$('brProposalSubmit').addEventListener('click',()=>{
 const field=$('brProposalField').value,value=$('brProposalValue').value.trim(),target=$('brProposalTarget').value;
 if(!field||!value||!target)return;
 $('brProposalValue').value='';$('brProposalSubmit').disabled=true;
 send('brChangePropose',{change:{origin:proposedChangeOrigin,sourceId:proposedChangeSource,field,value,targetIds:[target]}});proposedChangeOrigin='br';proposedChangeSource='BA Work';
});
let proposedChangeOrigin='br',proposedChangeSource='BA Work';
function renderInboundJira(){
 const root=$('brJiraInboundList');if(!root)return;root.replaceChildren();
 const changes=(brState?.inboundJira||[]).filter(x=>x.status!=='superseded');
 $('brJiraScanExternal').disabled=!activeId||!!baBusyTask;
 if(!changes.length){root.append(brElement('p','muted','No external JIRA changes detected. Select Check JIRA Updates to compare linked issues.'));return;}
 for(const item of changes.slice(-50).reverse()){
  const row=brElement('article','trace-impact-item');const heading=brElement('div','section-title');
  heading.append(brElement('strong','',item.type+' '+item.key+' · '+item.summary),brElement('span','br-state stale',item.status));row.append(heading);
  const detail=brElement('details','trace-field');detail.append(brElement('summary','',item.path+' · External change details'),brElement('pre','trace-jira-body',item.description||'No description returned'));row.append(detail);
  const actions=brElement('div','stack actions');
  const proposal=brElement('button','secondary','Prepare Business Requirements Change Proposal');proposal.type='button';proposal.addEventListener('click',()=>{
   proposedChangeOrigin='jira';proposedChangeSource=item.key;const target=[...$('brProposalTarget').options].some(o=>o.value===item.path)?item.path:item.path.split('/')[0];$('brProposalTarget').value=target;renderChangeProposals();$('brProposalField').value=target.includes('/')?'description':'scope';$('brProposalValue').value=item.description?.slice(0,5000)||item.summary;
   $('brProposalSubmit').disabled=!$('brProposalValue').value;baShowChangeProposal=true;renderDiscoverySummary();if(document.querySelector('.change-proposal-panel'))document.querySelector('.change-proposal-panel').open=true;document.querySelector('.change-proposal-panel')?.scrollIntoView({block:'start',behavior:'smooth'});
  });actions.append(proposal);
  if(['pending','reviewed'].includes(item.status)){
   const reconcile=brElement('button','secondary','Reconcile Approved Business Requirements');reconcile.type='button';reconcile.disabled=!baCanEdit('ba-br-'+item.path.split('/')[0]);
   reconcile.addEventListener('click',()=>send('brJiraReconcileApproved',{changeId:item.id}));actions.append(reconcile);
  }
  if(item.status==='pending'){
   const acknowledge=brElement('button','secondary','Mark Reviewed');acknowledge.type='button';acknowledge.disabled=!baCanEdit('ba-br-'+item.path.split('/')[0]);
   acknowledge.addEventListener('click',()=>send('brJiraInboundReview',{changeId:item.id}));actions.append(acknowledge);
  }
  row.append(actions);root.append(row);
 }
}
$('brJiraScanExternal').addEventListener('click',()=>{if($('brJiraScanExternal').disabled)return;baBusy('jiraPreview','Checking linked JIRA issues…');send('brJiraScanExternal');});
$('brJiraMonitorToggle').addEventListener('change',()=>send('brJiraMonitorToggle',{enabled:$('brJiraMonitorToggle').checked}));
function renderRoleImpacts(){
 const root=$('brRoleImpacts');if(!root)return;root.replaceChildren();
 const impacts=(brState?.roleImpacts||[]).filter(x=>x.status==='pending').slice(-40).reverse();
 if(!impacts.length){root.append(brElement('p','muted','No downstream role changes awaiting BA review.'));return;}
 for(const impact of impacts){
  const row=brElement('article','trace-impact-item');row.append(brElement('strong','',impact.brId+' · '+impact.roleId+' / '+impact.taskId),brElement('p','muted',impact.actor+' · '+impact.at),brElement('pre','trace-jira-body',impact.excerpt));
  const actions=brElement('div','stack actions');
  const propose=brElement('button','secondary','Prepare Business Requirements Change Proposal');propose.type='button';propose.addEventListener('click',()=>{
   proposedChangeOrigin='role';proposedChangeSource=impact.roleId+'/'+impact.taskId;$('brProposalTarget').value=impact.brId;renderChangeProposals();$('brProposalField').value='scope';$('brProposalValue').value=impact.excerpt.slice(0,5000);baShowChangeProposal=true;renderDiscoverySummary();if(document.querySelector('.change-proposal-panel'))document.querySelector('.change-proposal-panel').open=true;document.querySelector('.change-proposal-panel')?.scrollIntoView({block:'start',behavior:'smooth'});
  });
  const mark=brElement('button','secondary','Mark Reviewed');mark.type='button';mark.disabled=!baCanEdit('ba-br-'+impact.brId);mark.addEventListener('click',()=>send('brRoleImpactReview',{impactId:impact.id}));
  actions.append(propose,mark);row.append(actions);root.append(row);
 }
}
// A Change Request is contextual to Jira Preview: do not render an empty,
// terminal-only history panel. Keep all Jira preflight/approval guards in the
// extension host; visibility here never authorizes a remote change.
function actionableJiraChangeRequests(register){
 return (Array.isArray(register?.changeRequests)?register.changeRequests:[]).filter(item=>['impact-assessed','approved','implemented'].includes(item?.state));
}
function hasRelevantJiraChangeRequests(register,protection,previewRevision){
 return actionableJiraChangeRequests(register).length>0||!!previewRevision&&(Array.isArray(protection)?protection:[]).some(item=>item?.blocked===true);
}
function renderChangeRequests(){
 const root=$('baCRList'),panel=$('baCRPanel'),form=$('baCRForm');if(!root||!panel||!form)return;
 root.replaceChildren();const entries=actionableJiraChangeRequests(brState);
 $('baCRCount').textContent=String(entries.length);
 const blockers=brPlanRevision?jiraProtectionForCR.filter(item=>item.blocked):[];
 const pending=entries.filter(item=>['impact-assessed','approved'].includes(item.state));
 $('baCRAttention').textContent=blockers.length?`${blockers.length} Jira change(s) blocked pending verified work history or CR approval.`:pending.length?`${pending.length} Change Request(s) require attention.`:'';
 form.classList.toggle('hidden',!blockers.length||!brPlanRevision);
 for(const cr of entries.slice().reverse()){
  const item=brElement('article','ba-cr-card');item.append(brElement('strong','',cr.id+' · '+cr.state.replace(/-/g,' ')));
  item.append(brElement('p','',cr.reason));item.append(brElement('small','muted',`Created by ${cr.createdBy} · ${new Date(cr.createdAt).toLocaleString()} · ${cr.paths.length} changes`));
  const impact=brElement('details','ba-cr-impact');impact.append(brElement('summary','','Impact analysis'));
  const info=brElement('div','');info.append(brElement('p','',`Affected requirements: ${(cr.impact?.brIds||[]).join(', ')||'None'}`),brElement('p','',`Jira issues: ${(cr.impact?.linkedJira||[]).map(x=>x.key).join(', ')||'None'}`),brElement('p','',`Downstream reviews: ${(cr.impact?.downstreamKinds||[]).join(', ')||'None'}`));impact.append(info);item.append(impact);
  const actions=brElement('div','stack actions');
  if(cr.state==='impact-assessed'){
   const analyze=brElement('button','secondary','AI Impact Analysis');analyze.type='button';analyze.disabled=!!baBusyTask;
   analyze.addEventListener('click',()=>send('brChangeRequestAIImpact',{crId:cr.id}));actions.append(analyze);
  }
  if(['approved','implemented','closed'].includes(cr.state)){
   if(cr.jiraIssue?.key){item.append(brElement('p','ba-cr-jira','Jira CR: '+cr.jiraIssue.key+' · linked'));}
   else{const jira=brElement('button','secondary','Create Jira CR Ticket');jira.type='button';jira.disabled=!!baBusyTask;
    jira.addEventListener('click',()=>send('brChangeRequestPublishTicket',{crId:cr.id}));actions.append(jira);}
  }
  if(cr.aiImpact){const ai=brElement('details','ba-cr-impact');ai.append(brElement('summary','','AI Impact Draft · Review Required'));
    ai.append(brElement('p','',cr.aiImpact.summary));
    for(const [name,key] of [['Requirements','affectedRequirements'],['Designs','affectedDesigns'],['APIs','affectedAPIs'],['Database','affectedDatabase'],['Jira','affectedJira'],['Risks','risks'],['Testing','testImpact']]){
      const values=cr.aiImpact[key]||[];if(values.length)ai.append(brElement('p','',name+': '+values.join('; ')));
    }item.append(ai);
  }
  for(const [decision,label] of cr.state==='impact-assessed'?[['approve','Approve CR'],['reject','Reject CR']]:cr.state==='implemented'?[['close','Close CR']]:[]){
   const button=brElement('button',decision==='reject'?'secondary':'',label);button.type='button';button.disabled=!!baBusyTask;
   button.addEventListener('click',()=>send('brChangeRequestDecision',{crId:cr.id,decision,revision:brState.revision}));actions.append(button);
  }
  if(actions.childElementCount>1){
   const primary=actions.firstElementChild;primary.classList.add('ba-cr-primary');item.append(primary);
   const more=brElement('details','br-actions-menu');more.append(brElement('summary','','More CR actions'),actions);item.append(more);
  }else item.append(actions);root.append(item);
 }
 if(!entries.length&&blockers.length)root.append(brElement('p','muted','The blocked Jira changes require review. Work-history verification and independent Change Request approval remain mandatory where applicable.'));
}
$('baCRForm').addEventListener('submit',e=>{
 e.preventDefault();if(!brPlanRevision||!brState)return;
 const reason=$('baCRReason').value.trim(),paths=[...new Set(jiraProtectionForCR.filter(x=>x.started&&x.issues.every(i=>i.known)).map(x=>x.path))];
 if(reason.length<10){$('baCRAttention').textContent='Provide a business justification (at least 10 characters).';return;}
 if(!paths.length){$('baCRAttention').textContent='No verified started issue is eligible. Resolve Jira history errors first.';return;}
 send('brChangeRequestCreate',{revision:brState.revision,paths,reason});
});
// Verified BA auto-claim is idempotent for each unassigned draft batch.
// The host confirms live identity, ownership revision and current BR status.
const baClaimBatches=new Set();
function maybeAutoAssignBARequirements(){
 if(!workspaceOpened||!activeId||selectedRole!=='business-analyst'||!['myWork','discovery'].includes(view)||
    !baOwnerState?.me||baOwnerState.cached||baOwnerState.scope==='local')return;
 const ids=(brState?.brs||[]).filter(br=>br.status==='draft'&&!br.archivedFromRestart&&
   !baOwner('ba-br-'+br.id).ownerId&&!baOwner('ba-br-'+br.id).pending).map(br=>br.id).slice(0,100);
 if(!ids.length)return;
 const token=activeId+'|'+baOwnerState.me+'|'+ids.join(',');
 if(baClaimBatches.has(token))return;
 baClaimBatches.add(token);
 send('baAutoClaimUnassigned',{projectId:activeId,roleId:'business-analyst',brIds:ids});
}
function renderBRs(){
 renderBAWorkDashboard();
 if(brFilterProjectId!==activeId){brActiveFilter='all';brFilterProjectId=activeId;}
 renderRoleImpacts();
 renderInboundJira();
 renderChangeProposals();
 renderTraceImpact();
 renderPublishedJira();
 const root=$('brCards');if(!root)return;root.replaceChildren();
 if(!brState){renderDiscoverySummary();return;}
 const items=activeBusinessRequirements(),count=items.length,approved=items.filter(br=>br.status==='approved'&&!br.needsRefresh).length;
 const drafts=items.filter(br=>br.status==='draft').length,removed=items.filter(br=>br.status==='retire-proposed').length;
 const changed=items.filter(br=>br.needsRefresh&&br.status!=='retire-proposed').length;
 const reviewReady=brState.reviewRevision&&brState.reviewRevision===brState.discoveryRevision&&!discoveryDirty&&!discoveryHasReviewBlockers();
 $('brWorkflowStatus').textContent=`${brState.importName||'No source'} · ${count} Business Requirements · ${approved} approved · ${changed} review required`;
 
 const impact=$('brImpactSummary');impact.replaceChildren();
 impact.append(brMetric('New',items.filter(br=>brImpactType(br)==='new').length,'new'),brMetric('Modified',items.filter(br=>brImpactType(br)==='modified').length,'modified'),brMetric('Unchanged',items.filter(br=>brImpactType(br)==='unchanged').length,'unchanged'),brMetric('Removal pending',removed,'removed'));
 const filters=$('brFilters');filters.replaceChildren();
 for(const [key,label] of [['all','All Business Requirements'],['pending','Action required'],['approved','Approved']]){
  const button=brElement('button','secondary br-filter'+(brActiveFilter===key?' selected':''),label);button.type='button';button.setAttribute('aria-pressed',String(brActiveFilter===key));
  button.addEventListener('click',()=>{brActiveFilter=key;renderBRs();});filters.append(button);
 }
 const display=items.filter(br=>brActiveFilter==='all'||brActiveFilter==='approved'&&ATGVCompletedBRHistory.currentlyApproved(br)||brActiveFilter==='pending'&&ATGVCompletedBRHistory.requiresAttention(br)||brActiveFilter==='removed'&&br.status==='retire-proposed'||['new','modified','unchanged'].includes(brActiveFilter)&&brImpactType(br)===brActiveFilter);
 $('brSelectionCount').textContent=display.length+' / '+count;
 if(!display.length)root.append(brElement('div','br-empty-state',count?'No matching Business Requirements for this filter':(brState?.brs||[]).some(br=>br.archivedFromRestart||br.status==='retired')?'No active Business Requirements. Previous requirements are preserved in archived history after restart. Upload source documents and generate new drafts.':brState?.sourceDocuments?.length?'No Business Requirements drafts yet. Complete discovery and AI review, then generate drafts.':'No Business Requirements yet. Upload source documents to begin.'));
 for(const br of display){
  const card=brElement('article','br-card');card.dataset.state=br.status;
  const header=brElement('div','section-title');const titleWrap=brElement('div','br-title-wrap');
  titleWrap.append(brElement('strong','',br.id+' · '+br.title));
  const meta=brElement('div','br-card-meta'),[label,css]=displayBRStatus(br);
  meta.append(brElement('span','br-state '+css,label),brElement('span','br-state br-change',brImpactType(br).toUpperCase()),brElement('span','muted',`R${br.approvedRevision||0} · ${br.features?.length||0} features · ${br.features?.reduce((n,f)=>n+(f.stories?.length||0),0)||0} stories`));
  meta.append(brElement('span','br-state ownership-state-text '+ATGVOwnershipPresentation.display(baOwner('ba-br-'+br.id),baOwnerState?.me,{loaded:!!baOwnerState,cached:!!baOwnerState?.cached}).state,baOwnershipLabel('ba-br-'+br.id)));
  if(br.roleReviewRequired)meta.append(brElement('span','br-state stale','Role deliverable changed · BA review required'));
  if(br.businessApproval)meta.append(brElement('span','br-state',`BO ${br.businessApproval.decision} · ${br.businessApproval.actor}`));
  if(br.dependencyReviewRequired){meta.append(brElement('span','br-state stale','Upstream change requires review'));}
  if(br.approvedRevisions?.length)meta.append(brElement('span','br-state',br.approvedRevisions.length+' approved revision(s) preserved'));
  const cardControls=brElement('div','br-card-controls');cardControls.append(meta);titleWrap.append(cardControls);header.append(titleWrap);card.append(header);
  const actionBar=brElement('div','br-card-action-row');cardControls.append(actionBar);
  const actions=brElement('div','stack actions');
  if(br.dependencyReviewRequired&&baCanEdit('ba-br-'+br.id)){
   const acknowledge=brElement('button','secondary','Acknowledge Impact');acknowledge.type='button';
   acknowledge.addEventListener('click',()=>send('brDependencyReviewed',{brId:br.id}));actions.append(acknowledge);
  }
  const ownership=baOwner('ba-br-'+br.id);
  const ownershipDisplay=ATGVOwnershipPresentation.display(ownership,baOwnerState?.me,{loaded:!!baOwnerState,cached:!!baOwnerState?.cached});
  for(const operation of [ownershipDisplay.primary,ownershipDisplay.secondary].filter(Boolean)){
   const assign=brElement('button','secondary',ATGVOwnershipPresentation.actionLabel(operation));assign.type='button';assign.disabled=(!baOwnerState?.me&&baOwnerState?.scope!=='local')||!!baOwnerState?.cached&&['approve-transfer','reject-transfer','cancel-transfer'].includes(operation);
   assign.addEventListener('click',()=>baAction('ba-br-'+br.id,operation));
   assign.classList.add('br-owner-inline-action');
   meta.append(assign);
  }
  if(br.status!=='retire-proposed'){
   const requiresApproval=br.status!=='approved'||!!(br.needsRefresh||br.externalReviewRequired||br.roleReviewRequired||br.dependencyReviewRequired);
   const preview=brElement('button','br-card-preview '+(requiresApproval?'br-preview-action':'secondary br-preview-approved'),br.status==='approved'?'Preview':'Preview / Edit');
   preview.type='button';if(br.status==='approved'&&requiresApproval)preview.title='Approved snapshot is read-only; create a new revision after resolving review prerequisites.';
   preview.addEventListener('click',()=>openBREditor(br.id));actionBar.append(preview);
  }
  const placeWithPreview=button=>{const anchor=actionBar.querySelector('.br-card-preview');if(anchor)actionBar.insertBefore(button,anchor);else actionBar.append(button);};
  if(br.status==='approved'){
   const revise=brElement('button','secondary','Create New Revision');revise.type='button';
   revise.disabled=!!baBusyTask||!reviewReady||br.needsRefresh||br.externalReviewRequired||br.roleReviewRequired||br.dependencyReviewRequired||!baCanEdit('ba-br-'+br.id);
   revise.title=revise.disabled?'Resolve review prerequisites and claim Business Requirements ownership before revising.':'Create an editable draft without changing the approved BR or Jira issues.';
   revise.addEventListener('click',()=>{if(revise.disabled)return;send('brBeginRevision',{brId:br.id,revision:brState.revision});});placeWithPreview(revise);
  }
  if(br.approvedContent||br.previousDrafts?.length){const compare=brElement('button','secondary','Compare revisions');compare.type='button';compare.addEventListener('click',()=>openBRComparison(br.id));placeWithPreview(compare);}
  if(br.status==='retire-proposed'){
   const retain=brElement('button','secondary','Keep Business Requirements');retain.type='button';retain.disabled=!reviewReady;retain.addEventListener('click',()=>send('brKeep',{brId:br.id,revision:brState.revision}));actions.append(retain);
   const retire=brElement('button','br-danger','Confirm retirement');retire.type='button';retire.disabled=!reviewReady;retire.addEventListener('click',()=>send('brRetire',{brId:br.id,revision:brState.revision}));actions.append(retire);
  }
  if(br.status==='approved'&&!br.needsRefresh&&reviewReady){
   const retire=brElement('button','secondary','Retire');retire.type='button';retire.addEventListener('click',()=>send('brRetire',{brId:br.id,revision:brState.revision}));placeWithPreview(retire);
  }
  // Primary preview and revision actions share the same metadata/ownership row.
  if(actions.children.length){
   const advanced=brElement('details','br-actions-menu');
   advanced.append(atgvMoreActionsSummary(br.id),actions);card.append(advanced);
  }
  const related=Object.entries(brState?.synced||{}).filter(([path,item])=>item?.key&&(path===br.id||path.startsWith(br.id+'/')));
  if(related.length){const info=brElement('details','br-jira-status');info.append(brElement('summary','',related.length+' linked Jira issue(s) · Work status'));
   for(const [,item] of related){const history=brState.jiraWorkHistory?.[item.key];const status=history?.known?(history.started?'Started':'Not started'):'Unverified';
    info.append(brElement('p','',item.key+' · '+(history?.status||'Unknown status')+' · '+status+' · '+(history?.lastCheckedAt?new Date(history.lastCheckedAt).toLocaleString():'Not checked')));
   }card.append(info);
  }
  root.append(card);
 }
 renderDiscoverySummary();renderChangeRequests();decorateBAActionButtons();
 maybeAutoAssignBARequirements();
}
function brLine(ops,text,attributes){
 const value=String(text??'');const parts=value.split(/\r?\n/);
 for(const part of parts){ops.push({insert:part});ops.push(attributes?{insert:'\n',attributes}:{insert:'\n'});}
}
function brToDelta(br){
 const source=br.status==='approved'&&br.approvedContent?br.approvedContent:br,ops=[];
 brLine(ops,source.title,{header:1});
 brLine(ops,'Business objective',{header:2});brLine(ops,source.objective);
 brLine(ops,'Scope / exclusions',{header:2});brLine(ops,source.scope);
 brLine(ops,'Acceptance criteria',{header:2});brLine(ops,source.acceptanceCriteria);
 brLine(ops,'Features and user stories',{header:2});
 for(const feature of source.features||[]){
  brLine(ops,feature.id?`[${feature.id}] ${feature.title}`:feature.title,{header:3});brLine(ops,feature.description);
  for(const story of feature.stories||[]){brLine(ops,`Story${story.id?' ['+story.id+']':''}: ${story.title} — ${story.description}`,{list:'bullet'});for(const task of story.tasks||[])brLine(ops,`Task${task.id?' ['+task.id+']':''}: ${task.title} — ${task.description}`,{list:'bullet'});}
 }
 return {ops};
}
function rebuildBRQuill(br,readOnly){
 const mount=$('brQuillMount');mount.replaceChildren();const editor=document.createElement('div');editor.id='brQuillEditor';editor.setAttribute('aria-label','Business Requirement document editor');mount.append(editor);
 if(!window.Quill){$('brEditError').textContent='The rich-text editor is unavailable in this build.';brQuill=null;return;}
 brQuill=new Quill('#brQuillEditor',{theme:'snow',readOnly,modules:{toolbar:readOnly?false:[[{header:[1,2,3,false]}],['bold','italic','underline'],[{list:'bullet'}],['link'],['clean']]}});
 brQuill.setContents(brToDelta(br));brQuill.enable(!readOnly);
 brQuill.on('text-change',(_delta,_old,source)=>{if(source==='user'){brEditorDirty=true;updateBREditorActions();}});
}
function quillLines(){
 if(!brQuill)throw new Error('Business Requirements editor is not available.');
 const lines=[];let buffer='';
 for(const op of brQuill.getContents().ops||[]){
  if(typeof op.insert!=='string')continue;
  const parts=op.insert.split('\n');
  for(let i=0;i<parts.length;i++){
   buffer+=parts[i];
   if(i<parts.length-1){lines.push({text:buffer.trim(),attributes:op.attributes||{}});buffer='';}
  }
 }
 if(buffer.trim())lines.push({text:buffer.trim(),attributes:{}});
 return lines;
}
function parseBRQuill(){
 const lines=quillLines();let title='',section='',feature=null;const content={objective:[],scope:[],acceptanceCriteria:[],features:[]};
 const normal=text=>{if(!text)return;if(section==='objective')content.objective.push(text);else if(section==='scope')content.scope.push(text);else if(section==='acceptance')content.acceptanceCriteria.push(text);else if(section==='features'&&feature)feature.descriptionParts.push(text);};
 for(const line of lines){const text=line.text;if(!text)continue;const header=line.attributes?.header;
  if(header===1&&!title){title=text;continue;}
  if(header===2){const key=text.toLowerCase();section=key.startsWith('business objective')?'objective':key.startsWith('scope')?'scope':key.startsWith('acceptance criteria')?'acceptance':key.startsWith('features')?'features':'';feature=null;continue;}
  if(header===3&&section==='features'){const featureMarker=/^\[(F-[0-9]+)\]\s+(.+)$/.exec(text);feature={...(featureMarker?{id:featureMarker[1]}:{}),title:featureMarker?featureMarker[2]:text,descriptionParts:[],stories:[]};content.features.push(feature);continue;}
  if(section==='features'&&feature&&/^task(?:\s*\[T-[0-9]+\])?\s*:/i.test(text)){const match=/^task(?:\s*\[(T-[0-9]+)\])?\s*:\s*(.+?)\s+[—-]\s+(.+)$/i.exec(text);if(!match||!feature.stories.length)throw new Error('Add a Story before its Tasks.');const story=feature.stories.at(-1);story.tasks=story.tasks||[];story.tasks.push({...(match[1]?{id:match[1]}:{}),title:match[2].trim(),description:match[3].trim()});continue;}
  if(section==='features'&&feature&&(line.attributes?.list||/^story(?:\s*\[S-[0-9]+\])?\s*:/i.test(text))){const match=/^story(?:\s*\[(S-[0-9]+)\])?\s*:\s*(.+?)\s+[—-]\s+(.+)$/i.exec(text);if(!match)throw new Error('Each story must use: Story: title — description');feature.stories.push({...(match[1]?{id:match[1]}:{}),title:match[2].trim(),description:match[3].trim(),tasks:[]});continue;}
  normal(text);
 }
 if(!title)throw new Error('Business Requirements title is required as Heading 1.');
 const objective=content.objective.join('\n').trim(),scope=content.scope.join('\n').trim(),acceptanceCriteria=content.acceptanceCriteria.join('\n').trim();
 if(!objective||!scope||!acceptanceCriteria)throw new Error('Business objective, Scope / exclusions and Acceptance criteria must each contain text.');
 return {title,objective,scope,acceptanceCriteria,features:content.features.map(f=>({...(f.id?{id:f.id}:{}),title:f.title,description:f.descriptionParts.join('\n').trim()||'TBD',stories:f.stories}))};
}
function brApprovalPrerequisites(br){
 const blockers=[];
 const add=(key,message)=>blockers.push({key,message});
 const independent=!!roleSettings?.enabled?.includes('business-owner');
 if(!br||br.status!=='draft')add('draft','Only a draft Business Requirement can be approved.');
 if(br?.status==='draft'&&!br.draftSavedAt)add('draftSaved','Open Preview & Save and save this exact draft before approving it.');
 if(brReadOnly)add('ownership','The document is read-only. Use Assign to Me in Business Requirements Documents, or request a transfer from its owner.');
 if(baBusyTask||brEditorSaving)add('busy','Wait for the current operation to complete.');
 if(!baReviewCurrent())add('review','Run AI Review against the latest saved Discovery answers.');
 else if(discoveryHasReviewBlockers())add('review','Review & Acknowledge Findings in AI Review. This is separate from resolving open Discovery decisions.');
 const readiness=discoveryData?.readiness;
 if(!readiness||readiness.filled!==readiness.total){
  add('discovery',`Complete and save all 12 Discovery answers (${readiness?.filled||0} of ${readiness?.total||12} currently filled).`);
 }else if(readiness.needsDecision){
  add('discovery','Question 12 records unresolved decisions. Review them during AI Review and resolve them before final BR approval. Acknowledging AI findings does not close those decisions.');
 }
 if(br?.draftSavedAt&&br.draftSource&&(br.draftSource.discoveryRevision!==brState?.discoveryRevision||br.draftSource.digest!==brState?.importDigest||br.draftSource.epoch!==brState?.importEpoch))add('draftSource','The saved draft is based on an older source or Discovery revision. Regenerate and save a current draft.');
 if(br?.dependencyReviewRequired)add('impact','Review affected upstream requirement dependencies before approving.');
 if((brState?.sourceConflicts||[]).some(item=>item.brId===br?.id&&!brState?.sourceConflictDecisions?.[item.id]))add('conflict','Resolve source-document conflicts for this Business Requirement.');
 if((brState?.changeQueue||[]).some(item=>item.status==='pending'&&(item.targetIds||[]).some(target=>target===br?.id||target.startsWith(br?.id+'/'))))add('changes','Resolve pending requirement change proposals for this document.');
 if(independent){
  if(brEditorDirty)add('businessOwner','Save edited content, then obtain fresh independent Business Owner approval for that exact draft.');
  else if(!br?.draftSavedAt)add('businessOwner','Save Draft, then have an authorized Business Owner approve this draft before final approval.');
  else if(br?.businessApproval?.decision!=='approved')add('businessOwner','Independent Business Owner approval is pending. Switch to the Business Owner role, review the saved draft, and record the decision.');
 }
 return blockers;
}
function updateBREditorActions(){
 const br=brState?.brs?.find(x=>x.id===brEditing);
 const draft=br?.status==='draft',approved=br?.status==='approved';
 const editingArtifact=$('brEditModal').dataset.baArtifact==='true';
 const canEdit=!!br&&(draft||editingArtifact&&approved)&&!brReadOnly&&!baBusyTask&&!brEditorSaving;
 const independent=!!roleSettings?.enabled?.includes('business-owner');
 const isBusinessOwner=$('sidebarRole')?.value==='business-owner';
 const editorMilestone=baViewedStep||window.baLastGuideProgress?.find(step=>step.current)?.key||'';
 $('brEditEndorse').classList.toggle('hidden',!independent||!draft||editorMilestone==='save');
 $('brEditEndorse').disabled=!independent||!draft||!br?.draftSavedAt||brEditorDirty||!!baBusyTask||!isBusinessOwner;
 const blockers=brApprovalPrerequisites(br);
 const canApprove=!!br&&!blockers.length;
 $('brEditSave').classList.toggle('hidden',brReadOnly||!editingArtifact&&editorMilestone==='approve');
 $('brEditSave').disabled=!canEdit||(editingArtifact?!brEditorDirty:!!br?.draftSavedAt&&!brEditorDirty);
 $('brEditApprove').classList.toggle('hidden',(!draft&&!approved)||editorMilestone==='save');
 $('brEditApprove').textContent=approved?'✓ Approved':independent?'Final Approve Business Requirements':'Approve Business Requirements';
 $('brEditApprove').disabled=!canApprove;
 $('brEditApprove').title=blockers.length?blockers.map(x=>x.message).join(' '):'Approve this reviewed Business Requirements draft as an immutable revision.';
 $('brEditRevision').classList.toggle('hidden',!approved);
 $('brEditRevision').disabled=!approved||!!baBusyTask||!baCanEdit('ba-br-'+br.id)||br.needsRefresh||br.externalReviewRequired||br.roleReviewRequired||br.dependencyReviewRequired||!baReviewCurrent();
 for(const id of ['brEditSave','brEditApprove','brEditRevision'])$(id).classList.add('ba-process-btn');
 $('brEditSave').classList.toggle('ba-completed',!!br?.draftSavedAt&&!brEditorDirty);
 $('brEditApprove').classList.toggle('ba-completed',approved);
 const guidance=$('brApprovalGuidance'),list=$('brApprovalGuidanceList');
 guidance.classList.toggle('hidden',!draft||!blockers.length);list.replaceChildren();
 const resolutionButtons={
  discovery:['Resolve Discovery Questions','brApprovalEditDiscovery'],
  draftSaved:['Open Preview & Save','previewSave'],
  review:['Open AI Review','brApprovalReviewAI'],
  ownership:['Open Document Ownership','ownership'],
  businessOwner:['Open Business Owner Role','businessOwner'],
  draftSource:['Review Source & Regenerate','draftSource'],
  impact:['Review Requirement Impact','impact'],
  conflict:['Review Source Conflicts','conflict'],
  changes:['Review Change Proposals','changes']
 };
 for(const blocker of blockers){
  const row=document.createElement('li');row.className='br-approval-blocker';
  row.append(brElement('span','',blocker.message));
  if(resolutionButtons[blocker.key]){
   const [label,action]=resolutionButtons[blocker.key];
   const button=brElement('button','secondary br-approval-next',label);button.type='button';
   button.addEventListener('click',()=>{
    // Use real workflow navigation. Forwarding to a hidden button left the
    // Approval milestone active, so the Discovery/AI Review panels stayed hidden.
    if(action==='brApprovalEditDiscovery'){openDiscoveryQuestionsFromApproval();return;}
    if(action==='brApprovalReviewAI'){openAIReviewFromApproval();return;}
    if(!closeBREditor())return;
    if(action==='previewSave'){openBAWorkflowStep('save');return;}
    if(action==='ownership'){
     baReopenDocuments=true;renderDiscoverySummary();
     const card=[...document.querySelectorAll('#brCards .br-card')].find(item=>item.textContent.includes(br.id+' · '));
     card?.scrollIntoView({block:'center',behavior:'smooth'});card?.querySelector('.br-owner-inline-action')?.focus();return;
    }
    if(action==='businessOwner'){
     const picker=$('sidebarRole');if(picker&&[...picker.options].some(opt=>opt.value==='business-owner')){picker.value='business-owner';picker.dispatchEvent(new Event('change',{bubbles:true}));}
     else navigate('operations');return;
    }
    if(action==='draftSource'){
     baReopenDocuments=true;renderDiscoverySummary();($('brGenerateAffected')?.classList.contains('hidden')?$('brGenerate'):$('brGenerateAffected'))?.scrollIntoView({block:'center',behavior:'smooth'});return;
    }
    baReopenDocuments=true;baShowChangeProposal=true;renderDiscoverySummary();
    const target=action==='impact'?document.querySelector('.trace-impact-panel'):action==='conflict'?$('brSourceConflicts'):document.querySelector('.change-proposal-panel');
    const panel=target?.closest('.trace-impact-panel')||target?.closest('.change-proposal-panel')||target;
    panel?.classList.remove('hidden');if(panel?.tagName==='DETAILS')panel.open=true;target?.scrollIntoView({block:'center',behavior:'smooth'});
   });row.append(button);
  }
  list.append(row);
 }
 $('brApprovalEditDiscovery').classList.add('hidden');
 $('brApprovalReviewAI').classList.add('hidden');
 const approvalNotice=blockers.length?'Approval blocked: '+blockers.map(x=>x.message).join(' '):null;
 $('brEditStatus').textContent=approved?'Approved · Read-only':brEditorSaving?'Saving draft…':brReadOnly?'Draft · Read-only':approvalNotice||(brEditorDirty?'Unsaved changes · Approve will save automatically':br?.draftSavedAt?'Draft saved · Ready for approval':'AI-generated draft · Review content; Approve will save automatically');
 if(editingArtifact)$('brEditStatus').textContent=brEditorSaving?'Saving draft…':brReadOnly?'View requirement':brEditorDirty?'Unsaved changes':'Save changes to refresh the Jira preview.';
 window.ATGVBusinessRequirements?.render();
}
function openBREditor(id,{artifact=false}={}){
 const br=brState?.brs?.find(item=>item.id===id);if(!br||br.status==='retired'||br.status==='retire-proposed')return;
 brEditing=id;baBreadcrumbAtRequirements=true;
 brReadOnly=(!artifact&&br.status!=='draft')||!baCanEdit('ba-br-'+id);
 $('brEditModal').dataset.baArtifact=String(artifact);
 $('brEditPlacementField').classList.toggle('hidden',!artifact);
 const placement=$('brSuggestedPlacement');
 placement.value=br.jiraPlacement||'';
 placement.readOnly=brReadOnly;
 brEditorDirty=false;brEditorSaving=false;
 const editorMilestone=artifact?'':baViewedStep||window.baLastGuideProgress?.find(step=>step.current)?.key||'';
 $('brEditTitle').textContent=(editorMilestone==='approve'?'Review for Approval ':brReadOnly?'Preview ':'Preview / Edit ')+id;
 $('brEditError').textContent='';
 $('brEditModal').classList.remove('hidden');$('brEditModal').setAttribute('aria-hidden','false');rebuildBRQuill(br,brReadOnly||!artifact&&editorMilestone==='approve');updateBREditorActions();
 if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();
}
let brCloseAfterSave=false;
function closeBREditor(force=false){
 if(brEditorSaving){$('brEditError').textContent='Wait for the draft to finish saving.';return false;}
 if(!force&&brEditorDirty){$('brUnsavedModal').classList.remove('hidden');$('brUnsavedModal').setAttribute('aria-hidden','false');return false;}
 $('brUnsavedModal').classList.add('hidden');$('brUnsavedModal').setAttribute('aria-hidden','true');
 brCloseAfterSave=false;brEditing=null;brReadOnly=false;brQuill=null;brEditorDirty=false;brApprovePending=false;
 $('brEditModal').classList.add('hidden');$('brEditModal').setAttribute('aria-hidden','true');if(typeof renderWorkspaceBreadcrumbs==='function')renderWorkspaceBreadcrumbs();return true;
}
$('brUnsavedCancel').addEventListener('click',()=>{$('brUnsavedModal').classList.add('hidden');$('brUnsavedModal').setAttribute('aria-hidden','true');});
$('brUnsavedDiscard').addEventListener('click',()=>closeBREditor(true));
$('brUnsavedSave').addEventListener('click',()=>{brCloseAfterSave=true;$('brUnsavedModal').classList.add('hidden');$('brUnsavedModal').setAttribute('aria-hidden','true');$('brEditSave').click();});
$('brEditClose').addEventListener('click',()=>closeBREditor());
$('brSuggestedPlacement').addEventListener('input',()=>{brEditorDirty=true;updateBREditorActions();});
// Approval prerequisites are shown inside the BR editor, but Discovery and
// AI Review are rendered under separate milestones. Navigate to the milestone
// BEFORE expanding, scrolling, or focusing its panel.
function openApprovalPrerequisiteStep(step,panelId,answerKey=''){
 if(!closeBREditor())return false; // Preserve the existing unsaved-draft prompt.
 baReopenQuestions=step==='mapping';
 baReopenDocuments=false;
 if(!openBAWorkflowStep(step)){
  status('Cannot open the '+(step==='mapping'?'Discovery Questions':'AI Review')+
   ' milestone. Save pending changes or complete its prerequisites first.',true);
  return false;
 }
 const panel=$(panelId);
 if(!panel||panel.classList.contains('hidden')){
  status('The requested Business Requirements panel is unavailable. Check the mapped source and saved Discovery state.',true);
  return false;
 }
 panel.open=true;
 const answer=answerKey?$('ba-'+answerKey):null;
 if(answer){
  const section=answer.closest('.discovery-group');
  if(section)section.toggleAttribute('open',true);
 }
 requestAnimationFrame(()=>{
  if(panel.classList.contains('hidden'))return;
  const target=answer||panel;
  target.scrollIntoView({block:answer?'center':'start',behavior:'smooth'});
  if(answer){
   answer.focus({preventScroll:true});
   if(answer.readOnly)status('Discovery answers are read-only. Switch to the Business Analyst role and verify your project permissions.',true);
  }
 });
 return true;
}
function openDiscoveryQuestionsFromApproval(){
 const readiness=currentDiscoveryReadiness();
 const target=readiness.needsDecision?'questions':readiness.missing?.[0]?.key||'questions';
 return openApprovalPrerequisiteStep('mapping','discoveryQuestionsPanel',target);
}
function openAIReviewFromApproval(){
 return openApprovalPrerequisiteStep('review','discoveryReviewPanel');
}
$('brApprovalEditDiscovery').addEventListener('click',openDiscoveryQuestionsFromApproval);
$('brApprovalReviewAI').addEventListener('click',openAIReviewFromApproval);
$('brEditModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBREditor();});
$('brEditSave').addEventListener('click',()=>{
 if(!brEditing||!brState||brReadOnly||brEditorSaving||window.ATGVBusinessRequirements?.busy())return;
 try{const content=parseBRQuill();const artifact=$('brEditModal').dataset.baArtifact==='true';
  if(artifact)content.jiraPlacement=$('brSuggestedPlacement').value.trim();
  brEditorSaving=true;baBusy('saveBR','Saving Business Requirements draft…');$('brEditError').textContent='Saving Business Requirements draft…';updateBREditorActions();if(artifact)send('baEditRequirementArtifact',{projectId:activeId,roleId:selectedRole,brId:brEditing,revision:brState.revision,content});
  else send('brEdit',{brId:brEditing,revision:brState.revision,content});}
 catch(e){brEditorSaving=false;baBusy('',null);$('brEditError').textContent=e.message;}
});
$('brEditRevision').addEventListener('click',()=>{
 if($('brEditRevision').disabled||!brEditing||!brState)return;
 const id=brEditing,revision=brState.revision;closeBREditor();send('brBeginRevision',{brId:id,revision});
});
$('brEditEndorse').addEventListener('click',()=>{if(!brEditing||!brState||$('brEditEndorse').disabled)return;baBusy('approveBR','Recording independent Business Owner decision…');send('brBusinessOwnerReview',{roleId:'business-owner',brId:brEditing,revision:brState.revision,decision:'approved'});});
$('brEditApprove').addEventListener('click',()=>{
 if($('brEditApprove').disabled||!brEditing||!brState)return;
 try{
  const br=brState.brs.find(x=>x.id===brEditing);
  const dirty=brEditorDirty||!br?.draftSavedAt;
  const content=dirty?parseBRQuill():undefined;
  brApprovePending=true;baBusy('approveBR','Validating and approving Business Requirements…');
  send('brSaveAndApprove',{brId:brEditing,revision:brState.revision,dirty,content});
 }catch(error){brApprovePending=false;$('brEditError').textContent=error.message;}
});
$('brRerun').addEventListener('click',()=>{if(baBusyTask||!activeId)return;send('rerunBusinessRequirement',{projectId:activeId});});
$('brGenerate').addEventListener('click',()=>{if($('brGenerate').disabled)return;if(discoveryDirty){status('Save the 12 questions before generating Business Requirements documents.',true);return;}baBusy('generate','Preparing Business Requirements generation…');send('generateBusinessRequirements');});
$('brGenerateAffected').addEventListener('click',()=>{if($('brGenerateAffected').disabled)return;baBusy('generate','Regenerating affected Business Requirements…');send('generateBusinessRequirements',{selective:true});});
$('brRegenerateProposal').addEventListener('click',()=>{
 if($('brRegenerateProposal').disabled||discoveryDirty)return;
 baBusy('generate','Regenerating source-backed BR drafts with your feedback…');
 send('generateBusinessRequirements',{regenerate:true,feedback:$('brRegenerationFeedback').value.slice(0,1500)});
});
$('brNextPreviewSave').addEventListener('click',()=>{
 if($('brNextPreviewSave').disabled||!brState||discoveryDirty||brEditorSaving||baBusyTask)return;
 const drafts=activeBusinessRequirements().filter(br=>br.status==='draft');
 if(!openBAWorkflowStep('save'))return;
 if(!drafts.length)return;
 const first=drafts.find(br=>!br.draftSavedAt)||drafts[0];
 requestAnimationFrame(()=>openBREditor(first.id));
});
$('baJiraRefreshStatus').addEventListener('click',()=>send('brJiraRefreshWorkStates'));
$('brJiraPreview').addEventListener('click',()=>{if($('brJiraPreview').disabled)return;baBusy('jiraPreview','Checking JIRA changes and conflicts…');send('brJiraPreview');});
$('baDownloadProcessLog').addEventListener('click',()=>{
 if(!activeId)return;
 const button=$('baDownloadProcessLog');button.disabled=true;
 $('baProcessLogStatus').textContent='Preparing troubleshooting log…';
 send('baDownloadProcessLog',{projectId:activeId});
});
$('baPreviousStep').addEventListener('click',()=>{
 if($('baPreviousStep').disabled)return;
 const key=$('baPreviousStep').dataset.previousStep;
 if(key)openBAWorkflowStep(key);
});
$('baNextStep').addEventListener('click',()=>{
 if($('baNextStep').disabled)return;
 if($('baNextStep').dataset.confirmReview==='true'){
  if(!$('baReviewFinish').disabled)$('baReviewFinish').click();
  return;
 }
 const key=$('baNextStep').dataset.nextStep;
 if(!key)return;
 // Generate -> Preview & Save also opens the first eligible draft editor.
 if($('baNextStep').dataset.stage==='generate'){
  if(!$('brNextPreviewSave').disabled)$('brNextPreviewSave').click();
  return;
 }
 openBAWorkflowStep(key);
});
$('brJiraApprove').addEventListener('click',()=>{if(brPlanRevision&&!$('brJiraApprove').disabled){baBusy('jiraApprove','Approving JIRA preview…');send('brJiraApprove',{revision:brPlanRevision});}});
$('brApproveRetirements').addEventListener('click',()=>{if(brPlanRevision&&!$('brApproveRetirements').disabled){baBusy('jiraRetire','Reviewing JIRA retirements…');send('brApproveRetirements',{revision:brPlanRevision});}});
$('brJiraSync').addEventListener('click',()=>{if(brPlanRevision&&brJiraPreviewApproved&&!$('brJiraSync').disabled){jiraPublicationPlan=jiraPlanForCR.map(item=>({...item}));jiraPublicationConfirmed.clear();jiraPublishState={phase:'preparing',confirmed:0,total:brJiraPlanChanges,message:'Checking approved Jira publication plan…',currentKey:'',error:''};renderJiraPublicationState();baBusy('jiraSync','Publishing approved JIRA changes…');send('brJiraSync',{revision:brPlanRevision});}});
$('brJiraResume').addEventListener('click',()=>{
 if(baBusyTask||!activeId)return;
 // The old approval is invalid after any successful Jira operation. A fresh read-only
 // preview must reconcile issue markers and recorded Jira keys before another publish.
 brPlanRevision=null;brJiraPreviewApproved=false;brJiraPlanChanges=0;brJiraPlanConflicts=0;
 baViewedStep='jiraPreview';jiraPublishState={...jiraPublishState,phase:'reconciling',message:'Checking Jira and local operation history. Review and reapprove any remaining changes.'};
 renderDiscoverySummary();baBusy('jiraPreview','Rechecking Jira identities and remaining changes…');send('brJiraPreview');
});
function renderFlow(){
  const root=$('flowTasks');if(!root)return;
  root.replaceChildren();
  if(!flowData){$('flowSummary').textContent='Open a project to view readiness.';return;}
  $('flowSummary').textContent=`${flowData.ready} ready to prepare · ${flowData.blocked} blocked · ${flowData.completed||0} approved`; 
  const rows=flowData.tasks.map(task=>({...task,state:task.completed?'Approved':task.progressStatus==='review'?'Review required':task.ready?'Ready':'Blocked',details:task.completed?'Approved document revision registered':task.ready?'Ready for AI draft (not automatically approved)':task.blockedBy||'Review required'}));
  ATGVDataTables.mount(root,rows,[{key:'name',label:'SDLC deliverable'},{key:'state',label:'Readiness'},{key:'details',label:'Next action'}],{label:'SDLC readiness and prerequisites',pageSize:5,sortKey:'name'});
}
function renderDiscoveryImportProposal(){
  const root=$('discoveryImportSuggestions');root.replaceChildren();
  const proposal=discoveryImportProposal;
  $('discoveryImportPanel').classList.toggle('hidden',!proposal);
  $('discoveryImportPreview').classList.toggle('hidden',!proposal);
  if(!proposal)return;
  const mapped=BA_QUESTIONS.filter(([key])=>proposal.answers[key]).length;
  $('discoveryImportHeading').textContent=`${mapped} proposed answers · ${proposal.filename}`;
  for(const [key,label] of BA_QUESTIONS){
    const answer=proposal.answers[key];if(!answer)continue;
    const existing=$('ba-'+key)?.value.trim()||'';
    const row=document.createElement('div');row.className='discovery-import-row';
    const check=document.createElement('input');check.type='checkbox';check.dataset.discoveryKey=key;check.checked=!existing;check.id='import-'+key;
    const labelElement=document.createElement('label');labelElement.htmlFor=check.id;labelElement.textContent=label+(existing?' · Existing answer — unchecked':'');
    const answerText=document.createElement('p');answerText.className='discovery-import-answer';answerText.textContent=answer;
    row.append(check,labelElement,answerText);root.append(row);
  }
  if(!mapped){const msg=document.createElement('p');msg.className='muted';msg.textContent='The model found no directly supported answers. You can enter answers manually.';root.append(msg);}
  renderBAButtons();
}
function renderSavedReviewEvidence(review,current){
 const root=$('baReviewEvidence');if(!root)return;
 root.replaceChildren();if(!review)return;
 const intro=brElement('p','ba-review-evidence-context',
  'AI output is advisory. Confirm that every discovery answer matches the uploaded source material before approving the requirements.');
 root.append(intro);
 const grid=brElement('div','ba-review-evidence-grid');
 const evidence=[
  ['Status',!current?'Outdated — rerun AI Review':review.skipped?'Skipped by human':review.confirmed?'Human confirmed':review.applied?'Suggestions applied; manual check recommended':'AI completed; manual check recommended'],
  ['AI assessment',String(review.readiness||'Not recorded')],
  ['Source documents',String((brState?.sourceDocuments||[]).length)+' uploaded'],
  ['Discovery answers',String(discoveryData?.readiness?.filled||0)+' / '+String(discoveryData?.readiness?.total||12)+' filled'],
  ['Review date',review.reviewedAt?formatDateTime(review.reviewedAt):'Not recorded (older review)'],
  ['Human confirmation',review.confirmedAt?formatDateTime(review.confirmedAt):'No explicit confirmation recorded'],
  ['AI model',String(review.modelLabel||'Not recorded')],
  ['Review findings',String((review.suggestions||[]).length)+' remaining; '+String((review.accepted||[]).length)+' applied']
 ];
 for(const [name,value] of evidence){const cell=brElement('div','ba-review-evidence-cell');cell.append(brElement('small','muted',name),brElement('strong','',value));grid.append(cell);}
 root.append(grid);
 const details=document.createElement('details');details.className='ba-review-answer-verification';
 const sum=document.createElement('summary');sum.textContent='Verify all 12 saved discovery answers against source documents';details.append(sum);
 const note=brElement('p','muted','These are the saved answers used for the current Business Requirements. A completed AI Review does not certify accuracy.');details.append(note);
 const entries=(discoveryData?.answers||brState?.discoveryAnswers||{});
 for(let i=0;i<BA_QUESTIONS.length;i++){
  const [key,title]=BA_QUESTIONS[i];const row=brElement('div','ba-review-answer-row');
  row.append(brElement('strong','',`${i+1}. ${title}`));
  const ans=brElement('p','',String(entries[key]||'Not answered'));row.append(ans);
  const flags=(review.suggestions||[]).filter(x=>x.key===key);
  if(flags.length)row.append(brElement('small','ba-review-answer-flag',flags.length+' AI finding(s) — see below'));
  details.append(row);
 }
 root.append(details);
}
function renderDiscoveryReview(){
 const reason=$('baReviewStopReason');reason.textContent=reviewStopReason;reason.classList.toggle('hidden',!reviewStopReason);
 const root=$('discoveryReviewSuggestions');root.replaceChildren();const review=discoveryReviewProposal;
 const current=baReviewCurrent(),locked=baReviewLocked();
 const issues=(review?.suggestions||[]).length;
 $('baReviewCount').textContent=current&&issues?`(${issues} issue${issues===1?'':'s'} found)`:'';
 $('baReviewBadge').classList.toggle('hidden',!current);
 $('baReviewBadge').textContent=!current?'Pending':review?.skipped?'Skipped':review?.applied?'Applied':brState?.reviewRiskAccepted?.revision===brState?.discoveryRevision?'AI proposal approved':discoveryHasReviewBlockers()?'Issues found':'Reviewed';
 $('discoveryReviewPanel').classList.toggle('ba-review-skipped',!!review?.skipped&&current);
 renderSavedReviewEvidence(review,current);
 if(!review){$('discoveryReviewSummary').textContent='No AI review yet.';renderBAButtons();return;}
 $('discoveryReviewSummary').textContent=`${review.readiness} · ${review.summary}${review.confirmed?' · Human confirmed':review.skipped?' · Skipped':review.applied?' · Suggestions applied':' · Human verification recommended'}`;
 // Preserve the 1–12 discovery order even when AI ranks severity differently.
 const questionIndex=key=>{const index=BA_QUESTIONS.findIndex(([id])=>id===key);return index<0?BA_QUESTIONS.length:index;};
 const sortedFindings=[...(review.suggestions||[])].sort((a,b)=>questionIndex(a.key)-questionIndex(b.key));
 for(const item of sortedFindings){
  const card=document.createElement('div');card.className='ai-review-item';
  const top=document.createElement('div');top.className='ai-review-item-head';
  const question=BA_QUESTIONS.find(([key])=>key===item.key);const label=document.createElement('strong');label.textContent=question?`${BA_QUESTIONS.indexOf(question)+1}. ${question[1]}`:item.key;
  const severity=document.createElement('span');severity.className='review-severity '+String(item.severity||'Medium').toLowerCase();severity.textContent=item.severity||'Medium';top.append(label,severity);card.append(top);
  const issue=document.createElement('p');issue.className='muted';issue.textContent=item.issue;card.append(issue);
  if(item.suggestedAnswer){
   const accept=document.createElement('label');accept.className='ai-review-accept';const check=document.createElement('input');check.type='checkbox';check.dataset.reviewKey=item.key;check.disabled=locked;check.addEventListener('change',renderBAButtons);
   const text=document.createElement('span');text.textContent='Apply suggested replacement answer';accept.append(check,text);card.append(accept);
   const suggested=document.createElement('div');suggested.className='ai-review-answer';suggested.textContent=item.suggestedAnswer;card.append(suggested);
  }else{const noChange=document.createElement('p');noChange.className='muted';noChange.textContent='Clarification required — no evidence-supported replacement is available. Re-run AI Review after updating the relevant discovery answer.';card.append(noChange);}
  if(item.resolutionGuidance){const guidance=document.createElement('p');guidance.className='ba-review-guidance';guidance.textContent='What to clarify: '+item.resolutionGuidance;card.append(guidance);}
  root.append(card);
 }
 if(!(review.suggestions||[]).length&&!review.skipped){root.append(brElement('p','ba-review-empty',review.applied?'Selected suggestions applied.':'No replacement suggested. You can proceed to Generate Business Requirements Documents.'));}
 else if(!review.skipped&&!(review.suggestions||[]).some(item=>item.suggestedAnswer)){const readiness=currentDiscoveryReadiness();root.append(brElement('p','ba-review-empty',readiness.filled!==readiness.total?'Return to Map & Save 12, complete the unanswered questions and save, then re-run AI Review.':'No evidence-supported replacements are available. Update and save the relevant answers and re-run AI Review, or acknowledge the findings after checking the evidence.'));}
 if(review.skipped)root.append(brElement('p','ba-review-empty','AI Review skipped. You can proceed to Generate Business Requirements Documents.'));
 renderBAButtons();
}
$('baReviewSkip').addEventListener('click',()=>{
 if($('baReviewSkip').disabled)return;
 baBusy('skipReview','Skipping AI Review and cancelling any active request…');send('skipDiscoveryReview');
});
$('discoveryReviewApply').addEventListener('click',()=>{
 if($('discoveryReviewApply').disabled||!discoveryReviewProposal)return;
 const keys=[...$('discoveryReviewSuggestions').querySelectorAll('input[data-review-key]:checked')].map(x=>x.dataset.reviewKey);
 if(!keys.length)return;
 reviewApplyRetry={revision:discoveryData.revision,keys};reviewApplyRetryAvailable=false;reviewApplyPhase='preparing';
 baBusy('applyReview','Checking selected AI suggestions before saving…');
 send('applyDiscoveryReview',reviewApplyRetry);
});
$('baReviewApplyStop').addEventListener('click',()=>{
 if(baBusyTask!=='applyReview'||reviewApplyPhase==='saving')return;
 baBusy('stopApplyReview','Stopping before discovery is changed…');send('stopApplyDiscoveryReview');
});
$('baReviewRetry').addEventListener('click',()=>{
 if(!reviewApplyRetry||baBusyTask||!discoveryData||reviewApplyRetry.revision!==discoveryData.revision){status('Discovery changed. Refresh and review the replacements before retrying.',true);return;}
 reviewApplyRetryAvailable=false;reviewApplyPhase='preparing';baBusy('applyReview','Retrying selected AI suggestions…');send('applyDiscoveryReview',reviewApplyRetry);
});
function renderMappingRecovery(){
 const running=discoveryImportBusy&&['preparing','preflight','repair','mapping','stopping','committing'].includes(mappingRunPhase);
 const canStop=running&&mappingRunPhase!=='committing'&&mappingRunPhase!=='stopping';
 const panel=$('baMappingRecovery'),actions=$('baMappingActions');
 actions.classList.toggle('hidden',!running);
 $('baStopMapping').classList.toggle('hidden',!running);
 $('baStopMapping').disabled=!canStop;
 $('baRetryMapping').classList.add('hidden');
 const retry=!!mappingRetryAvailable&&!running;
 $('baMappingRetry').textContent=mappingResumeAvailable?'Resume AI Mapping':'Retry Mapping';
 panel.classList.toggle('hidden',!retry||hasDedicatedPreflightRecovery());
 $('baMappingRetry').disabled=!retry||!brState||!sourceSelectedDigests.size||selectedRole!=='business-analyst'||!activeId;
 $('baMappingRecoveryMessage').textContent=mappingFailureMessage||'Mapping was stopped. No discovery changes were saved.';
}
function setDiscoveryImportBusy(busy,message){
 discoveryImportBusy=busy;if(busy)baBusy('import',message);else baBusy('',message);
 $('discoveryImportStatus').textContent=message;renderBAButtons();renderMappingRecovery();
}
function retryDiscoveryMapping(){
 if(discoveryImportBusy||baBusyTask||!brState||!sourceSelectedDigests.size||selectedRole!=='business-analyst')return;
 mappingRetryAvailable=false;mappingFailureMessage='';mappingFailurePhase='';mappingRunPhase='preparing';
 baPreflightInfo=null;renderSourcePreflight();
 discoveryImportProposal=null;discoveryImportQueue=[];renderDiscoveryImportProposal();
 dismissObsoleteBARestartNotice();
 setDiscoveryImportBusy(true,mappingResumeAvailable?'Resuming AI document preflight and source mapping…':'Retrying AI document preflight and source mapping…');
 send('processDiscoverySources',{digests:[...sourceSelectedDigests],revision:brState.revision});
}
$('baStopMapping').addEventListener('click',()=>{
 if(!discoveryImportBusy||!['preparing','preflight','repair','mapping'].includes(mappingRunPhase))return;
 mappingRunPhase='stopping';setDiscoveryImportBusy(true,'Stopping mapping…');send('stopDiscoverySourceMapping');
});
$('baMappingRetry').addEventListener('click',retryDiscoveryMapping);
$('baPreflightRetry').addEventListener('click',retryDiscoveryMapping);
$('baPreflightSkip').addEventListener('click',()=>{
 const button=$('baPreflightSkip');
 if(button.disabled||!brState||!sourceSelectedDigests.size||discoveryImportBusy)return;
 mappingRunPhase='preparing';mappingFailurePhase='';mappingRetryAvailable=false;
 setDiscoveryImportBusy(true,'Confirming source-only recovery…');
 send('skipDiscoveryPreflight',{projectId:activeId,digests:[...sourceSelectedDigests],revision:brState.revision});
});
$('baRetryMapping').addEventListener('click',retryDiscoveryMapping);
function triggerDiscoveryImport(){
 if(discoveryImportBusy||baBusyTask||selectedRole!=='business-analyst')return;
 if(!discoveryData){$('discoveryImportStatus').textContent='Open a project first.';return;}
 setDiscoveryImportBusy(true,'Choose one Word, PDF or Excel workbook…');send('importDiscovery',{roleId:selectedRole});
}
$('discoveryImport').addEventListener('click',triggerDiscoveryImport);
function requestSourceReupload(){if(discoveryImportBusy||baBusyTask||selectedRole!=='business-analyst'||!activeId)return;setDiscoveryImportBusy(true,'Select the original Word/PDF file to verify or update…');send('updateSourceDocuments');}
$('brReuploadOriginalSource').addEventListener('click',requestSourceReupload);
$('discoveryImportApply').addEventListener('click',()=>{
  if(!discoveryImportProposal)return;
  const selections=[...$('discoveryImportSuggestions').querySelectorAll('input[data-discovery-key]:checked')];
  for(const checkbox of selections){
    const key=checkbox.dataset.discoveryKey,area=$('ba-'+key);
    if(area){area.value=discoveryImportProposal.answers[key];area.dispatchEvent(new Event('input',{bubbles:true}));}
  }
  const count=selections.length;discoveryImportProposal=discoveryImportQueue.shift()||null;renderDiscoveryImportProposal();
  // Accepting a proposal with no checked replacements must still link the
  // existing answers to the new mapping revision, after explicit review.
  if(!discoveryImportProposal){discoveryDirty=true;$('baDiscoverySaveStatus').textContent='Mapped answers have unsaved changes · click Save 12 Questions';}
  $('discoveryImportStatus').textContent=discoveryImportProposal?`${count} mapped. Next: ${discoveryImportProposal.filename}`:`${count} mapped answer(s). Review and save 12 questions.`;renderDiscoverySummary();
});
$('discoverySave').addEventListener('click',()=>{
 if($('discoverySave').type!=='button'||$('discoverySave').disabled||discoveryDirty)return;
 openBAWorkflowStep('review');
});
$('discoveryForm').addEventListener('submit',e=>{
  e.preventDefault();if(!discoveryData||$('discoverySave').disabled)return;
  if(discoveryAutosaving||baBusyTask)return; // Reject duplicate manual clicks while a save is running.
  const answers=Object.fromEntries(BA_QUESTIONS.map(([key])=>[key,$('ba-'+key).value]));
  discoveryAutosaving=true;discoveryAutosaveSnapshot=answers;
  baBusy('saveDiscovery','Saving 12 discovery answers…');
  if(window.ATGVBusinessRequirements?.active())send('baSaveDiscoveryArtifact',{projectId:activeId,roleId:selectedRole,answers,revision:discoveryData.revision});
  else send('saveDiscovery',{answers,revision:discoveryData.revision,preserveReview:preserveReviewOnSave});
});
function requestDiscoveryReview(){
 if($('discoveryCopilot').disabled)return;
 if($('discoveryCopilot').dataset.action==='next-generate'){openBAWorkflowStep('generate');return;}
 if(baBusyTask==='review'){baBusy('stopReview','Stopping AI Review…');send('stopDiscoveryReview');return;}
 reviewStopReason='';renderDiscoveryReview();baBusy('review','Preparing AI Review…');send('copilotDiscovery',{feedback:$('baReviewFeedback').value.slice(0,1500)});
}
$('discoveryCopilot').addEventListener('click',requestDiscoveryReview);
window.addEventListener('message',event=>{
  const m=event.data;if(!m||typeof m!=='object')return;
  if(m.type==='brRoleTaskRepairPreview'){
    brRoleRepairBusy=false;brRoleRepairPreview=m.preview||null;
    renderBRs();status(`Jira task reconciliation ready: ${m.preview?.missing||0} missing, ${m.preview?.adopt||0} existing to link, ${m.preview?.conflicts||0} conflicts.`);return;
  }
  if(m.type==='brRoleTaskRepairDone'){
    brRoleRepairBusy=false;brRoleRepairPreview=null;
    if(m.register)brState=m.register;
    renderBRs();renderOverviewJira();status(`Jira role task repair confirmed: ${m.created||0} new tasks, ${m.linked||0} existing tasks linked.`,false,{persistent:true});return;
  }
  if(m.type==='brRoleTaskRepairCancelled'){
    brRoleRepairBusy=false;renderBRs();status('Jira task repair cancelled. No Jira changes were made.');return;
  }
  if(m.type==='brRoleTaskRepairError'){
    brRoleRepairBusy=false;renderBRs();status('Jira role task repair: '+String(m.message||'Failed').slice(0,900),true,{persistent:true});return;
  }
  if(m.type==='brRoleTaskRepairInterrupted'){
    brRoleRepairBusy=false;brRoleRepairPreview=null;
    renderBRs();status(`Jira repair interrupted after ${m.created||0} created, ${m.linked||0} linked: ${m.message||'Check Jira and regenerate preview'}`,true,{persistent:true});return;
  }
  if(m.type==='brDeletionProgress'&&m.projectId===activeId){
   if(m.target==='in-progress'&&m.phase==='running'){
    discoveryAutosaveSnapshot=null;discoveryAutosaving=false;discoveryDirty=false;brEditorDirty=false;mappingResumeAvailable=false;mappingRetryAvailable=false;
   }
   showBRDeletionProgress(m.phase,m.message,m.deleted,m.total);
   if(['completed','cancelled','failed'].includes(m.phase)){
    renderSourceDocuments();
   }
   return;
  }
  if(m.type==='remoteDeletionProgress'&&m.projectId===activeId){
   showBRDeletionProgress('running',`Delete Everywhere: ${m.deleted} of ${m.total} verified remote records processed.`,m.deleted,m.total);
   return;
  }
  if(m.type==='unifiedProposalPreview'){
   const node=[...document.querySelectorAll('[data-unified-preview-id]')].find(el=>el.dataset.unifiedPreviewId===m.proposalId);
   if(node){node.textContent='Baseline digest: '+m.baseDigest+'\n\n'+m.markdown;node.dataset.loaded='yes';node.classList.remove('hidden');}
   return;
  }
  if(m.type==='knowledgeSyncProgress'){$('knowledgeSyncStatus').textContent=m.message||'Syncing…';$('overviewKnowledgeStatus').textContent=m.message||'Syncing…';return;}
  if(m.type==='knowledgeSyncResult'){$('knowledgeSync').disabled=false;$('overviewKnowledgeSync').disabled=false;renderKnowledgeState(m.summary||{});$('knowledgeSyncStatus').textContent=m.message+(m.errors?.length?' · '+m.errors.map(e=>e.source+': '+e.message).join(' · '):'');$('overviewKnowledgeStatus').textContent=$('knowledgeSyncStatus').textContent;return;}
  if(m.type==='baOwners'){if(m.projectId===activeId){baOwnerState=m;renderBAOwner();renderBRs();}return;}
 if(m.type==='baAutoClaimResult'&&m.projectId===activeId){
  if(m.failed?.length)status('Some unassigned BR drafts could not be auto-assigned: '+m.failed.slice(0,3).join('; '),true);
  return;
 }
  if(m.type==='baReviewConfirmResult'){
    // Cancelled consent, failed Jira verification or a saved-answer mismatch
    // must not strand the entire BA interface in a permanent busy state.
    if(baBusyTask==='confirmReview')baBusy('',m.message||'AI Review confirmation ended.');
    if(!m.success)status(m.message||'AI Review was not confirmed; you can retry without deleting the document.',!m.cancelled);
    renderDiscoverySummary();
    return;
  }
 if(m.type==='brUpdated'){
    if(baBusyTask==='skipReview'){reviewApplyRetry=null;reviewApplyRetryAvailable=false;}
    if(baBusyTask==='generate')stageProgress('generate','Business Requirement documents generated.',100);
    if(baBusyTask==='skipReview')stageProgress('skipReview','AI Review skipped.',100);
    if(baBusyTask==='confirmReview')stageProgress('confirmReview','AI Review completed.',100);
    const task=baBusyTask;if(( /Document is being saved by another (user|process)/i.test($('baInlineStatus')?.textContent||'') )&&task){$('baInlineStatus').textContent='';$('baInlineStatus').classList.add('hidden');}if(!discoveryImportBusy)baBusyTask='';baFailedProcess='';baFailedMessage='';
    const previousSources=brState?.sourceDocuments?.length||0;
    brState=m.register;sourceRemoving=false;
    if(!baHasRecoverableBR(brState)){
      baResumeCardReady=false;
      if(previousSources>0)baViewedStep='start';
    }
    brPlanRevision=null;brJiraPreviewApproved=false;brJiraPlanChanges=0;brJiraPlanConflicts=0;jiraPlanForCR=[];jiraLinkCandidates=[];jiraPreflightBlocked=false;jiraProtectionForCR=[];
    closeJiraIssuePreview();for(const id of ['brJiraDetailsPanel','brJiraApprovalDetails']){$(id).classList.add('hidden');$(id).replaceChildren();}
    if(task==='jiraSync'||jiraPublishState.phase==='completed')renderJiraPublishedItems();
    $('brJiraChanges').classList.add('hidden');$('brJiraConflicts').classList.add('hidden');
    if(brState?.reviewText){try{discoveryReviewProposal=JSON.parse(brState.reviewText);}catch{discoveryReviewProposal=null;}}else discoveryReviewProposal=null;
    refreshAIChangeResolution();
    if(brEditing){
      const current=brState?.brs?.find(br=>br.id===brEditing);
      if(task==='saveBR'&&current?.status==='draft'){
        brEditorSaving=false;brEditorDirty=false;brReadOnly=false;rebuildBRQuill(current,false);
        $('brEditError').textContent='Draft saved.';
        if(brCloseAfterSave)closeBREditor(true);
      }else if(task==='approveBR'&&current?.status==='approved'){
        brEditorSaving=false;brEditorDirty=false;brReadOnly=true;rebuildBRQuill(current,true);
        $('brEditError').textContent='Business Requirement approved.';
      }else if(task==='approveBR'&&current?.status==='draft'){
        brEditorSaving=false;brEditorDirty=false;brReadOnly=false;rebuildBRQuill(current,false);
        $('brEditError').textContent='Draft saved. Final approval is still pending; review the reported blocker.';
      }else{brEditorSaving=false;if(!brEditorDirty)closeBREditor(true);}
    }
    brApprovePending=false;renderOverviewJira();renderDiscoveryReview();renderBRs();renderDocumentGroups();if(!discoveryImportBusy)baBusy('',null);if(brEditing)updateBREditorActions();
    if(task==='approveBR')baReopenDocuments=false;
    if(task==='skipReview'&&view==='discovery')requestAnimationFrame(()=>{if(!discoveryDirty&&baReviewFinalized())openBAWorkflowStep('generate');});
    if(task==='confirmReview'&&view==='discovery')requestAnimationFrame(()=>{if(!discoveryDirty&&baReviewFinalized())openBAWorkflowStep('generate');});
  }
  if(m.type==='brJiraLinkFixed'){
    baBusy('',null);
    status('Existing Jira '+m.key+' linked to '+m.path+'. No Jira issue was created or changed.');
  }
  if(m.type==='brJiraLinkFixFailed'){
    baBusy('',null);
    for(const button of document.querySelectorAll('.jira-link-repair-action')){button.disabled=false;button.textContent='Fix Jira Link';}
    status('Fix Jira Link failed for '+String(m.key||m.path||'Jira issue')+': '+String(m.message||'Verification failed.').slice(0,900),true,{persistent:true});
  }
  if(m.type==='brJiraPreflight'){
    baFailedProcess='';baFailedMessage='';
    stageProgress('jiraPreview','Jira Preflight found '+(m.conflicts||[]).length+' blocker(s).',100);
    baBusy('',null);
    jiraPreflightBlocked=true;
    brPlanRevision=m.revision;jiraPlanForCR=[];
    jiraPreviewIssueTypes=m.issueTypes||{};jiraPreviewProject=m.jiraProject||'';jiraPreviewFieldsByPath=m.fieldPlans||{};
    jiraLinkCandidates=Array.isArray(m.linkCandidates)?m.linkCandidates.filter(row=>row&&typeof row.path==='string'&&/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(String(row.key||''))):[];
    jiraProtectionForCR=m.protection||[];
    brJiraPreviewApproved=false;brJiraPlanChanges=(m.changes||[]).length;brJiraPlanConflicts=(m.conflicts||[]).length;
    jiraPublicationPlan=[];jiraPublicationConfirmed.clear();
    $('brJiraApprovalTable')?.replaceChildren();
    for(const id of ['brJiraDetailsPanel','brJiraApprovalDetails']){$(id)?.classList.add('hidden');$(id)?.replaceChildren();}
    const box=$('brJiraChanges');
    box.replaceChildren();box.classList.remove('hidden');
    const checkCount=Number(m.checkedCount)||brJiraPlanChanges;
    box.append(brElement('h3','','Jira Preflight · '+brJiraPlanConflicts+' issue(s) need attention'));
    box.append(brElement('p','muted',checkCount+' planned Jira items checked. Jira Preview has NOT been created. Resolve the blockers below, then regenerate Jira Preview.'));
    for(const candidate of jiraLinkCandidates){
      const entry=(m.changes||[]).find(item=>item.path===candidate.path);
      const row=brElement('div','jira-link-repair-row jira-preflight-recovery');
      row.append(brElement('span','',candidate.path+' · '+candidate.key+(entry?.title?' · '+entry.title:'')));
      row.append(jiraFixLinkButton(candidate.path,candidate.key));
      box.append(row);
    }
    for(const entry of m.changes||[]){
      const plan=jiraPreviewFieldsByPath[entry.path];
      if(!plan?.fields?.length||(!plan.blocking?.length&&!entry.staleJiraDetails))continue;
      const row=brElement('div','jira-link-repair-row');
      row.append(brElement('span','',entry.title+' · '+entry.path),jiraDetailsButton(entry));
      box.append(row);
    }
    const conflicts=$('brJiraConflicts');
    conflicts.replaceChildren();conflicts.classList.remove('hidden');
    for(const message of m.conflicts||[]){
      const row=brElement('div','jira-link-repair-row');
      row.append(brElement('p','',message));
      conflicts.append(row);
    }
    $('brApproveRetirements').classList.add('hidden');
    $('brApproveRetirements').disabled=true;
    $('brJiraApprove').disabled=true;$('brJiraSync').disabled=true;
    renderDiscoverySummary();renderChangeRequests();
    if(jiraProtectionForCR.some(row=>row.blocked))$('baCRPanel').open=true;
    status('Jira Preflight found '+brJiraPlanConflicts+' blocker(s) across '+checkCount+' planned Jira items. No preview or Jira issue write was performed.',true,{persistent:true});
    return;
  }
  if(m.type==='brJiraPlan'){baFailedProcess='';baFailedMessage='';jiraPreflightBlocked=false;
    stageProgress('jiraPreview','JIRA preview generated.',100);baBusy('',null);brPlanRevision=m.revision;jiraPlanForCR=m.changes||[];jiraLinkCandidates=Array.isArray(m.linkCandidates)?m.linkCandidates.filter(row=>row&&typeof row.path==='string'&&/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(String(row.key||''))):[];jiraPreviewIssueTypes=m.issueTypes||{};jiraPreviewProject=m.jiraProject||'';jiraPreviewFieldsByPath=m.fieldPlans||{};jiraProtectionForCR=m.protection||[];brJiraPreviewApproved=false;brJiraPlanChanges=(m.changes||[]).length;brJiraPlanConflicts=(m.conflicts||[]).length;
    jiraPublicationPlan=[];jiraPublicationConfirmed.clear();renderJiraApprovalTable();
    for(const id of ['brJiraDetailsPanel','brJiraApprovalDetails']){$(id).classList.add('hidden');$(id).replaceChildren();}
    const box=$('brJiraChanges');box.replaceChildren();box.classList.remove('hidden');
    const count=(m.changes||[]).length;
    box.append(brElement('h3','',count+' Jira changes'));
    ATGVDataTables.mount(box,(m.changes||[]).map(entry=>({action:String(entry.action||'').toUpperCase(),kind:entry.kind||'Issue',type:jiraPreviewIssueTypes[entry.path]||'Not verified',path:entry.path||'',title:entry.title||'',key:entry.key||'—',approval:entry.requiresApproval?'Approval required':'Standard',entry})),[
     {key:'action',label:'Action'},{key:'kind',label:'ATGV type'},{key:'type',label:'Jira type'},{key:'path',label:'BR path'},{key:'title',label:'Summary'},{key:'key',label:'Existing Jira key',render:row=>jiraKeyNode(row.key)},{key:'approval',label:'Approval'},
     {key:'details',label:'Details',sortable:false,render:row=>jiraDetailsActions(row.entry)}
    ],{label:'Jira change preview',pageSize:5,pinFirst:row=>!!jiraLinkCandidate(row.entry)});
    const conflicts=$('brJiraConflicts');conflicts.replaceChildren();conflicts.classList.toggle('hidden',!(m.conflicts||[]).length);
    for(const message of m.conflicts||[]){
      const row=brElement('div','jira-link-repair-row');
      row.append(brElement('p','',message));
      const found=/^([^:\s]+): issue ([A-Z][A-Z0-9_]{1,20}-\d{1,12}) exists without a recorded operation$/.exec(message);
      const item=found?(m.changes||[]).find(x=>x.path===found[1]&&x.action==='create'):null;
      if(item){
        if(jiraLinkCandidates.some(candidate=>candidate.path===found[1]&&candidate.key===found[2]))
          row.append(brElement('small','muted','Use Fix Jira Link in the Jira preview row above.'));
        else row.append(jiraFixLinkButton(found[1],found[2])); // Older host versions
      }
      conflicts.append(row);
    }
    const retire=(m.changes||[]).filter(x=>x.action==='retire'&&x.requiresApproval);
    $('brApproveRetirements').classList.toggle('hidden',!retire.length);$('brApproveRetirements').disabled=!retire.length;
    $('brJiraApprove').disabled=!count||(m.conflicts||[]).length>0;$('brJiraSync').disabled=true;renderDiscoverySummary();renderChangeRequests();if(jiraProtectionForCR.some(row=>row.blocked))$('baCRPanel').open=true;
  }
  if(m.type==='brJiraPublishProgress'){
    const previous=jiraPublishState;
    jiraPublishState={phase:m.phase||previous.phase,confirmed:Number.isFinite(m.confirmed)?m.confirmed:previous.confirmed,total:Number.isFinite(m.total)?m.total:previous.total,message:String(m.message||'').slice(0,1300),currentKey:m.currentKey||previous.currentKey,error:m.error||''};
    if(m.currentPath&&m.currentKey&&Number(m.confirmed)>Number(previous.confirmed))jiraPublicationConfirmed.set(m.currentPath,{key:m.currentKey,action:m.currentAction});
    renderJiraPublicationState();
  }
  if(m.type==='brJiraPlanApproved'){baFailedProcess='';stageProgress('jiraApprove','JIRA preview approved.',100);brJiraPreviewApproved=true;baBusy('',null);status(`${m.count} Jira preview change${m.count===1?'':'s'} approved for publishing.`);renderDiscoverySummary();}
  if(m.type==='brRetirementsApproved'){brPlanRevision=null;brJiraPreviewApproved=false;brJiraPlanChanges=0;brJiraPlanConflicts=0;$('brJiraChanges').classList.add('hidden');$('brJiraConflicts').classList.add('hidden');baBusy('',null);stageProgress('jiraRetire','Jira retirement review complete (100%). Preview regeneration is ready.',100);status('Jira retirements approved. Regenerate the preview.',false,{persistent:true});return;}
  if(m.type==='brRevisionCreated'&&m.brId){openBREditor(m.brId);}
 if(m.type==='baProcessLogResult'&&m.projectId===activeId){
   $('baDownloadProcessLog').disabled=false;
   $('baProcessLogStatus').textContent=m.error?'Log unavailable: '+m.error:m.cancelled?'Log download cancelled.':m.saved?'Troubleshooting log saved: '+m.filename:'Log export finished.';
 }
 if(m.type==='brJiraDone'){stageProgress('jiraSync',`${m.count} JIRA changes published.`,100);baBusy('',null);jiraPublishState={...jiraPublishState,phase:'completed',confirmed:m.count,total:m.count,message:`Successfully published and recorded ${m.count} Jira changes.`};baViewedStep='publish';baPreviousStage='complete';renderPublishedJira();renderJiraPublishedItems();brPlanRevision=null;brJiraPlanChanges=0;brJiraPreviewApproved=false;$('brJiraApprove').disabled=true;$('brJiraSync').disabled=true;$('brJiraChanges').classList.add('hidden');renderDiscoverySummary();}
  if(m.type==='discoveryRestarted'){baPreflightInfo=null;mappingFailurePhase='';baResumeCardReady=false;mappingResumeAvailable=false;jiraPublicationPlan=[];jiraPublicationConfirmed.clear();baLastActiveStep='';mappingRunPhase='';mappingRetryAvailable=false;mappingFailureMessage='';baViewedStep=null;baPreviousStage='';baFailedProcess='';
    baReopenQuestions=false;baReopenDocuments=false;discoveryData=m.discovery;discoveryDirty=false;discoveryReviewProposal=null;discoveryImportProposal=null;discoveryImportQueue=[];restoredMappingEpoch=null;preserveReviewOnSave=false;
    sourceSelectedDigests=new Set(m.digests||[]);brPlanRevision=null;brJiraPreviewApproved=false;brEditing=null;baShowChangeProposal=false;
    reviewApplyRetry=null;reviewApplyRetryAvailable=false;reviewStageState=null;reviewStopReason='';
    if(typeof closeBREditor==='function')closeBREditor();
    renderDiscovery();renderDiscoveryReview();
    status(m.freshStart?'New Business Requirements cycle ready. Upload source documents to begin.':`New Business Requirements cycle ready. ${m.archivedCount||0} earlier source document(s) moved to history. Approved Business Requirements and Jira links are preserved.`);
    {navigate('discovery');requestAnimationFrame(()=>document.querySelector('.source-documents-panel')?.scrollIntoView({block:'nearest',behavior:'smooth'}));}
  }
  if(m.type==='confluenceSourceVault'){
    if(m.error)status('Confluence source sync pending: '+String(m.error).slice(0,300),true,{persistent:true});
    else if(m.result?.conflicts?.length)status('Confluence source sync needs review: '+m.result.conflicts.slice(0,3).join('; '),true,{persistent:true});
    else if(m.result?.restored||m.result?.downloaded||m.result?.uploaded){
      status('Confluence: '+(m.result.downloaded||0)+' document(s) downloaded, '+(m.result.uploaded||0)+' upload(s) synced'+(m.result.restored?'; project BR state restored':'')+'.');
      if(m.result.restored){sourceSelectedDigests=new Set();mappingResumeAvailable=false;baPreflightInfo=null;renderDiscoverySummary();}
    }
  }
  if(m.type==='discoverySourceRevised'){baPreflightInfo=null;mappingResumeAvailable=false;mappingFailurePhase='';sourceSelectedDigests=new Set(m.digests||[]);baReopenQuestions=false;baReopenDocuments=false;renderDiscoverySummary();status(m.count+' new or revised source(s) saved. Existing approved requirements and Jira keys preserved. Re-map documents, review changes, and approve before updating Jira.');}
  if(m.type==='discoveryUploadDone'){
    mappingResumeAvailable=false;
    if(m.autoPreflight)sourceSelectedDigests=new Set((brState?.sourceDocuments||[]).map(item=>item.digest));
    if((m.count||0)>0||(m.revised||0)>0||(m.reverified||0)>0){baPreflightInfo=m.autoPreflight?{phase:'preflight',summary:'Uploaded. Starting automatic AI document preflight, safe corrections and TDD testability checks…',applied:[],issues:[]}:null;} 
    if((m.count||0)>0||(m.revised||0)>0||(m.reverified||0)>0){
      baViewedStep='upload';
      baResumeCardReady=false;
    }
    dismissObsoleteBARestartNotice();mappingRunPhase=m.autoPreflight?'preflight':'';mappingRetryAvailable=false;mappingFailureMessage='';mappingFailurePhase='';baReopenQuestions=false;baReopenDocuments=false;discoveryImportProposal=null;discoveryImportQueue=[];restoredMappingEpoch=null;renderDiscoveryImportProposal();setDiscoveryImportBusy(!!m.autoPreflight,m.autoPreflight?'Automatically checking the document and preparing 12 discovery questions…':m.reverified&&!m.count?`${m.reverified} legacy source file(s) verified. Discovery answers, BRs and Jira are unchanged. Retry Generate Requirements.`:m.revised?`${m.revised} source document revision(s) saved. Select documents and submit to refresh the 12 questions; Jira unchanged.`:`${m.count} document(s) uploaded${m.reverified?' and '+m.reverified+' legacy source(s) verified':''}. Select documents and click Submit Selected Documents to map 12 questions.`);renderSourceDocuments();renderDiscoverySummary();renderBAButtons();
    if(view==='discovery'&&((m.count||0)>0||(m.revised||0)>0||(m.reverified||0)>0))
      requestAnimationFrame(()=>document.querySelector('#discoveryView .source-documents-panel:not(.hidden)')?.scrollIntoView({block:'start',behavior:'smooth'}));
  }
  if(m.type==='discoverySaved'){const editedDuringSave=!!discoveryAutosaveSnapshot&&BA_QUESTIONS.some(([key])=>($('ba-'+key)?.value||'')!==discoveryAutosaveSnapshot[key]);const edits=editedDuringSave?Object.fromEntries(BA_QUESTIONS.map(([key])=>[key,$('ba-'+key).value])):null;discoveryAutosaving=false;discoveryAutosaveSnapshot=null;baReopenQuestions=false;baReopenDocuments=false;if(baBusyTask==='saveDiscovery')baBusyTask='';discoveryData=m.discovery;discoveryDirty=false;preserveReviewOnSave=false;renderDiscovery();if(edits){for(const [key,value] of Object.entries(edits))if($('ba-'+key))$('ba-'+key).value=value;discoveryDirty=true;}else if(m.linkPending){discoveryDirty=true;$('discoverySave').disabled=false;}status(m.linkPending?'Answers saved to disk, but BR workflow linking failed. Click Save 12 Questions to retry manually.':'Discovery answers saved locally.');$('baDiscoverySaveStatus').textContent=m.linkPending?'Save partially completed · Retry manually':discoveryDirty?'Edits made during save · Save again manually':'Saved';renderDiscoverySummary();}
  if(m.type==='discoveryImportProgress'){
   if(m.phase)mappingRunPhase=m.phase;
   if(['mapping','preparing','preflight','repair'].includes(m.phase))dismissObsoleteBARestartNotice();
   if(['preflight','repair'].includes(m.phase)){baPreflightInfo={...(baPreflightInfo||{}),phase:m.phase,summary:m.message||'Checking document…'};renderSourcePreflight();}
   setDiscoveryImportBusy(true,m.message||'Processing…');
  }
  if(m.type==='discoveryMappingCheckpoint'&&m.projectId===activeId){
   mappingResumeAvailable=m.resumeAvailable===true;
   if(m.message)status(m.message,true);
  }
  if(m.type==='discoverySourcePreflight'){
   baPreflightInfo={phase:m.phase||'checking',sourceName:m.sourceName,sourceDigest:m.digest,section:m.section,totalSections:m.totalSections,summary:m.summary||'',applied:m.applied||[],issues:m.issues||[],resolutions:m.resolutions||[],reportAvailable:true};renderSourcePreflight();
  }
  if(m.type==='discoveryPreflightSkipCancelled'){
   mappingRunPhase='';mappingRetryAvailable=true;mappingFailurePhase='preflight';
   setDiscoveryImportBusy(false,'Source-only recovery cancelled. Retry AI or continue with source-only recovery.');
   renderSourcePreflight();
  }
  if(m.type==='discoveryImportCancelled'){
   mappingRunPhase='';mappingRetryAvailable=!!m.mapping;mappingFailurePhase='';
   mappingFailureMessage=m.mapping?(m.message||'Mapping stopped. No answers were saved.') : '';
   if(m.mapping)baPreflightInfo={...(baPreflightInfo||{}),phase:'blocked',summary:m.message||'Automatic document preflight stopped. Retry available.'};
   setDiscoveryImportBusy(false,m.message||'Upload cancelled. No answers changed.');renderSourcePreflight();renderDiscoverySummary();
  }
  if(m.type==='discoveryImportDone'){
   dismissObsoleteBARestartNotice();mappingRunPhase='';mappingRetryAvailable=false;mappingResumeAvailable=false;mappingFailureMessage='';mappingFailurePhase='';
   if(m.preflightCount)baPreflightInfo={...(baPreflightInfo||{}),phase:'ready'};
   setDiscoveryImportBusy(false,`${m.count} document(s) preflight checked and mapped. Review the 12 answers.`);renderSourceDocuments();renderDiscoverySummary();
   if(m.automatic&&view==='discovery')requestAnimationFrame(()=>{if(!baBusyTask&&!discoveryImportBusy)openBAWorkflowStep('mapping');});
  }
  if(m.type==='discoveryImportFailed'){
   const failedPhase=m.phase||mappingRunPhase;
   const isMapping=['preparing','preflight','repair','mapping','committing','stopping'].includes(failedPhase);
   const isPreflight=['preflight','repair'].includes(failedPhase);
   mappingRunPhase='';mappingRetryAvailable=isMapping;mappingFailurePhase=isPreflight?'preflight':'';
   mappingFailureMessage=m.message||'Unknown mapping error. Check AI Providers in Settings.';
   discoveryImportProposal=null;discoveryImportQueue=[];renderDiscoveryImportProposal();
   if(isPreflight){
    const previous=baPreflightInfo||{};
    const hasDetailedFindings=(previous.issues||[]).length>0||(previous.resolutions||[]).length>0;
    baPreflightInfo={...previous,phase:'blocked',summary:hasDetailedFindings&&previous.summary?previous.summary:mappingFailureMessage};
   }
   // Preflight owns its full error and Retry Mapping action. Do not repeat the
   // same message in the mapping recovery banner or a generic status notice.
   setDiscoveryImportBusy(false,isPreflight?'Document preflight needs attention. See the findings below.':(isMapping?'Document mapping needs attention: ':'Source upload failed: ')+mappingFailureMessage);
   renderSourcePreflight();renderDiscoverySummary();
  }
  if(m.type==='discoveryPreflightDownloadResult'&&m.projectId===activeId){
   renderSourcePreflight();
   if(m.error)status('Pre-flight report download failed: '+m.error,true);
   else if(m.saved)status('AI document pre-flight report saved as '+(m.filename||'a text file')+'.');
  }
  if(m.type==='discoveryWorkingBRDownloadResult'&&m.projectId===activeId){
   renderSourcePreflight();
   if(m.error)status('Working BR download failed: '+m.error,true);
   else if(m.saved)status('AI-updated working BR saved as '+(m.filename||'a Markdown document')+'.');
  }
  if(m.type==='discoverySourceRemoveCancelled'){sourceRemoving=false;renderSourceDocuments();}
  if(m.type==='discoverySourceRemoved'){sourceRemoving=false;discoveryImportQueue=[];discoveryImportProposal=null;renderDiscoveryImportProposal();status(`${m.filename} ${m.action==='archived'?'archived':'deleted as unused upload'}. Approved BRs and Jira unchanged.${m.storedCleanupWarning?' Stored upload cleanup failed: '+m.storedCleanupWarning:''}`);}
  if(m.type==='discoveryUploadedSourceDeleted'){baPreflightInfo=null;sourceRemoving=false;sourceSelectedDigests.clear();discoveryImportQueue=[];discoveryImportProposal=null;renderDiscoveryImportProposal();status(`${m.filename} and ${(m.deletedBrIds||[]).length} linked BR(s) deleted from ATGV. Remote Jira/Confluence unchanged.${m.storedCleanupWarning?' Stored copy cleanup failed: '+m.storedCleanupWarning:''}${m.brExportCleanupWarning?' BR file cleanup failed: '+m.brExportCleanupWarning:''}`,!!(m.storedCleanupWarning||m.brExportCleanupWarning));}
  if(m.type==='discoveryArchivedSourceForceDeleted'){sourceRemoving=false;status(`${m.filename} and ${(m.deletedBrIds||[]).length} linked BR(s) removed from ATGV. Remote Jira/Confluence unchanged.${m.storedCleanupWarning?' Stored copy cleanup failed: '+m.storedCleanupWarning:''}${m.brExportCleanupWarning?' BR file cleanup failed: '+m.brExportCleanupWarning:''}`,!!(m.storedCleanupWarning||m.brExportCleanupWarning));}
  if(m.type==='discoverySourceRestored'){sourceRemoving=false;discoveryImportProposal=null;discoveryImportQueue=[];renderDiscoveryImportProposal();status(`${m.filename} restored. Select for mapping when ready; BRs and Jira unchanged.`);}
  if(m.type==='discoveryImportResult'){
    $('discoveryImportStatus').textContent=`Mapped ${m.position||1}/${m.total||1}: ${m.filename}. Review each proposed answer set.`;
    discoveryReviewProposal=null;preserveReviewOnSave=false;renderDiscoveryReview();const proposal={filename:m.filename,answers:m.answers||{}};if(discoveryImportProposal)discoveryImportQueue.push(proposal);else discoveryImportProposal=proposal;renderDiscoveryImportProposal();renderDiscoverySummary();
  }

  if(m.type==='baReviewApplyPhase'){
   reviewApplyPhase=m.phase||'';
   baBusy(m.phase==='stopping'?'stopApplyReview':'applyReview',m.message||'Applying AI suggestions…');
   return;
  }
  if(m.type==='baReviewApplyStopped'||m.type==='baReviewApplyFailed'){
   reviewApplyPhase='';reviewApplyRetryAvailable=!!reviewApplyRetry;baBusy('',null);
   stageProgress('applyReview',m.type==='baReviewApplyStopped'?'Stopped before saving. Retry or Skip AI Review.':'Apply failed: '+(m.message||'Retry or Skip AI Review.'),m.type==='baReviewApplyStopped'?100:0);
   renderDiscoveryReview();return;
  }
  if(m.type==='baReviewApplyCompleted'){
   reviewApplyRetry=null;reviewApplyRetryAvailable=false;reviewApplyPhase='';baBusy('',null);
   stageProgress('applyReview',`${m.count||0} selected replacement(s) saved.`,100);renderDiscoveryReview();return;
  }
  if(m.type==='baProgress'){if(m.task&&m.task!=='upload')dismissObsoleteBARestartNotice();if(m.done){brApprovePending=false;baBusy('',null);}else baBusy(m.task||baBusyTask,m.message||'Processing…',m.percent);}
  if(m.type==='discoveryReviewStopped'){
   if(!['review','stopReview'].includes(baBusyTask))return;
   const failed=m.outcome==='failed',reason=String(m.reason||'The review ended before results were saved.').slice(0,1000);
   reviewStopReason=(failed?'AI Review failed: ':'AI Review stopped: ')+reason+' Select Re-run AI Review to retry. No new AI Review results were saved.';
   stageProgress('review',reviewStopReason,failed?0:100);baBusy('',null);renderDiscoveryReview();return;
  }
  if(m.type==='discoveryReviewResult'){reviewStopReason='';dismissObsoleteBARestartNotice();reviewApplyRetryAvailable=false;reviewApplyRetry=null;stageProgress('review','AI Review completed.',100);discoveryReviewProposal=m.review||null;renderDiscoveryReview();status('AI Review completed. Apply accepted suggestions or continue to Business Requirements generation.');}
  if(m.type==='jiraTemplateSuggestion'&&window.atgvPendingJiraDetails?.path===m.path){
  const state=window.atgvPendingJiraDetails;const v=m.value||{};
  if(!state.acceptance.value&&v.acceptanceCriteria)state.acceptance.value=v.acceptanceCriteria;
  if(!state.done.value&&v.definitionOfDone)state.done.value=v.definitionOfDone;
  const note=document.querySelector('.jira-template-suggestion-status');if(note)note.textContent='AC: '+(v.acOrigin||'unavailable')+' · DoD: '+(v.dodOrigin||'unavailable')+'. Review and click Save Jira details to confirm. Existing text was preserved.';
 }
 if(m.type==='jiraTemplateState'){const box=$('jiraTemplateStatus');if(box)box.textContent=msgTemplateText(m.value);}
 if(m.type==='ragResult'){
  const entries=(m.docs||[]).map((d,i)=>`[${i+1}] ${d.title} · ${d.provider}\n${d.text}\n${d.url||''}`).join('\n\n');
  $('ragAnswer').textContent=(m.answer||'')+'\n\n'+entries;
  $('overviewRagResult').classList.remove('hidden');$('overviewRagAnswer').textContent=m.answer||'No matching indexed evidence.';
  const sources=$('overviewRagSources');sources.replaceChildren();
  for(const [index,doc] of (m.docs||[]).entries()){
   const row=document.createElement('div');row.className='overview-rag-source';
   const title=document.createElement('strong');title.textContent=`[${index+1}] ${doc.title||'Untitled source'} · ${doc.provider||'Local'}`;row.append(title);
   const note=document.createElement('p');note.textContent=String(doc.text||'').slice(0,550);row.append(note);
   if(/^https:\/\/[^\s]+$/i.test(doc.url||'')){const link=document.createElement('a');link.href=doc.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open source';row.append(link);}
   sources.append(row);
  }
  $('overviewKnowledgeStatus').textContent=`${(m.docs||[]).length} indexed source(s) found for “${m.query||''}”.`;
 }
  if(m.type==='copilotSuggestion'){$('discoverySuggestion').textContent=m.text||'No suggestions returned.';}
  if(m.type==='rolesSaved'){roleSettingsDirty=false;updateExtensionSettingBadges();$('roleSettingsStatus').textContent='Saved';send('refresh');}
  if(m.type==='roleConfigSaved'){$('saveCustomRole').disabled=false;$('deleteCustomRole').disabled=false;$('customRoleEditor').classList.add('hidden');editingCustomRole=null;roleSettingsDirty=false;send('refresh');}
  if(m.type==='roleStepScopeLoaded'&&m.scopeId===selectedRoleStepScope){roleStepScopedData=m.roleSteps;selectedRoleStep='';renderRoleWork();}
  if(m.type==='roleHandoffOwners'&&m.projectId===activeId){handoffOwnerBusy=null;handoffOwnership=m;renderRoleWork();}
  if(m.type==='roleHandoffChanged'&&m.projectId===activeId){handoffOwnerBusy=null;const idx=handoffOwnership.documents.findIndex(d=>d.documentId===m.documentId);const record={documentId:m.documentId,...m.value};if(idx<0)handoffOwnership.documents.push(record);else handoffOwnership.documents[idx]=record;renderRoleWork();}
  if(m.type==='roleTimelineSaved'){
    roleTimelineDirty=false;timelineData=m.timeline;$('roleTimelineStatus').textContent='Timeline saved';
    closeTimelineModal(true);$('roleTimelineStatus').textContent='Timeline saved';
    renderRoleTimeline();if(view==='landing'&&$('overviewGanttDetails').open)renderGantt(timelineData);
  }
  if(m.type==='bulkTimelineSaved'){
    bulkTimelineDirty=false;bulkTimelineSaving=false;timelineData=m.timeline;
    closeBulkTimelineModal(true);renderRoleTimeline();if(view==='landing'&&$('overviewGanttDetails').open)renderGantt(timelineData);
    $('roleTimelineStatus').textContent='All role timelines saved.';
  }
  if(m.type==='planningLoaded'){if(!roleTimelineDirty&&!bulkTimelineDirty&&!bulkTimelineSaving)timelineData=m.timeline;if(selectedRole==='project-manager'&&view==='work')renderPMDashboard();if(view==='landing'&&$('overviewGanttDetails').open)renderGantt(timelineData);renderRoleTimeline();}
  if(m.type==='roleMembership'){usedRoleIds=new Set(m.roles||[]);renderSidebarRole();}
  if(m.type==='designOpenInline'){openDesignPreview(String(m.kind||''),String(m.proposalId||''));return;}
  if(m.type==='blueprintState'){blueprintRegistry=m.register||null;blueprintAssessment=m.assessment||null;renderBlueprint();}
  if(m.type==='blueprintProgress'){$('blueprintProgress').textContent=m.message||'';if(m.error||m.done===m.total){blueprintBusy=false;designBatchPending=false;}renderBlueprint();}
  if(m.type==='blueprintCancelled'){blueprintBusy=false;designBatchPending=false;$('blueprintProgress').textContent='Blueprint generation cancelled.';renderBlueprint();}
  if(m.type==='designState'){const completedKind=m.kind||designBusyKind;if(!designBatchPending)designBusy=false;designDirty=false;designEditMode=null;designState=m.value;approvedDesignHash=m.approvedHash||approvedDesignHash;$('designSaveDraft').disabled=true;syncDesignProcessFromState(completedKind);designBusyKind='';$('designStatus').textContent=m.action==='approved'?'Design approved.':m.action==='generated'?'Design draft generated for review.':'Design draft saved for review.';renderDesignCards();if(designSelected)openDesignPreview(designSelected.kind,designSelected.id);}
  if(m.type==='designBatchDone'){blueprintBusy=false;renderBlueprint();designBatchPending=false;designBusy=false;designBusyKind='';$('designStatus').textContent=(m.count||0)+' affected design drafts generated for review.';renderDesignCards();}
  if(m.type==='designDeleted'){
    designBusy=false;designDirty=false;designEditMode=null;
    designState=m.value;
    if(designSelected?.id===m.proposalId){designSelected=null;$('designPreview').classList.add('hidden');$('planningView').classList.remove('design-preview-open');}
    $('designStatus').textContent='Design revision and its unmodified exported artifacts deleted.';renderDesignCards();
  }
  if(m.type==='designBrowserOpened'){$('designStatus').textContent='Design preview opened in the external browser.';}
  if(m.type==='designActionError'){designBatchPending=false;if(designBusyKind){const current=designProcessState[designBusyKind];setDesignProcess(designBusyKind,current?.percent||0,m.message||'Design action failed.','error');}designBusy=false;designBusyKind='';renderDesignCards();$('designStatus').textContent='';}
  if(m.type==='designProgress'){designBusyKind=m.kind||designBusyKind;setDesignProcess(m.kind,m.percent??50,m.message||'Generating design…','running');$('designStatus').textContent='';renderDesignCards();}
  if(m.type==='designCancelled'){if(designBusyKind){const last=designState?.designs?.[designBusyKind]?.at(-1);clearDesignProcess(designBusyKind);if(last)syncDesignProcessFromState(designBusyKind);}designBusy=false;designBusyKind='';renderDesignCards();$('designStatus').textContent='Design operation cancelled.';}
  if(m.type==='designExported'){
    const result=$('designExportResult');result.replaceChildren();const files=document.createElement('p');files.textContent='Exported: '+(m.files||[]).join(', ');const action=document.createElement('button');action.type='button';action.className='secondary';action.textContent='Open Artifacts Folder';action.addEventListener('click',()=>send('designOpenArtifacts',{kind:m.kind,proposalId:m.proposalId}));result.append(files,action);$('designStatus').textContent='Approved artifacts exported to project documents/designs/artifacts.';
    if(designSelected?.id===m.proposalId){const item=designCurrentItem();if(item)designReviewControls(item,false);}
  }
  if(m.type==='aiSendConsentCancelled'&&topNoticeCurrent?.consentRequestId===m.requestId){topNoticeCurrent.consentRequestId=null;closeTopNotification();}
  if(m.type==='hostDialogRequest'){hostModalQueue.push(m);hostDialogNext();return;}
  if(m.type==='aiSendConsent'){
    pendingAiConsentId=m.requestId;
    const item={message:m.message,error:false,success:false,consentRequestId:m.requestId,route:{label:'Send to AI',action:()=>send('aiSendConsentResponse',{requestId:m.requestId,accepted:true})}};
    if(topNoticeCurrent){topNoticeQueue.unshift(topNoticeCurrent);topNoticeCurrent=null;}
    showTopNotification(item);
  }
  if(m.type==='diagramSaveError'){diagramSaving=false;$('diagramSave').disabled=!diagramDirty;diagramStatus('Save failed: '+m.message+' Reopen the diagram if it changed on disk.');}
  if(m.type==='diagramSaved'&&activeDiagram){
    activeDiagram.revision=m.revision;diagramSaving=false;diagramDirty=false;$('diagramSave').disabled=true;diagramStatus('Diagram saved to project .drawio XML.');
  }
  if(m.type==='diagramLoaded'){
    $('generatedDesignsSection').classList.remove('hidden');
    $('diagramEditorPanel').classList.remove('hidden');
    activeDiagram=m.diagram;diagramCanvas=null;diagramDirty=false;diagramSaving=false;$('diagramSave').disabled=true;
    $('diagramWorkbench').classList.add('hidden');$('diagramCanvas').replaceChildren();
    if(!activeDiagram?.editable){pendingArchitectureImport=null;diagramStatus('Read-only: '+(activeDiagram?.error||'unsupported format')+' Use Open diagram XML source or a full diagrams.net editor.');return;}
    if(typeof window.AtgvDiagramCanvas!=='function'){diagramStatus('Local SVG editor assets are unavailable. Open XML source instead.');return;}
    if(pendingArchitectureImport){
      const draft=pendingArchitectureImport;pendingArchitectureImport=null;
      editDiagram(draft);diagramChanged();diagramStatus('Architecture proposal loaded as an unsaved diagram. Review and click Save Diagram to replace the current project diagram.');
      $('designPreview').classList.add('hidden');$('diagramWorkbench').scrollIntoView({block:'nearest'});
    }else editDiagram(activeDiagram.model);
  }
  if(m.type==='documentOwnershipError'&&activeDoc){
    documentOwner=null;documentOwnerScope='';
    $('docOwnerStatus').textContent='Ownership unavailable · '+(m.message||'Retry');
    $('docAssign').textContent='Retry ownership';$('docAssign').disabled=false;
  }
  if(m.type==='documentOwnership'){
    if(!activeDoc||m.documentId!==activeDoc.roleId+'--'+activeDoc.taskId)return;
    documentOwner=m.owner;documentOwnerScope=m.scope;documentOwnerMe=m.me;documentOwnerCached=!!m.cached;updateDocumentOwnership();
  }
  if(m.type==='documentLoaded'){
    deliveryBusy=false;docBackTo=view==='documents'?'documents':'work';selectedRole=m.document.roleId;
    renderSidebarRole();openQuillDocument(m.document);
  }
  if(m.type==='documentSaved'&&activeDoc&&activeDoc.roleId===m.roleId&&activeDoc.taskId===m.taskId){
    activeDoc.revision=m.revision;activeDoc.markdown=m.markdown;docDirty=false;docSaving=false;
    $('docSave').disabled=true;$('docEditorStatus').textContent='Saved · '+new Date().toLocaleTimeString();
  }
  if(m.type==='startupScan')renderWorkspaceSearch(m);
  if(m.type==='openingStart'){gateError='';gateOfflineAvailable=false;spaces=[];jiraProjects=[];gateSearchId=null;settingsSearchId=null;gateSearched=false;$('gateSearchMessage').textContent='';showGate();status('');}
  if(m.type==='openingProgress'){gateOpeningPercent(m.percent,m.message);$('gateProgress').classList.toggle('hidden',m.stage==='done');}
  if(m.type==='openingError'){gateBusy=false;gateError=m.message||'Could not open project.';gateOfflineAvailable=!!m.canOffline;gateOpeningPercent(0,'Project opening failed: '+gateError);renderGate();}
  if(m.type==='navigationRefreshState'&&m.projectId===activeId&&m.requestId===navigationRefreshRequestId){
    if(m.mapping?.running){
      mappingRunPhase=String(m.mapping.phase||'preparing');
      if(!discoveryImportBusy)setDiscoveryImportBusy(true,'Background AI document mapping is continuing. You can return to other screens while it works.');
    }
    // A completed job is handled by its own completion event and not restarted
    // merely because an older menu-refresh response arrives.
    if(view==='discovery')renderDiscoverySummary();
    if(view==='work'&&selectedRole==='project-manager')renderPMDashboard();
  }
  if(m.type==='state')updateState(m);
  if(m.type==='notice'){
    if(m.error&&view==='discovery'&&baBusyTask==='saveDiscovery'){discoveryAutosaving=false;discoveryAutosaveSnapshot=null;}
    if(view==='discovery'&&!m.error&&$('baInlineStatus')){
      const node=$('baInlineStatus');node.textContent=String(m.message||'').slice(0,1200);
      node.setAttribute('role',m.error?'alert':'status');
      node.setAttribute('aria-live',m.error?'assertive':'polite');
      node.classList.toggle('hidden',!node.textContent);
      node.dataset.status=m.error?'error':atgvSeverity(m.message)==='warning'?'warning':atgvSeverity(m.message)==='success'?'success':'info';
    }
    if(m.error&&['applyReview','stopApplyReview'].includes(baBusyTask)){reviewApplyPhase='';reviewApplyRetryAvailable=!!reviewApplyRetry;baBusy('',null);stageProgress('applyReview',m.message||'Apply failed. Retry or skip AI Review.',0);renderDiscoveryReview();}
    if(m.error&&view==='discovery'&&baBusyTask==='import'&&['preparing','mapping','committing','stopping'].includes(mappingRunPhase)){mappingRetryAvailable=true;mappingFailureMessage=m.message||'Mapping failed';mappingRunPhase='';setDiscoveryImportBusy(false,'Mapping failed: '+mappingFailureMessage);}
    if(m.error&&view==='discovery'&&['review','stopReview'].includes(baBusyTask)){reviewStopReason='AI Review failed: '+String(m.message||'Unknown AI provider error').slice(0,1000)+' Select Re-run AI Review to retry.';}
    if(m.error&&view==='discovery'&&baBusyTask==='jiraSync'&&jiraPublishState.phase!=='failed'){jiraPublishState={...jiraPublishState,phase:'failed',message:'Jira publication failed: '+String(m.message||'Unknown error').slice(0,1000)+'. Reconcile and preview the remaining changes before retrying.'};renderJiraPublicationState();}
    if(m.error&&view==='discovery'){const stepByTask={import:'upload',saveDiscovery:'mapping',review:'review',skipReview:'review',applyReview:'review',generate:'generate',saveBR:'save',approveBR:'approve',jiraPreview:'jiraPreview',jiraApprove:'jiraApprove',jiraSync:'publish'};baFailedProcess=stepByTask[baBusyTask]||'';baFailedMessage=m.message||'Process failed.';}
    if(m.error&&baBusyTask==='jiraFixLink')for(const button of document.querySelectorAll('.jira-link-repair-action'))button.disabled=false;
    if(m.error||baBusyTask==='resolveProposals'||baBusyTask==='review'||baBusyTask==='generate'||baBusyTask==='skipReview'||baBusyTask==='approveBR'||baBusyTask==='jiraRetire'||baBusyTask==='jiraPreview'||baBusyTask==='jiraApprove'||baBusyTask==='jiraSync'){baBusy('',null);if(brEditorSaving){brEditorSaving=false;updateBREditorActions();}brApprovePending=false;pendingUploadAfterClaim=false;}
    if(m.error&&brEditing)$('brEditError').textContent=m.message||'Business Requirements draft save failed.';
    if(m.error){if(['review','generate','jiraPreview','jiraApprove','jiraSync'].includes(baBusyTask))stageProgress(baBusyTask,'Failed: '+(m.message||'Operation failed'),0);$('gateProgress').classList.add('hidden');if($('settingsSpaceMessage').textContent==='Searching…')$('settingsSpaceMessage').textContent=m.message||'Search failed';}
    if(m.error&&roleSettingsDirty){$('saveRoleSettings').disabled=false;$('roleSettingsStatus').textContent=m.message||'Save failed';}if(m.error&&!$('customRoleEditor').classList.contains('hidden')){$('saveCustomRole').disabled=false;$('deleteCustomRole').disabled=false;$('customRoleStatus').textContent=m.message||'Save failed';}if(m.error&&view==='work'){handoffOwnerBusy=null;renderHandoffs();}
    if(m.error&&roleTimelineDirty){$('roleTimelineSave').disabled=false;$('roleTimelineStatus').textContent=m.message||'Save failed';$('timelineModalStatus').textContent=m.message||'Save failed';}
    if(m.error&&bulkTimelineSaving){bulkTimelineSaving=false;$('bulkTimelineSave').disabled=false;$('bulkTimelineStatus').textContent=m.message||'Save failed. Reload Planning and retry.';}

    if(m.error&&blueprintBusy){blueprintBusy=false;designBatchPending=false;$('blueprintProgress').textContent='Blueprint action failed: '+(m.message||'unknown error');renderBlueprint();}
    if(m.error&&designBusy){designBatchPending=false;if(designBusyKind){const current=designProcessState[designBusyKind];setDesignProcess(designBusyKind,current?.percent||0,'Failed: '+(m.message||'Design generation failed.'),'error');}designBusy=false;designBusyKind='';renderDesignCards();$('designStatus').textContent='';}if(m.error){$('designSaveDraft').disabled=false;}
    if(m.error&&view==='knowledge'){$('knowledgeSync').disabled=!activeId;$('knowledgeSyncStatus').textContent=m.message||'Knowledge synchronization failed.';}
    if(m.error&&view==='landing'){$('overviewKnowledgeStatus').textContent=m.message||'Project knowledge request failed.';$('overviewKnowledgeSync').disabled=!activeId;}
    if(m.error&&sourceRemoving){sourceRemoving=false;renderSourceDocuments();}status(m.message,!!m.error);if(m.error&&view==='discovery'&&discoveryDirty){discoveryAutosaving=false;discoveryAutosaveSnapshot=null;$('discoverySave').disabled=!baCanEdit('ba-discovery');$('baDiscoverySaveStatus').textContent='Save not completed: '+String(m.message||'Unknown error').slice(0,250)+' · Retry manually';}if(m.error&&view==='documentEditor'&&docDirty){docSaving=false;$('docSave').disabled=false;$('docEditorStatus').textContent=m.message;}if(m.error&&gateBusy){gateBusy=false;gateError=m.message;renderGate();}}
  if(m.type==='discovered'){
    if(m.origin==='settings'){if(m.requestId!==settingsSearchId||read('settingsSpaceQuery').replace(/\s+/g,' ').toLocaleLowerCase()!==String(m.query).toLocaleLowerCase())return;}
    else if(m.requestId!==gateSearchId||read('gateQuery').replace(/\s+/g,' ').toLocaleLowerCase()!==String(m.query).toLocaleLowerCase())return;
    $('gateProgress').classList.add('hidden');spaces=(m.spaces||[]).slice(0,10);jiraProjects=m.projects||[];
    if(m.origin==='settings'){
      $('settingsSpaceMessage').textContent=`${spaces.length} matching spaces`;
      renderDiscovered();
    } else {
      $('gateSearchMessage').textContent=spaces.length?`${spaces.length} matching Confluence space${spaces.length===1?'':'s'}`:'No matching Confluence spaces found.';
      renderGateResults();
    }
    if(m.warning)status(m.warning,true);
  }
  if(m.type==='catalogState'){const previous=catalogState?.installed?.sha;renderCatalog(m.catalog);if(m.catalog?.installed?.sha!==previous&&activeId)send('uxFrameworkRead',{key:uxSelectedKey||''});}
  if(m.type==='catalogPullProgress'){
    renderSoftwareLibraryPullProgress(m);
    const progress=$('catalogPullProgress'),value=Math.max(0,Math.min(100,Number(m.percent)||0));
    progress.classList.remove('hidden');
    progress.dataset.state=m.stage==='failed'?'failed':m.stage==='completed'?'completed':'running';
    $('catalogPullProgressBar').setAttribute('aria-valuenow',String(value));
    $('catalogPullProgressIndicator').style.width=value+'%';
    $('catalogPullProgressPercent').textContent=value+'%';
    $('catalogPullProgressTitle').textContent=String(m.title||'Updating SDLC Library…').slice(0,150);
    $('catalogPullProgressMessage').textContent=String(m.message||'').slice(0,700);
  }
  if(m.type==='catalogAction'){
    $('catalogStatus').textContent=m.message||'';$('catalogStatus').className='test-status'+(m.success?' success':' error');
    if(m.action==='pull'){
      $('softwareLibraryStatus').textContent=String(m.message||'Library update finished.').slice(0,700);
      $('softwareLibraryStatus').className='test-status'+(m.success?' success':' error');
    }
    if(m.success&&['pull','save'].includes(m.action))field('catalogToken','');
  }
  if(m.type==='connectionTestResult'){
    if(!['jira','github'].includes(m.section)||m.requestId!==testRevisions[m.section])return;
    const [testId,saveId,statusId]=testIds(m.section);
    $(testId).disabled=false;
    $(statusId).textContent=m.message||'';
    $(statusId).className='test-status'+(m.success?' success':' error');
    if(m.success){
      if(m.section==='jira'){field('jiraToken','');field('jiraProjectKey',m.fields?.projectKey||'');}
      else {
        field('githubPersonalToken','');
        field('githubOwner',m.fields.owner);field('githubRepository',m.fields.repo);setGithubBranch();showGithubRepoPreview();
      }
      $(saveId).disabled=false;$(saveId).classList.remove('hidden');
    }else{$(saveId).disabled=true;$(saveId).classList.add('hidden');}
  }
  if(m.type==='projectConnectionTestResult'){
    if(m.kind!==mappingModalKind||m.projectId!==mappingModalProjectId||m.requestId!==mappingRequestSerial)return;
    mappingBusy=false;$('projectConnectionTest').disabled=false;
    if(!m.success){mappingVerified=null;$('projectConnectionSave').disabled=true;mappingModalStatus(m.message||'Permission test failed.',true);return;}
    if($('projectConnectionKey').value.trim().toUpperCase()!==m.key){invalidateMappingTest();return;}
    mappingVerified={kind:m.kind,key:m.key};$('projectConnectionSave').disabled=false;
    mappingModalStatus(m.message||'Permissions verified. You can save this mapping.');
  }
  if(m.type==='projectConnectionSaved'){
    if(m.kind!==mappingModalKind||m.projectId!==mappingModalProjectId||m.requestId!==mappingRequestSerial)return;
    mappingBusy=false;$('projectConnectionTest').disabled=false;
    if(!m.success){mappingVerified=null;$('projectConnectionSave').disabled=true;mappingModalStatus(m.message||'Could not save mapping.',true);return;}
    closeProjectConnectionModal();status(m.message||'Project connection saved.');
  }
  if(m.type==='settingsSaved'){updateExtensionSettingBadges();
    if(['jira','github'].includes(m.section))invalidateTest(m.section);
    if(m.section==='github'){
      $('githubTestStatus').textContent=m.message||'GitHub settings saved.';
      $('githubTestStatus').className='test-status success';
      // Keep the verified GitHub repository URL visible after saving.
      showGithubRepoPreview();
    }
    if(m.section==='jira'){spaces=[];jiraProjects=[];settingsSearchId=null;gateSearchId=null;$('settingsSpaces').replaceChildren();$('settingsSpaceMessage').textContent='Enter a space name or key to search.';}
  }
  if(m.type==='settingsSaveResult'&&m.section==='github'){
    $('githubTestStatus').textContent=m.message||'GitHub settings could not be saved.';
    $('githubTestStatus').className='test-status'+(m.success?' success':' error');
    $('saveGithub').disabled=false;
    $('saveGithub').classList.remove('hidden');
  }
  if(m.type==='importedProjectFolder'){status(m.message);send('refresh');}
  if(m.type==='created'||m.type==='updated'){editingId=m.id;status(m.message);if(m.type==='created'&&!workspaceOpened)showGate();send('refresh');}
});
                                                                                     
let opsOwnerDocs=[],opsOwnerEntries=[];
const opsStatusLabels={'unassigned':'Unassigned','mine':'You own this document','other':'Owned by others','pending':'Transfer pending','awaiting-me':'Transfer approval required','requested-by-me':'Transfer requested'};
function ownerFilters(){return {role:$('opsFilterRole').value,document:$('opsFilterName').value,username:$('opsFilterUsername').value,status:$('opsFilterStatus').value,from:$('opsFilterFrom').value,to:$('opsFilterTo').value};}
function renderOwnershipTable(){
 const tbody=$('opsOwnerRows');if(!tbody)return;tbody.replaceChildren();
 const rows=ATGVOwnershipFilters.filterOwnershipRows(opsOwnerEntries,ownerFilters(),opsOwnerMe);
 $('opsResultCount').textContent=`${rows.length} of ${opsOwnerEntries.length} documents`;
 if(!rows.length){const row=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=5;cell.textContent=opsOwnerLoaded?'No documents match the selected filters.':'Loading ownership…';row.append(cell);tbody.append(row);return;}
 for(const entry of rows){
  const row=document.createElement('tr');row.classList.toggle('selected',entry.documentId===$('opsDocument').value);
  const td=document.createElement('td');const pick=document.createElement('button');pick.type='button';pick.className='owner-pick';pick.textContent=entry.label;pick.addEventListener('click',()=>{$('opsDocument').value=entry.documentId;showOwnerStatus();});td.append(pick);row.append(td);
  for(const value of [entry.role,entry.ownerName||entry.ownerId||entry.pending?.toName||entry.pending?.to||'—',entry.updatedAt?new Date(entry.updatedAt).toLocaleString():'—']){const c=document.createElement('td');c.textContent=value;row.append(c);}
  const c=document.createElement('td');const label=document.createElement('span');const state=ATGVOwnershipFilters.ownerStatus(entry,opsOwnerMe);label.className='owner-status-pill '+state;label.textContent=opsOwnerPending.some(q=>q.document===entry.documentId&&q.status==='pending')?'Pending offline sync':ATGVOwnershipPresentation.display(entry,opsOwnerMe,{cached:opsOwnerCached}).text;c.append(label);row.append(c);tbody.append(row);
 }
}
function renderOperationDocuments(){
 const select=$('opsDocument');if(!select)return;
 const before=select.value;select.replaceChildren();const values=new Map();
 for(const role of roleData.roles||[]){for(const task of role.tasks||[]){if(task.document)values.set(role.id+'--'+task.id,{label:role.label+' — '+task.label,role:role.label});}}
 for(const br of activeBusinessRequirements())values.set('ba-br-'+br.id,{label:'Business Requirement — '+br.id+' '+br.title,role:'Business Analyst'});
 for(const handoff of roleData.readiness?.handoffs||[]){for(const item of handoff.items||[]){
  const id='handoff-'+item.id;values.set(id,{label:'Handoff — '+handoff.label+' / '+(item.brId==='project'?'Project':item.brId+' r'+item.brRevision),role:handoff.label});
 }}
 for(const record of opsOwnerDocs){if(record.documentId==='ba-discovery')continue;if(!values.has(record.documentId))values.set(record.documentId,{label:record.documentId,role:'Other'});}
 opsOwnerEntries=[];
 for(const [id,meta] of values){const option=document.createElement('option');option.value=id;option.textContent=meta.label;select.append(option);const record=opsOwnerDocs.find(d=>d.documentId===id)||{};opsOwnerEntries.push({documentId:id,...meta,...record});}
 if([...select.options].some(o=>o.value===before))select.value=before;
 const roles=[...new Set(opsOwnerEntries.map(item=>item.role))].sort();const roleSelect=$('opsFilterRole'),roleBefore=roleSelect.value;roleSelect.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='All roles';roleSelect.append(all);
 for(const role of roles){const opt=document.createElement('option');opt.value=role;opt.textContent=role;roleSelect.append(opt);}
 if(roles.includes(roleBefore))roleSelect.value=roleBefore;
 showOwnerStatus();
}
function showOwnerStatus(){
 const id=$('opsDocument')?.value;
 const o=opsOwnerDocs.find(d=>d.documentId===id)||{ownerId:null,revision:0,pending:null};
 if(!$('opsOwnerStatus'))return;
 const me=opsOwnerMe,mine=!!me&&o.ownerId===me,requester=!!me&&o.pending?.to===me;
 const presentation=ATGVOwnershipPresentation.display(o,me,{loaded:opsOwnerLoaded,cached:opsOwnerCached});
 $('opsOwnerStatus').textContent=!opsOwnerLoaded?($('opsOwnerError').classList.contains('hidden')?'Loading ownership…':'Ownership unavailable. Check connection settings and refresh.'):presentation.text+' · Revision '+o.revision;
 $('opsOwnerStatus').className='ownership-state-text '+presentation.state;
 const enabled=opsOwnerLoaded&&!opsOwnerBusy&&!!id&&!!me;
 const controls=[['opsClaim','claim'],['opsTransfer','request-transfer'],['opsApprove','approve-transfer'],['opsReject','reject-transfer'],['opsCancel','cancel-transfer']];
 for(const [id,operation] of controls){const button=$(id);const visible=presentation.primary===operation||presentation.secondary===operation;button.classList.toggle('hidden',!visible);button.disabled=!enabled||!visible||opsOwnerCached&&['approve-transfer','reject-transfer','cancel-transfer'].includes(operation);}
 renderOwnershipTable();
}
function ownerError(message){$('opsOwnerError').textContent=message||'';$('opsOwnerError').classList.toggle('hidden',!message);}
for(const id of ['opsFilterRole','opsFilterName','opsFilterUsername','opsFilterStatus','opsFilterFrom','opsFilterTo'])$(id).addEventListener('input',renderOwnershipTable);
$('opsClearFilters').addEventListener('click',()=>{for(const id of ['opsFilterRole','opsFilterName','opsFilterUsername','opsFilterStatus','opsFilterFrom','opsFilterTo'])$(id).value='';renderOwnershipTable();});
$('opsDocument').addEventListener('change',showOwnerStatus);
$('coordinationProvider').addEventListener('change',()=>{send('setCoordinationProvider',{provider:$('coordinationProvider').value});updateExtensionSettingBadges();});
$('opsService').addEventListener('click',()=>send('configureService'));
$('opsConnectionSettings').addEventListener('click',()=>navigate('project-settings'));
$('opsRefreshOwners').addEventListener('click',()=>{ownerError('');opsOwnerLoaded=false;showOwnerStatus();send('refreshOwners');});
for(const [id,action] of [['opsClaim','claim'],['opsTransfer','request-transfer'],['opsApprove','approve-transfer'],['opsReject','reject-transfer'],['opsCancel','cancel-transfer']]){
 $(id).addEventListener('click',()=>{
  const doc=$('opsDocument').value;if(!doc||$(id).disabled)return;
  const o=opsOwnerDocs.find(d=>d.documentId===doc);
  ownerError('');opsOwnerBusy=true;showOwnerStatus();send('changeOwner',{document:doc,action,revision:o?.revision??0});
 });
}
$('opsJiraCreate').addEventListener('click',()=>send('createJiraTicket',{summary:read('opsSummary')}));
$('opsJiraUpdate').addEventListener('click',()=>send('updateJiraTicket',{key:read('opsIssueKey'),summary:read('opsSummary')}));
$('opsJiraAuto').addEventListener('change',()=>send('toggleJiraAutoSync',{enabled:$('opsJiraAuto').checked}));


$('opsConfluenceSync').addEventListener('click',()=>send('syncDocuments'));
$('opsAutoSync').addEventListener('change',()=>send('toggleAutoSync',{enabled:$('opsAutoSync').checked}));
$('flowGenerate').addEventListener('click',()=>send('generateDrafts'));
$('flowBackground').addEventListener('click',()=>send('continueBackground'));
window.addEventListener('message',e=>{
 const m=e.data;if(!m)return;
 if(m.type==='deliveryOpened'){deliveryBusy=false;deliveryInfo=m.value;deliveryDraftDirty=false;renderDeliveryWorkbench();}
 if(m.type==='deliveryOperationError'){deliveryBusy=false;renderDeliveryWorkbench();$('deliveryEditorStatus').textContent=m.message||'Work operation failed.';}
 if(m.type==='deliveryOperationCompleted'){deliveryBusy=false;renderDeliveryWorkbench();$('deliveryEditorStatus').textContent=m.message||'Operation completed.';}
 if(m.type==='deliveryOperationCancelled'){deliveryBusy=false;$('deliveryAiProgress').textContent='AI generation cancelled.';renderDeliveryWorkbench();}
 if(m.type==='deliveryProgress'){$('deliveryAiProgress').textContent=m.message||'Processing…';}
 if(m.type==='deliveryComparison'){
  deliveryBusy=false;const panel=$('deliveryComparison'),value=m.value;panel.classList.remove('hidden');panel.replaceChildren();
  panel.append(deliveryElement('h3','Comparison · r'+value.revision+' vs r'+value.currentRevision));
  for(const [name,text] of [['Previous',value.previous],['Current',value.current]]){panel.append(deliveryElement('strong',name),deliveryElement('pre',text,'delivery-context-code'));}
 }

 if(m.type==='ownerList'&&m.projectId===activeId){ownerError('');opsOwnerDocs=m.documents||[];opsOwnerMe=m.me||null;opsOwnerScope=m.scope||null;opsOwnerCached=!!m.cached;opsOwnerPending=m.pendingOperations||[];opsOwnerLoaded=true;opsOwnerBusy=false;
  const text=opsOwnerCached?'Offline cached Jira identity · last verified '+(m.verifiedAt?new Date(m.verifiedAt).toLocaleString():'unknown')+' · queued requests: '+opsOwnerPending.length+(m.conflicts?.length?' · sync conflicts: '+m.conflicts.length:'')+'. Refresh when online. Approvals remain disabled.':'Connected to Jira + Confluence · verified account '+(m.meName||m.me||'unknown')+(opsOwnerPending.length?' · queued requests: '+opsOwnerPending.length:'')+(m.conflicts?.length?' · sync conflicts: '+m.conflicts.length:'');
  $('opsOwnerSync').textContent=text;$('opsOwnerSync').classList.toggle('cached',opsOwnerCached);
  renderOperationDocuments();if(opsOwnerCached)notifyTop('Offline ownership cache loaded. Pending changes will sync when online.',{success:false});
 }
 if(m.type==='ownerChanged'&&m.projectId===activeId){opsOwnerBusy=false;const i=opsOwnerDocs.findIndex(d=>d.documentId===m.document);const val={documentId:m.document,...m.value};if(i>=0)opsOwnerDocs[i]=val;else opsOwnerDocs.push(val);renderOperationDocuments();}
 if(m.type==='ownerListError'&&m.projectId===activeId){opsOwnerLoaded=false;opsOwnerBusy=false;ownerError(m.message||'Could not load ownership.');showOwnerStatus();}
 if(m.type==='ownerActionError'&&m.projectId===activeId){opsOwnerBusy=false;ownerError(m.message||'Ownership operation failed.');showOwnerStatus();}
 if(m.type==='ownershipActionFinished'&&m.projectId===activeId){opsOwnerBusy=false;handoffOwnerBusy=null;showOwnerStatus();if(view==='work')renderHandoffs();}
 if(m.type==='operationsResult'){
  const target=m.scope==='flow'?'flowResult':'opsResult';
  $(target).classList.remove('hidden');$(target).textContent=JSON.stringify(m.result,null,2);
  status('Operation finished.');
 }
});
// Initial state arrives after webview-asset-boot.js confirms CSS and controllers.
function renderMyWorkRoster(rows){
 const root=$('overviewUserRows');if(!root)return;
 const entries=(Array.isArray(rows)?rows:[]).map(user=>({
  ...user,rolesLabel:(Array.isArray(user.roles)?user.roles:[]).join(', ')||'—',
  tasksText:String(user.tasks||'No assigned task')
 }));
 if(typeof ATGVDataTables==='undefined'){root.textContent='DataTable module not available. Reload ATGV.';return;}
 const taskCell=(item,doc)=>{
  const wrap=doc.createElement('div');wrap.className='overview-roster-tasks';
  const tasks=item.tasksText.split(/\s*;\s*/).map(x=>x.trim()).filter(Boolean);
  const shown=tasks.slice(0,12);
  for(const task of shown){
   const el=doc.createElement('span');el.className='overview-roster-task';
   const hit=task.match(/^([A-Z][A-Z0-9_]+-\d+)\s*\(([^)]+)\)$/);
   if(hit){const key=doc.createElement('strong');key.textContent=hit[1];const status=doc.createElement('small');status.textContent=hit[2];el.append(key,status);}
   else el.textContent=task;
   wrap.append(el);
  }
  if(tasks.length>shown.length){const more=doc.createElement('span');more.className='muted';more.textContent='+'+(tasks.length-shown.length)+' more tasks';more.title=item.tasksText;wrap.append(more);}
  return wrap;
 };
 ATGVDataTables.mount(root,entries,[
  {key:'name',label:'Name',render:(item,doc)=>{const box=doc.createElement('div'),strong=doc.createElement('strong'),small=doc.createElement('small');strong.textContent=String(item.name||'Unknown');small.textContent=String(item.email||item.id||'');box.append(strong,small);return box;}},
  {key:'rolesLabel',label:'Roles'},
  {key:'tasksText',label:'Assigned Jira Tasks',render:taskCell}
 ],{pageSize:5,sortKey:'name',label:'My Work users and assigned Jira issues'});
}
$('overviewUserAddForm').addEventListener('submit',event=>{
 event.preventDefault();
 const id=String($('overviewUserAccountId').value||'').trim();
 if(!id)return;
 $('overviewUserStatus').textContent='Verifying Jira account before registration…';
 send('myWorkRosterAddUser',{projectId:activeId,accountId:id});
});
$('overviewUserRefresh').addEventListener('click',()=>{
 $('overviewUserStatus').textContent='Loading verified My Work users from Confluence…';
 send('myWorkRosterRefresh',{projectId:activeId,roleId:selectedRole});
});
window.addEventListener('message',event=>{
 const m=event.data||{};
 if(!activeId||m.projectId!==activeId)return;
 if(m.type==='myWorkRoster'){
  renderMyWorkRoster(m.rows);
  if(m.reason==='added-user')$('overviewUserAccountId').value='';
  $('overviewUserStatus').textContent=(m.rows?.length||0)+' users · assigned Jira tasks refreshed'+(m.assignmentWarning?' · '+m.assignmentWarning:'')+(m.registryWarning?' · '+m.registryWarning:'')+(m.databaseId?' · Database v2 #'+m.databaseId:'')+' · Confluence space '+(m.spaceKey||'')+(m.updatedAt?' · '+new Date(m.updatedAt).toLocaleString():'');
 }else if(m.type==='myWorkRosterError'){
  $('overviewUserStatus').textContent='Confluence roster unavailable: '+(m.message||'Check space configuration and permissions.');
 }
});

// User-facing progress for permanent Jira-only BR deletion; never treat a
// partial failure as completion, and refresh the inventory after confirmed success.
window.addEventListener('message',event=>{
 const m=event.data||{};
 if(!activeId||m.projectId!==activeId)return;
 if(m.type==='jiraOnlyBRDeletionProgress'){
  status('Deleting verified Jira BR hierarchy: '+String(m.key||'')+' ('+Number(m.deleted||0)+'/'+Number(m.total||0)+')');
 }else if(m.type==='jiraOnlyBRDeletionCompleted'){
  status('Jira-only '+String(m.brId||'BR')+' deleted: '+Number(m.deleted||0)+' confirmed Jira issues. Refreshing Jira…');
  ensureBAJiraInventory(true);
 }else if(m.type==='jiraOnlyBRDeletionError'){
  status('Jira BR deletion blocked: '+String(m.message||'Refresh the BR and review Jira permissions.'));
 }
});
function developerStatus(message){const target=$('devExecutionStatus');if(target)target.textContent=String(message||'');}
function devSetStep(id,message){const element=$(id);if(element)element.textContent=message;}

let architectCatalogBusy=false;
function renderArchitectCatalogStatus(){
 const installed=catalogState?.installed,remote=catalogState?.remote,configured=!!catalogState?.config?.repositoryUrl;
 const newer=!!catalogState?.updateAvailable;
 $('architectCheckStackUpdates').disabled=architectCatalogBusy||!!catalogState?.busy||!configured;
 $('architectPullStackUpdates').disabled=architectCatalogBusy||!!catalogState?.busy||!configured||!newer;
 if(!configured){$('architectCatalogStatus').textContent='Configure the SDLC Catalog in Extension Settings first.';return;}
 $('architectCatalogStatus').textContent=installed?.offline&&remote?.version?'Using newer ZIP v'+installed.version+' · GitHub main v'+remote.version+'.':remote?(newer?'Update available · '+remote.sha.slice(0,12)+' · review and pull the versioned catalog.':`Catalog up to date · ${installed?.version||'current'} · ${remote.sha.slice(0,12)}`):installed?`Installed ${installed.version} · Check Updates to compare with GitHub main.`:'No catalog installed · Check Updates to discover the latest version.';
}

$('architectCheckStackUpdates').addEventListener('click',()=>{architectCatalogBusy=true;$('architectCatalogStatus').textContent='Checking the SDLC Catalog main branch…';renderArchitectCatalogStatus();send('architectCheckStackUpdates');});
$('architectPullStackUpdates').addEventListener('click',()=>{architectCatalogBusy=true;$('architectCatalogStatus').textContent='Reviewing latest catalog before download…';renderArchitectCatalogStatus();send('architectPullStackUpdates');});
window.addEventListener('message',event=>{
 const msg=event.data||{};
 if(msg.type==='catalogState')renderArchitectCatalogStatus();
 if(msg.type==='architectCatalogAction'){architectCatalogBusy=false;renderArchitectCatalogStatus();if(msg.message)$('architectCatalogStatus').textContent=msg.message;
   if(msg.logAvailable)architectRecordErrorLog(msg);}
});
let architectServerBusy=false,architectServerSnapshot={running:false,message:'App server stopped'},architectServerSnapshotProjectId='';
let architectServerStatusRequest=0,architectServerStatusAccepted=0;
let architectErrorLogProjectId='',architectErrorLogCount=0,architectLogCheckedProjectId='';
function updateArchitectFailureLogButtons(){
 const button=$('architectDownloadUnifiedLog');
 const available=!!(activeId&&architectErrorLogProjectId===activeId&&architectErrorLogCount>0);
 button.disabled=!available;
 button.title=available?'Download chronological Technology Stack activity and errors from Save Stack onward.':'Select Save Stack to start a downloadable Technology Stack diagnostic log.';
}
function architectRecordErrorLog(message){
 if(!message?.logAvailable||message.projectId!==activeId)return;
 if(architectErrorLogProjectId!==activeId){architectErrorLogProjectId=activeId;architectErrorLogCount=0;}
 architectErrorLogCount=Math.max(architectErrorLogCount+1,Number(message.logCount)||0);
 updateArchitectFailureLogButtons();
}
$('architectDownloadUnifiedLog').addEventListener('click',()=>{
 if(activeId&&architectErrorLogProjectId===activeId&&architectErrorLogCount>0)send('architectDownloadErrorLog',{kind:'all'});
});
window.addEventListener('message',event=>{
 const msg=event.data||{};
 if(msg.type!=='architectLogState'||msg.projectId!==activeId)return;
 architectErrorLogProjectId=activeId;
 architectErrorLogCount=Math.max(Number(msg.events)||0,Number(msg.errorCount)||0);
 updateArchitectFailureLogButtons();
});
function updateArchitectServerControls(saved){
 const toggle=$('architectServerToggle');
 const running=architectServerSnapshotProjectId===activeId&&!!architectServerSnapshot.running;
 toggle.disabled=architectServerBusy||!saved;
 toggle.textContent=architectServerBusy?(running?'Stopping Server…':'Starting Server…'):(running?'Stop Server':'Run Server');
 toggle.setAttribute('aria-pressed',running?'true':'false');
 toggle.dataset.running=running?'true':'false';
 toggle.classList.toggle('atgv-stop-server',running);
 toggle.title=running?'Stop this stack’s ATGV-managed app server':'Start this stack’s app server';
 $('architectServerStatus').textContent=architectServerSnapshot.message||'App server stopped';
 $('architectServerStatus').dataset.running=architectServerSnapshot.running?'true':'false';
 const address=$('architectServerAddress'),url=architectServerSnapshotProjectId===activeId&&running?String(architectServerSnapshot.url||''):'';
 address.textContent=url?'Preview address: '+url:'';
 address.title=url?'Current verified local application address: '+url:'';
 address.classList.toggle('hidden',!url);
}
function architectServerAction(command){
 if(architectServerBusy||!activeId)return;
 architectServerBusy=true;
 architectServerSnapshot={...architectServerSnapshot,message:command==='architectRunServer'?'Starting application server…':'Stopping application server…'};
 processActivityUpsert('server','Application Server',architectServerSnapshot.message,'running');
 updateArchitectServerControls(true);
 send(command);
}
$('architectServerToggle').addEventListener('click',()=>architectServerAction(architectServerSnapshotProjectId===activeId&&architectServerSnapshot.running?'architectStopServer':'architectRunServer'));
function architectBegin(action,message){
 if(architectActionBusy)return false;
 architectActionBusy=true;architectPendingAction=action;architectLastMessage=message;
 if(action==='architectSaveStack')architectSavePendingSelection={projectId:activeId,stackId:$('architectStackSelect').value};
 processActivityUpsert('stack','Technology Stack',message,'running');
 const live=architectChecklistSession($('architectStackSelect').value);
 live.failed='';
 if(action==='architectResetStack')live.active='git';
 else if(action==='architectSaveStack'){live.completed.clear();live.active='git';}
 else if(action==='architectTestStack')live.active='tests';
 else if(action==='architectApproveStack'||action==='architectApproveCustomStack')live.active='approval';
 renderArchitectRequirements(projects.find(p=>p.id===activeId));
 $('architectBootstrapStatus').textContent=message;
 for(const id of ['architectSaveStack','architectResetStack','architectTestStack','architectApproveStack'])$(id).disabled=true;
 $('architectStopInstall').disabled=action!=='architectSaveStack'||$('architectStackSelect').value==='custom';
 send(action,{stackId:$('architectStackSelect').value});return true;
}
let architectCustomInfo=null,architectCustomBusy=false,architectCustomRunning=false;
let architectCustomProgressPercent=0,architectCustomProgressLabel='Ready to scan';
let architectCustomOperation='',architectCustomStatusPending=false,architectCustomLastError='';
let architectCustomStage=0,architectCustomAiActive=false;
// Distinguish a scan request sent from acknowledgement by the extension host.
let architectCustomScanPending=false,architectCustomScanStartedAt=0,architectCustomHostResponseAt=0,architectCustomScanSequence=0;
let architectCustomRuntime={projectId:'',checked:false,running:false,pid:null,previewUrl:'',relative:'',mockPreview:false,exitCode:null,reachable:null};
function architectCustomRequestStatus(){
 if(!activeId||$('architectStackSelect')?.value!=='custom'||architectCustomStatusPending)return;
 architectCustomStatusPending=true;
 send('architectCustomStatus',{projectId:activeId});
}
function architectCustomDrawRuntime(){
 const root=$('architectCustomRuntime');if(!root)return;
 const label=$('architectCustomRuntimeLabel'),detail=$('architectCustomRuntimeDetail');
 const runtime=architectCustomRuntime.projectId===activeId?architectCustomRuntime:null;
 let state='unknown',title='APPLICATION STATUS UNKNOWN',description='Use Check Status to verify whether an ATGV-managed application is running.';
 if(architectCustomBusy){
  state='working';title=architectCustomOperation||'WORKING';
  description=/confirm/i.test(title)?'Check the VS Code confirmation dialog; no application script runs until you approve.':
   'ATGV is processing this action. See Technology Stack progress above.';
 }else if(runtime?.checked&&runtime.running){
  const reachable=runtime.reachable;
  state=reachable===false?'working':'running';
  title=reachable===false?'PROCESS RUNNING — PREVIEW NOT REACHABLE':'APPLICATION RUNNING';
  description=(runtime.mockPreview?'MOCK DATA preview':'Real application')+
   (runtime.pid?' · PID '+runtime.pid:'')+
   (runtime.previewUrl?' · '+runtime.previewUrl:'')+
   (reachable===false?' · Check logs / localhost health':'');
 }else if(architectCustomLastError){
  const cancelled=/cancelled|canceled/i.test(architectCustomLastError);
  state=cancelled?'stopped':'failed';title=cancelled?'ACTION CANCELLED':'LAST ACTION FAILED';
  description=architectCustomLastError;
 }else if(runtime?.checked){
  state='stopped';title='APPLICATION NOT RUNNING';
  description=Number.isInteger(runtime.exitCode)?'ATGV process exited with code '+runtime.exitCode+'. Check logs before restarting.':
   (architectCustomInfo?.projectId===activeId?
    'Scan complete, but NO server was started. Select Install & Run to prepare the mock preview.':
    'Scan Repository identifies applications; it does not install or start them.');
 }else if(runtime?.message){
  state='unknown';description=runtime.message;
 }
 root.dataset.state=state;label.textContent=title;detail.textContent=description;
 $('architectCustomCheckStatus').disabled=architectCustomStatusPending;
 $('architectCustomOpenPreview').disabled=!(runtime?.running&&runtime.reachable===true&&runtime.previewUrl);
}
function architectCustomSetProgress(percent,label){
 if(Number.isFinite(Number(percent)))architectCustomProgressPercent=Math.min(100,Math.max(0,Math.round(Number(percent))));
 if(label)architectCustomProgressLabel=String(label).slice(0,180);
 // One shared progress indicator at the top of Technology Stack.
 // Custom scanning and remediation phases reuse the existing catalog bar.
 if($('architectStackSelect')?.value==='custom')renderArchitectRequirements(projects.find(p=>p.id===activeId));
}
function renderArchitectCustomPanel(){
 const panel=$('architectCustomPanel');if(!panel)return;
 const isCustom=$('architectStackSelect').value==='custom';
 panel.classList.toggle('hidden',!isCustom);
 if(!isCustom)return;
 if(activeId&&architectLogCheckedProjectId!==activeId){
  architectLogCheckedProjectId=activeId;
  send('architectActivityStatus',{projectId:activeId});
 }
 const current=architectCustomInfo?.projectId===activeId?architectCustomInfo:null;
 if(architectCustomRuntime.projectId!==activeId){
  architectCustomRuntime={projectId:activeId,checked:false,running:false,pid:null,previewUrl:'',relative:'',mockPreview:false,exitCode:null,reachable:null};
  architectCustomStatusPending=false;architectCustomLastError='';
  if(activeId)architectCustomRequestStatus();
 }
 architectCustomDrawRuntime();
 const select=$('architectCustomTarget'),previous=select.value;
 select.replaceChildren();
 for(const target of current?.targets||[]){
  const option=document.createElement('option');option.value=target.relative;
  option.textContent=(target.relative||'Repository root')+' · '+target.framework+(target.runnable?'':' (no run script)');
  option.disabled=!target.runnable;select.append(option);
 }
 const selected=(current?.targets||[]).find(t=>t.relative===previous&&t.runnable)||(current?.targets||[]).find(t=>t.runnable);
 if(selected){select.value=selected.relative;const preview=$('architectCustomPreviewUrl');if(!preview.value||!current?.previewCustomized)preview.value=selected.previewUrl;}
 select.disabled=architectCustomBusy||!current?.ready;
 $('architectCustomScan').disabled=architectCustomBusy||architectActionBusy||!activeId||
  projects.find(p=>p.id===activeId)?.techStackId!=='custom';
 $('architectCustomScan').textContent='Scan Repository';
 $('architectCustomScan').title='Re-analyze the current verified repository, dependencies, environment and service blockers';
 $('architectCustomPull').disabled=architectCustomBusy||architectActionBusy||!current?.sha||!current?.clean||architectCustomRunning;
 const singleRun=$('architectCustomRun');
 const stopMode=architectCustomBusy||architectCustomRunning;
 singleRun.textContent=stopMode?'Stop':'Install & Run';
 singleRun.classList.toggle('atgv-custom-stop-mode',stopMode);
 singleRun.setAttribute('aria-pressed',String(stopMode));
 singleRun.disabled=!activeId||architectActionBusy||
  projects.find(p=>p.id===activeId)?.techStackId!=='custom'; 
 const stages=$('architectCustomSteps');
 if(stages)for(const item of stages.querySelectorAll('[data-step]')){
  const number=Number(item.dataset.step);
  item.dataset.state=number<architectCustomStage?'done':number===architectCustomStage?'active':'pending';
 }
 const waves=$('architectCustomAiWave');
 if(waves)waves.classList.toggle('hidden',!architectCustomAiActive);
 $('architectCustomMockRun').disabled=architectCustomBusy||!current?.ready||architectCustomRunning||!selected?.mockable;
 $('architectCustomStop').disabled=architectCustomBusy||!architectCustomRunning;
 const branchSelect=$('architectCustomBranch'),priorBranch=branchSelect.value;
 branchSelect.replaceChildren();
 for(const name of current?.branches?.items||[]){
  const option=document.createElement('option');option.value=name;option.textContent=name;
  branchSelect.append(option);
 }
 if((current?.branches?.items||[]).includes(priorBranch))branchSelect.value=priorBranch;
 else if(current?.branches?.current)branchSelect.value=current.branches.current;
 branchSelect.disabled=architectCustomBusy||!current?.branches?.items?.length;
 $('architectCustomSwitchBranch').disabled=architectCustomBusy||architectCustomRunning||!current?.clean||!branchSelect.value||branchSelect.value===current?.branch;
 $('architectCustomBranchStatus').textContent=current?.branch?'Current: '+current.branch:'No branch selected';
 const actions=$('architectCustomActions');actions.replaceChildren();
 for(const action of current?.analysis?.actions||[]){
  const button=document.createElement('button');button.type='button';button.className='secondary';
  button.dataset.customAction=action.id;button.textContent=action.label;button.title=action.detail||action.label;
  button.disabled=architectCustomBusy||architectCustomRunning||
   (action.id==='fix-branch'&&!current.clean)||
   ((action.id==='mock-services'||action.id==='mock-database')&&!selected?.mockable);
  actions.append(button);
 }
 const findings=$('architectCustomFindings');findings.replaceChildren();
 if(current?.analysis){
  const heading=document.createElement('strong');heading.textContent='Repository readiness · '+(current.analysis.source||'manifest evidence');
  findings.append(heading);
  const review=current.analysis.modelReview;
  if(review?.summary){
   const note=document.createElement('p');note.className='muted';note.textContent='AI advisory ('+(review.label||'')+'): '+review.summary;
   findings.append(note);
  }
  for(const issue of [...(current.analysis.observations||[]),...(review?.findings||[])].slice(0,22)){
   const node=document.createElement('div');node.className='atgv-custom-finding';
   node.dataset.level=issue.level||'info';
   node.textContent=(issue.level==='error'?'!':issue.level==='warning'?'⚠':'•')+' '+(issue.target?issue.target+' · ':'')+issue.message;
   findings.append(node);
  }
 }
 if(current){
  $('architectCustomDetails').textContent=current.targets.map(t=>(t.relative||'Root')+': '+t.framework+' · '+t.kind+' · '+(t.scripts?.join(', ')||'native build/test/run')+(t.installed?' · dependencies present':' · dependencies may need installation')).join(' | ')+' · Git '+(current.sha||'').slice(0,12)+' · '+(current.clean?'clean checkout':'uncommitted edits present; no files will be committed');
 }
}
function architectCustomNotify(text,state='running'){
 const node=$('architectCustomStatus');node.textContent=String(text||'');node.dataset.state=state;
}
$('architectCustomCheckStatus').addEventListener('click',()=>{
 if(!activeId||architectCustomStatusPending)return;
 architectCustomRequestStatus();architectCustomDrawRuntime();
});
$('architectCustomOpenPreview').addEventListener('click',()=>{
 if(!activeId||!architectCustomRuntime?.running||architectCustomRuntime.reachable!==true)return;
 send('architectCustomOpenPreview',{projectId:activeId});
});
setInterval(()=>{
 if($('architectStackSelect')?.value==='custom'&&activeId&&!architectCustomBusy&&
    architectCustomRuntime.projectId===activeId&&architectCustomRuntime.running&&!architectCustomStatusPending){
   architectCustomRequestStatus();
 }
},7000);
$('architectCustomTarget').addEventListener('change',()=>{
 const current=architectCustomInfo?.projectId===activeId?architectCustomInfo:null;
 const selected=current?.targets?.find(x=>x.relative===$('architectCustomTarget').value);
 if(selected){$('architectCustomPreviewUrl').value=selected.previewUrl;current.previewCustomized=false;}
 renderArchitectCustomPanel();
});
$('architectCustomPreviewUrl').addEventListener('input',()=>{
 if(architectCustomInfo?.projectId===activeId)architectCustomInfo.previewCustomized=true;
});
$('architectCustomScan').addEventListener('click',()=>{
 if(!activeId||architectCustomBusy||architectActionBusy)return;
 architectCustomBusy=true;architectCustomScanPending=true;architectCustomOperation='SCANNING REPOSITORY';architectCustomLastError='';
 architectCustomScanStartedAt=Date.now();architectCustomHostResponseAt=0;
 architectCustomSetProgress(4,'Sending repository scan request to VS Code…');
 architectCustomNotify('Scan requested. Awaiting extension-host acknowledgement; no application has been started.');
 renderArchitectCustomPanel();send('architectCustomScan',{projectId:activeId,scanId:++architectCustomScanSequence});
});
// Never represent an unresponsive extension host as an actively running server.
setInterval(()=>{
 if(!architectCustomScanPending||!architectCustomBusy||!activeId||$('architectStackSelect')?.value!=='custom')return;
 const elapsed=Math.floor((Date.now()-architectCustomScanStartedAt)/1000);
 const silence=architectCustomHostResponseAt?Math.floor((Date.now()-architectCustomHostResponseAt)/1000):elapsed;
 if(silence<12)return;
 if(!architectCustomHostResponseAt)
  architectCustomNotify('No extension-host progress response after '+elapsed+'s. The scan request was sent, but execution is not confirmed. Check the ATGV error log or run ATGV: Restart if this continues.','warning');
 else
  architectCustomNotify('Scan pending ('+elapsed+'s). Last extension-host update '+silence+'s ago: '+architectCustomProgressLabel+'. If stalled, check the ATGV error log.','warning');
 architectCustomDrawRuntime();
},5000);
$('architectCustomPull').addEventListener('click',()=>{
 const current=architectCustomInfo?.projectId===activeId?architectCustomInfo:null;
 if(!current?.sha||architectCustomBusy||!current.clean)return;
 architectCustomBusy=true;architectCustomSetProgress(8,'Checking GitHub origin');
 architectCustomNotify('Checking clean local checkout and pulling latest verified Git branch…');
 renderArchitectCustomPanel();send('architectCustomPull',{projectId:activeId,expectedSha:current.sha});
});
$('architectCustomSwitchBranch').addEventListener('click',()=>{
 const current=architectCustomInfo?.projectId===activeId?architectCustomInfo:null;
 if(!current?.sha||architectCustomBusy||!current.clean)return;
 architectCustomBusy=true;architectCustomSetProgress(10,'Reviewing Git branch switch');
 architectCustomNotify('Confirm switching to an existing local branch…');
 renderArchitectCustomPanel();
 send('architectCustomSwitchBranch',{projectId:activeId,expectedSha:current.sha,branch:$('architectCustomBranch').value});
});
$('architectCustomBranch').addEventListener('change',()=>renderArchitectCustomPanel());
$('architectCustomActions').addEventListener('click',event=>{
 const button=event.target?.closest?.('button[data-custom-action]');
 const current=architectCustomInfo?.projectId===activeId?architectCustomInfo:null;
 if(!button||!current||architectCustomBusy||architectCustomRunning)return;
 const action=button.dataset.customAction;
 const selected=current.targets.find(t=>t.relative===$('architectCustomTarget').value);
 let message='';
 if(action==='fix-branch'){
  message='Review the host confirmation to create a local preview fix branch without changing main.';
  send('architectCustomFixBranch',{projectId:activeId,expectedSha:current.sha});
 }else if(action==='install-dependencies'){
  const target=selected?.kind==='npm'&&!selected.installed?selected:current.targets.find(t=>t.kind==='npm'&&!t.installed);
  if(!target)return;
  message='Review the host confirmation to install locked dependencies for '+target.relative+'.';
  send('architectCustomInstall',{projectId:activeId,sha:current.sha,relative:target.relative});
 }else if(['mock-services','mock-database'].includes(action)&&selected?.mockable){
  message='Review confirmation for '+(action==='mock-database'?'synthetic database and service':'mock service')+' preview.';
  send('architectCustomRun',{projectId:activeId,sha:current.sha,relative:selected.relative,
   previewUrl:$('architectCustomPreviewUrl').value.trim(),mock:true,mockDatabase:action==='mock-database'});
 }else return;
 architectCustomBusy=true;architectCustomSetProgress(10,action==='fix-branch'?'Preparing fix branch':action==='install-dependencies'?'Checking dependencies':'Preparing mock preview');
 architectCustomNotify(message);renderArchitectCustomPanel();
});
$('architectCustomRun').addEventListener('click',()=>{
 if(!activeId||architectActionBusy)return;
 if(architectCustomBusy||architectCustomRunning){
  architectCustomOperation='STOPPING OR CANCELLING';
  architectCustomNotify('Stop requested; cancelling the active stage or stopping the managed mock service…');
  send('architectCustomStop',{projectId:activeId,relative:$('architectCustomTarget').value});
  renderArchitectCustomPanel();return;
 }
 const current=architectCustomInfo?.projectId===activeId?architectCustomInfo:null;
 const selected=current?.targets?.find(row=>row.relative===$('architectCustomTarget').value);
 architectCustomBusy=true;architectCustomScanPending=false;architectCustomStage=1;architectCustomAiActive=false;
 architectCustomOperation='VERIFYING REPOSITORY BEFORE APPROVAL';architectCustomLastError='';
 architectCustomSetProgress(2,'Verifying checkout before requesting consent');
 architectCustomNotify('Checking the configured Git checkout and application target. ATGV will request explicit confirmation before running scripts; download the diagnostic log to troubleshoot.');
 renderArchitectCustomPanel();
 send('architectCustomInstallRun',{projectId:activeId,expectedSha:current?.sha||'',
  relative:selected?.relative,previewUrl:selected?$('architectCustomPreviewUrl').value.trim():''});
});
$('architectCustomMockRun').addEventListener('click',()=>{
 if(!activeId||architectCustomBusy||!architectCustomInfo?.ready)return;
 const selected=architectCustomInfo.targets.find(t=>t.relative===$('architectCustomTarget').value);
 if(!selected?.mockable)return;
 architectCustomBusy=true;architectCustomOperation='WAITING FOR VS CODE CONFIRMATION';architectCustomLastError='';
 architectCustomSetProgress(5,'Awaiting approval to launch Mock Preview');
 architectCustomNotify('Confirm Mock Preview in the VS Code dialog; the preview has NOT started yet.');
 renderArchitectCustomPanel();
 send('architectCustomRun',{projectId:activeId,sha:architectCustomInfo.sha,relative:selected.relative,previewUrl:$('architectCustomPreviewUrl').value.trim(),mock:true});
});
$('architectCustomStop').addEventListener('click',()=>{
 if(!activeId||architectCustomBusy||!architectCustomRunning)return;
 architectCustomBusy=true;architectCustomOperation='STOPPING APPLICATION';architectCustomLastError='';
 architectCustomSetProgress(20,'Stopping active localhost process');
 architectCustomNotify('Stopping the ATGV-managed custom application…');
 renderArchitectCustomPanel();
 send('architectCustomStop',{projectId:activeId,relative:$('architectCustomTarget').value});
});
window.addEventListener('message',event=>{
 const m=event.data||{};
 if(!activeId||m.projectId!==activeId)return;
 if(m.scanId&&m.scanId!==architectCustomScanSequence)return; // Ignore stale scan/AI responses.
 if(m.type==='architectCustomStatusResult'){
  architectCustomStatusPending=false;
  architectCustomRuntime={...m.value,projectId:activeId};
  if(!architectCustomBusy)architectCustomRunning=!!m.value?.running;
  renderArchitectCustomPanel();
 }
 if(m.type==='architectCustomScanResult'||m.type==='architectCustomPullResult'||
    m.type==='architectCustomBranchResult'||m.type==='architectCustomInstallResult'){
  architectCustomBusy=false;architectCustomScanPending=false;architectCustomOperation='';architectCustomLastError='';architectCustomAiActive=false;
  architectCustomRunning=!!m.value?.running;
  architectCustomInfo={...m.value,projectId:activeId,previewCustomized:false};
  const text=m.value?.pullMessage||m.value?.branchMessage||
   (m.type==='architectCustomInstallResult'?'Dependencies installed; review the scan findings.':
    'Found '+(m.value?.recognized||0)+' application target(s). Review the detected services and recommended actions.');
  architectCustomNotify(text+' Scan complete does not mean the server is running.','complete');
  architectCustomSetProgress(100,'Repository scan / preparation complete (not server startup)');
  renderArchitectCustomPanel();architectCustomRequestStatus();
 }
 if(m.type==='architectCustomError'){
  architectCustomBusy=false;architectCustomScanPending=false;architectCustomOperation='';architectCustomAiActive=false;
  architectCustomInfo=null;
  architectCustomLastError=String(m.message||'Custom Stack operation failed.').slice(0,250);
  if(m.logAvailable)architectRecordErrorLog(m);
  architectCustomNotify(m.message||'Custom Stack operation failed.','error');
  architectCustomSetProgress(architectCustomProgressPercent,'Operation stopped: review error');
  renderArchitectCustomPanel();architectCustomRequestStatus();
 }
 if(m.type==='architectCustomProgress'){
  if(m.scanId)architectCustomHostResponseAt=Date.now();
  if(Number.isInteger(m.step)&&m.step>=1&&m.step<=6)architectCustomStage=m.step;
  architectCustomAiActive=m.ai===true;
  const message=String(m.message||'Working with custom application…');
  if(m.phase==='preflight')architectCustomOperation='VERIFYING REPOSITORY BEFORE APPROVAL';
  else if(m.phase==='approval'||/waiting for|confirmation|approval/i.test(message))architectCustomOperation='WAITING FOR VS CODE CONFIRMATION';
  else if(/Verifying localhost|health at /i.test(message))architectCustomOperation='VERIFYING LOCALHOST HEALTH';
  else if(/Starting /i.test(message))architectCustomOperation='STARTING APPLICATION';
  else if(/installing|dependencies|npm /i.test(message))architectCustomOperation='INSTALLING DEPENDENCIES';
  else if(architectCustomBusy&&architectCustomOperation!=='WAITING FOR VS CODE CONFIRMATION')architectCustomOperation='PROCESSING CUSTOM STACK';
  architectCustomNotify(message);
  architectCustomSetProgress(m.percent??Math.min(90,architectCustomProgressPercent+5),message);
  renderArchitectCustomPanel();
 }
 if(m.type==='architectCustomAiReviewResult'){
  architectCustomAiActive=false;
  const current=architectCustomInfo?.projectId===activeId?architectCustomInfo:null;
  if(current?.sha===m.sha&&current.analysis){
   current.analysis.modelReview=m.review;
   architectCustomNotify('Repository scan complete. '+(m.review?.label==='Manifest analysis'?'AI advice unavailable; verified manifest findings remain ready.':'AI advisory received; findings and recommended actions updated.'),'complete');
   renderArchitectCustomPanel();
  }
 }
 if(m.type==='architectCustomHandoffProgress'&&m.projectId===activeId){
  architectLastMessage='Custom Stack handoff · '+String(m.message||'Validating application tests and build').slice(-250);
  $('architectApprovalStatus').textContent=architectLastMessage;
  $('architectBootstrapStatus').textContent=architectLastMessage;
 }
 if(m.type==='architectCustomRunResult'){
  architectCustomBusy=false;architectCustomOperation='';architectCustomLastError='';architectCustomAiActive=false;
  architectCustomStage=m.value?.running?7:architectCustomStage;
  if(m.value?.inspection){
   architectCustomInfo={...m.value.inspection,projectId:activeId,previewCustomized:false};
   // Install & Run may promote an older API-only selection to the actual web app.
   // Keep the selected target and Preview URL synchronized with the running UI.
   if(m.value?.frontendUrl){
    $('architectCustomTarget').value=m.value.relative;
    $('architectCustomPreviewUrl').value=m.value.frontendUrl;
   }
  }
  architectCustomRunning=!!m.value?.running;
  if(m.value?.running)architectCustomRuntime={...architectCustomRuntime,projectId:activeId,checked:true,running:true,
    previewUrl:String(m.value.frontendUrl||''),mockPreview:!!m.value.mockPreview,reachable:true};
  architectCustomNotify(m.value?.message||'Custom Stack execution completed.',m.value?.running?'complete':'error');
  architectCustomSetProgress(m.value?.running?100:architectCustomProgressPercent,m.value?.running?'Local preview verified':'Run unsuccessful');
  renderArchitectCustomPanel();architectCustomRequestStatus();
 }
 if(m.type==='architectCustomStopResult'){
  architectCustomBusy=false;architectCustomRunning=false;architectCustomOperation='';architectCustomLastError='';architectCustomAiActive=false;
  architectCustomStage=0;
  architectCustomRuntime={...architectCustomRuntime,projectId:activeId,checked:true,running:false,reachable:null,previewUrl:''};
  architectCustomNotify(m.value?.message||'Custom Stack stopped.','complete');
  architectCustomSetProgress(100,'Custom application stopped');renderArchitectCustomPanel();architectCustomRequestStatus();
 }
});

$('architectStackSelect').addEventListener('change',event=>{
 architectSaveSelectionProjectId=activeId;architectSaveSelectionChanged=true;
 architectStackDraft={projectId:activeId,stackId:event.target.value};
 architectChecklistSession(event.target.value);
 const project=projects.find(p=>p.id===activeId);
 syncArchitectStackButtons(project);
 refreshArchitectStageClasses(project);
 renderArchitectRequirements(project);
 renderArchitectCustomPanel();
 if(event.target.value==='custom'&&activeId){
  architectCustomBusy=false;architectCustomScanPending=false;architectCustomInfo=null;architectCustomRunning=false;architectCustomStage=0;architectCustomAiActive=false;
  architectCustomSetProgress(0,'Ready to scan');
  architectCustomNotify('Choose Save Stack to verify or clone the configured GitHub checkout. Scan Repository for AI-assisted readiness guidance.');
  renderArchitectCustomPanel();
 }
});
$('architectReviewGitChanges').addEventListener('click',()=>{if(activeId&&!architectActionBusy)send('architectReviewGitChanges');});
$('architectResetStack').addEventListener('click',()=>{
 if(!activeId||architectActionBusy)return;
 architectBegin('architectResetStack','Checking checkout and requesting reset confirmation…');
});
$('architectSaveStack').addEventListener('click',()=>{
 if(!$('architectStackSelect').value){architectLastMessage='Choose a technology stack before saving.';$('architectBootstrapStatus').textContent=architectLastMessage;return;}
 if($('architectStackSelect').value==='custom'){
  architectCustomInfo=null;architectCustomRunning=false;
  architectBegin('architectSaveStack','Checking configured project repository folder and cloning GitHub code only when missing or empty…');
 }else architectBegin('architectSaveStack','Checking main, preparing the skeleton, installing, testing, launching and pushing…');
});
$('architectStopInstall').addEventListener('click',()=>{if(architectActionBusy&&architectPendingAction==='architectSaveStack'){$('architectStopInstall').disabled=true;send('architectStopInstall');}});
$('architectDownloadDependencyHistory').addEventListener('click',()=>send('architectDownloadDependencyHistory'));
$('architectTestStack').addEventListener('click',()=>architectBegin('architectTestStack','Testing, building and checking the selected stack…'));
$('architectApproveStack').addEventListener('click',()=>{
 const custom=$('architectStackSelect').value==='custom';
 architectBegin(custom?'architectApproveCustomStack':'architectApproveStack',custom?
  'Validating Custom Stack test/build and preparing a development-only mock handoff…':
  'Approving the tested stack for Developers…');
});

window.addEventListener('message',event=>{
 const msg=event.data||{};
 if(msg.type==='pmJiraAssignableUsersResult')applyJiraAssigneeUsers(msg);
 if(msg.type==='pmJiraAssignableUsersError'&&msg.projectId===activeId&&msg.key===jiraModalKey&&msg.requestId===jiraModalAssigneeRequest){
   const note=document.getElementById('jiraIssueAssigneeStatus');if(note)note.textContent='Assignment unavailable: '+(msg.message||'Refresh Jira and review the user roles.');
   const select=document.getElementById('jiraIssueAssigneeSelect');if(select)select.disabled=true;
 }
 if(msg.type==='pmJiraAssigned'&&msg.projectId===activeId&&msg.key===jiraModalKey&&msg.requestId===jiraModalAssigneeRequest){
   jiraModalAssigneeBusy=false;
   if(msg.cancelled){refreshJiraIssueModal();return;}
   status(msg.changed+' of '+msg.count+' Jira work item(s) assigned and verified'+(msg.excludedCount?' · '+msg.excludedCount+' specialist-role item(s) unchanged':'')+'.');
   refreshJiraIssueModal();searchJiraInventory();
 }
 if(msg.type==='pmJiraAssignmentError'&&msg.projectId===activeId&&msg.key===jiraModalKey&&msg.requestId===jiraModalAssigneeRequest){
   jiraModalAssigneeBusy=false;const note=document.getElementById('jiraIssueAssigneeStatus');
   if(note)note.textContent='Jira assignment failed: '+(msg.message||'Refresh and retry.');
   const select=document.getElementById('jiraIssueAssigneeSelect');if(select)select.disabled=false;
   const apply=document.getElementById('jiraIssueAssigneeApply');if(apply)apply.disabled=false;
 }
 if(msg.type==='roleJiraIssueSaved'&&msg.projectId===activeId&&msg.requestId===jiraModalSaveRequest&&msg.key===jiraModalKey){
   jiraModalSaving=false;
   roleJiraRefreshAfterSave=true;
   $('roleJiraStatus').textContent='Jira issue saved. Refreshing live issue status and BR links…';
   if(!roleJiraLoading){roleJiraRefreshAfterSave=false;loadRoleJiraIssues(true);}
   refreshJiraIssueModal();
   if(msg.warning)status(msg.warning);
   else status(msg.changed?'Jira saved and verified'+(msg.brId?' · '+msg.brId+' marked Updated / Review required':'')+'.':'No Jira changes were needed.');
 }
 if(msg.type==='roleJiraIssueSaveError'&&msg.projectId===activeId&&msg.requestId===jiraModalSaveRequest&&msg.key===jiraModalKey){
   jiraModalSaving=false;
   $('jiraIssueModalSave').disabled=false;$('jiraIssueModalCancelEdit').disabled=false;
   $('jiraIssueEditStatus').textContent='Jira save failed: '+(msg.message||'Refresh the issue before retrying.');
   roleJiraRefreshAfterSave=true;
   if(!roleJiraLoading){roleJiraRefreshAfterSave=false;loadRoleJiraIssues(true);}
 }
 if(msg.type==='roleJiraIssueDetails'&&msg.key===jiraModalKey&&msg.requestId===jiraModalRequest){renderJiraIssueModal(msg.value);}
 if(msg.type==='roleJiraIssueDetailsError'&&msg.key===jiraModalKey&&msg.requestId===jiraModalRequest){$('jiraIssueModalReload').disabled=false;$('jiraIssueModalBody').textContent='Unable to load Jira ticket: '+(msg.message||'Retry or check Jira permissions.');$('jiraIssueModalSubtitle').textContent='Request failed';}
 if(msg.type==='roleJiraIssues'&&msg.projectId===activeId&&msg.requestId===roleJiraRequest){roleJiraLoading=false;roleJiraLoaded=true;renderRoleJiraIssues(msg.items,msg.incomplete);if(roleJiraRefreshAfterSave){roleJiraRefreshAfterSave=false;loadRoleJiraIssues(true);}}
 if(msg.type==='developerTaskDetail'&&msg.projectId===activeId)renderDeveloperTaskDetail(msg.value);
 if(msg.type==='developerArtifactLoaded'&&msg.projectId===activeId)renderDeveloperArtifact(msg.value);
 if(msg.type==='developerDeliveryCancelled'&&msg.projectId===activeId){developerDeliveryBusy=false;$('developerDeliveryVerify').disabled=false;$('developerDeliveryRunChecks').disabled=false;$('developerDeliveryComplete').disabled=true;developerDeliveryProof=null;if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}$('developerDeliveryStatus').textContent='Cancelled. No remote changes were made by this action.';}
 if(msg.type==='developerDeliveryReadiness'&&msg.projectId===activeId)renderDeveloperDeliveryReadiness(msg.value);
 if(msg.type==='developerDeliveryChecks'&&msg.projectId===activeId&&msg.value?.key===developerSelectedTicket){developerDeliveryBusy=false;$('developerDeliveryRunChecks').disabled=false;developerDeliveryProof=null;$('developerDeliveryComplete').disabled=true;if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.checksPassed=!!msg.value?.passed;developerStageEvidence.checksFailed=!msg.value?.passed;developerStageEvidence.verified=false;renderDeveloperWorkflowSteps();}$('developerDeliveryStatus').textContent=msg.value?.passed?'Test and build checks passed. Select applicable artifacts and click Verify Delivery.':'At least one test or build failed. Review the failure evidence and correct the project before retrying.';}
 if(msg.type==='developerDeliveryCompleted'&&msg.projectId===activeId&&msg.value?.key===developerSelectedTicket){developerDeliveryBusy=false;developerDeliveryProof=null;if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.completed=true;developerStageEvidence.checksPassed=true;renderDeveloperWorkflowSteps();}$('developerDeliveryComplete').disabled=true;$('developerDeliveryStatus').textContent=`${msg.value?.key||'Jira ticket'} moved to Done. Report: ${msg.value?.reportPath||''}${msg.value?.confluenceUrl?' · Confluence: '+msg.value.confluenceUrl:''}`;loadRoleJiraIssues(true);}
 if(msg.type==='developerArtifactSaved'&&msg.projectId===activeId){
   const saved=msg.value;developerArtifactDirty=false;$('developerArtifactSave').disabled=false;
   developerDeliveryProof=null;$('developerDeliveryComplete').disabled=true;
   renderDeveloperArtifact(saved);
   if(developerTaskInfo?.key===saved?.key){
     developerTaskInfo.artifacts=developerTaskInfo.artifacts.map(item=>item.type===saved.type?{...item,exists:true}:item);
     const card=Array.from($('developerArtifactCards').children)[Object.keys(developerArtifactLabels).indexOf(saved.type)];
     if(card)card.querySelector('span').textContent='Draft available';
     $('developerArtifactsCount').textContent=developerTaskInfo.artifacts.filter(item=>item.exists).length+' of 5 saved';
   }
   $('developerArtifactMessage').textContent='Artifact draft saved locally. Review and verification are separate.';
 }
 if(msg.type==='developerTaskError'){
   developerTaskLoading=false;$('developerArtifactSave').disabled=false;
   if(String(msg.command||'').startsWith('developerDelivery')){developerDeliveryBusy=false;$('developerDeliveryVerify').disabled=false;$('developerDeliveryRunChecks').disabled=false;$('developerDeliveryComplete').disabled=true;developerDeliveryProof=null;if(developerStageEvidence.key===developerSelectedTicket){developerStageEvidence.verified=false;if(msg.command==='developerDeliveryRunChecks')developerStageEvidence.checksFailed=true;renderDeveloperWorkflowSteps();}$('developerDeliveryStatus').textContent=msg.message||'Delivery operation failed.';}
   if(msg.command==='developerTaskDetail')$('developerTaskStatus').textContent=msg.message||'Unable to load Jira ticket.';
   else $('developerArtifactMessage').textContent=msg.message||'Unable to access artifact.';
 }
 if(msg.type==='roleJiraAssigned'){$('roleJiraStatus').textContent='Assigned '+msg.value.key+' in Jira. Refreshing…';roleJiraLoaded=false;loadRoleJiraIssues(true);if(selectedRole==='software-developer')loadAssignedJiraTasks(true);}
 if(msg.type==='roleJiraUnassigned'){$('roleJiraStatus').textContent='Unassigned '+msg.key+' in Jira. Refreshing…';roleJiraLoaded=false;loadRoleJiraIssues(true);}
 if(msg.type==='roleJiraAssignCancelled'){$('roleJiraStatus').textContent='Assignment cancelled. No changes were made.';renderRoleJiraIssues(roleJiraItems,roleJiraIncomplete);}
 if(msg.type==='roleJiraAssignError'){$('roleJiraStatus').textContent='Assignment failed: '+(msg.message||'Check Jira permissions and refresh.');renderRoleJiraIssues(roleJiraItems,roleJiraIncomplete);$('roleJiraStatus').textContent='Assignment failed: '+(msg.message||'Check Jira permissions and refresh.');}

 if(msg.type==='devCopilotTasks'){assignedJiraLoading=false;assignedJiraLoaded=true;renderAssignedJiraTasks(msg.items,msg.incomplete);}
 if(msg.type==='notice'&&msg.error&&roleJiraLoading){roleJiraLoading=false;roleJiraLoaded=false;$('roleJiraStatus').textContent='Unable to load Jira issues: '+String(msg.message||'Check Jira connection in Settings.');}
 if(msg.type==='notice'&&msg.error&&assignedJiraLoading){assignedJiraLoading=false;assignedJiraLoaded=false;if($('devAssignedJiraStatus'))$('devAssignedJiraStatus').textContent='Unable to load assigned Jira tasks: '+String(msg.message||'Check Jira connection in Settings.');}
 if(msg.type==='developerLocalState'){
  const info=msg.value||{},repo=info.repo||{};
  if($('settingsLocalRepoPath'))$('settingsLocalRepoPath').textContent='Local repository: '+(repo.root||'not selected');
  if($('devRepoStatus'))$('devRepoStatus').textContent=[repo.root||'Not connected',repo.branch?'Branch: '+repo.branch:'No branch',repo.clean?'Clean':'Uncommitted changes',repo.remote||'No origin remote'].join(' · ');
  devSetStep('devStepCodeStatus',repo.root?(repo.branch?'Repository · '+repo.branch:'Repository selected · branch required'):'Choose repository and branch');
  const root=$('devTarget');if(!root)return;
  for(const item of info.targets||[]){const option=document.createElement('option');option.value=item.relative;option.textContent=[item.relative||'Repository root',item.kind,item.scripts?.join(', ')].filter(Boolean).join(' · ');root.append(option);}
  if(!root.options.length){const option=document.createElement('option');option.value='';option.textContent='No supported app detected';root.append(option);}
 }
 if(msg.type==='developerJira'&&$('devJiraInfo')){$('devJiraInfo').textContent=[msg.value.key,msg.value.summary,'Status: '+msg.value.status,'Assignee: '+msg.value.assignee].join(' · ');$('devJiraKey').value=msg.value.key;$('devJiraKey').dataset.updated=msg.value.updated||'';devSetStep('devStepJiraStatus',msg.value.key+' · '+msg.value.status);}
 if(msg.type==='developerJiraAction'){developerStatus(JSON.stringify(msg.value,null,2));send('devLoadJira',{key:read('devJiraKey')});}
 if(msg.type==='developerTransitions'&&$('devTransitionSelect')){const root=$('devTransitionSelect');root.replaceChildren();for(const transition of msg.value.transitions||[]){const option=document.createElement('option');option.value=transition.id;option.textContent=transition.name+' → '+transition.to;root.append(option);}$('devJiraKey').dataset.updated=msg.value.updated||'';}
 if(msg.type==='developerBranch'&&$('opsBranch')){$('opsBranch').value=msg.value.branch;$('devRepoStatus').textContent=`${msg.value.action||'Branch ready'} · ${msg.value.branch} · ${msg.value.root||''}`;devSetStep('devStepCodeStatus','Branch · '+msg.value.branch);developerStatus('Jira '+msg.value.key+' → '+msg.value.branch+'. Run real tests and review code before PR.');send('devInspectRepo');}
 if(msg.type==='developerExecution'){
  const value=msg.value||{};
  developerStatus([msg.operation,value.passed===true?'PASSED':value.passed===false?'FAILED':'',value.message||'',value.head?'Revision: '+value.head:'',value.logs||''].filter(Boolean).join('\n'));
  if(msg.operation==='test')devSetStep('devStepTestStatus',value.passed===true?'Unit tests passed':value.passed===false?'Unit tests failed':'Test result requires review');
 }
 onDeveloperBrMessage(msg);
 if(msg.type==='devCopilotAI'&&msg.value?.key===developerSelectedTicket){
   const proposal=msg.value;
   if(developerStageEvidence.key===developerSelectedTicket&&String(proposal.text||'').trim()){developerStageEvidence.aiReady=true;renderDeveloperWorkflowSteps();}
   $('developerAiDraftPanel').classList.remove('hidden');
   $('developerAiDraftContent').textContent=String(proposal.text||'No text returned from the AI provider.');
   $('developerAiDraftStatus').textContent='Reviewable draft · '+(proposal.model||'AI')+' · '+proposal.branch+' · No source files changed';
 }
 if(msg.type==='devCopilotStartResult'&&msg.value?.key===developerSelectedTicket){
   developerAiBusy=false;$('developerTaskRefresh').disabled=false;renderDeveloperWorkflowSteps();
   if(!$('developerAiDraftContent').textContent.trim())$('developerAiDraftStatus').textContent='Development branch created, but no AI proposal was returned.';
 }
 if((msg.type==='devCopilotStartError'||msg.type==='devCopilotStartCancelled')&&msg.key===developerSelectedTicket){
   $('developerAiDraftPanel').classList.remove('hidden');
   finishDeveloperAi((msg.type==='devCopilotStartError'?'AI Development failed: ':'')+String(msg.message||'Action cancelled.'));
 }
 if(msg.type==='architectServerStatus'&&msg.projectId===activeId){
   const requestId=Number(msg.requestId)||0;
   if(!architectServerBusy&&requestId>=architectServerStatusAccepted){architectServerStatusAccepted=requestId;architectServerSnapshot=msg.value||{running:false};architectServerSnapshotProjectId=msg.projectId;const active=projects.find(p=>p.id===activeId);updateArchitectServerControls(!!active?.techStackPrepared);syncArchitectStackButtons(active);renderArchitectRequirements(active);refreshArchitectStageClasses(active);}
 }
 if(msg.type==='architectServerState'&&msg.projectId===activeId){
   architectServerStatusAccepted=architectServerStatusRequest+1;
   architectServerBusy=false;architectServerSnapshot=msg.value||{running:false};architectServerSnapshotProjectId=msg.projectId;
   updateArchitectServerControls(!!projects.find(p=>p.id===activeId)?.techStackPrepared);syncArchitectStackButtons(projects.find(p=>p.id===activeId));renderArchitectRequirements(projects.find(p=>p.id===activeId));refreshArchitectStageClasses(projects.find(p=>p.id===activeId));
   // Fetch the actual managed-process state after the Save/Run/Stop render cycle.
   if(activeId)send('architectServerStatus',{requestId:++architectServerStatusRequest});
 }
 if(msg.type==='architectServerError'&&msg.projectId===activeId){
   if(msg.logAvailable)architectRecordErrorLog(msg);
   architectServerBusy=false;architectServerSnapshot={...architectServerSnapshot,message:'Server action failed: '+(msg.message||'Check local app logs.')};architectServerSnapshotProjectId=msg.projectId;send('architectServerStatus',{requestId:++architectServerStatusRequest});
   updateArchitectServerControls(!!projects.find(p=>p.id===activeId)?.techStackPrepared);syncArchitectStackButtons(projects.find(p=>p.id===activeId));renderArchitectRequirements(projects.find(p=>p.id===activeId));refreshArchitectStageClasses(projects.find(p=>p.id===activeId));
 }
 if(msg.type==='architectErrorLogSaved'&&msg.projectId===activeId){$('architectBootstrapStatus').textContent=msg.message||'Error log saved.';}
 if(msg.type==='architectStackProgress'&&msg.projectId===activeId){architectLastMessage=msg.message||'Preparing stack…';$('architectBootstrapStatus').textContent=architectLastMessage;architectChecklistAdvance(architectLastMessage);}
 if(msg.type==='architectStackState'){
   const info=msg.value||{};if(info.message){architectLastMessage=info.message;$('architectApprovalStatus').textContent=info.message;$('architectBootstrapStatus').textContent=info.message;}
   const live=architectChecklistSession($('architectStackSelect').value);
   if(architectPendingAction==='architectSaveStack'&&$('architectStackSelect').value!=='custom')
     for(const id of ['git','toolchain','scaffold','api','orm','sqlite','dependencies','tests','build','server','push'])live.completed.add(id);
   if(architectPendingAction==='architectTestStack')for(const id of ['dependencies','tests','build','server'])live.completed.add(id);
   if(['architectSaveStack','architectTestStack'].includes(architectPendingAction)){
     const current=techStacks.find(item=>item.id===$('architectStackSelect').value);
     for(let i=0;i<(current?.dependencyPackages?.length||0);i++)live.completed.add('package:'+i);
   }
   if(['architectApproveStack','architectApproveCustomStack'].includes(architectPendingAction))live.completed.add('approval');
   if(architectPendingAction==='architectResetStack'){
     live.completed.clear();
     architectStackDraft={projectId:activeId,stackId:''};
     $('architectStackSelect').value='';
   }
   if(architectPendingAction==='architectSaveStack'&&architectSavePendingSelection?.projectId===activeId&&
      architectSavePendingSelection.stackId===$('architectStackSelect').value){
      architectSaveSelectionProjectId=activeId;architectSaveSelectionChanged=false;
   }
   architectSavePendingSelection=null;
   live.active='';live.failed='';architectPendingAction='';
   $('architectStopInstall').disabled=true;architectActionBusy=false;renderRoleWork();
 }
 if(msg.type==='architectStackCancelled'||msg.type==='architectStackError'){
   if(msg.type==='architectStackError'&&msg.logAvailable)architectRecordErrorLog(msg);
   const live=architectChecklistSession($('architectStackSelect').value);
   if(msg.type==='architectStackError')live.failed=msg.failedStep||live.active||'dependencies';
   live.active='';architectPendingAction='';architectActionBusy=false;architectSavePendingSelection=null;$('architectStopInstall').disabled=true;
   architectLastMessage=(msg.type==='architectStackCancelled'?'':'Stack action failed: ')+(msg.message||'');
   renderArchitectRequirements(projects.find(p=>p.id===activeId));
   $('architectBootstrapStatus').textContent=architectLastMessage;
   syncArchitectStackButtons(projects.find(p=>p.id===activeId));renderArchitectRequirements(projects.find(p=>p.id===activeId));
 }
 if(msg.type==='architectureRecommendation'&&$('architectBootstrapStatus'))$('architectBootstrapStatus').textContent=msg.value;
 if(msg.type==='architectureBootstrapResult'){
  architectActionBusy=false;architectPendingAction='';$('architectStopInstall').disabled=true;
  architectChecklistSession($('architectStackSelect').value).active='';
  architectLastMessage=msg.value?.message||'Saved technology stack.';
  $('architectBootstrapStatus').textContent=architectLastMessage;
  syncArchitectStackButtons(projects.find(p=>p.id===activeId));renderArchitectRequirements(projects.find(p=>p.id===activeId));
 }
});



// ATGV first-run setup lives on the Start page. The upgrade modal below is
// reserved exclusively for VSIX releases, not catalog or setup notifications.
const startupFieldMap={jiraUrl:'startupJiraUrl',email:'startupEmail',githubUrl:'startupGithubUrl',
 projectRepository:'startupProjectRepository'};
let startupFormInitialized=false,startupPrereqRequested=false,startupConnectionVerified=false,startupSetupRequired=true,startupReturnToConnections=false;
let startupConnectionEditSnapshot=null;
let startupConnectionCheckSequence=0,startupConnectionCheckPending=false,startupConnectionHealthError=false;
const startupConnectionCheckResults=new Map();
const STARTUP_CONNECTION_CHECK_LABELS=[
 ['jira','Jira API'],['confluence','Confluence API'],['github','GitHub account'],['organization','GitHub organization'],
 ['extension','Extension · read required / write optional'],['library','Library · read required / write optional'],
 ['extension-releases','Extension releases · optional'],['library-releases','Library releases · optional']
];
let startupVerifying=false,startupScanComplete=false,startupPage=0,startupInstallingModule='';
let startupLastInstalledTool='';
let startupStackData=null,startupOpenStackId='',startupStackPriorFocus=null;
let startupCopilotBusy=false,startupCopilotModalOpen=false,startupCopilotPriorFocus=null;
let startupPermissions=null,startupProceedMode='';
const startupStackProgress=new Map();
const startupPermissionProgress=new Map();
const STARTUP_STACKS=[['react','ReactJS'],['angular','Angular'],['nestjs','NestJS'],['dotnet','.NET'],['spring-boot','Spring Boot']];
const STARTUP_STACK_NAMES=STARTUP_STACKS.map(([,name])=>name);
function setStartupCopilotStatus(state,message){
 startupCopilotBusy=state==='working';
 const button=$('startupCopilotSetup');button.disabled=startupCopilotBusy||state==='ready'||state==='unsupported';
 button.textContent=startupCopilotBusy?'Setting up…':state==='ready'?'Installed':state==='error'?'Retry Setup':'Set up Copilot SDK';
 $('startupCopilotStatus').textContent=message;
 $('startupCopilotStatus').className='startup-copilot-status '+(state==='ready'?'success':state==='error'||state==='unsupported'?'error':'muted');
 const card=$('startupCopilotCard'),badge=$('startupCopilotBadge');
 badge.textContent=startupCopilotBusy?'Setting up…':state==='ready'?'Ready':state==='unsupported'?'Update required':state==='error'?'Setup failed':'Needs setup';
 card.classList.toggle('is-ready',state==='ready');card.classList.toggle('is-missing',state==='error'||state==='unsupported'||state==='available');
 card.setAttribute('aria-label','GitHub Copilot SDK: '+badge.textContent);
 if(typeof startupRing==='function'&&!card._atgvProgress)startupRing(card);
 if(typeof paintStartupStack==='function')paintStartupStack(card,{id:'copilot-sdk',name:'GitHub Copilot SDK',percent:state==='ready'?100:state==='working'?45:0,status:state==='ready'?'complete':state==='working'?'running':'error',message:badge.textContent});
 if(typeof updateStartupIssueSummary==='function')updateStartupIssueSummary();
}
function openStartupCopilotModal(){
 startupCopilotPriorFocus=document.activeElement;startupCopilotModalOpen=true;
 $('startupCopilotModal').classList.remove('hidden');$('startupCopilotModal').setAttribute('aria-hidden','false');$('startupCopilotClose').focus();
}
function closeStartupCopilotModal(){
 if(!startupCopilotModalOpen)return;startupCopilotModalOpen=false;
 $('startupCopilotModal').classList.add('hidden');$('startupCopilotModal').setAttribute('aria-hidden','true');
 const previous=startupCopilotPriorFocus;startupCopilotPriorFocus=null;if(previous?.isConnected)previous.focus();
}
function renderStartupCopilotReadiness(info){
 if(startupCopilotBusy)return;
 if(info?.compatible===false){setStartupCopilotStatus('unsupported','Update VS Code to use a supported Node.js runtime for the Copilot SDK.');return;}
 if(info?.installed){setStartupCopilotStatus('ready','Copilot SDK '+(info.version||'')+' installed. Sign in to Copilot CLI; select Microsoft Copilot SDK in Settings to use it for AI.');return;}
 setStartupCopilotStatus('available',info?.unknown?'Status unavailable. Select Set up Copilot SDK to check and install.':'SDK not installed. Setup downloads it into ATGV extension storage.');
}
function startupScanPercent(percent,message){
 const value=Math.max(0,Math.min(100,Number(percent)||0));
 $('startupScanToolFill').style.background='conic-gradient(var(--atgv-accent) '+value+'%, var(--vscode-panel-border) 0)';
 $('startupScanToolPercent').textContent=value+'%';
 $('startupScanToolTrack').setAttribute('aria-valuenow',String(value));
 $('startupScanToolTrack').setAttribute('aria-valuetext',String(message||'Checking tools'));
 $('startupScanToolName').textContent=message||'Checking tools…';
}
function updateStartupIssueSummary(){
 const node=$('startupScanSummaryIssues');if(!node)return;
 const checks=startupPermissions?.checks||[...startupPermissionProgress.values()];
 const permissionIssues=checks.filter(check=>check.ok===false).length;
 const stackIssues=startupScanComplete?(startupStackData?.stacks||[]).filter(stack=>!stack.ready).length:0;
 const copilotIssue=0; // Optional hidden SDK must not count as a blocking startup issue.
 const connectionIssues=[...startupConnectionCheckResults.values()].filter(check=>check.state==='error'||check.state==='offline').length;
 const count=permissionIssues+stackIssues+copilotIssue+connectionIssues;
 node.textContent=count?`${count} ${count===1?'check needs':'checks need'} attention`:'';
}
function startupRing(card){
 const ring=document.createElement('span');ring.className='atgv-stack-ring';ring.setAttribute('role','progressbar');
 ring.setAttribute('aria-valuemin','0');ring.setAttribute('aria-valuemax','100');
 const fill=document.createElement('span');fill.className='atgv-stack-ring-fill';
 const number=document.createElement('strong');number.textContent='0%';ring.append(fill,number);card.append(ring);
 card._atgvProgress={ring,fill,number};
}
function paintStartupStack(card,event){
 const value=Math.max(0,Math.min(100,Number(event?.percent)||0)),state=event?.status||'running';
 const indicator=card._atgvProgress;if(!indicator)return;
 const color=state==='error'?'var(--vscode-testing-iconFailed, var(--vscode-errorForeground))':state==='complete'?'var(--vscode-testing-iconPassed)':'var(--atgv-accent)';
 indicator.fill.style.background='conic-gradient('+color+' '+value+'%, var(--vscode-panel-border) 0)';
 indicator.number.textContent=state==='error'?'!':value+'%';indicator.ring.setAttribute('aria-valuenow',String(value));
 indicator.ring.setAttribute('aria-valuetext',String(event?.message||'Checking prerequisites'));
 indicator.ring.setAttribute('aria-label',String(event?.name||card.dataset.stackId||'Technology stack')+' prerequisites');
 card.dataset.progressState=state;
}
function updateStartupStackProgress(event){
 if(!event?.id)return;
 const prior=startupStackProgress.get(event.id);if(prior?.status==='error')return;
 startupStackProgress.set(event.id,event);
 const card=[...$('startupStackGrid').children].find(item=>item.dataset.stackId===event.id);
 if(card)paintStartupStack(card,event);
}
function renderStartupScanPlaceholders(){
 const grid=$('startupStackGrid');
 grid.replaceChildren();startupStackProgress.clear();
 for(const [id,name] of STARTUP_STACKS){
  const card=document.createElement('div');card.className='atgv-startup-stack atgv-stack-pending';
  card.dataset.stackId=id;startupRing(card);paintStartupStack(card,{id,name,status:'running',percent:0});
  const label=document.createElement('strong');label.textContent=name;
  const status=document.createElement('small');status.textContent='Checking prerequisites…';
  card.append(label,status);grid.append(card);
 }
}
function startupPayload(){return Object.fromEntries(Object.entries(startupFieldMap).map(([key,id])=>[key,$(id).value.trim()]));}
function updateStartupRepositoryPreview(){
 // Keep the connection field and value for validation, but never display the repository URL.
 const preview=$('startupProjectRepositoryPreview');
 if(preview){preview.textContent='';preview.hidden=true;}
}
// Display only the current sequential check. Successful checks vanish immediately;
// retain a failed/offline check until it is fixed, but never show idle cards.
function visibleStartupConnectionCheck(){
 const checks=[...startupConnectionCheckResults.values()];
 return checks.find(check=>check.state==='pending')||
  checks.find(check=>check.state==='error'||check.state==='offline')||null;
}
function renderStartupConnectionProgress(){
 const el=$('startupConnectionProgress');if(!el)return;
 el.replaceChildren();
 const check=visibleStartupConnectionCheck();
 for(const current of check?[check]:[]){
  const row=document.createElement('div');row.className='atgv-connection-progress-item';
  row.dataset.state=current.state;
  const head=document.createElement('div');head.className='atgv-connection-progress-head';
  const name=document.createElement('strong');name.textContent=current.label;
  const status=document.createElement('span');
  status.textContent=current.state==='ok'?'Successful':current.state==='error'?'Failed':current.state==='pending'?'Checking…':'Waiting';
  head.append(name,status);
  const track=document.createElement('div');track.className='atgv-connection-progress-track';
  track.setAttribute('role','progressbar');track.setAttribute('aria-label',current.label);
  track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
  if(current.state!=='pending')track.setAttribute('aria-valuenow',current.state==='idle'?'0':'100');
  const fill=document.createElement('div');fill.className='atgv-connection-progress-fill';
  track.append(fill);
  const details=document.createElement('small');details.textContent=current.state==='ok'||current.state==='error'?current.message||'':current.url||'';
  row.append(head,track,details);el.append(row);
 }
}
function renderStartupConnectionChecks(){
 const list=$('startupConnectionChecks');
 const expanded=new Set([...list.querySelectorAll('details[open]')].map(row=>row.dataset.checkId));
 list.replaceChildren();
 for(const check of [visibleStartupConnectionCheck()].filter(Boolean)){
  const item=document.createElement('details');item.className='atgv-permission-row atgv-connection-check';item.dataset.checkId=check.id;
  item.dataset.state=check.state==='ok'?'ready':check.state==='error'||check.state==='offline'?'error':'pending';item.open=expanded.has(check.id);
  const summary=document.createElement('summary');summary.className='atgv-permission-step';
  const label=document.createElement('strong');label.className='atgv-permission-label';label.textContent=check.label;summary.append(label);
  startupRing(summary);
  const status=check.state==='ok'?'Ready':check.state==='pending'?'Checking':check.state==='offline'?'Offline':check.state==='error'?'Needs attention':'Not checked';
  paintStartupStack(summary,{name:check.label,status:check.state==='ok'?'complete':check.state==='error'||check.state==='offline'?'error':check.state==='idle'?'idle':'running',percent:check.state==='ok'?100:0,message:check.message});
  const badge=document.createElement('span');badge.className='atgv-permission-status';badge.textContent=status;summary.append(badge);
  const detail=document.createElement('p');detail.className='atgv-permission-detail';detail.textContent=check.message+(check.url?' '+check.url:'');
  item.append(summary,detail);list.append(item);
 }
 updateStartupIssueSummary();
 renderStartupConnectionProgress();
}
function renderStartupConnectionLog(entries){
 const root=$('startupConnectionLogList');
 if(!root)return;
 const rows=(Array.isArray(entries)?entries:[]).slice(0,80);
 const errors=rows.filter(row=>/^(error|failed|offline|not-saved|needs-attention)$/i.test(String(row.status||''))).length;
 $('startupConnectionLogCount').textContent=rows.length?errors+' issue(s) · '+rows.length+' recent event(s)':'No events recorded';
 root.replaceChildren();
 if(!rows.length){
  const empty=document.createElement('p');empty.className='muted';
  empty.textContent='No connection checks or errors recorded yet.';root.append(empty);return;
 }
 for(const event of rows){
  const card=document.createElement('div');card.className='atgv-connection-log-entry';
  const status=String(event.status||'unknown').toLowerCase();
  card.dataset.status=status;
  const heading=document.createElement('div');heading.className='atgv-connection-log-heading';
  const name=document.createElement('strong');name.textContent=String(event.tool||'Connection').slice(0,80);
  const badge=document.createElement('span');badge.className='atgv-connection-log-status';badge.textContent=status;
  const time=document.createElement('time');time.className='muted';time.dateTime=String(event.time||'');
  const stamp=new Date(event.time);time.textContent=Number.isFinite(stamp.getTime())?stamp.toLocaleString():String(event.time||'Unknown time');
  heading.append(name,badge,time);
  const detail=document.createElement('p');detail.textContent=String(event.detail||'No additional details.').slice(0,450);
  card.append(heading,detail);
  const meta=[event.host,Number.isFinite(event.durationMs)?event.durationMs+' ms':''].filter(Boolean).join(' · ');
  if(meta){const info=document.createElement('small');info.className='muted';info.textContent=meta;card.append(info);}
  root.append(card);
 }
}
function resetStartupConnectionChecks(){
 startupConnectionCheckResults.clear();
 for(const [id,label] of STARTUP_CONNECTION_CHECK_LABELS)startupConnectionCheckResults.set(id,{id,label,state:'idle',message:'Test and save connections to check this service.'});
 renderStartupConnectionChecks();
}
function beginStartupConnectionChecks(){
 startupConnectionCheckPending=true;startupConnectionCheckResults.clear();
 for(const [id,label] of STARTUP_CONNECTION_CHECK_LABELS)
  startupConnectionCheckResults.set(id,{id,label,state:'idle',message:'Waiting for sequential verification…'});
 renderStartupConnectionChecks();return ++startupConnectionCheckSequence;
}
function checkSavedStartupConnections(){
 if(!startupConnectionVerified||startupVerifying||startupConnectionCheckPending||startupProceedMode)return;
 startupConnectionHealthError=false;
 $('startupConnectionMessage').textContent='Checking saved Jira, Confluence and GitHub connections…';
 $('startupConnectionMessage').className='test-status';
 send('startupCheckConnections',{settings:startupPayload(),requestId:beginStartupConnectionChecks()});
 renderStartupPage();
}
function renderStartupPermissionRows(checks){
 const root=$('startupPermissionChecks');
 const expanded=new Set([...root.querySelectorAll('.atgv-permission-row[open]')].map(row=>row.dataset.checkId));
 root.replaceChildren();
 const shortLabels={workspace:'Workspace',folders:'Project folders',extension:'Extension',library:'SDLC Library'};
 for(const check of checks||[]){
  const row=document.createElement('details');row.className='atgv-permission-row';row.dataset.state=check.ok?'ready':'error';row.dataset.checkId=String(check.id||'');row.open=expanded.has(row.dataset.checkId);
  const summary=document.createElement('summary');summary.className='atgv-permission-step';
  const title=document.createElement('strong');title.className='atgv-permission-label';title.textContent=shortLabels[check.id]||String(check.label||'Permission');summary.append(title);
  startupRing(summary);
  paintStartupStack(summary,{name:check.label||'Permission',status:check.ok?'complete':'error',percent:check.ok?100:0,message:check.detail||''});
  const status=document.createElement('span');status.className='atgv-permission-status';status.textContent=check.ok?'Ready':'Needs attention';summary.append(status);
  const detail=document.createElement('p');detail.className='atgv-permission-detail';detail.textContent=String(check.detail||'No additional details.');row.append(summary,detail);root.append(row);
 }
 updateStartupIssueSummary();
}
function renderStartupPermissions(result){
 startupPermissions=result;renderStartupPermissionRows(result?.checks||[]);
}
function renderStartupPage(){
 if(!startupSetupRequired)return;
 if(startupPage!==0&&startupOpenStackId)closeStartupStackModal();
 if(startupPage!==0&&startupCopilotModalOpen)closeStartupCopilotModal();
 // Saved connections remain read-only until the user chooses Edit.
 const busy=startupVerifying||!!startupProceedMode;
 $('startupTestConnections').disabled=busy||startupConnectionVerified;
 $('startupTestConnections').classList.toggle('hidden',startupConnectionVerified);
 $('startupTestSavedConnections').disabled=busy||startupConnectionCheckPending||!startupConnectionVerified;
 $('startupTestSavedConnections').classList.toggle('hidden',!startupConnectionVerified);
 for(const id of [...Object.values(startupFieldMap),'startupAtlassianToken','startupGithubToken'])
  $(id).disabled=busy||startupConnectionVerified;
 const editButton=$('startupEditConnections');
 editButton.classList.toggle('hidden',!startupConnectionVerified&&!startupConnectionEditSnapshot);
 editButton.disabled=busy;
 editButton.textContent=startupConnectionEditSnapshot?'Cancel':'Edit';
 editButton.setAttribute('aria-label',startupConnectionEditSnapshot?'Cancel editing connections':'Edit Atlassian and GitHub connections');
 $('startupComputerCard').classList.toggle('hidden',startupPage!==0);
 $('startupConnectionForm').classList.toggle('hidden',startupPage!==1);
 $('startupPrevious').classList.toggle('hidden',startupPage===0);
 $('startupUnifiedLog').classList.toggle('hidden',startupPage!==0);
 $('startupPrevious').disabled=startupPage===0||busy||!!startupInstallingModule;
 $('startupProceed').disabled=busy||!!startupInstallingModule||(startupPage===0?!startupScanComplete:!startupConnectionVerified);
 $('startupProceed').textContent=startupPage===0&&!startupConnectionVerified?'Next →':'Next: Search Project →';
 $('startupProceedInfo').textContent=startupProceedMode?'Opening project search…':
  startupPage===0?(startupScanComplete?'Review available modules, then select Next.':'Checking computer prerequisites…'):
  startupConnectionCheckPending?'Testing saved connections…':
  startupConnectionHealthError&&startupConnectionVerified?'Open Connection Logs to review the latest test.':
  startupConnectionVerified?'Connections verified. Select Next to search projects.':'Test & Save Connections to enable Next.';
}
function showStartupStep(required){
 if(!required&&startupOpenStackId)closeStartupStackModal();
 if(!required&&startupCopilotModalOpen)closeStartupCopilotModal();
 startupSetupRequired=required;
 $('startupSetup').classList.toggle('hidden',!required);
 $('gateFinder').classList.toggle('hidden',required);
 if(required)renderStartupPage();
}
function requestStartupReadiness(){
 if(startupPrereqRequested)return;
 startupPrereqRequested=true;
 startupScanPercent(0,'Starting prerequisite scan…');
 renderStartupScanPlaceholders();
 send('startupReadiness');
}
function requestStartupProceed(autoResume=false){
 if(startupProceedMode)return;
 startupProceedMode=autoResume?'resume':'manual';
 if(!autoResume)renderStartupPage();
 send('startupProceed',{settings:startupPayload(),autoResume});
}
function renderStartupConfig(config){
 if(!config||startupProceedMode==='resume')return;
 // Keep an in-flight or opened project visible across state refreshes.
 const openingInProgress=gateBusy||!!gateError||workspaceOpened||(opening?.phase&&opening.phase!=='search');
 const required=config.required===true&&!openingInProgress;
 if(!startupFormInitialized){
  const saved=config.saved||{},defaults=config.defaults||{};
  updateHeaderUserName(saved.email||extensionSettings.jira?.email);
  for(const [key,id] of Object.entries(startupFieldMap))$(id).value=saved[key]||defaults[key]||'';
  $('startupGithubUrl').value=$('startupGithubUrl').value.replace(/^https?:\/\//i,'');
  updateStartupRepositoryPreview();
  startupConnectionVerified=config.verified===true;
  resetStartupConnectionChecks();
  startupFormInitialized=true;
  if(config.prerequisitesVerified){
   startupPage=1;
   if(required&&startupConnectionVerified){requestStartupProceed(true);return;}
  }
 }else if(config.verified===true&&!startupConnectionEditSnapshot&&!startupVerifying){
  startupConnectionVerified=true;
 }
 if(startupConnectionVerified&&!startupConnectionHealthError&&!startupConnectionCheckPending){
  $('startupConnectionMessage').textContent='Jira, Confluence and GitHub connections already verified and saved.';
  $('startupConnectionMessage').className='test-status success';
 }
 showStartupStep(required||startupReturnToConnections);
 if(required&&startupPage===0)requestStartupReadiness();
}
function renderStartupStackReadiness(result){
 const grid=$('startupStackGrid');grid.replaceChildren();
 if(!result||!Array.isArray(result.stacks)){
  startupStackData=null;if(startupOpenStackId)closeStartupStackModal();
  startupScanComplete=false;$('startupToolMessage').textContent='Unable to scan computer prerequisites. Select Refresh to retry.';
  renderStartupPage();return;
 }
 startupStackData=result;startupScanComplete=true;
 if(result.copilotSdk)renderStartupCopilotReadiness(result.copilotSdk);
 startupScanPercent(100,'Completed prerequisite scans for all '+result.stacks.length+' technology stacks.');
 const ready=result.stacks.filter(s=>s.ready).length;
 $('startupToolMessage').textContent=`${ready} of ${result.stacks.length} technology stacks have their required host tools available. `+(result.catalog?.available?`Project modules loaded from ${result.catalog.source}${result.catalog.version?' v'+result.catalog.version:''}.`:'Project module lists are unavailable until the SDLC Library is connected.');
 for(const stack of result.stacks){
  const card=document.createElement('button');card.type='button';card.className='atgv-startup-stack atgv-startup-stack-button atgv-stack-ring-card '+(stack.ready?'is-ready':'is-missing');card.dataset.stackId=stack.id;
  card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-controls','startupStackModal');
  const title=document.createElement('span');title.textContent=stack.name;
  const badge=document.createElement('span');badge.className='atgv-stack-ready';badge.textContent=stack.hostRequirementsUnknown?'Unavailable':stack.ready?'Ready':'Needs tools';
  card.setAttribute('aria-label',stack.name+': '+badge.textContent+'. View host tools and project modules');
  card.append(title);startupRing(card);card.append(badge);
  paintStartupStack(card,startupStackProgress.get(stack.id)||{name:stack.name,status:stack.ready?'complete':'error',percent:stack.ready?100:0,message:badge.textContent});
  card.addEventListener('click',()=>openStartupStackModal(stack.id,card));grid.append(card);
 }
 if(typeof updateStartupIssueSummary==='function')updateStartupIssueSummary();
 if(startupOpenStackId){
  const stack=result.stacks.find(item=>item.id===startupOpenStackId);
  if(stack){const content=$('startupStackModalContent'),scrollTop=content.scrollTop;renderStartupStackDetails(stack);content.scrollTop=scrollTop;}
  else closeStartupStackModal();
 }
 renderStartupPage();
}
function setStartupInstallFeedback(message,state='muted'){
 for(const id of ['startupInstallFeedback','startupStackModalFeedback']){
  $(id).textContent=message;$(id).className='atgv-startup-install-feedback '+state;
 }
}
function openStartupStackModal(id,origin){
 const stack=startupStackData?.stacks.find(item=>item.id===id);if(!stack)return;
 startupOpenStackId=id;startupStackPriorFocus=origin||document.activeElement;
 $('startupStackModalTitle').textContent=stack.name+' requirements';
 $('startupStackModalContent').scrollTop=0;renderStartupStackDetails(stack);
 $('startupStackModalFeedback').textContent=$('startupInstallFeedback').textContent;
 $('startupStackModalFeedback').className=$('startupInstallFeedback').className;
 $('startupStackModal').classList.remove('hidden');$('startupStackModal').setAttribute('aria-hidden','false');
 $('startupStackModalClose').focus();
}
function closeStartupStackModal(){
 const id=startupOpenStackId;if(!id)return;startupOpenStackId='';
 $('startupStackModal').classList.add('hidden');$('startupStackModal').setAttribute('aria-hidden','true');
 const card=[...$('startupStackGrid').querySelectorAll('.atgv-startup-stack-button')].find(item=>item.dataset.stackId===id);
 const previous=startupStackPriorFocus;startupStackPriorFocus=null;
 if(card)card.focus();else if(previous?.isConnected)previous.focus();
}
function renderStartupStackDetails(stack){
 const content=$('startupStackModalContent');content.replaceChildren();
 $('startupStackModalTitle').textContent=stack.name+' requirements';
 const required=(stack.components||[]).filter(c=>c.required),compatible=required.filter(c=>c.compatible).length;
 const readiness=document.createElement('div');readiness.className='atgv-stack-prerequisite-progress';
 const count=document.createElement('small');count.textContent=stack.hostRequirementsUnknown?'Host requirements are not defined for this stack.':compatible+'/'+required.length+' required host tools available';
 const track=document.createElement('div');track.className='workspace-search-track';track.setAttribute('role','progressbar');
 track.setAttribute('aria-label',stack.name+' prerequisite readiness');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
 const value=required.length?Math.round(100*compatible/required.length):0;track.setAttribute('aria-valuenow',String(value));
 const fill=document.createElement('div');fill.className='workspace-search-fill';fill.style.width=value+'%';track.append(fill);readiness.append(count,track);content.append(readiness);
 const hostTitle=document.createElement('h4');hostTitle.className='startup-stack-section-title';hostTitle.textContent='Host tools';content.append(hostTitle);
 const list=document.createElement('ul');list.className='startup-stack-host-tools';
 for(const component of stack.components||[]){
  const item=document.createElement('li');item.className='atgv-module-row';
  const description=document.createElement('div');description.className='atgv-module-description';
  const label=document.createElement('span');label.textContent=component.id+(component.required?'':' (optional)');
  const indicator=document.createElement('small');indicator.textContent=component.installed?(component.compatible?'Installed · ':'Version too old · ')+(component.version||'Detected'):'Not installed'+(component.minimum?' · requires '+component.minimum:'');
  description.append(label,indicator);item.append(description);
  if(!component.compatible){
   const button=document.createElement('button');button.type='button';button.className='secondary atgv-module-install';button.textContent=startupInstallingModule===component.id?'Installing…':'Install';
   button.disabled=!!startupInstallingModule;
   button.setAttribute('aria-label',`Install ${component.id} prerequisite`);
   button.addEventListener('click',()=>{
    if(startupInstallingModule)return;
    startupInstallingModule=component.id;startupLastInstalledTool=component.id;button.disabled=true;button.textContent='Installing…';
    for(const control of content.querySelectorAll('.atgv-module-install'))control.disabled=true;
    setStartupInstallFeedback('Preparing '+component.id+' installer. Confirmation is required before modifying the computer.');
    const progress=document.createElement('progress');progress.className='atgv-module-progress';progress.setAttribute('aria-label',`${component.id} installation in progress`);progress.max=100;
    description.append(progress);renderStartupPage();
    $('startupToolMessage').textContent=`Preparing ${component.id} installation…`;
    send('startupInstallModule',{id:component.id});
   });
   item.append(button);
  }
  list.append(item);
 }
 content.append(list);
 const packages=Array.isArray(stack.dependencyPackages)?stack.dependencyPackages:[];
 const packagesTitle=document.createElement('h4');packagesTitle.className='startup-stack-section-title';packagesTitle.textContent='Project modules'+(stack.catalogStatus==='available'?' · '+packages.length:'');content.append(packagesTitle);
 const note=document.createElement('p');note.className='muted startup-stack-package-note';
 if(stack.catalogStatus==='not-listed')note.textContent='This stack is not listed in the active SDLC Library.';
 else if(stack.catalogStatus!=='available')note.textContent='Connect the SDLC Library, then return here and select Refresh to load its project modules.';
 else if(!packages.length)note.textContent='No direct project packages are declared in the library scaffold.';
 else note.textContent='Direct dependencies from the SDLC Library. They are installed or restored in the project when the Solution Architect saves the stack; transitive packages are resolved by the package manager.';
 content.append(note);
 for(const engine of stack.nodeEngines||[]){const line=document.createElement('p');line.className='muted startup-stack-package-note';line.textContent='Node.js requirement: '+engine.range+' · '+engine.source;content.append(line);}
 if(packages.length){
  const packageList=document.createElement('ul');packageList.className='startup-stack-packages';packageList.setAttribute('aria-label',stack.name+' project modules');
  for(const component of packages){
   const item=document.createElement('li');item.className='startup-stack-package';
   const title=document.createElement('span');title.textContent=component.name;
   const meta=document.createElement('small');meta.textContent=[component.manager,component.scope,component.version||'version managed by project',component.source].filter(Boolean).join(' · ');
   item.append(title,meta);packageList.append(item);
  }
  content.append(packageList);
 }
}
function invalidateStartupConnection(){
 if(!startupSetupRequired)return;
 startupConnectionVerified=false;
 $('startupConnectionMessage').textContent='Connection settings changed. Test and save again before proceeding.';
 renderStartupPage();
}
function toggleStartupConnectionEdit(){
 if(startupVerifying||startupProceedMode)return;
 if(startupConnectionEditSnapshot){
  for(const [key,id] of Object.entries(startupFieldMap))$(id).value=startupConnectionEditSnapshot[key];
  $('startupAtlassianToken').value='';$('startupGithubToken').value='';
  startupConnectionEditSnapshot=null;startupConnectionVerified=true;
  updateHeaderUserName(read('startupEmail'));
  $('startupConnectionMessage').textContent='Changes discarded. Saved connections remain available.';
  $('startupConnectionMessage').className='test-status success';
 }else if(startupConnectionVerified){
  startupConnectionHealthError=false;
  startupConnectionCheckSequence++;startupConnectionCheckPending=false;resetStartupConnectionChecks();
  startupConnectionEditSnapshot=Object.fromEntries(Object.entries(startupFieldMap).map(([key,id])=>[key,$(id).value]));
  startupConnectionVerified=false;
  $('startupConnectionMessage').textContent='Update the connection details, then test and save them.';
  $('startupConnectionMessage').className='test-status';
 }
 renderStartupPage();
 if(startupConnectionEditSnapshot)$('startupJiraUrl').focus();
}
$('startupEditConnections').addEventListener('click',toggleStartupConnectionEdit);
$('startupTestSavedConnections').addEventListener('click',checkSavedStartupConnections);
for(const id of Object.values(startupFieldMap))$(id).addEventListener('input',()=>{
 updateStartupRepositoryPreview();invalidateStartupConnection();
});
for(const id of ['startupAtlassianToken','startupGithubToken'])$(id).addEventListener('input',invalidateStartupConnection);
$('startupStackModalClose').addEventListener('click',closeStartupStackModal);
$('startupStackModalDone').addEventListener('click',closeStartupStackModal);
$('startupStackModal').addEventListener('click',event=>{if(event.target===$('startupStackModal'))closeStartupStackModal();});
$('startupStackModal').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeStartupStackModal();return;}
 if(event.key==='Tab'){
  const controls=[...$('startupStackModal').querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];
  if(!controls.length){event.preventDefault();return;}
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
$('startupCopilotCard').addEventListener('click',openStartupCopilotModal);
$('startupCopilotClose').addEventListener('click',closeStartupCopilotModal);
$('startupCopilotModal').addEventListener('click',event=>{if(event.target===$('startupCopilotModal'))closeStartupCopilotModal();});
$('startupCopilotModal').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeStartupCopilotModal();return;}
 if(event.key==='Tab'){
  const controls=[...$('startupCopilotModal').querySelectorAll('button:not([disabled])')];if(!controls.length){event.preventDefault();return;}
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
$('startupCopilotSetup').addEventListener('click',()=>{
 if(startupCopilotBusy)return;
 setStartupCopilotStatus('working','Preparing Copilot SDK setup…');send('startupSetupCopilot');
});
for(const id of ['startupUnifiedLog','gateUnifiedLog'])$(id).addEventListener('click',()=>send('startupExportUnifiedLog'));
$('startupRefresh').addEventListener('click',()=>{
 if(startupInstallingModule)return;
 startupPrereqRequested=true;
 startupPermissions=null;startupPermissionProgress.clear();renderStartupScanPlaceholders();
 startupScanComplete=false;updateStartupIssueSummary();
 startupScanPercent(0,'Refreshing local computer prerequisites…');
 $('startupToolMessage').textContent='Refreshing local computer prerequisites…';
 $('startupRefresh').disabled=true;renderStartupPage();send('startupReadiness');
});
$('startupConnectionLogPanel').addEventListener('toggle',()=>{
 if($('startupConnectionLogPanel').open){
  $('startupConnectionLogMessage').textContent='Loading saved connection checks…';
  send('startupGetConnectionLogs');
 }
});
$('startupConnectionLogRefresh').addEventListener('click',()=>{
 $('startupConnectionLogMessage').textContent='Refreshing connection diagnostics…';
 send('startupGetConnectionLogs');
});
$('startupConnectionLogDownload').addEventListener('click',()=>{
 $('startupConnectionLogMessage').textContent='Choose where to save the connection diagnostics…';
 send('startupDownloadConnectionLogs');
});
$('startupPrevious').addEventListener('click',()=>{
 if(startupPage!==1||startupVerifying||startupInstallingModule||startupProceedMode)return;
 startupPage=0;$('startupPrerequisiteDetails').open=false;
 requestStartupReadiness();
 renderStartupPage();
 $('startupRefresh').focus();
});
$('startupEmail').addEventListener('input',()=>updateHeaderUserName(read('startupEmail')));
$('startupConnectionForm').addEventListener('submit',event=>{
 event.preventDefault();if(startupVerifying||startupConnectionVerified||startupProceedMode)return;
 startupConnectionVerified=false;startupVerifying=true;
 renderStartupPage();
 $('startupConnectionMessage').textContent='Testing Jira, Confluence and GitHub account…';
 send('startupTestConnections',{settings:startupPayload(),atlassianToken:read('startupAtlassianToken'),githubToken:read('startupGithubToken'),requestId:beginStartupConnectionChecks()});
});
$('startupProceed').addEventListener('click',()=>{
 if(startupVerifying||startupInstallingModule||startupProceedMode)return;
 if(startupPage===0){
  if(!startupScanComplete)return;
  if(!startupConnectionVerified){startupPage=1;renderStartupPage();$('startupJiraUrl').focus();return;}
 }
 if(startupConnectionVerified)requestStartupProceed();
});
window.addEventListener('message',event=>{
 const message=event.data||{};
 if(message.type==='startupSavedFields'){
  if(!startupFormInitialized){
   const saved=message.saved||{};
   for(const [key,id] of Object.entries(startupFieldMap))if(!$(id).value)$(id).value=saved[key]||'';
   updateHeaderUserName(saved.email);
  }
 }
 if(message.type==='state'&&message.startupSetup)renderStartupConfig(message.startupSetup);
 if(message.type==='startupReadinessProgress'){
  startupScanPercent(message.percent,message.message);
 }
 if(message.type==='startupStackProgress')updateStartupStackProgress(message);
 if(message.type==='startupPermissionProgress'&&message.check?.id){startupPermissionProgress.set(message.check.id,message.check);renderStartupPermissionRows([...startupPermissionProgress.values()]);}
 if(message.type==='startupPermissionsResult')renderStartupPermissions(message.value);
 if(message.type==='startupReadinessResult'){
  $('startupRefresh').disabled=false;
  if(message.error){startupScanPercent(0,'Prerequisite scan failed.');startupScanComplete=false;$('startupToolMessage').textContent=message.error;renderStartupCopilotReadiness({unknown:true});setStartupInstallFeedback('Prerequisite scan failed. Download Unified Error Log for details.','error');renderStartupPage();}
  else renderStartupStackReadiness(message.value);
 }
 if(message.type==='startupCopilotSetup')setStartupCopilotStatus(message.status,message.message||'Copilot SDK setup finished.');
 if(message.type==='startupModuleProgress'){
  if(message.id!==startupInstallingModule)return;
  const status=String(message.status||'');
  $('startupToolMessage').textContent=message.detail||`Installing ${message.id}…`;
  setStartupInstallFeedback(message.detail||`Installing ${message.id}…`);
  if(['verified','unverified','complete','error','manual'].includes(status)){
   setStartupInstallFeedback(message.detail||'Installer finished. Download Unified Error Log for verification details.',status==='verified'?'success':status==='manual'?'muted':'error');
   startupInstallingModule='';
   if(status==='verified'||status==='complete'){
    $('startupRefresh').disabled=true;startupScanComplete=false;startupPermissions=null;renderStartupScanPlaceholders();renderStartupPage();send('startupReadiness');
   }else{
    $('startupRefresh').disabled=false;renderStartupPage();
    $('startupToolMessage').textContent=message.detail||'Installation stopped. Review the error and select Refresh to retry checks.';
   }
  }
 }
 if(message.type==='startupDiagnosticSaved'){
  setStartupInstallFeedback(message.message||'Unified startup diagnostics saved.','success');
 }
 if(message.type==='startupConnectionLogResult'){
  renderStartupConnectionLog(message.entries);
  $('startupConnectionLogMessage').textContent='Showing the latest locally saved checks.';
 }
 if(message.type==='startupConnectionLogSaved'){
  $('startupConnectionLogMessage').textContent=message.message||'Connection log exported.';
 }
 if(message.type==='startupConnectionLogError'){
  $('startupConnectionLogMessage').textContent=message.message||'Connection log is unavailable.';
 }
 if(message.type==='startupConnectionCheck'&&message.requestId===startupConnectionCheckSequence&&message.check?.id){
  if(startupConnectionCheckResults.has(message.check.id)){
   startupConnectionCheckResults.set(message.check.id,message.check);
   renderStartupConnectionChecks();
   if(message.check.state==='pending')$('startupConnectionMessage').textContent='Checking '+message.check.label+'…';
  }
 }
 if(message.type==='startupConnectionHealthResult'&&message.requestId===startupConnectionCheckSequence){
  startupConnectionCheckPending=false;
  if(Array.isArray(message.checks)){for(const check of message.checks)if(startupConnectionCheckResults.has(check.id))startupConnectionCheckResults.set(check.id,check);renderStartupConnectionChecks();}
  else resetStartupConnectionChecks();
  startupConnectionHealthError=!message.success||!!message.checks?.some(check=>check.state==='offline');
  if(startupConnectionHealthError){
   $('startupConnectionMessage').textContent='Some connections need attention. Open Connection Logs for details.';
   $('startupConnectionMessage').className='test-status error';
  }else{$('startupConnectionMessage').textContent=message.message||'Connections verified.';$('startupConnectionMessage').className='test-status success';}
  renderStartupPage();
 }
 if(message.type==='startupConnectionsResult'){
  if(message.requestId!==startupConnectionCheckSequence)return;
  startupConnectionCheckPending=false;startupConnectionHealthError=!message.success;
  if(Array.isArray(message.checks)){for(const check of message.checks)if(startupConnectionCheckResults.has(check.id))startupConnectionCheckResults.set(check.id,check);renderStartupConnectionChecks();}
  else resetStartupConnectionChecks();
  startupVerifying=false;
  startupConnectionVerified=message.success===true;
  $('startupConnectionMessage').textContent=message.message||'Connection test did not complete.';
  if(!startupConnectionVerified&&Array.isArray(message.checks)){
   const failed=message.checks.filter(check=>check.state==='error').map(check=>check.label);
   if(failed.length)$('startupConnectionMessage').textContent='Check '+failed.join(', ')+'. Open Connection Logs for details.';
  }
  $('startupConnectionMessage').className=startupConnectionVerified?'test-status success':'test-status error';
  if(startupConnectionVerified){
   startupConnectionEditSnapshot=null;
   $('startupAtlassianToken').value='';$('startupGithubToken').value='';
   if(startupStackData&&!startupStackData.catalog?.available)send('startupReadiness');
  }
  renderStartupPage();
 }
 if(message.type==='startupProceedResult'&&startupProceedMode){
  const resuming=startupProceedMode==='resume';
  startupProceedMode='';
  if(message.success){
   startupReturnToConnections=false;showStartupStep(false);
   if(resuming&&message.projectId){
    const projectId=message.projectId;
    launchFromGate({projectId,autoResume:true});
   }else $('gateQuery').focus();
  }else{
   if(message.verified===false){startupConnectionVerified=false;startupPage=1;}
   else if(resuming){startupPage=0;requestStartupReadiness();}
   showStartupStep(true);
   $('startupProceedInfo').textContent=message.message||'Unable to continue.';
  }
 }
});

let activePrerequisiteRequest=null,prerequisitePriorFocus=null;
function closePrerequisiteModal(action='Cancel'){
 if(!activePrerequisiteRequest)return;
 const pending=activePrerequisiteRequest;
 activePrerequisiteRequest=null;
 const modal=$('startupPrerequisiteModal');
 modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
 const oldFocus=prerequisitePriorFocus;prerequisitePriorFocus=null;
 if(oldFocus&&oldFocus.isConnected)oldFocus.focus();
 send('startupPrerequisiteDecision',{requestId:pending.requestId,id:pending.id,action});
}
$('startupPrerequisiteCancel').addEventListener('click',()=>closePrerequisiteModal('Cancel'));
$('startupPrerequisiteInstall').addEventListener('click',()=>closePrerequisiteModal('Install'));
$('startupPrerequisiteModal').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closePrerequisiteModal('Cancel');return;}
 if(event.key==='Tab'){
  const first=$('startupPrerequisiteCancel'),last=$('startupPrerequisiteInstall');
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
window.addEventListener('message',event=>{
 const request=event.data||{};
 if(request.type!=='startupPrerequisiteOffer'||!request.requestId)return;
 if(activePrerequisiteRequest)closePrerequisiteModal('Cancel');
 activePrerequisiteRequest={requestId:request.requestId,id:request.id};
 prerequisitePriorFocus=document.activeElement;
 const tool=String(request.id||'software').replace(/[^a-zA-Z0-9 -]/g,'');
 $('startupPrerequisiteTitle').textContent=request.automatic?'Install '+tool+' prerequisite?':'Open '+tool+' installation guide?';
 $('startupPrerequisiteDescription').textContent=request.automatic?
  'Confirm that ATGV may run the approved installation command on your computer.':
  'No automatic installer is approved for this platform. You can open official installation instructions.';
 $('startupPrerequisiteCommand').textContent=String(request.command||'Official installation instructions');
 $('startupPrerequisiteInstall').textContent=request.automatic?'Install':'Open Guide';
 $('startupPrerequisiteAssurance').textContent=request.automatic?
  'This action may download software, modify the host computer, and require administrator approval. Existing project files will not be changed by ATGV.':
  'ATGV will open an external installation guide only. It will not execute an installer or modify existing project files.';
 const modal=$('startupPrerequisiteModal');
 modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
 $('startupPrerequisiteInstall').focus();
});

let displayedLibraryUpdate=null,libraryUpdatePriorFocus=null,libraryUpdateState='ready';
function renderLibraryUpdateProgress(state,title='',detail='',percent=0){
 libraryUpdateState=state;
 const progress=$('libraryUpdateProgress'),modal=$('libraryUpdateModal');
 const busy=state==='running';
 const value=Number.isFinite(Number(percent))?Math.max(0,Math.min(100,Math.round(Number(percent)))):0;
 modal.setAttribute('aria-busy',String(busy));
 progress.classList.toggle('hidden',state==='ready');
 progress.dataset.state=state;
 $('libraryUpdateProgressBar').setAttribute('aria-valuenow',String(value));
 $('libraryUpdateProgressIndicator').style.width=value+'%';
 $('libraryUpdateProgressPercent').textContent=value+'%';
 if(title)$('libraryUpdateProgressTitle').textContent=String(title).slice(0,150);
 if(detail)$('libraryUpdateProgressMessage').textContent=String(detail).slice(0,700);
 $('libraryUpdateLater').disabled=busy;
 $('libraryUpdatePull').disabled=busy;
 $('libraryUpdatePull').textContent=busy?'Updating…':state==='failed'?'Retry Pull':'Pull Library';
 if(busy)progress.focus();
}
function closeLibraryUpdate(action='Later',notify=true){
 if(!displayedLibraryUpdate||libraryUpdateState==='running')return;
 const requestId=displayedLibraryUpdate;displayedLibraryUpdate=null;
 const modal=$('libraryUpdateModal');modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
 renderLibraryUpdateProgress('ready');
 const focus=libraryUpdatePriorFocus;libraryUpdatePriorFocus=null;
 if(focus&&focus.isConnected)focus.focus();
 if(notify)send('libraryUpdateDecision',{requestId,action});
}
function startLibraryUpdatePull(){
 if(!displayedLibraryUpdate||libraryUpdateState==='running')return;
 const requestId=displayedLibraryUpdate,retry=libraryUpdateState==='failed';
 renderLibraryUpdateProgress('running','Preparing library update…','Validating the configured repository and saved GitHub permissions.',0);
 if(retry)send('libraryUpdateRetry',{requestId});
 else send('libraryUpdateDecision',{requestId,action:'Pull Library'});
}
$('libraryUpdateLater').addEventListener('click',()=>closeLibraryUpdate('Later'));
$('libraryUpdatePull').addEventListener('click',startLibraryUpdatePull);
$('libraryUpdateModal').addEventListener('keydown',event=>{
 if(libraryUpdateState==='running'){
  if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();$('libraryUpdateProgress').focus();}
  return;
 }
 if(event.key==='Escape'){event.preventDefault();closeLibraryUpdate('Later');return;}
 if(event.key==='Tab'){
  const controls=['libraryUpdateLater','libraryUpdatePull'].map($).filter(node=>!node.disabled);
  const first=controls[0],last=controls.at(-1);
  if(!first||!last)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
window.addEventListener('message',event=>{
 const message=event.data||{};
 if(message.type==='libraryUpdateProgress'){
  if(!displayedLibraryUpdate||message.requestId!==displayedLibraryUpdate)return;
  if(message.stage==='completed'){
   // Keep the modal open until the host confirms the activated checkout.
   renderLibraryUpdateProgress('completed',message.title||'Library updated',message.message||'The verified SDLC Library is installed.',100);
   closeLibraryUpdate('Installed',false);
  }else if(message.stage==='failed'){
   renderLibraryUpdateProgress('failed',message.title||'Library update failed',message.message||'The library was not activated. Retry or select Later.',message.percent);
   $('libraryUpdatePull').focus();
  }else{
   renderLibraryUpdateProgress('running',message.title||'Updating SDLC Library…',message.message||'Pull and verification in progress.',message.percent);
  }
  return;
 }
 if(message.type!=='libraryUpdateOffer'||!message.requestId)return;
 if(displayedLibraryUpdate&&libraryUpdateState==='running')return;
 if(displayedLibraryUpdate)closeLibraryUpdate('Later');
 displayedLibraryUpdate=message.requestId;
 libraryUpdatePriorFocus=document.activeElement;
 renderLibraryUpdateProgress('ready');
 const installed=String(message.installedVersion||'');
 const installedBuild=String(message.installedTag||'').match(/-source-build\.(\d+)$/);
 $('libraryUpdateCurrent').textContent=installed?'v'+installed+(installedBuild?' · build '+installedBuild[1]:''):'Not installed';
 const latest=String(message.remoteVersion||'');
 const latestBuild=String(message.remoteTag||'').match(/-source-build\.(\d+)$/);
 $('libraryUpdateNext').textContent=latest?'v'+latest+(latestBuild?' · build '+latestBuild[1]:''):'Version unavailable';
 const sameVersion=!!installed&&installed===latest;
 $('libraryUpdateDescription').textContent=latest?(sameVersion?'A newer verified SDLC Library build is available for this version.':'A newer verified SDLC Library release is available.'):'The remote SDLC Library version could not be verified.';
 if(message.installedVersionWarning)$('libraryUpdateDescription').textContent+=' '+String(message.installedVersionWarning);
 $('libraryUpdateSource').textContent='GitHub: '+String(message.repository||'tech-stacks-skills');
 const modal=$('libraryUpdateModal');modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
 $('libraryUpdatePull').focus();
});

let displayedExtensionUpgrade=null;
let extensionUpgradeInstallState='ready';
function renderExtensionUpgradeInstallState(state,title='',description=''){
 extensionUpgradeInstallState=state;
 const busy=state==='installing',failed=state==='failed';
 const progress=$('extensionUpgradeProgress'),modal=$('extensionUpgradeModal');
 modal.setAttribute('aria-busy',String(busy));
 progress.classList.toggle('hidden',state==='ready');
 progress.dataset.state=state;
 if(title)$('extensionUpgradeProgressTitle').textContent=String(title).slice(0,180);
 if(description)$('extensionUpgradeProgressMessage').textContent=String(description).slice(0,700);
 $('extensionUpgradeLater').disabled=busy;
 $('extensionUpgradeView').disabled=busy;
 const install=$('extensionUpgradeInstall');
 install.disabled=busy;
 install.textContent=busy?'Installing…':failed?'Retry Install':'Install Upgrade';
 if(busy)progress.focus();
}
function closeExtensionUpgrade(action='Later',notify=true){
 if(!displayedExtensionUpgrade||extensionUpgradeInstallState==='installing')return;
 const requestId=displayedExtensionUpgrade;
 displayedExtensionUpgrade=null;
 renderExtensionUpgradeInstallState('ready');
 const modal=$('extensionUpgradeModal');modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
 if(notify)send('extensionUpgradeDecision',{requestId,action});
}
function startExtensionUpgradeInstall(){
 if(!displayedExtensionUpgrade||extensionUpgradeInstallState==='installing')return;
 const requestId=displayedExtensionUpgrade,retry=extensionUpgradeInstallState==='failed';
 renderExtensionUpgradeInstallState('installing','Preparing upgrade…','Starting verified extension installation.');
 if(retry)send('extensionUpgradeRetry',{requestId});
 else send('extensionUpgradeDecision',{requestId,action:'Install Upgrade'});
}
$('extensionUpgradeLater').addEventListener('click',()=>closeExtensionUpgrade('Later'));
$('extensionUpgradeView').addEventListener('click',()=>closeExtensionUpgrade('View Release'));
$('extensionUpgradeInstall').addEventListener('click',startExtensionUpgradeInstall);
$('extensionUpgradeModal').addEventListener('keydown',event=>{
 if(extensionUpgradeInstallState==='installing'){
  if(event.key==='Escape'||event.key==='Tab'){
   event.preventDefault();$('extensionUpgradeProgress').focus();
  }
  return;
 }
 if(event.key==='Escape'){event.preventDefault();closeExtensionUpgrade('Later');return;}
 if(event.key==='Tab'){
  const controls=['extensionUpgradeLater','extensionUpgradeView','extensionUpgradeInstall'].map($).filter(node=>!node.disabled);
  const first=controls[0],last=controls.at(-1);
  if(!first||!last)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
window.addEventListener('message',event=>{
 const message=event.data||{};
 if(message.type==='extensionUpgradeProgress'){
  if(!displayedExtensionUpgrade||message.requestId!==displayedExtensionUpgrade)return;
  const stage=String(message.stage||'');
  if(stage==='completed'){
   // Only the host's install command completion unlocks and closes this dialog.
   renderExtensionUpgradeInstallState('completed',message.title||'Upgrade installed successfully',message.message||'VS Code has finished installing the verified package.');
   closeExtensionUpgrade('Installed',false);
   return;
  }
  if(stage==='failed'){
   renderExtensionUpgradeInstallState('failed','Installation failed',message.message||'Unable to install the verified release. Select Retry Install or Later.');
   $('extensionUpgradeInstall').focus();return;
  }
  renderExtensionUpgradeInstallState('installing',message.title||'Installing verified extension…',message.message||'Keep this window open until installation finishes.');
  return;
 }
 if(message.type!=='extensionUpgradeOffer'||!message.requestId)return;
 // An active install must not be replaced by another offer.
 if(displayedExtensionUpgrade&&extensionUpgradeInstallState==='installing')return;
 if(displayedExtensionUpgrade)closeExtensionUpgrade('Later');
 displayedExtensionUpgrade=message.requestId;
 renderExtensionUpgradeInstallState('ready');
 $('extensionUpgradeCurrent').textContent='v'+String(message.currentVersion||'?');
 $('extensionUpgradeNext').textContent='v'+String(message.version||'?');
 $('extensionUpgradeDescription').textContent='ATGV v'+String(message.version||'?')+' is available. Review and install the verified extension release when ready.';
 $('extensionUpgradeSource').textContent='GitHub: '+String(message.repository||'')+' · '+String(message.tag||'');
 const modal=$('extensionUpgradeModal');modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
 $('extensionUpgradeInstall').focus();
});
