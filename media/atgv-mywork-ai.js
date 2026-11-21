'use strict';
// Shared My Work AI. The visual waits for guidance before showing copy or buttons.
// Suggestions are read-only; buttons navigate to existing role workflows only.
(function(){
  const byId=id=>document.getElementById(id);
  const root=()=>byId('atgvMyWorkAi');
  const safe=(value,max=480)=>String(value==null?'':value).replace(/[\x00-\x1f]/g,' ').trim().slice(0,max);
  const routes=Object.freeze({
    'business-analyst':{target:'discoveryView',fallback:'Review your Business Requirements',action:'Continue Business Requirements'},
    'solution-architect':{target:'architectBootstrap',fallback:'Review the selected technology stack and the next architecture approval prerequisite',action:'Continue Architecture'},
    'ux-designer':{target:'uxDesignWorkspace',fallback:'Review your assigned design and complete the next UI/UX workflow step',action:'Continue UI/UX Design'},
    'software-developer':{target:'developerTaskDashboard',fallback:'Review your assigned Jira work and continue the next development step',action:'Continue Development'},
    'project-manager':{target:'pmDailyCockpit',fallback:'Review assigned Jira work, blockers and project delivery progress',action:'Review Jira Work'}
  });
  let signature='',project='',role='',pending=0,lastSnapshot=null,latest=null;
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
    if(!project||!root()||root().closest('main')?.classList.contains('hidden'))return;
    const target=routes[role]?.target||'roleStepFlow';
    const element=byId(target);
    if(element&&!element.classList.contains('hidden')){
      element.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    if(typeof navigate==='function')navigate(role==='business-analyst'?'discovery':role);
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
    clearTimeout(watchdogTimer);
    clearTimeout(successTimer);
    const next=nextStep(latest);
    const supplied=safe(message,420);
    byId('atgvMyWorkAiTitle').textContent='AI · '+latest.roleName+' · Next step';
    byId('atgvMyWorkAiText').textContent=supplied||next.suggestion;
    actionButtons(action||next.action);
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
    signature=newSignature;latest=compact;project=compact.projectId;role=compact.roleId;
    const requestId=++pending;
    clearTimers();
    byId('atgvMyWorkAiText').textContent='';
    byId('atgvMyWorkAiActions').replaceChildren();
    displayResults(false);state('thinking');
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
      if(requestId!==pending||!byId('atgvMyWorkAiContent')?.hidden)return;
      const next=nextStep(compact);
      result(next.suggestion,next.action,true,requestId);
    },18000);
  }
  window.addEventListener('message',event=>{
    const msg=event.data||{};
    if(msg.type!=='roleAiSuggestion'||msg.projectId!==project||msg.roleId!==role||msg.requestId!==pending)return;
    result(msg.message,msg.actionLabel,msg.error===true,msg.requestId);
  });
  window.ATGVMyWorkAI={update};
})();