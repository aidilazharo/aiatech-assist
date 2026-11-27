'use strict';
// One cumulative, project-scoped visual prototype. Each approved UI/UX Jira ticket
// contributes identifiable screens, without replacing another ticket's approval.
// This is a local simulated prototype, not deployed application source code.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {withLock}=require('./file-lock');
const {safeKey}=require('./developer-task-artifacts');
const {checkPath}=require('./ux-ticket-designs');
const exporter=require('./ux-prototype-export');
const ROOT='project-prototype';
function folder(root){return path.join(path.resolve(root),'documents',ROOT);}
function paths(root){const dir=folder(root);return {dir,manifest:path.join(dir,'manifest.json'),html:path.join(dir,'index.html')};}
function slug(value){return String(value||'screen').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'screen';}
function cleanScreen(screen,key,index,storyKey){return {
 id:key+'/'+slug(screen.name)+'-'+index,
 name:String(screen.name||'Screen').slice(0,150),
 purpose:String(screen.purpose||'').slice(0,800),
 components:(screen.components||[]).slice(0,24).map(x=>String(x).slice(0,230)),
 interactions:(screen.interactions||[]).slice(0,24).map(x=>String(x).slice(0,260)),
 jiraKey:key,storyKey,sourceJiraKeys:[key]
};}
function contribution(record){
 if(!record?.exists||record.status!=='approved')throw Error('Only approved UI/UX revisions can update the shared project prototype.');
 const key=safeKey(record.key),storyKey=record.sourceStoryKey?safeKey(record.sourceStoryKey):key;
 const screens=record.prototype?.screens;
 if(!Array.isArray(screens)||!screens.length)throw Error('Approved UI/UX has no prototype screens.');
 return {jiraKey:key,storyKey,revisionNumber:record.revisionNumber,approvedAt:record.reviewedAt||'',approvedBy:record.reviewedBy||'',
  repositorySource:record.repositorySource||null,framework:String(record.designFramework||'aia-qi').slice(0,40),sourceBRHash:String(record.sourceBRHash||'').slice(0,120),
  screens:screens.map((screen,index)=>cleanScreen(screen,key,index,storyKey))};
}
function blank(){return {schema:1,kind:'atgv-project-ux-prototype',tickets:{}};}
async function check(root){
 const p=paths(root);
 for(const f of [path.join(p.dir,'.atgv-check'),p.manifest,p.html]){
  await checkPath(root,f);
 }
 return p;
}
async function load(root){
 const p=await check(root);
 const raw=await fs.readFile(p.manifest,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!raw)return blank();
 const data=JSON.parse(raw);
 if(data.schema!==1||data.kind!=='atgv-project-ux-prototype'||!data.tickets||Array.isArray(data.tickets)||typeof data.tickets!=='object')throw Error('Invalid project prototype manifest.');
 for(const [key,value] of Object.entries(data.tickets)){
  if(safeKey(key)!==key||value.jiraKey!==key||!Array.isArray(value.screens))throw Error('Invalid task provenance in project prototype.');
 }
 return data;
}
function combined(data,{draft=null}={}){
 const tickets={...data.tickets};
 if(draft){const key=safeKey(draft.key);tickets[key]={...contribution({...draft,exists:true,status:'approved'}),draft:true};}
 const entries=Object.values(tickets).sort((a,b)=>a.jiraKey.localeCompare(b.jiraKey));
 const screens=entries.flatMap(item=>item.screens.map(screen=>({...screen,approval:item.draft?'draft': 'approved'})));
 const duplicateNames=new Map();
 for(const screen of screens){const name=slug(screen.name);duplicateNames.set(name,(duplicateNames.get(name)||0)+1);}
 return {schema:1,projects:entries.length,screenCount:screens.length,
  potentialDuplicateScreens:[...duplicateNames].filter(([,n])=>n>1).map(([name])=>name),
  repositorySource:draft?.repositorySource||entries.filter(x=>x.repositorySource?.hasDesign).sort((a,b)=>String(b.approvedAt).localeCompare(String(a.approvedAt)))[0]?.repositorySource||null,screens};
}
function render(data,{draft=null}={}){
 const project=combined(data,{draft});
 const key=draft?.key||project.screens[0]?.jiraKey;
 if(!key)throw Error('No approved UI/UX Jira screens exist in the project prototype.');
 return exporter.render({exists:true,key,status:'approved',revisionNumber:draft?.revisionNumber||1,
  handoff:{summary:'Cumulative project UI/UX prototype · '+project.projects+' Jira design task(s)'},
  repositorySource:project.repositorySource,prototype:{screens:project.screens}}, {projectMode:true,taskCount:project.projects,duplicateNames:project.potentialDuplicateScreens});
}
async function atomicText(file,text){
 const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(tmp,text,{encoding:'utf8',flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
async function update(root,record){
 const item=contribution(record),p=await check(root);
 await fs.mkdir(p.dir,{recursive:true,mode:0o700});await check(root);
 return withLock(p.manifest,async()=>{
  const data=await load(root),old=data.tickets[item.jiraKey];
  if(old&&old.revisionNumber>item.revisionNumber)throw Error('Older UI/UX revision cannot replace a newer approved project contribution.');
  const next={...data,tickets:{...data.tickets,[item.jiraKey]:item}};
  // Publish HTML first, then manifest: if a crash happens, the next opening
  // rebuilds HTML from the manifest, instead of trusting possibly stale HTML.
  await atomicText(p.html,render(next));
  await atomicText(p.manifest,JSON.stringify(next,null,2)+'\n');
  await require('./project-artifact-content').refreshSafe(root);
  return {path:path.relative(root,p.html).replaceAll('\\','/'),...combined(next)};
 });
}
async function retract(root,key){
 const k=safeKey(key),p=await check(root);
 await fs.mkdir(p.dir,{recursive:true,mode:0o700});await check(root);
 return withLock(p.manifest,async()=>{
  const data=await load(root);if(!data.tickets[k])return {changed:false};
  const next={...data,tickets:{...data.tickets}};delete next.tickets[k];
  if(Object.keys(next.tickets).length)await atomicText(p.html,render(next));
  else await fs.rm(p.html,{force:true});
  await atomicText(p.manifest,JSON.stringify(next,null,2)+'\n');
  await require('./project-artifact-content').refreshSafe(root);
  return {changed:true,...combined(next)};
 });
}
async function reconcileExisting(root){
 // Include previously approved tickets after an extension upgrade. Never alter
 // their original Jira-scoped records, and never infer approval from drafts.
 const dir=path.join(path.resolve(root),'documents','jira-designs');
 const found=await fs.readdir(dir,{withFileTypes:true}).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
 if(found.length>300)throw Error('Too many design folders for automatic prototype reconciliation.');
 const pipeline=require('./ux-design-pipeline');
 const approved=[],rejected=[];
 for(const entry of found){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;
  let key;try{key=safeKey(entry.name);}catch{continue;}
  if(key!==entry.name)continue;
  const record=await pipeline.read(root,key);
  if(record.status==='approved')approved.push(contribution(record));
  else if(record.status==='rejected')rejected.push(key);
 }
 if(!approved.length&&!rejected.length)return load(root);
 const p=await check(root);await fs.mkdir(p.dir,{recursive:true,mode:0o700});await check(root);
 return withLock(p.manifest,async()=>{
  const data=await load(root),tickets={...data.tickets};let changed=false;
  for(const item of approved){const prior=tickets[item.jiraKey];if(!prior||prior.revisionNumber<item.revisionNumber){tickets[item.jiraKey]=item;changed=true;}}
  for(const key of rejected){if(tickets[key]){delete tickets[key];changed=true;}}
  if(!changed)return data;
  const next={...data,tickets};
  if(Object.keys(tickets).length)await atomicText(p.html,render(next));
  else await fs.rm(p.html,{force:true});
  await atomicText(p.manifest,JSON.stringify(next,null,2)+'\n');
  return next;
 });
}
async function openable(root,record){
 const p=await check(root),data=await reconcileExisting(root);
 if(record?.status==='review'){
  const file=path.join(p.dir,'preview-'+safeKey(record.key)+'.html');
  await checkPath(root,file);await fs.mkdir(p.dir,{recursive:true});await checkPath(root,file);
  await atomicText(file,render(data,{draft:record}));
  await require('./project-artifact-content').refreshSafe(root);
  return {file,scope:'project-preview',screens:combined(data,{draft:record}).screenCount};
 }
 if(record?.status==='approved'&&!data.tickets[safeKey(record.key)]){
  // Upgrade legacy approved designs into the shared prototype when opened.
  await update(root,record);
 }else if(record?.status==='approved'&&data.tickets[safeKey(record.key)]?.revisionNumber<record.revisionNumber){
  await update(root,record);
 }
 const current=await load(root);
 if(!Object.keys(current.tickets).length)throw Error('The project has no approved prototype screens.');
 await atomicText(p.html,render(current));
 await require('./project-artifact-content').refreshSafe(root);
 return {file:p.html,scope:'project-approved',screens:combined(current).screenCount};
}
module.exports={folder,paths,slug,contribution,combined,load,render,update,retract,openable,reconcileExisting};
