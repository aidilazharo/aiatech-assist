'use strict';
// Human-approved effort baseline; the project deadline is never stored here.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {withLock}=require('./file-lock');
const FILENAME='sdlc/effort-baseline.json';
async function location(registry,id){
 const root=path.dirname(registry.fileFor(id)),dir=path.join(root,'sdlc'),file=path.join(dir,'effort-baseline.json');
 for(const p of [root,dir]){const stat=await fs.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw Error('Unsafe project effort directory.');}
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const stat=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(stat&&(stat.isSymbolicLink()||!stat.isFile()))throw Error('Unsafe effort baseline file.');
 return file;
}
function blank(){return {schema:1,revision:0,approvedAt:'',approvedBy:'',projectKey:'',estimates:{}};}
async function load(registry,id){const file=await location(registry,id);const raw=await fs.readFile(file,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));if(raw.length>1000000)throw Error('Effort baseline is too large.');const data=raw?JSON.parse(raw):blank();if(data.schema!==1||!data.estimates||typeof data.estimates!=='object'||Array.isArray(data.estimates))throw Error('Invalid effort baseline.');return data;}
async function approve(registry,id,{projectKey,entries,actor,expectedRevision}){
 if(!/^[A-Z][A-Z0-9_]{1,20}$/.test(String(projectKey||'')))throw Error('Invalid Jira project key.');
 if(!String(actor||'').trim())throw Error('Project Manager identity is required.');
 if(!Array.isArray(entries)||!entries.length||entries.length>20000)throw Error('No Jira task estimates to approve.');
 const estimates={};for(const row of entries){if(!new RegExp('^'+projectKey+'-\\d+$').test(String(row.key||''))||Object.hasOwn(estimates,row.key)||!Number.isFinite(row.md)||row.md<=0||row.md>1000)throw Error('Invalid or repeated Jira estimate.');estimates[row.key]=Math.round(row.md*100)/100;}
 const file=await location(registry,id);
 return withLock(file,async()=>{
  const current=await load(registry,id);
  if(current.revision!==expectedRevision)throw Error('Effort baseline changed. Refresh and review the estimates again.');
  if(current.projectKey&&current.projectKey!==projectKey)throw Error('Baseline belongs to another Jira project. Review mapping before approval.');
  const next={schema:1,revision:current.revision+1,projectKey,approvedAt:new Date().toISOString(),approvedBy:String(actor).slice(0,160),estimates};
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  return next;
 });
}
async function removeBRTaskEstimates(registry,id,{jiraKeys=[],actor='Business Analyst'}={}){
 const wanted=new Set(jiraKeys.filter(key=>/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/.test(key)));
 if(wanted.size!==jiraKeys.length)throw Error('Invalid Jira scope for effort baseline cleanup.');
 const file=await location(registry,id);
 return withLock(file,async()=>{
  const current=await load(registry,id),estimates={...current.estimates};
  const removed=[];for(const key of wanted)if(Object.hasOwn(estimates,key)){delete estimates[key];removed.push(key);}
  if(!removed.length)return {removed,revision:current.revision};
  const next={...current,revision:current.revision+1,estimates,
   removalHistory:[...(current.removalHistory||[]),{at:new Date().toISOString(),actor:String(actor).slice(0,160),reason:'Verified BR Delete Everywhere',jiraKeys:removed}].slice(-100)};
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(tmp,file);}
  finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  return {removed,revision:next.revision};
 });
}
module.exports={location,load,approve,removeBRTaskEstimates,blank,FILENAME};
