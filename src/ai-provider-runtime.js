'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {npmCommand,codexCommand}=require('./platform-process');

function codexBinary(runtimeRoot,platform=process.platform){
 const bin=platform==='win32'?'codex.exe':'codex';
 const root=String(runtimeRoot||'');
 const candidates=[
  ...(platform==='win32' ? [root&&path.join(root,'node_modules','@openai','codex','bin','codex.js'), root&&path.join(root,'node_modules','.bin','codex.cmd')] : [root&&path.join(root,'node_modules','.bin','codex'),root&&path.join(root,'node_modules','@openai','codex','bin','codex.js')]),
  ...(platform==='win32'?[]:['/usr/local/bin/codex','/opt/homebrew/bin/codex'])
 ].filter(Boolean);
 return candidates.find(p=>fs.existsSync(p))||(platform==='win32'?'codex.cmd':bin);
}
function readOutput(command,args,{cwd,env,signal,stdin='',timeoutMs=90000,limit=2000000}={}){
 return new Promise((resolve,reject)=>{
  let proc,output='',errors='',settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(result);};
  const abort=()=>{proc?.kill();finish(Object.assign(new Error('AI request cancelled.'),{name:'AbortError'}));};
  const timer=setTimeout(()=>{proc?.kill();finish(new Error('AI provider timed out. Check authentication and connectivity.'));},timeoutMs);
  try{const safe=codexCommand(command,args);proc=spawn(safe.bin,safe.args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});}
  catch(e){finish(new Error(`Unable to start AI provider: ${e.message}`));return;}
  proc.on('error',e=>finish(new Error(`Unable to run ${path.basename(command)}: ${e.message}`)));
  proc.stdout.on('data',part=>{output+=part.toString('utf8');if(output.length>limit){proc.kill();finish(new Error('AI provider output exceeded safety limit.'));}});
  proc.stderr.on('data',part=>{if(errors.length<10000)errors+=part.toString('utf8').slice(0,10000-errors.length);});
  proc.on('close',code=>{if(code!==0){const error=new Error(`AI provider exited (${code}). ${errors.trim().slice(-450)||'Check the provider sign-in and runtime.'}`);error.exitCode=code;error.stderr=errors;error.stdout=output;finish(error);}else finish(null,{output,errors});});
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  if(stdin){proc.stdin.on('error',()=>{});proc.stdin.end(stdin);}else proc.stdin.end();
 });
}
function codexText(events){
 let text='',turnFailure='';
 for(const line of String(events||'').split(/\r?\n/)){
  let entry;try{entry=JSON.parse(line);}catch{continue;}
  if(entry.type==='turn.failed')turnFailure=entry.error?.message||entry.message||'Codex turn failed';
  const item=entry.item||{};
  if((entry.type==='item.completed'||entry.type==='item.updated') && item.type==='agent_message' && typeof item.text==='string')text=item.text;
  if(entry.type==='message' && entry.role==='assistant' && typeof entry.content==='string')text=entry.content;
 }
 if(!text&&turnFailure)throw new Error(turnFailure);
 return text;
}
async function checkCodex(runtimeRoot,options={}){
 const binary=codexBinary(runtimeRoot);
 try{const result=await readOutput(binary,['--version'],{timeoutMs:6000,...options});return {installed:true,binary,version:result.output.trim().slice(0,120)};}
 catch(e){return {installed:false,binary,reason:e.message};}
}
async function installCodex(runtimeRoot,{signal,onLog}={}){
 if(!runtimeRoot||!path.isAbsolute(runtimeRoot))throw new Error('An absolute extension-managed runtime directory is required.');
 await fs.promises.mkdir(runtimeRoot,{recursive:true,mode:0o700});
 const command=npmCommand(['install','--prefix',runtimeRoot,'--ignore-scripts','--no-audit','--no-fund','--save=false','@openai/codex@latest']);
 onLog?.('Installing official Codex runtime into ATGV storage; no system-wide installation.');
 try{
  const {output}=await readOutput(command.bin,command.args,{
   timeoutMs:180000,signal,limit:150000,
   env:{...process.env,npm_config_registry:'https://registry.npmjs.org/',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false'}
  });
  onLog?.(output.slice(-350));
 }catch(e){throw new Error(`Automatic Codex installation failed: ${e.message}. An approved network connection and npm runtime may be required; no project files were changed.`);}
 const status=await checkCodex(runtimeRoot);
 if(!status.installed)throw new Error('Codex package installed but its platform executable is unavailable: '+status.reason);
 return status;
}
function codexArguments({transport='https',model=''}={}){
 if(!['https','default'].includes(transport))throw new Error('Unsupported Codex transport mode.');
 const args=[];
 if(transport==='https'){
  args.push('-c','model_provider="atgv_https"');
  args.push('-c','model_providers.atgv_https={name="ATGV HTTPS",wire_api="responses",requires_openai_auth=true,supports_websockets=false}');
 }
 args.push('exec','--json','--sandbox','read-only','--skip-git-repo-check');
 if(model){
  if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(model))throw new Error('Codex model ID contains invalid characters.');
  args.push('--model',model);
 }
 args.push('-');
 return args;
}
function codexError(error,{transport='https'}={}){
 if(error?.name==='AbortError')return error;
 const detail=[error?.stderr,error?.stdout,error?.message].filter(Boolean).join('\n').slice(-8000);
 const normalized=detail.toLowerCase();
 if(/responses_websocket|websocket|\bwss:\/\//i.test(detail))return new Error('Codex could not connect over WebSocket. In Settings → AI Providers, select HTTPS only (recommended), save and test again. If HTTPS also fails, check your corporate proxy, VPN and Codex sign-in.');
 if(/401|unauthorized|token.expired|sign.in|required.authentication|login required|not logged in/i.test(normalized))return new Error('Codex authentication failed. Sign in using the Codex login flow and retry Test AI Connection.');
 if(/403|forbidden|access denied/i.test(normalized))return new Error('Codex access was refused by the provider. Check organizational permissions and your account entitlement.');
 if(/429|rate.limit|quota|capacity/i.test(normalized))return new Error('Codex rate or usage limit reached. Retry later or contact your administrator.');
 if(/certificate|unknownissuer|tls|ssl/i.test(normalized))return new Error('Codex TLS certificate validation failed. Check the organization-approved proxy and CA certificate configuration.');
 if(/proxy|connection refused|network unreachable|timed out|dns|name resolution/i.test(normalized))return new Error(`Codex network connection failed in ${transport==='https'?'HTTPS':'default'} mode. Check access to the official Codex service, corporate proxy, DNS and VPN.`);
 if(/model_provider|model_providers|unknown configuration|invalid configuration|invalid type|failed to parse config/i.test(normalized))return new Error('This Codex runtime cannot use the configured HTTPS compatibility mode. Update Codex, or select Codex default transport and test again.');
 if(/not found|enoent/i.test(normalized))return new Error('Codex runtime is not available. Use Install Codex Automatically or select another configured provider.');
 return new Error('Codex request failed. Check the Codex sign-in, approved network access and ATGV output logs. The provider exited without a usable response.');
}
async function executeCodex({runtimeRoot,cwd,prompt,system='',signal,maxChars=60000,transport='https',model=''}={}){
 const binary=codexBinary(runtimeRoot);
 const content=[system,prompt].filter(Boolean).join('\n\nUSER REQUEST:\n');
 let result;
 try{
  result=await readOutput(binary,codexArguments({transport,model}),{
   cwd:cwd&&fs.existsSync(cwd)?cwd:undefined,stdin:content,signal,timeoutMs:180000,limit:2500000
  });
 }catch(error){throw codexError(error,{transport});}
 let answer;
 try{answer=codexText(result.output).trim();}
 catch(error){throw codexError(error,{transport});}
 if(!answer)throw new Error('Codex returned no final message. Verify your Codex login and check ATGV output for diagnostics.');
 if(answer.length>maxChars)throw new Error('Codex response exceeds the allowed size.');
 return answer;
}
module.exports={codexBinary,readOutput,codexText,checkCodex,installCodex,executeCodex,codexArguments,codexError};
