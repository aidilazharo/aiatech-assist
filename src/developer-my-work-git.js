'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),naming=require('./repo-sync-pr'),api=require('./repo-sync-github-api'),gitRepo=require('./developer-git');
const targets=['extension','library','project'];
function target(value){if(!targets.includes(value)&&!/^project:[a-f0-9]{64}$/.test(String(value)))throw Error('Select a supported Developer repository.');return value;}
const folderTarget=label=>'project:'+crypto.createHash('sha256').update(label).digest('hex');
async function projectFolders(projectRoot){
 const root=await fs.realpath(projectRoot),parent=path.join(root,'repository');
 const stat=await fs.lstat(parent).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return [];
 if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(parent)!==parent)throw Error('Unsafe project repository parent.');
 const entries=await fs.readdir(parent,{withFileTypes:true});
 const folders=[];
 if(entries.some(e=>e.name==='.git'))folders.push({target:folderTarget('.'),label:'repository',root:parent});
 for(const entry of entries){
  if(!entry.isDirectory()||entry.isSymbolicLink()||entry.name.startsWith('.')||/^(?:node_modules|dist|build|coverage|vendor|__pycache__)$/i.test(entry.name))continue;
  const folder=path.join(parent,entry.name),st=await fs.lstat(folder).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!st?.isDirectory()||st.isSymbolicLink()||await fs.realpath(folder).catch(e=>e.code==='ENOENT'?'':Promise.reject(e))!==folder)continue;
  folders.push({target:folderTarget(entry.name),label:entry.name,root:folder});
 }
 return folders.sort((a,b)=>a.label.localeCompare(b.label));
}
async function selectProjectFolder(projectRoot,kind,preferred=[]){
 const folders=await projectFolders(projectRoot);
 const selected=kind==='project'?preferred.map(value=>folders.find(x=>x.target===value||x.root===value||x.label===value)).find(Boolean)||folders[0]:folders.find(x=>x.target===target(kind));
 if(!selected)throw Error(kind==='project'?'No project repository folders found.':'Selected project folder is no longer available. Refresh the repository list.');
 return selected;
}
function branchName(value){const name=String(value||'').trim();if(!/^(?:feat|fix|refactor|docs|test|chore|perf|build|ci|style)\/[a-z0-9][a-z0-9-]{1,75}$/.test(name))throw Error('Use a branch such as fix/runtime-startup or feat/customer-search.');return name;}
async function git(root,args,token=''){
 try{const {stdout}=await exec('git',['-C',root,...args],{timeout:60000,maxBuffer:4*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',...(token?naming.patEnvironment(token):{})}});return String(stdout||'').trim();}
 catch(error){throw Error('Git '+args[0]+' failed. Review the repository and Git credentials ('+String(error.code||'error')+').');}
}
async function verifiedRoot(root,expected){
 const local=await gitRepo.repository(root),remote=naming.githubUrl(local.remote,{origin:true});
 if(remote.name.toLowerCase()!==expected.name.toLowerCase())throw Error('Local origin does not match the selected repository.');
 if(!local.branch||!local.sha)throw Error('A committed, non-detached checkout is required.');
 const push=await git(local.root,['remote','get-url','--push','--all','origin']);
 if(push.split('\n').length!==1||naming.githubUrl(push,{origin:true}).name.toLowerCase()!==expected.name.toLowerCase())throw Error('Push origin differs from selected repository.');
 return local;
}
// Managed source directories can be empty, contain a direct checkout, or contain
// a clone in an immediate child. Never adopt a surrounding workspace's Git root.
async function managedSource(root,expected,{verify=verifiedRoot}={}){
 const stat=await fs.lstat(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe managed source folder.');
 const canonical=await fs.realpath(root);
 const check=async candidate=>{
  try{
   const local=await verify(candidate,expected);
   return path.resolve(local.root)===path.resolve(candidate)?local:null;
  }catch{return null;}
 };
 const direct=await check(canonical);
 if(direct)return {root:direct.root,repo:expected,local:direct};
 const entries=await fs.readdir(canonical,{withFileTypes:true});
 const matches=[];
 for(const entry of entries.filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&!e.name.startsWith('.')&&!/^(node_modules|dist|build|vendor|coverage)$/i.test(e.name)).slice(0,100)){
  const child=path.join(canonical,entry.name);
  const st=await fs.lstat(child).catch(()=>null);
  if(!st?.isDirectory()||st.isSymbolicLink()||await fs.realpath(child).catch(()=>null)!==child)continue;
  const marker=await fs.lstat(path.join(child,'.git')).catch(()=>null);
  if(!marker||marker.isSymbolicLink())continue;
  const local=await check(child);
  if(local)matches.push(local);
 }
 if(matches.length===1)return {root:matches[0].root,repo:expected,local:matches[0]};
 return {root:canonical,repo:null,local:null,gitNotice:matches.length>1?'Multiple matching checkouts; open the folder and select one.':'No verified Git checkout. Open the folder to inspect or clone the configured source.'};
}
function safeStaged(name){
 return !!name&&!/(?:^|\/)(?:\.git|\.atgv|node_modules|dist|coverage|\.env(?:\.[^/]*)?|\.npmrc|credentials\.json|id_rsa|id_ed25519)(?:\/|$)/i.test(name)&&!/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name);
}
function stage(state,local){
 if(!state||state.branch!==local.branch)return {step:'branch',percent:0};
 if(state.published&&state.sha===local.sha&&local.clean)return {step:'done',percent:100};
 if(state.pr&&state.sha===local.sha&&local.clean)return {step:'publish',percent:75};
 if(state.sha===local.sha&&local.clean)return {step:'pr',percent:50};
 return {step:'commit',percent:25};
}
async function act({root,repo,token,state={},action,value,confirm=async()=>false}){
 const local=await verifiedRoot(root,repo),remote=await api.getRepository(repo,token),base=remote.defaultBranch;
 if(action==='branch'){
  const branch=branchName(value);
  if(!local.clean||local.branch!==base)throw Error('Start from a clean default branch before creating a work branch.');
  if(!await confirm('Create '+branch+' from '+base+' in '+repo.name+'?'))return state;
  await git(root,['fetch','--no-tags','origin',base],token);
  if(await git(root,['rev-parse','HEAD'])!==await git(root,['rev-parse','FETCH_HEAD']))throw Error('Local default branch differs from GitHub. Synchronize it before creating a branch.');
  await git(root,['switch','-c',branch]);return {branch,base};
 }
 if(!state.branch||local.branch!==state.branch||local.branch===base||state.base!==base)throw Error('Create or resume the selected work branch first.');
 if(action==='commit'){
  const message=String(value||'').trim();
  if(!message||message.length>180||/[\r\n\x00-\x1f]/.test(message))throw Error('Enter a concise commit message.');
  const names=(await git(root,['diff','--cached','--name-only','-z','--no-renames'])).split('\0').filter(Boolean);
  if(!names.length||names.some(name=>!safeStaged(name)))throw Error('Stage the intended safe source files in VS Code Source Control first.');
  if(!await confirm('Commit '+names.length+' staged file(s) to '+local.branch+'?'))return state;
  await git(root,['commit','-m',message]);
  return {branch:local.branch,base,sha:await git(root,['rev-parse','HEAD']),message};
 }
 if(!local.clean||state.sha!==local.sha)throw Error('Commit the remaining source changes before continuing.');
 if(action==='pr'){
  const title=String(value||state.message||'').trim().slice(0,120);
  if(!title)throw Error('Enter a pull request title.');
  if(!await confirm('Push '+local.branch+' and create a pull request into '+base+' on '+repo.name+'?'))return state;
  await git(root,['push','origin','HEAD:refs/heads/'+local.branch],token);
  const pr=await api.findOpenPr(repo,token,{branch:local.branch,base})||await api.createPr(repo,token,{branch:local.branch,base,title,body:'ATGV Developer My Work. Review the committed source and required checks before publishing.'});
  return {...state,pr,published:false};
 }
 if(action==='publish'){
  if(!state.pr||state.published)throw Error('Create an open pull request before publishing.');
  const number=api.safePrUrl(repo,state.pr).split('/').pop();
  const result=await api.githubRequest(repo,token,'GET','/pulls/'+number),pr=result.body;
  if(result.status!==200||pr?.state!=='open'||pr.head?.sha!==local.sha||pr.head?.ref!==local.branch||pr.base?.ref!==base||String(pr.head?.repo?.full_name||'').toLowerCase()!==repo.name.toLowerCase())throw Error('PR identity or head changed. Refresh and review before publishing.');
  if(pr.mergeable!==true||pr.mergeable_state!=='clean')throw Error('GitHub has not verified this PR as clean and mergeable. Complete reviews/checks first.');
  if(!await confirm('Publish by merging PR #'+number+' into '+base+' on '+repo.name+'?'))return state;
  const merged=await api.githubRequest(repo,token,'PUT','/pulls/'+number+'/merge',{sha:local.sha,merge_method:'merge'});
  if(merged.status!==200||merged.body?.merged!==true)throw Error('GitHub did not merge the PR. Review branch rules, required checks and permissions.');
  return {...state,published:true,mergeSha:merged.body.sha||''};
 }
 throw Error('Unknown Developer Git action.');
}
// Only allowlisted technical signatures cross the Confluence boundary. No raw
// command output, paths, credentials, customer data, or other project data.
const signatures=[
 ['npm dependency / lockfile',/npm (?:err|error)|npm ci|ERESOLVE|EBADPLATFORM|ELOCKVERIFY/i],
 ['Maven dependency / build',/maven|\bmvn\b|Could not resolve dependencies/i],
 ['GitHub / Git access',/github|git push|git clone|git fetch/i],
 ['Jira / Confluence access',/jira|confluence|atlassian/i],
 ['Runtime / HTTP readiness',/ECONNREFUSED|EADDRINUSE|server startup|HTTP health|runtime check/i],
 ['Tests / assertions',/assertion|tests? fail|test suite|TDD/i],
 ['Permissions / authentication',/forbidden|unauthorized|permission denied|HTTP 40[13]/i],
 ['Network / timeout',/ETIMEDOUT|ENOTFOUND|timeout|timed out|DNS/i],
 ['Compilation / build',/compilation failed|build failed|syntaxerror|typescript error/i]
];
function summarize(content){
 const lines=String(content||'').slice(-500000).split(/\r?\n/).filter(x=>/error|fail|exception|denied|timeout|unable|cannot|ERESOLVE|EBADPLATFORM|ECONNREFUSED|EADDRINUSE|ENOTFOUND/i.test(x));
 return signatures.map(([label,pattern])=>({label,count:lines.filter(x=>pattern.test(x)).length})).filter(x=>x.count).sort((a,b)=>b.count-a.count);
}
const marker='ATGV_DEVELOPER_LOG_V1:';
function safeRows(rows){return (Array.isArray(rows)?rows:[]).filter(x=>signatures.some(([label])=>label===x?.label)&&Number.isSafeInteger(x.count)&&x.count>0&&x.count<=100000).slice(0,20);}
function decode(body){const match=new RegExp(marker+'([A-Za-z0-9+/=]+)').exec(String(body||''));if(!match||match[1].length>50000)throw Error('Unrecognized unified diagnostic page.');const v=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));if(v.schema!==1||!v.sources||typeof v.sources!=='object'||Array.isArray(v.sources))throw Error('Invalid diagnostic page.');return v;}
async function syncLogs({config,token,project,content,source,request,spaceProvider,site}){
 if(!/^[A-Z][A-Z0-9_]{0,29}$/.test(project))throw Error('Valid Jira project key required.');
 const title='ATGV Unified Diagnostic Log ['+project+']',space=await spaceProvider(config,token),auth={token,basicEmail:config.get('jira.email')};
 const rows=summarize(content),id=crypto.createHash('sha256').update(String(source)).digest('hex').slice(0,20);
 for(let attempt=0;attempt<3;attempt++){
  const index=await request(site+'/api/v2/pages?space-id='+encodeURIComponent(space.id)+'&title='+encodeURIComponent(title)+'&status=current&limit=100',auth);
  const matches=(index.results||[]).filter(x=>x.title===title&&x.status!=='trashed');if(matches.length>1)throw Error('Duplicate unified diagnostic pages.');
  let full=null,record={schema:1,sources:{}};
  if(matches.length){full=await request(site+'/api/v2/pages/'+encodeURIComponent(matches[0].id)+'?body-format=storage',auth);if(full.title!==title||String(full.spaceId)!==String(space.id))throw Error('Diagnostic page identity mismatch.');record=decode(full.body?.storage?.value);}
  const old=record.sources[id],changed=rows.length>0&&JSON.stringify(safeRows(old?.rows))!==JSON.stringify(rows);
  if(changed){record.sources[id]={rows,at:new Date().toISOString()};const ordered=Object.entries(record.sources).filter(([k,v])=>/^[a-f0-9]{20}$/.test(k)&&v&&Array.isArray(v.rows)).sort((a,b)=>String(b[1].at).localeCompare(String(a[1].at))).slice(0,25);record.sources=Object.fromEntries(ordered);}
  const merged=new Map();for(const v of Object.values(record.sources))for(const row of safeRows(v.rows))merged.set(row.label,(merged.get(row.label)||0)+row.count);
  const priorities=[...merged].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
  if(!changed)return {available:true,priorities,title,uploaded:false};
  const body='<p>Sanitized unified diagnostic signatures. Raw logs remain local.</p>'+priorities.map(x=>'<p>'+x.label+': '+x.count+'</p>').join('')+'<p>'+marker+Buffer.from(JSON.stringify(record)).toString('base64')+'</p>';
  try{if(full)await request(site+'/api/v2/pages/'+encodeURIComponent(full.id),{...auth,method:'PUT',data:{id:full.id,status:'current',title,body:{representation:'storage',value:body},version:{number:Number(full.version.number)+1,message:'ATGV diagnostic synchronization'}}});else await request(site+'/api/v2/pages',{...auth,method:'POST',data:{spaceId:String(space.id),status:'current',title,body:{representation:'storage',value:body}}});return {available:true,priorities,title,uploaded:true};}
  catch(err){if(!/HTTP (409|412)/.test(String(err.message))||attempt===2)throw err;}
 }
}
module.exports={target,projectFolders,selectProjectFolder,branchName,verifiedRoot,managedSource,stage,safeStaged,act,summarize,syncLogs};
