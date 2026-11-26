'use strict';
const {ROLES,isIdentityQuestion,identity,buildPrompt}=require('./my-work-role-prompts');
// Role histories are memory-only, project/role isolated, and expire at the
// workstation's local midnight. No chat transcript is copied to SQLite/RAG.
const sessions=new Map(),busy=new Set();
const dayLocal=(date=new Date())=>[date.getFullYear(),
 String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
let activeDay=dayLocal();
const key=(projectId,roleId,day=activeDay)=>String(projectId)+'\u0000'+String(roleId)+'\u0000'+day;
function resetExpired(now=new Date()){
 const date=dayLocal(now);
 if(date!==activeDay){
  activeDay=date;
  sessions.clear();
  // In-flight requests from yesterday cannot share today's session keys.
  // They may complete but their history is not retained.
 }
 return activeDay;
}
async function ask({projectId,roleId,message,request,repositoryTarget='',clock=()=>new Date()}){
 if(!ROLES[roleId])throw Error('Unsupported My Work role.');
 const user=String(message==null?'':message).trim();
 if(!user||user.length>4000)throw Error('Chat message must contain 1–4000 characters.');
 const requestDay=resetExpired(clock());
 if(isIdentityQuestion(user))return identity(roleId);
 const id=key(projectId,roleId)+(roleId==='software-developer'&&(['extension','library','project'].includes(repositoryTarget)||/^project:[a-f0-9]{64}$/.test(repositoryTarget))?'\u0000'+repositoryTarget:'');
 if(busy.has(id))throw Error('A role AI reply is already being generated.');
 busy.add(id);
 try{
  const history=sessions.get(id)||[];
  const prompt=buildPrompt(roleId,user,{projectId,history});
  const answer=String(await request(prompt)||'').trim().slice(0,7000);
  if(!answer)throw Error('AI provider returned no response.');
  // Never revive a history from the previous calendar day after a slow request.
  if(resetExpired(clock())===requestDay){
   sessions.delete(id);
   sessions.set(id,[...history,{role:'user',text:user},{role:'assistant',text:answer}].slice(-8));
   if(sessions.size>40)sessions.delete(sessions.keys().next().value);
  }
  return answer;
 }finally{busy.delete(id);}
}
function clear(projectId,roleId){
 const prefix=String(projectId)+'\u0000'+String(roleId)+'\u0000';
 for(const id of sessions.keys())if(id.startsWith(prefix))sessions.delete(id);
}
// While VS Code remains open, expire all server-side session contexts exactly
// at the next local midnight, including across daylight-saving transitions.
function scheduleMidnightReset(){
 const now=new Date();
 const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 const ms=Math.max(100,midnight.getTime()-now.getTime()+100);
 const timer=setTimeout(()=>{resetExpired();scheduleMidnightReset();},ms);
 timer.unref?.();
}
scheduleMidnightReset();
module.exports={ask,clear,dayLocal,resetExpired};
