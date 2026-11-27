'use strict';
// Bounded, redacted Technology Stack journal, stored outside the Git checkout.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {redact}=require('./architect-error-logs');
const MAX_BYTES=768*1024,queues=new Map();
function paths(root,id){
 if(!path.isAbsolute(String(root||''))||!String(id||'').trim())throw Error('Trusted storage path and project required.');
 const folder=path.join(root,'stack-activity');
 return {folder,file:path.join(folder,crypto.createHash('sha256').update(String(id)).digest('hex')+'.log')};
}
async function safe(folder,file){
 const dir=await fs.lstat(folder).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(dir&&(!dir.isDirectory()||dir.isSymbolicLink()))throw Error('Unsafe stack activity directory.');
 const item=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(item&&(!item.isFile()||item.isSymbolicLink()))throw Error('Unsafe stack activity log.');
}
async function read(root,id){
 const {folder,file}=paths(root,id);await safe(folder,file);
 const content=await fs.readFile(file,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
 return content?{content,events:content.split('\n').filter(Boolean).length}:null;
}
async function persist(root,id,stage,message){
 const {folder,file}=paths(root,id);await safe(folder,file);
 await fs.mkdir(folder,{recursive:true,mode:0o700});
 const old=await fs.readFile(file,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
 const line=new Date().toISOString()+' | '+redact(stage).replace(/[\r\n]/g,' ').slice(0,100)+' | '+
  redact(message).replace(/[\r\n]/g,' ').slice(0,5000)+'\n';
 let content=old+line;
 if(Buffer.byteLength(content,'utf8')>MAX_BYTES){
  const lines=content.split('\n');
  while(lines.length>1&&Buffer.byteLength(lines.join('\n'),'utf8')>MAX_BYTES-100)lines.shift();
  content='[Older diagnostic records omitted]\n'+lines.join('\n');
 }
 const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(tmp,content,{flag:'wx',mode:0o600});await fs.rename(tmp,file);}
 finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
 await require('./project-artifacts').appendDiagnostic(root,id,'solution-architect',{stage,action:'stack-activity',status:/error|fail|blocked/i.test(String(stage))?'failed':'info',details:message}).catch(()=>{});
 return {events:content.split('\n').filter(Boolean).length};
}
function append(root,id,stage,message){
 const key=paths(root,id).file;
 const task=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>persist(root,id,stage,message));
 queues.set(key,task);
 void task.then(()=>{if(queues.get(key)===task)queues.delete(key);},
  ()=>{if(queues.get(key)===task)queues.delete(key);});
 return task;
}
module.exports={append,read,paths,MAX_BYTES};
