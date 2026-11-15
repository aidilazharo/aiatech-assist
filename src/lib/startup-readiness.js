'use strict';
/** Read-only local prerequisite checks. Never installs packages or executes a catalog script. */
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises');
const path=require('node:path');
const run=promisify(execFile);
const TOOLS=Object.freeze({
 node:{command:'node',args:['--version']},
 npm:{command:'npm',args:['--version']},
 git:{command:'git',args:['--version']},
 npx:{command:'npx',args:['--version']},
 angular:{command:'ng',args:['version','--skip-git']},
 nest:{command:'nest',args:['--version']},
 dotnet:{command:'dotnet',args:['--version']},
 java:{command:'java',args:['-version']},
 maven:{command:'mvn',args:['--version']}
});
const STACKS=Object.freeze([
 {id:'react',name:'React',required:['node','npm','git'],optional:['npx'],min:{node:22}},
 {id:'angular',name:'Angular',required:['node','npm','git'],optional:['angular','npx'],min:{node:22}},
 {id:'nestjs',name:'NestJS',required:['node','npm','git'],optional:['nest','npx'],min:{node:22}},
 {id:'dotnet',name:'.NET',required:['dotnet','git'],optional:[],min:{dotnet:10}},
 {id:'spring-boot',name:'Spring Boot',required:['java','maven','git'],optional:[],min:{java:25}}
]);
function version(text){const match=String(text||'').match(/(?:^|\D)(\d+)(?:\.(\d+))?/);return match?Number(match[1]):null;}
function assessStack(stack,tools){
 const components=[...stack.required.map(id=>({id,required:true})),...stack.optional.map(id=>({id,required:false}))].map(component=>{
  const found=tools[component.id]||{installed:false,version:''};
  const min=stack.min?.[component.id]||0;
  const compatible=found.installed&&(!min||(version(found.version)!==null&&version(found.version)>=min));
  return {...component,installed:!!found.installed,compatible,version:found.version||'',minimum:min?String(min)+'+':'',source:found.source||'',discoveredPath:found.discoveredPath||''};
 });
 return {id:stack.id,name:stack.name,ready:components.every(c=>!c.required||c.compatible),components,
  note:'Host prerequisites only. Project packages and the application build are verified after installing the selected scaffold.'};
}
// Windows installers update the OS environment rather than the active VS Code
// process. Verify executable versions only from known vendor installation folders
// and make their bin directory available to this extension-host session.
async function findTrustedWindowsTool(name,{runner=run,env=process.env,fsApi=fs}={}){
 const programFiles=env.ProgramFiles||env.PROGRAMFILES||'';
 const local=env.LOCALAPPDATA||'';
 const roots=[programFiles,local].filter(Boolean);
 const candidates=[];
 const add=p=>{if(p&&!candidates.includes(p))candidates.push(p);};
 async function jdkPaths(root){
  try{return (await fsApi.readdir(root,{withFileTypes:true}))
    .filter(entry=>entry.isDirectory()&&/^jdk-?\d/i.test(entry.name))
    .map(entry=>path.join(root,entry.name,'bin','java.exe'))
    .sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}
  catch{return [];}
 }
 if(name==='java'){
  for(const root of roots)for(const vendor of ['Eclipse Adoptium','Java'])
   for(const executable of await jdkPaths(path.join(root,vendor)))add(executable);
 }else if(name==='dotnet'&&programFiles)add(path.join(programFiles,'dotnet','dotnet.exe'));
 else if(name==='git'&&programFiles)add(path.join(programFiles,'Git','cmd','git.exe'));
 else if(name==='node'&&programFiles)add(path.join(programFiles,'nodejs','node.exe'));
 for(const executable of candidates.slice(0,24)){
  try{
   const stat=await fsApi.stat(executable);
   if(!stat.isFile())continue;
   const result=await runner(executable,TOOLS[name].args,{timeout:5000,maxBuffer:32768,windowsHide:true,shell:false});
   const output=String(result.stdout||result.stderr||'').trim().split(/\r?\n/)[0].slice(0,100);
   if(!output)continue;
   const key=Object.keys(env).find(k=>k.toUpperCase()==='PATH')||'PATH';
   const dir=path.dirname(executable),old=String(env[key]||'');
   if(!old.split(path.delimiter).some(x=>x.toLowerCase()===dir.toLowerCase()))
    env[key]=dir+path.delimiter+old;
   if(name==='java'&&!env.JAVA_HOME)env.JAVA_HOME=path.dirname(dir);
   return {installed:true,version:output,source:'trusted install path',discoveredPath:executable};
  }catch{}
 }
 return null;
}
async function check({runner=run,platform=process.platform,env=process.env,fsApi=fs}={}){
 const names=[...new Set(STACKS.flatMap(s=>[...s.required,...s.optional]))];
 const results=await Promise.all(names.map(async name=>{
  const item=TOOLS[name];try{
   const result=await runner(item.command,item.args,{timeout:3500,maxBuffer:32768,windowsHide:true,shell:platform==='win32'});
   const output=String(result.stdout||result.stderr||'').trim();
   return [name,{installed:true,version:output.split(/\r?\n/)[0].slice(0,100),source:'PATH'}];
  }catch(error){
   const output=String(error.stderr||error.stdout||'').trim();
   const found=platform==='win32'?await findTrustedWindowsTool(name,{runner,env,fsApi}):null;
   return [name,found||{installed:false,version:output.split(/\r?\n/)[0].slice(0,100),error:String(error.code||error.message||'').slice(0,160)}];
  }
 }));
 const tools=Object.fromEntries(results);
 return {checkedAt:new Date().toISOString(),platform,tools,stacks:STACKS.map(s=>assessStack(s,tools)),
  explanation:'Missing host tools can be installed separately. The check never installs software or executes downloaded catalog code.'};
}
module.exports={TOOLS,STACKS,check,assessStack,version,findTrustedWindowsTool};
