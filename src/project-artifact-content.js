'use strict';
// Materialized project-local content view. Canonical records and user-approved
// revision checks remain in the existing stores. Never scan Git, credentials,
// environment files, shared global storage, or unrelated projects.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {withLock}=require('./file-lock');
const artifacts=require('./project-artifacts');
const MAX_FILE=40*1024*1024,MAX_TOTAL=500*1024*1024,MAX_FILES=2500;
const allowed=new Set(['.pdf','.docx','.doc','.pptx','.ppt','.xlsx','.xls','.csv','.txt','.md','.rst','.mdx','.json','.jsonl','.html','.htm','.css','.js','.jsx','.ts','.tsx','.svg','.png','.jpg','.jpeg','.webp','.drawio','.mmd','.puml','.xml','.yaml','.yml','.sql','.odt','.ods','.odp']);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const st=p=>fs.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
function safePart(s){return typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,179}$/.test(s)&&!/\.(?:env|pem|key|p12|pfx)$/i.test(s)&&!/^(?:credentials?|secrets?|tokens?|passwords?|auth(?:entication)?)(?:[._-]|$)/i.test(s);}
async function checked(root,relative,create=false){
 const parts=relative.split('/');if(!parts.every(safePart))throw Error('Unsafe artifact content path.');
 let p=root;for(const part of parts){p=path.join(p,part);const item=await st(p);
  if(item&&(!item.isDirectory()||item.isSymbolicLink()))throw Error('Unsafe artifact content directory.');
  if(!item){if(!create)return null;await fs.mkdir(p,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});}
  const actual=await fs.lstat(p);if(!actual.isDirectory()||actual.isSymbolicLink())throw Error('Unsafe artifact content directory.');
 }return p;
}
async function atomic(file,bytes){
 const old=await st(file);if(old&&(!old.isFile()||old.isSymbolicLink()||old.nlink>1))throw Error('Unsafe artifact content destination.');
 const temp=file+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(temp,bytes,{flag:'wx',mode:0o600});await fs.rename(temp,file);}
 finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}
// Enumerate only known project document stores. Source type is based on the
// owning store, not the contents of an AI-generated or uploaded document.
function classify(rel){
 if(/^documents\/requirements\/sources\//.test(rel))return {kind:'reference',role:'business-analyst'};
 if(/^documents\/jira-designs\/[^/]+\/(?:reference(?:-|\.json$)|image-|images\.json$)/.test(rel))return {kind:'reference',role:'ux-designer'};
 if(/^documents\/(?:jira-designs|project-prototype|designs)\//.test(rel))return {kind:'generated',role:'ux-designer'};
 if(/^documents\/requirements\//.test(rel)||/^approved-brs\//.test(rel))return {kind:'generated',role:'business-analyst'};
 if(/^documents\/architecture\//.test(rel))return {kind:'generated',role:'solution-architect'};
 if(/^documents\/(?:jira-artifacts|development)\//.test(rel))return {kind:'generated',role:'software-developer'};
 if(/^documents\/testing\//.test(rel))return {kind:'generated',role:'qa-engineer'};
 if(/^documents\/deployment\//.test(rel))return {kind:'generated',role:'release-manager'};
 if(/^documents\/meetings\//.test(rel))return {kind:'generated',role:'project-manager'};
 return {kind:'generated',role:'shared'};
}
async function refresh(root){
 root=path.resolve(root);const base=await artifacts.ensure(root);
 const target=await checked(base,'content',true);
 return withLock(path.join(target,'manifest.json'),async()=>{
  const entries=[];let count=0,total=0;const staging=path.join(target,'stage-'+crypto.randomUUID());await fs.mkdir(staging,{mode:0o700});
  const walk=async(folder,rel,depth=0)=>{
   if(depth>12)throw Error('Artifact content nesting limit reached.');
   for(const item of await fs.readdir(folder,{withFileTypes:true})){
    if(!safePart(item.name)||item.isSymbolicLink())continue;
    const file=path.join(folder,item.name),relative=rel+'/'+item.name;
    if(item.isDirectory()){await walk(file,relative,depth+1);continue;}
    if(!item.isFile()||!allowed.has(path.extname(item.name).toLowerCase()))continue;
    const current=await fs.lstat(file);if(!current.isFile()||current.isSymbolicLink()||current.nlink>1)continue;
    if(++count>MAX_FILES||current.size>MAX_FILE||(total+=current.size)>MAX_TOTAL)throw Error('Artifact content snapshot exceeds safe limits; previous snapshot retained.');
    const bytes=await fs.readFile(file);if(bytes.length!==current.size)throw Error('Artifact changed during snapshot; retry.');
    const info=classify(relative);
    const dest=info.kind==='reference'?'references/'+info.role+'/'+relative:'generated/'+info.role+'/'+relative;
    const directory=await checked(staging,path.posix.dirname(dest),true);
    await atomic(path.join(directory,path.posix.basename(dest)),bytes);
    entries.push({path:'content/current/'+dest,source:relative,kind:info.kind,role:info.role,sha256:sha(bytes),bytes:bytes.length,authority:'canonical-source-must-be-revalidated'});
   }
  };
  try{
   for(const name of ['documents','approved-brs']){
    const folder=await checked(root,name);if(folder)await walk(folder,name);
   }
   const manifest={schema:1,projectId:path.basename(root),generatedAt:new Date().toISOString(),files:entries,note:'Local copies, not independent approvals. Uploaded originals are reference data. Generated files may be drafts, placeholders, manual or AI-authored. Verify the canonical revision and permission before using.'};
   await atomic(path.join(staging,'manifest.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
   const current=path.join(target,'current'),old=await st(current),backup=path.join(target,'old-'+crypto.randomUUID());
   if(old&&(!old.isDirectory()||old.isSymbolicLink()))throw Error('Unsafe artifact content snapshot.');
   if(old)await fs.rename(current,backup);
   try{await fs.rename(staging,current);}catch(e){if(old)await fs.rename(backup,current);throw e;}
   if(old)await fs.rm(backup,{recursive:true,force:true});
   await fs.rm(path.join(base,'content-status.json'),{force:true}).catch(()=>{});
   return manifest;
  }finally{await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
 });
}
// Optional mirror failure must never be represented as failure of a canonical
// transaction that has already committed. Record a non-sensitive status.
async function refreshSafe(root){
 try{return await refresh(root);}
 catch(error){
  try{const base=await artifacts.ensure(root);await atomic(path.join(base,'content-status.json'),Buffer.from(JSON.stringify({status:'refresh-required',at:new Date().toISOString(),message:'Content snapshot could not be refreshed; canonical sources remain authoritative.'})+'\n'));}catch{}
  return null;
 }
}
module.exports={classify,refresh,refreshSafe};
