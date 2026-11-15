'use strict';
// Persistent host-only diagnostic ledger for prerequisite installation,
// environment detection and existing project opening. No shell is executed.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const MAX_BYTES=256*1024;
const FILE='atgv-startup-unified-diagnostics.log';
let appendChain=Promise.resolve();
function safe(value){
 return String(value??'')
  .replace(/(authorization|token|password|secret|apikey|api[_ -]?key)(\s*[:=]\s*)([^\s;,&]+)/gi,'$1$2[REDACTED]')
  .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi,'$1[REDACTED]@')
  .slice(0,12000);
}
function normalize(entry={}){
 const allowed=['stage','tool','status','command','detail','output','exitCode','signal','detectedVersion','detectionSource','projectId'];
 const result={time:new Date().toISOString(),extensionVersion:require('../../package.json').version,platform:process.platform};
 for(const key of allowed)if(entry[key]!==undefined&&entry[key]!==null)
  result[key]=typeof entry[key]==='number'?entry[key]:safe(entry[key]);
 return result;
}
function filename(base){if(!base||typeof base!=='string')throw Error('ATGV diagnostic storage directory unavailable.');return path.join(base,FILE);}
async function write(base,event){
 const target=filename(base);
 await fs.mkdir(path.dirname(target),{recursive:true});
 const data=JSON.stringify(normalize(event))+'\n';
 await fs.appendFile(target,data,{mode:0o600});
 const stat=await fs.stat(target);
 if(stat.size>MAX_BYTES){
  const raw=await fs.readFile(target,'utf8');
  const lines=raw.split('\n').filter(Boolean);
  const kept=[];let bytes=0;
  for(let i=lines.length-1;i>=0;i--){const count=Buffer.byteLength(lines[i]+'\n');if(bytes+count>MAX_BYTES*0.75)break;bytes+=count;kept.unshift(lines[i]);}
  await fs.writeFile(target,kept.join('\n')+'\n',{mode:0o600});
 }
 return target;
}
function append(base,event){
 const pending=appendChain.catch(()=>{}).then(()=>write(base,event));
 appendChain=pending;
 return pending;
}
async function report(base){
 let lines;
 try{lines=(await fs.readFile(filename(base),'utf8')).trim().split('\n').filter(Boolean).map(line=>{
  try{return JSON.parse(line);}catch{return {stage:'diagnostic',status:'corrupted',detail:'A diagnostic entry could not be parsed.'};}
 });}
 catch(e){if(e.code!=='ENOENT')throw e;lines=[];}
 const header=[
  'ATGV AIATECH Assist — Unified Startup, Prerequisite and Project Opening Diagnostics',
  'Exported: '+new Date().toISOString(),
  'Platform: '+process.platform+' / '+os.release(),
  'Includes successful, cancelled and failed install attempts, post-install detection and project opening.',
  'Secrets are not collected. Review the report before sharing.',
  ''
 ];
 if(!lines.length)header.push('No startup diagnostic events recorded yet.');
 else for(let i=0;i<lines.length;i++){
  const event=lines[i];
  header.push('========== EVENT '+(i+1)+' / '+lines.length+' ==========');
  for(const [k,v] of Object.entries(event))header.push(k+': '+safe(v));
  header.push('');
 }
 return header.join('\n')+'\n';
}
module.exports={append,report,filename,safe,normalize};
