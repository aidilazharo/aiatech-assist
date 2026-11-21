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
 const tasksSection=get('atgvMyWorkToday'),tasksList=get('atgvMyWorkTodayList'),tasksTitle=get('atgvMyWorkTodayTitle');
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 // Red intro -> CMYK (cyan, magenta, yellow, key/graphite) -> red fade-out.
 // Key is highlighted graphite so it remains visible against the black page.
 const redRGB=[211,17,69],cmykRGB=[
  [0,219,230],[230,36,187],[249,212,58],[110,125,143]
 ];
 const blendedRGBA=(target,mix,alpha)=>'rgba('+redRGB.map((v,i)=>
  Math.round(v+(target[i]-v)*mix)).join(',')+','+alpha+')';
 let project='',role='',pendingId=0,sequence=0,pending=false;
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
 }
 function expireConversationAtMidnight(){
  const next=dayLocal();
  if(next===sessionDay)return false;
  sessionDay=next;
  pendingId=++sequence;pending=false;submittedText='';
  writer=null;queue.length=0;thinkingBefore=false;
  // Clear all displayed role AI messages; no previous-day dialogue remains.
  transcript.replaceChildren();
  tasksList?.replaceChildren();
  if(tasksSection)tasksSection.hidden=true;
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
   // Keep the role context accessible without displaying an extra chat heading.
   input.setAttribute('aria-label','Message ATGV AI · '+String(snapshot.roleName||nextRole).slice(0,100));
   writer=null;queue.length=0;transcript.replaceChildren();input.value='';
   tasksList?.replaceChildren();if(tasksSection)tasksSection.hidden=true;
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
  saveHandoffDraft(text){handoffDraft=String(text||'').slice(0,4000);}};
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
  submittedText=userText;
  addMessage('user',userText);input.value='';setBusy(true);activity();
  pendingId=++sequence;
  // Only the user-entered message crosses the webview boundary.
  if(typeof send==='function')send('roleAiChat',{projectId:project,roleId:role,requestId:pendingId,message:userText});
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
 function renderTasks(brief){
  if(!tasksSection||!tasksList)return;
  const today=String(brief.today||dayLocal()).slice(0,15);
  if(tasksTitle)tasksTitle.textContent='Today\u2019s tasks \u00b7 '+today;
  tasksList.replaceChildren();
  const actions=Array.isArray(brief.todayActions)?brief.todayActions.slice(0,6):[];
  const tasks=actions.filter(item=>item&&item.completed!==true&&item.done!==true&&item.label);
  for(const item of tasks){
   const card=document.createElement('div');card.className='atgv-mywork-ai-task-card';
   card.setAttribute('role','listitem');card.dataset.taskId=String(item.id||'').slice(0,180);
   const details=document.createElement('div');details.className='atgv-mywork-ai-task-details';
   const label=document.createElement('strong');label.textContent=String(item.label).slice(0,140);
   const reason=document.createElement('span');reason.textContent=String(item.reason||'').slice(0,160);
   details.append(label,reason);
   const button=document.createElement('button');button.type='button';
   button.className='atgv-mywork-ai-task-open';button.textContent='Go to task';
   button.setAttribute('aria-label','Go to task: '+label.textContent);
   button.addEventListener('click',()=>window.ATGVMyWorkAI?.openTask?.(item));
   card.append(details,button);tasksList.append(card);
  }
  if(tasks.length===0){
   const empty=document.createElement('p');empty.className='atgv-mywork-ai-task-empty';
   empty.textContent='No outstanding verified tasks for this role.';
   tasksList.append(empty);
  }
  tasksSection.hidden=false;
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
  renderTasks(b);
  activity();
 }
 window.addEventListener('message',event=>{
  if(expireConversationAtMidnight())return;
  const msg=event.data||{};
  if(msg.projectId!==project||msg.roleId!==role)return;
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
  const engaged=pending||thinking||!!writer||queue.length>0||idle<.8;
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
  const smooth=(a,b,k)=>a+(b-a)*(1-Math.exp(-k*dt));
  height=smooth(height,targetHeight,engaged?6:3);
  opacity=smooth(opacity,targetOpacity,engaged?9:4);
  speed=smooth(speed,targetSpeed,engaged?5:2);
  // Keep CMYK during active thinking and slow-down; shift back toward red as opacity fades.
  colorMix=smooth(colorMix,engaged||idle<3.9?1:0,engaged?1.25:2.8);
  phase+=dt*speed;energy=Math.max(0,energy-dt*.66);
  if(ctx){
   ctx.clearRect(0,0,w,h);
   if(opacity>.005){
    const mid=h*.48;
    const redBreath=reduceMotion?1:(.35+.65*(.5+.5*Math.sin(now*.0024)));
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
