'use strict';
// Canvas-only waveform. The AI instructions are constructed in the extension host.
(function(){
 const get=id=>document.getElementById(id),panel=get('atgvMyWorkAi'),canvas=get('atgvMyWorkAiOrb');
 if(!panel||!canvas||panel.dataset.waveInitialized)return;
 panel.dataset.waveInitialized='yes';
 const ctx=canvas.getContext('2d');
 const input=get('atgvMyWorkAiInput'),form=get('atgvMyWorkAiChatForm'),button=get('atgvMyWorkAiSend');
 const transcript=get('atgvMyWorkAiConversation'),status=get('atgvMyWorkAiChatStatus');
 const label=get('atgvMyWorkAiWaveState'),suggestion=get('atgvMyWorkAiText');
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 let project='',role='',pendingId=0,sequence=0,pending=false;
 let w=300,h=150,last=0,phase=0,hue=Math.random()*360,energy=0,opacity=0,height=0,speed=0;
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
 resizeObserver?.observe(canvas);window.addEventListener('resize',resize);resize();
 function pulse(power=1){
  lastActivity=performance.now();
  energy=clamp(energy+power*.35,0,1.8);
  hue=(hue+24+Math.random()*87)%360;
  ripples.push({x:w*(.2+Math.random()*.6),age:0,power:clamp(power,.2,2)});
  if(ripples.length>12)ripples.shift();
 }
 function activity(caption){label.textContent=caption||'AI ACTIVE';pulse(1);}
 function startWriter(node,text){
  writer={node,text:String(text||''),index:0,progress:0};
  node.textContent='';activity('GENERATING TEXT');
 }
 function typewriter(node,text){queue.push([node,text]);if(!writer)startWriter(...queue.shift());}
 function addMessage(kind,text,animate=false){
  const node=document.createElement('div');
  node.className='atgv-mywork-ai-message '+kind;
  transcript.appendChild(node);
  if(animate)typewriter(node,text);else node.textContent=String(text||'');
  transcript.scrollTop=transcript.scrollHeight;
 }
 function setBusy(isBusy){
  pending=!!isBusy;button.disabled=pending||!input.value.trim();
  status.textContent=pending?'AI is preparing a response…':'Enter to send · Shift+Enter for a new line';
 }
 function scope(snapshot){
  if(!snapshot)return;
  const nextProject=String(snapshot.projectId||''),nextRole=String(snapshot.roleId||'');
  if(project!==nextProject||role!==nextRole){
   project=nextProject;role=nextRole;pendingId=++sequence;pending=false;
   // Reuse one shared chat UI for every enabled role; label the selected expert.
   const chatLabel=panel.querySelector('.atgv-mywork-ai-chat-label');
   if(chatLabel)chatLabel.textContent='CHAT WITH ATGV AI · '+String(snapshot.roleName||nextRole).slice(0,100);
   writer=null;queue.length=0;transcript.replaceChildren();input.value='';
   status.textContent='Role-aware AI assistant ready';button.disabled=true;pulse(1.3);
  }
 }
 if(window.ATGVMyWorkAI&&typeof window.ATGVMyWorkAI.update==='function'){
  const original=window.ATGVMyWorkAI.update;
  window.ATGVMyWorkAI.update=function(snapshot){scope(snapshot);return original(snapshot);};
 }
 window.ATGVMyWorkChat={showSuggestion(text){if(suggestion)typewriter(suggestion,text);}};
 input.addEventListener('input',()=>{
  pulse(.22+Math.min(1,input.value.length/380));
  label.textContent='LISTENING TO INPUT';button.disabled=pending||!input.value.trim();
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const userText=input.value.trim();
  if(!userText||!project||!role||pending)return;
  addMessage('user',userText);input.value='';setBusy(true);activity('AI THINKING');
  pendingId=++sequence;
  // Only the user-entered message crosses the webview boundary.
  if(typeof send==='function')send('roleAiChat',{projectId:project,roleId:role,requestId:pendingId,message:userText});
  else{setBusy(false);addMessage('assistant','AI connection unavailable.',true);}
 });
 input.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit?.();}
 });
 window.addEventListener('message',event=>{
  const msg=event.data||{};
  if(msg.type!=='roleAiChatReply'||msg.projectId!==project||msg.roleId!==role||msg.requestId!==pendingId)return;
  setBusy(false);addMessage('assistant',msg.text||'No response received.',true);
  activity(msg.error?'AI UNAVAILABLE':'AI RESPONDING');
 });
 function frame(now){
  if(!panel.isConnected){resizeObserver?.disconnect();return;}
  const dt=last?clamp((now-last)/1000,0,.06):0;last=now;
  const thinking=panel.dataset.state==='thinking';
  if(thinking&&!thinkingBefore)activity('REVIEWING ROLE WORK');
  thinkingBefore=thinking;
  if(writer){
   writer.progress+=dt*270;const next=Math.min(writer.text.length,Math.floor(writer.progress));
   if(next>writer.index){
    writer.index=next;writer.node.textContent=writer.text.slice(0,next);
    lastActivity=now;energy=clamp(energy+.018,0,1.8);transcript.scrollTop=transcript.scrollHeight;
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
  }
  const smooth=(a,b,k)=>a+(b-a)*(1-Math.exp(-k*dt));
  height=smooth(height,targetHeight,engaged?6:3);
  opacity=smooth(opacity,targetOpacity,engaged?9:4);
  speed=smooth(speed,targetSpeed,engaged?5:2);
  phase+=dt*speed;energy=Math.max(0,energy-dt*.66);
  if(!engaged)label.textContent=stage==='SLEEPING'?'WAITING FOR ACTIVITY':stage;
  if(ctx){
   ctx.clearRect(0,0,w,h);
   if(opacity>.005){
    const mid=h*.48;
    const baseline=ctx.createLinearGradient(0,0,w,0);
    baseline.addColorStop(0,'rgba(240,250,255,0)');
    baseline.addColorStop(.5,'rgba(230,246,255,.7)');
    baseline.addColorStop(1,'rgba(240,250,255,0)');
    ctx.strokeStyle=baseline;ctx.lineWidth=.85;ctx.globalAlpha=opacity;
    ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(w,mid);ctx.stroke();
    if(height>.004&&!reduceMotion){
     for(let j=0;j<7;j++){
      const color=(hue+j*360/7+Math.sin(phase*.4+j)*18+360)%360;
      const rainbow=ctx.createLinearGradient(0,0,w,0);
      rainbow.addColorStop(0,'hsla('+color+',100%,65%,0)');
      rainbow.addColorStop(.15,'hsla('+color+',100%,65%,.8)');
      rainbow.addColorStop(.52,'hsla('+((color+50)%360)+',100%,68%,.95)');
      rainbow.addColorStop(.85,'hsla('+((color+90)%360)+',100%,66%,.8)');
      rainbow.addColorStop(1,'hsla('+color+',100%,65%,0)');
      ctx.strokeStyle=rainbow;ctx.lineWidth=j===0?2:1.25;
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
       ctx.globalAlpha=opacity*(.55+j*.05);ctx.stroke();
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
