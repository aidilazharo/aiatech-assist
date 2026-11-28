'use strict';

(function(){
 const get=id=>document.getElementById(id);
 const root=get('discoveryView');
 if(!root?.classList.contains('ba-automatic-view'))return;
 const header=get('workSkill').parentElement;
 const stages=['source','requirements','jira','publish'];
 const stageNames=['Prepare Source','Develop Requirements','Prepare Jira Preview','Approved and Publish'];
 const kindNames={iso:'Structured ISO BRD',source:'Editable source',original:'Original source text',preflight:'Pre-flight Analyst','jira-fields':'Jira work item types and fields'};
 const viewer=get('baAutoFormattedDocument');
 const primary=get('baAutoPrimaryAction');
 const sourcePanel=root.querySelector('.source-documents-panel');
 const skill=get('workSkill');
 // The five workflow panels stay visible and collapsed until opened by the user.
 get('baAutoSourceEntry').append(sourcePanel);
 get('baAutoDiscoveryForm').append(get('discoveryForm'));
 get('baAutoHistoryContent').append(get('baStartPanel'));
 get('baAutoFeedback').append(get('baInlineStatus'),get('brDeletionProgress'),get('baMilestoneError'),get('baProcessLogStatus'));

 let state=null,requestedProject='',artifactProject='',jiraView='list',jiraTab='all',tableKey='',brKey='',kind='iso',sourceDigest='',artifactContext=null,request=0;
 let aiResolve={running:false,message:'',stopping:false};
 const recovery=window.ATGVRecoveryController?.create();
 let recoveryAction=null,pendingRefreshProject='';
 let jiraFieldView=null,jiraFieldDirty=false,jiraFieldLoading=false,jiraFieldRequest=0;
 const collapsed=new Set();
 const input=get('baAutoArtifactText'),quillMount=get('baAutoQuillEditor');
 let artifactQuill=null,quillKey='',quillHadFinalLine=false,quillFailure=false,quillRetrying=false;
 const quillHelp=get('baAutoQuillHelp'),quillRetry=get('baAutoQuillRetry'),quillFallback=get('baAutoQuillFallback'),quillActions=get('baAutoQuillActions');

 const active=()=>view==='discovery'&&selectedRole==='business-analyst';
 const busy=()=>aiResolve.running||state?.phase==='running'||state?.phase==='publishing'||recoveryAction?.project===activeId||pendingRefreshProject===activeId;
 function stageSummary(){
  const current=state?.projectId===activeId?state:null;
  const phase=current?.phase||'idle';
  const stage=phase==='ready'?'publish':current?.stage||(!brState?.mappingCompleted?'source':!requirements().length?'requirements':'jira');
  return {label:stageNames[stages.indexOf(stage)],running:phase==='running'||phase==='publishing'};
 }
 const artifactDirty=()=>!!artifactContext&&kind==='source'&&input.value!==artifactContext.text;
 const dirty=()=>artifactDirty()||discoveryDirty||brEditorDirty||jiraFieldDirty;
 const invoke=(command,fields={})=>send(command,{projectId:activeId,roleId:selectedRole,...fields});
 const requirements=()=>brState?.brs?.filter(br=>!br.archivedFromRestart&&!['retired','retire-proposed'].includes(br.status))||[];
 const source=()=>brState?.sourceDocuments?.[0];
 const foreignOwners=()=>baForeignBROwners();
 const sharedReadOnly=()=>foreignOwners().length>0||!baOwnerState?.me;
 const readOnlyMessage=()=>{const owners=foreignOwners();return owners.length?'Read-Only · Owner: '+[...new Set(owners.map(owner=>owner.ownerName||owner.ownerId))].join(', '):'Checking ownership…';};

 const statusLabels={'not-started':'Not started','in-progress':'In progress',
   ready:'Ready','needs-attention':'Needs attention',completed:'Completed'};
 function badge(id,status){
  const node=get(id);
  const next=statusLabels[status]?status:'not-started';
  node.dataset.state=next;node.textContent=statusLabels[next];
  if(id==='baAutoRequirementsBadge'&&next==='needs-attention'){
   const findings=(brState?.baDraftQuality?.excluded||[]).filter(row=>requirements().some(br=>br.id===row.id));
   node.title=findings.map(row=>row.id+': '+row.reason).join('\n')||'Expand Generated Requirements to review the findings.';
  }else node.removeAttribute('title');
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
  if(kind==='jira-fields')return null;
  return get('sourceDocuments').querySelector('.ba-process-btn');
 }
 function syncDocumentActions(){
  const label={iso:'Download ISO 29148 BRD as PDF',source:'Save source changes',original:'Replace & Reprocess',preflight:'Download pre-flight analysis'}[kind];
  const icon={iso:'download',source:'save',original:'replace',preflight:'download'}[kind];
  const action=primaryTarget();
  primary.hidden=kind==='jira-fields'||kind==='original';
  primary.title=label||'Document actions';
  primary.setAttribute('aria-label',label||'Document actions');
  for(const mark of primary.querySelectorAll('[data-ba-primary-icon]'))
   mark.toggleAttribute('hidden',mark.dataset.baPrimaryIcon!==icon);
  primary.disabled=!action||action.disabled||action.classList.contains('hidden')||busy()&&kind!=='source';
  get('baAutoOverflowActions').dataset.kind=kind;
 }
 // Quill provides a document-text surface, while the original extracted text
 // remains the persisted artifact. Formatting is not silently inserted into
 // a source document or its downstream approved requirements.
 function resetQuill(){
  artifactQuill=null;quillKey='';quillMount.replaceChildren();
 }
 function quillText(){
  const value=artifactQuill?.getText()||'';
  return !quillHadFinalLine&&value.endsWith('\n')?value.slice(0,-1):value;
 }
 function syncQuill(){
  if(!['source','original'].includes(kind)||!artifactContext||typeof window.Quill!=='function'||quillFailure)return false;
  const key=activeId+'|'+sourceDigest+'|'+kind+'|'+artifactContext.revision;
  if(quillKey!==key){
   resetQuill();
   const editor=document.createElement('div');
   editor.setAttribute('aria-label',kind==='source'?'Editable source document text':'Original source document text');
   quillMount.append(editor);
   try{artifactQuill=new window.Quill(editor,{theme:'snow',readOnly:kind!=='source',
    modules:{toolbar:false},formats:[],placeholder:'Document text'});}
   catch(error){quillFailure=true;resetQuill();return false;}
   artifactQuill.root.setAttribute('aria-label',kind==='source'?'Editable source document text':'Original source document text');
   artifactQuill.root.setAttribute('aria-multiline','true');
   quillHadFinalLine=artifactContext.text.endsWith('\n');
   artifactQuill.setText(artifactContext.text,'api');
   artifactQuill.history.clear();
   artifactQuill.on('text-change',(_delta,_old,origin)=>{
    if(origin!=='user'||kind!=='source')return;
    input.value=quillText();
    render();
   });
   quillKey=key;
  }
  artifactQuill.enable(kind==='source'&&!busy()&&baCanEdit('ba-discovery'));
  return true;
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
  if(!active()||!sourceDigest||kind==='preflight'||kind==='jira-fields'||artifactDirty())return;
  get('baAutoArtifactLabel').textContent=kindNames[kind];
  get('baAutoArtifactStatus').textContent='Loading document…';
  if(kind==='iso')viewer.textContent='Loading structured Business Requirements…';
  artifactContext=null;input.readOnly=true;resetQuill();
  invoke('baReadArtifact',{kind,digest:sourceDigest,requestId:++request});
 }

 function renderArtifacts(){
  const currentSource=source()?.digest||'';
  const changed=currentSource!==sourceDigest||artifactProject!==activeId;
  if(changed){
   sourceDigest=currentSource;artifactProject=activeId;artifactContext=null;input.value='';
   resetQuill();viewer.replaceChildren();
   get('baAutoArtifactStatus').textContent='';
  }
  get('baAutoDocumentTools').hidden=!sourceDigest;
  get('baAutoSourceEditor').hidden=!sourceDigest;
  // Every tab has exactly one visible panel; preflight no longer overlaps the BRD text editor.
  const preflight=kind==='preflight';
  get('baAutoIsoPreflight').hidden=!preflight;
  get('baAutoDocumentPanel').hidden=preflight||kind==='jira-fields';
  get('baAutoJiraFieldsPanel').hidden=kind!=='jira-fields';
  get('baAutoArtifactSave').hidden=kind!=='source';
  viewer.hidden=kind!=='iso';
  const showQuill=syncQuill();
  quillMount.hidden=!showQuill;
  input.hidden=kind==='iso'||preflight||showQuill||kind==='source';
  const sourceTab=kind==='source';
  const unavailable=sourceTab&&!!artifactContext&&!showQuill;
  quillActions.hidden=!sourceTab||!showQuill;
  for(const control of quillActions.querySelectorAll('button'))control.disabled=busy()||!baCanEdit('ba-discovery');
  quillHelp.hidden=!unavailable;quillFallback.hidden=!unavailable;
  if(unavailable){
   if(quillFallback.textContent!==artifactContext.text)quillFallback.textContent=artifactContext.text;
   get('baAutoQuillMessage').textContent='Quill is unavailable. Load the verified Library to edit this source; the preview below is read-only.';
   quillRetry.disabled=quillRetrying||busy();
  }else if(quillFallback.textContent)quillFallback.textContent='';
  get('baAutoArtifactLabel').hidden=kind==='iso'||preflight;
  get('baAutoPreflightPlaceholder').hidden=!get('baSourcePreflight').classList.contains('hidden');
  const documentPanel=get('baAutoDocumentPanel');
  for(const tab of get('baAutoDocumentTabs').querySelectorAll('[data-ba-document]')){
   const selected=tab.dataset.baDocument===kind;
   tab.setAttribute('aria-selected',String(selected));
   tab.setAttribute('aria-pressed',String(selected));
   tab.tabIndex=selected?0:-1;
   if(selected&&!preflight&&kind!=='jira-fields')documentPanel.setAttribute('aria-labelledby',tab.id);
  }
  if(changed){jiraFieldView=null;jiraFieldDirty=false;jiraFieldLoading=false;jiraFieldRequest++;get('baAutoJiraFieldsList').replaceChildren();get('baAutoJiraFieldsStatus').textContent='';}
  if(kind==='jira-fields'){if(!jiraFieldView&&!jiraFieldLoading)loadJiraFields();updateJiraFieldButtons();}
  if(currentSource&&get('baAutoSource').open&&changed&&!preflight)requestArtifact();
  if(artifactContext){
   input.readOnly=kind!=='source'||!showQuill||busy()||!baCanEdit('ba-discovery');
   get('baAutoArtifactSave').disabled=input.readOnly||!artifactDirty()||!input.value.trim()||input.value.length>1000000;
  }else get('baAutoArtifactSave').disabled=true;
  syncDocumentActions();
 }

 function missingDraftTaskRoles(){
  if(state?.projectId!==activeId||state?.preview?.revision!==brState?.revision)return [];
  return (state.preview.changes||[]).filter(item=>item.kind==='Task'&&item.action==='create'&&!item.roleLabel&&!item.staleJiraDetails&&
   !brState.pending?.[item.path]&&requirements().some(br=>br.id===item.path.split('/')[0]&&br.status==='draft'&&baCanEdit('ba-br-'+br.id)));
 }
 function renderAttentionActions(findings){
  const bar=get('baAutoRequirementsToolbar');
  const action=get('baAutoResolveAttention'),stop=get('baAutoResolveStop');
  const eligible=findings.filter(row=>requirements().some(br=>br.id===row.id&&br.status==='draft'&&baCanEdit('ba-br-'+br.id)));
  const roles=missingDraftTaskRoles();
  bar.hidden=!findings.length&&!roles.length&&!aiResolve.running&&!aiResolve.message;
  const blocker=aiResolve.running?'AI repair is running.':busy()||baBusyTask||discoveryImportBusy?'Finish the current BR operation first.':dirty()?'Save your edits before AI repair.':!baCanEdit('ba-discovery')||baOwnerState?.cached||baOwnerState?.scope==='local'?'Connect to Jira and Confluence to verify ownership.':!eligible.length&&!roles.length?'No affected draft is owned by you or no repairable findings remain.':'';
  action.disabled=!!blocker;
  action.title=blocker||'Use AI to repair '+eligible.length+' owned BR draft(s) and '+roles.length+' missing Jira task role(s). Previous approvals and Jira unchanged.';
  const recoveryState=recovery?.get(activeId);
  action.textContent=recoveryState?.paused?'Resume AI':'Resolve with AI';
  stop.hidden=!aiResolve.running&&(!recovery||!findings.length||!!recoveryState?.paused);stop.disabled=aiResolve.stopping;
  get('baAutoResolveStatus').textContent=aiResolve.running?aiResolve.message:recoveryState?.paused?recoveryState.reason:[findings.length?findings.length+' requirement(s) need a source-backed correction; '+eligible.length+' owned by you.':'',blocker,aiResolve.message].filter(Boolean).join(' ');
 }
 function renderRequirements(){
  const brs=requirements();
  const body=get('baAutoBRList');
  const activeIds=new Set(brs.map(br=>br.id));
  const findings=(brState?.baDraftQuality?.excluded||[]).filter(row=>activeIds.has(row.id));
  const byId=new Map(findings.map(row=>[row.id,row]));
  const impact=(brState?.impact||[]).filter(row=>activeIds.has(row.id));
  get('baAutoBRCount').textContent=brs.length?brs.length+' individual BR'+(brs.length===1?'':'s')+(findings.length?' · '+findings.length+' need attention':''):'';
  renderAttentionActions(findings);
  const key=JSON.stringify([brState?.revision,busy(),findings,impact,brs.map(br=>[baCanEdit('ba-br-'+br.id),baOwner('ba-br-'+br.id)])]);
  if(brKey===key)return;
  brKey=key;
  const expanded=new Set([...body.querySelectorAll('details[open]')].map(node=>node.dataset.br));
  body.replaceChildren();
  if(!brs.length){body.textContent='Generated requirements will appear here.';return;}
  if(findings.length){
   const notice=document.createElement('section');notice.className='ba-auto-attention-summary';notice.setAttribute('role','status');
   const heading=document.createElement('strong');heading.textContent='What needs attention ('+findings.length+')';
   const list=document.createElement('ul');
   for(const row of findings){
    const item=document.createElement('li');
    const name=document.createElement('strong');name.textContent=row.id+(row.field?' · '+row.field:'');
    const message=document.createElement('span');message.textContent=row.reason||'Unresolved requirement quality finding.';
    item.append(name,message);list.append(item);
   }
   const guidance=document.createElement('p');guidance.className='ba-auto-attention-guidance';
   guidance.textContent='You can publish these requirements with open findings and edit them later.';
   notice.append(heading,list,guidance);body.append(notice);
  }
  if(impact.length){
   const counts={new:0,modified:0,unchanged:0,removed:0};
   for(const row of impact)if(Object.hasOwn(counts,row.change))counts[row.change]++;
   const status=document.createElement('p');status.className='ba-auto-generation-result';
   status.textContent='Latest generation · '+counts.new+' new · '+counts.modified+' changed · '+counts.unchanged+' unchanged';
   if(!counts.new&&!counts.modified&&counts.unchanged){
    const note=document.createElement('span');note.className='ba-auto-generation-unchanged';
    note.textContent='No BR content changed. Provide correction feedback or update verified source/Discovery evidence before regenerating.';
    status.append(note);
   }
   body.append(status);
  }
  for(const br of brs){
   const problem=byId.get(br.id);
   const item=document.createElement('details');
   item.dataset.br=br.id;item.className='ba-auto-requirement'+(problem?' has-attention':'');item.open=expanded.has(br.id);
   const summary=document.createElement('summary');
   const heading=document.createElement('div');
   const title=document.createElement('strong');title.textContent=br.id+' · '+br.title;heading.append(title);
   const owner=baOwner('ba-br-'+br.id);
   if(owner.ownerId&&owner.ownerId!==baOwnerState?.me){const label=document.createElement('small');label.className='muted';label.style.display='block';label.textContent='Read-Only · Owner: '+(owner.ownerName||owner.ownerId);heading.append(label);}
   summary.append(heading);
   if(problem){const mark=document.createElement('span');mark.className='ba-auto-requirement-status';mark.textContent='Needs attention';summary.append(mark);}
   item.append(summary);
   if(problem){
    const detail=document.createElement('p');detail.className='ba-auto-requirement-attention';
    detail.textContent=(problem.field?problem.field+': ':'')+problem.reason;
    item.append(detail);
    if(problem.quote){const quote=document.createElement('blockquote');quote.className='ba-auto-requirement-quote';quote.textContent=problem.quote;item.append(quote);}
   }
   for(const [label,value] of [['Business purpose',br.objective],['Scope',br.scope],['Acceptance criteria',br.acceptanceCriteria],
    ['Suggested Jira placement',br.jiraPlacement||(brState.synced?.[br.id]?.key?'Keep the existing Epic '+brState.synced[br.id].key+'.':'Create an Epic for '+br.title+'.')]]){
    const field=document.createElement('div');field.className='ba-auto-requirement-field';
    const name=document.createElement('strong');name.textContent=label;
    const text=document.createElement('p');text.textContent=value||'Unspecified';
    field.append(name,text);item.append(field);
   }
   const actions=document.createElement('div');actions.className='ba-auto-requirement-actions';
   const writable=baCanEdit('ba-br-'+br.id);
   const edit=button('Edit '+br.id,()=>openBREditor(br.id,{artifact:true}));
   edit.disabled=busy()||!writable;actions.append(edit);if(!writable){const preview=button('View '+br.id,()=>openBREditor(br.id,{artifact:true}));preview.disabled=busy();actions.append(preview);}item.append(actions);body.append(item);
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
  const issues=[...(state?.preview?.conflicts||[]),...(state?.preview?.reopenSkipped||state?.reopenSkipped||[]).map(row=>'Warning: '+row.message)];
  get('baAutoJiraBlockers').hidden=!issues.length;
  const warnings=get('baAutoJiraBlockers');
  warnings.replaceChildren(...issues.map(message=>{const row=document.createElement('li');row.textContent=message;return row;}));
  const notes=state?.preview?.sourceNotes||state?.sourceNotes||[];
  get('baAutoSourceNotes').hidden=!notes.length;
  get('baAutoSourceNotesList').replaceChildren(...notes.map(message=>{const row=document.createElement('li');row.textContent=message;return row;}));
  const key=JSON.stringify([state?.preview?.revision,brState?.revision,state?.phase,jiraView,jiraTab,[...collapsed],rows.map(row=>[row.role,baCanEdit('ba-br-'+row.br)]),sharedReadOnly()]);
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
    const canEdit=canPreview&&!sharedReadOnly()&&baCanEdit('ba-br-'+row.br)&&!!state?.preview?.fieldPlans?.[row.path]?.schema&&!state?.preview?.projectionIssues?.length;
    const action=button(canEdit?'Edit Jira item':row.category==='br'?'Open BR':canPreview?'View Jira draft':row.key?'Open Jira item':'View',()=>{
     if(row.category==='br')openBREditor(row.br,{artifact:true});
     else if(canPreview)renderJiraIssueDetails(row.entry,!canEdit,{automatic:true});
     else if(row.key)openJiraIssueModal(row.key);
    });
    action.disabled=busy()||!(canPreview||row.key||row.category==='br');return action;
   }}
  ],{label:'Business Requirements Jira work items',pageSize:5,preserveOrder:hierarchy});
 }


 // Default to collapsed whenever the user enters a BR workspace.
 // Allow explicit expansion, and never conceal unsaved changes on a refresh.
 function resetWorkflowPanels(){
  for(const id of ['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira','baAutoHistory'])get(id).open=false;
 }
 function setReadyPanel(id,status){
  const panel=get(id),previous=panel.dataset.status;
  panel.hidden=false;panel.dataset.status=status;
  if(!panel.dataset.initialized){panel.open=false;panel.dataset.initialized='true';}
  else if(['ready','completed'].includes(status)&&!['ready','completed'].includes(previous)&&!dirty())panel.open=false;
 }
 // A verified automatic Jira projection uses drafts until the user confirms
 // publication. Prepared is not the same as formally approved or published.
 function generatedRequirementsStatus({sourceReady,discoveryReady,excluded,requirementsReady,allApproved,phase,previewCurrent,unsaved}){
  if(!sourceReady||!discoveryReady)return 'not-started';
  if(excluded)return 'needs-attention';
  if(unsaved)return 'in-progress';
  if(!requirementsReady)return phase==='running'||phase==='publishing'?'in-progress':'not-started';
  if(allApproved)return 'completed';
  if(phase==='publishing'||(phase==='ready'||phase==='published')&&previewCurrent)return 'ready';
  return 'in-progress';
 }
 function currentJiraPreview(){
  return !!state?.preview&&state.projectId===activeId&&state.preview.revision===brState?.revision&&Array.isArray(state.preview.conflicts)&&state.preview.conflicts.length===0;
 }
 function canPublishPrepared(phase,unsaved,completed=false){
  return (phase==='ready'&&currentJiraPreview()||completed)&&!['running','publishing'].includes(phase)&&!unsaved&&!busy()&&!baBusyTask;
 }
 // Percentages describe verified section evidence, never elapsed time.
 function sectionProgress({register,brs,rows,preview,groups,statuses,unsaved,discoveryFilled}){
  const ratio=(done,total)=>total>0?Math.min(100,Math.max(0,Math.floor(100*done/total))):0;
  const settle=(id,value)=>['ready','completed'].includes(statuses[id])?100:
   statuses[id]==='not-started'?0:Math.min(99,value);
  const sources=(register.sourceDocuments||[]).filter(doc=>doc?.digest);
  const mapped=new Set(register.mappingCompleted?.sourceDigests||register.mappingCompleted?.digests||[]);
  const sourceDone=sources.filter(doc=>mapped.has(doc.digest)).length;
  const answers=Number.isFinite(discoveryFilled)?discoveryFilled:Object.values(register.discoveryAnswers||{}).filter(value=>typeof value==='string'&&value.trim()).length;
  const excluded=new Set((register.baDraftQuality?.excluded||[]).map(row=>row.id));
  const stale=br=>br.needsRefresh||br.externalReviewRequired||br.roleReviewRequired||br.dependencyReviewRequired;
  const clean=brs.filter(br=>!excluded.has(br.id)).length; // Draft quality is distinct from approval freshness.
  const items=rows.filter(row=>row.category!=='br');
  const conflicts=[...new Set([...(preview?.conflicts||[]),...(preview?.reopenSkipped||[]).map(row=>row.message||row.key||'Status reset unavailable')].map(String))];
  const blocked=new Set();let unmatched=0;
  for(const conflict of conflicts){
   const matches=items.filter(row=>row.path&&(conflict===row.path||conflict.startsWith(row.path+':')||conflict.startsWith(row.path+' ')));
   if(matches.length)matches.forEach(row=>blocked.add(row.path));else unmatched++;
  }
  const published=new Set(groups.filter(group=>group.snapshots.some(({br})=>{
   const current=brs.find(item=>item.id===group.id);
   return !!current&&!stale(current)&&['approved','published','completed'].includes(String(current.status||'').toLowerCase())&&
    Number(br.approvedRevision||0)===Number(current.approvedRevision||0)&&!!(br.jiraKey||br.jiraIssues?.some(issue=>issue.key));
  })).map(group=>group.id));
  return {
   baAutoSource:settle('baAutoSource',ratio(sources.length+sourceDone,sources.length*2)),
   baAutoDiscovery:settle('baAutoDiscovery',ratio(Math.min(12,answers),13)),
   baAutoRequirements:settle('baAutoRequirements',ratio(clean,brs.length+(unsaved?1:0))),
   baAutoJira:settle('baAutoJira',ratio(items.length-blocked.size,items.length+unmatched+(unsaved?1:0))),
   baAutoHistory:brs.length?ratio(published.size,brs.length):groups.length?100:0
  };
 }
 // The repair message names the CURRENT pass, not a completed pass.
 function aiRepairProgress(message){
  const match=/\bAI repair\s+(\d+)\s*\/\s*(\d+)\s*:/i.exec(String(message||''));
  if(!match)return null;
  const current=Number(match[1]),total=Number(match[2]);
  if(!Number.isSafeInteger(current)||!Number.isSafeInteger(total)||total<1||current<1||current>total)return null;
  return Math.floor(100*(current-1)/total);
 }
 function renderSectionProgress(id,percent,status,repair=false){
  const badgeNode=get(id+'Badge');
  let wrap=get(id+'Progress');
  // Completed sections keep only their status badge; recreate progress if reopened.
  if(percent>=100){wrap?.remove();return;}
  if(!wrap){
   wrap=document.createElement('span');wrap.id=id+'Progress';wrap.className='ba-auto-section-progress';
   Object.assign(wrap.style,{display:'inline-flex',alignItems:'center',gap:'8px',flex:'1 1 90px',minWidth:'48px',marginInline:'8px'});
   const track=document.createElement('progress');track.max=100;
   track.setAttribute('aria-label',badgeNode.parentElement.querySelector('strong')?.textContent?.trim()+' progress');
   Object.assign(track.style,{flex:'1 1 0',width:'100%',minWidth:'20px',height:'6px'});
   const label=document.createElement('span');label.setAttribute('aria-hidden','true');
   Object.assign(label.style,{fontSize:'11px',fontVariantNumeric:'tabular-nums',minWidth:'34px',textAlign:'right'});
   wrap.append(track,label);badgeNode.before(wrap);
  }
  const track=wrap.firstElementChild,label=wrap.lastElementChild;
  if(percent===null)track.removeAttribute('value');else track.value=percent;
  track.setAttribute('aria-label',repair?'Resolve with AI progress':badgeNode.parentElement.querySelector('strong')?.textContent?.trim()+' progress');
  track.style.accentColor=status==='needs-attention'?'var(--vscode-charts-orange,#ffbd6f)':percent===100?'var(--vscode-charts-green,#7fdeb5)':'var(--vscode-charts-blue,#72baff)';
  label.textContent=percent===null?'…':percent+'%';
 }
 function renderReadyPanels(phase){
  const sourceReady=!!source()?.digest;
  const discoveryReady=!!brState?.discoveryRevision&&!!brState?.mappingCompleted&&!discoveryDirty;
  const requirementsReady=requirements().length>0&&phase!=='running'&&!brState?.baDraftQuality?.excluded?.length;
  const jiraReady=rowsForTable().length>0&&phase!=='running';
  // Use exactly the same completed-cycle index as the history renderer.
  // Approval and partial Jira links are not completed publication.
  const completedGroups=ATGVCompletedBRHistory.group(completedBARecords());
  const completedReady=completedGroups.length>0;
  const historyList=get('baCompletedList');
  historyList.classList.toggle('hidden',!completedReady);
  const empty=get('baAutoHistoryEmpty');
  empty.hidden=completedReady;
  empty.textContent=phase==='publishing'?'Publishing Jira changes. Completed requirements appear after publication is recorded.':
   phase==='published'?'No completed history is recorded for this project. Refresh affected artifacts or download the troubleshooting log.':
   'No completed requirements yet. Publish approved requirements to Jira to populate this history.';
  const uploadTarget=get('baAutoOriginalFiles');
  if(sourcePanel.parentElement!==uploadTarget)uploadTarget.append(sourcePanel);
  get('baAutoSourceEntry').hidden=true;
  const discoveryTarget=get('baAutoDiscoveryForm'),discoveryForm=get('discoveryForm');
  if(discoveryForm.parentElement!==discoveryTarget)discoveryTarget.append(discoveryForm);
  get('baAutoDiscoveryEntry').hidden=true;
  const phaseRunning=phase==='running'||phase==='publishing';
  const excluded=!!brState?.baDraftQuality?.excluded?.length;
  const allApproved=requirementsReady&&requirements().every(br=>['approved','published','completed'].includes(String(br.status||'').toLowerCase())&&!br.needsRefresh&&!br.externalReviewRequired&&!br.roleReviewRequired&&!br.dependencyReviewRequired);
  const previewCurrent=currentJiraPreview();
  const sourceStatus=!sourceReady?'not-started':artifactDirty()||phase==='running'&&!brState.mappingCompleted?'in-progress':brState.mappingCompleted?'ready':'in-progress';
  const discoveryStatus=!sourceReady?'not-started':discoveryDirty?'in-progress':discoveryReady?'ready':'in-progress';
  const requirementsStatus=generatedRequirementsStatus({sourceReady,discoveryReady,excluded,requirementsReady,allApproved,phase,previewCurrent,unsaved:dirty()});
  const jiraStatus=(state?.preview?.conflicts?.length||(state?.preview?.reopenSkipped||state?.reopenSkipped||[]).length)?'needs-attention':phase==='published'?'completed':
   phaseRunning?'in-progress':phase==='ready'&&previewCurrent&&!dirty()?'ready':jiraReady?'in-progress':'not-started';
  const historyStatus=completedReady?'completed':'not-started';
  const panels=[
   ['baAutoSource',sourceStatus],['baAutoDiscovery',discoveryStatus],
   ['baAutoRequirements',requirementsStatus],['baAutoJira',jiraStatus],
   ['baAutoHistory',historyStatus]];
  const progress=sectionProgress({register:brState,brs:requirements(),rows:rowsForTable(),
   preview:state?.preview,groups:completedGroups,statuses:Object.fromEntries(panels),unsaved:dirty(),discoveryFilled:discoveryDirty?currentDiscoveryReadiness().filled:undefined});
  for(const [id,status] of panels){
   const repairing=id==='baAutoRequirements'&&aiResolve.running;
   const displayStatus=repairing?'in-progress':id==='baAutoHistory'&&progress[id]<100&&status==='completed'?'in-progress':status;
   setReadyPanel(id,displayStatus);
   badge(id+'Badge',displayStatus);
   renderSectionProgress(id,repairing?Math.min(99,Math.max(progress[id],aiRepairProgress(aiResolve.message)??0)):progress[id],displayStatus,repairing);
  }
 }

 function render(){
  placeSkill();
  const showingBusinessRequirements=selectedRole==='business-analyst'&&['baOverview','discovery'].includes(view);
  const aiWorking=showingBusinessRequirements&&(
   state?.projectId===activeId&&['running','publishing'].includes(state?.phase)||aiResolve.running||discoveryImportBusy);
  // Show the header waveform throughout the BA workflow; run stronger CMYK
  // waves only during real AI activity, never solely because the page is open.
  document.body.classList.toggle('atgv-ba-ai-active',showingBusinessRequirements);
  window.ATGVMyWorkChat?.setBusinessRequirementsActivity?.(aiWorking);
  window.ATGVMyWorkChat?.setBusinessRequirementsVisible?.(showingBusinessRequirements);
  window.ATGVSyncMyWorkHeaderWaveHost?.();
  if(!active()||!activeId||!brState)return;
  if(!source()&&sourceDigest)state=null;
  if(requestedProject!==activeId){
   if(!dirty())resetWorkflowPanels();
   requestedProject=activeId;state=null;collapsed.clear();brKey='';tableKey='';aiResolve={running:recoveryAction?.project===activeId&&recoveryAction.action==='repair',message:'',stopping:false};
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
   const ownership=get('baAutoOwnership');ownership.hidden=!foreignOwners().length;ownership.textContent=ownership.hidden?'':readOnlyMessage();
  get('baAutoProcessLog').disabled=!activeId||baProcessLogPendingProject===activeId;
  refresh.disabled=sharedReadOnly()||!source()||busy()||unsaved||!!baBusyTask||discoveryImportBusy;
   refresh.title=foreignOwners().length?readOnlyMessage():'Refresh Affected Artifacts';
  stop.classList.toggle('hidden',phase!=='running');
  const publishLabel=phase==='publishing'?'Publishing…':'Approved and Publish';publish.textContent=publishLabel;
  publish.title=publishLabel;publish.setAttribute('aria-label',publishLabel);
  const completed=ATGVCompletedBRHistory.group(completedBARecords()).length>0;
  publish.disabled=sharedReadOnly()||!canPublishPrepared(phase,unsaved,completed);
  if(completed&&!currentJiraPreview()&&!publish.disabled)publish.title='Check published requirements and refresh the Jira preview if needed.';if(foreignOwners().length)publish.title=readOnlyMessage();
  const reopen=state?.preview?.reopenRows?.length||0;
  const skipped=(state?.preview?.reopenSkipped||state?.reopenSkipped||[]).length;
  const statusWarning=skipped?' '+skipped+' Jira status reset(s) unavailable; publishing can continue.':'';
  const messages={idle:source()?'Preparing source…':'Upload a document to start.',running:'Preparing affected artifacts…',draft:'Draft. Refresh affected artifacts to continue.',
   ready:!currentJiraPreview()?'Jira preview is out of date. Refresh affected artifacts.':reopen?reopen+' linked Jira item'+(reopen===1?'':'s')+' will move to To Do.':'Jira preview is ready.',
   publishing:'Publishing approved changes to Jira…',published:'Jira publication is up to date.'};
  const detail=unsaved?'Save your edits to refresh the affected artifacts.':state?.error||((messages[phase]||'')+(['ready','published'].includes(phase)?statusWarning:''));
  if(get('baAutoStatus').textContent!==detail)get('baAutoStatus').textContent=detail;
  const discoverySave=get('discoverySave');
  discoverySave.type='submit';discoverySave.textContent='Save Discovery';
  discoverySave.classList.remove('hidden');discoverySave.disabled=!discoveryDirty||!baCanEdit('ba-discovery')||busy()||!source()||!!baBusyTask;
  get('baStartPanel').classList.remove('hidden');
  get('baCompletedSection').classList.remove('hidden');
  sourcePanel.classList.remove('hidden');
  renderBACompletedRecords();
  renderReadyPanels(phase);
  renderArtifacts();renderRequirements();renderJira();
  // The extension host repairs findings within preparation; do not launch a second repair from render().
 }


 function updateJiraFieldButtons(){
  const disabled=busy()||!!baBusyTask||!baCanEdit('ba-discovery')||jiraFieldLoading;
  get('baAutoJiraFieldsRefresh').disabled=jiraFieldLoading||jiraFieldDirty;
  get('baAutoJiraFieldsSave').disabled=disabled||!jiraFieldView||!jiraFieldDirty;
  for(const box of get('baAutoJiraFieldsList').querySelectorAll('input'))box.disabled=disabled||box.dataset.locked==='true';
 }
 function loadJiraFields(){
  if(!active()||!sourceDigest||jiraFieldLoading)return;
  jiraFieldLoading=true;get('baAutoJiraFieldsStatus').textContent='Loading available Jira work item types and fields…';
  updateJiraFieldButtons();invoke('baJiraFieldSelectionLoad',{digest:sourceDigest,requestId:++jiraFieldRequest});
 }
 function drawJiraFields(value){
  jiraFieldView=value;const root=get('baAutoJiraFieldsList');root.replaceChildren();
  const saved=value.selection||{};
  for(const type of value.types){
   const section=document.createElement('details');section.className='ba-jira-fields-type';
   const summary=document.createElement('summary');summary.textContent=type.name+' · '+type.fields.length+' fields';section.append(summary);
   const table=document.createElement('table');table.className='ba-jira-field-selection-table';
   const header=table.createTHead().insertRow();
   for(const label of ['Populate','Field','Type','Requirement']){const th=document.createElement('th');th.textContent=label;header.append(th);}
   const body=table.createTBody();
   for(const field of type.fields){
    const row=body.insertRow(),cell=row.insertCell(),box=document.createElement('input');box.type='checkbox';box.dataset.type=type.id;box.dataset.field=field.id;box.dataset.locked=String(field.required||field.managed||!field.supported);
    box.checked=field.required||field.managed||(field.supported&&(!value.configured||(saved[type.id]||[]).includes(field.id)));
    box.setAttribute('aria-label','Populate '+type.name+' / '+field.name);
    box.addEventListener('change',()=>{jiraFieldDirty=true;updateJiraFieldButtons();});cell.append(box);
    for(const text of [field.name,field.type,field.managed?'ATGV managed':field.required?'Required':field.supported?'Optional':'Not auto-populated'])row.insertCell().textContent=text;
   }
   section.append(table);root.append(section);
  }
  get('baAutoJiraFieldsStatus').textContent='Jira project '+value.project+' · '+value.types.length+' available work item types';
  updateJiraFieldButtons();
 }
 get('baAutoJiraFieldsRefresh').addEventListener('click',()=>{jiraFieldView=null;loadJiraFields();});
 get('baAutoJiraFieldsSave').addEventListener('click',()=>{
  if(!jiraFieldView||!jiraFieldDirty||jiraFieldLoading)return;
  const selections=Object.fromEntries(jiraFieldView.types.map(t=>[t.id,[]]));
  for(const box of get('baAutoJiraFieldsList').querySelectorAll('input'))if(box.checked&&box.dataset.locked!=='true')selections[box.dataset.type].push(box.dataset.field);
  jiraFieldLoading=true;updateJiraFieldButtons();
  invoke('baJiraFieldSelectionSave',{digest:sourceDigest,revision:brState.revision,selection:selections,requestId:++jiraFieldRequest});
 });

 get('baAutoDocumentTabs').addEventListener('click',event=>{
  const selected=event.target.closest('[data-ba-document]');
  if(!selected||selected.dataset.baDocument===kind)return;
  if(jiraFieldDirty){get('baAutoJiraFieldsStatus').textContent='Save your field selection before switching tabs.';return;}
  if(artifactDirty()){get('baAutoArtifactStatus').textContent='Save your edits before switching documents.';return;}
  kind=selected.dataset.baDocument;
  artifactContext=null;input.value='';resetQuill();
  renderArtifacts();
  if(kind==='preflight'&&!get('baSourcePreflight').classList.contains('hidden'))get('baSourcePreflight').open=true;
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
 get('baAutoSource').addEventListener('click',event=>{
  if(!artifactDirty()&&!jiraFieldDirty)return;
  const destructive=event.target.closest('.source-document-actions button,.source-document-row .ba-process-btn,[data-br-delete-action="true"]');
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
 get('baAutoQuillUndo').addEventListener('click',()=>artifactQuill?.history.undo());
 get('baAutoQuillRedo').addEventListener('click',()=>artifactQuill?.history.redo());
 quillRetry.addEventListener('click',()=>{
  if(quillRetry.disabled||artifactDirty())return;
  quillRetrying=true;quillRetry.disabled=true;
  get('baAutoArtifactStatus').textContent='Loading verified Quill assets…';
  invoke('librarySync',{fromBAQuill:true,query:'',category:'All',scope:'user'});
 });
 input.addEventListener('input',render);
 get('discoveryForm').addEventListener('input',()=>{if(active()&&brState)renderReadyPanels(state?.phase||'idle');});
 get('baAutoArtifactSave').addEventListener('click',()=>{
  if(get('baAutoArtifactSave').disabled||!artifactContext)return;
  get('baAutoArtifactSave').disabled=true;
  input.readOnly=true;
  artifactQuill?.enable(false);
  const text=input.value;
  get('baAutoArtifactStatus').textContent='Saving document…';
  invoke('baSaveArtifact',{kind,digest:sourceDigest,requestId:++request,revision:artifactContext.revision,text});
 });
 // The existing host validates ownership and source evidence and logs each repair.
 // Observe verified workflow snapshots; never use log text as executable instructions.
 function recoveryEvidence(){
  if(recoveryAction||!active()||!activeId||!brState||state?.projectId!==activeId||!source()?.digest||
   !brState.discoveryRevision||!brState.mappingCompleted||dirty()||busy()||baBusyTask||discoveryImportBusy||
   !baCanEdit('ba-discovery')||baOwnerState?.cached||baOwnerState?.scope==='local')return null;
  if(!['ready','draft','published'].includes(state.phase))return null;
  const findings=(brState.baDraftQuality?.excluded||[]).filter(row=>requirements().some(br=>br.id===row.id));
  const eligible=findings.filter(row=>requirements().some(br=>br.id===row.id&&br.status==='draft'&&baCanEdit('ba-br-'+br.id)));
  const roles=missingDraftTaskRoles();
   if(eligible.length||roles.length)return {eligible:true,action:'repair',remaining:eligible.length+roles.length,fingerprint:JSON.stringify([eligible.map(row=>[row.id,row.field,row.reason]).sort(),roles.map(row=>row.path).sort()])};
  if(findings.length)return null;
  // A stale preview can be refreshed, but do not guess missing SDLC roles,
  // resolve permission conflicts, or repeat an already-current conflicting plan.
  if(requirements().length&&!sharedReadOnly()&&!currentJiraPreview()&&
    (!state.preview||state.preview.revision!==brState.revision)&&!get('baAutoRefresh').disabled)
   return {eligible:true,action:'preview',remaining:1,fingerprint:String(brState.revision)};
  if(currentJiraPreview())recovery?.complete(activeId);
  return null;
 }
 function startAttentionRepair(){
  if(get('baAutoResolveAttention').disabled)return false;
  aiResolve={running:true,message:'AI is reviewing the exact quality findings and verified source evidence…',stopping:false};
  render();
  invoke('baAutoResolveAttention',{revision:brState.revision});
  return true;
 }
 get('baAutoResolveAttention').addEventListener('click',()=>{
  if(get('baAutoResolveAttention').disabled||recoveryAction)return;
  if(recovery){
   recovery.resume(activeId);
   const evidence=recoveryEvidence();
   if(evidence?.action==='repair'&&recovery.begin(activeId,evidence))recoveryAction={project:activeId,action:'repair'};
  }
  get('baAutoRequirements').open=true;startAttentionRepair();
 });
 get('baAutoResolveStop').addEventListener('click',()=>{
  if(aiResolve.stopping)return;
  recovery?.pause(activeId);
  if(aiResolve.running){
   aiResolve.stopping=true;
   aiResolve.message='Stopping AI repair without publishing to Jira…';
   invoke('baStopAttentionResolve');
  }
  render();
 });
 get('baAutoRefresh').addEventListener('click',()=>{if(!sharedReadOnly()&&!get('baAutoRefresh').disabled&&!recoveryAction){recovery?.resume(activeId);pendingRefreshProject=activeId;render();invoke('baRefreshArtifacts');}});
 get('baAutoStop').addEventListener('click',()=>{recovery?.pause(activeId);invoke('baStopPreparation');});
 get('baAutoPublish').addEventListener('click',()=>{
  if(sharedReadOnly()||get('baAutoPublish').disabled)return;
   get('baAutoPublish').disabled=true;
  invoke('baPublishPrepared',{revision:state?.preview?.revision,registerRevision:brState?.revision});
 });

 window.addEventListener('atgv:viewchange',()=>{
  if(!active()){requestedProject='';if(!dirty())resetWorkflowPanels();}
  render();
 });
 window.addEventListener('message',({data:m})=>{
  if(!m)return;
   if(m.type==='librarySyncResult'&&quillRetrying){
    quillRetrying=false;quillRetry.disabled=false;
    get('baAutoArtifactStatus').textContent=m.message||'Library sync finished. Reopen Business Documents if the editor reloads.';
   }
  if(m.projectId===activeId&&m.requestId===jiraFieldRequest&&['baJiraFieldSelectionLoaded','baJiraFieldSelectionSaved','baJiraFieldSelectionError'].includes(m.type)){
   jiraFieldLoading=false;
   if(m.type==='baJiraFieldSelectionLoaded'){jiraFieldDirty=false;drawJiraFields(m.value);}
   else if(m.type==='baJiraFieldSelectionSaved'){jiraFieldDirty=false;drawJiraFields(m.value);get('baAutoJiraFieldsStatus').textContent='Saved. Jira preview will use the selected fields.';}
   else{get('baAutoJiraFieldsStatus').textContent=m.message;updateJiraFieldButtons();}
   return;
  }
  if(m.projectId===activeId&&m.type==='baAutoResolveProgress'){
   aiResolve.running=true;
   if(!aiResolve.stopping)aiResolve.message=String(m.message||'AI is repairing source-backed quality findings…');
   render();return;
  }
  if(m.type==='baAutoResolveResult'&&recoveryAction?.project===m.projectId&&recoveryAction.action==='repair'){
   recovery?.finish(m.projectId,{cancelled:recovery.get(m.projectId).paused||m.cancelled===true,failed:!!(m.error||m.failed),reason:m.error||m.failed?'AI recovery failed; download the troubleshooting log.':undefined});recoveryAction=null;
  }
  if(m.projectId===activeId&&m.type==='baAutoResolveResult'){
   aiResolve.running=false;aiResolve.stopping=false;
   aiResolve.message=String(m.message||'AI repair finished. Review the updated quality findings.');
   render();return;
  }
  if(m.type==='baPreparation'&&m.state?.projectId===recoveryAction?.project&&recoveryAction?.action==='preview'){
   if(m.state.phase==='running')recoveryAction.seenRunning=true;
   else if(recoveryAction.seenRunning||m.state.error){
    const project=recoveryAction.project;
    recovery?.finish(project,{failed:!!m.state.error,cancelled:recovery.get(project).paused,reason:m.state.error?'Jira preview recovery failed; review the troubleshooting log.':undefined});recoveryAction=null;
   }
  }
  if(m.type==='baPreparation'&&m.state?.projectId===activeId){
    if(pendingRefreshProject===activeId)pendingRefreshProject='';
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
    input.value=m.text;resetQuill();
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
