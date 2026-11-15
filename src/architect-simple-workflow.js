'use strict';
// A three-action architect workflow: save -> test -> approve. The selected
// technology is expanded into real application files at the Git checkout root.
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const skeleton=require('./project-skeleton');
const diagnostic=require('./stack-process-diagnostics');


function selection(stackIds){if(!Array.isArray(stackIds)||!stackIds.length||stackIds.length>2||new Set(stackIds).size!==stackIds.length)throw Error('Choose one or two catalog stacks.');return stackIds;}
async function git(root,...args){
 try{const result=await exec('git',['-C',root,...args],{timeout:45000,maxBuffer:1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
 return (result.stdout||'').trim();}catch(error){throw diagnostic.attach(Error('Git '+args[0]+' failed; see the downloadable error log.'),{stage:'Git '+args[0],bin:'git',args:['-C',root,...args],cwd:root,stdout:error.stdout,stderr:error.stderr,exitCode:error.code,signal:error.signal});}
}
async function safeRoot(folder){
 const real=await fs.realpath(folder),stat=await fs.lstat(real);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('The project repository must be a real directory.');
 const top=await git(real,'rev-parse','--show-toplevel').catch(()=>null);
 if(!top||path.resolve(top)!==path.resolve(real))throw Error('Save the stack in the root of the configured project Git checkout.');
 return real;
}
async function state(folder,stackIds){
 selection(stackIds);const root=await safeRoot(folder);
 const entries=(await fs.readdir(root)).filter(name=>name!=='.git'&&name!=='.DS_Store');
 if(entries.length===0)return {root,empty:true,existing:false};
 const marker=path.join(root,'atgv.bootstrap.json');
 const meta=await fs.readFile(marker,'utf8').then(raw=>JSON.parse(raw),()=>null);
 if(meta){if(!Array.isArray(meta.stacks)||JSON.stringify(meta.stacks)!==JSON.stringify(stackIds))throw Error('This project already contains a different ATGV starter stack. Choose a new empty checkout or resolve that stack before saving.');return {root,empty:false,existing:true,managed:true};}
 return {root,empty:false,existing:true,managed:false};
}
async function assertRunnable(root){
 const {targets}=await require('./developer-git').inspectScripts(root);
 if(!targets.length)throw Error('This checkout has no supported application (package.json, pom.xml or .csproj). Save Stack again to add a starter where safe, or add runnable application files manually.');
 const missing=targets.filter(target=>!['test','build'].every(op=>target.scripts.includes(op))||!['dev','start','run'].some(op=>target.scripts.includes(op)));
 if(missing.length)throw Error('The existing checkout needs test, build and run scripts for: '+missing.map(t=>t.relative||'repository root').join(', ')+'. No application files were modified.');
 return targets;
}
async function save(folder,stackIds){
 const info=await state(folder,stackIds);
 if(info.managed){
  await assertRunnable(info.root);
  return {...info,generated:false,files:[],message:'An ATGV starter stack is already present. Existing application files were preserved.'};
 }
 if(info.empty){
  const created=await skeleton.generateSkeleton(info.root,stackIds);
  await assertRunnable(info.root);
  return {...info,generated:true,files:created.files,message:`Prepared ${created.files.length} runnable starter files in the project repository. Review them before Test & Run.`};
 }
 const found=await require('./developer-git').inspectScripts(info.root);
 if(found.targets.length){
  await assertRunnable(info.root);
  return {...info,generated:false,files:[],message:`Existing application detected (${found.targets.length} target(s)). No application files were overwritten. Next: Test & Run.`};
 }
 const created=await skeleton.generateSkeleton(info.root,stackIds);
 await assertRunnable(info.root);
 return {...info,generated:true,files:created.files,message:`Prepared ${created.files.length} runnable starter files alongside existing repository content. Preserved ${created.preserved.length} existing baseline file(s). Review them before Test & Run.`};
}
// Only an exact, unmodified ATGV-generated scaffold may be auto-committed by
// the Test & Run confirmation. Other staged, modified, or untracked files block.
async function generatedCommitPlan(folder,stackIds){
 const info=await state(folder,stackIds);
 const repo=await git(info.root,'rev-parse','HEAD').catch(()=>null),changes=await git(info.root,'status','--porcelain');
 if(repo&&!changes)return {root:info.root,files:[],needsCommit:false};
 if(!info.managed)throw Error('The existing project has uncommitted changes. Review and commit them before Test & Run.');
 const files=await skeleton.skeletonFiles(stackIds,info.root);
 const meta=JSON.parse(await fs.readFile(path.join(info.root,'atgv.bootstrap.json'),'utf8'));
 const generated=require('./architect-scaffold-repair').checkInventory(meta,files);
 const allowed=new Set(generated);
 const branch=await git(info.root,'branch','--show-current');
 const migration=meta.migration;
 const verifiedMigration=migration?.schema===1&&migration.branch===branch&&branch.startsWith('migration/')&&
  /^[0-9a-f]{40}$/.test(migration.baseCommit||'')&&
  typeof migration.sourceBranch==='string'&&migration.sourceBranch.startsWith('bootstrap/')&&
  Array.isArray(migration.removed)&&migration.removed.every(s=>typeof s==='string'&&s&&!s.includes('..')&&!s.includes('\\')&&!s.startsWith('/'))&&
  await git(info.root,'merge-base',migration.sourceBranch,'HEAD').then(v=>v===migration.baseCommit,()=>false);
 if(migration&&!verifiedMigration)throw Error('Invalid or changed migration provenance. No files staged.');
 if(verifiedMigration)for(const name of migration.removed)allowed.add(name);
 for(const relative of generated){
  const target=path.join(info.root,relative),st=await fs.lstat(target).catch(()=>null);
  if(!st?.isFile()||st.isSymbolicLink())throw Error('Starter file missing or unsafe: '+relative);
  const actual=await fs.readFile(target);
  if(relative==='atgv.bootstrap.json'){
   const current=JSON.parse(actual.toString('utf8'));
   if(current.schema!==1||JSON.stringify(current.stacks)!==JSON.stringify(stackIds)||current.status!=='draft'||
      (Array.isArray(current.generatedFiles)&&JSON.stringify(current.generatedFiles)!==JSON.stringify(generated)))
    throw Error('The starter manifest was changed. Review and commit manually.');
  }else if(!actual.equals(files[relative]))throw Error('Starter file was edited: '+relative+'. Review and commit manually before testing.');
 }
 const output=await exec('git',['-C',info.root,'-c','status.renames=false','status','--porcelain','-z','--untracked-files=all'],{timeout:45000,maxBuffer:1024*1024});
 const records=output.stdout.split('\0').filter(Boolean);
 if(!records.length)return {root:info.root,files:[],needsCommit:false};
 const seen=new Set();
 for(const record of records){
  const code=record.slice(0,2),relative=record.slice(3);
  if(!allowed.has(relative)||(verifiedMigration?!['??',' M',' D'].includes(code):code!=='??'))throw Error('The repository contains non-starter or previously staged changes ('+relative+'). Review and commit them manually.');
  seen.add(relative);
 }
 if(!verifiedMigration&&seen.size!==allowed.size)throw Error('Some starter files are already tracked or changed. Review and commit manually.');
 if(verifiedMigration){
  for(const relative of migration.removed){const st=await fs.lstat(path.join(info.root,relative)).catch(()=>null);if(st)throw Error('Removed migration source reappeared: '+relative);}
  if(!seen.has('atgv.bootstrap.json'))throw Error('Migration manifest must be included in the verified change set.');
  for(const name of seen)if(!generated.includes(name)&&!migration.removed.includes(name))throw Error('Unexpected changed file in migration: '+name);
  // The migration base and every change remain confined to the recorded Git branch.
  const current=(await git(info.root,'rev-parse','HEAD'));
  if(current!==migration.baseCommit)throw Error('Migration branch HEAD changed since the verified snapshot. Review manually.');
  return {root:info.root,files:[...seen],needsCommit:true,migration:true};
 }
 return {root:info.root,files:[...allowed],needsCommit:true};
}
async function commitGenerated(plan){
 if(!plan.needsCommit)return false;
 await git(plan.root,'add','-A','--',...plan.files);
 try{await git(plan.root,'commit','-m',plan.migration?'chore: migrate verified ATGV technology stack starter':'chore: add reviewed ATGV technology stack starter');}
 catch(error){await git(plan.root,'reset','--',...plan.files).catch(()=>{});throw Error('Could not create the starter commit. Configure Git author identity and retry: '+String(error.message).slice(0,300));}
 return true;
}
async function installNodeDependencies(root,relative,{onDiagnostic=async()=>{}}={}){
 if(relative&&!['apps/web','services/api'].includes(relative))throw Error('Unsupported application directory.');
 const cwd=path.join(await safeRoot(root),relative);
 const st=await fs.lstat(cwd);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Invalid application folder.');
 // Lifecycle scripts are not automatically executed by the extension.
 const {bin,args}=require('./platform-process').npmCommand(['install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false']);
 try{
  const {stdout,stderr}=await exec(bin,args,{cwd,timeout:180000,maxBuffer:4*1024*1024,windowsHide:true});
  await onDiagnostic(diagnostic.capture({stage:'npm dependency installation',bin,args,cwd,stdout,stderr,exitCode:0}));
 }catch(error){
  const record=diagnostic.capture({stage:'npm dependency installation',bin,args,cwd,stdout:error.stdout,stderr:error.stderr,error});
  await onDiagnostic(record);
  const failure=Error('npm install failed in '+(relative||'repository root')+'. Download the error log for npm stdout/stderr, exit code and registry diagnostics.');
  failure.diagnosticLogs=record;
  throw failure;
 }
}
module.exports={state,save,generatedCommitPlan,commitGenerated,installNodeDependencies};
