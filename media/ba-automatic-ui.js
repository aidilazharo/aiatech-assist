'use strict';

(function(){
 const get=id=>document.getElementById(id);
 const root=get('discoveryView');
 if(!root?.classList.contains('ba-automatic-view'))return;
 const header=get('workSkill').parentElement;
 const stages=['source','requirements','jira','publish'];
 const kindNames={iso:'Structured ISO BRD',source:'Editable source',original:'Original source text'};
 const sourcePanel=root.querySelector('.source-documents-panel');
 const skill=get('workSkill');
 get('baAutoOriginalFiles').append(sourcePanel);
 get('baAutoDiscoveryForm').append(get('discoveryForm'));
 get('baAutoHistoryContent').append(get('baStartPanel'));
 get('baAutoFeedback').append(get('baInlineStatus'),get('brDeletionProgress'),get('baMilestoneError'));

 let state=null,requestedProject='',artifactProject='',jiraTab='hierarchy',tableKey='',brKey='',kind='iso',sourceDigest='',artifactContext=null,request=0;
 const collapsed=new Set();
 const input=get('baAutoArtifactText');

 const active=()=>view==='discovery'&&selectedRole==='business-analyst';
 const busy=()=>state?.phase==='running'||state?.phase==='publishing';
 const artifactDirty=()=>!!artifactContext&&kind!=='original'&&input.value!==artifactContext.text;
 const dirty=()=>artifactDirty()||discoveryDirty||brEditorDirty;
 const invoke=(command,fields={})=>send(command,{projectId:activeId,roleId:selectedRole,...fields});
 const requirements=()=>brState?.brs?.filter(br=>!br.archivedFromRestart&&!['retired','retire-proposed'].includes(br.status))||[];
 const source=()=>brState?.sourceDocuments?.[0];

 function badge(id,isReady){
  const node=get(id);
  node.dataset.state=isReady?'ready':'draft';
  node.textContent=isReady?'Ready':'Draft';
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

 function requestArtifact(){
  if(!active()||!sourceDigest||artifactDirty())return;
  get('baAutoArtifactLabel').textContent=kindNames[kind];
  get('baAutoArtifactStatus').textContent='Loading document…';
  artifactContext=null;input.readOnly=true;
  invoke('baReadArtifact',{kind,digest:sourceDigest,requestId:++request});
 }

 function renderArtifacts(){
  const currentSource=source()?.digest||'';
  const changed=currentSource!==sourceDigest||artifactProject!==activeId;
  if(changed){
   sourceDigest=currentSource;artifactProject=activeId;artifactContext=null;input.value='';
   get('baAutoArtifactStatus').textContent='';
  }
  get('baAutoSourceEditor').hidden=!sourceDigest;
  if(currentSource&&get('baAutoSource').open&&changed)requestArtifact();
  if(artifactContext){
   input.readOnly=kind==='original'||busy()||!baCanEdit('ba-discovery');
   get('baAutoArtifactSave').disabled=input.readOnly||!artifactDirty()||!input.value.trim();
  }else get('baAutoArtifactSave').disabled=true;
 }

 function renderRequirements(){
  const brs=requirements();
  const body=get('baAutoBRList');
  get('baAutoBRCount').textContent=brs.length?brs.length+' individual BR'+(brs.length===1?'':'s'):'';
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
   .map(([path,link])=>({path,title:link.title||link.key,key:link.key,kind:link.kind,jiraType:link.issueType}));
 }

 function rowsForTable(){
  const preview=state?.preview;
  const brs=requirements();
  const byRoot=new Set(brs.map(br=>br.id));
  const work=new Map((preview?.rows||publishedRows(byRoot)).map(row=>[row.path,row]));
  const changes=new Map((preview?.changes||[]).map(row=>[row.path,row]));
  for(const row of changes.values())if(!work.has(row.path))work.set(row.path,row);
  const resets=new Map((preview?.reopenRows||[]).map(row=>[row.key,row]));
  const rows=[];
  for(const br of brs){
   rows.push({id:br.id+'::br',path:br.id,title:br.title,type:'BR',category:'br',depth:0,br:br.id});
   for(const [path,node] of work){
    if(path.split('/')[0]!==br.id)continue;
    const edited=changes.get(path);
    const type=node.jiraType||node.kind||'Task';
    const category=String(type).toLowerCase().replace(/[\s_-]+/g,'');
    const parent=path.includes('/')?path.slice(0,path.lastIndexOf('/')):null;
    rows.push({id:path,path,title:edited?.title||node.title||path,type,category,
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
  const key=JSON.stringify([state?.preview?.revision,brState?.revision,state?.phase,jiraTab,[...collapsed]]);
  if(tableKey===key)return;
  tableKey=key;
  const hierarchy=jiraTab==='hierarchy',byId=new Map(rows.map(row=>[row.id,row]));
  const hasChildren=new Set(rows.map(row=>row.parent).filter(Boolean));
  const shown=rows.filter(row=>{
   if(!hierarchy)return row.category===jiraTab||row.kind===jiraTab;
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
   {key:'key',label:'Jira key',sortable:!hierarchy,render:row=>jiraKeyNode(row.key||'—')},
   {key:'status',label:'Change',sortable:!hierarchy},
   {key:'action',label:'Action',sortable:false,render:row=>{
    const canPreview=row.entry&&row.entry.action!=='retire';
    const action=button(canPreview?'Edit Jira item':row.category==='br'?'Open BR':row.key?'Open Jira item':'View',()=>{
     if(row.category==='br')openBREditor(row.br,{artifact:true});
     else if(canPreview)renderJiraIssueDetails(row.entry,false,{automatic:true});
     else if(row.key)openJiraIssueModal(row.key);
    });
    action.disabled=busy()||!(canPreview||row.key||row.category==='br');return action;
   }}
  ],{label:'Business Requirements Jira work items',pageSize:5});
 }

 function render(){
  placeSkill();
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
  get('baAutoAI').classList.toggle('is-active',phase==='running');
  get('baAutoAIStatus').textContent=phase==='running'?'ATGV AI working':'ATGV AI idle';
  window.ATGVMyWorkChat?.setBusinessRequirementsActivity?.(phase==='running');
  for(const step of root.querySelectorAll('[data-ba-auto-stage]')){
   const index=stages.indexOf(step.dataset.baAutoStage);
   const complete=phase==='published'||index<current||ready&&index<3;
   step.dataset.state=complete?'ready':index===current&&busy()?'running':index===3&&phase==='ready'?'manual':'draft';
   step.firstElementChild.textContent=complete?'✓':String(index+1);
   if(!complete&&((busy()&&index===current)||(phase==='ready'&&index===3)))step.setAttribute('aria-current','step');
   else step.removeAttribute('aria-current');
  }
  badge('baAutoSourceBadge',!!brState.mappingCompleted&&!artifactDirty()&&phase!=='running'&&(current>0||ready));
  badge('baAutoDiscoveryBadge',!!brState.discoveryRevision&&!discoveryDirty&&(current>1||ready));
  badge('baAutoRequirementsBadge',!!requirements().length&&!brEditorDirty&&phase!=='running'&&(current>1||ready));
  badge('baAutoJiraBadge',ready&&!unsaved);
  const refresh=get('baAutoRefresh'),stop=get('baAutoStop'),publish=get('baAutoPublish');
  refresh.disabled=!source()||busy()||unsaved||!!baBusyTask||discoveryImportBusy;
  stop.classList.toggle('hidden',phase!=='running');
  publish.textContent=phase==='publishing'?'Publishing…':state?.preview?.republish?'Republish to Jira':'Publish to Jira';
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
  renderArtifacts();renderRequirements();renderJira();
 }

 get('baAutoDocumentTabs').addEventListener('click',event=>{
  const selected=event.target.closest('[data-ba-document]');
  if(!selected||selected.dataset.baDocument===kind)return;
  if(artifactDirty()){get('baAutoArtifactStatus').textContent='Save your edits before switching documents.';return;}
  kind=selected.dataset.baDocument;
  for(const option of get('baAutoDocumentTabs').querySelectorAll('button'))option.setAttribute('aria-pressed',String(option===selected));
  requestArtifact();
 });
 get('baAutoJiraTabs').addEventListener('click',event=>{
  const tab=event.target.closest('[data-ba-jira-tab]');
  if(!tab)return;
  jiraTab=tab.dataset.baJiraTab;
  for(const option of get('baAutoJiraTabs').querySelectorAll('button'))option.setAttribute('aria-pressed',String(option===tab));
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
   window.ATGVMyWorkChat?.setBusinessRequirementsActivity?.(state.phase==='running');
   if(previous==='running'&&state.phase!=='running'&&active()&&get('baAutoSource').open&&!artifactDirty())requestArtifact();
  }else if(m.projectId===activeId&&m.requestId===request){
   if(m.type==='baArtifactRead'&&m.digest===sourceDigest&&m.kind===kind){
    artifactContext={revision:m.revision,text:m.text};
    input.value=m.text;
    get('baAutoArtifactStatus').textContent='';
    render();
   }else if(m.type==='baArtifactSaved'){
    artifactContext=null;
    get('baAutoArtifactStatus').textContent='Document saved.';
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
  target.open=true;target.scrollIntoView({block:'nearest'});return true;
 }
 window.ATGVBusinessRequirements={render,active,busy,placeSkill,dirty,openStage};
 render();
})();
