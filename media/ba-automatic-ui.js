'use strict';

(function(){
 const get=id=>document.getElementById(id);
 const root=get('discoveryView');
 if(!root?.classList.contains('ba-automatic-view'))return;
 const header=get('workSkill').parentElement;
 const stages=['source','requirements','jira','publish'];
 const stageNames=['Prepare Source','Develop Requirements','Prepare Jira Preview','Publish to Jira'];
 const kindNames={iso:'Structured ISO BRD',source:'Editable source',original:'Original source text',preflight:'Pre-flight Analyst'};
 const viewer=get('baAutoFormattedDocument');
 const primary=get('baAutoPrimaryAction'),overflow=get('baAutoOverflowMenu');
 const sourcePanel=root.querySelector('.source-documents-panel');
 const skill=get('workSkill');
 // The five workflow panels stay visible and collapsed until opened by the user.
 get('baAutoSourceEntry').append(sourcePanel);
 get('baAutoDiscoveryForm').append(get('discoveryForm'));
 get('baAutoHistoryContent').append(get('baStartPanel'));
 get('baAutoFeedback').append(get('baInlineStatus'),get('brDeletionProgress'),get('baMilestoneError'));

 let state=null,requestedProject='',artifactProject='',jiraView='list',jiraTab='all',tableKey='',brKey='',kind='iso',sourceDigest='',artifactContext=null,request=0;
 const collapsed=new Set();
 const input=get('baAutoArtifactText');

 const active=()=>view==='discovery'&&selectedRole==='business-analyst';
 const busy=()=>state?.phase==='running'||state?.phase==='publishing';
 function stageSummary(){
  const current=state?.projectId===activeId?state:null;
  const phase=current?.phase||'idle';
  const stage=phase==='ready'?'publish':current?.stage||(!brState?.mappingCompleted?'source':!requirements().length?'requirements':'jira');
  return {label:stageNames[stages.indexOf(stage)],running:phase==='running'||phase==='publishing'};
 }
 const artifactDirty=()=>!!artifactContext&&kind==='source'&&input.value!==artifactContext.text;
 const dirty=()=>artifactDirty()||discoveryDirty||brEditorDirty;
 const invoke=(command,fields={})=>send(command,{projectId:activeId,roleId:selectedRole,...fields});
 const requirements=()=>brState?.brs?.filter(br=>!br.archivedFromRestart&&!['retired','retire-proposed'].includes(br.status))||[];
 const source=()=>brState?.sourceDocuments?.[0];

 const statusLabels={'not-started':'Not started','in-progress':'In progress',
   ready:'Ready','needs-attention':'Needs attention',completed:'Completed'};
 function badge(id,status){
  const node=get(id);
  const next=statusLabels[status]?status:'not-started';
  node.dataset.state=next;node.textContent=statusLabels[next];
 }

 function placeSkill(){
  const target=active()?get('baAutoSkillSlot'):header;
  if(skill.parentElement!==target)target.append(skill);
 }

 function button(label,onClick){
  const node=document.createElement('button');
  node.type='button';
  node.className='secondary';
  node.textContent=label;
  node.addEventListener('click',onClick);
  return node;
 }

 function primaryTarget(){
  if(kind==='iso')return get('baWorkingBrDownload');
  if(kind==='source')return get('baAutoArtifactSave');
  if(kind==='preflight')return get('baPreflightDownload');
  return get('baAutoFileActions').querySelector('.source-document-actions .ba-process-btn');
 }
 function syncDocumentActions(){
  const label={iso:'Download ISO 29148 BRD as PDF',source:'Save source changes',original:'Replace & Reprocess',preflight:'Download pre-flight analysis'}[kind];
  const icon={iso:'download',source:'save',original:'replace',preflight:'download'}[kind];
  const action=primaryTarget();
  primary.title=label;
  primary.setAttribute('aria-label',label);
  for(const mark of primary.querySelectorAll('[data-ba-primary-icon]'))
   mark.toggleAttribute('hidden',mark.dataset.baPrimaryIcon!==icon);
  primary.disabled=!action||action.disabled||action.classList.contains('hidden')||busy()&&kind!=='source';
  get('baAutoOverflowActions').dataset.kind=kind;
 }
 function renderFormattedDocument(text){
  if(!window.ATGVDocumentViewer?.render){
   viewer.textContent=String(text||'');
   get('baAutoArtifactStatus').textContent='Formatted view unavailable; showing plain text.';
   return;
  }
  try{window.ATGVDocumentViewer.render(viewer,text);}
  catch(error){
   viewer.textContent=String(text||'');
   get('baAutoArtifactStatus').textContent='Formatted view unavailable; displaying document text.';
  }
 }
 function requestArtifact(){
  if(!active()||!sourceDigest||kind==='preflight'||artifactDirty())return;
  get('baAutoArtifactLabel').textContent=kindNames[kind];
  get('baAutoArtifactStatus').textContent='Loading document…';
  if(kind==='iso')viewer.textContent='Loading structured Business Requirements…';
  artifactContext=null;input.readOnly=true;
  invoke('baReadArtifact',{kind,digest:sourceDigest,requestId:++request});
 }

 function renderArtifacts(){
  const currentSource=source()?.digest||'';
  const changed=currentSource!==sourceDigest||artifactProject!==activeId;
  if(changed){
   sourceDigest=currentSource;artifactProject=activeId;artifactContext=null;input.value='';
   viewer.replaceChildren();
   get('baAutoArtifactStatus').textContent='';
  }
  get('baAutoDocumentTools').hidden=!sourceDigest;
  get('baAutoSourceEditor').hidden=!sourceDigest;
  // Every tab has exactly one visible panel; preflight no longer overlaps the BRD text editor.
  const preflight=kind==='preflight';
  get('baAutoIsoPreflight').hidden=!preflight;
  get('baAutoDocumentPanel').hidden=preflight;
  get('baAutoArtifactSave').hidden=kind!=='source';
  viewer.hidden=kind!=='iso';
  input.hidden=kind==='iso'||preflight;
  get('baAutoArtifactLabel').hidden=kind==='iso'||preflight;
  get('baAutoPreflightPlaceholder').hidden=!get('baSourcePreflight').classList.contains('hidden');
  const documentPanel=get('baAutoDocumentPanel');
  for(const tab of get('baAutoDocumentTabs').querySelectorAll('[data-ba-document]')){
   const selected=tab.dataset.baDocument===kind;
   tab.setAttribute('aria-selected',String(selected));
   tab.setAttribute('aria-pressed',String(selected));
   tab.tabIndex=selected?0:-1;
   if(selected&&!preflight)documentPanel.setAttribute('aria-labelledby',tab.id);
  }
  if(currentSource&&get('baAutoSource').open&&changed&&!preflight)requestArtifact();
  if(artifactContext){
   input.readOnly=kind!=='source'||busy()||!baCanEdit('ba-discovery');
   get('baAutoArtifactSave').disabled=input.readOnly||!artifactDirty()||!input.value.trim();
  }else get('baAutoArtifactSave').disabled=true;
  syncDocumentActions();
 }

 function renderRequirements(){
  const brs=requirements();
  const body=get('baAutoBRList');
  get('baAutoBRCount').textContent=brs.length?brs.length+' individual BR'+(brs.length===1?'':'s'):'';
  const excluded=new Set((brState?.baDraftQuality?.excluded||[]).map(row=>row.id));
  const key=String(brState?.revision||'')+'|'+busy()+'|'+brs.map(br=>baCanEdit('ba-br-'+br.id)).join('');
  if(brKey===key)return;
  brKey=key;
  const expanded=new Set([...body.querySelectorAll('details[open]')].map(node=>node.dataset.br));
  body.replaceChildren();
  if(!brs.length){body.textContent='Generated requirements will appear here.';return;}
  for(const br of brs){
   const item=document.createElement('details');
   item.dataset.br=br.id;item.className='ba-auto-requirement';item.open=expanded.has(br.id);
   const summary=document.createElement('summary');
   summary.textContent=br.id+' · '+br.title;
   if(excluded.has(br.id))summary.append(document.createTextNode(' · Excluded from Jira preview'));
   item.append(summary);
   for(const [label,value] of [['Business purpose',br.objective],['Scope',br.scope],['Acceptance criteria',br.acceptanceCriteria],
    ['Suggested Jira placement',br.jiraPlacement||(brState.synced?.[br.id]?.key?'Keep the existing Epic '+brState.synced[br.id].key+'.':'Create an Epic for '+br.title+'.')]]){
    const title=document.createElement('strong'),text=document.createElement('p');
    title.textContent=label;text.textContent=value||'Unspecified';item.append(title,text);
   }
   const writable=baCanEdit('ba-br-'+br.id);
   const edit=button(writable?'Edit '+br.id:'View '+br.id,()=>openBREditor(br.id,{artifact:true}));
   edit.disabled=busy();item.append(edit);body.append(item);
  }
 }

 function publishedRows(brIds){
  return Object.entries(brState?.synced||{}).filter(([path,link])=>brIds.has(path.split('/')[0])&&link?.key)
   .map(([path,link])=>({path,title:link.title||link.key,key:link.key,kind:link.kind,jiraType:link.issueType,roleId:link.roleId}));
 }

 function jiraRole(node){
  const aliases={developer:'software-developer',uiux:'ux-designer',qa:'qa-engineer',uat:'uat-tester'};
  const names={'business-analyst':'Business Analyst','project-manager':'Project Manager','software-developer':'Developer',
   'ux-designer':'UI/UX Designer','qa-engineer':'QA Engineer','uat-tester':'UAT Tester'};
  const linked=node.key&&jiraInventoryProject===activeId?jiraInventoryItems.find(item=>item.key===node.key):null;
  const labelled=linked?.labels?.filter(label=>label.startsWith('atgv-role-')).map(label=>label.slice(10))||[];
  if(labelled.length>1)return 'Multiple roles';
  const raw=String(node.roleId||node.roleLabel?.replace(/^atgv-role-/,'')||labelled[0]||node.path.match(/\/ROLE-([^/]+)$/i)?.[1]||'').toLowerCase();
  const id=aliases[raw]||raw;
  return (Object.hasOwn(names,id)?names[id]:roleData.roles.find(role=>role.id===id)?.label)||(node.kind==='Epic'?'Business Analyst':'Unspecified');
 }

 function rowsForTable(){
  const preview=state?.preview;
  const evaluated=preview?new Set(preview.rows?.map(row=>row.path.split('/')[0])):null;
  const brs=requirements().filter(br=>evaluated?evaluated.has(br.id):!!brState?.synced?.[br.id]?.key);
  const byRoot=new Set(brs.map(br=>br.id));
  const work=new Map((preview?.rows||publishedRows(byRoot)).map(row=>[row.path,row]));
  const changes=new Map((preview?.changes||[]).map(row=>[row.path,row]));
  for(const row of changes.values())if(!work.has(row.path))work.set(row.path,row);
  const resets=new Map((preview?.reopenRows||[]).map(row=>[row.key,row]));
  const rows=[];
  for(const br of brs){
   rows.push({id:br.id+'::br',path:br.id,title:br.title,type:'BR',role:'Business Analyst',category:'br',depth:0,br:br.id});
   for(const [path,node] of work){
    if(path.split('/')[0]!==br.id)continue;
    const edited=changes.get(path);
    const type=node.jiraType||node.kind||'Task';
    const category=String(type).toLowerCase().replace(/[\s_-]+/g,'');
    const parent=path.includes('/')?path.slice(0,path.lastIndexOf('/')):null;
    rows.push({id:path,path,title:edited?.title||node.title||path,type,category,role:jiraRole({...node,...edited}),
     kind:String(node.kind||'').toLowerCase(),
     depth:path===br.id?1:Math.min(path.split('/').length,5),br:br.id,parent:parent||br.id+'::br',
     key:node.key||edited?.key||'',entry:edited,status:resets.has(node.key)?resets.get(node.key).from+' → To Do':edited?.action||'Linked'});
   }
  }
  return rows;
 }

 function renderJira(){
  const rows=rowsForTable();
  get('baAutoJiraCount').textContent=rows.length?rows.filter(row=>row.category!=='br').length+' Jira items':'';
  const issues=state?.preview?.conflicts||[];
  get('baAutoJiraBlockers').hidden=!issues.length;
  const warnings=get('baAutoJiraBlockers');
  warnings.replaceChildren(...issues.map(message=>{const row=document.createElement('li');row.textContent=message;return row;}));
  const notes=state?.preview?.sourceNotes||state?.sourceNotes||[];
  get('baAutoSourceNotes').hidden=!notes.length;
  get('baAutoSourceNotesList').replaceChildren(...notes.map(message=>{const row=document.createElement('li');row.textContent=message;return row;}));
  const key=JSON.stringify([state?.preview?.revision,brState?.revision,state?.phase,jiraView,jiraTab,[...collapsed],rows.map(row=>row.role)]);
  if(tableKey===key)return;
  tableKey=key;
  const hierarchy=jiraView==='hierarchy',byId=new Map(rows.map(row=>[row.id,row]));
  const matching=rows.filter(row=>jiraTab==='all'||row.category===jiraTab||row.kind===jiraTab);
  const visible=new Set(matching.map(row=>row.id));
  if(hierarchy)for(const row of matching){
   for(let parent=row.parent;parent&&!visible.has(parent);parent=byId.get(parent)?.parent)visible.add(parent);
  }
  const included=hierarchy?rows.filter(row=>visible.has(row.id)):matching;
  const hasChildren=new Set(included.map(row=>row.parent).filter(Boolean));
  const shown=included.filter(row=>{
   if(!hierarchy)return true;
   let parent=row.parent;
   // The maximum BR hierarchy depth is bounded even for old imports.
   for(let depth=0;parent&&depth<8;depth++,parent=byId.get(parent)?.parent)if(collapsed.has(parent))return false;
   return true;
  });
  const table=get('baAutoJiraItems');
  if(!rows.length){table.textContent='Jira items will appear after preparation.';return;}
  ATGVDataTables.mount(table,shown,[
   {key:'title',label:'Work item',sortable:!hierarchy,render:row=>{
    const wrap=document.createElement('span');wrap.className='ba-auto-jira-title';
    if(hierarchy)wrap.style.paddingInlineStart=(row.depth*12)+'px';
    if(hierarchy&&hasChildren.has(row.id)){
     const toggle=button(collapsed.has(row.id)?'▸':'▾',()=>{
      if(collapsed.has(row.id))collapsed.delete(row.id);else collapsed.add(row.id);
      renderJira();
     });
     toggle.setAttribute('aria-label','Toggle children of '+row.title);
     toggle.setAttribute('aria-expanded',String(!collapsed.has(row.id)));
     wrap.append(toggle);
    }
    wrap.append(document.createTextNode(row.title));return wrap;
   }},
   {key:'type',label:'Type',sortable:!hierarchy},
   {key:'role',label:'Role',sortable:!hierarchy},
   {key:'key',label:'Jira key',sortable:!hierarchy,render:row=>jiraKeyNode(row.key||'—')},
   {key:'status',label:'Change',sortable:!hierarchy},
   {key:'action',label:'Action',sortable:false,render:row=>{
    const canPreview=row.entry&&row.entry.action!=='retire';
    const canEdit=canPreview&&!!state?.preview?.fieldPlans?.[row.path]?.schema&&!state?.preview?.projectionIssues?.length;
    const action=button(canEdit?'Edit Jira item':row.category==='br'?'Open BR':canPreview?'View Jira draft':row.key?'Open Jira item':'View',()=>{
     if(row.category==='br')openBREditor(row.br,{artifact:true});
     else if(canPreview)renderJiraIssueDetails(row.entry,!canEdit,{automatic:true});
     else if(row.key)openJiraIssueModal(row.key);
    });
    action.disabled=busy()||!(canPreview||row.key||row.category==='br');return action;
   }}
  ],{label:'Business Requirements Jira work items',pageSize:5,preserveOrder:hierarchy});
 }


 // Keep all five panels visible and initially collapsed. Do not forcibly
 // collapse a panel a user has explicitly expanded during a refresh.
 function setReadyPanel(id,status){
  const panel=get(id);
  panel.hidden=false;panel.dataset.status=status;
  if(!panel.dataset.initialized){panel.open=false;panel.dataset.initialized='true';}
 }
 function renderReadyPanels(phase){
  const sourceReady=!!source()?.digest;
  const discoveryReady=!!brState?.discoveryRevision&&!!brState?.mappingCompleted&&!discoveryDirty;
  const requirementsReady=requirements().length>0&&phase!=='running'&&!brState?.baDraftQuality?.excluded?.length;
  const jiraReady=rowsForTable().length>0&&phase!=='running';
  const completedReady=phase==='published'||(brState?.brs||[]).some(br=>
   br.archivedFromRestart===true||['approved','published','completed'].includes(String(br.status||'').toLowerCase()))||
   Object.values(brState?.synced||{}).some(link=>!!link?.key);
  const uploadTarget=get('baAutoOriginalFiles');
  if(sourcePanel.parentElement!==uploadTarget)uploadTarget.append(sourcePanel);
  get('baAutoSourceEntry').hidden=true;
  const discoveryTarget=get('baAutoDiscoveryForm'),discoveryForm=get('discoveryForm');
  if(discoveryForm.parentElement!==discoveryTarget)discoveryTarget.append(discoveryForm);
  get('baAutoDiscoveryEntry').hidden=true;
  const phaseRunning=phase==='running'||phase==='publishing';
  const excluded=!!brState?.baDraftQuality?.excluded?.length;
  const allApproved=requirementsReady&&requirements().every(br=>['approved','published','completed'].includes(String(br.status||'').toLowerCase()));
  const sourceStatus=!sourceReady?'not-started':artifactDirty()||phase==='running'&&!brState.mappingCompleted?'in-progress':brState.mappingCompleted?'ready':'in-progress';
  const discoveryStatus=!sourceReady?'not-started':discoveryDirty?'in-progress':discoveryReady?'ready':'in-progress';
  const requirementsStatus=!sourceReady||!discoveryReady?'not-started':excluded?'needs-attention':!requirementsReady?(phaseRunning?'in-progress':'not-started'):allApproved?'completed':'in-progress';
  const jiraStatus=state?.preview?.conflicts?.length?'needs-attention':phase==='published'?'completed':
   phaseRunning?'in-progress':phase==='ready'&&!dirty()?'ready':jiraReady?'in-progress':'not-started';
  const historyStatus=completedReady?'completed':'not-started';
  for(const [id,status] of [
   ['baAutoSource',sourceStatus],['baAutoDiscovery',discoveryStatus],
   ['baAutoRequirements',requirementsStatus],['baAutoJira',jiraStatus],
   ['baAutoHistory',historyStatus]]){
   setReadyPanel(id,status);
   badge(id+'Badge',status);
  }
 }

 function render(){
  placeSkill();
  const showingBusinessRequirements=selectedRole==='business-analyst'&&['baOverview','discovery'].includes(view);
  const aiWorking=showingBusinessRequirements&&(
   state?.projectId===activeId&&['running','publishing'].includes(state?.phase)||discoveryImportBusy);
  // Show the header waveform throughout the BA workflow; run stronger CMYK
  // waves only during real AI activity, never solely because the page is open.
  document.body.classList.toggle('atgv-ba-ai-active',showingBusinessRequirements);
  window.ATGVMyWorkChat?.setBusinessRequirementsActivity?.(aiWorking);
  window.ATGVMyWorkChat?.setBusinessRequirementsVisible?.(showingBusinessRequirements);
  window.ATGVSyncMyWorkHeaderWaveHost?.();
  if(!active()||!activeId||!brState)return;
  if(!source()&&sourceDigest)state=null;
  if(requestedProject!==activeId){
   requestedProject=activeId;state=null;collapsed.clear();brKey='';tableKey='';
   invoke('baPreparationState');
  }
  const baNew=get('baNewRequirement');
  baNew.classList.remove('hidden');baNew.disabled=busy()||!!baBusyTask||discoveryImportBusy;
  if(state?.preview?.revision===brState.revision){
   brPlanRevision=state.preview.revision;
   jiraPreviewIssueTypes=state.preview.issueTypes;
   jiraPreviewProject=state.preview.jiraProject;
   jiraPreviewFieldsByPath=state.preview.fieldPlans;
  }
  const stage=state?.stage||'source',phase=state?.phase||'idle';
  const current=stages.indexOf(stage);
  const ready=phase==='ready'||phase==='published'||phase==='publishing';
  const unsaved=dirty();
  get('baAutoTitle').textContent=state?.title||source()?.name?.replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[_-]+/g,' ')||'';
  get('baAutoSteps').setAttribute('aria-busy',String(busy()));
  for(const step of root.querySelectorAll('[data-ba-auto-stage]')){
   const index=stages.indexOf(step.dataset.baAutoStage);
   const complete=phase==='published'||index<current||ready&&index<3;
   step.dataset.state=complete?'ready':index===current&&busy()?'running':index===3&&phase==='ready'?'manual':'draft';
   step.firstElementChild.textContent=complete?'✓':String(index+1);
   if(!complete&&((busy()&&index===current)||(phase==='ready'&&index===3)))step.setAttribute('aria-current','step');
   else step.removeAttribute('aria-current');
  }
  const refresh=get('baAutoRefresh'),stop=get('baAutoStop'),publish=get('baAutoPublish');
  refresh.disabled=!source()||busy()||unsaved||!!baBusyTask||discoveryImportBusy;
  stop.classList.toggle('hidden',phase!=='running');
  const publishLabel=phase==='publishing'?'Publishing…':state?.preview?.republish?'Republish to Jira':'Publish to Jira';
  publish.title=publishLabel;publish.setAttribute('aria-label',publishLabel);
  publish.disabled=phase!=='ready'||unsaved||!!baBusyTask||state?.preview?.revision!==brState.revision;
  const reopen=state?.preview?.reopenRows?.length||0;
  const messages={idle:source()?'Preparing source…':'Upload a document to start.',running:'Preparing affected artifacts…',draft:'Draft. Refresh affected artifacts to continue.',
   ready:reopen?reopen+' linked Jira item'+(reopen===1?'':'s')+' will move to To Do.':'Jira preview is ready.',
   publishing:'Publishing approved changes to Jira…',published:'Jira publication is up to date.'};
  const detail=unsaved?'Save your edits to refresh the affected artifacts.':state?.error||messages[phase]||'';
  if(get('baAutoStatus').textContent!==detail)get('baAutoStatus').textContent=detail;
  const discoverySave=get('discoverySave');
  discoverySave.type='submit';discoverySave.textContent='Save Discovery';
  discoverySave.classList.remove('hidden');discoverySave.disabled=!discoveryDirty||!baCanEdit('ba-discovery')||busy()||!source()||!!baBusyTask;
  get('baStartPanel').classList.remove('hidden');
  get('baCompletedSection').classList.remove('hidden');
  sourcePanel.classList.remove('hidden');
  renderReadyPanels(phase);
  renderArtifacts();renderRequirements();renderJira();
 }

 get('baAutoDocumentTabs').addEventListener('click',event=>{
  const selected=event.target.closest('[data-ba-document]');
  if(!selected||selected.dataset.baDocument===kind)return;
  if(artifactDirty()){get('baAutoArtifactStatus').textContent='Save your edits before switching documents.';return;}
  kind=selected.dataset.baDocument;
  renderArtifacts();
  if(kind==='preflight'&&!get('baSourcePreflight').classList.contains('hidden'))get('baSourcePreflight').open=true;
  overflow.open=false;
  requestArtifact();
 });
 get('baAutoDocumentTabs').addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  const tabs=[...get('baAutoDocumentTabs').querySelectorAll('[data-ba-document]')];
  const current=tabs.indexOf(document.activeElement);
  if(current<0)return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].click();
  if(tabs[next].getAttribute('aria-selected')==='true')tabs[next].focus();
 });
 primary.addEventListener('click',()=>{
  const target=primaryTarget();
  if(!primary.disabled&&target&&!target.disabled)target.click();
 });
 overflow.addEventListener('keydown',event=>{
  if(event.key==='Escape'){overflow.open=false;overflow.querySelector('summary')?.focus();event.stopPropagation();}
 });
 document.addEventListener('click',event=>{if(overflow.open&&!overflow.contains(event.target))overflow.open=false;});
 get('baAutoDocumentToolbar').addEventListener('click',event=>{
  if(!artifactDirty())return;
  const destructive=event.target.closest('.source-document-actions button');
  if(!destructive)return;
  event.preventDefault();event.stopImmediatePropagation();
  get('baAutoArtifactStatus').textContent='Save your source edits before replacing or deleting the document.';
 },true);
 get('baAutoJiraTabs').addEventListener('click',event=>{
  const tab=event.target.closest('[data-ba-jira-tab]');
  if(!tab)return;
  event.preventDefault();
  get('baAutoJira').open=true;
  jiraTab=tab.dataset.baJiraTab;
  for(const option of get('baAutoJiraTabs').querySelectorAll('button'))option.setAttribute('aria-pressed',String(option===tab));
  renderJira();
 });
 get('baAutoJiraView').addEventListener('click',event=>{
  const tab=event.target.closest('[data-ba-jira-view]');
  if(!tab)return;
  event.preventDefault();
  get('baAutoJira').open=true;
  jiraView=tab.dataset.baJiraView;
  for(const option of get('baAutoJiraView').querySelectorAll('button'))option.setAttribute('aria-pressed',String(option===tab));
  renderJira();
 });
 get('baAutoSource').addEventListener('toggle',()=>{if(get('baAutoSource').open&&!artifactContext)requestArtifact();});
 input.addEventListener('input',render);
 get('baAutoArtifactSave').addEventListener('click',()=>{
  if(get('baAutoArtifactSave').disabled||!artifactContext)return;
  get('baAutoArtifactSave').disabled=true;
  input.readOnly=true;
  const text=input.value;
  get('baAutoArtifactStatus').textContent='Saving document…';
  invoke('baSaveArtifact',{kind,digest:sourceDigest,requestId:++request,revision:artifactContext.revision,text});
 });
 get('baAutoRefresh').addEventListener('click',()=>invoke('baRefreshArtifacts'));
 get('baAutoStop').addEventListener('click',()=>invoke('baStopPreparation'));
 get('baAutoPublish').addEventListener('click',()=>{
  get('baAutoPublish').disabled=true;
  invoke('baPublishPrepared',{revision:state?.preview?.revision});
 });

 window.addEventListener('atgv:viewchange',()=>{
  if(!active())requestedProject='';
  render();
 });
 window.addEventListener('message',({data:m})=>{
  if(!m)return;
  if(m.type==='baPreparation'&&m.state?.projectId===activeId){
   const previous=state?.phase;
   state=m.state;
   if(state.preview){
    brPlanRevision=state.preview.revision;
    jiraPreviewIssueTypes=state.preview.issueTypes;
    jiraPreviewProject=state.preview.jiraProject;
    jiraPreviewFieldsByPath=state.preview.fieldPlans;
   }
   render();
   if(view==='baOverview')renderBAUncompleted();
   if(previous==='running'&&state.phase!=='running'&&active()&&get('baAutoSource').open&&!artifactDirty())requestArtifact();
  }else if(m.projectId===activeId&&m.requestId===request){
   if(m.type==='baArtifactRead'&&m.digest===sourceDigest&&m.kind===kind){
    artifactContext={revision:m.revision,text:m.text};
    input.value=m.text;
    get('baAutoArtifactStatus').textContent='';
    if(kind==='iso')renderFormattedDocument(m.text);
    render();
   }else if(m.type==='baArtifactSaved'){
    artifactContext=null;
    get('baAutoArtifactStatus').textContent='Document saved.';
    requestArtifact();
   }else if(m.type==='baArtifactError'){
    get('baAutoArtifactStatus').textContent=m.message;
    render();
   }
  }
 });

 function openStage(key){
  const sections={start:'baAutoHistory',upload:'baAutoSource',mapping:'baAutoDiscovery',review:'baAutoDiscovery',
   generate:'baAutoRequirements',save:'baAutoRequirements',approve:'baAutoRequirements',
   jiraPreview:'baAutoJira',jiraApprove:'baAutoJira',publish:'baAutoJira'};
  const target=get(sections[key]);
  if(!target)return false;
  if(target.hidden){
   const entry=key==='upload'?get('baAutoSourceEntry'):
    ['mapping','review'].includes(key)?get('baAutoDiscoveryEntry'):null;
   if(!entry||entry.hidden)return false;
   entry.scrollIntoView({block:'nearest'});return true;
  }
  target.open=true;target.scrollIntoView({block:'nearest'});return true;
 }
 window.ATGVBusinessRequirements={render,active,busy,placeSkill,dirty,openStage,stageSummary,syncDocumentActions};
 render();
})();
