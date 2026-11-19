'use strict';
// Authenticated local checkpoints contain AI responses only; no partial
// discovery answers are committed until the entire source mapping succeeds.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const DIGEST=/^[a-f0-9]{64}$/;
const MAX_BYTES=8*1024*1024;
function keyBytes(secret){
 if(!DIGEST.test(String(secret||'')))throw Error('AI resume key is unavailable.');
 return Buffer.from(secret,'hex');
}
function validateMeta(meta){
 if(!meta||!DIGEST.test(String(meta.sourceDigest||''))||!DIGEST.test(String(meta.textDigest||''))||!DIGEST.test(String(meta.modelDigest||''))||
    !String(meta.revision||'')||String(meta.revision).length>128)throw Error('Invalid AI resume identity.');
 return {sourceDigest:meta.sourceDigest,textDigest:meta.textDigest,modelDigest:meta.modelDigest,revision:String(meta.revision)};
}
function validatePayload(payload){
 const meta=validateMeta(payload);
 if(payload.schema!==1||!Array.isArray(payload.sectionLengths)||!payload.sectionLengths.length||payload.sectionLengths.length>25||
    payload.sectionLengths.some(n=>!Number.isSafeInteger(n)||n<1||n>300000))throw Error('Invalid AI resume sections.');
 for(const [name,limit,maxLength] of [['preflight',60,20000],['mapping',30,95000],['cross',5,12000]]){
  const entries=payload[name];
  if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>limit||
     Object.entries(entries).some(([key,value])=>!DIGEST.test(key)||typeof value!=='string'||value.length>maxLength))
   throw Error('Invalid AI resume records.');
 }
 return meta;
}
async function directory(registry,id,{create=false}={}){
 const root=path.dirname(registry.fileFor(id));
 const parts=[root,path.join(root,'documents'),path.join(root,'documents','requirements'),path.join(root,'documents','requirements','ai-resume')];
 for(const part of parts){
  let stat=await fs.lstat(part).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(!stat&&create){try{await fs.mkdir(part,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}stat=await fs.lstat(part);}
  if(!stat)return null;
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe AI resume directory.');
 }
 return parts.at(-1);
}
function signature(payload,secret){return crypto.createHmac('sha256',keyBytes(secret)).update(JSON.stringify(payload)).digest('hex');}
function fresh(meta,sections){
 const id=validateMeta(meta);
 return {schema:1,...id,sectionLengths:sections.map(text=>text.length),preflight:{},mapping:{},cross:{}};
}
async function load(registry,id,meta,secret){
 const expected=validateMeta(meta),folder=await directory(registry,id);
 if(!folder)return null;
 const file=path.join(folder,expected.sourceDigest+'.json');
 const stat=await fs.lstat(file).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
 if(!stat)return null;
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('Unsafe AI resume checkpoint.');
 let record;
 try{record=JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}
 try{
  validatePayload(record.payload);
  if(!DIGEST.test(String(record.mac||'')))return null;
  const actual=Buffer.from(signature(record.payload,secret),'hex'),stored=Buffer.from(record.mac,'hex');
  if(!crypto.timingSafeEqual(actual,stored))return null;
  if(Object.keys(expected).some(key=>record.payload[key]!==expected[key]))return null;
  return record.payload;
 }catch{return null;}
}
async function save(registry,id,payload,secret){
 validatePayload(payload);
 const raw=JSON.stringify({payload,mac:signature(payload,secret)})+'\n';
 if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('AI resume checkpoint exceeds the size limit.');
 const folder=await directory(registry,id,{create:true}),file=path.join(folder,payload.sourceDigest+'.json');
 const existing=await fs.lstat(file).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
 if(existing&&(!existing.isFile()||existing.isSymbolicLink()))throw Error('Unsafe AI resume checkpoint.');
 const temp=path.join(folder,'.'+crypto.randomBytes(12).toString('hex')+'.tmp');
 try{await fs.writeFile(temp,raw,{flag:'wx',mode:0o600});await fs.rename(temp,file);}
 finally{await fs.rm(temp,{force:true});}
}
async function remove(registry,id,sourceDigest){
 if(!DIGEST.test(String(sourceDigest||'')))throw Error('Invalid AI resume source.');
 const folder=await directory(registry,id);if(!folder)return;
 const file=path.join(folder,sourceDigest+'.json'),stat=await fs.lstat(file).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
 if(!stat)return;if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe AI resume checkpoint.');
 await fs.unlink(file);
}
module.exports={fresh,load,save,remove,validatePayload};
