'use strict';
// Development-only AI maintenance: noon local time, only when ATGV is idle.
// Never auto-merges, and never puts .memory in distributable packages.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {withLock}=require('./file-lock');
const repoSync=require('./repo-sync-pr');
const github=require('./repo-sync-github-api');
const {normalizeReport}=require('./self-improvement');
const DAY_STATE='atgvAssist.maintenance.lastDay';
const DISABLED_STATE='atgvAssist.maintenance.readOnlyDisabled';
const NAME=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,135}\.(?:json|log|txt)$/;
function localSlot(date=new Date(),zone='system'){
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone==='system'?undefined:zone,year:'numeric',
  month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
 const p=Object.fromEntries(fmt.formatToParts(date).map(x=>[x.type,x.value]));
 return {day:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour),
  timeZone:zone==='system'?(Intl.DateTimeFormat().resolvedOptions().timeZone||'system'):zone};
}
const normalized=x=>String(x||'').toLowerCase().replace(/\s+/g,' ').trim().slice(0,3000);
function fingerprint(data){
 return crypto.createHash('sha256').update([data.target,normalized(data.title),normalized(data.observed)].join('|')).digest('hex');
}
function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex');}
async function secureDirectory(dir){
 const st=await fs.lstat(dir).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(st){if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe ATGV maintenance directory: '+path.basename(dir));return;}
 await fs.mkdir(dir,{mode:0o700,recursive:true});
}
async function ensureLayout(workspace){
 if(!path.isAbsolute(workspace))throw Error('ATGV workspace path must be absolute.');
 const root=path.join(workspace,'.atgv'),src=path.join(root,'src');
 for(const dir of [root,src,path.join(src,'extension'),path.join(src,'library'),path.join(root,'error-logs')])
  await secureDirectory(dir);
 return {root,source:src,extension:path.join(src,'extension'),library:path.join(src,'library'),logs:path.join(root,'error-logs')};
}
async function writeLog(workspace,report){
 const layout=await ensureLayout(workspace);
 const data=normalizeReport(report,'automatic'),id=fingerprint(data);
 const file=path.join(layout.logs,'atgv-'+id.slice(0,32)+'.json');
 const entry={schema:1,at:new Date().toISOString(),...data,fingerprint:id};
 try{await fs.writeFile(file,JSON.stringify(entry,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});}
 catch(e){if(e.code!=='EEXIST')throw e;}
 return file;
}
async function readLogs(folder){
 const names=(await fs.readdir(folder,{withFileTypes:true})).filter(x=>x.isFile()&&NAME.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name));
 const logs=[];
 for(const row of names.slice(0,100)){
  const file=path.join(folder,row.name),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20000)continue;
  let data;const content=await fs.readFile(file,'utf8');
  if(row.name.endsWith('.json')){try{data=JSON.parse(content);}catch{continue;}}
  else data={target:'extension',title:'Error log '+row.name,observed:content.slice(0,2500)};
  if(!data||typeof data!=='object'||Array.isArray(data))continue;
  let report;try{report=normalizeReport(data,'automatic');}catch{continue;}
  logs.push({...report,file,fingerprint:fingerprint(report)});
 }
 return logs;
}
const readOnlyStatus=x=>[401,403,404].includes(Number(x?.status));
async function probePat(repo,token,{request=github.githubRequest,random=()=>crypto.randomUUID()}={}){
 if(!token)return {ok:false,readOnly:false,reason:'GitHub PAT is not configured.'};
 const r=await request(repo,token,'GET','');
 if(r.status!==200)return {ok:false,readOnly:readOnlyStatus(r),reason:'GitHub repository read check failed (HTTP '+r.status+').'};
 if(String(r.body?.full_name||'').toLowerCase()!==repo.name.toLowerCase())throw Error('GitHub PAT returned an unexpected repository.');
 if(r.body.permissions?.push===false)return {ok:false,readOnly:true,reason:'GitHub reports read-only repository access.'};
 const branch=String(r.body.default_branch||'main');
 if(!/^[a-zA-Z0-9._/-]{1,100}$/.test(branch)||branch.includes('..')||branch.startsWith('/'))throw Error('Unexpected default branch.');
 const base=await request(repo,token,'GET','/git/ref/heads/'+branch);
 if(base.status!==200||!/^[a-f0-9]{40}$/.test(String(base.body?.object?.sha||'')))
  return {ok:false,readOnly:readOnlyStatus(base),reason:'Git reference read failed (HTTP '+base.status+').'};
 const nonce=String(random()).replace(/[^a-z0-9-]/ig,'').slice(0,50),probe='atgv-permission-check-'+nonce;
 const created=await request(repo,token,'POST','/git/refs',{ref:'refs/heads/'+probe,sha:base.body.object.sha});
 if(created.status!==201)return {ok:false,readOnly:readOnlyStatus(created),reason:'GitHub PAT cannot write a temporary branch (HTTP '+created.status+').'};
 const deleted=await request(repo,token,'DELETE','/git/refs/heads/'+probe);
 if(deleted.status!==204)throw Error('PAT check created a temporary branch but failed to remove refs/heads/'+probe+'. Investigate before retrying.');
 return {ok:true,readOnly:false,reason:'PAT read/write tested using a temporary branch; branch removed.'};
}
const sameTitle=(a,b)=>String(a||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()===String(b||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
async function findReported(repo,token,log,{request=github.githubRequest}={}){
 // The GitHub Issues endpoint includes pull requests. Fail closed on incomplete searches.
 for(let page=1;page<=5;page++){
  const r=await request(repo,token,'GET','/issues?state=all&per_page=100&page='+page);
  if(r.status!==200||!Array.isArray(r.body))throw Error('GitHub issue search unavailable; error logs preserved.');
  for(const x of r.body)if(x&&(String(x.body||'').includes('ATGV-ERR-'+log.fingerprint)||
    (sameTitle(x.title,log.title)&&normalized(log.observed).length>=8&&normalized(x.body).includes(normalized(log.observed).slice(0,200)))))
   return {number:x.number,url:x.html_url||''};
  if(r.body.length<100)return null;
 }
 throw Error('GitHub issue history exceeds the verified search limit; manual review required before code changes.');
}
async function syncSource(folder,repo,token,{run}={}){
 const listing=await fs.readdir(folder),env=repoSync.patEnvironment(token);
 if(!listing.length){
  await run('git',['clone','--quiet','--depth','1','--single-branch','--branch','main','--',repo.url,folder],{cwd:path.dirname(folder),env,timeout:180000});
 }else{
  if(!listing.includes('.git'))throw Error('Cannot overwrite non-Git .atgv source directory.');
  const origin=repoSync.githubUrl(await run('git',['remote','get-url','origin'],{cwd:folder}),{origin:true});
  if(origin.name.toLowerCase()!==repo.name.toLowerCase())throw Error('Source checkout GitHub origin mismatch.');
  if(await run('git',['status','--porcelain','--untracked-files=all'],{cwd:folder}))
   throw Error('Source checkout has local changes; refusing to replace user work.');
  if((await run('git',['branch','--show-current'],{cwd:folder}))!=='main')throw Error('Source checkout must be on main.');
  await run('git',['pull','--ff-only','origin','main'],{cwd:folder,env,timeout:180000});
 }
 const memory=await fs.lstat(path.join(folder,'.memory','manifest.json')).catch(()=>null);
 if(!memory?.isFile()||memory.isSymbolicLink())throw Error('Source .memory manifest is missing or unsafe; cannot code without development guidance.');
 return folder;
}
async function runWindow({workspace,manager,getRepository,getToken,isIdle,globalState,zone='system',
 now=()=>new Date(),request=github.githubRequest,progress=()=>{},maxLogs=10}={}){
 const slot=localSlot(now(),zone);
 if(slot.hour!==12)return {status:'outside-window',slot};
 if(!workspace||!manager||!globalState)return {status:'unavailable'};
 if(!await isIdle())return {status:'busy'};
 const layout=await ensureLayout(workspace);
 if(globalState.get(DAY_STATE,'')===slot.day)return {status:'already-checked'};
 return withLock(path.join(layout.root,'maintenance'),async()=>{
  if(!await isIdle())return {status:'busy'};
  const logs=await readLogs(layout.logs);
  if(!logs.length){await globalState.update(DAY_STATE,slot.day);return {status:'empty'};}
  let processed=0,duplicates=0,prs=0;
  for(const log of logs.slice(0,maxLogs)){
   if(localSlot(now(),zone).hour!==12)break;
   if(!await isIdle())return {status:'busy',processed,duplicates,prs};
   const url=await getRepository(log.target),token=await getToken(log.target);
   if(!url||!token)return {status:'credentials-unavailable',processed,duplicates,prs};
   const repo=repoSync.githubUrl(url),disabled=globalState.get(DISABLED_STATE,{});
   if(disabled[log.target]===tokenHash(token))return {status:'disabled-read-only',processed,duplicates,prs};
   const access=await probePat(repo,token,{request});
   if(!access.ok){
    if(access.readOnly){
     await globalState.update(DISABLED_STATE,{...disabled,[log.target]:tokenHash(token)});
     await progress('Auto improvement disabled: GitHub PAT read-only ('+log.target+').');
     return {status:'disabled-read-only',processed,duplicates,prs};
    }
    return {status:'permission-check-failed',reason:access.reason,processed,duplicates,prs};
   }
   const old=await findReported(repo,token,log,{request});
   if(old){await fs.unlink(log.file);duplicates++;processed++;await progress('Existing GitHub report found. Matching log deleted.');continue;}
   await syncSource(layout[log.target],repo,token,{run:manager.run});
   if(localSlot(now(),zone).hour!==12||!await isIdle())return {status:'window-ended-or-busy',processed,duplicates,prs};
   const issue=await manager.store.add(log,{origin:'automatic'});
   await manager.store.update(issue.id,{sourceFingerprint:log.fingerprint});
   await manager.prepare(issue.id,{url,token,onProgress:progress});
   if(localSlot(now(),zone).hour!==12||!await isIdle())return {status:'window-ended-or-busy',processed,duplicates,prs};
   await manager.test(issue.id,{onProgress:progress});
   if(localSlot(now(),zone).hour!==12||!await isIdle())return {status:'window-ended-or-busy',processed,duplicates,prs};
   await manager.publish(issue.id,{token,onProgress:progress});
   const archive=path.join(layout.logs,'processed');await secureDirectory(archive);
   await fs.rename(log.file,path.join(archive,path.basename(log.file)));
   processed++;prs++;await progress('Verified branch pushed and PR created; no automatic merge.');
  }
  if(processed===logs.length)await globalState.update(DAY_STATE,slot.day);
  return {status:'complete',processed,duplicates,prs,slot};
 });
}
module.exports={ensureLayout,writeLog,readLogs,localSlot,fingerprint,probePat,findReported,syncSource,runWindow,DAY_STATE,DISABLED_STATE};
