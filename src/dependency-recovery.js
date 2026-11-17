'use strict';
// Persist only version-specific failures for the current platform and runtime.
// Generic connectivity, authentication and user cancellations must not poison
// a good version. Histories live outside Git checkouts and survive worktrees.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {redact}=require('./self-improvement');
const VERSION=/^\d+\.\d+\.\d+(?:\.\d+)?$/;
const NPM_NAME=/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i;
let pending=Promise.resolve();
function defaultFile(){return path.join(os.homedir(),'.atgv-aiatech-assist','dependency-history.json');}
function context(){return {platform:process.platform,arch:process.arch,nodeMajor:String(process.versions.node).split('.')[0]};}
async function read(file=defaultFile()){
 try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(!data||data.schema!==1||!Array.isArray(data.failures))throw Error('Invalid history');return data;}
 catch(e){if(e.code==='ENOENT')return {schema:1,failures:[]};throw Error('Cannot read dependency installation history: '+e.message);}
}
function record(entry,{file=defaultFile()}={}){
 const task=pending.catch(()=>{}).then(async()=>{
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const lock=file+'.lock';let locked=false;
  for(let n=0;n<100;n++){
   try{const handle=await fs.open(lock,'wx',0o600);await handle.close();locked=true;break;}
   catch(e){if(e.code!=='EEXIST')throw e;const st=await fs.stat(lock).catch(()=>null);if(st&&Date.now()-st.mtimeMs>60000)await fs.rm(lock,{force:true});else await new Promise(resolve=>setTimeout(resolve,100));}
  }
  if(!locked)throw Error('Dependency history is busy in another VS Code window. Retry the installation.');
  try{
   const data=await read(file),ctx=context();const item={manager:String(entry.manager||'').slice(0,20),package:String(entry.package||'').slice(0,180),version:String(entry.version||'').slice(0,100),error:redact(entry.error,3000),kind:String(entry.kind||'failure').slice(0,40),time:new Date().toISOString(),...ctx};
   if(!item.manager||!item.error)throw Error('Dependency failure requires a manager and error.');
   data.failures.push(item);const tmp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});await fs.rename(tmp,file);return item;
  }finally{await fs.rm(lock,{force:true}).catch(()=>{});}
 });pending=task;return task;
}
async function failedVersions(manager,name,{file=defaultFile()}={}){
 await pending.catch(()=>{});const data=await read(file),ctx=context();
 return new Set(data.failures.filter(x=>x.manager===manager&&x.package.toLowerCase()===String(name).toLowerCase()&&x.platform===ctx.platform&&x.arch===ctx.arch&&(manager!=='npm'||x.nodeMajor===ctx.nodeMajor)&&x.kind==='version'&&VERSION.test(x.version)).map(x=>x.version));
}
function parseFailure(manager,output){
 const text=String(output||'');if(/(?:ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|certificate|proxy|unauthorized|authentication|\bE401\b|\bE403\b)/i.test(text))return null;
 let match;
 if(manager==='npm'){
  if(/\bETARGET\b|\bnotarget\b/i.test(text))match=/No matching version found for\s+((?:@[\w.-]+\/)?[\w.-]+)@(\d+\.\d+\.\d+(?:\.\d+)?)/i.exec(text);
  else if(/\bEBADENGINE\b/i.test(text))match=/package\s*:\s*['"]((?:@[\w.-]+\/)?[\w.-]+)@(\d+\.\d+\.\d+(?:\.\d+)?)['"]/i.exec(text);
  if(match&&NPM_NAME.test(match[1]))return {package:match[1],version:match[2]};
 }
 if(manager==='dotnet'){
  match=/(?:NU1102[^\n]*?Unable to find package\s+([\w.-]+)\s+with version\s*\(\s*(?:>=\s*)?(\d+\.\d+\.\d+(?:\.\d+)?))|(?:NU1202[^\n]*?Package\s+([\w.-]+)\s+(\d+\.\d+\.\d+(?:\.\d+)?)\s+is not compatible)/i.exec(text);
  if(match)return {package:match[1]||match[3],version:match[2]||match[4]};
 }
 if(manager==='maven'){
  match=/(?:Could not find artifact|Could not resolve artifact)\s+([\w.-]+):([\w.-]+):(?:jar|pom|war|maven-plugin):(?:[\w.-]+:)?(\d+\.\d+\.\d+(?:\.\d+)?)/i.exec(text);
  if(match)return {package:match[1]+':'+match[2],version:match[3]};
 }
 return null;
}
function orderVersions(versions){
 return [...new Set((Array.isArray(versions)?versions:[versions]).map(String).filter(v=>VERSION.test(v)))].sort((a,b)=>{const aa=a.split('.').map(Number),bb=b.split('.').map(Number);for(let i=0;i<4;i++){const d=(bb[i]||0)-(aa[i]||0);if(d)return d;}return 0;});
}
function npmRange(input){const value=String(input||'').trim();return value.length<=150&&/^[0-9xXv.*~^<>=|+ -]+$/.test(value)?value:'';}
async function npmCandidates(name,range,{cwd,runner,env={},signal}={}){
 const safe=npmRange(range);if(!NPM_NAME.test(name)||!safe)throw Error('Cannot safely select an alternative for this npm dependency specification.');
 const {npmCommand}=require('./platform-process'),cmd=npmCommand(['view',name+'@'+safe,'version','--json']);
 const result=await runner(cmd.bin,cmd.args,{cwd,timeout:120000,maxBuffer:1024*1024,windowsHide:true,shell:false,signal,env:{...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0',...env}});
 let versions;try{versions=JSON.parse(String(result.stdout||'').trim());}catch{throw Error('The npm registry did not return a usable version list for '+name+'.');}
 if(versions&&typeof versions==='object'&&!Array.isArray(versions))versions=Object.values(versions).flatMap(x=>typeof x==='string'?x:Array.isArray(x)?x:[]);
 return orderVersions(versions);
}
function escapeRegex(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function rewriteManifest(manager,raw,name,from,to){
 if(!VERSION.test(from)||!VERSION.test(to)||from.split('.')[0]!==to.split('.')[0])throw Error('A replacement must stay within the original major version.');
 let count=0,result=String(raw);
 if(manager==='dotnet'){
  result=result.replace(/<PackageReference\b[^>]*(?:\/\s*>|>[\s\S]*?<\/PackageReference\s*>)/gi,block=>{
   if(!new RegExp('\\bInclude\\s*=\\s*["\']'+escapeRegex(name)+'["\']','i').test(block))return block;
   let changed=block.replace(/(\bVersion\s*=\s*["'])([^"']+)(["'])/i,(all,a,v,c)=>{if(v!==from)return all;count++;return a+to+c;});
   if(changed===block)changed=block.replace(/(<Version\s*>)([^<]+)(<\/Version\s*>)/i,(all,a,v,c)=>{if(v!==from)return all;count++;return a+to+c;});return changed;
  });
 }else if(manager==='maven'){
  const [group,artifact]=String(name).split(':');if(!group||!artifact)throw Error('Invalid Maven package name.');
  result=result.replace(/<(?:dependency|parent)>[\s\S]*?<\/(?:dependency|parent)>/gi,block=>{
   if(!new RegExp('<groupId>\\s*'+escapeRegex(group)+'\\s*<\\/groupId>','i').test(block)||!new RegExp('<artifactId>\\s*'+escapeRegex(artifact)+'\\s*<\\/artifactId>','i').test(block))return block;
   return block.replace(/(<version>\s*)([^<\s]+)(\s*<\/version>)/i,(all,a,v,c)=>{if(v!==from)return all;count++;return a+to+c;});
  });
 }else throw Error('Unsupported dependency manifest manager.');
 if(count!==1)throw Error('The dependency version cannot be safely changed in the selected manifest: '+name+'.');return result;
}
async function nativeManifests(cwd,manager){
 const files=[];
 async function walk(dir,depth){if(depth>4)return;for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){
  if(entry.isSymbolicLink()||['node_modules','bin','obj','target','.git'].includes(entry.name))continue;
  const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full,depth+1);else if(entry.isFile()&&(manager==='dotnet'?entry.name.endsWith('.csproj'):entry.name==='pom.xml'))files.push(full);
 }}
 await walk(cwd,0);const output=[];
 for(const full of files){const st=await fs.lstat(full);if(st.size>256000)continue;const raw=await fs.readFile(full,'utf8');
  if(manager==='dotnet')for(const match of raw.matchAll(/<PackageReference\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/PackageReference\s*>)/gi)){
   const name=match[1].match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1],version=match[1].match(/\bVersion\s*=\s*["']([^"']+)["']/i)?.[1]||(match[2]||'').match(/<Version\s*>([^<]+)<\/Version\s*>/i)?.[1];
   if(name&&VERSION.test(version||''))output.push({name,version,file:full});
  }
  if(manager==='maven')for(const match of raw.matchAll(/<(?:dependency|parent)>[\s\S]*?<\/(?:dependency|parent)>/gi)){
   const body=match[0],group=body.match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/i)?.[1],artifact=body.match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/i)?.[1],version=body.match(/<version>\s*([^<\s]+)\s*<\/version>/i)?.[1];
   if(group&&artifact&&VERSION.test(version||''))output.push({name:group+':'+artifact,version,file:full});
  }
 }
 return output;
}
async function nugetCandidates(name,{cwd,runner,signal}={}){
 if(!/^[a-z0-9_.-]+$/i.test(name))throw Error('Invalid NuGet package.');
 const result=await runner('dotnet',['package','search',name,'--exact-match','--format','json'],{cwd,timeout:120000,maxBuffer:4*1024*1024,windowsHide:true,shell:false,signal,env:{...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0'}});
 let data;try{data=JSON.parse(String(result.stdout||'').trim());}catch{throw Error('NuGet did not return a usable version list for '+name+'.');}
 const versions=[];for(const source of data.searchResult||[])for(const pkg of source.packages||[]){if(String(pkg.id||'').toLowerCase()!==name.toLowerCase())continue;versions.push(pkg.version,pkg.latestVersion);for(const v of pkg.versions||[])versions.push(typeof v==='string'?v:v.version);}
 return orderVersions(versions.filter(Boolean));
}
async function mavenCandidates(name,major,{cwd,runner,signal}={}){
 const parts=String(name).split(':');if(parts.length!==2||parts.some(x=>!/^[a-z0-9_.-]+$/i.test(x))||!/^\d+$/.test(String(major)))throw Error('Invalid Maven package.');
 const args=['-B','-ntp','org.apache.maven.plugins:maven-dependency-plugin:3.8.1:get','-Dartifact='+name+':['+major+','+(Number(major)+1)+')','-Dtransitive=false'];
 const options={cwd,timeout:180000,maxBuffer:4*1024*1024,windowsHide:true,shell:false,signal,env:{...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0'}};
 const {mavenCommand}=require('./platform-process');const command=mavenCommand(args);
 try{await runner(command.bin,command.args,options);}catch(e){if(signal?.aborted)throw e;}
 let local;try{const query=mavenCommand(['-q','help:evaluate','-Dexpression=settings.localRepository','-DforceStdout']);const r=await runner(query.bin,query.args,options);local=String(r.stdout||'').trim().split(/\r?\n/).pop();}catch{}
 if(!local||!path.isAbsolute(local))local=path.join(os.homedir(),'.m2','repository');
 const dir=path.join(local,...parts[0].split('.'),parts[1]),files=await fs.readdir(dir).catch(()=>[]),versions=[];
 for(const name of files.filter(x=>/^maven-metadata.*\.xml$/.test(x))){const raw=await fs.readFile(path.join(dir,name),'utf8').catch(()=>'');for(const m of raw.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/gi))versions.push(m[1]);}
 return orderVersions(versions);
}
async function applyNativeResolution(root,item,to,manager){
 const base=await fs.realpath(root),full=await fs.realpath(item.file);const rel=path.relative(base,full).replace(/\\/g,'/');if(!rel||rel.startsWith('../')||path.isAbsolute(rel))throw Error('Unsafe dependency manifest path.');
 const marker=path.join(base,'atgv.bootstrap.json'),oldMeta=await fs.readFile(marker,'utf8').catch(()=>null);if(!oldMeta)throw Error('Automatic version changes require an ATGV-managed starter. Review this dependency manually.');
 const meta=JSON.parse(oldMeta);if(!Array.isArray(meta.generatedFiles)||!meta.generatedFiles.includes(rel))throw Error('The affected manifest is not a verified generated starter file.');
 const raw=await fs.readFile(full,'utf8'),updated=rewriteManifest(manager,raw,item.name,item.version,to);const records=Array.isArray(meta.dependencyResolutions)?meta.dependencyResolutions:[];
 const prior=records.find(x=>x.path===rel&&x.manager===manager&&x.package===item.name);
 if(prior){if(prior.to!==item.version)throw Error('The stored dependency resolution no longer matches the manifest.');prior.to=to;}
 else records.push({path:rel,manager,package:item.name,from:item.version,to});
 meta.dependencyResolutions=records;await fs.writeFile(full,updated);try{await fs.writeFile(marker,JSON.stringify(meta,null,2)+'\n');}catch(e){await fs.writeFile(full,raw).catch(()=>{});throw e;}
 return {path:rel,from:item.version,to};
}
module.exports={defaultFile,context,read,record,failedVersions,parseFailure,orderVersions,npmCandidates,npmRange,rewriteManifest,nativeManifests,nugetCandidates,mavenCandidates,applyNativeResolution};
