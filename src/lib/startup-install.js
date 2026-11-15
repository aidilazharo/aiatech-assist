'use strict';
/**
 * Explicit, user-confirmed host-tool installs. All commands and arguments are
 * static allowlist entries; no instructions arrive from the SDLC Catalog and
 * webview messages can select only a known tool ID.
 */
const {spawn}=require('node:child_process');
const {TOOLS}=require('./startup-readiness');
const GUIDES=Object.freeze({
 node:'https://nodejs.org/en/download',npm:'https://nodejs.org/en/download',npx:'https://nodejs.org/en/download',
 git:'https://git-scm.com/downloads',angular:'https://angular.dev/tools/cli/setup-local',
 nest:'https://docs.nestjs.com/first-steps',dotnet:'https://learn.microsoft.com/en-us/dotnet/core/install/',
 java:'https://adoptium.net/installation/',maven:'https://maven.apache.org/install.html'
});
const WINGET=Object.freeze({node:'OpenJS.NodeJS.LTS',npm:'OpenJS.NodeJS.LTS',npx:'OpenJS.NodeJS.LTS',
 git:'Git.Git',dotnet:'Microsoft.DotNet.SDK.10',java:'EclipseAdoptium.Temurin.25.JDK'});
const BREW=Object.freeze({node:'node',npm:'node',npx:'node',git:'git',dotnet:'dotnet-sdk',java:'openjdk@25',maven:'maven'});
const GLOBAL_NPM=Object.freeze({angular:'@angular/cli',nest:'@nestjs/cli'});
function plan(id,platform=process.platform){
 if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(TOOLS,id))throw Error('Unknown or unapproved prerequisite module.');
 const guideUrl=GUIDES[id];
 if(Object.prototype.hasOwnProperty.call(GLOBAL_NPM,id)){
  return {id,platform,command:platform==='win32'?'npm.cmd':'npm',args:['install','--global',GLOBAL_NPM[id]],guideUrl,
   summary:`npm install --global ${GLOBAL_NPM[id]}`,shell:platform==='win32'};
 }
 if(platform==='win32'&&Object.prototype.hasOwnProperty.call(WINGET,id)){
  return {id,platform,command:'winget',args:['install','--id',WINGET[id],'--exact','--accept-package-agreements','--accept-source-agreements'],guideUrl,
   summary:`winget install --id ${WINGET[id]} --exact`,shell:false};
 }
 if(platform==='darwin'&&Object.prototype.hasOwnProperty.call(BREW,id)){
  return {id,platform,command:'brew',args:['install',BREW[id]],guideUrl,
   summary:`brew install ${BREW[id]}`,shell:false};
 }
 return {id,platform,command:'',args:[],guideUrl,summary:'Open the official installation instructions',shell:false};
}
async function install(id,{platform=process.platform,spawnImpl=spawn,onProgress=()=>{},timeoutMs=300000}={}){
 const step=plan(id,platform);
 if(!step.command)return {status:'manual',...step};
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>900000)throw Error('Invalid installer timeout.');
 onProgress({status:'running',detail:`Installing ${id}: ${step.summary}`});
 return new Promise((resolve,reject)=>{
  let finished=false,tail='',lastUpdate=0;
  const child=spawnImpl(step.command,step.args,{shell:step.shell,windowsHide:true,env:process.env,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{child.kill();finish(Error(`Installation timed out: ${id}. Review package manager logs.`));},timeoutMs);
  function finish(error){
   if(finished)return;finished=true;clearTimeout(timer);
   if(error){error.installOutput=tail.slice(-12000);reject(error);return;}
   resolve({status:'complete',...step,detail:`${id} installation command completed. Refresh to verify; a VS Code restart may be needed for PATH changes.`,output:tail.slice(-10000)});
  }
  function update(chunk){
   tail=(tail+String(chunk||'')).slice(-12000);
   const now=Date.now();if(now-lastUpdate<600)return;lastUpdate=now;
   const message=tail.split(/[\r\n]/).map(s=>s.trim()).filter(Boolean).at(-1)||'Installation in progress';
   onProgress({status:'running',detail:`${id}: ${message.slice(0,180)}`});
  }
  child.stdout?.on('data',update);child.stderr?.on('data',update);
  child.once('error',error=>finish(Error(`Cannot launch installer for ${id}: ${error.message}`)));
  child.once('close',(code,signal)=>{
   if(code!==0){const failed=Error(`${id} installer failed (${signal||'exit '+code}). ${tail.slice(-400)}`);failed.exitCode=code;failed.signal=signal;finish(failed);}
   else finish();
  });
 });
}
module.exports={GUIDES,WINGET,BREW,plan,install};
