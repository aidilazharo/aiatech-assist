'use strict';
// Jira-linked developer artifacts are local drafts; they are never reported as
// reviewed, deployed, tested or done merely because a document exists.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {withLock}=require('./file-lock');
const TYPES=Object.freeze({frontend:'Frontend',backend:'API / Backend',database:'Database',integration:'Integration',testing:'Testing'});
function safeKey(key){const value=String(key||'').toUpperCase();if(!/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/.test(value))throw Error('Invalid Jira issue key.');return value;}
function safeType(type){const value=String(type||'');if(!Object.hasOwn(TYPES,value))throw Error('Unsupported task artifact category.');return value;}
function checksum(text){return crypto.createHash('sha256').update(text).digest('hex');}
function location(root,key,type){return path.join(path.resolve(root),'documents','jira-artifacts',safeKey(key),safeType(type)+'.md');}
async function noSymlinkAncestors(root,destination){
 const base=await fs.realpath(root);const relative=path.relative(path.resolve(root),destination);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Artifact outside project.');
 let current=base;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  const stat=await fs.lstat(current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(stat?.isSymbolicLink())throw Error('Symlink in artifact path is not permitted.');
  if(stat&&!stat.isDirectory()&&current!==path.join(base,relative))throw Error('Invalid artifact directory.');
 }
}
async function read(root,key,type){
 const target=location(root,key,type);await noSymlinkAncestors(root,target);
 const raw=await fs.readFile(target,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 return {key:safeKey(key),type:safeType(type),title:TYPES[type],path:path.relative(root,target).replaceAll('\\','/'),exists:raw!==null,content:raw||'',revision:raw===null?'':checksum(raw)};
}
function template(key,type,summary=''){
 const label=TYPES[safeType(type)],jira=safeKey(key),name=String(summary||'').replace(/[\r\n]/g,' ').slice(0,240);
 return [`# ${label} — ${jira}`,'',name?`Jira task: ${name}`:`Jira task: ${jira}`,'','## Scope and acceptance criteria','','- Confirm expected behavior with the Jira issue and approved Business Requirements.','','## Implementation and file references','','- Record actual repository paths, PR links, diagrams or API specifications.','','## Verification evidence','','- Add genuine build, review, integration or test results; do not record hypothetical passes.','','## Outstanding decisions','','- ',''].join('\n');
}
async function save(root,key,type,content,expectedRevision){
 const text=String(content||'');if(!text.trim()||text.length>180000)throw Error('Artifact must contain 1 to 180,000 characters.');
 const target=location(root,key,type);await noSymlinkAncestors(root,target);
 await fs.mkdir(path.dirname(target),{recursive:true});await noSymlinkAncestors(root,target);
 return withLock(target,async()=>{
  const previous=await read(root,key,type);
  if(previous.revision!==String(expectedRevision||''))throw Error('Artifact was changed by another editor. Reload it before saving.');
  const temporary=target+'.'+crypto.randomUUID()+'.tmp';
  try{
   await fs.writeFile(temporary,text,{encoding:'utf8',flag:'wx',mode:0o600});
   await noSymlinkAncestors(root,target);
   await fs.rename(temporary,target);
  }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  return read(root,key,type);
 });
}
function progress(issue){
 const subtasks=Array.isArray(issue?.fields?.subtasks)?issue.fields.subtasks:[];
 const done=subtasks.filter(sub=>String(sub?.fields?.status?.statusCategory?.key||'').toLowerCase()==='done').length;
 if(subtasks.length)return {percent:Math.round(done*100/subtasks.length),label:`${done} of ${subtasks.length} subtasks Done`,basis:'subtasks',done,total:subtasks.length};
 const category=String(issue?.fields?.status?.statusCategory?.key||'').toLowerCase();
 const percentages={new:0,indeterminate:50,done:100};
 const percent=Object.hasOwn(percentages,category)?percentages[category]:0;
 return {percent,label:`Jira workflow: ${String(issue?.fields?.status?.name||'Unknown')}`,basis:'workflow',done:0,total:0};
}
function designReferences(designState){
 const refs=[];
 for(const [kind,label] of [['mockup','Screen Mockups'],['prototype','Interactive Prototype'],['architecture','Architecture Diagram'],['database','Database Design'],['api','API Design'],['ux','User Experience Flows']]){
  const versions=designState?.designs?.[kind]||[];
  const latest=versions.filter(item=>item.status==='approved').at(-1)||versions.at(-1);
  if(!latest?.id)continue;
  refs.push({kind,proposalId:latest.id,label,title:String(latest.design?.title||label).slice(0,160),status:latest.status==='approved'?'Approved':'Draft',scope:'Project-wide reference; verify applicability to this Jira issue'});
 }
 return refs;
}
module.exports={TYPES,safeKey,safeType,location,read,save,template,progress,designReferences};
