'use strict';
const {ROLES,isIdentityQuestion,identity,buildPrompt}=require('./my-work-role-prompts');
const sessions=new Map(),busy=new Set();
const key=(projectId,roleId)=>String(projectId)+'\u0000'+String(roleId);
async function ask({projectId,roleId,message,request}){
 if(!ROLES[roleId])throw Error('Unsupported My Work role.');
 const user=String(message==null?'':message).trim();
 if(!user||user.length>4000)throw Error('Chat message must contain 1–4000 characters.');
 if(isIdentityQuestion(user))return identity(roleId);
 const id=key(projectId,roleId);
 if(busy.has(id))throw Error('A role AI reply is already being generated.');
 busy.add(id);
 try{
  const history=sessions.get(id)||[];
  const prompt=buildPrompt(roleId,user,{projectId,history});
  const answer=String(await request(prompt)||'').trim().slice(0,7000);
  if(!answer)throw Error('AI provider returned no response.');
  sessions.delete(id);
  sessions.set(id,[...history,{role:'user',text:user},{role:'assistant',text:answer}].slice(-8));
  if(sessions.size>40)sessions.delete(sessions.keys().next().value);
  return answer;
 }finally{busy.delete(id);}
}
function clear(projectId,roleId){sessions.delete(key(projectId,roleId));}
module.exports={ask,clear};
