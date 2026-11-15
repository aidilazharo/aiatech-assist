'use strict';
// Error reports exist only in memory until a user explicitly chooses a location
// through VS Code's Save dialog. No project log file is generated or committed.
const entries=new Map();
const traces=new Map();
// Retain recent project-specific errors even after successful retries.
const history=new Map();
const HISTORY_LIMIT=24;
const COMBINED_LIMIT=1024*1024;
const LOG_LIMIT=512*1024;
const kinds={save:'Save Stack',install:'Install Dependencies',reset:'Reset Tech Stack',test:'Test & Run',server:'Run Server',approval:'Approve Stack',catalog:'Catalog Update'};
function redact(input){
 return String(input??'')
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]')
  .replace(/(https?:\/\/)[^\s/@]+@/gi,'$1[REDACTED]@')
  .replace(/\b(?:gh[pousr]_|github_pat_|ATATT[A-Za-z0-9_-]*|sk-[A-Za-z0-9_-]{12,})[A-Za-z0-9_-]{8,}\b/g,'[REDACTED TOKEN]')
  .replace(/\b(Authorization\s*:\s*(?:Bearer|Basic|token)\s+)\S+/gi,'$1[REDACTED]')
  .replace(/\b((?:Bearer|Basic)\s+)[A-Za-z0-9+/=._-]{12,}/gi,'$1[REDACTED]')
  .replace(/((?:_authToken|auth[_-]?token|api[_-]?key|access[_-]?token|refresh[_-]?token|github[_-]?token|password|secret|client[_-]?secret|ATGV_GITHUB_TOKEN)\s*[:=]\s*)[\"']?[^\s,\"'}]+/gi,'$1[REDACTED]')
  .replace(/([?&](?:token|api_key|access_token|password|key|client_secret)=)[^&#\s]+/gi,'$1[REDACTED]');
}
function kindKey(kind){if(!Object.hasOwn(kinds,kind))throw Error('Unknown stack diagnostic operation.');return kind;}
function begin(projectId,kind){const key=String(projectId)+'|'+kindKey(kind);entries.delete(key);traces.set(key,[]);}
function append(projectId,kind,record){const key=String(projectId)+'|'+kindKey(kind),trace=traces.get(key)||[];trace.push(redact(record));while(trace.length>50)trace.shift();traces.set(key,trace);}
function store({projectId,kind,stackId='',repository='',branch='',error='',details='',version='0.1.95'}={}){
 if(!projectId)throw Error('A project is required for stack diagnostics.');
 const key=String(projectId)+'|'+kindKey(kind);
 const completed=[...(traces.get(key)||[]),String(details||error?.diagnosticLogs||'No subprocess output was captured.')].filter(Boolean).join('\n\n');
 traces.delete(key);
 const body=[
  'ATGV AIATECH Assist — Technology Stack Error Log',
  'Captured: '+new Date().toISOString(),
  'Extension: '+version,
  'Project: '+String(projectId),
  'Operation: '+kinds[kind],
  'Technology stack: '+String(stackId||'unknown'),
  'Repository: '+String(repository||'unknown'),
  'Git branch: '+String(branch||'unknown'),
  '',
  '--- FAILURE ---',String(error?.message||error||'Unknown error'),
  '',
  '--- COMPLETE AVAILABLE PROCESS TRACE ---',completed,
  '',
  'Note: common credentials are redacted; inspect the log before sharing.',
  ''
 ].join('\n');
 const clean=redact(body);
 const content=clean.length>LOG_LIMIT?'[Earlier log output omitted; last 512 KiB retained]\n'+clean.slice(-LOG_LIMIT):clean;
 const report={content,createdAt:new Date().toISOString(),kind,projectId:String(projectId)};
 entries.set(key,report);
 if(entries.size>30)entries.delete(entries.keys().next().value);
 const projectKey=String(projectId),prior=history.get(projectKey)||[];
 history.delete(projectKey);
 history.set(projectKey,[...prior,report].slice(-HISTORY_LIMIT));
 while(history.size>30)history.delete(history.keys().next().value);
 return {available:true,kind,count:history.get(projectKey).length};
}
function count(projectId){return history.get(String(projectId))?.length||0;}
function combined(projectId){
 const items=history.get(String(projectId))||[];
 if(!items.length)return null;
 const header=[
  'ATGV AIATECH Assist — Unified Technology Stack Error Report',
  'Exported: '+new Date().toISOString(),
  'Project: '+String(projectId),
  'Recorded failures: '+items.length,
  'Scope: Save Stack, Reset, Dependencies, Test & Run, Server, Approval and Catalog',
  'Errors are chronological. This report retains recent in-session history.',
  ''
 ].join('\n');
 const sections=items.map((item,index)=>[
  '========== ERROR '+(index+1)+' / '+items.length+' · '+kinds[item.kind]+' · '+item.createdAt+' ==========',
  item.content
 ].join('\n')).join('\n\n');
 const full=header+'\n'+sections+'\n';
 const truncated=full.length>COMBINED_LIMIT;
 const content=truncated?header+'\n[Earlier diagnostic output omitted; latest 1 MiB retained]\n'+full.slice(-COMBINED_LIMIT):full;
 return {content:redact(content),createdAt:items[items.length-1].createdAt,kind:'all',projectId:String(projectId),count:items.length,truncated};
}
function get(projectId,kind){return kind==='all'?combined(projectId):entries.get(String(projectId)+'|'+kindKey(kind))||null;}
function clear(projectId,kind){const key=String(projectId)+'|'+kindKey(kind);entries.delete(key);traces.delete(key);}
function filename(projectId,kind){
 const safe=String(projectId||'project').toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,45)||'project';
 return 'atgv-'+safe+'-'+(kind==='all'?'unified':kindKey(kind))+'-errors-'+new Date().toISOString().replace(/[:.]/g,'-')+'.log';
}
module.exports={redact,store,get,count,clear,begin,append,filename};
