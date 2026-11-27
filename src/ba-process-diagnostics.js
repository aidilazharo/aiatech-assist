'use strict';
// Local persistent BA lifecycle metadata. Never store document text, Jira
// descriptions, account emails, bearer tokens, full API responses or passwords.
const fs=require('node:fs/promises');
const path=require('node:path');
const {safe}=require('./lib/startup-diagnostics');
const MAX_BYTES=1024*1024,MAX_LINE=1200;
const PROJECT=/^[a-z0-9][a-z0-9_-]{0,79}$/i;
let writes=Promise.resolve();
function fileFor(base,projectId){
 if(!base||typeof base!=='string'||!PROJECT.test(String(projectId||'')))throw Error('BA log requires a verified project identity.');
 return path.join(base,'ba-process-'+projectId+'.jsonl');
}
function trim(value,n=240){return safe(String(value??'')).replace(/[\r\n\t]+/g,' ').slice(0,n);}
function entry(value={}){
 const metadata={at:new Date().toISOString(),
  version:require('../package.json').version,
  stage:trim(value.stage||'workflow',65),
  action:trim(value.action||'status',100),
  status:trim(value.status||'info',40)};
 if(value.step)metadata.step=trim(value.step,75);
 if(value.key)metadata.key=trim(value.key,70);
 if(value.details)metadata.details=trim(value.details,420);
 if(Number.isFinite(value.durationMs))metadata.durationMs=Math.max(0,Math.round(value.durationMs));
 return metadata;
}
async function save(base,projectId,item){
 const file=fileFor(base,projectId);
 await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.appendFile(file,JSON.stringify(entry(item))+'\n',{mode:0o600});
 const st=await fs.stat(file);
 if(st.size>MAX_BYTES){
  const rows=(await fs.readFile(file,'utf8')).split('\n').filter(Boolean);
  const kept=[];let bytes=0;
  for(let i=rows.length-1;i>=0;i--){
   const len=Buffer.byteLength(rows[i]+'\n');
   if(bytes+len>MAX_BYTES*.75)break;
   bytes+=len;kept.unshift(rows[i]);
  }
  await fs.writeFile(file,kept.join('\n')+'\n',{mode:0o600});
 }
 await require('./project-artifacts').appendDiagnostic(base,projectId,'business-analyst',entry(item)).catch(()=>{});
}
function append(base,projectId,item){
 const job=writes.catch(()=>{}).then(()=>save(base,projectId,item));
 writes=job;return job;
}
async function read(base,projectId){
 let raw;
 try{raw=await fs.readFile(fileFor(base,projectId),'utf8');}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
 const entries=[];
 for(const line of raw.split('\n')){
  if(!line||line.length>MAX_LINE)continue;
  try{
   const row=JSON.parse(line);
   if(!row||typeof row!=='object')continue;
   entries.push({at:trim(row.at,40),stage:trim(row.stage,65),action:trim(row.action,100),
    status:trim(row.status,40),step:trim(row.step,75),key:trim(row.key,70),
    details:trim(row.details,420),durationMs:Number.isFinite(row.durationMs)?row.durationMs:null});
  }catch{/* Bad diagnostic line does not prevent remaining history from downloading. */}
 }
 return entries;
}
const SAFE_REGISTER_KEYS=['at','action','brId','status','key','path','epoch','roleId','count','phase'];
function registryEvents(register){
 return (register?.events||[]).slice(-200).map(item=>{
  const fields=SAFE_REGISTER_KEYS.filter(k=>item?.[k]!==undefined).map(k=>k+'='+trim(item[k],80)).join(' · ');
  return fields||'(event without metadata)';
 });
}
function exportText({projectId,events=[],register={},checkpoint=null,preparation=null}={}){
 if(!PROJECT.test(String(projectId||'')))throw Error('Invalid BA project for export.');
 const lines=['ATGV AIATECH ASSIST · BUSINESS REQUIREMENTS PROCESS TROUBLESHOOTING LOG',
  'Project: '+projectId,'Generated: '+new Date().toISOString(),
  'Logs contain bounded lifecycle metadata and errors. No source document text, credentials or raw API requests are included.',
  'Older diagnostic events may have rotated to keep storage bounded.',
  '',
  '1. CURRENT WORKFLOW SNAPSHOT',
  'Revision: '+trim(register?.revision||'Not saved',100),
  'Active document count: '+Number(register?.sourceDocuments?.length||0),
  'BR draft/approved/retired counts: '+['draft','approved','retired'].map(k=>k+'='+Number((register?.brs||[]).filter(x=>x.status===k).length)).join(' · '),
  'Jira linked issue count: '+Object.keys(register?.synced||{}).length,
  'Completed cycles: '+Number(register?.completedCycles?.length||0),
  'Completed index entries: '+Number(register?.completedIndex?.length||0),
  'Jira pending changes: '+(Number.isFinite(register?.jiraPendingChanges)?register.jiraPendingChanges:'Unknown'),
  'Automatic phase: '+trim(preparation?.phase||'Not recorded',50),
  'Automatic stage: '+trim(preparation?.stage||'Not recorded',50),
  'Jira preview conflicts: '+Number(preparation?.preview?.conflicts?.length||0),
  'Last preparation error: '+trim(preparation?.error||'None',420),
  'Discovery revision: '+(register?.discoveryRevision?'Recorded':'Not recorded'),
  'AI review revision: '+(register?.reviewRevision?'Recorded':'Not recorded'),
  'Mapping checkpoint: '+(checkpoint?'Available':'None'),
  'Preflight section count: '+Number(register?.mappingCompleted?.preflights?.length||0),
  '',
  '2. HOST PROCESS EVENTS (OLDEST TO NEWEST)'];
 if(!events.length)lines.push('No new-format process events recorded. Existing register history is included below.');
 for(const item of events){
  lines.push('['+trim(item.at,45)+'] '+trim(item.stage,70)+' · '+trim(item.action,100)+' · '+trim(item.status,40)+
   (item.step?' · step='+trim(item.step,75):'')+(item.key?' · key='+trim(item.key,70):'')+
   (item.durationMs!==null?' · '+item.durationMs+'ms':''));
  if(item.details)lines.push('  '+trim(item.details,420));
 }
 lines.push('','3. SAVED REQUIREMENTS REGISTER EVENT HISTORY');
 const history=registryEvents(register);
 if(!history.length)lines.push('No register events recorded.');
 else for(const item of history)lines.push('  '+item);
 lines.push('','4. DIAGNOSTIC NOTES',
  'Errors and timeouts should be compared with VS Code Output > ATGV.',
  'Source-only AI recovery is not a completed AI quality verification.',
  'Jira assignments/permissions remain governed by live Jira access controls.',
  '');
 return lines.join('\n');
}
module.exports={fileFor,entry,append,read,exportText,registryEvents};
