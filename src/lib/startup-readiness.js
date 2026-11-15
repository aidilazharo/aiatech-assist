'use strict';
/** Read-only local prerequisite checks. Never installs packages or executes a catalog script. */
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
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
  return {...component,installed:!!found.installed,compatible,version:found.version||'',minimum:min?String(min)+'+':''};
 });
 return {id:stack.id,name:stack.name,ready:components.every(c=>!c.required||c.compatible),components,
  note:'Host prerequisites only. Project packages and the application build are verified after installing the selected scaffold.'};
}
async function check({runner=run}={}){
 const names=[...new Set(STACKS.flatMap(s=>[...s.required,...s.optional]))];
 const results=await Promise.all(names.map(async name=>{
  const item=TOOLS[name];try{
   const result=await runner(item.command,item.args,{timeout:3500,maxBuffer:32768,windowsHide:true,shell:process.platform==='win32'});
   const output=String(result.stdout||result.stderr||'').trim();
   return [name,{installed:true,version:output.split(/\r?\n/)[0].slice(0,100)}];
  }catch(error){
   const output=String(error.stderr||error.stdout||'').trim();
   return [name,{installed:false,version:output.split(/\r?\n/)[0].slice(0,100)}];
  }
 }));
 const tools=Object.fromEntries(results);
 return {checkedAt:new Date().toISOString(),platform:process.platform,stacks:STACKS.map(s=>assessStack(s,tools)),
  explanation:'Missing host tools can be installed separately. The check never installs software or executes downloaded catalog code.'};
}
module.exports={TOOLS,STACKS,check,assessStack,version};
