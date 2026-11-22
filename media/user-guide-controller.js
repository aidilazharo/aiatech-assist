'use strict';
(function(){
 const catalog=window.ATGVUserGuide;
 const menu=$('guideMenu'),overlay=$('guideOverlay'),card=$('guideCard');
 let progress={},projectKey=null,tourId='',stepIndex=0,mode='explain',selectedTour='',activeTarget=null,layoutPending=false,restoreFocus=null,emptyWorkspaceDetected=false,autoGuideShown=true,autoGuideAttempted=false;
 const hasWorkspace=()=>workspaceOpened===true;
 const roles=()=>roleData.roles.map(role=>role.id);
 const available=()=>catalog.list(roles(),hasWorkspace());
 const hidden=el=>!el||el.closest('.hidden,[hidden]')!==null||getComputedStyle(el).display==='none'||getComputedStyle(el).visibility==='hidden'||el.getClientRects().length===0;
 const save=(completed=false,skipped=false)=>{if(!tourId)return;const g=catalog.get(tourId);if(!g)return;send('guideSave',{projectId:activeId||null,guideId:tourId,stepId:g.steps[stepIndex].id,completed,skipped});progress[tourId]={stepId:g.steps[stepIndex].id,completed,skipped};};
 function openMenu(preferred){
  if(!overlay.classList.contains('hidden'))closeTour(false);
  restoreFocus=document.activeElement;
  const groupOrder=['Getting Started','Workspace Navigation','My Work · Roles','Business Processes','Connections & Settings'];
  const options=available().sort((a,b)=>groupOrder.indexOf(a.group)-groupOrder.indexOf(b.group));selectedTour=options.find(o=>o.id===preferred)?.id||options.find(o=>o.id===selectedRole)?.id||options[0]?.id||'';
  const items=$('guideMenuTours');items.replaceChildren();
  let lastGroup='';
  for(const g of options){
   if(g.group!==lastGroup){lastGroup=g.group;const heading=document.createElement('div');heading.className='guide-tour-group';heading.textContent=lastGroup;heading.setAttribute('role','heading');heading.setAttribute('aria-level','3');items.append(heading);}
   const label=document.createElement('label');label.className='guide-tour-option';
   const input=document.createElement('input');input.type='radio';input.name='guideTour';input.value=g.id;input.checked=g.id===selectedTour;
   input.addEventListener('change',()=>{selectedTour=g.id;renderMenuStatus();});
   const info=document.createElement('span');info.className='guide-tour-info';const name=document.createElement('strong');name.textContent=g.label;
   const desc=document.createElement('small');desc.textContent=g.description;
   info.append(name,desc);label.append(input,info);
   const state=progress[g.id];if(state?.completed){const badge=document.createElement('span');badge.className='guide-tour-done';badge.textContent='Completed';label.append(badge);}
   items.append(label);
  }
  $('guideMenuStart').disabled=!selectedTour;
  menu.classList.remove('hidden');menu.setAttribute('aria-hidden','false');renderMenuStatus();$('guideMenuClose').focus();
 }
 function renderMenuStatus(){
  const saved=progress[selectedTour];$('guideMenuStatus').textContent=saved?.completed?'Completed · Replay available':saved?.stepId&&!saved.skipped?'Saved progress available':'';
  $('guideMenuStart').textContent=saved&&!saved.completed&&!saved.skipped?'Resume Tour':'Start Tour';
 }
 function closeMenu(){menu.classList.add('hidden');menu.setAttribute('aria-hidden','true');restoreFocus?.focus?.();}
 function currentStep(){return catalog.get(tourId)?.steps[stepIndex];}
 function closeTour(done,skipped=false){
  if(tourId)save(!!done,!!skipped);
  tourId='';activeTarget=null;overlay.classList.add('hidden');overlay.setAttribute('aria-hidden','true');
  for(const name of ['top','left','right','bottom'])overlay.querySelector(`[data-edge="${name}"]`).style.display='none';
  restoreFocus?.focus?.();
 }
 function start(id){
  const guide=catalog.get(id);if(!guide||!available().some(o=>o.id===id))return;
  mode=document.querySelector('input[name="guideMode"]:checked')?.value==='practice'?'practice':'explain';
  let index=0;const p=progress[id];if(p&&!p.completed&&!p.skipped){index=Math.max(0,guide.steps.findIndex(s=>s.id===p.stepId));}
  closeMenu();tourId=id;stepIndex=index;overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');showStep();
 }
 function stepRoute(step){
  if(step.route==='opening'){if(hasWorkspace())return false;if(view!=='gate')showGate();return true;}
  if(step.route==='settings'){
   if(view!=='settings')navigate('settings');
   return view==='settings';
  }
  if(!hasWorkspace())return false;
  if(step.route==='project-settings'){
   if(view!=='project')navigate('project-settings');
   return view==='project';
  }
  if(step.route==='selected-role'){if(view!=='work')navigate(selectedRole||'sdlc-roles');return view==='work';}
  if(step.route==='overview'){if(view!=='landing')navigate('overview');return view==='landing';}
  if(roles().includes(step.route)){
   if(view!=='work'||selectedRole!==step.route)navigate(step.route);
   return view==='work'&&selectedRole===step.route;
  }
  if(['flow','planning','documents','knowledge','operations','discovery'].includes(step.route)){
   if(view!==step.route)navigate(step.route);
   return view===step.route;
  }
  return true;
 }
 function showStep(){
  if(!tourId)return;
  const guide=catalog.get(tourId),step=currentStep();if(!guide||!step){closeTour(false);return;}
  activeTarget=null;
  const allowed=stepRoute(step);
  $('guideStepCounter').textContent=`${guide.label} · ${stepIndex+1} of ${guide.steps.length}`;
  $('guideStepTitle').textContent=step.title;$('guideStepDescription').textContent=step.description;
  const token=step.id==='jira-token'?'jira':step.id==='confluence-token'?'confluence':step.id==='github-token'?'github':'';
  $('guideStepTokenLink').classList.toggle('hidden',!token);$('guideStepTokenLink').dataset.provider=token;
  $('guideProgressFill').style.width=((stepIndex+1)/guide.steps.length*100)+'%';
  $('guideBack').disabled=stepIndex===0;$('guideNext').textContent=stepIndex===guide.steps.length-1?'Finish':'Next';
  const note=$('guideStepNote');note.classList.add('hidden');note.textContent='';
  if(!allowed){note.textContent='Save pending changes and open the required workspace to view this control.';note.classList.remove('hidden');}
  save();
  setTimeout(()=>{if(tourId&&step===currentStep()){
   const target=document.querySelector(step.selector);
   if(target&&!hidden(target))target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
   requestLayout();card.focus({preventScroll:true});
  }},0);
 }
 function layout(){
  if(!tourId)return;
  const step=currentStep(),target=document.querySelector(step.selector);
  activeTarget=target&&!hidden(target)?target:null;
  const note=$('guideStepNote');if(!activeTarget){note.textContent='This control is not available in the current project or view. You can continue to the next step.';note.classList.remove('hidden');}
  else if(note.textContent.startsWith('This control')){note.textContent='';note.classList.add('hidden');}
  const W=window.innerWidth,H=window.innerHeight;
  let a;if(activeTarget){
   const r=activeTarget.getBoundingClientRect(),pad=5;
   a={left:Math.max(8,r.left-pad),top:Math.max(8,r.top-pad),right:Math.min(W-8,r.right+pad),bottom:Math.min(H-8,r.bottom+pad)};
  }else a={left:W/2-1,top:H/2-1,right:W/2+1,bottom:H/2+1};
  const region={top:[0,0,W,a.top],left:[0,a.top,a.left,a.bottom-a.top],right:[a.right,a.top,W-a.right,a.bottom-a.top],bottom:[0,a.bottom,W,H-a.bottom]};
  for(const [name,coords] of Object.entries(region)){
   const el=overlay.querySelector(`[data-edge="${name}"]`);el.style.display='block';el.style.left=coords[0]+'px';el.style.top=coords[1]+'px';el.style.width=Math.max(0,coords[2])+'px';el.style.height=Math.max(0,coords[3])+'px';
  }
  const ring=$('guideSpotlight');ring.style.cssText=`left:${a.left}px;top:${a.top}px;width:${a.right-a.left}px;height:${a.bottom-a.top}px`;
  const safe=mode==='practice'&&step.interactive&&!!activeTarget;
  ring.style.pointerEvents=safe?'none':'auto';
  const cw=Math.min(380,W-24),ch=card.offsetHeight||260,margin=14;
  let x=Math.min(Math.max(12,a.left),W-cw-12);
  let y=a.bottom+margin;
  if(y+ch>H-12)y=a.top-ch-margin;
  if(y<12)y=Math.min(H-ch-12,Math.max(12,(H-ch)/2));
  card.style.width=cw+'px';card.style.left=Math.max(12,x)+'px';card.style.top=Math.max(12,y)+'px';
  if(safe){note.textContent='Practice: select the highlighted navigation control to advance. Other operations remain manual.';note.classList.remove('hidden');}
 }
 function requestLayout(){if(layoutPending)return;layoutPending=true;requestAnimationFrame(()=>{layoutPending=false;layout();});}
 function next(){const g=catalog.get(tourId);if(!g)return;if(stepIndex===g.steps.length-1){closeTour(true);return;}stepIndex++;showStep();}
 function previous(){if(stepIndex<=0)return;stepIndex--;showStep();}
 $('guideHelp').addEventListener('click',()=>openMenu());$('gateGuideHelp').addEventListener('click',()=>openMenu());$('settingsGuideHelp').addEventListener('click',()=>openMenu('extension-settings'));
 $('guideMenuClose').addEventListener('click',closeMenu);
 menu.addEventListener('click',event=>{if(event.target===menu)closeMenu();});
 $('guideMenuStart').addEventListener('click',()=>start(selectedTour));
 $('guideStepTokenLink').addEventListener('click',()=>{const provider=$('guideStepTokenLink').dataset.provider;if(['jira','confluence','github'].includes(provider))send('guideTokenLink',{provider});});
 $('guideClose').addEventListener('click',()=>closeTour(false));
 $('guideSkip').addEventListener('click',()=>closeTour(false,true));
 $('guideBack').addEventListener('click',previous);$('guideNext').addEventListener('click',next);
 document.addEventListener('click',event=>{
  if(!tourId||mode!=='practice')return;
  const step=currentStep();if(!step?.interactive||!activeTarget)return;
  if(!activeTarget.disabled&&(event.target===activeTarget||activeTarget.contains(event.target)))setTimeout(()=>{if(tourId&&step===currentStep())next();},50);
 },true);
 window.addEventListener('resize',requestLayout);$('contentPane').addEventListener('scroll',requestLayout,{passive:true});
 document.querySelector('.sidebar-scroll').addEventListener('scroll',requestLayout,{passive:true});
 window.addEventListener('atgv:viewchange',requestLayout);
 document.addEventListener('keydown',event=>{
  if(menu.classList.contains('hidden')&&overlay.classList.contains('hidden'))return;
  if(event.key==='Escape'){event.preventDefault();if(!menu.classList.contains('hidden'))closeMenu();else closeTour(false);return;}
  if(!overlay.classList.contains('hidden')&&(event.key==='ArrowRight'||event.key==='ArrowLeft')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
   event.preventDefault();if(event.key==='ArrowRight')next();else previous();
  }
  if(event.key==='Tab'){
   const root=!menu.classList.contains('hidden')?menu:card;
   const nodes=[...root.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(el=>!hidden(el));
   if(!nodes.length)return;
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 });
 window.addEventListener('message',event=>{
  const m=event.data||{};
  if(m.type==='guideProgress'&&m.projectId===(activeId||null)){
   progress=m.progress||{};projectKey=m.projectId||'opening';if(!menu.classList.contains('hidden'))openMenu();maybeAutoStart();
  }
  if(m.type==='guideSaved')progress[m.guideId]=m.value;
  if(m.type==='state')setTimeout(()=>{
   emptyWorkspaceDetected=m.emptyWorkspace===true&&!!m.workspace&&!activeId;autoGuideShown=m.guideAutoShown===true;
   const key=activeId||'opening';if(key!==projectKey){projectKey=key;if(tourId)closeTour(false);send('guideLoad');}
   else if(tourId)requestLayout();
   maybeAutoStart();
  },0);
 });
 function maybeAutoStart(){
  if(autoGuideAttempted||autoGuideShown||!emptyWorkspaceDetected||!catalog.get('opening'))return;
  if(!progress.opening||!menu.classList.contains('hidden')||!overlay.classList.contains('hidden'))return;
  autoGuideAttempted=true;send('guideAutoShown');start('opening');
 }
 send('guideLoad');
})();
