'use strict';
// Ticket delivery gates use live Jira/GitHub and revision-bound execution evidence.
// No artifact draft, AI output or workflow stage alone constitutes proof of delivery.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {withLock}=require('./file-lock');
const {safeKey,TYPES}=require('./developer-task-artifacts');
const IMPLEMENTATION=['frontend','backend','database','integration'];
const digest=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function categories(value){
 if(!Array.isArray(value)||value.length>5||value.some(x=>!Object.hasOwn(TYPES,x))||new Set(value).size!==value.length)throw Error('Invalid delivery artifact selection.');
 const result=IMPLEMENTATION.filter(x=>value.includes(x));
 if(!result.length)throw Error('Select at least one applicable implementation artifact.');
 return [...result,'testing'];
}
async function safeFolder(root,key){
 const base=await fs.realpath(root),relative=path.join('documents','jira-delivery',safeKey(key));
 let current=base;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  const s=await fs.lstat(current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(s?.isSymbolicLink()||s&&!s.isDirectory())throw Error('Unsafe delivery record path.');
 }
 return current;
}
async function readJson(root,key,name){
 if(!['verification.json','publication.json'].includes(name))throw Error('Unsupported delivery record.');
 const folder=await safeFolder(root,key),file=path.join(folder,name);
 try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe delivery record file.');return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function saveJson(root,key,name,value){
 if(!['verification.json','publication.json'].includes(name))throw Error('Unsupported delivery record.');
 const folder=await safeFolder(root,key);await fs.mkdir(folder,{recursive:true});await safeFolder(root,key);
 const file=path.join(folder,name);
 return withLock(file,async()=>{
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  return value;
 });
}
async function writeReport(root,key,content){
 const folder=await safeFolder(root,key);await fs.mkdir(folder,{recursive:true});await safeFolder(root,key);
 const file=path.join(folder,'completion-report.md'),text=String(content||'');
 if(!text||text.length>150000)throw Error('Invalid completion report.');
 await withLock(file,async()=>{
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{await fs.writeFile(temp,text,{flag:'wx',mode:0o600});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 });
 return path.relative(root,file).replaceAll('\\','/');
}
function branchFor(key,branch){return branch===`feature/${safeKey(key).toLowerCase()}`||String(branch||'').startsWith(`feature/${safeKey(key).toLowerCase()}-`);}
function verifyPullRequest(pr,head,branch){
 if(!pr||!pr.number)return {ok:false,reason:'No pull request for the Jira feature branch.'};
 if(pr.head?.ref!==branch||pr.head?.sha!==head)return {ok:false,reason:'The pull request head does not match the current local commit.'};
 if(pr.draft)return {ok:false,reason:'Pull request is still a draft.'};
 const reviews=(pr.reviews||[]).filter(r=>r?.user?.id&&r.commit_id===head).sort((a,b)=>String(a.submitted_at||'').localeCompare(String(b.submitted_at||'')));
 const latest=new Map();for(const review of reviews)latest.set(String(review.user.id),review);
 const approved=[...latest.values()].some(r=>r.state==='APPROVED'&&String(r.user.id)!==String(pr.user?.id));
 if(!approved)return {ok:false,reason:'No independent approval for the current PR head commit.'};
 if(pr.state==='closed'&&!pr.merged_at)return {ok:false,reason:'Pull request was closed without merging.'};
 return {ok:true,reason:'Independently approved for the current commit.'};
}
function evaluate({key,issue,accountId,projectKey,repo,files=[],checks,artifacts=[],requiredTypes,pr,stackApproved=false,accepted=false}={}){
 key=safeKey(key);const selected=categories(requiredTypes);
 const gates=[];const add=(id,ok,detail)=>gates.push({id,ok:!!ok,detail:String(detail||'')});
 const status=String(issue?.fields?.status?.statusCategory?.key||'').toLowerCase();
 add('assignment',!!accountId&&issue?.fields?.assignee?.accountId===accountId&&issue?.fields?.project?.key===projectKey,'Jira issue belongs to this project and is assigned to you');
 add('stack',stackApproved,'Solution Architect has approved the selected stack');
 add('branch',!!repo?.sha&&repo.clean===true&&branchFor(key,repo.branch),'Clean committed feature branch linked to this Jira key');
 add('source',files.length>0&&files.length<=250,`${files.length} committed changed file(s) compared with the integration branch`);
 for(const type of selected){
  const item=artifacts.find(row=>row.type===type);
  add('artifact:'+type,!!item?.exists&&!!item?.content?.trim()&&item.content.trim().length>=50,`${TYPES[type]} artifact saved (draft does not imply approval)`);
 }
 const sameCommit=!!checks&&checks.head===repo?.sha&&checks.branch===repo?.branch&&checks.root===repo?.root;
 const operations=new Set((checks?.results||[]).filter(r=>r.passed===true&&r.head===repo?.sha).map(r=>r.target+'|'+r.operation));
 const targets=Array.isArray(checks?.targets)?checks.targets:[];
 add('tests',sameCommit&&targets.length>0&&targets.every(t=>operations.has(t+'|test')),'Passing tests recorded for every application target at this exact commit');
 add('build',sameCommit&&targets.length>0&&targets.every(t=>operations.has(t+'|build')),'Passing builds recorded for every application target at this exact commit');
 const review=verifyPullRequest(pr,repo?.sha,repo?.branch);
 add('review',review.ok,review.reason);
 add('acceptance',accepted===true,'Developer has confirmed acceptance criteria against Jira and reviewed evidence');
 add('jira-status',status!=='done','Jira ticket is not already in the Done category');
 return {key,ready:gates.every(g=>g.ok),gates,requiredTypes:selected,revision:digest({key,jiraUpdated:issue?.fields?.updated,repo:{sha:repo?.sha,branch:repo?.branch,root:repo?.root},checks,requiredTypes:selected,artifacts:artifacts.map(a=>[a.type,a.revision]),pr:pr&&{number:pr.number,sha:pr.head?.sha,reviews:pr.reviews},accepted})};
}
function reportMarkdown({key,issue,repo,files,checks,artifacts,requiredTypes,pr,brLinks=[],actor,confluenceUrl='',jiraUrl='',at=new Date().toISOString()}={}){
 key=safeKey(key);
 const title=String(issue?.fields?.summary||'').replace(/[\r\n]/g,' ').slice(0,250);
 const lines=[`# Ticket Completion Report — ${key}`,'',`- Generated: ${at}`,`- Jira: ${jiraUrl||key}`,`- Summary: ${title}`,`- Status when reviewed: ${issue?.fields?.status?.name||'Unknown'}`,`- Delivery actor: ${String(actor||'').replace(/[\r\n]/g,' ')}`,`- Git branch: ${repo.branch}`,`- Commit: ${repo.sha}`,`- PR: ${pr.html_url||''} (#${pr.number})`,`- PR reviewer approval: independently verified for ${repo.sha}`,`- Confluence: ${confluenceUrl||'Not yet published'}`,'', '## Business Requirement traceability',...(brLinks.length?brLinks.map(x=>'- '+x):['- No BR association found in the local approved requirement register; link manually before closing.']),'','## Committed source changes',...files.map(f=>'- `'+f.replaceAll('`','')+'`'),'','## Applicable task artifacts',...requiredTypes.map(type=>{const a=artifacts.find(x=>x.type===type);return '- '+TYPES[type]+': '+(a?.path||'Missing');}),'','## Test and build evidence',`- Verified head: ${checks.head}`,`- Verified at: ${checks.at}`,...checks.results.map(r=>`- ${r.target||'.'} ${r.operation}: ${r.passed?'PASS':'FAIL'} (${r.at}; output digest ${r.logDigest||'n/a'})`),'','## Completion statement','The assigned developer confirmed acceptance criteria and ATGV verified commit-bound tests, builds, applicable artifact records, and an independent PR approval. These checks do not attest to deployment or production acceptance.',''];
 return lines.join('\n');
}
module.exports={IMPLEMENTATION,categories,digest,branchFor,verifyPullRequest,evaluate,reportMarkdown,readJson,saveJson,writeReport};
