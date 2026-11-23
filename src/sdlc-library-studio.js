'use strict';
// Library Studio: data-only catalog resources, isolated local overlays and PRs.
// Never execute downloaded JavaScript, workflows or AI instructions.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const acorn=require('./vendor/acorn');
const {parseRepository}=require('./github-sdlc-catalog');
const CATEGORIES={roles:'SDLC Skills','ai-harness':'AI Harness',sdlc:'SDLC Templates','tech-stacks':'Technology Stacks',shared:'Design Systems',integrations:'Integrations',libraries:'Libraries',tests:'Testing',schemas:'Schemas',scripts:'Utilities'};
const EXT=/\.(?:md|json|ya?ml|txt|html|css|xml|mjs|js|jsx|ts|tsx|cs|java|sql)$/i;
const MAX_FILE=128*1024;
const hash=text=>crypto.createHash('sha256').update(String(text||'')).digest('hex');
function validResource(relative){
 if(typeof relative!=='string'||relative.length>300||relative.includes('\\')||relative.includes('\0')||relative.startsWith('/')||relative.includes('//'))throw Error('Invalid library resource path.');
 const parts=relative.split('/');
 if(parts.length<2||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||!Object.hasOwn(CATEGORIES,parts[0])||!EXT.test(relative))throw Error('Unsupported library resource path.');
 if(parts.some(p=>!/^[a-zA-Z0-9._-]+$/.test(p)))throw Error('Invalid library resource path component.');
 return relative;
}
function customResource(relative){
 validResource(relative);
 return /^ai-harness\/skills\/custom\/[a-z][a-z0-9-]{0,60}\/SKILL\.md$/.test(relative)
   ||/^sdlc\/document-templates\/custom\/[a-z][a-z0-9-]{0,60}\.md$/.test(relative);
}
function category(relative){
 const prefix=String(relative).split('/')[0];
 if(prefix==='ai-harness'&&relative.includes('/skills/'))return 'AI Skills';
 if(prefix==='shared')return 'Design Systems';
 if(prefix==='roles')return 'SDLC Skills';
 if(prefix==='sdlc'&&relative.includes('document-templates'))return 'SDLC Templates';
 return CATEGORIES[prefix]||'Other';
}
function name(relative){return relative.split('/').at(-1)==='SKILL.md' ? relative.split('/').at(-2) : relative.split('/').at(-1);}
function safeRepo(repositoryUrl){
 const parsed=parseRepository(repositoryUrl);
 if(!parsed)throw Error('Configure a GitHub Library repository first.');
 return parsed;
}
async function checkedRead(root,relative){
 validResource(relative);
 const base=path.resolve(root),parts=relative.split('/');let cursor=base;
 for(let i=0;i<parts.length;i++){
  cursor=path.join(cursor,parts[i]);
  const stat=await fs.lstat(cursor).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!stat)return null;
  if(stat.isSymbolicLink()||(i<parts.length-1&&!stat.isDirectory())||(i===parts.length-1&&(!stat.isFile()||stat.size>MAX_FILE)))throw Error('Unsafe library file: '+relative);
 }
 return fs.readFile(cursor,'utf8');
}
async function checkedWrite(root,relative,body){
 validResource(relative);
 if(typeof body!=='string'||Buffer.byteLength(body,'utf8')>MAX_FILE)throw Error('Resource exceeds 128 KiB limit.');
 const base=path.resolve(root);await fs.mkdir(base,{recursive:true});
 let cursor=base;
 for(const segment of relative.split('/').slice(0,-1)){
  cursor=path.join(cursor,segment);
  const st=await fs.lstat(cursor).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(st&&(!st.isDirectory()||st.isSymbolicLink()))throw Error('Unsafe library override directory.');
  if(!st)await fs.mkdir(cursor);
 }
 const dest=path.join(base,...relative.split('/'));
 const st=await fs.lstat(dest).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(st&&(!st.isFile()||st.isSymbolicLink()))throw Error('Unsafe library override file.');
 const tmp=dest+'.'+crypto.randomUUID()+'.tmp';
 await fs.writeFile(tmp,body,{flag:'wx',mode:0o600});
 try{await fs.rename(tmp,dest);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
function storageRoot({storage,workspace,repositoryUrl,scope='user'}){
 const {owner,repo}=safeRepo(repositoryUrl);
 if(scope==='project'){
  if(!workspace)throw Error('Open a project workspace for project overrides.');
  return path.join(workspace,'.atgv','library-overrides');
 }
 if(scope!=='user')throw Error('Invalid library scope.');
 return path.join(storage,'sdlc-library-studio',owner.toLowerCase()+'--'+repo.toLowerCase(),'user');
}
async function walk(root,{maxFiles=2400}={}){
 const output=[],queue=Object.keys(CATEGORIES).map(dir=>({abs:path.join(root,dir),relative:dir}));
 while(queue.length&&output.length<maxFiles){
  const item=queue.shift();
  const stat=await fs.lstat(item.abs).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!stat||!stat.isDirectory()||stat.isSymbolicLink())continue;
  for(const ent of await fs.readdir(item.abs,{withFileTypes:true})){
   if(ent.isSymbolicLink()||ent.name.startsWith('.')||ent.name==='node_modules'||ent.name==='dist')continue;
   const relative=item.relative+'/'+ent.name;
   if(ent.isDirectory()){
    if(relative.split('/').length<12)queue.push({abs:path.join(item.abs,ent.name),relative});
   }else if(ent.isFile()&&EXT.test(relative)){
    try{validResource(relative);const st=await fs.lstat(path.join(item.abs,ent.name));if(st.size<=MAX_FILE)output.push({path:relative,category:category(relative),name:name(relative),bytes:st.size});}catch{}
   }
   if(output.length>=maxFiles)break;
  }
 }
 return output;
}
// Curated Library Studio view: show actionable resource definitions by default.
// Supporting docs, examples, vendor assets and scripts stay on disk and remain
// available using the explicit "Show supporting files" option.
function primaryResource(relative){
 if(/^roles\/[^/]+\/SKILL\.md$/.test(relative))return true;
 if(/^ai-harness\/skills\/(?:[^/]+\/)*(?:SKILL\.md|skill\.json)$/.test(relative))return true;
 if(/^ai-harness\/(?:agents|workflows|policies|contracts|context|tools|evals)\/[^/]+\.json$/.test(relative))return true;
 if(relative==='ai-harness/manifest.json')return true;
 if(/^sdlc\/(?:document-templates|processes|workflows|schemas)\/.+\.(?:md|json|ya?ml)$/.test(relative))return true;
 if(/^shared\/document-templates\/.+\.md$/.test(relative))return true;
 if(/^shared\/design-systems\/[^/]+\/(?:AI-GUIDANCE\.md|tokens\.json|mockup-template\.html)$/.test(relative))return true;
 if(/^shared\/design-systems\/[^/]+\/kit\/(?:ai\/component-catalog\.json|tokens\/tokens\.json)$/.test(relative))return true;
 if(/^tech-stacks\/[^/]+\/stack\.json$/.test(relative))return true;
 if(/^tech-stacks\/[^/]+\/scaffold\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative))return true;
 if(/^tech-stacks\/[^/]+\/scaffold\/.+\.(?:json|ts|tsx|js|mjs|cs|java|sql|css|html)$/.test(relative)&&!/\/(?:README|CHANGELOG|AGENTS)\.md$/i.test(relative))return true;
 if(/^tests\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative))return true;
 if(/^integrations\/.+\.(?:json|ya?ml)$/.test(relative))return true;
 if(/^libraries\/.+\.(?:json|ya?ml)$/.test(relative))return true;
 return false;
}
async function listing({root,storage,workspace,repositoryUrl,query='',type='All',limit=250,includeSupporting=false}){
 if(!root)throw Error('Pull the GitHub Library in Settings first.');
 const scopes=['user',...(workspace?['project']:[])];
 const sources=await Promise.all([walk(root),...scopes.map(scope=>walk(storageRoot({storage,workspace,repositoryUrl,scope})))]);
 const merged=new Map();
 for(let i=0;i<sources.length;i++)for(const item of sources[i]){
  const entry=merged.get(item.path)||item;
  if(i>0)entry[scopes[i-1]+'Override']=true;
  merged.set(item.path,entry);
 }
 const text=String(query||'').trim().toLowerCase().slice(0,100);
 const results=[...merged.values()].filter(item=>(type==='Supporting Files'?(!primaryResource(item.path)&&!item.userOverride&&!item.projectOverride):(includeSupporting||primaryResource(item.path)||item.userOverride||item.projectOverride)&&(type==='All'||item.category===type))&&(!text||item.path.toLowerCase().includes(text))).sort((a,b)=>a.category.localeCompare(b.category)||a.path.localeCompare(b.path));
 return {items:results.slice(0,Math.min(Math.max(Number(limit)||250,1),1000)),total:results.length,categories:[...new Set([...Object.values(CATEGORIES),'AI Skills','SDLC Templates','Supporting Files'])].sort()};
}
async function resource({root,storage,workspace,repositoryUrl,relative,scope='user'}){
 validResource(relative);
 const shared=root?await checkedRead(root,relative):null;
 const userRoot=storageRoot({storage,workspace,repositoryUrl,scope:'user'});
 const projectRoot=workspace?storageRoot({storage,workspace,repositoryUrl,scope:'project'}):null;
 const user=await checkedRead(userRoot,relative);
 const project=projectRoot?await checkedRead(projectRoot,relative):null;
 const edit=scope==='project'?project:user;
 const content=edit??shared??'';
 if(shared===null&&user===null&&project===null&&!customResource(relative))throw Error('Resource not found in the verified catalog.');
 const meta=await checkedRead(storageRoot({storage,workspace,repositoryUrl,scope}),relative+'.meta.json').catch(()=>null);
 const parsed=meta?JSON.parse(meta):{};
 return {path:relative,category:category(relative),shared,content,local:edit,hasLocal:edit!==null,hasUser:user!==null,hasProject:project!==null,scope,hash:hash(content),sharedHash:shared===null?'':hash(shared),baseHash:String(parsed.baseHash||''),savedAt:String(parsed.savedAt||''),updateAvailable:edit!==null&&!!parsed.baseHash&&shared!==null&&parsed.baseHash!==hash(shared),source:edit!==null?scope:'shared'};
}
function validateResource(relative,content){
 validResource(relative);
 if(typeof content!=='string'||!content.trim())throw Error('Resource cannot be empty.');
 if(Buffer.byteLength(content,'utf8')>MAX_FILE)throw Error('Resource exceeds the 128 KiB limit.');
 const diagnostics=[];
 const add=(message,severity='warning',line=0,column=0)=>diagnostics.push({message,severity,line,column});
 if(/\.json$/i.test(relative)){
  let data;
  try{data=JSON.parse(content);}catch(e){const err=Error('Invalid JSON: '+e.message);const match=/line (\d+) column (\d+)/i.exec(e.message);if(match){err.line=Number(match[1]);err.column=Number(match[2]);}throw err;}
  if(data===null||typeof data!=='object')throw Error('JSON resource must contain an object or array.');
  if(/^ai-harness\/agents\/[^/]+\.json$/.test(relative) && (!data.id||typeof data.id!=='string'))throw Error('AI Harness agent requires a non-empty id.');
  if(/^ai-harness\/skills\/.+\/skill\.json$/.test(relative)&&(!data.id||!data.version))add('Skill metadata should include id and version; GitHub Actions will check the full schema.');
 }else if(/\.(?:js|mjs)$/i.test(relative)){
  try{acorn.parse(content,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});}
  catch(e){const error=Error('JavaScript syntax: '+e.message);error.line=e.loc?.line||0;error.column=(e.loc?.column??-1)+1;throw error;}
 }else if(/\.(?:ya?ml)$/i.test(relative)){
  const lines=content.split(/\r?\n/);const seenAtIndent=new Map();
  for(let i=0;i<lines.length;i++){
   const line=lines[i],stripped=line.trim();if(!stripped||stripped.startsWith('#')||stripped==='---'||stripped==='...')continue;
   if(/^\s*\t/.test(line)) {const error=Error('YAML indentation must use spaces, not tabs (line '+(i+1)+').');error.line=i+1;throw error;}
   // Common YAML mapping diagnostics. Nested YAML, folded scalars and templates
   // are deliberately not parsed as full YAML; comprehensive CI remains required.
   // Repeated mapping keys are legal in separate YAML sequence entries.
   if(/^ *-\s/.test(line))seenAtIndent.clear();
   const map=/^( *)([a-zA-Z_][a-zA-Z0-9_.-]*):(?:\s|$)/.exec(line);
   if(map){const depth=map[1].length;for(const n of [...seenAtIndent.keys()])if(n>depth)seenAtIndent.delete(n);
    if(!seenAtIndent.has(depth))seenAtIndent.set(depth,new Set());
    if(seenAtIndent.get(depth).has(map[2])){const error=Error('Duplicate YAML mapping key "'+map[2]+'" at line '+(i+1)+'.');error.line=i+1;throw error;}
    seenAtIndent.get(depth).add(map[2]);
   }
  }
  add('Basic YAML checks passed; full YAML/schema validation runs in catalog CI.');
 }else if(/\.(?:ts|tsx|jsx)$/i.test(relative)){
  add('TypeScript/JSX syntax is highlighted; complete parser and type checks require the stack build or CI.');
 }else if(/\.(?:css|html|xml|cs|java|sql)$/i.test(relative)){
  add('Full syntax/build validation for this file type runs in the corresponding technology-stack CI.');
 }
 if(relative.endsWith('/SKILL.md')&&content.trim().length<20)throw Error('Skill instructions are too short.');
 return {valid:true,diagnostics};
}
function validateBody(relative,content){validateResource(relative,content);return true;}

async function save({root,storage,workspace,repositoryUrl,relative,scope='user',content,expectedHash}){
 validateBody(relative,content);
 const state=await resource({root,storage,workspace,repositoryUrl,relative,scope});
 if(expectedHash!==state.hash)throw Error('The resource changed since opening. Reload and compare before saving.');
 const base=storageRoot({storage,workspace,repositoryUrl,scope});
 await checkedWrite(base,relative,content);
 const meta={baseHash:state.baseHash||state.sharedHash,savedAt:new Date().toISOString(),sourceSha:state.sharedHash};
 await checkedWrite(base,relative+'.meta.json',JSON.stringify(meta,null,2)+'\n');
 return resource({root,storage,workspace,repositoryUrl,relative,scope});
}
async function revert({root,storage,workspace,repositoryUrl,relative,scope='user',expectedHash}){
 const state=await resource({root,storage,workspace,repositoryUrl,relative,scope});
 if(expectedHash!==state.hash)throw Error('The resource changed since opening. Reload before restoring.');
 if(!state.hasLocal)return state;
 const base=storageRoot({storage,workspace,repositoryUrl,scope});
 for(const suffix of ['', '.meta.json']){
  const file=path.join(base,...(relative+suffix).split('/'));
  const st=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(st){if(st.isSymbolicLink()||!st.isFile())throw Error('Unsafe resource override.');await fs.rm(file);}
 }
 return resource({root,storage,workspace,repositoryUrl,relative,scope});
}
async function resolvedText({root,storage,workspace,repositoryUrl,relative}){
 const p=await resource({root,storage,workspace,repositoryUrl,relative,scope:workspace?'project':'user'});
 const user=await checkedRead(storageRoot({storage,workspace,repositoryUrl,scope:'user'}),relative);
 return {text:p.local??user??p.shared??'',source:p.hasProject?'project':user!==null?'user':'shared',sha256:hash(p.local??user??p.shared??'')};
}
// Explicitly approved user action; write operations use the VS Code GitHub session,
// never the read-only catalog token. They cannot modify main directly.
async function githubPullRequest({repositoryUrl,relative,content,baseHash,token,title}){
 validResource(relative);validateBody(relative,content);
 if(!token)throw Error('GitHub write authorization is required. Sign in with the GitHub repository scope.');
 const {owner,repo}=safeRepo(repositoryUrl),base=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
 const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ATGV-Library-Studio'};
 async function api(endpoint,method='GET',data){
  const response=await fetch(base+endpoint,{method,headers:{...headers,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  const raw=await response.text();let obj={};try{obj=JSON.parse(raw);}catch{}
  if(!response.ok){const error=Error(`GitHub ${response.status}: ${String(obj.message||'Request failed').slice(0,260)}`);error.status=response.status;throw error;}
  return obj;
 }
 const repoInfo=await api('');
 if(repoInfo.default_branch!=='main')throw Error('The shared catalog repository must use main as its default branch.');
 const encoded=relative.split('/').map(encodeURIComponent).join('/');
 let latest=null;
 try{latest=await api(`/contents/${encoded}?ref=main`);}catch(e){if(e.status!==404)throw e;}
 if(latest&&latest.type!=='file')throw Error('Target is not a file in GitHub main.');
 const upstream=latest?.content?Buffer.from(latest.content.replace(/\s/g,''),'base64').toString('utf8'):null;
 if(latest&&baseHash&&hash(upstream)!==baseHash)throw Error('Shared resource changed in GitHub main. Pull and compare the latest version before contributing.');
 if(!latest&&!customResource(relative))throw Error('New contribution paths must be custom skills or document templates.');
 if(upstream===content)throw Error('There are no changes to contribute.');
 const main=await api('/git/ref/heads/main');
 const branch='atgv/library-'+path.basename(relative).replace(/[^a-z0-9]/gi,'-').toLowerCase().slice(0,25)+'-'+crypto.randomUUID().slice(0,8);
 await api('/git/refs','POST',{ref:'refs/heads/'+branch,sha:main.object.sha});
 const message='library: update '+relative;
 await api(`/contents/${encoded}`,'PUT',{message,content:Buffer.from(content).toString('base64'),branch,...(latest?{sha:latest.sha}:{})});
 const pr=await api('/pulls','POST',{title:String(title||'Library: '+relative).slice(0,180),head:branch,base:'main',draft:true,body:`## ATGV SDLC Library contribution\n\nResource: \`${relative}\`\n\nLocal validation: syntax and resource type verified.\n\n**Review required:** CI and GitHub Actions must validate this contribution before merge. Runtime safety checks, TDD constraints and locked tests are not changed by this library update.\n`});
 return {url:pr.html_url,number:pr.number,branch,status:'draft',message:'Draft PR created. GitHub Actions and maintainer review are still required.'};
}
module.exports={category,validResource,customResource,validateResource,validateBody,hash,walk,primaryResource,listing,resource,save,revert,resolvedText,storageRoot,githubPullRequest};
