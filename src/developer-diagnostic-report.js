'use strict';
// Read-only, user-initiated troubleshooting report for a single approved BR.
// Never export application source, credential stores, raw environment variables
// or the full persisted record. Show route declarations and test evidence only.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const tdd=require('./developer-tdd');

const MAX_REPORT=650000;
function redact(value){
 let result=String(value??'');
 // Workstations and server paths can contain identifying usernames.
 result=result.replace(/([A-Za-z]:\\Users\\)[^\\\s]+/gi,'$1<user>')
  .replace(/(\/Users\/)[^\/\s]+/g,'$1<user>')
  .replace(/(\/home\/)[^\/\s]+/g,'$1<user>');
 // Remove URL userinfo and query strings with credentials.
 result=result.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1<redacted>@')
  .replace(/([?&](?:token|key|secret|password|api_key|client_secret|access_token|auth|signature)=)[^\s&#]+/gi,'$1<redacted>');
 result=result.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]{6,}={0,2}/gi,'$1 <redacted>')
  .replace(/\b(gh[opsu]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{15,}|sk-[A-Za-z0-9_-]{16,}|ATATT[A-Za-z0-9_-]{12,})\b/g,'<redacted-token>');
 result=result.replace(/((?:password|passwd|secret|client_secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie)\s*[:=]\s*)(['"]?)[^\s,;\r\n}"']+(?:[\s\S]*?\2(?=\s*[,}\r\n]))?/gi,(whole,prefix,quote)=>{
  // Prefer a single-line bounded substitution over logging any supplied value.
  return prefix+(quote||'')+'<redacted>'+(quote||'');
 });
 // Separate explicit quoted JSON credential fields, including spaces.
 result=result.replace(/("(?:password|secret|clientSecret|apiKey|accessToken|refreshToken|authorization|cookie)"\s*:\s*")[^"\r\n]*(")/gi,'$1<redacted>$2');
 return result;
}
function line(value,max=1200){return redact(String(value??'').slice(0,max));}
function body(value,max=9000){return redact(String(value??'').slice(-max));}
function cleanRelative(input){
 const value=String(input||'').replace(/\\/g,'/');
 if(!value||value.length>220||value.startsWith('/')||/^[A-Za-z]:/.test(value)||value.split('/').some(x=>!x||x==='.'||x==='..'))return '';
 return value;
}
async function safeRead(root,relative){
 if(!root||!cleanRelative(relative))return null;
 try{
  const base=await fs.realpath(root),full=path.join(base,relative);
  const stat=await fs.lstat(full);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>120000)return null;
  const resolved=await fs.realpath(full);
  if(!resolved.startsWith(base+path.sep))return null;
  return await fs.readFile(resolved,'utf8');
 }catch{return null;}
}
function evidenceRows(record,live){
 const previous=Array.isArray(record?.evidence)?record.evidence:[];
 const latest=Array.isArray(live?.evidence)?live.evidence:[];
 const combined=previous.length?previous:latest;
 return combined.slice(-55).map((row,i)=>[
  `#${i+1}  ${line(row.at,70)}  ${line(row.phase,45)}  ${line(row.operation,70)}  ${line(row.target,150)}  ${row.redVerified&&!row.passed?'EXPECTED RED':row.passed?'PASS':'FAIL'}`,
  row.exitCode!==undefined?`exit code: ${line(row.exitCode,30)}`:'',
  row.command?`command: ${line(row.command,240)}`:'',
  row.failureDetails?`failure: ${body(row.failureDetails,3500)}`:'',
  row.logs?`stdout/stderr excerpt (last 6000 chars):\n${body(row.logs,6000)}`:'No test output recorded.'
 ].filter(Boolean).join('\n')).join('\n\n');
}
function repairRows(record){
 return (Array.isArray(record?.repairHistory)?record.repairHistory:[]).slice(-100).map((row,i)=>
  `${i+1}. ${line(row.at,90)} ${line(row.criterion,30)} ${line(row.phase,30)} ${line(row.outcome,35)} ${line(row.category,90)} attempt=${line(row.attempt,20)} model=${line(row.model,130)}\n${body(row.message,2500)}`
 ).join('\n\n');
}
async function contractRows(record,worktree){
 const active=(record?.criteria||[]).find(x=>x.id===record?.lastFailedCriterion)||(record?.criteria||[]).find(x=>x.status==='needs-attention')||(record?.criteria||[]).at(-1);
 const testNames=[...new Set([...(active?.testFiles||[]),...(record?.testFiles||[])].map(x=>typeof x==='string'?x:x?.relative||x?.path).map(cleanRelative).filter(Boolean))].slice(0,28);
 const testSources=[];
 for(const name of testNames){const source=await safeRead(worktree,name);if(source!==null)testSources.push({path:name,content:source});}
 const sources=[];
 const names=[...new Set([...Object.keys(record?.checkpoint?.files||{}),...(record?.codeFiles||[]),...(record?.files||[])].map(x=>typeof x==='string'?x:x?.relative||x?.path).map(cleanRelative).filter(Boolean))];
 // Also locate stable application entry points omitted from the checkpoint.
 names.push('server/index.mjs','server/index.js','server/app.js','server/app.mjs','src/server.js','src/server.ts','src/index.js','src/index.ts','api/index.js','api/index.ts');
 for(const name of [...new Set(names)].slice(0,110)){
  if(tdd.isTestPath(name)||!/(^|\/)(server|src|api|backend|routes?)\/|^(index|app)\.[cm]?[jt]s$/.test(name))continue;
  const source=await safeRead(worktree,name);
  if(source!==null)sources.push({path:name,content:source.slice(0,55000)});
  if(sources.length>=32)break;
 }
 const contract=tdd.httpContractEvidence(testSources,{previews:sources},11000);
 return [
  `Locked criterion: ${line(active?.id||record?.lastFailedCriterion||'unknown',40)}`,
  `Locked test paths: ${testNames.length?testNames.join(', '):'(not recorded)'}`,
  `Readable locked tests: ${testSources.length}; readable application files: ${sources.length}`,
  contract.summary,
  'TESTED ROUTES:',
  ...contract.testRoutes.map(x=>`  ${x.method} ${x.url}  [${x.file}]`),
  'VISIBLE APPLICATION ROUTES:',
  ...contract.sourceRoutes.map(x=>`  ${x.method} ${x.url}  [${x.file}]`),
  'APPLICATION SOURCE FILES (names only):',
  ...sources.map(x=>`  ${x.path}`),
  'No source code, test bodies, or authentication data are included in this report.'
 ].join('\n');
}
function section(title,content){return `\n${'='.repeat(18)} ${title} ${'='.repeat(18)}\n${content||'(none recorded)'}\n`;}
async function createReport({record,live,projectId,brId,stackId='',serverLogs='',activity=[]}={}){
 if(!/^[\w-]{1,110}$/.test(String(projectId||''))||!/^BR-\d{1,6}$/.test(String(brId||'')))throw Error('Invalid diagnostic project or BR scope.');
 if(record&&(record.projectId!==projectId||record.brId!==brId))throw Error('Diagnostic record belongs to another project or BR.');
 if(live&&(live.projectId!==projectId||live.brId!==brId))live=null;
 const workspace=record?.worktree||live?.worktree||'';
 const criteria=(record?.criteria||[]).map((x,i)=>`${i+1}. ${line(x.id,50)} ${line(x.status,60)}  ${line(x.description,240)}  Jira=${line(x.jiraKey,30)}  Tests=${(x.testFiles||[]).map(n=>line(n,100)).join(', ')}`);
 const report=[
  'ATGV AIATECH Assist — Developer TDD Troubleshooting Report',
  'Captured: '+new Date().toISOString(),
  'Extension: '+require('../package.json').atgvDisplayVersion,
  'Generated on user request. No credentials, source contents or environment-variable values are intentionally exported.',
  section('SCOPE',[
   'Project: '+line(projectId,100),'Business Requirement: '+brId,'Stack: '+line(stackId,90),
   'Runtime: '+process.platform+'/'+process.arch+', Node '+process.version,
   'Record created: '+line(record?.createdAt,100),'Record last saved: '+line(record?.updatedAt,100),
   'Run ID: '+line(record?.runId,90),'Revision: '+line(record?.revision,100),
   'Status: '+line(record?.status||live?.status,80),'Phase: '+line(record?.phase||live?.status,60),
   'Last failed criterion: '+line(record?.lastFailedCriterion,60),
   'Retry count: '+line(record?.retryCount,20),'AI model: '+line(record?.model,120),
   'Branch: '+line(record?.branch||live?.branch,200),
   'Worktree: '+line(workspace,350)
  ].join('\n')),
  section('LAST ERROR',body(record?.lastError||live?.failureMessage||'',11000)),
  section('ACCEPTANCE CRITERIA',criteria.join('\n')),
  section('HTTP ROUTE / LOCKED TEST TRACE',await contractRows(record||{},workspace)),
  section('TEST DISCOVERY AND CHECKPOINT',[`Discovery: ${line(JSON.stringify(record?.testDiscovery||{}),5000)}`,`Checkpoint captured: ${line(record?.checkpoint?.at,90)}`,`Checkpoint paths and hashes: ${line(JSON.stringify(record?.checkpoint?.files||{}),8500)}`].join('\n')),
  section('TEST EXECUTION EVIDENCE',evidenceRows(record,live)),
  section('AI REPAIR HISTORY',repairRows(record)),
  section('AI MODEL HISTORY',line(JSON.stringify(record?.modelHistory||[]),4200)),
  section('RUN NOTES',(record?.notes||[]).slice(-55).map(x=>body(x,1200)).join('\n')), 
  section('CURRENT SERVER STDOUT / STDERR',body(serverLogs,18000)),
  section('CURRENT SESSION ACTIVITY',(Array.isArray(activity)?activity:[]).slice(-120).map(x=>line(x,1300)).join('\n')),
  section('TROUBLESHOOTING NOTES', '404 vs 201: verify locked POST URL, exact app/router mount, server factory export, request method, and middleware order. A declared route in source is not proof it was mounted on the tested server.\nAC-05 / overlength validation: test HTTP 400 with a direct API request. UI may reject invalid input locally; verify visible error without assuming a request was sent unless the BR explicitly requires it.\nAC-06 / persistence: inspect test fetch mock for direct recursion (mocked fetch calling fetch/globalThis.fetch); if sound, verify SQLite re-open across server restart, stable IDs, row ordering and asynchronous React hydration. URL stack overflow alone is not proof of a test defect.\nSource parse errors: inspect the failing file and line in the implementation worktree.\nRepeat failures: compare the last verified checkpoint with each quarantined candidate. Never edit locked RED tests to force a GREEN pass.')
 ];
 return redact(report.join('\n')).slice(0,MAX_REPORT)+'\n';
}
function filename(projectId,brId){
 const clean=x=>String(x||'').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,60);
 return `atgv-developer-tdd-${clean(projectId)}-${clean(brId)}-${new Date().toISOString().replace(/[:.]/g,'-')}.log`;
}
module.exports={createReport,redact,filename,cleanRelative,safeRead};
