'use strict';
// Verify that the actual server launched from the generated BR worktree is
// responding. Never count an unrelated localhost process as BR verification.
const net = require('node:net');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');

function localhostUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { return ''; }
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password) return '';
  return url.toString();
}
function healthEndpoints(previewUrl,apiBaseUrl='') {
  const preview = localhostUrl(previewUrl);
  if (!preview) throw Error('Approved technology-stack catalog has no valid localhost preview URL.');
  const targets = [{kind:'frontend',url:preview}];
  const api=localhostUrl(apiBaseUrl);
  if(api && new URL(api).port!==new URL(preview).port) {
    const u=new URL(api);u.pathname='/api/health';u.search='';u.hash='';
    targets.push({kind:'API',url:u.toString()});
  }
  return targets;
}
async function tcpBound(url,timeoutMs=650) {
  const u=new URL(url),host=u.hostname==='[::1]'?'::1':u.hostname,port=Number(u.port || (u.protocol==='https:'?443:80));
  return new Promise(resolve=>{
    const socket=net.createConnection({host,port});let settled=false;
    const done=value=>{if(settled)return;settled=true;socket.destroy();resolve(value);};
    socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(timeoutMs,()=>done(false));
  });
}
async function requireFreePorts(endpoints,{portBound=tcpBound}={}) {
  const urls=new Map();
  for(const entry of endpoints){const u=new URL(entry.url),key=`${u.hostname}:${u.port||80}`;urls.set(key,entry.url);}
  for(const url of urls.values()) {
    if(await portBound(url)) throw Error(`Local port ${new URL(url).port||80} is already occupied (${url}). Stop the existing application in Solution Architect or another terminal, then select Retry Local Server. The extension will not confuse a previous server with the generated BR application.`);
  }
}
function insideWorktree(worktree,cwd) {
  if(!worktree||!cwd)return false;
  const relative=path.relative(path.resolve(worktree),path.resolve(cwd));
  return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
}
function isRepairableRuntimeFailure(error) {
  const message=String(error?.message||error||'');
  // Only a failed, owned generated application qualifies for autonomous repair.
  // Port conflicts, wrong worktree, cancelled runs and environment failures do not.
  return /Generated application exited before becoming healthy|Generated BR server was started but did not pass health checks|Server stopped during final verification/.test(message);
}
function serverExitExplanation(log) {
  const output=String(log?.logs||'');
  if(/concurrently[\s\S]*?sending SIGTERM|Sending SIGTERM to other processes/i.test(output) && /node server\/index\.mjs exited with code 0/i.test(output)) {
    return ' The API entry process exited normally instead of staying listening. Because concurrently uses -k, it then terminated the frontend. The generated server must remain alive and respond to /api/health.';
  }
  if(/exited with code 0/.test(output)&&/SIGTERM/.test(output))return ' A subprocess exited before the application was ready, causing the other development processes to stop.';
  return '';
}
function serverDiagnostic(message,log) {
  const tail=String(log?.logs||'').slice(-5500);
  const suffix=log?.exitCode!==null&&log?.exitCode!==undefined?` Exit code ${log.exitCode}.`:'';
  const error=Error(message+suffix+serverExitExplanation(log)+(tail?' Recent server output: '+tail.slice(-1200):' No server output was captured.'));
  error.serverLogs=tail;
  return error;
}
async function waitForGeneratedServer({endpoints,worktree,pid,readServer,fetchImpl=fetch,signal,timeoutMs=60000,pollMs=900,onUpdate=async()=>{}}={}) {
  if(!Array.isArray(endpoints)||!endpoints.length||endpoints.some(e=>!localhostUrl(e.url)))throw Error('Invalid localhost server endpoints.');
  if(typeof readServer!=='function')throw Error('Server state monitor is not configured.');
  const deadline=Date.now()+timeoutMs;let last='No HTTP response yet.';let attempts=0;
  while(Date.now()<deadline) {
    if(signal?.aborted)throw Error('Stopped by user during local server verification.');
    const state=readServer();
    if(state.pid!==pid||!insideWorktree(worktree,state.cwd))throw serverDiagnostic('Local server no longer matches the generated BR worktree.',state);
    if(!state.running)throw serverDiagnostic('Generated application exited before becoming healthy.',state);
    let ok=true;
    for(const endpoint of endpoints) {
      let reason='';
      try{
        const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),2200);
        try{const response=await fetchImpl(endpoint.url,{signal:controller.signal,redirect:'error'});if(response.status<200||response.status>=400)reason=`HTTP ${response.status}`;}
        finally{clearTimeout(timeout);}
      }catch(error){reason=String(error?.cause?.code||error?.message||error).slice(0,180);}
      if(reason){last=`${endpoint.kind} ${endpoint.url}: ${reason}`;ok=false;break;}
    }
    if(ok){const final=readServer();if(final.pid!==pid||!final.running||!insideWorktree(worktree,final.cwd))throw serverDiagnostic('Server stopped during final verification.',final);return {healthy:true,url:endpoints[0].url,pid,apiVerified:endpoints.length>1,attempts:attempts+1,serverLogs:String(final.logs||'').slice(-6500)};}
    attempts++;
    if(attempts===1||attempts%5===0)await onUpdate({message:`Waiting for generated BR application: ${last}`,serverLogs:String(state.logs||'').slice(-6500)});
    await delay(pollMs,undefined,{signal}).catch(error=>{if(signal?.aborted)throw Error('Stopped by user during local server verification.');throw error;});
  }
  throw serverDiagnostic(`Generated BR server was started but did not pass health checks within ${Math.round(timeoutMs/1000)} seconds. Last check: ${last}.`,readServer());
}
module.exports={localhostUrl,healthEndpoints,tcpBound,requireFreePorts,insideWorktree,serverExitExplanation,isRepairableRuntimeFailure,waitForGeneratedServer};
