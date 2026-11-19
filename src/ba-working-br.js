'use strict';
// Build a source-preserving BA working draft, validate its inputs, and store it
// separately from the uploaded original. A passing preflight is not a test run.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const preflight=require('./ba-document-preflight');
const DIGEST=/^[a-f0-9]{64}$/;
const hash=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
const clean=value=>String(value||'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,180);

function prepare(source,sections,reports){
 if(!source||typeof source.text!=='string'||!source.text.trim()||!DIGEST.test(String(source.digest||'')))throw Error('A verified source is required for the working BR.');
 if(!Array.isArray(sections)||!sections.length||sections.length>25||sections.some(text=>typeof text!=='string')||sections.join('')!==source.text)throw Error('Working BR source coverage validation failed.');
 if(!Array.isArray(reports)||reports.length!==sections.length)throw Error('All document sections must finish preflight before mapping.');
 const workingSections=[],guidance=[];let correctionCount=0;
 const verificationIncomplete=reports.some(x=>x.degraded===true||x.status==='needs-review');
 for(let i=0;i<sections.length;i++){
  const report=reports[i];
  if(!report||report.ready!==true||!Array.isArray(report.blockers)||report.blockers.length)throw Error('A preflight blocker must be resolved before mapping.');
  let text=sections[i];
  for(const edit of report.applied||[]){
   if(!preflight.safeEdit(edit.before,edit.after,text))throw Error('Working BR correction validation failed.');
   text=text.replace(edit.before,edit.after);correctionCount++;
  }
  if(text!==report.effectiveText)throw Error('Working BR changed outside the validated corrections.');
  for(const item of report.resolutions||[]){
   if(!preflight.isCuratedGuidance(item))throw Error('Unrecognized or unlabelled standards guidance.');
   if(item.sourceExcerpt&&!sections[i].includes(item.sourceExcerpt))throw Error('Working BR contains an unverified source excerpt.');
   guidance.push({section:i+1,...item});
  }
  workingSections.push({text,guidance:preflight.mappingGuidance(report)});
 }
 const checks=[
  {label:'Complete extracted source coverage',status:'PASS'},
  {label:'Working-copy spelling corrections validated',status:'PASS'},
  {label:'Curated guidance identified as provisional',status:'PASS'},
  {label:'AI preflight quality and contradiction review',status:verificationIncomplete?'NOT VERIFIED — BA REVIEW REQUIRED':'PASS'}
 ];
 let maxFence=3;for(const match of source.text.matchAll(/~+/g))maxFence=Math.max(maxFence,match[0].length+1);
 const fence='~'.repeat(maxFence);
 const lines=['# Business Requirements','','## Purpose','AI-updated working draft for discovery mapping. The original upload is unchanged.','','## Source Business Requirements',
  '- Source: '+clean(source.name),'- Source reference SHA-256: '+source.digest,
  '- Extracted text SHA-256: '+hash(source.text),'- Original file SHA-256: '+(DIGEST.test(String(source.byteDigest||''))?source.byteDigest:'Not recorded'),
  '','## Draft','The following source text includes '+correctionCount+' validated spelling correction(s).',fence+'text',workingSections.map(s=>s.text).join(''),fence,
  '','## Review and Approvals','Pending human review. This working draft is not an approved Business Requirement.','','## Provisional Standards Guidance'];
 if(!guidance.length)lines.push('None recorded.');
 for(const item of guidance)lines.push('','### Section '+item.section+' · '+clean(item.category),'- Basis: '+item.standard,
  '- Source excerpt: '+(item.sourceExcerpt||'No verified quotation available.'),'- Finding: '+item.issue,
  '- Provisional recommendation: '+item.resolution,'- Rationale: '+item.rationale);
 lines.push('','## Preflight Validation',...checks.map(item=>'- '+item.label+': '+item.status),
  '- Application and acceptance tests: NOT RUN; these require an implemented application.',
  verificationIncomplete?'- Mandatory next step: Business Analyst must review source-only mapping, open decisions and unresolved AI checks before approval.':'', '');
 return {content:lines.join('\n'),sections:workingSections,checks,correctionCount};
}

async function directory(registry,id,{create=false}={}){
 const root=path.dirname(registry.fileFor(id));
 const parts=[root,path.join(root,'documents'),path.join(root,'documents','requirements'),path.join(root,'documents','requirements','preflight-working')];
 for(const part of parts){
  let stat=await fs.lstat(part).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!stat&&create){try{await fs.mkdir(part);}catch(e){if(e.code!=='EEXIST')throw e;}stat=await fs.lstat(part);}
  if(!stat){if(!create)return null;throw Error('Working BR folder is unavailable.');}
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe working BR folder.');
 }
 return parts.at(-1);
}
async function store(registry,id,sourceDigest,content){
 if(!DIGEST.test(String(sourceDigest||''))||typeof content!=='string'||!content||content.length>1000000)throw Error('Invalid working BR.');
 const digest=hash(content),filename=sourceDigest+'-'+digest+'.md',folder=await directory(registry,id,{create:true}),file=path.join(folder,filename);
 let created=false;
 try{await fs.writeFile(file,content,{flag:'wx',mode:0o600});created=true;}
 catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await fs.lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink()||hash(await fs.readFile(file,'utf8'))!==digest){if(created)await fs.rm(file,{force:true});throw Error('Working BR integrity check failed.');}
 return {filename,digest,sourceDigest};
}
async function read(registry,id,ref){
 if(!ref||!DIGEST.test(String(ref.sourceDigest||''))||!DIGEST.test(String(ref.digest||''))||ref.filename!==ref.sourceDigest+'-'+ref.digest+'.md')throw Error('Invalid working BR reference.');
 const folder=await directory(registry,id),file=folder&&path.join(folder,ref.filename);
 if(!file)throw Error('The AI-updated working BR is unavailable.');
 const stat=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat||!stat.isFile()||stat.isSymbolicLink())throw Error('The AI-updated working BR is unavailable.');
 const text=await fs.readFile(file,'utf8');if(hash(text)!==ref.digest)throw Error('The AI-updated working BR changed on disk. Re-run mapping.');
 return text;
}
async function removeForSource(registry,id,sourceDigest){
 if(!DIGEST.test(String(sourceDigest||'')))throw Error('Invalid working BR source.');
 const folder=await directory(registry,id);if(!folder)return;
 for(const name of await fs.readdir(folder)){
  if(!new RegExp('^'+sourceDigest+'-[a-f0-9]{64}\\.md$').test(name))continue;
  const file=path.join(folder,name),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe working BR file.');
  await fs.unlink(file);
 }
}
module.exports={prepare,store,read,removeForSource};
