'use strict';
/*
 * Jira-only BR deletion when local BR source state has been lost.
 * Eligibility: signed-in Atlassian account ID matches the Jira Epic's
 * Creator OR Reporter; Jira project Delete Issues and Browse permissions
 * are independently required. Creator/Reporter does not authorize
 * deletion outside the verified Epic parent/child hierarchy.
 *
 * This is an independent, journaled, explicit-confirmation path. Never
 * manufacture local BR evidence or delete Confluence attachments/pages.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {requestJson,baseAtlassian}=require('./clients');
const {validIssueKey,validProjectKey,remoteFingerprint}=require('./remote-actions');
const {childrenOfJira}=require('./remote-br-deletion');

const MAX_ISSUES=250,MAX_DEPTH=16,MAX_PLAN_AGE=10*60*1000;
const auth=(config,token)=>({token,basicEmail:String(config.get('jira.email')||'').trim()});
const clip=(value,n=350)=>String(value??'').slice(0,n);
const belongs=(p,id)=>p===id||p.startsWith(id+'/');
const now=()=>new Date().toISOString();
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isBrId=id=>/^BR-[0-9]{1,8}$/.test(String(id||''));
const jiraKeyMatch=(key,project)=>key.startsWith(project+'-');
function assertSelection({brId,epicKey,projectKey}){
 const id=String(brId||''),key=validIssueKey(epicKey),project=validProjectKey(projectKey);
 if(!isBrId(id)||!jiraKeyMatch(key,project))throw Error('The selected Jira-only BR has an invalid project, Epic, or BR identifier.');
 return {id,key,project};
}
function assertNotLocallyOwned(register,id,keys){
 if((register.brs||[]).some(row=>row.id===id))throw Error('This BR already exists locally. Use the approved Delete Everywhere workflow instead.');
 if((register.deletedRequirements||[]).some(row=>row.id===id))throw Error('The BR has existing local deletion history. Reconcile that history before deleting Jira records.');
 // A reset may preserve the selected orphan's Jira mapping but lose its BR
 // source row. Such mappings are eligible only when every mapped issue still
 // belongs to the exact reviewed Epic hierarchy. Never touch another BR's map.
 const eligible=new Set(keys);
 for(const [path,entry] of [...Object.entries(register.synced||{}),...Object.entries(register.roleTaskMappings||{})]){
  const mapped=entry?.key;
  if(!mapped)continue;
  if(belongs(path,id)){
   if(!eligible.has(mapped))
    throw Error('Historical Jira mapping '+mapped+' is outside the selected Epic hierarchy. Reconcile before deletion.');
  }else if(eligible.has(mapped)){
   throw Error('Jira '+mapped+' belongs to another local BR mapping. Use Delete Everywhere or reconcile first.');
  }
 }
 if((register.pending&&Object.keys(register.pending).some(p=>belongs(p,id)))||
    (register.roleTaskPending&&Object.keys(register.roleTaskPending).some(p=>belongs(p,id))))
  throw Error('This Business Requirement has pending Jira operations. Resolve them before deletion.');
}
async function getIdentity(config,token,request=requestJson){
 if(!token)throw Error('Jira token is required for deletion.');
 const project=validProjectKey(config.get('jira.projectKey')),site=baseAtlassian(config),a=auth(config,token);
 const [me,permissions]=await Promise.all([
  request(site+'/rest/api/3/myself',a),
  request(site+'/rest/api/3/mypermissions?projectKey='+encodeURIComponent(project)+'&permissions=BROWSE_PROJECTS%2CDELETE_ISSUES',a)
 ]);
 if(!me?.accountId||typeof me.accountId!=='string')throw Error('The signed-in Jira account could not be verified.');
 if(permissions?.permissions?.BROWSE_PROJECTS?.havePermission!==true||
    permissions?.permissions?.DELETE_ISSUES?.havePermission!==true)
  throw Error('Jira Browse Projects and Delete Issues permissions are required; being Creator or Reporter alone is not enough.');
 return {accountId:me.accountId,project,site};
}
async function readIssue(config,token,key,request=requestJson){
 const valid=validIssueKey(key);
 return request(baseAtlassian(config)+'/rest/api/3/issue/'+encodeURIComponent(valid)+
  '?fields=summary,description,labels,issuetype,parent,project,status,updated,creator,reporter',
  auth(config,token));
}
function assertEpic(issue,key,project,brId,accountId){
 const f=issue?.fields||{},type=String(f.issuetype?.name||'').toLowerCase();
 if(issue?.key!==key||f.project?.key!==project||!(type==='epic'||Number(f.issuetype?.hierarchyLevel)===1))
  throw Error('The selected Jira record is not the verified BR Epic in this project.');
 const title=String(f.summary||'');
 const match=/^\s*(BR-[0-9]{1,8})(?:\s*[:·.\-–—]\s*|\s+|$)/i.exec(title);
 if(!match||match[1].toUpperCase()!==brId)
  throw Error('Epic summary does not contain the selected BR identifier. Refusing to delete an unrelated Epic.');
 const creator=String(f.creator?.accountId||''),reporter=String(f.reporter?.accountId||'');
 if(!accountId||(creator!==accountId&&reporter!==accountId))
  throw Error('Only the matching BR Epic Creator or Reporter account may request deletion.');
 return {creatorId:creator,reporterId:reporter,match:creator===accountId?'Creator':'Reporter'};
}
function snapshotIssue(issue,parentKey,depth,project){
 const f=issue?.fields||{},key=validIssueKey(issue?.key);
 if(f.project?.key!==project)throw Error('Linked Jira '+key+' belongs to another project.');
 if(depth>0&&f.parent?.key!==parentKey)throw Error('Jira '+key+' has a different Epic/parent relationship. No deletion is allowed.');
 if(!f.updated)throw Error('Jira '+key+' does not provide an updated timestamp; a safe preview cannot be prepared.');
 return {key,issueId:String(issue.id||''),parentKey,depth,type:clip(f.issuetype?.name,70),
  summary:clip(f.summary,250),status:clip(f.status?.name,80),updated:String(f.updated),
  fingerprint:remoteFingerprint(issue)};
}
async function discover(config,token,epicKey,project,{request=requestJson,read=readIssue,maxIssues=MAX_ISSUES}={}){
 if(!Number.isSafeInteger(maxIssues)||maxIssues<1||maxIssues>MAX_ISSUES)throw Error('Invalid Jira deletion scope cap.');
 const queue=[{key:epicKey,parentKey:'',depth:0}],seen=new Set(),rows=[];
 while(queue.length){
  const node=queue.shift();
  if(seen.has(node.key))throw Error('Duplicate or cyclic Jira parent relationship detected. Deletion blocked.');
  seen.add(node.key);
  if(seen.size>maxIssues)throw Error('Jira BR hierarchy exceeds the 250-issue safety limit. No Jira items deleted.');
  if(node.depth>MAX_DEPTH)throw Error('Jira hierarchy is deeper than the verified safety limit.');
  const issue=await read(config,token,node.key,request);
  const row=snapshotIssue(issue,node.parentKey,node.depth,project);
  rows.push(row);
  const children=await childrenOfJira(config,token,node.key,request);
  for(const child of children){
   const key=validIssueKey(child);
   if(!jiraKeyMatch(key,project))throw Error('Jira Epic has cross-project child '+key+'; manual review required.');
   if(seen.has(key)||queue.some(x=>x.key===key))throw Error('Duplicated Jira child '+key+'; hierarchy requires manual reconciliation.');
   queue.push({key,parentKey:node.key,depth:node.depth+1});
   if(rows.length+queue.length>maxIssues)throw Error('Jira BR hierarchy exceeds 250 issues. Narrow the scope before deleting.');
  }
 }
 return rows.sort((a,b)=>b.depth-a.depth||a.key.localeCompare(b.key));
}
async function preflight({register,brId,epicKey,projectId,config,token,request=requestJson,read=readIssue}){
 const identity=await getIdentity(config,token,request);
 const {id,key,project}=assertSelection({brId,epicKey,projectKey:identity.project});
 assertNotLocallyOwned(register,id,[key]);
 const root=await read(config,token,key,request);
 const eligible=assertEpic(root,key,project,id,identity.accountId);
 const rows=await discover(config,token,key,project,{request,read});
 assertNotLocallyOwned(register,id,rows.map(r=>r.key));
 const plan={schema:1,kind:'creator-reporter-jira-only-br',projectId,brId:id,epicKey:key,
  projectKey:project,site:identity.site,actorId:identity.accountId,eligibility:eligible,
  registerRevision:register.revision,rows,createdAt:now()};
 plan.fingerprint=sha({projectId,id,key,actorId:identity.accountId,rows:rows.map(r=>[r.key,r.parentKey,r.issueId,r.fingerprint,r.updated])});
 return plan;
}
function preview(plan,job){
 if(!plan||plan.kind!=='creator-reporter-jira-only-br'||!Array.isArray(plan.rows))throw Error('Invalid deletion preview.');
 const pending=plan.rows.filter(row=>job?.results?.[row.key]?.status!=='deleted').length;
 const detail=[
  '# ATGV Jira-only Business Requirement deletion — irreversible',
  '',
  'Project: '+plan.projectKey,'Business Requirement: '+plan.brId,
  'Epic: '+plan.epicKey,'Verified matching Jira field: '+plan.eligibility.match,
  'Signed-in Atlassian Account ID: '+plan.actorId,
  'Jira issues: '+plan.rows.length+' (remaining: '+pending+')',
  'Original local BR documents and Confluence pages are NOT deleted in this operation.',
  'Epic descendants are ordered deepest-first. The full list below is authoritative.',
  '',
  '| Key | Type | Summary | Parent | Status |',
  '| --- | --- | --- | --- | --- |',
  ...plan.rows.map(row=>'| '+[row.key,row.type,row.summary,row.parentKey||'—',row.status].map(x=>String(x||'').replace(/\|/g,'/').replace(/[\r\n]/g,' ')).join(' | ')+' |')
 ].join('\n');
 const sample=plan.rows.slice(0,8).map(x=>x.key).join(', ');
 const summary=['DELETE JIRA-ONLY BR — PERMANENT AND IRREVERSIBLE',
  'BR: '+plan.brId+' · Epic: '+plan.epicKey,
  'Verified on Epic: '+plan.eligibility.match+' account ID matches your signed-in Jira account.',
  'Jira issues: '+plan.rows.length+' ('+pending+' remaining).',
  'First keys: '+sample+(plan.rows.length>8?' … +'+(plan.rows.length-8)+' more':''),
  'Every parent/child relationship is checked before deletion.',
  'No other Jira Epics, Confluence pages or original uploaded files are deleted.',
  'Review the full deletion list in the opened editor, then confirm and type the exact phrase.'].join('\n');
 return {detail,summary};
}
function file(registry,projectId){return path.join(path.dirname(registry.fileFor(projectId)),'documents','requirements','creator-reporter-jira-deletion-jobs.json');}
async function readJobs(registry,projectId){
 const target=file(registry,projectId);
 const stat=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return {schema:1,jobs:[]};
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe creator/reporter Jira deletion audit file.');
 const state=JSON.parse(await fs.readFile(target,'utf8'));
 if(state.schema!==1||!Array.isArray(state.jobs))throw Error('Invalid Jira-only deletion audit history.');
 return state;
}
async function saveJobs(registry,projectId,state){
 const target=file(registry,projectId),folder=path.dirname(target);
 await fs.mkdir(folder,{recursive:true});
 const dir=await fs.lstat(folder);
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Unsafe Jira-only deletion audit directory.');
 const tmp=target+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{await fs.writeFile(tmp,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(tmp,target);}
 finally{await fs.rm(tmp,{force:true});}
}
function createJob(plan){return {id:crypto.randomUUID(),kind:plan.kind,plan,status:'pending',results:{},createdAt:now(),lastError:'',finalized:false};}
function assertCurrentRow(plan,row,issue,deleted){
 const f=issue?.fields||{};
 if(issue?.key!==row.key||f.project?.key!==plan.projectKey||f.parent?.key!==(row.parentKey||undefined)&&!!row.parentKey)
  throw Error('Jira '+row.key+' changed project or parent after preview.');
 if(row.issueId&&String(issue.id||'')!==row.issueId)throw Error('Jira '+row.key+' identity changed.');
 if(remoteFingerprint(issue)!==row.fingerprint)throw Error('Jira '+row.key+' content changed after preview. Start again.');
 if(String(f.issuetype?.name||'')!==row.type||String(f.status?.name||'')!==row.status)
  throw Error('Jira '+row.key+' type/status changed after preview.');
 // Parent timestamps may be updated by Jira when a verified child is deleted.
 const hasDeletedChildren=plan.rows.some(other=>other.parentKey===row.key&&deleted.has(other.key));
 if(String(f.updated||'')!==row.updated&&!hasDeletedChildren)
  throw Error('Jira '+row.key+' has changed since the deletion preview.');
}
async function execute({registry,projectId,job,config,token,loadRegister,finalize,request=requestJson,read=readIssue,onProgress=async()=>{}}){
 const state=await readJobs(registry,projectId),saved=state.jobs.find(x=>x.id===job.id);
 if(!saved||saved.kind!=='creator-reporter-jira-only-br')throw Error('Deletion job was not found. Review the plan again.');
 if(saved.status==='completed')return saved;
 const plan=saved.plan;
 if(plan.projectId!==projectId)throw Error('Deletion project changed.');
 if(new Date(plan.createdAt).getTime()+MAX_PLAN_AGE<Date.now()&&Object.keys(saved.results||{}).length===0)
  throw Error('Jira deletion preview expired. Refresh before deleting.');
 const allowed=new Set(plan.rows.map(r=>r.key));
 if(!allowed.has(plan.epicKey)||allowed.size!==plan.rows.length)throw Error('Untrusted Jira deletion plan.');
 const persist=()=>saveJobs(registry,projectId,state);
 const verify=async()=>{
  const identity=await getIdentity(config,token,request);
  if(identity.accountId!==plan.actorId||identity.project!==plan.projectKey||identity.site!==plan.site)
   throw Error('Jira account or project changed since deletion approval.');
  const current=await loadRegister();
  if(current.revision!==plan.registerRevision)throw Error('Local BR register changed. Review the deletion again.');
  assertNotLocallyOwned(current,plan.brId,plan.rows.map(r=>r.key));
  const epic=await read(config,token,plan.epicKey,request).catch(e=>{
   if(saved.results[plan.epicKey]?.status==='deleted')return null;
   throw e;
  });
  if(epic)assertEpic(epic,plan.epicKey,plan.projectKey,plan.brId,identity.accountId);
  return identity;
 };
 try{
  // Re-scan the complete hierarchy immediately before the FIRST destructive
  // request. If an unseen Story/Task/Subtask appeared after preview, no
  // partial deletion is allowed to begin.
  if(!Object.values(saved.results||{}).some(x=>x.status==='deleted'||x.status==='attempting')){
   await verify();
   const currentRows=await discover(config,token,plan.epicKey,plan.projectKey,{request,read});
   const signature=rows=>JSON.stringify(rows.map(x=>[
    x.key,x.parentKey,x.issueId,x.type,x.status,x.updated,x.fingerprint
   ]));
   if(signature(currentRows)!==signature(plan.rows))
    throw Error('Jira Epic hierarchy changed after deletion preview. Review all issues again; nothing deleted.');
  }
  for(const row of plan.rows){
   if(saved.results[row.key]?.status==='deleted')continue;
   if(saved.results[row.key]?.status==='attempting')
    throw Error('Deletion of '+row.key+' may have been interrupted. Verify the Jira item manually; no automatic retry.');
   await verify();
   const issue=await read(config,token,row.key,request);
   const completed=new Set(Object.entries(saved.results).filter(([,x])=>x.status==='deleted').map(([key])=>key));
   assertCurrentRow(plan,row,issue,completed);
   const kids=await childrenOfJira(config,token,row.key,request);
   const unplanned=kids.filter(k=>!allowed.has(k));
   if(unplanned.length)throw Error('Jira '+row.key+' gained children outside the approved BR: '+unplanned.join(', '));
   const stillPending=kids.filter(k=>saved.results[k]?.status!=='deleted');
   if(stillPending.length)throw Error('Jira '+row.key+' still has child items; child-first deletion required: '+stillPending.join(', '));
   saved.results[row.key]={status:'attempting',at:now()};await persist();
   try{
    await request(plan.site+'/rest/api/3/issue/'+encodeURIComponent(row.key)+'?deleteSubtasks=false',
     {...auth(config,token),method:'DELETE'});
   }catch(error){
    if(/HTTP (400|401|403|404|409|412|429)\b/.test(String(error.message||error)))
     saved.results[row.key]={status:'failed',at:now(),reason:clip(error.message||error)};
    await persist();throw error;
   }
   saved.results[row.key]={status:'deleted',at:now()};await persist();
   await onProgress({key:row.key,deleted:Object.values(saved.results).filter(x=>x.status==='deleted').length,total:plan.rows.length});
  }
  // Do not re-fetch the deleted root here. We verified authorization and
  // every issue immediately before the corresponding permanent request.
  const register=await loadRegister();
  if(register.revision!==plan.registerRevision)throw Error('Local BR state changed; deletion completed but audit finalization needs review.');
  if(!saved.finalized){await finalize(plan);saved.finalized=true;}
  saved.status='completed';saved.completedAt=now();saved.lastError='';await persist();
  return saved;
 }catch(error){saved.status='partial';saved.lastError=clip(error.message||error,1000);await persist();throw error;}
}
module.exports={getIdentity,readIssue,assertEpic,assertSelection,assertNotLocallyOwned,discover,preflight,preview,
 readJobs,saveJobs,createJob,execute,assertCurrentRow};
