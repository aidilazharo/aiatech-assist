'use strict';
// Canvas-only waveform. The AI instructions are constructed in the extension host.
(function(){
 const get=id=>document.getElementById(id),panel=get('atgvMyWorkAi'),canvas=get('atgvMyWorkAiOrb');
 if(!panel||!canvas||panel.dataset.waveInitialized)return;
 panel.dataset.waveInitialized='yes';
 const ctx=canvas.getContext('2d');
 const input=get('atgvMyWorkAiInput'),form=get('atgvMyWorkAiChatForm'),button=get('atgvMyWorkAiSend');
 const transcript=get('atgvMyWorkAiConversation'),resultsViewport=get('atgvMyWorkAiResults'),status=get('atgvMyWorkAiChatStatus');
 const suggestion=get('atgvMyWorkAiText');
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 // Red intro -> CMYK (cyan, magenta, yellow, key/graphite) -> red fade-out.
 // Key is highlighted graphite so it remains visible against the black page.
 const redRGB=[211,17,69],cmykRGB=[
  [0,219,230],[230,36,187],[249,212,58],[110,125,143]
 ];
 const blendedRGBA=(target,mix,alpha)=>'rgba('+redRGB.map((v,i)=>
  Math.round(v+(target[i]-v)*mix)).join(',')+','+alpha+')';
 let project='',role='',pendingId=0,sequence=0,pending=false;
 const repoPanel=get('developerChatRepoPanel'),repoSelect=get('developerChatRepoSelect'),repoNext=get('developerChatNext'),repoOpen=get('developerChatOpen'),repoOpenSource=get('developerChatOpenSource'),repoRefresh=get('developerChatRefresh'),repoPr=get('developerChatPr');
 let gitRequest=0,gitBusy=false,gitStep='branch',gitPr='',gitReady=false,folderReady=false;
 const repoHome=repoPanel?.parentElement;
 let toolsMessage=null;
 const gitLabels={branch:'Create Branch',commit:'Commit Code',pr:'Create PR',publish:'Publish',done:'Published'};
 function gitControls(){
  if(!repoPanel)return;
  repoNext.disabled=gitBusy||!gitReady||gitStep==='done';
  repoOpen.disabled=gitBusy||!folderReady;
  repoOpenSource.disabled=gitBusy||!folderReady;
  repoRefresh.disabled=gitBusy;
  repoSelect.disabled=gitBusy||pending;
  repoNext.textContent=gitBusy?'Working…':gitLabels[gitStep]||gitLabels.branch;
  repoPr.hidden=!gitPr;repoPr.disabled=gitBusy||!gitReady||!gitPr;
 }
 function hideDevTools(){
  if(!repoPanel)return;
  repoPanel.hidden=true;repoHome?.appendChild(repoPanel);toolsMessage?.remove();toolsMessage=null;
  gitRequest++;gitBusy=false;gitReady=false;folderReady=false;gitPr='';gitStep='branch';
  gitControls();
 }
 function showDevTools(){
  if(!repoPanel||role!=='software-developer')return;
  if(toolsMessage){repoHome?.appendChild(repoPanel);toolsMessage.remove();}
  toolsMessage=document.createElement('div');toolsMessage.className='atgv-mywork-ai-message assistant developer-chat-tools-message';
  toolsMessage.appendChild(repoPanel);transcript.appendChild(toolsMessage);repoPanel.hidden=false;
  gitControls();requestGit();
  if(resultsViewport)resultsViewport.scrollTop=resultsViewport.scrollHeight;
 }
 function requestGit(action='status'){
  if(!repoPanel||repoPanel.hidden||role!=='software-developer'||!project||gitBusy||typeof send!=='function')return;
  gitBusy=true;gitControls();
  send('developerChatGit',{projectId:project,roleId:role,repositoryTarget:repoSelect.value,requestId:++gitRequest,action});
 }
 function updateRepoFolders(rows,selected){
  if(!Array.isArray(rows))return;
  for(const option of [...repoSelect.options])if(option.value.startsWith('project:'))option.remove();
  const placeholder=[...repoSelect.options].find(x=>x.value==='project');
  placeholder.textContent=rows.length?'Select project folder…':'No project folders found';
  for(const row of rows){if(!/^project:[a-f0-9]{64}$/.test(row?.target)||typeof row.label!=='string')continue;const option=document.createElement('option');option.value=row.target;option.textContent=row.label;repoSelect.append(option);}
  repoSelect.value=[...repoSelect.options].some(x=>x.value===selected)?selected:'project';
 }
 function renderGit(msg){
  if(!repoPanel||repoPanel.hidden||msg.requestId!==gitRequest||msg.repositoryTarget!==repoSelect.value)return;
  gitBusy=false;
  updateRepoFolders(msg.projectFolders,msg.selectedTarget||repoSelect.value);
  if(!msg.error&&!msg.cancelled){
   folderReady=!!msg.repository;gitReady=folderReady&&msg.gitReady!==false;gitStep=gitLabels[msg.step]?msg.step:'branch';gitPr=String(msg.pr||'');
   const percent=Math.max(0,Math.min(100,Number(msg.percent)||0));
   get('developerChatArc').setAttribute('stroke-dasharray',percent+' 100');
   get('developerChatPercent').textContent=percent+'%';
   const stages=['branch','commit','pr','publish'];
   const index=gitStep==='done'?4:stages.indexOf(gitStep);
   for(const el of repoPanel.querySelectorAll('[data-dev-chat-step]')){const i=stages.indexOf(el.dataset.devChatStep);el.classList.toggle('is-complete',i<index);el.classList.toggle('is-current',i===index);}
   get('developerChatGitInfo').textContent=msg.gitReady===false?msg.repository+' · '+(msg.gitNotice||'Git not configured'):msg.repository+' · '+msg.branch+' · '+String(msg.sha||'').slice(0,8)+(msg.clean?'':' · Uncommitted changes')+(gitPr?' · PR #'+gitPr.split('/').pop():'');
  }else if(msg.error){get('developerChatGitInfo').textContent=String(msg.error);gitReady=false;folderReady=false;gitPr='';}
  const logs=msg.logs;
  if(logs)get('developerChatLogInfo').textContent=logs.available?(logs.priorities?.length?'Confluence · Today: '+logs.priorities.slice(0,3).map(x=>x.label+' ('+x.count+')').join(' · '):'Confluence · No matching diagnostic errors recorded.'):'Confluence diagnostic log unavailable.';
  for(const id of ['developerChatGitInfo','developerChatLogInfo'])get(id).title=get(id).textContent;
  gitControls();
 }
 if(repoPanel){
  repoSelect.addEventListener('change',()=>{gitReady=false;folderReady=false;gitPr='';gitStep='branch';get('developerChatGitInfo').textContent='Checking repository…';get('developerChatArc').setAttribute('stroke-dasharray','0 100');get('developerChatPercent').textContent='0%';requestGit();});
  repoNext.addEventListener('click',()=>requestGit(gitStep));repoOpen.addEventListener('click',()=>requestGit('open'));repoOpenSource.addEventListener('click',()=>requestGit('open-source'));repoRefresh.addEventListener('click',()=>requestGit());
  repoPr.addEventListener('click',()=>{if(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(gitPr))requestGit('open-pr');});
  window.addEventListener('atgv:viewchange',()=>{if(role==='software-developer'&&!repoPanel.hidden&&!document.getElementById('myWorkView')?.classList.contains('hidden'))requestGit();});
 }

 let brActivity=false,brVisible=false,globalAiActive=false;
 let greetingNode=null,briefingNode=null,lastBriefRequest=0,submittedText='',handoffDraft='';
 const dayLocal=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 let sessionDay=dayLocal(),dayTimer=null;
 let w=300,h=150,last=0,phase=0,hue=354,energy=0,opacity=0,height=0,speed=0,colorMix=0;
 let lastActivity=performance.now(),ripples=[],writer=null,queue=[],thinkingBefore=false;
 const prefersReduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 let reduceMotion=!!prefersReduced?.matches;
 prefersReduced?.addEventListener?.('change',event=>{reduceMotion=event.matches;});
 function resize(){
  const bounds=canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2);
  w=Math.max(2,bounds.width);h=Math.max(2,bounds.height);
  canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx?.setTransform(d,0,0,d,0,0);
 }
 const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
 resizeObserver?.observe(canvas);window.addEventListener('resize',resize);
 // The header canvas is hidden on other pages; measure it again on entering My Work.
 window.addEventListener('atgv:viewchange',resize);resize();
 function pulse(power=1){
  lastActivity=performance.now();
  energy=clamp(energy+power*.35,0,1.8);
  // Restart in the actual header red (#D31145) before blending into CMYK.
  hue=351+Math.random()*8;
  ripples.push({x:w*(.2+Math.random()*.6),age:0,power:clamp(power,.2,2)});
  if(ripples.length>12)ripples.shift();
 }
 function activity(){pulse(1);}
 function startWriter(node,text){
  writer={node,text:String(text||''),index:0,progress:0};
  node.textContent='';activity();
 }
 function typewriter(node,text){queue.push([node,text]);if(!writer)startWriter(...queue.shift());}
 function addMessage(kind,text,animate=false){
  const node=document.createElement('div');
  node.className='atgv-mywork-ai-message '+kind;
  const body=document.createElement('span');
  body.className='atgv-mywork-ai-message-text';
  node.appendChild(body);
  transcript.appendChild(node);
  if(animate)typewriter(body,text);else body.textContent=String(text||'');
  transcript.scrollTop=transcript.scrollHeight;
  if(resultsViewport)resultsViewport.scrollTop=resultsViewport.scrollHeight;
  return node;
 }
 function setBusy(isBusy){
  pending=!!isBusy;button.disabled=pending||!input.value.trim();
  status.textContent=pending?'AI is preparing a response…':'';
  gitControls();
 }
 function expireConversationAtMidnight(){
  const next=dayLocal();
  if(next===sessionDay)return false;
  sessionDay=next;
  pendingId=++sequence;pending=false;submittedText='';
  writer=null;queue.length=0;thinkingBefore=false;
  // Clear all displayed role AI messages; no previous-day dialogue remains.
  hideDevTools();transcript.replaceChildren();
  greetingNode=null;briefingNode=null;lastBriefRequest=0;
  input.value='';status.textContent='';button.disabled=true;
  activity();
  return true;
 }
 function scheduleLocalMidnight(){
  clearTimeout(dayTimer);
  const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  dayTimer=setTimeout(()=>{
   const changed=expireConversationAtMidnight();
   if(changed&&project&&role){
    greetingNode=addMessage('assistant','Hello! I am reviewing your current role work for today.');
    window.ATGVMyWorkAI?.refresh?.();
   }
   scheduleLocalMidnight();
  },Math.max(100,next.getTime()-now.getTime()+100));
 }
 scheduleLocalMidnight();
 function scope(snapshot){
  if(!snapshot)return;
  expireConversationAtMidnight();
  const nextProject=String(snapshot.projectId||''),nextRole=String(snapshot.roleId||'');
  if(project!==nextProject||role!==nextRole){
   project=nextProject;role=nextRole;pendingId=++sequence;pending=false;
   if(repoPanel){hideDevTools();updateRepoFolders([],'project');repoSelect.value='project';gitControls();}
   // Keep the role context accessible without displaying an extra chat heading.
   input.setAttribute('aria-label','Message ATGV AI · '+String(snapshot.roleName||nextRole).slice(0,100));
   writer=null;queue.length=0;transcript.replaceChildren();input.value='';
   greetingNode=null;briefingNode=null;lastBriefRequest=0;
   greetingNode=addMessage('assistant','Hello! I am reviewing your '+String(snapshot.roleName||'project')+' work for today.');
   if(handoffDraft){input.value=handoffDraft.slice(0,4000);handoffDraft='';}
   status.textContent='';button.disabled=!input.value.trim();pulse(1.3);
  }
 }
 if(window.ATGVMyWorkAI&&typeof window.ATGVMyWorkAI.update==='function'){
  const original=window.ATGVMyWorkAI.update;
  window.ATGVMyWorkAI.update=function(snapshot){scope(snapshot);return original(snapshot);};
 }
 window.ATGVMyWorkChat={showSuggestion(text){if(suggestion)typewriter(suggestion,text);},
  saveHandoffDraft(text){handoffDraft=String(text||'').slice(0,4000);},
  setBusinessRequirementsActivity(active){
   const running=active===true;
   if(brActivity===running)return;
   brActivity=running;
   ripples=[];
   if(brActivity)requestAnimationFrame(resize);
  },
  setBusinessRequirementsVisible(active){
   const next=active===true;
   if(brVisible===next)return;
   brVisible=next;
   // The canvas is often width 0 while My Work is hidden; remeasure after
   // the Business Requirements header becomes visible, even for idle red waves.
   if(brVisible)requestAnimationFrame(resize);
  }};
 input.addEventListener('input',()=>{
  pulse(.22+Math.min(1,input.value.length/380));
  button.disabled=pending||!input.value.trim();
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(expireConversationAtMidnight()){
   window.ATGVMyWorkAI?.refresh?.();
   return;
  }
  const userText=input.value.trim();
  if(!userText||!project||!role||pending)return;
  // Local developer command: render the actual tools inside the conversation.
  // Do not send a roleAiChat message or invoke any Git mutation.
  if(userText.toLowerCase()==='dev-tools'&&role==='software-developer'){
   addMessage('user',userText);input.value='';setBusy(false);showDevTools();return;
  }
  submittedText=userText;
  addMessage('user',userText);input.value='';setBusy(true);activity();
  pendingId=++sequence;
  // Only the user-entered message crosses the webview boundary.
  if(typeof send==='function')send('roleAiChat',{projectId:project,roleId:role,requestId:pendingId,message:userText,...(role==='software-developer'&&repoSelect?{repositoryTarget:repoSelect.value}:{})});
  else{setBusy(false);addMessage('assistant','AI connection unavailable.',true);}
 });
 input.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit?.();}
 });
 function section(parent,heading,body){
  const wrapper=document.createElement('section');
  const title=document.createElement('strong');
  title.className='atgv-mywork-ai-brief-heading';title.textContent=heading;
  const description=document.createElement('p');
  description.className='atgv-mywork-ai-brief-copy';
  description.textContent=String(body||'');
  wrapper.append(title,description);parent.append(wrapper);
  return wrapper;
 }
 function renderBrief(b){
  if(!b||typeof b!=='object')return;
  if(!greetingNode)greetingNode=addMessage('assistant','');
  greetingNode.textContent=String(b.greeting||'Hello. Here are your priorities for today.').slice(0,380);
  if(!briefingNode)briefingNode=addMessage('assistant','');
  briefingNode.classList.add('atgv-mywork-ai-brief');
  briefingNode.replaceChildren();
  const health=b.health||{};
  section(briefingNode,'Project health · '+String(health.label||'Not yet verified').slice(0,90),
   String(health.detail||'Project delivery evidence is unavailable.').slice(0,540));
  const teamTitle='Other project members · last recorded Jira/Confluence roles';
  const team=Array.isArray(b.team)?b.team.slice(0,6):[];
  if(team.length){
   const block=section(briefingNode,teamTitle,'Recorded membership, not live online presence.');
   const people=document.createElement('div');people.className='atgv-mywork-ai-team-list';
   for(const user of team){
    const person=document.createElement('div');person.className='atgv-mywork-ai-team-member';
    const name=document.createElement('strong');name.textContent=String(user.name||'Project member').slice(0,90);
    const detail=document.createElement('span');detail.textContent=
     (Array.isArray(user.roles)?user.roles.slice(0,3).join(', '):'Role not verified')+
     ' · '+Math.max(0,Number(user.assignedJira)||0)+' Jira task(s) last recorded';
    person.append(name,detail);people.append(person);
   }
   block.append(people);
  }else section(briefingNode,teamTitle,String(b.teamSummary||'Shared roster not verified').slice(0,220));
  if(role==='software-developer'&&b.developerLogs){const logs=b.developerLogs;section(briefingNode,'Today · Unified diagnostic log',logs.available?(logs.priorities?.length?logs.priorities.slice(0,3).map(x=>'Review '+x.label+' ('+x.count+' matching error lines)').join(' · '):'No matching diagnostic signatures recorded.'):'Confluence diagnostic log unavailable.');}
  activity();
 }
 // Host activity is independent of the selected role and the currently open page.
 // The shared canvas remains in the app/notification header, never in a task pane.
 window.addEventListener('message',event=>{
  const msg=event.data||{};
  if(msg.type!=='atgvAiActivity')return;
  const next=msg.active===true;
  if(globalAiActive===next)return;
  globalAiActive=next;
  document.body.classList.toggle('atgv-global-ai-active',next);
  window.ATGVSyncMyWorkHeaderWaveHost?.();
  if(next){pulse(.45);requestAnimationFrame(resize);}
 });
 window.addEventListener('message',event=>{
  if(expireConversationAtMidnight())return;
  const msg=event.data||{};
  if(msg.projectId!==project||msg.roleId!==role)return;
  if(msg.type==='developerChatGitState'){renderGit(msg);return;}
  if(msg.type==='roleAiDailyBrief'){
   if(!Number.isSafeInteger(msg.requestId)||msg.requestId<lastBriefRequest)return;
   if(String(msg.brief?.today||'')!==dayLocal())return; // Ignore yesterday's delayed response.
   lastBriefRequest=msg.requestId;
   renderBrief(msg.brief);
   return;
  }
  if(msg.type!=='roleAiChatReply'||msg.requestId!==pendingId)return;
  setBusy(false);
  const reply=addMessage('assistant',msg.text||'No response received.',true);
  const target=String(msg.suggestedRoleId||'');
  const handoffRequest=submittedText;
  if(/^[a-z][a-z0-9-]{1,78}$/.test(target)&&msg.suggestedRoleName){
    const enabled=msg.suggestedRoleEnabled===true;
    const action=document.createElement('button');
    action.type='button';action.className='atgv-mywork-ai-switch-role';
    action.textContent=(enabled?'Switch to ':'Open Role Settings for ')+String(msg.suggestedRoleName).slice(0,80);
    action.setAttribute('aria-label',(enabled?'Switch My Work chat role to ':'Enable My Work role ')+String(msg.suggestedRoleName).slice(0,80));
    action.addEventListener('click',()=>{
      // Only an explicit user click may trigger role navigation. The target
      // is checked against enabled project roles by the main UI controller.
      window.dispatchEvent(new CustomEvent('atgv:mywork-switch-role',{
        detail:{projectId:project,fromRoleId:role,targetRoleId:target,requestText:handoffRequest.slice(0,4000),enabled}
      }));
    });
    reply.append(action);
  }
  activity();
 });
 function frame(now){
  if(!panel.isConnected){resizeObserver?.disconnect();return;}
  const dt=last?clamp((now-last)/1000,0,.06):0;last=now;
  const thinking=panel.dataset.state==='thinking';
  if(thinking&&!thinkingBefore)activity();
  thinkingBefore=thinking;
  if(writer){
   writer.progress+=dt*270;const next=Math.min(writer.text.length,Math.floor(writer.progress));
   if(next>writer.index){
    writer.index=next;writer.node.textContent=writer.text.slice(0,next);
    lastActivity=now;energy=clamp(energy+.018,0,1.8);transcript.scrollTop=transcript.scrollHeight;
    if(resultsViewport)resultsViewport.scrollTop=resultsViewport.scrollHeight;
   }
   if(next===writer.text.length){
    writer=null;if(queue.length)startWriter(...queue.shift());
   }
  }
  const idle=(now-lastActivity)/1000;
  const engaged=pending||thinking||!!writer||queue.length>0||idle<.8||globalAiActive;
  let targetHeight=0,targetOpacity=0,targetSpeed=0,stage='SLEEPING';
  if(reduceMotion){
   targetOpacity=engaged?1:0;stage=engaged?'ACTIVE':'SLEEPING';
  }else if(engaged){
   targetHeight=clamp(.48+energy*.25,.42,.98);
   targetOpacity=1;targetSpeed=1.3+energy*.5;stage=pending||thinking?'THINKING':'ACTIVE';
  }else if(idle<3){
   const p=clamp((idle-.8)/2.2,0,1);
   targetHeight=.48*(1-p)*(1-p);targetOpacity=1;
   targetSpeed=.12+1.25*(1-p)*(1-p);stage='SLOWING';
  }else if(idle<3.9){
   targetOpacity=1;stage='LINE ONLY';
  }else if(idle<5.2){
   targetOpacity=clamp(1-(idle-3.9)/1.3,0,1);stage='FADING';
  }else{
   // Quiet idle heartbeat: keep a faint red waveform fading in/out.
   targetOpacity=.34;targetHeight=.1;targetSpeed=.22;stage='SLEEPING';
  }
  if(globalAiActive){
   // A calm, low-amplitude red-to-CMYK waveform while any AI model is active.
   targetHeight=reduceMotion?0:Math.min(.17,10/Math.max(h,1));
   targetOpacity=.88;targetSpeed=reduceMotion?0:.92;stage='THINKING';
  }
  if(brActivity){
   targetHeight=reduceMotion?0:Math.min(.15,8/Math.max(h,1));
   targetOpacity=.85;targetSpeed=reduceMotion?0:.85;stage='THINKING';
  }else if(brVisible){
   // Keep a quiet red heartbeat on the BA page, including draft/ready states.
   // Only real AI activity switches to the CMYK processing animation.
   targetHeight=reduceMotion?0:Math.min(.13,7/Math.max(h,1));
   targetOpacity=.62;targetSpeed=reduceMotion?0:.32;stage='READY';
  }
  const smooth=(a,b,k)=>a+(b-a)*(1-Math.exp(-k*dt));
  height=smooth(height,targetHeight,engaged?6:3);
  opacity=smooth(opacity,targetOpacity,engaged?9:4);
  speed=smooth(speed,targetSpeed,engaged?5:2);
  // Keep CMYK during active thinking and slow-down; shift back toward red as opacity fades.
  colorMix=smooth(colorMix,brActivity||engaged||idle<3.9?1:0,engaged?1.25:2.8);
  phase+=dt*speed;energy=Math.max(0,energy-dt*.66);
  if(ctx){
   ctx.clearRect(0,0,w,h);
   if(opacity>.005){
    const mid=h*.48;
    const redBreath=reduceMotion?1:.35+.65*(.5+.5*Math.sin(now*.0024));
    const baseline=ctx.createLinearGradient(0,0,w,0);
    baseline.addColorStop(0,blendedRGBA(cmykRGB[0],colorMix,0));
    baseline.addColorStop(.5,blendedRGBA(cmykRGB[0],colorMix,.8));
    baseline.addColorStop(1,blendedRGBA(cmykRGB[0],colorMix,0));
    ctx.strokeStyle=baseline;ctx.lineWidth=.85;ctx.globalAlpha=opacity*redBreath;
    ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(w,mid);ctx.stroke();
    if(height>.004&&!reduceMotion){
     for(let j=0;j<7;j++){
      const strand=cmykRGB[j%cmykRGB.length];
      const redGradient=ctx.createLinearGradient(0,0,w,0);
      redGradient.addColorStop(0,blendedRGBA(strand,colorMix,0));
      redGradient.addColorStop(.15,blendedRGBA(strand,colorMix,.8));
      redGradient.addColorStop(.52,blendedRGBA(strand,colorMix,.95));
      redGradient.addColorStop(.85,blendedRGBA(strand,colorMix,.8));
      redGradient.addColorStop(1,blendedRGBA(strand,colorMix,0));
      ctx.strokeStyle=redGradient;ctx.lineWidth=j===0?2:1.25;
      for(const side of [-1,1]){
       ctx.beginPath();
       for(let x=0;x<=w+2;x+=3){
        const p=clamp(x/w,0,1),envelope=Math.pow(Math.max(0,Math.sin(Math.PI*p)),3);
        const wave=Math.sin(p*(18+j*1.2)-phase*(1.1+j*.13)+j*1.5)*.55+
         Math.sin(p*(36+j)+phase*.8+j)*.28+Math.sin(p*9-phase*.4+j*2)*.23;
        let rippleScale=1;
        for(const ripple of ripples){
         const dist=Math.abs(x-ripple.x)-ripple.age*110;
         rippleScale+=Math.sin(dist*.085)*Math.exp(-(dist*dist)/(57*57))*ripple.power*.17*Math.max(0,1-ripple.age/2);
        }
        const y=mid+side*wave*envelope*h*.44*height*(.55+j*.07)*rippleScale;
        if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
       }
       ctx.globalAlpha=opacity*redBreath*(.55+j*.05);ctx.stroke();
      }
     }
    }
    ctx.globalAlpha=1;
   }
  }
  for(const ripple of ripples)ripple.age+=dt;
  ripples=ripples.filter(ripple=>ripple.age<2);
  requestAnimationFrame(frame);
 }
 setBusy(false);requestAnimationFrame(frame);
})();
