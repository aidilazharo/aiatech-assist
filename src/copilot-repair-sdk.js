'use strict';
// Install the pinned public SDK only after the user selects Setup. The VSIX
// stays small; the native CLI runtime is provided by the SDK's platform package.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const {runCheck}=require('./self-improvement');
const SDK='@github/copilot-sdk',VERSION='1.0.34';
function compatibleNode(version=process.versions.node){
 const parts=String(version).split('.').map(Number),[major=0,minor=0]=parts;
 return major===20&&minor>=19||major>=22&&(major>22||minor>=12);
}
function sdkRoot(storage){return path.join(path.resolve(storage),'self-improvement','copilot-sdk');}
async function installed(storage){
 try{
  const root=sdkRoot(storage),pkg=JSON.parse(await fs.readFile(path.join(root,'node_modules','@github','copilot-sdk','package.json'),'utf8'));
  return pkg.name===SDK&&pkg.version===VERSION;
 }catch{return false;}
}
async function install(storage,{onProgress=()=>{},run=runCheck}={}){
 if(!compatibleNode())throw Error('This VS Code extension host needs Node.js 20.19+ or 22.12+ for the Copilot SDK. Update VS Code and retry.');
 const root=sdkRoot(storage);await fs.mkdir(root,{recursive:true,mode:0o700});
 const args=['install','--prefix',root,'--no-audit','--no-fund','--ignore-scripts','--save-exact',SDK+'@'+VERSION];
 await onProgress('Installing the Copilot SDK and its platform runtime…');const result=await run('npm',args,{cwd:root,onProgress,timeout:600000});
 if(!result.passed)throw Error('Copilot SDK installation failed. '+String(result.output||'').slice(-800));
 if(!await installed(storage))throw Error('Copilot SDK installation completed but the expected version was not found.');
 return {name:SDK,version:VERSION};
}
async function loadSdk(storage){
 if(!compatibleNode())throw Error('This VS Code extension host needs Node.js 20.19+ or 22.12+ for the Copilot SDK. Update VS Code and retry.');
 if(!await installed(storage))throw Error('Copilot SDK is not installed. Select Set up Copilot SDK in Self Improvement.');
 const root=sdkRoot(storage),load=createRequire(path.join(root,'package.json'));let entry;
 try{entry=load.resolve(SDK);}catch(e){throw Error('Cannot locate the installed Copilot SDK. Run setup again.');}
 const module=await import(pathToFileURL(entry).href);if(typeof module.CopilotClient!=='function')throw Error('Installed Copilot SDK does not expose CopilotClient.');return module;
}
async function analyze(storage,{prompt,cwd,onProgress=()=>{},sdkLoader=loadSdk,timeout=240000,signal,model=''}={}){
 if(signal?.aborted)throw Object.assign(Error('AI request stopped.'),{name:'AbortError'});
 const sdk=await sdkLoader(storage),client=new sdk.CopilotClient({workingDirectory:cwd});let session;
 const abort=()=>{if(session?.abort)void session.abort().catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  await onProgress('Starting the Copilot agent. Sign in to Copilot CLI if authentication is requested.');
  await client.start();
  session=await client.createSession({workingDirectory:cwd,...(model?{model}:{}),availableTools:[],onPermissionRequest:async()=>({kind:'reject',feedback:'ATGV permits only the supplied context; tool execution is disabled.'})});
  if(signal?.aborted){abort();throw Object.assign(Error('AI request stopped.'),{name:'AbortError'});}
  const response=await session.sendAndWait({prompt},timeout),text=String(response?.data?.content||'').trim();
  if(signal?.aborted)throw Object.assign(Error('AI request stopped.'),{name:'AbortError'});
  if(!text)throw Error('Copilot returned no repair proposal. Check Copilot authentication and model access.');return text;
 }catch(e){if(e?.name==='AbortError')throw e;throw Error('Copilot analysis failed: '+String(e.message||e).slice(0,700));}
 finally{signal?.removeEventListener('abort',abort);if(session){const stop=typeof session.disconnect==='function'?session.disconnect():session.destroy?.();if(stop)await Promise.resolve(stop).catch(()=>{});}await client.stop().catch(()=>{});}
}
module.exports={SDK,VERSION,compatibleNode,sdkRoot,installed,install,loadSdk,analyze};
