'use strict';
// ATGV v0.4.42: shared durable workflow metadata for BA, SA, UX, Dev, PM,
// integrations, setup and workspace. Never persist source bodies or credentials.
// SQLite is preferred (Node 22.13+); atomic, permission-restricted JSON is
// supported on older VS Code extension hosts.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {setTimeout:sleep}=require('node:timers/promises');
const SAFE_PROJECT=/^[a-z][a-z0-9-]{0,48}$/;
const SAFE_COMMAND=/^[a-zA-Z][a-zA-Z0-9]{0,90}$/;
const STATES=new Set(['running','completed','failed','interrupted','reconcile-required','cancelled']);
const KINDS=new Set(['ai','read','write','local','install','external']);
const MAX_JOBS=120, MAX_FILE=1024*1024;
function fingerprint(value){return crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value??null)).digest('hex');}
function safeError(error){
 let m=String(error?.message||error||'Unknown error').replace(/[\r\n\t]/g,' ');
 m=m.replace(/(?:Bearer\s+|Basic\s+|ghp_|github_pat_|sk-)[A-Za-z0-9_.\-+/=]{6,}/gi,'[REDACTED]');
 m=m.replace(/https?:\/\/[^\s/]+:[^@\s]+@/gi,'[REDACTED]@');
 m=m.replace(/([?&](?:token|key|password|secret|access_token)=)[^&\s]+/gi,'$1[REDACTED]');
 return m.slice(0,200);
}
function category(command){
 if(!SAFE_COMMAND.test(String(command||'')))throw Error('Invalid workflow command.');
 // Read-only checks can be retried; mutating API requests, Git actions, and
 // installation/development processes require a fresh state inspection.
 const role=/^(?:processDiscoverySources|generateBusinessRequirements|generateDrafts|applyDiscoveryReview|brJira|brRoleTask)/.test(command)?'BA':
  /^architect/.test(command)?'Solution Architect':
  /^(?:ux|design)/.test(command)?'UI/UX Designer':
  /^(?:developer|devCopilot)/.test(command)?'Developer':
  /^pm/.test(command)?'Project Manager':
  /^workspace/.test(command)?'Workspace':
  /^(?:catalog|startup|checkSoftware)/.test(command)?'Setup':
  /^(?:sync|refreshConnected)/.test(command)?'Workspace':'ATGV';
 if(/^(?:brJiraSync|brJiraApprove|brRoleTaskRepairPublish|architectPublish|architectCommit|architectApproveStack|architectResetStack|pmJiraSetAssignee|pmJiraTransition|pmApproveEffortBaseline|workspacePublishSync|uxPublishFrontend|uxPipelineDecide|designApprove|syncDocuments|sync|aiServiceProposalDecision)$/.test(command))
  return {role,kind:'write',retryable:false};
 if(/^(?:catalogPull|startupInstallModule|architectBootstrap|architectCustomRun|architectSaveStack|architectRunServer|developerBrRun|developerBrStartServer|architectTestStack|aiServiceInstall|architectPullStackUpdates|uxFrameworkSync)$/.test(command))
  return {role,kind:'install',retryable:false};
 if(/^(?:workspacePrepareSync|brJiraPreview|brJiraScanExternal|brJiraRefreshWorkStates|pmJiraAssignableUsers|architectCheckStackUpdates|architectCustomScan|catalogCheck|catalogTest|refreshConnectedSources|checkSoftwareUpdates|aiServiceRefresh)$/.test(command))
  return {role,kind:'read',retryable:true};
 if(/^(?:processDiscoverySources|generateBusinessRequirements|generateDrafts|applyDiscoveryReview|devCopilotStart|developerBrPreviewDraft|designGenerate|designRegenerateAffected|uxPipelineGenerate|uxDesignGenerate|aiServiceRun|architectRecommend|architectValidate)$/.test(command))
  return {role,kind:'ai',retryable:true};
 return {role,kind:'local',retryable:false};
}
async function secureFolder(root){
 const resolved=path.resolve(root);
 const lineage=[];let at=resolved;while(at!==path.dirname(at)){lineage.push(at);at=path.dirname(at);}
 for(const part of lineage.reverse()){
  const st=await fs.lstat(part).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(st&&(!st.isDirectory()||st.isSymbolicLink()))throw Error('Unsafe workflow journal directory.');
 }
 await fs.mkdir(resolved,{recursive:true,mode:0o700});
 const st=await fs.lstat(resolved);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe workflow journal directory.');
}
async function safeFile(file){
 const stat=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(stat&&(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE))throw Error('Unsafe workflow journal file.');
}
class DurableWorkflowEngine{
 constructor({root,now=()=>new Date().toISOString(),preferSqlite=true}={}){
  if(!root||typeof root!=='string')throw Error('Workflow journal needs a storage root.');
  this.root=path.resolve(root);this.now=now;this.preferSqlite=preferSqlite;
  this.db=null;this.mode='uninitialized';this.pending=Promise.resolve();this.initialized=null;
  this.controllers=new Map();
 }
 async init(){
  if(!this.initialized)this.initialized=this.setup().catch(e=>{this.initialized=null;throw e;});
  await this.initialized;return this;
 }
 async setup(){
  await secureFolder(this.root);
  if(this.preferSqlite){
   let DatabaseSync=null;
   try{DatabaseSync=require('node:sqlite').DatabaseSync;}catch{}
   if(DatabaseSync){
    const file=path.join(this.root,'atgv-workflow-jobs.sqlite');
    await safeFile(file);
    let db;
    try{
     db=new DatabaseSync(file);
     db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000;');
     db.exec('CREATE TABLE IF NOT EXISTS workflow_jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, updated_at TEXT NOT NULL, metadata TEXT NOT NULL); CREATE INDEX IF NOT EXISTS workflow_jobs_project ON workflow_jobs(project_id,updated_at);');
     await fs.chmod(file,0o600).catch(()=>{});
     this.db=db;this.mode='sqlite';return;
    }catch(error){try{db?.close();}catch{}throw Error('Unable to initialise SQLite workflow journal: '+safeError(error));}
   }
  }
  this.mode='atomic-json';
 }
 validate(projectId){
  if(!SAFE_PROJECT.test(String(projectId||'')))throw Error('Invalid workflow project ID.');
  return projectId;
 }
 async readUnsafe(projectId){
  this.validate(projectId);
  if(this.db){
   return this.db.prepare('SELECT metadata FROM workflow_jobs WHERE project_id=? ORDER BY updated_at DESC LIMIT ?').all(projectId,MAX_JOBS).map(row=>JSON.parse(row.metadata));
  }
  const file=path.join(this.root,'atgv-workflows-'+projectId+'.json');
  await safeFile(file);
  const raw=await fs.readFile(file,'utf8').catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(raw===null)return [];
  const json=JSON.parse(raw);
  if(json.schema!==1||!Array.isArray(json.jobs)||json.jobs.length>MAX_JOBS)throw Error('Workflow journal schema mismatch.');
  return json.jobs;
 }
 async writeUnsafe(projectId,jobs){
  if(this.db){
   const put=this.db.prepare('INSERT INTO workflow_jobs (id,project_id,updated_at,metadata) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,updated_at=excluded.updated_at,metadata=excluded.metadata');
   this.db.exec('BEGIN IMMEDIATE');
   try{
    for(const job of jobs)put.run(job.id,projectId,job.updatedAt,JSON.stringify(job));
    const overflow=this.db.prepare('SELECT id FROM workflow_jobs WHERE project_id=? ORDER BY updated_at DESC LIMIT -1 OFFSET ?').all(projectId,MAX_JOBS);
    const del=this.db.prepare('DELETE FROM workflow_jobs WHERE id=? AND project_id=?');
    for(const row of overflow)del.run(row.id,projectId);
    this.db.exec('COMMIT');
   }catch(error){this.db.exec('ROLLBACK');throw error;}
   return;
  }
  const file=path.join(this.root,'atgv-workflows-'+projectId+'.json');
  await safeFile(file);
  const payload=JSON.stringify({schema:1,jobs:jobs.slice(0,MAX_JOBS)},null,2)+'\n';
  if(Buffer.byteLength(payload)>MAX_FILE)throw Error('Workflow metadata exceeds local journal safety limit.');
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{await fs.writeFile(temp,payload,{flag:'wx',mode:0o600});await fs.rename(temp,file);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 // Serialize in-process mutations. SQLite serializes persistence across
 // windows; existing jobs from another window must not be replayed blindly.
 transaction(projectId,change){
  const op=this.pending.catch(()=>{}).then(async()=>{
   await this.init();const jobs=await this.readUnsafe(projectId),result=await change(jobs);
   if(result?.changed)await this.writeUnsafe(projectId,jobs);
   return result?.value;
  });
  this.pending=op.catch(()=>{});return op;
 }
 async list(projectId,{recover=false}={}){
  return this.transaction(this.validate(projectId),jobs=>{
   let changed=false;
   if(recover)for(const job of jobs){
    if(job.status==='running'){
     job.status=job.kind==='write'||job.kind==='install'?'reconcile-required':'interrupted';
     job.updatedAt=this.now();job.error='Extension host restarted; inspect saved artifacts and remote state before retry.';
     changed=true;
    }
   }
   return {changed,value:jobs.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,40).map(job=>structuredClone(job))};
  });
 }
 async begin(projectId,{command,inputHash='',role='',kind='',retryable,metadata={}}={}){
  this.validate(projectId);const classification=category(command);
  const effectiveKind=kind||classification.kind,effectiveRole=role||classification.role;
  if(!KINDS.has(effectiveKind))throw Error('Invalid workflow job kind.');
  if(inputHash&&!/^[a-f0-9]{64}$/.test(inputHash))throw Error('Job input must be a digest, never raw document content.');
  // No untrusted text, tokens, file paths or user details are stored.
  const keys=Object.keys(metadata||{});
  if(keys.some(k=>!['brId','ticketKey','totalUnits','completedUnits','sourceDigest','phase'].includes(k)))throw Error('Unsupported workflow metadata.');
  const data={};
  for(const key of keys){
   const value=metadata[key];
   if(key==='totalUnits'||key==='completedUnits'){if(!Number.isSafeInteger(value)||value<0||value>10000)throw Error('Invalid progress count.');data[key]=value;}
   else if(key==='sourceDigest'){if(!/^[a-f0-9]{64}$/.test(String(value)))throw Error('Invalid source digest.');data[key]=value;}
   else{data[key]=String(value||'').replace(/[^a-zA-Z0-9:_-]/g,'').slice(0,90);}
  }
  const id=crypto.randomUUID(),now=this.now();
  const record={id,projectId,command,role:effectiveRole.slice(0,30),kind:effectiveKind,
   inputHash,status:'running',phase:data.phase||'started',retryable:retryable===undefined?classification.retryable:retryable===true,
   attempts:1,progress:0,steps:{},metadata:data,error:'',startedAt:now,updatedAt:now,completedAt:''};
  await this.transaction(projectId,jobs=>{jobs.unshift(record);return {changed:true,value:null};});
  return structuredClone(record);
 }
 async update(projectId,id,patch){
  return this.transaction(projectId,jobs=>{
   const job=jobs.find(j=>j.id===id);
   if(!job)throw Error('Unknown workflow job.');
   if(!STATES.has(patch.status||job.status))throw Error('Invalid workflow status.');
   if(patch.status&&job.status!=='running'&&!['interrupted','reconcile-required'].includes(job.status))
    throw Error('Cannot change terminal workflow status.');
   if(patch.phase!==undefined)job.phase=String(patch.phase).replace(/[^a-z0-9_-]/gi,'').slice(0,75);
   if(patch.progress!==undefined){if(!Number.isFinite(patch.progress)||patch.progress<0||patch.progress>100)throw Error('Invalid workflow progress.');job.progress=Math.round(patch.progress);}
   if(patch.error!==undefined)job.error=safeError(patch.error);
   if(patch.status){job.status=patch.status; if(patch.status==='completed')job.progress=100; if(patch.status!=='running')job.completedAt=this.now();}
   job.updatedAt=this.now();
   return {changed:true,value:structuredClone(job)};
  });
 }
 async checkpoint(projectId,id,{step,inputHash,outputHash='',percent}={}){
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,65}$/.test(String(step||'')))throw Error('Invalid workflow stage.');
  if(!/^[a-f0-9]{64}$/.test(String(inputHash||''))||(outputHash&&!/^[a-f0-9]{64}$/.test(outputHash)))throw Error('Only cryptographic hashes may enter workflow checkpoints.');
  return this.transaction(projectId,jobs=>{
   const job=jobs.find(j=>j.id===id);
   if(!job||job.status!=='running')throw Error('Workflow is not active.');
   job.steps[step]={inputHash,outputHash,completedAt:this.now()};
   job.phase=step;
   if(percent!==undefined)job.progress=Math.max(0,Math.min(99,Math.round(Number(percent)||0)));
   job.updatedAt=this.now();
   return {changed:true,value:structuredClone(job)};
  });
 }
 async finish(projectId,id,error=null){
  return this.update(projectId,id,{status:error?'failed':'completed',error:error||'',phase:error?'failed':'completed'});
 }
 async recover(projectId){
  return this.list(projectId,{recover:true});
 }
 async requestRetry(projectId,id,{inputHash}={}){
  return this.transaction(projectId,jobs=>{
   const job=jobs.find(j=>j.id===id);
   if(!job)throw Error('Unknown workflow job.');
   if(!['failed','interrupted','reconcile-required'].includes(job.status))throw Error('Job does not need recovery.');
   if(!job.retryable||job.kind==='write'||job.kind==='install')throw Error('Verify external state and initiate this action manually; automatic replay is unsafe.');
   if(inputHash&&inputHash!==job.inputHash)throw Error('Job input changed. Start a new operation instead of replaying.');
   // A retry authorization never replays stored webview messages or bypasses approvals.
   job.status='interrupted';job.phase='ready-to-resume';job.error='';job.updatedAt=this.now();
   return {changed:true,value:structuredClone(job)};
  });
 }
 async resume(projectId,id,{command,inputHash}={}){
  if(!/^[a-f0-9]{64}$/.test(String(inputHash||'')))throw Error('Resume requires the exact original input hash.');
  return this.transaction(projectId,jobs=>{
   const job=jobs.find(j=>j.id===id);
   if(!job)throw Error('Unknown workflow job.');
   if(job.command!==command||job.inputHash!==inputHash)throw Error('Source, project, model or command changed; start a new job.');
   if(!['failed','interrupted'].includes(job.status)||!job.retryable||!['ai','read'].includes(job.kind))
    throw Error('Resume not permitted; reconcile external state or start a new approved operation.');
   job.status='running';job.phase='resuming';job.attempts=Math.min(100,job.attempts+1);
   job.error='';job.completedAt='';job.updatedAt=this.now();
   return {changed:true,value:structuredClone(job)};
  });
 }
 async runStages(projectId,{command,inputHash,stages,signal,retry={},resumeJobId=null}={}){
  if(!Array.isArray(stages)||!stages.length||stages.length>40)throw Error('Invalid workflow stages.');
  const job=resumeJobId?
   await this.resume(projectId,resumeJobId,{command,inputHash}):
   await this.begin(projectId,{command,inputHash,kind:'ai',retryable:true});
  const result={jobId:job.id,results:[],restored:[]};
  try{
   const seen=new Set();
   for(const [index,stage] of stages.entries()){
    if(signal?.aborted)throw Object.assign(Error('Workflow cancelled.'),{name:'AbortError'});
    if(!stage||!/^[a-zA-Z][a-zA-Z0-9_-]{0,65}$/.test(stage.id)||typeof stage.execute!=='function'||!/^[a-f0-9]{64}$/.test(stage.inputHash)||seen.has(stage.id))
     throw Error('Invalid or duplicated stage declaration.');
    seen.add(stage.id);
    const completed=job.steps?.[stage.id];
    let value,restored=false;
    if(completed?.inputHash===stage.inputHash&&completed.outputHash&&typeof stage.restore==='function'){
     // Never trust a stored "done" flag by itself. Re-open the actual local
     // artifact and compare its digest before reusing work from another run.
     value=await stage.restore({jobId:job.id,step:stage.id,signal});
     if(fingerprint(value)!==completed.outputHash)
      throw Error('Saved stage artifact was changed or is incomplete; manual review required.');
     restored=true;
    }else{
     // Without an explicit restore and verification callback there is no
     // durable output to reuse, even though the previous step was marked done.
     value=await retryRecoverable(()=>stage.execute({signal,jobId:job.id}),{signal,...retry,kind:stage.kind||'ai'});
     await this.checkpoint(projectId,job.id,{step:stage.id,inputHash:stage.inputHash,outputHash:fingerprint(value),percent:Math.round((index+1)/stages.length*99)});
    }
    result.results.push(value);
    if(restored)result.restored.push(stage.id);
   }
   await this.finish(projectId,job.id);
   return result;
  }catch(e){
   await this.update(projectId,job.id,{status:e.name==='AbortError'?'cancelled':'failed',error:e,phase:'failed'});
   throw e;
  }
 }
 close(){try{this.db?.close();}finally{this.db=null;}}
}
function transient(error){
 const code=String(error?.code||''),status=Number(error?.status||error?.statusCode)||0,message=String(error?.message||'');
 return ['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ATGV_SOURCE_AI_TIMEOUT'].includes(code)||[408,429,500,502,503,504].includes(status)||/timeout|rate limit|temporarily unavailable/i.test(message);
}
async function retryRecoverable(operation,{kind='read',maxAttempts=3,baseDelayMs=400,signal,onRetry}={}){
 if(typeof operation!=='function')throw Error('Retry operation must be callable.');
 if(!['read','ai'].includes(kind))throw Error('Remote writes, installs and mutations cannot be automatically retried.');
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw Error('Invalid retry budget.');
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  if(signal?.aborted)throw Object.assign(Error('Operation cancelled.'),{name:'AbortError'});
  try{return await operation({attempt,signal});}
  catch(error){
   if(signal?.aborted||!transient(error)||attempt===maxAttempts)throw error;
   const wait=Math.min(12000,Math.max(0,Number(error?.retryAfterMs)||baseDelayMs*Math.pow(2,attempt-1)))+Math.floor(Math.random()*100);
   onRetry?.({attempt,waitMs:wait,reason:safeError(error)});
   await sleep(wait,undefined,{signal});
  }
 }
}
module.exports={DurableWorkflowEngine,retryRecoverable,fingerprint,safeError,category,transient};
