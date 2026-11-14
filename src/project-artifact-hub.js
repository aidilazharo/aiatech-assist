'use strict';
// One project-scoped, read-only evidence hub for BA, SA, UI/UX and Developer.
// Originals remain in their canonical stores. No credentials, Git internals,
// unapproved designs or unrelated BR requirements are made authoritative.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const brWorkflow=require('./br-workflow');
const sourceStore=require('./source-store');
const unified=require('./unified-document-repository');
const designHandoff=require('./developer-design-handoff');
const {withLock}=require('./file-lock');
const MAX_FILES=2500,MAX_FILE_BYTES=40*1024*1024,MAX_TOTAL_BYTES=500*1024*1024;
const OK_EXT=new Set(['.pdf','.docx','.md','.txt','.json','.html','.htm','.png','.jpg','.jpeg','.webp','.svg','.yml','.yaml','.css','.js','.jsx','.ts','.tsx','.sql','.xml','.csv','.drawio','.mmd','.puml','.pptx','.xlsx','.xls','.doc','.ppt','.odt','.ods','.odp']);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const now=()=>new Date().toISOString();
const safeId=value=>{const s=String(value||'');if(!/^[a-z][a-z0-9-]{0,48}$/.test(s))throw Error('Invalid project identity for unified artifacts.');return s;};
const safeBr=value=>{const s=String(value||'');if(!/^[A-Za-z][A-Za-z0-9_-]{0,70}$/.test(s))throw Error('Invalid BR identity for unified artifacts.');return s;};
const short=(value,n=14000)=>String(value||'').slice(0,n);
function projectRoot(registry,projectId){return path.dirname(registry.fileFor(safeId(projectId)));}
function hubRoot(registry,projectId){return path.join(projectRoot(registry,projectId),'unified-artifacts');}
async function checkNoSymlink(p){const st=await fs.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));if(st?.isSymbolicLink())throw Error('Unified artifact path contains a symbolic link: '+p);return st;}
async function safeDirs(root,relative){let current=root;await checkNoSymlink(root);for(const part of relative.split('/').filter(Boolean)){if(!/^[a-zA-Z0-9_.-]+$/.test(part)||part==='.'||part==='..')throw Error('Invalid artifact path component.');current=path.join(current,part);const st=await checkNoSymlink(current);if(st&&!st.isDirectory())throw Error('Artifact directory replaced by a file.');if(!st)await fs.mkdir(current,{mode:0o700});}return current;}
async function writeFile(root,relative,bytes){const normalized=String(relative||'').replace(/\\/g,'/');const parts=normalized.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||!/^[a-zA-Z0-9_.-]+$/.test(p)))throw Error('Invalid artifact destination path.');await safeDirs(root,parts.slice(0,-1).join('/'));const file=path.join(root,...parts);if((await checkNoSymlink(file))?.isDirectory())throw Error('Artifact destination is a directory.');await fs.writeFile(file,bytes,{mode:0o600});return {path:relative,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};}
async function json(root,relative,data){return writeFile(root,relative,JSON.stringify(data,null,2)+'\n');}
function adfText(node){if(!node)return '';if(typeof node==='string')return node;if(Array.isArray(node))return node.map(adfText).filter(Boolean).join('\n');if(typeof node!=='object')return '';const text=typeof node.text==='string'?node.text:'';const content=adfText(node.content||[]);return [text,content].filter(Boolean).join(node.type==='paragraph'?' ':'\n');}
function jiraSummary(item,key){const fields=item?.fields||{};return {key,summary:short(fields.summary||item?.summary,500),description:short(adfText(fields.description||item?.description),40000),type:short(fields.issuetype?.name||item?.kind||'',100),status:short(fields.status?.name||'',100),parentKey:short(fields.parent?.key||'',70),labels:Array.isArray(fields.labels)?fields.labels.slice(0,40):[]};}
function brSources(register,br){const digests=new Set((br?.evidence||[]).map(e=>e?.digest||e?.sourceDigest).filter(Boolean));if(br?.source?.digest)digests.add(br.source.digest);if(br?.approval?.sourceDigest)digests.add(br.approval.sourceDigest);const exact=(register.sourceDocuments||[]).filter(s=>digests.has(s.digest));return exact.length?exact:(register.sourceDocuments||[]).length===1?[register.sourceDocuments[0]]:[];}
async function copyDocuments(root,target,manifest){
 const source=path.join(root,'documents');const base=(await fs.lstat(source).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)));
 if(!base)return;if(base.isSymbolicLink()||!base.isDirectory())throw Error('Unsafe documents directory.');
 let total=0,count=0;const walk=async(folder,relative='',depth=0)=>{
  if(depth>12){manifest.warnings.push('Document folder nesting limit reached: '+relative);return;}
  const entries=await fs.readdir(folder,{withFileTypes:true});for(const ent of entries){
   if(++count>MAX_FILES)throw Error('Unified artifact indexing exceeded maximum file count; split the project artifacts before continuing.');
   const rel=relative?relative+'/'+ent.name:ent.name;
   if(ent.isSymbolicLink()){manifest.warnings.push('Skipped symlink: documents/'+rel);continue;}
   if(ent.isDirectory()){await walk(path.join(folder,ent.name),rel,depth+1);continue;}
   if(!ent.isFile()||!OK_EXT.has(path.extname(ent.name).toLowerCase()))continue;
   const safeRel=rel.split('/').every(p=>/^[a-zA-Z0-9_.-]+$/.test(p)&&p!=='.'&&p!=='..')?rel:('_named/'+sha(rel).slice(0,40)+path.extname(ent.name).toLowerCase());
   const file=path.join(folder,ent.name);const size=(await fs.stat(file)).size;
   if(size>MAX_FILE_BYTES||total+size>MAX_TOTAL_BYTES)throw Error('Unified artifact copy limit exceeded at documents/'+rel+'; no partial snapshot was published.');
   total+=size;const content=await fs.readFile(file);const stored=await writeFile(target,'shared/documents/'+safeRel,content);
   manifest.files.push({...stored,source:'documents/'+rel,role:rel.startsWith('requirements/')?'business-analyst':rel.startsWith('jira-designs/')?'ui-ux-designer':'shared',verified:'copied-source'});
  }
 };await walk(source);
}
async function syncProject({registry,projectId,project,register,readJiraIssue,strictJira=false,strictJiraKeys=[]}={}){
 const root=projectRoot(registry,projectId),hub=hubRoot(registry,projectId);await safeDirs(root,'unified-artifacts');
 return withLock(path.join(hub,'.sync.lock'),async()=>{
  const staging=path.join(hub,'.stage-'+crypto.randomUUID());await fs.mkdir(staging,{mode:0o700});
  const manifest={schema:1,projectId,generatedAt:now(),roles:['business-analyst','solution-architect','ui-ux-designer','developer'],files:[],jira:[],warnings:[],missingJira:[],brs:[]};
  const add=async(role,relative,data,source,verified='registered')=>{const item=typeof data==='string'||Buffer.isBuffer(data)?await writeFile(staging,relative,data):await json(staging,relative,data);manifest.files.push({...item,role,source,verified});};
  try{
   const brs=(register?.brs||[]).filter(b=>b?.approvedContent&&b?.approvedRevision);
   for(const br of brs){const id=safeBr(br.id);manifest.brs.push({id,revision:br.approvedRevision,title:br.approvedContent.title});await add('business-analyst',`roles/business-analyst/approved-brs/${id}.md`,brWorkflow.asMarkdown(br),`approved-br:${id}:${br.approvedRevision}`,'approved');}
   await add('business-analyst','roles/business-analyst/discovery.json',{discoveryRevision:register?.discoveryRevision||'',mappingCompleted:register?.mappingCompleted||null,discoveryAnswers:register?.discoveryAnswers||{}},'BR discovery register');
   for(const item of register?.sourceDocuments||[]){
    if(!item?.storedName)throw Error('Active BA document is missing verified original file reference: '+String(item?.name||''));
    const bytes=await sourceStore.originalBytes(registry,projectId,item);
    const source=await sourceStore.read(registry,projectId,item);
    const suffix=path.extname(item.storedName).toLowerCase(),stem=item.digest;
    await add('business-analyst',`roles/business-analyst/source-documents/${stem}${suffix}`,bytes,'uploaded:'+short(item.name,200),'sha256-verified');
    await add('business-analyst',`roles/business-analyst/source-documents/${stem}.txt`,source.text,'extracted:'+short(item.name,200),'sha256-verified');
   }
   const stack={id:project?.techStackId||'',prepared:project?.techStackPrepared||null,approval:project?.techStackApproval||null};
   await add('solution-architect','roles/solution-architect/approved-stack.json',stack,'project stack approval');
   for(const [kind,versions] of Object.entries(register?.designs||{}))for(const d of versions||[]){
    if(!d?.design||d.status!=='approved')continue;
    await add('ui-ux-designer',`roles/ui-ux-designer/approved-designs/${safeBr(kind)}-revision-${Number(d.number)||0}.json`,{
     kind,number:d.number,status:d.status,design:d.design,sourceBusinessRequirements:d.sourceBusinessRequirements||[],approvedAt:d.approvedAt||null},'approved design register','approved');
   }
   // The canonical document repository includes role-specific outputs for PM,
   // QA, architect, BA, UX and developer when those roles have registered files.
   const docIndex=await unified.load(registry,projectId);
   for(const doc of Object.values(docIndex.documents||{}))if(/^[a-z][a-z0-9-]{0,70}$/.test(doc?.roleId||'')&&!manifest.roles.includes(doc.roleId))manifest.roles.push(doc.roleId);
   await add('shared','shared/unified-document-index.json',{schema:docIndex.schema,revision:docIndex.revision,documents:docIndex.documents},'unified document repository');
   for(const doc of Object.values(docIndex.documents||{})){
    if(!doc||!doc.path||doc.external||doc.status==='placeholder'||String(doc.path).startsWith('documents/'))continue;
    const rel=String(doc.path).replace(/\\/g,'/');
    if(!OK_EXT.has(path.extname(rel).toLowerCase()))continue;
    const absolute=await unified.safePath(root,rel);
    const st=await fs.lstat(absolute).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
    if(!st){manifest.warnings.push('Registered role document unavailable: '+rel);continue;}
    if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe registered role artifact: '+rel);
    if(st.size>MAX_FILE_BYTES)throw Error('Registered role artifact is too large to unify: '+rel);
    const role=/^[a-z][a-z0-9-]{0,70}$/.test(doc.roleId||'')?doc.roleId:'shared';
    if(!manifest.roles.includes(role))manifest.roles.push(role);
    await add(role,`roles/${role}/registered/${sha(rel).slice(0,24)}${path.extname(rel).toLowerCase()}`,await fs.readFile(absolute),rel,doc.status==='approved'?'approved':'draft');
    manifest.files.at(-1).sourceRefs=Array.isArray(doc.sourceRefs)?doc.sourceRefs:[];
   }
   const jiraMap=Object.entries(register?.synced||{}).filter(([,v])=>/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(String(v?.key||'')));
   const byKey=new Map();for(const [nodePath,item] of jiraMap)byKey.set(item.key,{key:item.key,nodePath,title:short(item.title||'',500),kind:String(item.kind||item.issueType||'')});
   const issueRows=[...byKey.values()];
   for(let offset=0;offset<issueRows.length;offset+=6){
    const batch=issueRows.slice(offset,offset+6);
    const details=await Promise.all(batch.map(async row=>{
     if(!readJiraIssue)return {remote:null};
     try{return {remote:jiraSummary(await readJiraIssue(row.key),row.key)};}
     catch(error){return {remote:null,error:short(error.message,350)};}
    }));
    for(let i=0;i<batch.length;i++){
     const row=batch[i],result=details[i];
     if(result.error)manifest.missingJira.push({key:row.key,error:result.error});
     if(strictJira&&readJiraIssue&&!result.remote&&(!strictJiraKeys.length||strictJiraKeys.includes(row.key)))continue;
     const saved={...row,remote:result.remote};manifest.jira.push(saved);
     await add('shared',`shared/jira/${row.key}.json`,saved,'Jira '+row.key,result.remote?'remote-verified':'local-register');
    }
   }
   const missingCritical=manifest.missingJira.filter(row=>!strictJiraKeys.length||strictJiraKeys.includes(row.key));
   if(strictJira&&missingCritical.length)throw Error(`Unable to extract ${missingCritical.length} linked Jira issue(s) for the shared development plan (${missingCritical.slice(0,5).map(row=>row.key).join(', ')}). Verify Jira access and retry; no incomplete plan was generated.`);
   await copyDocuments(root,staging,manifest);
   await json(staging,'manifest.json',manifest);
   const current=path.join(hub,'current'),backup=path.join(hub,'.old-'+crypto.randomUUID());
   const old=await checkNoSymlink(current);if(old){if(!old.isDirectory())throw Error('Invalid existing unified artifact folder.');await fs.rename(current,backup);}
   try{await fs.rename(staging,current);}catch(error){if(old)await fs.rename(backup,current);throw error;}
   if(old)await fs.rm(backup,{recursive:true,force:true});
   return {root:hub,current,manifest};
  }finally{await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
 });
}
function subsetForBr(manifest,register,br,designs=[]){
 const id=br.id,revision=br.approvedRevision;
 const paths=new Set([`roles/business-analyst/approved-brs/${id}.md`,'roles/business-analyst/discovery.json','roles/solution-architect/approved-stack.json','shared/unified-document-index.json']);
 for(const source of brSources(register,br))for(const ext of [path.extname(source.storedName),'.txt'])paths.add(`roles/business-analyst/source-documents/${source.digest}${ext}`);
 const keys=new Set(manifest.jira.filter(j=>j.nodePath===id||j.nodePath.startsWith(id+'/')).map(j=>j.key));for(const key of keys)paths.add(`shared/jira/${key}.json`);
 // Approved project architecture applies across BRs; other approved role
 // documents must explicitly reference this BR revision to constrain it.
 for(const f of manifest.files){
  if(f.verified!=='approved'||!f.path.includes('/registered/'))continue;
  if(f.role==='solution-architect'||(f.sourceRefs||[]).some(ref=>ref.id===id&&Number(ref.revision)===Number(revision)))paths.add(f.path);
 }
 // Approved design records must explicitly reference this BR revision.
 for(const [kind,versions] of Object.entries(register?.designs||{})){
  for(const item of versions||[]){
   if(item?.status!=='approved'||!item.design||!(item.sourceBusinessRequirements||[]).some(link=>link.id===id&&Number(link.revision)===Number(revision)))continue;
   paths.add(`roles/ui-ux-designer/approved-designs/${safeBr(kind)}-revision-${Number(item.number)||0}.json`);
  }
 }
 for(const f of manifest.files){
  if(f.role!=='ui-ux-designer'||!f.path.startsWith('shared/documents/jira-designs/'))continue;
  const ticket=f.path.split('/')[3];if((designs||[]).some(d=>d.kind==='ux-ticket'&&d.sourceTicketKey===ticket))paths.add(f.path);
 }
 return {paths,keys:[...keys],designs};
}
async function prepareDevelopment({registry,projectId,register,br,project,approvedDesignHandoff=[],readJiraIssue}={}){
 const ownedKeys=Object.entries(register?.synced||{}).filter(([p])=>p===br.id||p.startsWith(br.id+'/')).map(([,v])=>v?.key).filter(Boolean);
 const hub=await syncProject({registry,projectId,project,register,readJiraIssue,strictJira:Boolean(readJiraIssue),strictJiraKeys:ownedKeys});
 const subset=subsetForBr(hub.manifest,register,br,approvedDesignHandoff),id=safeBr(br.id),revision=Number(br.approvedRevision);
 const base=path.join(hub.root,'development',id,`revision-${revision}`),target=path.join(base,'context');
 await safeDirs(hub.root,`development/${id}/revision-${revision}`);
 const staging=path.join(base,'.context-'+crypto.randomUUID());await fs.mkdir(staging,{mode:0o700});
 const selected=[];
 try{
  for(const original of hub.manifest.files.filter(f=>subset.paths.has(f.path))){
   // Preserve only files identified in the approved BR evidence map.
   const source=path.join(hub.current,...original.path.split('/'));const actual=await fs.readFile(source);
   if(sha(actual)!==original.sha256)throw Error('Unified artifact source changed during development context preparation: '+original.path);
   const result=await writeFile(staging,original.path,actual);selected.push({...result,role:original.role,source:original.source,verified:original.verified});
  }
  const handoff=await json(staging,'approved-ui-ux-handoff.json',approvedDesignHandoff||[]);selected.push({...handoff,role:'ui-ux-designer',source:'approved linked UI/UX handoff',verified:'approved'});
  const snapshot={schema:1,projectId,brId:id,revision,stackSha:project?.techStackPrepared?.sha||'',createdAt:now(),files:selected,jiraKeys:subset.keys,approvedBrSource:`roles/business-analyst/approved-brs/${id}.md`};
  snapshot.digest=sha(JSON.stringify({brId:id,revision,stackSha:snapshot.stackSha,files:selected.map(f=>[f.path,f.sha256])}));
  await json(staging,'context-manifest.json',snapshot);
  const old=await checkNoSymlink(target);
  if(old){if(!old.isDirectory())throw Error('Invalid existing development context.');const prior=await fs.readFile(path.join(target,'context-manifest.json'),'utf8').then(JSON.parse);if(prior.digest!==snapshot.digest)throw Error('Approved development evidence changed after the context was frozen. Use a new approved revision or explicit context review; existing plan preserved.');await fs.rm(staging,{recursive:true});return {root:hub.root,context:target,manifest:prior};}
  await fs.rename(staging,target);return {root:hub.root,context:target,manifest:snapshot};
 }finally{await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
}
async function verifyContext(contextPath,expected={}){
 const root=path.resolve(contextPath),raw=await fs.readFile(path.join(root,'context-manifest.json'),'utf8'),manifest=JSON.parse(raw);
 if(manifest.schema!==1||manifest.brId!==expected.brId||Number(manifest.revision)!==Number(expected.revision)||(expected.stackSha&&manifest.stackSha!==expected.stackSha))throw Error('Development evidence identity changed; recovery blocked.');
 const seen=new Set();for(const file of manifest.files){const relative=String(file.path||'');if(!relative||relative.includes('..')||path.isAbsolute(relative)||seen.has(relative))throw Error('Invalid development evidence manifest path.');seen.add(relative);const full=path.resolve(root,relative);if(!full.startsWith(root+path.sep))throw Error('Development evidence escaped snapshot.');let cur=root;for(const part of relative.split('/')){cur=path.join(cur,part);if((await fs.lstat(cur)).isSymbolicLink())throw Error('Development evidence symlink detected.');}if(sha(await fs.readFile(full))!==file.sha256)throw Error('Development evidence was modified: '+relative);}
 const digest=sha(JSON.stringify({brId:manifest.brId,revision:manifest.revision,stackSha:manifest.stackSha,files:manifest.files.map(f=>[f.path,f.sha256])}));
 if(digest!==manifest.digest)throw Error('Development context manifest digest changed.');return manifest;
}
async function contextForPlan(contextPath,manifest){
 const root=path.resolve(contextPath),read=async p=>fs.readFile(path.join(root,...p.split('/')),'utf8');
 const brText=await read(manifest.approvedBrSource),texts=[],jira=[];
 for(const f of manifest.files){
  if(f.path.endsWith('.txt')&&f.path.includes('/source-documents/'))texts.push({source:f.source,text:short(await read(f.path),15000)});
  if(f.path.startsWith('shared/jira/'))jira.push(JSON.parse(await read(f.path)));
 }
 const discovery=JSON.parse(await read('roles/business-analyst/discovery.json'));
 const stack=JSON.parse(await read('roles/solution-architect/approved-stack.json'));
 const handoff=JSON.parse(await read('approved-ui-ux-handoff.json'));
 return {brText,sourceDocuments:texts,discoveryAnswers:discovery.discoveryAnswers||{},discoveryRevision:discovery.discoveryRevision||'',stack,jira,approvedDesignHandoff:handoff,artifactIndex:manifest.files.map(f=>({path:f.path,sha256:f.sha256,verified:f.verified,source:f.source})),digest:manifest.digest};
}
async function savePlan(contextPath,criteria,record){
 const base=path.dirname(contextPath),contract={brId:record.brId,revision:record.revision,contextDigest:record.contextDigest,createdAt:now(),criteria:criteria.map(c=>({id:c.id,description:c.description,acceptance:c.acceptance,jiraKey:c.jiraKey||''}))};
 await json(base,'development-plan.json',contract);
 await json(base,'test-plan.json',{...contract,tests:criteria.map(c=>({criterionId:c.id,expected:c.acceptance,source:'approved BR and context-manifest.json',jiraKey:c.jiraKey||'',status:'planned; RED test generation pending'}))});
 return {developmentPlan:path.join(base,'development-plan.json'),testPlan:path.join(base,'test-plan.json')};
}
async function persistDeveloperRecord(registry,projectId,record){
 if(!record?.brId||!Number.isFinite(Number(record.revision)))throw Error('Cannot index development evidence without BR identity and revision.');
 const id=safeBr(record.brId),revision=Number(record.revision),base=hubRoot(registry,projectId);
 await safeDirs(base,`development/${id}/revision-${revision}/evidence`);
 const file=`development/${id}/revision-${revision}/evidence/tdd-summary.json`;
 // Keep the shared index compact and credential-safe. The original detailed
 // runner logs remain in the protected TDD evidence store.
 const summary={schema:1,brId:id,revision,updatedAt:now(),phase:record.phase||'',status:record.status||'',model:record.model||'',
  contextDigest:record.contextDigest||'',contextPath:record.contextPath||'',runId:record.runId||'',retryCount:Number(record.retryCount)||0,
  branch:record.branch||'',criteria:(record.criteria||[]).map(c=>({id:c.id,status:c.status,description:short(c.description,1200),jiraKey:c.jiraKey||'',testFiles:c.testFiles||[],codeFiles:c.codeFiles||[]})),
  issueLedger:(record.issueLedger||[]).map(e=>({criterion:e.criterion,category:e.category,status:e.status,occurrences:e.occurrences})),
  modelHistory:(record.modelHistory||[]).slice(-50),repairCount:(record.repairHistory||[]).length,
  lastRepair:record.lastRepair?{criterion:record.lastRepair.criterion,category:record.lastRepair.category,outcome:record.lastRepair.outcome,at:record.lastRepair.at}:null};
 await json(base,file,summary);return path.join(base,file);
}
module.exports={hubRoot,syncProject,prepareDevelopment,verifyContext,contextForPlan,savePlan,persistDeveloperRecord,adfText,brSources};
