'use strict';
// ATGV real local full-stack session. Separate managed Vite and NestJS processes;
// real PostgreSQL readiness is checked, never replaced by synthetic HTTP health.
// No Git writes, remote requests, or credential creation occur here.
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {spawn, execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {setTimeout: delay} = require('node:timers/promises');
const {npmCommand} = require('./platform-process');
const execFileAsync = promisify(execFile);
const API_URL = 'http://127.0.0.1:3000/api/v1/health';
const WEB_URL = 'http://127.0.0.1:5173/';
let active = null;
let last = null;

function detectPair(inspection) {
 const targets = inspection?.targets || [];
 const frontend = targets.find(x => x.runnable && x.mockable === true && x.role === 'frontend');
 const backend = targets.find(x => x.runnable && x.role === 'backend' && x.framework === 'NestJS');
 return frontend && backend ? {frontend,backend} : null;
}
function isActive() {return !!active && active.services.every(x => x.child.exitCode === null && x.child.signalCode === null);}
function hasManagedSession() {return active !== null;}
async function hasEnvironment(root,backend,{fsApi=fs}={}) {
 if (!backend || !backend.relative || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+){0,2}$/.test(backend.relative)) return false;
 const file=path.join(root,backend.relative,'.env');
 const st=await fsApi.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
 return Boolean(st?.isFile() && !st.isSymbolicLink());
}
function modeForPair(pair,hasEnv,requested='auto') {
 if (!['auto','live','preview'].includes(requested)) throw Error('Invalid full-stack mode.');
 if (requested === 'live' && !pair) throw Error('Live mode requires detected Vite frontend and NestJS backend.');
 if (requested === 'live' && !hasEnv) throw Error('Live backend requires NestJS_Backend/.env with approved PostgreSQL and session configuration.');
 return pair && (requested === 'live' || requested === 'auto' && hasEnv) ? 'live' : 'preview';
}
function assertRealHealth(response,body) {
 if (!response?.ok || response.status !== 200) throw Error('Real NestJS health endpoint is not HTTP 200.');
 if (response.headers?.get('x-atgv-mock-data') === 'true' || response.headers?.get('x-atgv-mock-preview') === 'true')
  throw Error('A synthetic API responded at port 3000. Stop it; this is not the real NestJS backend.');
 if (body?.status !== 'ok' || body?.database !== 'up') throw Error('NestJS is responding but real PostgreSQL health is not verified.');
}
function redact(s) {
 return String(s).replace(/((?:PASSWORD|TOKEN|SECRET|API_KEY)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]')
  .replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@\s]+@/gi,'$1[REDACTED]@');
}
function log() {const item=active||last;return item ? {
 running:isActive(),cwd:item.frontendCwd,relative:item.frontend.relative,previewUrl:WEB_URL,apiUrl:API_URL,
 mockPreview:false,mode:'live',head:item.sha,command:'NestJS start:dev + Vite dev',
 pid:item.services.find(x => x.name === 'frontend')?.child.pid ?? null,
 processes:item.services.map(x => ({name:x.name,pid:x.child.pid,running:x.child.exitCode===null&&x.child.signalCode===null,exitCode:x.child.exitCode})),
 logs:item.services.map(x => '['+x.name+']\n'+x.logs).join('\n').slice(-256*1024),
 }: {running:false,pid:null,logs:''}; }
async function portFree(port) {
 return new Promise(resolve => {
  const server=net.createServer();server.once('error',()=>resolve(false));
  server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close(()=>resolve(true)));
 });
}
function track(name,child,cwd) {
 const entry={name,child,cwd,logs:'',exitCode:null};
 const record=(source,data)=>{entry.logs=(entry.logs+'['+source+'] '+redact(data)).slice(-128*1024);};
 child.stdout?.on('data',data=>record('stdout',data));
 child.stderr?.on('data',data=>record('stderr',data));
 child.on('error',e=>record('error',e.message));
 child.on('exit',(code,signal)=>{entry.exitCode=code;record('exit',`code=${code} signal=${signal}`);});
 return entry;
}
async function terminate(entry,{exec=execFileAsync}={}) {
 if (!entry || entry.child.exitCode !== null || entry.child.signalCode !== null) return;
 if(process.platform==='win32') {
  try{await exec('taskkill',['/T','/F','/PID',String(entry.child.pid)],{windowsHide:true,timeout:12000});}
  catch{entry.child.kill();}
 }else{
  try{process.kill(-entry.child.pid,'SIGTERM');}catch{entry.child.kill('SIGTERM');}
 }
 await Promise.race([new Promise(resolve=>entry.child.once('exit',resolve)),delay(2500)]);
 if(entry.child.exitCode===null&&entry.child.signalCode===null) {
  if(process.platform!=='win32')try{process.kill(-entry.child.pid,'SIGKILL');}catch{entry.child.kill('SIGKILL');}
  else entry.child.kill();
 }
}
async function stop() {
 if(!active)return {stopped:false};
 const previous=active;
 await Promise.allSettled([...previous.services].reverse().map(x=>terminate(x)));
 active=null;
 return {stopped:true,logs:log().logs};
}
async function awaitHealthy(url,check,{session,fetchImpl=fetch,timeoutMs=60000}={}) {
 const deadline=Date.now()+timeoutMs;
 let lastError='endpoint not ready';
 while(Date.now()<deadline){
  if(session.services.some(s=>s.child.exitCode!==null || s.child.signalCode!==null))
   throw Error('One full-stack process exited unexpectedly. '+log().logs.slice(-2500));
  try {
   const res=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(1800)});
   if(res.status>=300 && res.status<400)throw Error('Unexpected redirect');
   const result=await check(res);
   if(result)return;
  }catch(e){lastError=e.message;}
  await delay(400);
 }
 throw Error('Local application readiness timed out at '+url+': '+lastError+'\n'+log().logs.slice(-2500));
}
async function run(root,{inspection,pair=detectPair(inspection),driver,onProgress=async()=>{},
 spawnImpl=spawn,fetchImpl=fetch,checkPort=portFree}={}) {
 if(active)throw Error('An ATGV full-stack session is already managed. Stop it first.');
 if(!pair)throw Error('No runnable Vite + NestJS application pair found.');
 if(driver?.localLogs()?.running)throw Error('Another ATGV-managed process is running. Stop it first.');
 if(!(await hasEnvironment(root,pair.backend)))throw Error('Backend .env not configured; cannot claim a real backend is running.');
 if(!(await checkPort(3000)) || !(await checkPort(5173)))
  throw Error('Port 3000 or 5173 is already occupied. Stop the existing service before starting this stack.');
 const backendCwd=path.resolve(root,pair.backend.relative),frontendCwd=path.resolve(root,pair.frontend.relative);
 const instance={services:[],frontendCwd,frontend:pair.frontend,backend:pair.backend,sha:inspection?.sha||''};
 active=last=instance;
 try{
  const launch=async(name,cwd,args)=>{
   const cmd=npmCommand(args);
   const child=spawnImpl(cmd.bin,cmd.args,{cwd,env:{...process.env},windowsHide:true,
    stdio:['ignore','pipe','pipe'],shell:false,detached:process.platform!=='win32'});
   const entry=track(name,child,cwd);instance.services.push(entry);
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  };
  await onProgress('Starting real NestJS backend; awaiting PostgreSQL readiness…');
  await launch('backend',backendCwd,['run','start:dev']);
  await awaitHealthy(API_URL,async res=>{const body=await res.json().catch(()=>null);assertRealHealth(res,body);return true;},
   {session:instance,fetchImpl});
  await onProgress('Real backend and PostgreSQL verified. Starting React/Vite frontend…');
  await launch('frontend',frontendCwd,['run','dev','--','--host','127.0.0.1','--port','5173','--strictPort']);
  await awaitHealthy(WEB_URL,async res=>{
   const html=await res.text().catch(()=>'');
   return res.ok && /text\/html/i.test(res.headers.get('content-type')||'') &&
    /<div\s+id=["']root["']/.test(html) && /\/src\/main\.tsx/.test(html);
  },{session:instance,fetchImpl});
  if(!isActive())throw Error('Full-stack process exited during readiness verification.');
  return {running:true,url:WEB_URL,frontendUrl:WEB_URL,apiUrl:API_URL,
   framework:'React / Vite + NestJS / PostgreSQL',mode:'live',mockPreview:false,mockDatabase:false,
   services:log().processes,message:'LIVE FULL STACK · Vite frontend, real NestJS API and PostgreSQL verified on localhost. Okta and other integrations not verified. No GitHub push.'};
 }catch(error){await stop();throw error;}
}
module.exports={detectPair,hasEnvironment,modeForPair,assertRealHealth,isActive,hasManagedSession,run,stop,log};
