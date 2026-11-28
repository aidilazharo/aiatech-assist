'use strict';
// Compare stored design revisions without modifying approval or artifact state.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const MAX_SNAPSHOT=2*1024*1024;
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function designDigest(record){
 const {status,...handoff}=record.handoff||{};
 const content={key:record.key,revisionNumber:record.revisionNumber,
  sourceBRHash:record.sourceBRHash,sourceBrId:record.sourceBrId,sourceStoryKey:record.sourceStoryKey,
  sourceTaskKeys:record.sourceTaskKeys,designReferenceHash:record.designReferenceHash,
  designFramework:record.designFramework,wireframeRevision:record.wireframeRevision,
  mockupRevision:record.mockupRevision,repositorySource:record.repositorySource,
  referenceUsed:record.referenceUsed,flow:record.flow,prototype:record.prototype,handoff};
 return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
function screenMap(record){
 const counts=new Map(),map=new Map();
 for(const screen of (Array.isArray(record.prototype?.screens)?record.prototype.screens:[]).slice(0,12)){
  const name=String(screen?.name||'Unnamed screen').slice(0,150),n=(counts.get(name)||0)+1;
  counts.set(name,n);map.set(JSON.stringify([name,n]),{name:n===1?name:name+' ('+n+')',screen});
 }
 return map;
}
function summarize(before,after){
 const old=screenMap(before),current=screenMap(after),added=[],removed=[],changed=[];
 for(const [key,item] of current){
  const previous=old.get(key);if(!previous){added.push(item.name);continue;}
  const fields=['purpose','components','interactions'].filter(field=>!same(previous.screen[field],item.screen[field]));
  if(fields.length)changed.push({name:item.name,fields});
 }
 for(const [key,item] of old)if(!current.has(key))removed.push(item.name);
 const sections=[];
 const check=(label,a,b)=>{if(!same(a,b))sections.push(label);};
 check('User flow',before.flow,after.flow);
 check('Screen order',Array.from(old.keys()),Array.from(current.keys()));
 check('Approved BR reference',before.sourceBRHash,after.sourceBRHash);
 check('Design reference',before.designReferenceHash,after.designReferenceHash);
 check('Design framework',before.designFramework,after.designFramework);
 check('Wireframe artifact revision',before.wireframeRevision,after.wireframeRevision);
 check('Mockup artifact revision',before.mockupRevision,after.mockupRevision);
 check('Handoff accessibility',before.handoff?.accessibility,after.handoff?.accessibility);
 check('Handoff questions and assumptions',[before.handoff?.questions,before.handoff?.assumptions],[after.handoff?.questions,after.handoff?.assumptions]);
 return {added,removed,changed,sections};
}
async function comparePrevious(root,file,current,checkPath){
 if(!Number.isSafeInteger(current.revisionNumber)||current.revisionNumber<2)return null;
 const from=current.revisionNumber-1,to=current.revisionNumber;
 const unavailable=reason=>({from,to,available:false,verified:false,reason});
 const entry=(Array.isArray(current.history)?current.history:[]).find(row=>row?.version===from);
 if(!entry)return unavailable('Previous revision metadata is unavailable.');
 const snapshot=path.join(path.dirname(file),'ui-ux-workflow-v'+from+'.json');
 try{
  await checkPath(root,snapshot);
  const stat=await fs.lstat(snapshot);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_SNAPSHOT)return unavailable('Previous revision snapshot is unsafe or too large.');
  const raw=await fs.readFile(snapshot,'utf8');
  if(Buffer.byteLength(raw)>MAX_SNAPSHOT)return unavailable('Previous revision snapshot is too large.');
  const previous=JSON.parse(raw);
  if(previous.schema!==1||previous.key!==current.key||previous.revisionNumber!==from||previous.generatedAt!==entry.generatedAt||!Array.isArray(previous.prototype?.screens))return unavailable('Previous revision identity could not be verified.');
  const verified=typeof entry.designDigest==='string'&&/^[a-f0-9]{64}$/.test(entry.designDigest)&&entry.designDigest===designDigest(previous);
  if(Object.hasOwn(entry,'designDigest')&&!verified)return unavailable('Previous revision failed its design integrity check.');
  return {from,to,available:true,verified,...summarize(previous,current)};
 }catch{return unavailable('Previous revision snapshot is unavailable or invalid.');}
}
module.exports={designDigest,summarize,comparePrevious};
