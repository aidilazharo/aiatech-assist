'use strict';
// Read-only role projection. The BA draft, approvals, publication plan and
// Confluence source artifacts remain intact. Jira is the publication authority.
const crypto=require('node:crypto');
const {publishedRoots}=require('./role-jira-inventory');
const ownership=require('./br-ownership');
const routing=require('./jira-role-routing');
const {fieldSection}=require('./jira-preview-details');
const {textFromAdf}=require('./utils');
const {normalizedContent}=require('./br-workflow');
const ID=/^\d{1,30}$/;
const inactive=new Set(['retired','retire-proposed','cancelled','canceled','rejected']);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain=value=>typeof value==='string'?value: value&&typeof value==='object'?textFromAdf(value):'';
const clean=value=>String(value||'').trim();
function checks(issue){
 const f=issue.fields||{},text=plain(f.description),result={acceptanceCriteria:'',definitionOfDone:''};
 // Explicit sections only; don't invent acceptance criteria from a title.
 const matches=[...text.matchAll(/^(?:\s*#+\s*)?(Acceptance criteria|Definition of done)\s*:\s*/gim)];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],field=fieldSection(m[1]);
  result[field]=text.slice(m.index+m[0].length,matches[i+1]?.index??text.length).trim();
 }
 for(const [id,name] of Object.entries(issue.names||{})){
  if(!/^customfield_\d+$/.test(id))continue;
  const field=fieldSection(name);if(!field)continue;
  const value=plain(f[id]).trim();
  if(value&&result[field]&&!result[field].includes(value))result[field]+='\n'+value;
  else if(value)result[field]=value;
 }
 return result;
}
function roleFor(item,old){
 const labels=(item.labels||[]).filter(x=>typeof x==='string'&&x.toLowerCase().startsWith('atgv-role-'));
 const labelRoles=labels.map(x=>routing.normalizeRole(x.slice(10)));
 if(labels.length&&(labelRoles.some(x=>!x)||new Set(labelRoles).size!==1))return '';
 const hints=[old?.row?.roleId,old?.row?.roleLabel?.replace(/^atgv-role-/i,''),old?.path?.match(/\/ROLE-([^/]+)$/i)?.[1]].filter(Boolean).map(routing.normalizeRole);
 if(hints.length&&(hints.some(x=>!x)||new Set(hints).size!==1||labelRoles.length&&labelRoles[0]!==hints[0]))return '';
 const role=labelRoles[0]||hints[0]||'';
 if(role)return role;
 // Legacy unlabelled tasks must have a canonical development mapping.
 return old&&/^(task|subtask|sub-task|sub task)$/i.test(old.row.kind||old.row.issueType)&&/^(task|subtask|sub-task|sub task)$/i.test(item.type)?'software-developer':'';
}
function makeSnapshot({root,register,items,issues,projectKey,previous,verifyMarker}){
 const base=(register.brs||[]).find(b=>b.id===root.id);
 if(inactive.has(base?.status)||register.deletedRequirements?.some(x=>x.id===root.id))throw Error('BR inactive.');
 const byKey=new Map(items.map(x=>[x.key,x])),read=new Map(issues.map(x=>[x.key,x]));
 const allMappings=[...Object.entries(register.synced||{}),...Object.entries(register.roleTaskMappings||{})];
 const mappings=new Map();
 for(const [path,row] of allMappings){
  if(!row?.key)continue;
  const other=mappings.get(row.key);
  if(other&&other.path!==path)throw Error('Ambiguous Jira mapping '+row.key);
  mappings.set(row.key,{path,row});
 }
 const members=new Set(root.keys),rows=[];
 for(const key of root.keys){
  const item=byKey.get(key),issue=read.get(key),f=issue?.fields||{},old=mappings.get(key);
  if(!item||!issue||!ID.test(String(issue.id||''))||String(issue.id)!==String(item.id)||f.project?.key!==projectKey||
   clean(f.issuetype?.name).toLowerCase()!==clean(item.type).toLowerCase()||String(f.updated||'')!==String(item.updated||'')||
   String(f.parent?.key||'')!==String(item.parentKey||''))throw Error('Jira changed during snapshot read: '+key+'. Refresh again.');
  if(old&&(old.path.split('/')[0]!==root.id||old.row.issueId&&String(old.row.issueId)!==String(issue.id)||
   old.row.marker&&!(f.labels||[]).includes(old.row.marker)))throw Error('Conflicting published identity: '+key);
  if(key===root.key){
   if(String(f.issuetype?.name).toLowerCase()!=='epic'||!(old?.row?.marker?(f.labels||[]).includes(old.row.marker):verifyMarker(root.id,{...item,labels:f.labels||[]})))throw Error('Unverified published Epic.');
  }else if(!members.has(item.parentKey)||String(f.issuetype?.name).toLowerCase()==='epic')throw Error('Unverified Jira hierarchy: '+key);
  const role=key===root.key?'':roleFor({...item,labels:f.labels||[]},old);
  const kind=key===root.key?'Epic':/^(feature)$/i.test(old?.row?.kind||item.type)?'Feature':/^(story|user story)$/i.test(old?.row?.kind||item.type)?'Story':/^(task|subtask|sub-task|sub task)$/i.test(item.type)?'Task':'Other';
  const taskRole=role&&['Feature','Story','Task'].includes(kind)?role:'';
  const verifiedMarker=old?.row?.marker||(key===root.key?(f.labels||[]).find(label=>typeof label==='string'&&/^atgv-[a-f0-9]{24}$/.test(label)&&verifyMarker(root.id,{...item,labels:[label]})):'')||'';
  rows.push({key,id:String(issue.id),parentKey:item.parentKey||'',type:item.type,kind,roleId:taskRole,summary:clean(f.summary),description:plain(f.description),...checks(issue),marker:verifiedMarker,labels:[...(f.labels||[])].filter(x=>typeof x==='string').sort(),updated:String(f.updated||'')});
 }
 const epic=rows.find(x=>x.key===root.key);
 if(!epic||!epic.summary)throw Error('Published Epic has no readable summary.');
 // Stable semantic fingerprint excludes status, assignee and update timestamps.
 const semantic=rows.map(({updated,labels,...row})=>row).sort((a,b)=>a.key.localeCompare(b.key));
 const fingerprint=hash(semantic);
 const previousSame=previous?.fingerprint===fingerprint&&previous.issueId===epic.id;
 const revision=previousSame?previous.revision:Math.max(Number(previous?.revision||0)+1,Number(base?.approvedRevision||0)+1,...rows.map(row=>Date.parse(row.updated)||0),1);
 const map=new Map(rows.map(x=>[x.key,x]));
 const features=new Map(),stories=new Map(),synced={};
 const node=row=>({title:row.summary,description:row.description,...(row.acceptanceCriteria?{acceptanceCriteria:row.acceptanceCriteria}:{}),...(row.definitionOfDone?{definitionOfDone:row.definitionOfDone}:{})});
 const ancestor=(row,kind)=>{let cur=row,seen=new Set();while(cur&&!seen.has(cur.key)){if(cur.kind===kind)return cur;seen.add(cur.key);cur=map.get(cur.parentKey);}return null;};
 function feature(row){
  const actual=ancestor(row,'Feature'),id='F-'+(actual?.id||epic.id);
  if(!features.has(id))features.set(id,{id,...(actual?node(actual):{title:'Published Jira work',description:''}),stories:[]});
  return features.get(id);
 }
 function story(row){
  const actual=ancestor(row,'Story'),f=feature(row),id='S-'+(actual?.id||ancestor(row,'Feature')?.id||epic.id),key=f.id+'/'+id;
  if(!stories.has(key)){const entry={id,...(actual?node(actual):{title:'Published tasks',description:''}),tasks:[]};stories.set(key,entry);f.stories.push(entry);}
  return {f,s:stories.get(key)};
 }
 const mapping=(row,kind)=>({key:row.key,issueId:row.id,kind,issueType:row.type,title:row.summary,...(row.marker?{marker:row.marker}:{}),...(row.parentKey?{parentKey:row.parentKey,parentIssueId:map.get(row.parentKey)?.id}:{}),...(row.roleId?{roleId:row.roleId,roleLabel:'atgv-role-'+row.roleId}:{})});
 synced[root.id]=mapping(epic,'Epic');
 for(const row of rows.filter(x=>x!==epic).sort((a,b)=>a.key.localeCompare(b.key))){
  if(row.kind==='Feature'){const f=feature(row);synced[root.id+'/'+f.id]=mapping(row,'Feature');continue;}
  const {f,s}=story(row),path=root.id+'/'+f.id+'/'+s.id;
  if(row.kind==='Story'){synced[path]=mapping(row,'Story');continue;}
  const id='T-'+row.id;
  s.tasks.push({id,...node(row),...(row.roleId?{roleId:row.roleId}:{})});
  // Unclassified tasks can be read, but must never inherit Developer by default.
  synced[path+'/'+id]=mapping(row,row.roleId?'Task':'Unclassified');
 }
 const evidence=semantic.map(row=>({key:row.key,type:row.type,roleId:row.roleId,summary:row.summary,description:row.description,acceptanceCriteria:row.acceptanceCriteria,definitionOfDone:row.definitionOfDone,parentKey:row.parentKey}));
 const content={title:epic.summary.replace(new RegExp('^'+root.id+'\\s*[:·.\\-–—]?\\s*','i'),'')||epic.summary,objective:epic.description,scope:'',acceptanceCriteria:epic.acceptanceCriteria||'',features:[...features.values()]};
 const verifiedAt=new Date().toISOString();
 return {brId:root.id,epic:root.key,issueId:epic.id,fingerprint,revision,verifiedAt,publishedAt:previousSame?(previous.publishedAt||previous.verifiedAt):verifiedAt,content,evidence,synced};
}
async function collect({register,items,projectKey,verifyMarker,readIssue,previous={},shouldContinue=()=>true,maxIssues=350,accountId=''}){
 const roots=publishedRoots(items,register,{projectKey,verifyMarker}),snapshots=[],warnings=[];
 const assigned=new Set(accountId?items.filter(item=>item.assigneeId===accountId&&/^(task|subtask|sub-task|sub task|story|user story|feature)$/i.test(item.type)).map(item=>item.key):[]);
 // Recover the current user's assigned BRs before spending the bounded scan on unrelated work.
 roots.sort((a,b)=>Number(b.keys.some(key=>assigned.has(key)))-Number(a.keys.some(key=>assigned.has(key))));
 const counts=new Map();for(const r of roots)counts.set(r.id,(counts.get(r.id)||0)+1);
 let budget=maxIssues;
 for(const root of roots){
  if(!shouldContinue())throw Error('Project changed during published BR synchronization.');
  if(counts.get(root.id)!==1){warnings.push(root.id+': duplicate published Epic identity.');continue;}
  if(root.keys.length>budget){warnings.push(root.id+': published snapshot scan limit reached; refresh with a smaller scope.');continue;}
  budget-=root.keys.length;
  try{
   const issues=[];
   for(let n=0;n<root.keys.length;n+=5){
    if(!shouldContinue())throw Error('Project changed during snapshot read.');
    issues.push(...await Promise.all(root.keys.slice(n,n+5).map(readIssue)));
   }
   snapshots.push(makeSnapshot({root,register,items,issues,projectKey,previous:previous[root.key],verifyMarker}));
  }catch(error){warnings.push(root.id+': '+String(error.message||error).slice(0,250));}
 }
 return {snapshots,warnings};
}
function project(register,snapshots){
 const next={...register,brs:[],synced:{},roleTaskMappings:{},baPublishedBRs:{}};
 for(const s of snapshots){
  const source=(register.brs||[]).find(b=>b.id===s.brId)||{};
  if(inactive.has(source.status)||register.deletedRequirements?.some(x=>x.id===s.brId))continue;
  next.brs.push({...source,id:s.brId,title:s.content.title,status:'approved',needsRefresh:false,externalReviewRequired:false,roleReviewRequired:false,dependencyReviewRequired:false,approvedContent:s.content,approvedRevision:s.revision,approvedAt:s.publishedAt||s.verifiedAt,livePublishedSnapshot:true,publishedJiraEvidence:s.evidence,publishedFingerprint:s.fingerprint});
  Object.assign(next.synced,s.synced);
  next.baPublishedBRs[s.brId]=normalizedContent(s.content);
 }
 return next;
}
module.exports={makeSnapshot,collect,project,checks,roleFor};
