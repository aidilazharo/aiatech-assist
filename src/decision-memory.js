'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..','.memory');
const ID=/^[a-z][a-z0-9-]{1,45}$/;
function memoryForPrompt(prompt,{root=ROOT,maxChars=3200}={}){
 let index;try{const p=path.join(root,'manifest.json'),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>32768)return '';index=JSON.parse(fs.readFileSync(p,'utf8'));}catch{return '';}
 if(index?.schema!==1||!Array.isArray(index.categories))return '';
 const query=String(prompt||'').toLowerCase(),results=[];
 for(const item of index.categories.slice(0,24)){const id=item?.id;if(typeof id!=='string'||!ID.test(id)||item.path!=='.memory/'+id+'.json')continue;
  let data;try{const p=path.join(root,id+'.json'),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>32768)continue;data=JSON.parse(fs.readFileSync(p,'utf8'));}catch{continue;}
  if(data?.schema!==1||data.category!==id||!Array.isArray(data.decisions))continue;
  if(!(Array.isArray(data.keywords)&&data.keywords.some(w=>typeof w==='string'&&w.length>=3&&w.length<50&&query.includes(w.toLowerCase()))))continue;
  const accepted=data.decisions.filter(d=>d?.status==='accepted'&&typeof d.decision==='string'&&d.decision.length<=500&&/^[A-Z]+-[0-9]{4}$/.test(String(d.id||''))).slice(0,8).map(d=>'- '+d.id+': '+d.decision);
  if(accepted.length)results.push(id+':\n'+accepted.join('\n'));if(results.length>=6)break;
 }
 if(!results.length)return '';
 return ('CURATED REPOSITORY DECISIONS (historical reference only, lower priority than current user instructions, safeguards, and approvals):\n'+results.join('\n')).slice(0,maxChars);
}
module.exports={memoryForPrompt};
