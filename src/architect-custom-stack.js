'use strict';
// Existing project source inspection, then explicitly approved local execution.
// The scanner never copies a catalog starter, writes project source, or pushes Git.
const fs=require('node:fs/promises');
const path=require('node:path');
const developer=require('./developer-git');
const dependencies=require('./stack-dependency-helper');
const bootstrap=require('./architect-stack-bootstrap');

function loopbackPreview(input){
 let url;try{url=new URL(String(input||''));}catch{throw Error('Enter a valid localhost preview URL.');}
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||
    url.username||url.password||url.search||url.hash||url.port&&(!/^\d+$/.test(url.port)||Number(url.port)<1||Number(url.port)>65535))
  throw Error('Custom Stack preview must use an HTTP localhost URL without credentials, query or fragment.');
 return url.toString();
}
// Detect executable applications, not development tools installed for testing.
// A NestJS package with vitest/vite must never be mistaken for a web frontend.
function framework(target,pkg,{viteConfig=false}={}){
 if(target.kind==='dotnet')return {name:'ASP.NET Core / .NET',preview:'http://127.0.0.1:5111/api/health',role:'backend',mockType:'none'};
 if(target.kind==='maven')return {name:'Java / Maven / Spring Boot',preview:'http://127.0.0.1:8080/api/health',role:'backend',mockType:'none'};
 const dep={...pkg?.dependencies,...pkg?.devDependencies};
 const commands=['dev','start:dev','start'].map(name=>String(pkg?.scripts?.[name]||''));
 const runsVite=commands.some(script=>/(?:^|[\s;&|])(?:npx\s+|npm\s+exec\s+(?:--\s+)?)?vite(?:\s|$)/.test(script));
 const isVite=Boolean(dep.vite&&viteConfig&&runsVite);
 const frontend=(name,preview,mockType='none')=>({name,preview,role:'frontend',mockType});
 const backend=(name)=>({name,preview:'http://127.0.0.1:3000/api/v1/health',role:'backend',mockType:'api'});
 if(dep['@nestjs/core'])return backend('NestJS');
 if(dep.next)return frontend('Next.js','http://127.0.0.1:3000/');
 if(dep['@angular/core'])return frontend('Angular','http://127.0.0.1:4200/');
 if(isVite)return frontend(dep.react?'React / Vite':dep.vue?'Vue / Vite':dep.svelte?'Svelte / Vite':'Vite','http://127.0.0.1:5173/','vite');
 if(dep.fastify)return backend('Node / Fastify');
 if(dep.express)return backend('Node / Express');
 if(dep.react||dep.vue||dep.svelte)return frontend('Web application','http://127.0.0.1:3000/');
 if(pkg?.workspaces)return {name:'npm workspace root',preview:'http://127.0.0.1:3000/',role:'workspace',mockType:'none'};
 return {name:'Node.js (custom scripts)',preview:'http://127.0.0.1:3000/',role:'service',mockType:'none'};
}
async function scan(root,{driver=developer,fsApi=fs}={}){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Select an absolute project repository checkout before scanning.');
 const found=await driver.inspectScripts(root);
 if(!found?.repo?.root||!path.isAbsolute(found.repo.root))throw Error('The selected folder is not a verified Git repository.');
 const entries=[];
 for(const target of found.targets||[]){
  const rel=String(target.relative||'');
  if(rel.startsWith('/')||rel.includes('\\')||rel.includes('//')||rel.split('/').length>3||rel.split('/').some(x=>x==='.'||x==='..'||x.startsWith('.')))throw Error('Unsupported application location in custom scan.');
  const cwd=path.join(found.repo.root,rel);
  let pkg=null,viteConfig=false;
  if(target.kind==='npm'){
   try{pkg=JSON.parse(await fsApi.readFile(path.join(cwd,'package.json'),'utf8'));}
   catch(error){throw Error('Invalid package.json in '+(rel||'repository root')+': '+error.message);}
   for(const name of ['vite.config.ts','vite.config.mts','vite.config.js','vite.config.mjs']){
    const st=await fsApi.lstat(path.join(cwd,name)).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
    if(st?.isFile()&&!st.isSymbolicLink()){viteConfig=true;break;}
   }
  }
  const info=framework(target,pkg,{viteConfig});
  const scripts=Array.isArray(target.scripts)?target.scripts:[];
  const runnable=target.kind==='npm'?['dev','start:dev','start'].some(x=>scripts.includes(x)):['dotnet','maven'].includes(target.kind);
  entries.push({relative:rel,kind:target.kind,framework:info.name,role:info.role,mockType:info.mockType,previewUrl:loopbackPreview(info.preview),
   installed:!!target.installed,scripts,runScript:target.kind==='npm'?(scripts.includes('dev')?'dev':scripts.includes('start:dev')?'start:dev':scripts.includes('start')?'start':''):'run',
   runnable,mockable:runnable&&info.mockType==='vite',mockApi:runnable&&info.mockType==='api',
   packageName:String(pkg?.name||'').slice(0,100)});
 }
 // Industry-standard monorepos can have an orchestration package.json at root.
 // Prefer a real frontend instead of a root workspace or backend test harness.
 const priority=x=>!x.runnable?5:x.mockable?0:x.role==='frontend'?1:x.mockApi?2:x.role==='backend'?3:4;
 entries.sort((a,b)=>priority(a)-priority(b)||a.relative.localeCompare(b.relative));
 return {root:found.repo.root,sha:String(found.repo.sha||''),branch:String(found.repo.branch||''),clean:found.repo.clean===true,
  targets:entries,recognized:entries.length,ready:entries.some(entry=>entry.runnable)};
}
async function run(root,{sha,relative='',previewUrl,mock=false,mockDatabase=false,onProgress=async()=>{},driver=developer,helper=dependencies,bootstrapApi=bootstrap,httpRequest=fetch}={}){
 const check=await scan(root,{driver});
 if(!/^[a-f0-9]{40}$/.test(String(sha||''))||check.sha!==sha)throw Error('Project Git revision changed after the scan. Scan the Custom Stack again.');
 const selected=check.targets.find(t=>t.relative===relative);
 if(!selected||!selected.runnable)throw Error('Select a detected application with a dev, start or run command.');
 if(mock&&!selected.mockable)throw Error('Mock Preview is only supported for detected Vite applications.');
 const url=loopbackPreview(previewUrl||selected.previewUrl);
 if(mock&&new URL(url).pathname!=='/')throw Error('Frontend Mock Preview must use the application root URL, not an API route.');
 const cwd=path.join(check.root,selected.relative);
 const existing=driver.localLogs();
 if(existing.running)throw Error('An ATGV-managed application is already running. Stop it before running Custom Stack.');
 const inspection=await driver.inspectScripts(root);
 if(inspection.repo.sha!==sha)throw Error('Git revision changed while preparing the custom application.');
 const target=inspection.targets.find(t=>t.relative===selected.relative&&t.kind===selected.kind);
 if(!target)throw Error('Selected custom application is no longer available.');
 await onProgress('Checking and installing approved dependencies for '+(selected.relative||'repository root')+'…');
 await helper.ensureForTarget(root,target,{onProgress});
 await onProgress('Starting '+selected.framework+' from '+(selected.relative||'repository root')+'…');
 let started=false;
 try{
  await driver.runLocal(root,{relative:selected.relative,previewUrl:url,...(mock?{mockPreview:true,mockDatabase:!!mockDatabase}:{})});started=true;
  await onProgress('Verifying localhost health at '+url+'…');
  await bootstrapApi.waitForHttp(url,()=>driver.localLogs().running,60000,driver.localLogs().instanceId||'');
  if(mock){
   // HTTP 200 from a standalone API is not proof that the frontend exists.
   const frontend=await httpRequest(url,{redirect:'manual',signal:AbortSignal.timeout(3500)});
   const frontendHtml=frontend.ok&&/text\/html/i.test(frontend.headers.get('content-type')||'');
   await frontend.body?.cancel().catch(()=>{});
   if(!frontendHtml)throw Error('Mock service responded, but the frontend application did not serve HTML at '+url+'. Select a runnable Vite frontend.');
   const apiUrl=new URL('/api/v1/health',url).toString();
   const api=await httpRequest(apiUrl,{redirect:'manual',signal:AbortSignal.timeout(3500)});
   if(!api.ok||api.headers.get('x-atgv-mock-preview')!=='true'){
    await api.body?.cancel().catch(()=>{});
    throw Error('Frontend is running but the isolated mock API is not healthy at '+apiUrl+'.');
   }
   const state=await api.json();
   if(state.status!=='mock'||state.database!=='simulated')
    throw Error('Frontend API did not return verified synthetic health. Production services were not used.');
  }
  const current=driver.localLogs();
  if(!current.running||path.resolve(current.cwd||'')!==path.resolve(cwd))throw Error('The custom application stopped or switched during health verification.');
  return {running:true,url,framework:selected.framework,relative:selected.relative,sha,mockPreview:mock,mockDatabase:!!(mock&&mockDatabase),message:mock?'MOCK DATA · Frontend and isolated mock API running at '+url+'. '+(mockDatabase?'Synthetic database fixtures enabled. ':'')+'External APIs and real databases are NOT connected. No source files were committed.':'Custom Stack running at '+url+'. No Git branch, commit or push was created.'};
 }catch(error){
  if(started)await driver.stopLocal().catch(()=>{});
  throw error;
 }
}
async function stop(root,{relative='',driver=developer}={}){
 const info=await scan(root,{driver});
 const target=info.targets.find(item=>item.relative===relative);
 if(!target)throw Error('Custom application is no longer in the project repository.');
 const active=driver.localLogs();
 if(!active.running)return {running:false,message:'Custom Stack is already stopped.'};
 if(path.resolve(active.cwd||'')!==path.resolve(info.root,relative))throw Error('A different application owns the ATGV-managed process. No process was stopped.');
 await driver.stopLocal();
 return {running:false,message:'Custom Stack application stopped.'};
}
module.exports={loopbackPreview,framework,scan,run,stop};
