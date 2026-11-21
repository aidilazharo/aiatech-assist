'use strict';
// Shared My Work AI. The visual waits for guidance before showing copy or buttons.
// Suggestions are read-only; buttons navigate to existing role workflows only.
(function(){
  const byId=id=>document.getElementById(id);
  const root=()=>byId('atgvMyWorkAi');
  const safe=(value,max=480)=>String(value==null?'':value).replace(/[\x00-\x1f]/g,' ').trim().slice(0,max);
  const routes=Object.freeze({
    'business-analyst':{target:'discoveryView',fallback:'Review current requirements and resume the next unfinished BR',action:'Resume Business Requirements'},
    'solution-architect':{target:'architectBootstrap',fallback:'Review approved requirements and architecture prerequisites',action:'Review Architecture'},
    'ux-designer':{target:'uxDesignWorkspace',fallback:'Review assigned design tasks and developer handoff',action:'Continue UI/UX Design'},
    'software-developer':{target:'developerTaskDashboard',fallback:'Review assigned Jira tickets and your active development branch',action:'Continue Development'},
    'project-manager':{target:'pmDailyCockpit',fallback:'Review delivery progress and Jira blockers',action:'Review Project Delivery'},
    'qa-engineer':{target:'roleStepFlow',fallback:'Review Acceptance Criteria and pending test coverage',action:'Review QA Work'},
    'product-owner':{target:'roleStepFlow',fallback:'Review the prioritized backlog and decision dependencies',action:'Review Product Backlog'},
    'scrum-master':{target:'roleStepFlow',fallback:'Review sprint impediments and team dependencies',action:'Review Sprint Work'},
    'security-engineer':{target:'roleStepFlow',fallback:'Review threat assessments and outstanding security evidence',action:'Review Security Work'},
    'data-engineer':{target:'roleStepFlow',fallback:'Review data model, migrations and data quality tasks',action:'Review Data Work'},
    'uat-tester':{target:'roleStepFlow',fallback:'Review UAT scenarios and business sign-off evidence',action:'Review UAT Work'},
    'technical-writer':{target:'roleStepFlow',fallback:'Review documentation gaps and release notes',action:'Review Documentation'},
    'operations-support':{target:'roleStepFlow',fallback:'Review operations readiness, monitoring and incidents',action:'Review Operations'},
    'release-manager':{target:'roleStepFlow',fallback:'Review release gates, test evidence and rollback',action:'Review Release Readiness'},
    'technical-lead':{target:'roleStepFlow',fallback:'Review implementation risks and pending code reviews',action:'Review Technical Work'},
    'business-owner':{target:'roleStepFlow',fallback:'Review business decisions and outstanding approvals',action:'Review Approval Work'},
    'ai-ml-engineer':{target:'roleStepFlow',fallback:'Review model evaluations, monitoring and data dependencies',action:'Review AI/ML Work'},
    'compliance-officer':{target:'roleStepFlow',fallback:'Review compliance evidence, risks and exceptions',action:'Review Compliance'}
  });
  let signature='',project='',role='',pending=0,lastSnapshot=null,latest=null,lastAnswered=0,dailyBrief=null;
  let requestTimer=null,successTimer=null,watchdogTimer=null;
  function clearTimers(){
    clearTimeout(requestTimer);clearTimeout(successTimer);clearTimeout(watchdogTimer);
  }
  function state(name){
    const panel=root();if(!panel)return;
    panel.dataset.state=name;
    const label={
      idle:'AI ready',thinking:'AI reviewing current work',
      success:'AI recommendation ready',complete:'AI recommendation displayed'
    };
    byId('atgvMyWorkAiOrb')?.setAttribute('aria-label',label[name]||label.idle);
  }
  function displayResults(visible){
    const content=byId('atgvMyWorkAiContent');
    if(content)content.hidden=!visible;
  }
  function nextStep(snapshot){
    const info=routes[snapshot.roleId]||{
      target:'roleStepFlow',fallback:'Review the next available step in your role workflow',action:'Continue My Work'
    };
    const pendingTask=snapshot.tasks?.find(t=>!t.done&&t.title);
    const pendingIssue=snapshot.assigned?.find(t=>t.key&&!/^(done|closed|resolved)$/i.test(t.status));
    const pendingBr=snapshot.requirements?.find(b=>b.id&&!/^(approved|published|complete|completed)$/i.test(b.status));
    let suggestion='';
    if(snapshot.roleId==='business-analyst'&&pendingBr)
      suggestion='Continue '+pendingBr.id+' ('+safe(pendingBr.status,42)+') and verify the next requirements milestone.';
    else if((snapshot.roleId==='software-developer'||snapshot.roleId==='ux-designer')&&pendingIssue)
      suggestion='Continue '+pendingIssue.key+' ('+safe(pendingIssue.status,42)+') and review its next role-specific step.';
    else if(snapshot.next&&!/^(all local activities completed|business requirement flow completed)$/i.test(snapshot.next))
      suggestion='Continue with: '+safe(snapshot.next,180)+'.';
    else if(pendingTask)
      suggestion='Complete the next pending step: '+safe(pendingTask.title,145)+'.';
    else suggestion=info.fallback+'.';
    return {suggestion,action:info.action,target:info.target};
  }
  function navigateToWork(){
    if(!root()||root().closest('main')?.classList.contains('hidden'))return;
    if(!project||!role){if(typeof navigate==='function')navigate('projects');return;}
    // A missing deadline/connection is an actionable settings prerequisite.
    // Never route an unrelated AI-generated label to arbitrary commands.
    const target=dailyBrief?.todayActions?.[0]?.target||'';
    // Host-originated, allowlisted navigation targets only. AI text is never
    // interpreted as a command or a destination.
    if(target==='project-settings'||target==='projects'){
      if(typeof navigate==='function')navigate(target);
      return;
    }
    // Suggestions leave the AI-only My Work page and open the selected role's
    // existing workflow on the dedicated Role Workspace page.
    if(typeof navigate==='function')navigate(target==='discovery'?'discovery':role==='business-analyst'?'discovery':'role-workspace');
    const workspace=byId('workView'),target=routes[role]?.target||'roleStepFlow';
    const element=byId(target);
    if(workspace&&!workspace.classList.contains('hidden')&&element&&!element.classList.contains('hidden'))
      element.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderPersistentNext(){
    const button=byId('atgvMyWorkAiNextButton'),summary=byId('atgvMyWorkAiNextSummary');
    if(!button||!summary)return;
    button.textContent='What to do next';
    button.disabled=false;
    const today=dailyBrief?.todayActions?.[0]?.label;
    const fallback=latest?nextStep(latest).suggestion:'Open a project and select a role to start.';
    summary.textContent=safe(today||fallback,180);
    button.setAttribute('aria-label','What to do next: '+safe(today||fallback,150));
  }
  function actionButtons(label){
    const list=byId('atgvMyWorkAiActions');if(!list)return;
    list.replaceChildren();
    const primary=document.createElement('button');
    primary.type='button';
    primary.textContent=safe(label,90)||nextStep(latest).action;
    primary.className='atgv-mywork-ai-button';
    primary.addEventListener('click',navigateToWork);
    list.append(primary);
    const again=document.createElement('button');
    again.type='button';again.textContent='Review again';
    again.className='atgv-mywork-ai-button';
    again.addEventListener('click',()=>{signature='';if(lastSnapshot)update(lastSnapshot);});
    list.append(again);
  }
  function result(message,action,error,requestId){
    if(requestId!==pending||!latest||!root())return;
    lastAnswered=requestId;
    clearTimeout(watchdogTimer);
    clearTimeout(successTimer);
    const next=nextStep(latest);
    const supplied=safe(message,420);
    byId('atgvMyWorkAiTitle').textContent='AI · '+latest.roleName+' · Next step';
    const text=supplied||next.suggestion;
    if(typeof window.ATGVMyWorkChat?.showSuggestion==='function')window.ATGVMyWorkChat.showSuggestion(text);
    else byId('atgvMyWorkAiText').textContent=text;
    actionButtons(action||next.action);
    renderPersistentNext();
    displayResults(true);
    if(error){state('idle');return;}
    state('success');
    successTimer=setTimeout(()=>{if(requestId===pending)state('complete');},1250);
  }
  function update(snapshot){
    if(!snapshot||!snapshot.projectId||!snapshot.roleId||!root())return;
    lastSnapshot=snapshot;
    const compact={
      projectId:safe(snapshot.projectId,90),roleId:safe(snapshot.roleId,80),
      roleName:safe(snapshot.roleName,100),progress:safe(snapshot.progress,35),
      next:safe(snapshot.next,180),
      tasks:Array.isArray(snapshot.tasks)?snapshot.tasks.slice(0,16).map(t=>({title:safe(t.title,120),done:t.done===true})):[],
      assigned:Array.isArray(snapshot.assigned)?snapshot.assigned.slice(0,8).map(t=>({key:safe(t.key,40),status:safe(t.status,60)})):[],
      requirements:Array.isArray(snapshot.requirements)?snapshot.requirements.slice(0,10).map(b=>({id:safe(b.id,40),status:safe(b.status,50)})):[]
    };
    const newSignature=JSON.stringify(compact);
    if(newSignature===signature)return;
    if(project!==compact.projectId||role!==compact.roleId)dailyBrief=null;
    signature=newSignature;latest=compact;project=compact.projectId;role=compact.roleId;
    renderPersistentNext();
    const requestId=++pending;
    clearTimers();
    // Provide a verified navigation button immediately; the AI only refines the explanation.
    const next=nextStep(compact);
    byId('atgvMyWorkAiText').textContent=next.suggestion;
    actionButtons(next.action);
    displayResults(true);state('thinking');
    requestTimer=setTimeout(()=>{
      if(requestId!==pending)return;
      if(typeof send==='function')send('roleAiReview',{projectId:project,roleId:role,context:compact,requestId});
      else{
        const next=nextStep(compact);
        result(next.suggestion,next.action,true,requestId);
      }
    },300);
    // Even if the provider is offline or never returns, offer a grounded next step.
    watchdogTimer=setTimeout(()=>{
      if(requestId!==pending||lastAnswered===requestId)return;
      const next=nextStep(compact);
      result(next.suggestion,next.action,true,requestId);
    },18000);
  }
  byId('atgvMyWorkAiNextButton')?.addEventListener('click',navigateToWork);
  renderPersistentNext();
  window.addEventListener('message',event=>{
    const msg=event.data||{};
    if(msg.projectId!==project||msg.roleId!==role)return;
    if(msg.type==='roleAiDailyBrief'&&msg.requestId===pending){
      dailyBrief=msg.brief&&typeof msg.brief==='object'?msg.brief:null;
      renderPersistentNext();
      return;
    }
    if(msg.type==='roleAiSuggestion'&&msg.requestId===pending)
      result(msg.message,msg.actionLabel,msg.error===true,msg.requestId);
  });
  // A new visit rechecks today's recommendations rather than displaying a
  // stale previous day's summary, without clearing the user's chat history.
  window.ATGVMyWorkAI={update,refresh(){
    signature='';
    if(lastSnapshot)update(lastSnapshot);
    else renderPersistentNext();
  }};
  let visibleLast=false;
  window.addEventListener('atgv:viewchange',()=>{
    const visible=!!root()&&!root().closest('main')?.classList.contains('hidden');
    if(visible&&!visibleLast)window.ATGVMyWorkAI.refresh();
    visibleLast=visible;
  });
})();