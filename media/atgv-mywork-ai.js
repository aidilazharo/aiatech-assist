'use strict';
// One role-aware, read-only AI guidance panel for every My Work screen.
// All buttons navigate to existing controls; this module never publishes, edits or approves.
(function(){
  const root=()=>document.getElementById('atgvMyWorkAi');
  const byId=id=>document.getElementById(id);
  let signature='',project='',role='',pending=0,successTimer=null,requestTimer=null;
  const destinations={
    'business-analyst':{target:'discoveryView',label:'Continue Business Requirements'},
    'solution-architect':{target:'architectBootstrap',label:'Continue Architecture'},
    'ux-designer':{target:'uxDesignWorkspace',label:'Continue UI/UX Design'},
    'software-developer':{target:'developerTaskDashboard',label:'Continue Development'},
    'project-manager':{target:'pmDailyCockpit',label:'Review Jira Work'}
  };
  const safe=value=>String(value==null?'':value).trim().slice(0,480);
  function state(name){
    const panel=root();if(!panel)return;
    panel.dataset.state=name;
    byId('atgvMyWorkAiOrb').setAttribute('aria-label',name==='thinking'?'AI analyzing current work':name==='success'?'AI review complete':name==='idle'?'AI ready':'AI review finished');
  }
  function actionButtons(){
    const list=byId('atgvMyWorkAiActions');if(!list)return;
    list.replaceChildren();
    const current=destinations[role]||{target:'roleStepFlow',label:'Review My Work'};
    const primary=document.createElement('button');
    primary.type='button';primary.textContent=current.label;primary.className='atgv-mywork-ai-button';
    primary.addEventListener('click',()=>{
      if(!project||!root()||root().closest('main')?.classList.contains('hidden'))return;
      const panel=byId(current.target);
      if(panel&&!panel.classList.contains('hidden')){
        panel.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      if(role==='business-analyst'&&typeof navigate==='function'){navigate('discovery');return;}
      if(typeof navigate==='function')navigate(role);
    });
    list.append(primary);
    const refresh=document.createElement('button');
    refresh.type='button';refresh.textContent='Review again';
    refresh.className='atgv-mywork-ai-button';
    refresh.addEventListener('click',()=>{
      signature='';if(lastSnapshot)update(lastSnapshot);
    });
    list.append(refresh);
  }
  let lastSnapshot=null;
  function update(snapshot){
    if(!snapshot||!snapshot.projectId||!snapshot.roleId||!root())return;
    lastSnapshot=snapshot;
    const compact={
      projectId:safe(snapshot.projectId).slice(0,90),
      roleId:safe(snapshot.roleId).slice(0,80),
      roleName:safe(snapshot.roleName).slice(0,100),
      progress:safe(snapshot.progress).slice(0,35),
      next:safe(snapshot.next),
      tasks:Array.isArray(snapshot.tasks)?snapshot.tasks.slice(0,16).map(t=>({title:safe(t.title).slice(0,120),done:!!t.done})):[],
      assigned:Array.isArray(snapshot.assigned)?snapshot.assigned.slice(0,8).map(t=>({key:safe(t.key).slice(0,40),status:safe(t.status).slice(0,60)})):[],
      requirements:Array.isArray(snapshot.requirements)?snapshot.requirements.slice(0,10).map(b=>({id:safe(b.id).slice(0,40),status:safe(b.status).slice(0,50)})):[]
    };
    const nextSignature=JSON.stringify(compact);
    if(nextSignature===signature)return;
    signature=nextSignature;project=compact.projectId;role=compact.roleId;
    pending++;const requestId=pending;
    clearTimeout(successTimer);clearTimeout(requestTimer);
    byId('atgvMyWorkAiTitle').textContent='AI · '+compact.roleName;
    byId('atgvMyWorkAiText').textContent='Reviewing your current '+compact.roleName+' work and identifying the next action…';
    actionButtons();state('thinking');
    requestTimer=setTimeout(()=>{
      if(requestId!==pending)return;
      if(typeof send==='function')send('roleAiReview',{projectId:project,roleId:role,context:compact,requestId});
      else{
        byId('atgvMyWorkAiText').textContent='AI review is unavailable. Use Continue to open your current work.';
        state('idle');
      }
    },400);
  }
  window.addEventListener('message',event=>{
    const msg=event.data||{};
    if(msg.type!=='roleAiSuggestion'||msg.projectId!==project||msg.roleId!==role||msg.requestId!==pending)return;
    clearTimeout(successTimer);
    byId('atgvMyWorkAiText').textContent=safe(msg.message||'Open your current work to review the next step.');
    actionButtons();
    if(msg.error){state('idle');return;}
    state('success');
    successTimer=setTimeout(()=>{if(msg.requestId===pending)state('complete');},1250);
  });
  window.ATGVMyWorkAI={update};
})();