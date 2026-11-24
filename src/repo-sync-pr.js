'use strict';
// Repo A selected branch -> Repo B Git checkout, using independent PATs for each repository.
// GitHub credentials are supplied only through subprocess environments, never Git URLs or command arguments.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const githubApiDefault=require('./repo-sync-github-api');
const exec=promisify(execFile);
const MAX_FILES=6000,MAX_BYTES=100*1024*1024,MAX_SINGLE_FILE=20*1024*1024;
const OWNER=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO=/^[A-Za-z0-9_.-]{1,100}$/;
const BASE=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,110}$/;
function githubUrl(value,{origin=false}={}){
 const raw=String(value||'').trim();
 let match=/^https:\/\/github\.com\/([^/?#\s]+)\/([^/?#\s]+?)\/?$/i.exec(raw);
 if(!match&&origin)match=/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+)$/i.exec(raw);
 if(!match)throw Error('Expected a GitHub repository URL: https://github.com/OWNER/REPO');
 const owner=match[1],repo=match[2].replace(/\.git$/i,'');
 if(!OWNER.test(owner)||!REPO.test(repo)||repo==='.'||repo==='..')throw Error('Invalid GitHub repository owner or name.');
 return {owner,repo,name:owner+'/'+repo,url:'https://github.com/'+owner+'/'+repo+'.git'};
}
function baseName(input){
 const name=String(input||'').trim();
 if(!BASE.test(name)||name.includes('..')||name.includes('//')||name.endsWith('/')||name.includes('@{'))throw Error('Invalid destination PR base branch.');
 return name;
}
function scopeName(input){
 const value=String(input||'.').trim().replace(/\\/g,'/');
 if(!value||value==='.')return '.';
 if(value.length>280||value.startsWith('/')||/^[A-Za-z]:/.test(value)||value.includes('\0'))throw Error('Copy scope must be a short relative path.');
 const segments=value.split('/');
 if(segments.some(s=>!s||s==='.'||s==='..'||s.includes(':')))throw Error('Copy scope cannot contain parent traversal or unsafe segments.');
 if(!isAllowedPath(value))throw Error('Copy scope includes protected Git, credential or generated paths.');
 return value;
}
const BLOCKED_DIRS=new Set(['.git','.github','node_modules','dist','build','coverage','.atgv','.venv','venv','.next','.cache','tmp','temp']);
const BLOCKED_FILES=new Set(['action.yml','action.yaml','.env','.npmrc','.pypirc','id_rsa','id_ed25519','credentials.json']);
function isAllowedPath(relative){
 const segments=String(relative||'').replace(/\\/g,'/').split('/');
 if(segments.some(s=>!s||s==='.'||s==='..'||BLOCKED_DIRS.has(s.toLowerCase())))return false;
 const lower=segments.map(s=>s.toLowerCase()),name=lower[lower.length-1];
 if(BLOCKED_FILES.has(name)||name.startsWith('.env.')||/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name))return false;
 return true;
}
// Prefer the actual Repo A commit intent. File names are a factual fallback
// for generic upstream messages such as "Sync tech-stacks-skills from main".
function commitSubject(message){
 const line=String(message||'').split(/\r?\n/).map(x=>x.trim()).find(Boolean)||'';
 return cleanAiField(line,110).replace(/\s+/g,' ');
}
function actionText(message){
 return commitSubject(message).replace(/^(?:feat|fix|docs|chore|ci|refactor|test|perf|build|style|revert)(?:\([^)]+\))?!?:\s*/i,'').trim();
}
function genericMessage(message){
 const value=actionText(message).toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
 return !value||value.length<6||
  /^(?:sync|copy|import|pull|merge)(?:\s+.+)?\s+from\s+(?:main|master|develop|dev|[a-z0-9./-]+)$/.test(value)||
  /^(?:sync|update|copy|import|pull|refresh)(?:\s+(?:the\s+)?(?:latest\s+)?(?:repo|repository|files|source|code|changes|updates|library|catalog|content|project|improvements))?$/.test(value)||
  /^(?:merge|rebase)\s+(?:branch|pull request)\b/.test(value)||
  /^(?:sync|copy|import)\b.*\b(?:via|using)\s+(?:ai|automation|repo sync)\b/.test(value)||
  /^(?:sync|copy|import)\b.*\b(?:improvements|updates|changes)$/.test(value)||
  /^(?:initial (?:commit|repo|repository)(?: .*)?|minor changes|misc changes|various updates)$/.test(value);
}
function pathsSummary(files=[]){
 const paths=[...new Set((Array.isArray(files)?files:[]).map(x=>String(x||'').trim()).filter(x=>x&&isAllowedPath(x)))].slice(0,2);
 return paths.length?'Update '+paths.join(' and '):'Update source files';
}
function meaningfulSubject(sourceMessage,files=[]){
 const subject=commitSubject(sourceMessage);
 return genericMessage(subject)?pathsSummary(files):subject;
}
function readableTitle(sourceMessage,files=[]){
 const text=actionText(meaningfulSubject(sourceMessage,files));
 return text?formatSubject(text):'Update source files';
}
function slugify(value){
 return String(value||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
}
// Use the actual code-change category, never the fact that two repos are
// being synchronized, to name destination review branches.
function branchType(sourceMessage=''){
 const subject=commitSubject(sourceMessage);
 const typed=/^(feat|fix|docs|chore|ci|refactor|test|perf|build|style|revert)(?:\([^)]+\))?!?:\s*/i.exec(subject);
 if(typed)return typed[1].toLowerCase();
 if(/^(?:fix|resolve|repair|correct|patch)\b/i.test(subject))return 'fix';
 if(/^(?:add|implement|introduce|create)\b/i.test(subject))return 'feat';
 if(/^(?:sync|mirror|import|copy|pull)\b/i.test(subject))return 'sync';
 return 'chore';
}
function branchName(repo,sha,sourceMessage='',files=[]){
 const short=String(sha||'').slice(0,8).toLowerCase();
 if(!/^[a-f0-9]{8}$/.test(short))throw Error('Source commit SHA is required for Repo Sync naming.');
 const prefix=branchType(sourceMessage)+'/';
 const slug=slugify(actionText(meaningfulSubject(sourceMessage,files)))||'source-update';
 const room=110-prefix.length;
 const name=stripCommitHashSuffix(prefix+slug.slice(0,room).replace(/-$/,''),sha);
 return baseName(name===prefix?prefix+'source-update':name);
}
// Strip a hash only from the final branch component; preserve meaningful numbers.
function stripCommitHashSuffix(value,sha=''){
 const branch=String(value||'').trim();
 const match=/-([a-f0-9]{7,40})$/i.exec(branch);
 if(!match)return branch;
 const part=match[1].toLowerCase(),revision=String(sha||'').toLowerCase();
 if((revision.length===40&&revision.startsWith(part))||
    (part.length>=7&&/[a-f]/.test(part)))return branch.slice(0,-match[0].length);
 return branch;
}
// Format prose without changing identifiers, paths, URLs, or the commit body.
function formatSubject(value){
 const raw=String(value||'').trim();
 const words={jira:'Jira',github:'GitHub',confluence:'Confluence',api:'API',sdlc:'SDLC',tdd:'TDD',ui:'UI',ux:'UX','ui/ux':'UI/UX',pr:'PR',vite:'Vite',react:'React',typescript:'TypeScript',javascript:'JavaScript','node.js':'Node.js',npm:'npm',vsix:'VSIX'};
 const parts=raw.split(/(`[^`]*`|https?:\/\/\S+)/g).map((part,i)=>i%2?part:
  part.replace(/(?<![\w./-])(ui\/ux|node\.js|jira|github|confluence|api|sdlc|tdd|ui|ux|pr|vite|react|typescript|javascript|npm|vsix)(?![\w./-])/gi,w=>words[w.toLowerCase()]));
 let text=parts.join('');
 const conventional=/^(feat|fix|docs|chore|ci|refactor|test|perf|build|style|revert)(\([^)]+\))?(!)?:\s*/i.exec(text);
 const prefix=conventional?conventional[1].toLowerCase()+(conventional[2]||'')+(conventional[3]||'')+': ':'';
 text=conventional?text.slice(conventional[0].length):text;
 if(text&&!/^(?:npm)\b/.test(text))text=text.charAt(0).toUpperCase()+text.slice(1);
 return prefix+text;
}
function formatCommitMessage(value){
 const [subject,...body]=String(value||'').trim().split(/\r?\n/);
 return [formatSubject(subject),...body].join('\n');
}
function formatPrDetails(value,fallback=''){
 const lines=String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const bullets=[];
 for(let line of lines){
  if(/^#{1,6}\s*(?:summary|description|changes|details|source)\s*:?\s*$/i.test(line))continue;
  line=line.replace(/^#{1,6}\s*/, '').replace(/^(?:[-*+]\s+|\d+[.)]\s+)/,'').trim();
  if(line)bullets.push('- '+line);
  if(bullets.length===10)break;
 }
 if(!bullets.length&&fallback)bullets.push('- '+String(fallback).trim());
 return bullets.join('\n').slice(0,4000).trim();
}
function validateReviewPresentation(review,sha,{branchOnly=false}={}){
 if(stripCommitHashSuffix(review.branch,sha)!==String(review.branch||'').trim())
  throw Error('Remove the trailing commit hash from the destination branch name.');
 if(branchOnly)return;
 const lines=String(review.prDescription||'').trim().split(/\r?\n/).filter(line=>line.trim());
 if(!lines.length||lines.length>10||lines.some(line=>!/^\s*[-*+]\s+\S/.test(line)))
  throw Error('Enter PR details as bullet points, with a maximum of 10 points.');
}
function prDetails({source,destination,sha,scope,base,branch,count,changedFiles=[],sourceBranch='',sourceMessage='',sourceCommitFiles=[]}){
 const relevant=sourceCommitFiles.length?sourceCommitFiles:changedFiles;
 const action=meaningfulSubject(sourceMessage,relevant);
 const label=readableTitle(sourceMessage,relevant);
 // Keep verifiable source identity before long path lists in the ten-bullet summary.
 const paths=changedFiles.slice(0,25).map(file=>'`'+String(file).replace(/[\r\n\0`]/g,'?')+'`');
 return {
  title:label.slice(0,110),
  commit:action.slice(0,110),
  body:formatPrDetails([
   '- '+label,
   '- Files changed: '+count,
   '- Source: '+source.name+' ('+(sourceBranch||'default')+' @ '+sha.slice(0,8)+')',
   '- Commit: '+sha,
   '- Target: '+destination.name+' / '+base,
   '- PR base: '+base,
   '- Review branch: '+branch,
   '- Copy scope: '+(scope==='.'?'eligible tracked files':scope),
   '- Changed paths: '+paths.join(', '),
   ...(changedFiles.length>25?['- Other changed files: '+(changedFiles.length-25)]:[])
  ].join('\n'))
 };
}
function patEnvironment(pat,{githubCli=false}={}){
 const token=String(pat||'');
 if(!/^[^\s\x00-\x1f\x7f]{20,512}$/.test(token))throw Error('A valid GitHub Personal Access Token (PAT) is required for both repositories.');
 const basic=Buffer.from('x-access-token:'+token,'utf8').toString('base64');
 return {
  GIT_CONFIG_COUNT:'1',
  GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_0:'AUTHORIZATION: basic '+basic,
  ...(githubCli?{GH_TOKEN:token,GITHUB_TOKEN:token}:{})
 };
}
async function run(bin,args,{cwd,timeout=120000,env={}}={}){
 try{
  const result=await exec(bin,args,{cwd,timeout,maxBuffer:8*1024*1024,windowsHide:true,
   env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',...env}});
  return String(result.stdout||'').trim();
 }catch(e){
  // Git error messages must not accidentally include environment secrets.
  let detail=String(e.stderr||e.message||'').trim().slice(0,800);
  const token=String(env.GH_TOKEN||'');
  if(token)detail=detail.split(token).join('[REDACTED]');
  const raw=String(env.GIT_CONFIG_VALUE_0||'');
  if(raw)detail=detail.split(raw).join('[REDACTED]');
  throw Error(bin+' '+args[0]+' failed: '+detail);
 }
}
async function destinationFileSafe(root,rel){
 const segments=rel.split('/'),target=path.resolve(root,...segments);
 if(target!==root&&!target.startsWith(root+path.sep))throw Error('Destination path leaves Repo B.');
 let parent=root;
 for(let i=0;i<segments.length;i++){
  parent=path.join(parent,segments[i]);
  const stat=await fs.lstat(parent).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(stat?.isSymbolicLink())throw Error('Refusing symbolic link in Repo B: '+rel);
  if(stat&&i<segments.length-1&&!stat.isDirectory())throw Error('Destination directory is not a directory: '+rel);
  if(stat&&i===segments.length-1&&!stat.isFile())throw Error('Destination path is not a regular file: '+rel);
 }
 return target;
}
async function trackedFiles(source,scope){
 const raw=await run('git',['ls-files','-z'],{cwd:source});
 const candidates=raw.split('\0').filter(Boolean).map(p=>p.replace(/\\/g,'/'));
 const paths=candidates.filter(p=>isAllowedPath(p)&&(scope==='.'||p===scope||p.startsWith(scope+'/')));
 if(!paths.length)throw Error('Repo A has no eligible tracked files in '+scope+'.');
 if(paths.length>MAX_FILES)throw Error('Copy exceeds '+MAX_FILES+' tracked files. Select a smaller scope.');
 let bytes=0;
 const valid=[];
 for(const rel of paths){
  const file=path.resolve(source,...rel.split('/'));
  if(!file.startsWith(source+path.sep))throw Error('Invalid Git source path.');
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink())continue;
  if(stat.size>MAX_SINGLE_FILE)throw Error('Source file exceeds 20 MB: '+rel);
  bytes+=stat.size;
  if(bytes>MAX_BYTES)throw Error('Copy exceeds 100 MB. Select a smaller scope.');
  valid.push(rel);
 }
 if(!valid.length)throw Error('No regular eligible files in selected scope.');
 return valid;
}
function cleanAiField(input,limit=220){
 const str=String(input||'').trim().replace(/[\x00-\x1f\x7f]/g,' ');
 return str.length<=limit?str:str.slice(0,limit).trim();
}
function aiSyncPlan(raw,source,sourceMessage='',sourceSha=''){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const prefix=branchType(sourceMessage)+'/';
 let branch=stripCommitHashSuffix(cleanAiField(raw.branch,115),sourceSha);
 // AI can improve a change slug but cannot override the verified commit type.
 // Permit one conventional type segment and a descriptive slug without a hash.
 if(!branch.startsWith(prefix)||!/^[a-z]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branch))branch='';
 if(branch&&sourceSha&&!/^[a-f0-9]{40}$/i.test(sourceSha))branch='';
 if(branch)try{baseName(branch);}catch{branch='';}
 const suffix=branch.slice(prefix.length).replace(/[-_/]+/g,' ');
 if(branch&&(genericMessage(suffix)||/^(?:main|master|develop|dev|source|latest|sync|updates|changes)$/.test(suffix)))branch='';
 const commitMessage=cleanAiField(raw.commitMessage,110);
 const prTitle=cleanAiField(raw.prTitle,110);
 return {branch,commitMessage:genericMessage(commitMessage)?'':formatCommitMessage(commitMessage),
  prTitle:genericMessage(prTitle)?'':formatSubject(prTitle),prDescription:formatPrDetails(raw.prDescription)};
}
async function inspectSourceCode(cloned,files){
 // Inspect source syntax and package scripts locally; never send raw source bodies,
 // credentials or ignored files to the AI planner.
 const code=files.filter(f=>/\.(?:js|jsx|ts|tsx|py|php|go|rs|java|cs|rb|vue)$/i.test(f)&&
  !/(?:\.min\.|\.bundle\.|\.lock$)/i.test(f))
  .sort((a,b)=>(/^(src|app|lib)\//.test(a)?-1:0)-(/^(src|app|lib)\//.test(b)?-1:0)||a.localeCompare(b));
 const counts={};for(const f of files){const ext=path.extname(f).slice(1).toLowerCase()||'other';counts[ext]=(counts[ext]||0)+1;}
 const keyFiles=[],symbols=[];
 for(const file of code.slice(0,18)){
  const full=path.join(cloned,...file.split('/'));
  let body='';try{const stat=await fs.stat(full);if(stat.size>35000)continue;body=await fs.readFile(full,'utf8');}catch{continue;}
  keyFiles.push(file);
  // Only identifiers/signatures, not executable code, comments or arbitrary strings.
  const expression=/\b(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(|\bclass\s+([A-Za-z_$][\w$]*)\b|\b(?:export\s+(?:default\s+)?(?:const|function|class)|module\.exports\s*=)\s*([A-Za-z_$][\w$]*)/g;
  for(const match of body.matchAll(expression)){
   const name=(match[1]||match[2]||match[3]||'').slice(0,75);
   if(name&&symbols.length<40&&!symbols.some(s=>s.file===file&&s.name===name))symbols.push({file,name});
  }
 }
 let scripts=[],dependencies=[];
 if(files.includes('package.json'))try{
  const pkg=JSON.parse(await fs.readFile(path.join(cloned,'package.json'),'utf8'));
  scripts=Object.keys(pkg.scripts||{}).slice(0,18);
  dependencies=Object.keys({...pkg.dependencies,...pkg.devDependencies}).slice(0,30);
 }catch{}
 return {fileTypes:counts,keyFiles,testFiles:files.filter(f=>/(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\./i.test(f)).slice(0,16),
  symbols,scripts,dependencies};
}
async function readSourceFacts({cloned,source,chosenBranch,sha,sourceMessage,files,destination,base,sourceCommitFiles=[]}){
 let project={};
 try{
  const pkg=JSON.parse(await fs.readFile(path.join(cloned,'package.json'),'utf8'));
  project={name:cleanAiField(pkg.name,80),version:cleanAiField(pkg.version,35),description:cleanAiField(pkg.description,180)};
 }catch{}
 // Source info: safe metadata only, never PATs, raw code, README text or secrets.
 const codeOverview=await inspectSourceCode(cloned,files);
 return {sourceRepo:source.name,sourceBranch:chosenBranch,sourceSha:sha,
  sourceCommitMessage:sourceMessage.slice(0,700),sourceCommitFiles:sourceCommitFiles.slice(0,30),project,codeOverview,
  destinationRepo:destination.name,baseBranch:base,files:files.slice(0,80),fileCount:files.length};
}
async function sync({sourceUrl,destinationUrl='',destinationFolder,copyScope='.',sourceBranch='',sourcePrNumber='',baseBranch='',sourcePat,destPat,workspaceRoot='',onProgress=()=>{},runner=run,githubApi=githubApiDefault,describePr=async()=>'',planSync=async()=>null,previewOnly=false,approvedReview=null,branchOnly=false}){
 if(branchOnly&&!approvedReview)throw Error('Review the source before pushing a branch.');
 const source=githubUrl(sourceUrl),scope=scopeName(copyScope);
 let chosenBranch=sourceBranch?baseName(sourceBranch):'';
 const sourceEnv=patEnvironment(sourcePat),destinationEnv=patEnvironment(destPat);
 const destRoot=await fs.realpath(String(destinationFolder||''));
 const stat=await fs.lstat(destRoot);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular Repo B folder.');
 if(workspaceRoot){
  const workspace=await fs.realpath(workspaceRoot);
  const covers=(parent,child)=>child===parent||child.startsWith(parent+path.sep);
  if(covers(workspace,destRoot)||covers(destRoot,workspace))
   throw Error('Repo B must be a separate folder outside the current ATGV workspace (not its parent or child).');
 }
 const notify=(stage,message)=>Promise.resolve(onProgress({stage,message}));
 await runner('git',['--version']);
 // Repo B may be a clean checkout, or an EMPTY folder selected for first-run cloning.
 let alreadyCloned=true;
 try {
  const top=await runner('git',['rev-parse','--show-toplevel'],{cwd:destRoot});
  if(await fs.realpath(top)!==destRoot)throw Error('Select Repo B Git root, not a nested folder inside a different repository.');
 } catch(error) {
  if(!/not a git repository/i.test(String(error?.message||error)))throw error;
  alreadyCloned=false;
 }
 if(!alreadyCloned){
  if((await fs.readdir(destRoot)).length)throw Error('Selected Repo B folder is not a Git repository and is not empty. Choose an empty folder or an existing Repo B Git root; files will not be overwritten.');
  if(!destinationUrl)throw Error('Enter and test the Destination GitHub URL before selecting an empty Repo B folder.');
 }
 let destination;
 if(alreadyCloned){
  const currentOrigin=await runner('git',['remote','get-url','origin'],{cwd:destRoot});
  if(!/^https:\/\/github\.com\//i.test(currentOrigin))throw Error('Repo B origin must be an HTTPS GitHub URL to authenticate with the Destination PAT.');
  destination=githubUrl(currentOrigin,{origin:true});
 }else destination=githubUrl(destinationUrl);
 if(destinationUrl&&githubUrl(destinationUrl).name.toLowerCase()!==destination.name.toLowerCase())throw Error('Repo B URL differs from selected folder origin; refusing to push.');
 if(source.name.toLowerCase()===destination.name.toLowerCase())throw Error('Repo A and Repo B must be different repositories.');
 const remote=await githubApi.getRepository(destination,destPat);
 if(remote.nameWithOwner?.toLowerCase()!==destination.name.toLowerCase())throw Error('Repo B GitHub identity differs from local origin.');
 const base=baseName(baseBranch||remote.defaultBranch);
 // An explicit PR number selects its actual head branch and original PR metadata.
 let sourcePr=null;
 if(sourcePrNumber!==''&&sourcePrNumber!==null&&sourcePrNumber!==undefined){
  const number=Number(sourcePrNumber);
  if(!Number.isSafeInteger(number)||number<1)throw Error('Source PR number must be a positive integer.');
  if(typeof githubApi.getSourcePullRequest!=='function')throw Error('Source PR lookup is unavailable.');
  sourcePr=await githubApi.getSourcePullRequest(source,sourcePat,number);
  if(chosenBranch&&chosenBranch!==sourcePr.branch)throw Error('Selected source branch does not match source PR #'+number+'.');
  chosenBranch=baseName(sourcePr.branch);
 }
 // Otherwise prefer the selected source branch, then its GitHub default.
 if(!chosenBranch){
  const sourceInfo=await githubApi.getSourceRepository(source,sourcePat);
  if(sourceInfo.nameWithOwner?.toLowerCase()!==source.name.toLowerCase())throw Error('Repo A source identity differs from GitHub; refusing to clone.');
  chosenBranch=baseName(sourceInfo.defaultBranch);
 }
 if(!alreadyCloned){
  // A new/empty GitHub repo can advertise 'main' without having any commits.
  // A PR requires a real destination base: never initialize or push main here.
  const baseRefs=await runner('git',['ls-remote','--heads','--',destination.url,'refs/heads/'+base],{
   cwd:destRoot,timeout:120000,env:destinationEnv
  });
  if(!String(baseRefs||'').split(/\r?\n/).some(line=>line.endsWith('\trefs/heads/'+base)))
   throw Error('Repo B has no branch "'+base+'". If this GitHub repository is empty, create its first commit on the intended default branch before running Repo Sync. No files were changed.');
  if(!previewOnly)await notify('destination','Cloning '+destination.name+' / '+base+' into the selected empty Repo B folder…');
  // Git refuses to clone into a nonempty directory. Do not delete or reset user files.
  if(!previewOnly){
   await runner('git',['clone','--quiet','--single-branch','--branch',base,'--',destination.url,'.'],{
    cwd:destRoot,timeout:180000,env:destinationEnv
   });
   await notify('destination','Repo B checkout prepared. Creating the review branch next.');
  }
 }
 let oldBranch='';
 if(!previewOnly||alreadyCloned){
 const top=await runner('git',['rev-parse','--show-toplevel'],{cwd:destRoot});
 if(await fs.realpath(top)!==destRoot)throw Error('Repo B checkout root changed during verification.');
 const origin=await runner('git',['remote','get-url','origin'],{cwd:destRoot});
 if(!/^https:\/\/github\.com\//i.test(origin)||githubUrl(origin,{origin:true}).name.toLowerCase()!==destination.name.toLowerCase())
  throw Error('Repo B origin does not match the selected Destination GitHub URL.');
 const dirty=await runner('git',['status','--porcelain','--untracked-files=all'],{cwd:destRoot});
 if(dirty)throw Error('Repo B has uncommitted or untracked changes. Commit or stash them first.');
 oldBranch=await runner('git',['symbolic-ref','--quiet','--short','HEAD'],{cwd:destRoot});
 if(!oldBranch)throw Error('Repo B cannot be in detached HEAD.');
 }
 // Derive the review branch only after inspecting Repo A's actual HEAD commit.
 let branch='';
 let aiPlan={};
 await notify('clone','Cloning '+source.name+' / '+chosenBranch+' into a temporary folder…');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-repo-sync-'));
 let files=[],switched=false,pushed=false;
 try{
  const cloned=path.join(temp,'repo-a');
  try{
   await runner('git',['clone','--quiet','--depth','1','--single-branch','--branch',chosenBranch,source.url,cloned],{timeout:180000,env:sourceEnv});
  }catch(error){
   if(/Remote branch .* not found in upstream origin/i.test(String(error?.message||error)))
    throw Error('Repo A has no source branch "'+chosenBranch+'". Select an existing branch or leave Source branch blank to use the GitHub default. No Repo B changes were published.');
   throw error;
  }
  const sha=await runner('git',['rev-parse','HEAD'],{cwd:cloned});
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Could not verify Repo A source commit.');
  const sourceMessage=(await runner('git',['log','-1','--pretty=%B'],{cwd:cloned})).trim();
  if(!sourceMessage||sourceMessage.length>12000)throw Error('Repo A commit message is missing or too large.');
  files=await trackedFiles(cloned,scope);
  // Resolve the latest published source GitHub release, including prereleases.
  // Source and release are pinned across review and publication.
  const release=typeof githubApi.getLatestRelease==='function'
   ?await githubApi.getLatestRelease(source,sourcePat):null;
  const commitPaths=await runner('git',['show','--format=','--name-only','HEAD'],{cwd:cloned}).catch(()=> '');
  const eligible=new Set(files);
  const sourceCommitPaths=[...new Set(String(commitPaths||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
  const sourceCommitFiles=sourceCommitPaths.filter(x=>eligible.has(x));
  const excludedSourceCommitFiles=sourceCommitPaths.filter(x=>!eligible.has(x));
  if(sourcePr&&sourcePr.sha!==sha)throw Error('Repo A PR head changed since GitHub inspection. Retry to avoid publishing the wrong source revision.');
  if(!sourcePr&&typeof githubApi.getSourcePrForCommit==='function'){
   try{sourcePr=await githubApi.getSourcePrForCommit(source,sourcePat,{sha,branch:chosenBranch});}
   catch(error){await notify('source','Source PR lookup unavailable: '+String(error?.message||error).slice(0,160));}
  }
  // GitHub cannot create a pull request where the review branch equals the base.
  // Reuse the actual source branch in every other case.
  const fallbackBranch=branchName(source.repo,sha,sourceMessage,sourceCommitFiles.length?sourceCommitFiles:files);
  const cleanedSourceBranch=stripCommitHashSuffix(chosenBranch,sha);
  branch=chosenBranch===base||!cleanedSourceBranch||cleanedSourceBranch===base||cleanedSourceBranch.endsWith('/')
   ?fallbackBranch:baseName(cleanedSourceBranch);
  const facts=await readSourceFacts({cloned,source,chosenBranch,sha,sourceMessage,files,destination,base,sourceCommitFiles});
  if(!sourcePr||previewOnly){
   await notify('ai','Studying verified source-code structure and commit history for the proposed branch, commit and PR details…');
   try{aiPlan=aiSyncPlan(await planSync(facts),source,sourceMessage,sha);}
   catch{await notify('ai','AI summary unavailable; using verified source metadata.');}
  }
  if(excludedSourceCommitFiles.length)
   await notify('source','Source commit has '+excludedSourceCommitFiles.length+' excluded or deleted path(s): '+excludedSourceCommitFiles.slice(0,3).join(', '));
  if(previewOnly){
   // Verify actual destination base without fetching or changing Repo B files.
   const baseRefs=await runner('git',['ls-remote','--heads','--',destination.url,'refs/heads/'+base],{
    cwd:destRoot,timeout:120000,env:destinationEnv});
   const baseLine=String(baseRefs||'').split(/\r?\n/).find(x=>x.endsWith('\trefs/heads/'+base));
   const baseSha=baseLine?.split('\t')[0]||'';
   if(!/^[a-f0-9]{40}$/.test(baseSha))throw Error('Destination PR base branch is missing or inaccessible.');
   const proposedBranch=chosenBranch!==base?branch:(aiPlan.branch||branch);
   const initialBranch=baseName(proposedBranch===base?fallbackBranch:proposedBranch);
   let availableBranch='';
   for(let index=1;index<=100;index++){
    const suffix=index===1?'':'-'+index;
    const candidate=baseName(initialBranch.slice(0,110-suffix.length).replace(/-$/,'')+suffix);
    const refs=await runner('git',['ls-remote','--heads','--',destination.url,'refs/heads/'+candidate],{
     cwd:destRoot,timeout:120000,env:destinationEnv});
    const existsRemote=String(refs||'').split(/\r?\n/).some(line=>line.endsWith('\trefs/heads/'+candidate));
    const existsLocal=alreadyCloned?!!(await runner('git',['branch','--list',candidate],{cwd:destRoot})):false;
    if(!existsRemote&&!existsLocal){availableBranch=candidate;break;}
   }
   if(!availableBranch)throw Error('Could not find an unused destination branch name. Choose a different source branch.');
   const proposedCommit=sourcePr?sourceMessage:(aiPlan.commitMessage||sourceMessage);
   const proposedTitle=sourcePr?sourcePr.title:(aiPlan.prTitle||commitSubject(sourceMessage));
   const proposedBody=sourcePr?sourcePr.body:(aiPlan.prDescription||'- '+readableTitle(sourceMessage,sourceCommitFiles||files));
   const proposed={
    branch:availableBranch,
    commitMessage:formatCommitMessage(proposedCommit).slice(0,12000),
    prTitle:formatSubject(proposedTitle).slice(0,110),
    prDescription:formatPrDetails(proposedBody,readableTitle(sourceMessage,sourceCommitFiles.length?sourceCommitFiles:files))
   };
   return {preview:true,review:{
    ...proposed,sourceSha:sha,baseSha,sourceBranch:chosenBranch,sourceRepo:source.name,
    destinationRepo:destination.name,base,copyScope:scope,
    sourcePrUrl:sourcePr?.url||'',fileCount:files.length,sourceCode:facts.codeOverview,
    codeVersion:facts.project.version||'',release,
    sourceCommitFiles,excludedSourceCommitFiles,
    notice:'Suggestions use verified source code structure and latest source commit. No Repo B files were changed.'
   }};
  }
  if(approvedReview){
   // A changed release or source version invalidates an earlier approval.
   if(JSON.stringify(approvedReview.release||null)!==JSON.stringify(release||null)||
    (approvedReview.codeVersion||'')!==(facts.project.version||''))
    throw Error('Source release or application version changed since review. Pull & Study Again.');
   if(approvedReview.sourceSha!==sha||approvedReview.base!==base||
    approvedReview.sourceBranch!==chosenBranch||
    approvedReview.sourceRepo?.toLowerCase()!==source.name.toLowerCase()||
    approvedReview.destinationRepo?.toLowerCase()!==destination.name.toLowerCase()||
    approvedReview.copyScope!==scope)
    throw Error('Source or destination changed since review. Pull and study Repo A again before publishing.');
   const value=String(approvedReview.branch||'').trim();
   branch=baseName(value);
   if(branch===base)throw Error('Destination branch must differ from base '+base+'.');
   if(!String(approvedReview.commitMessage||'').trim()||String(approvedReview.commitMessage).length>12000)throw Error('Enter a commit message up to 12000 characters.');
   if(!branchOnly){
    if(!String(approvedReview.prTitle||'').trim()||String(approvedReview.prTitle).length>110)throw Error('Enter a PR title up to 110 characters.');
    if(!String(approvedReview.prDescription||'').trim()||String(approvedReview.prDescription).length>4000)throw Error('Enter a short PR description (up to 4000 characters).');
   }
   validateReviewPresentation(approvedReview,sha,{branchOnly});
  }
  await notify('source','Source HEAD verified. '+(approvedReview?'Using reviewed branch and commit details.':'Using source commit and PR metadata.'));
  await runner('git',['check-ref-format','--branch',branch],{cwd:destRoot});
  await notify('preflight',files.length+' tracked files; checking '+destination.name+' / '+base+'…');
  await runner('git',['fetch','origin','+refs/heads/'+base+':refs/remotes/origin/'+base],{cwd:destRoot,timeout:180000,env:destinationEnv});
  if(approvedReview?.baseSha){
   const baseSha=await runner('git',['rev-parse','refs/remotes/origin/'+base],{cwd:destRoot});
   if(baseSha!==approvedReview.baseSha)throw Error('Repo B base changed after the review; analyze again before publishing.');
  }
  const remoteBranch=(await runner('git',['ls-remote','--heads','origin','refs/heads/'+branch],{cwd:destRoot,env:destinationEnv})).trim();
  if(remoteBranch){
   throw Error('Repo B branch '+branch+' already exists. Pull & Study Again to select an unused branch; no branch was overwritten.');
  }else{
   const local=await runner('git',['branch','--list',branch],{cwd:destRoot});
   if(local)throw Error('Repo B has an unpublished branch '+branch+'. Resolve or publish it before reusing the name.');
   await runner('git',['switch','-c',branch,'refs/remotes/origin/'+base],{cwd:destRoot});
   switched=true;
  }
  await notify('copy','Copying '+files.length+' eligible files into '+branch+'…');
  for(const rel of files){
   const dest=await destinationFileSafe(destRoot,rel);
   await fs.mkdir(path.dirname(dest),{recursive:true});
   await fs.copyFile(path.join(cloned,...rel.split('/')),dest);
  }
  // Release assets are copied with the reviewed code in the same commit.
  const releaseFiles=[];
  if(release?.assets?.length){
   if(typeof githubApi.downloadReleaseAsset!=='function')
    throw Error('Cannot include release assets: download support is unavailable.');
   await notify('release','Downloading '+release.assets.length+' verified asset(s) from '+release.tag+'…');
   const staging=path.join(temp,'verified-release');
   await fs.mkdir(staging,{recursive:true});
   const verified=[];
   for(const asset of release.assets){
    const local=path.join(staging,asset.name);
    const item=await githubApi.downloadReleaseAsset(source,sourcePat,asset,local);
    if(!item||item.name!==asset.name||item.size!==asset.size||
       !/^sha256:[a-f0-9]{64}$/.test(String(item.digest||''))||
       (asset.digest&&asset.digest!==item.digest))
     throw Error('Downloaded release artifact did not match the reviewed asset: '+asset.name);
    const relative='release-artifacts/'+release.tag+'/'+asset.name;
    const target=await destinationFileSafe(destRoot,relative);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(local,target);
    releaseFiles.push(relative);verified.push(item);
   }
   const manifestRelative='release-artifacts/'+release.tag+'/release.json';
   if(releaseFiles.includes(manifestRelative))throw Error('Release contains a reserved manifest filename.');
   const manifestTarget=await destinationFileSafe(destRoot,manifestRelative);
   await fs.mkdir(path.dirname(manifestTarget),{recursive:true});
   await fs.writeFile(manifestTarget,JSON.stringify({
    schema:1,sourceRepository:source.name,sourceBranch:chosenBranch,
    sourceCommit:sha,codeVersion:facts.project.version||null,
    releaseTag:release.tag,releaseName:release.name,releaseUrl:release.url,
    releaseTargetCommitish:release.targetCommitish,releasePublishedAt:release.publishedAt,
    matchesSourceCommit:release.targetCommitish===sha,
    assets:verified
   },null,2)+'\n','utf8');
   releaseFiles.push(manifestRelative);
  }
  // Stage as git add . would, then prevent any unexpected file from being committed.
  await runner('git',['add','-A','--','.'],{cwd:destRoot});
  // Abort if ignore rules prevented any required binary/manifest from being indexed.
  if(releaseFiles.length){
   const tracked=await runner('git',['ls-files','--cached','-z','--',...releaseFiles],{cwd:destRoot});
   const indexed=new Set(tracked.split('\0').filter(Boolean));
   if(releaseFiles.some(file=>!indexed.has(file)))
    throw Error('Release artifacts were ignored or excluded from Git staging; no PR was published.');
  }
  const staged=await runner('git',['diff','--cached','--name-only','-z'],{cwd:destRoot});
  const changedFiles=staged.split('\0').filter(Boolean);
  const allowed=new Set([...files,...releaseFiles]);
  if(changedFiles.some(file=>!allowed.has(file)))
   throw Error('Unexpected files staged outside the approved copy scope. No commit or push was made.');
  if(!changedFiles.length){
   if(!remoteBranch){
    await runner('git',['switch',oldBranch],{cwd:destRoot});
    await runner('git',['branch','-D',branch],{cwd:destRoot});
   }
   switched=false;
   const existingPr=remoteBranch?await githubApi.findOpenPr(destination,destPat,{branch,base}):'';
   return {unchanged:true,prUrl:existingPr,message:'Repo B already has the same eligible files from Repo A '+chosenBranch+'.'+(existingPr?' Existing PR: '+existingPr:''),sourceSha:sha,sourceBranch:chosenBranch,branch,fileCount:files.length};
  }
  const commitMessage=approvedReview?String(approvedReview.commitMessage).trim():formatCommitMessage(sourceMessage);
  await notify('commit','Committing the reviewed change…');
  await runner('git',['commit','-m',commitMessage],{cwd:destRoot,timeout:180000});
  await notify('push','Pushing '+branch+' using the destination PAT…');
  // An empty expected ref means the remote branch must still not exist at push
  // time, even if another actor creates it after the earlier preflight check.
  await runner('git',['push','--force-with-lease=refs/heads/'+branch+':','--set-upstream','origin',branch],{cwd:destRoot,timeout:180000,env:destinationEnv});
  pushed=true;
  const result={branch,sourceBranch:chosenBranch,sourceSha:sha,sourceRepo:source.name,destinationRepo:destination.name,
   base,fileCount:changedFiles.length,codeVersion:facts.project.version||'',releaseTag:release?.tag||'',
   releaseAssetCount:release?.assets?.length||0,releaseArtifactPaths:releaseFiles,commitMessage,
   sourcePrUrl:sourcePr?.url||'',excludedSourceCommitFiles};
  if(branchOnly)return result;
  const details=prDetails({source,destination,sha,scope,base,branch,count:changedFiles.length,changedFiles,sourceBranch:chosenBranch,sourceMessage,sourceCommitFiles});
  let body=details.body;
  if(approvedReview){
   body=String(approvedReview.prDescription).trim();
   if(release?.assets?.length&&body.split(/\r?\n/).filter(Boolean).length<10)
    body+='\n- Release artifacts: '+release.tag+' ('+release.assets.length+' assets, with SHA-256 manifest)';
   await notify('pr','Using the approved PR title and description…');
  }else if(sourcePr){
   body=formatPrDetails(sourcePr.body,readableTitle(sourceMessage,sourceCommitFiles));
   await notify('pr','Preparing source PR #'+sourcePr.number+' details as bullet points…');
  }else{
   await notify('pr','No matching source PR; preparing a factual destination description…');
   let summary='';
   try{summary=String(await describePr({sourceRepo:source.name,sourceBranch:chosenBranch,sourceSha:sha,destinationRepo:destination.name,base,branch,sourceMessage,sourceCommitFiles,changedFiles:changedFiles.slice(0,80)})||'').trim().slice(0,550);}
   catch{await notify('pr','AI PR summary unavailable; using verified source metadata.');}
   if(!summary)summary=String(aiPlan.prDescription||'').trim().slice(0,550);
   if(summary)body=summary+'\n'+details.body;
   if(excludedSourceCommitFiles.length)body+='\n- Excluded source-commit paths (not copied): '+excludedSourceCommitFiles.slice(0,12).map(x=>'\x60'+x+'\x60').join(', ');
   body=formatPrDetails(body,details.title);
  }
  await notify('pr','Creating or reusing the review PR via GitHub HTTPS API for '+branch+'…');
  const prTitle=approvedReview?String(approvedReview.prTitle).trim():formatSubject(sourcePr?sourcePr.title:commitSubject(sourceMessage));
  const prUrl=await githubApi.findOpenPr(destination,destPat,{branch,base})||
   await githubApi.createPr(destination,destPat,{branch,base,title:prTitle,body});
  return {...result,prUrl};
 }catch(e){
  const suffix=switched?' Repo B remains on branch '+branch+(pushed?' (already pushed)':'')+' for review.':'';
  throw Error(e.message+suffix);
 }finally{await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={githubUrl,baseName,scopeName,isAllowedPath,commitSubject,genericMessage,meaningfulSubject,readableTitle,branchType,branchName,stripCommitHashSuffix,formatSubject,formatCommitMessage,formatPrDetails,validateReviewPresentation,prDetails,patEnvironment,aiSyncPlan,readSourceFacts,inspectSourceCode,sync};
