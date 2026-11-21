'use strict';
// Confluence source vault: immutable original uploads + a versioned project
// manifest. Remote state may fill a new/unchanged local project, never overwrite
// divergent local work. All downloaded bytes are SHA-256 verified.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {Blob}=require('node:buffer');
const {getConfluenceSpace,baseConfluence,writeConfluence,requestJson}=require('./clients');
const brWorkflow=require('./br-workflow');
const sourceStore=require('./source-store');
const {checksum}=require('./document-editor');
const DIGEST=/^[a-f0-9]{64}$/;
// Confluence Cloud attachment IDs can be numeric or prefixed with "att".
// Accept only documented safe ID shapes; preserve the exact server-provided ID.
const ATTACHMENT_ID=/^(?:att)?[0-9]+$/;
const PROJECT=/^[a-z][a-z0-9-]{0,48}$/;
const FILE=/^[a-f0-9]{64}\.(?:pdf|docx)$/;
const OTHER=/\.(?:pdf|docx|doc|pptx|xlsx|xls|png|jpg|jpeg|webp)$/i;
const LIMIT_BYTES=100*1024*1024;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const message=e=>String(e?.message||e).slice(0,350);
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
function isSafeRelative(value){
 if(typeof value!=='string'||value.length>500||!value||value.includes('\\')||value.includes('\0'))return false;
 return value.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!p.startsWith('.'));
}
function validDocument(entry){
 return plain(entry)&&DIGEST.test(String(entry.digest||''))&&DIGEST.test(String(entry.byteDigest||''))&&
 FILE.test(String(entry.storedName||''))&&entry.storedName.startsWith(entry.digest+'.')&&
 typeof entry.name==='string'&&entry.name.length>0&&entry.name.length<=220;
}
function cleanRecord(source){
 const {revision,jiraPendingChanges,jiraPendingRetirements,...raw}=source;
 // Published identities are preserved. Pending remote operations are NOT
 // replayed on a different machine: Jira preflight must revalidate them.
 return {...raw,pending:{},roleTaskPending:{},exportJobs:{},restartRecovery:null};
}
function validateManifest(manifest,projectId,spaceId){
 if(!plain(manifest)||manifest.schema!==1||manifest.projectId!==projectId||manifest.spaceId!==String(spaceId)||
  !plain(manifest.register)||manifest.register.schema!==1||!Array.isArray(manifest.register.brs)||
  !plain(manifest.register.synced)||!plain(manifest.register.links)||
  !Array.isArray(manifest.documents)||manifest.documents.some(x=>!validDocument(x))||
  !Array.isArray(manifest.files)||manifest.files.some(x=>!plain(x)||!isSafeRelative(x.relative)||
    !OTHER.test(x.relative)||!DIGEST.test(String(x.byteDigest||''))||
    !/^ATGV-[a-f0-9]{64}\.(?:pdf|docx|doc|pptx|xlsx|xls|png|jpg|jpeg|webp)$/i.test(String(x.attachment||'')))||
  (manifest.discovery!==null&&typeof manifest.discovery!=='string'))throw Error('Confluence source manifest is invalid or belongs to another project/space.');
 if(manifest.documents.length>30000||manifest.files.length>30000)throw Error('Confluence source manifest exceeds supported safety limits.');
 return manifest;
}
async function snapshot(registry,projectId){
 const root=path.dirname(registry.fileFor(projectId));
 const register=await brWorkflow.load(registry,projectId);
 const rawFile=path.join(root,'documents','requirements','br-register.json');
 const raw=await fs.readFile(rawFile,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 const normalized=raw?JSON.parse(raw):cleanRecord(register);
 const discovery=await fs.readFile(path.join(root,'documents','requirements','discovery-12.json'),'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 const docs=new Map();
 for(const entry of [...(register.sourceDocuments||[]),...(register.archivedSources||[]),...Object.values(register.sourceVersions||{}).filter(entry=>!['deleted-unused','deleted-everywhere','deleted'].includes(entry?.status))]){
  if(!validDocument(entry))continue;docs.set(entry.storedName,{name:entry.name,digest:entry.digest,
   byteDigest:entry.byteDigest,storedName:entry.storedName,uploadedAt:entry.uploadedAt||'',version:Number(entry.version||1)});
 }
 const files=[];
 const dir=path.join(root,'documents');
 async function traverse(folder,relative=''){
  const entries=await fs.readdir(folder,{withFileTypes:true}).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
  for(const entry of entries){
   if(entry.isSymbolicLink())continue;
   const rel=relative?relative+'/'+entry.name:entry.name;
   if(!isSafeRelative(rel))continue;
   const current=path.join(folder,entry.name);
   if(entry.isDirectory()){if(rel!=='requirements/sources')await traverse(current,rel);continue;}
   if(!entry.isFile()||!OTHER.test(rel)||rel.startsWith('requirements/sources/'))continue;
   const stat=await fs.lstat(current);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>LIMIT_BYTES)continue;
   const bytes=await fs.readFile(current),digest=sha(bytes),ext=path.extname(rel).toLowerCase();
   files.push({relative:rel,byteDigest:digest,attachment:'ATGV-'+digest+ext,bytes:stat.size});
  }
 }
 await traverse(dir);
 return {register:normalized,discovery,documents:[...docs.values()],files};
}
// A missing local sync journal can be rebuilt ONLY from an independently
// verified, content-identical project. Do not compare manifest upload timestamps,
// attachment IDs or register revisions; they are not project content.
// Every other BR field, Discovery answer, document identity and file checksum
// must match exactly. This never merges unrelated edits.
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
}
function comparableSnapshot(data){
 const register=cleanRecord(data.register);
 // This event is created solely by a verified remote restore. It does not
 // change BR contents and must not stop the baseline from being rebuilt.
 register.events=(register.events||[]).filter(event=>event?.action!=='confluence-source-vault-restored');
 const documents=(data.documents||[]).map(d=>({
  name:d.name,digest:d.digest,byteDigest:d.byteDigest,storedName:d.storedName,
  uploadedAt:d.uploadedAt||'',version:Number(d.version||1)
 })).sort((a,b)=>a.storedName.localeCompare(b.storedName));
 const files=(data.files||[]).map(f=>({
  relative:f.relative,byteDigest:f.byteDigest,attachment:f.attachment,bytes:f.bytes
 })).sort((a,b)=>a.relative.localeCompare(b.relative));
 return stable({register,discovery:data.discovery||null,documents,files});
}
function sameProjectContent(local,remote){
 return JSON.stringify(comparableSnapshot(local))===JSON.stringify(comparableSnapshot(remote));
}
function contentDifferences(local,remote){
 const a=comparableSnapshot(local),b=comparableSnapshot(remote),changes=[];
 for(const [name,label] of [['register','Business Requirements'],['discovery','Discovery answers'],
  ['documents','source documents'],['files','uploaded project files']]){
  if(JSON.stringify(a[name])!==JSON.stringify(b[name]))changes.push(label);
 }
 return changes;
}
function snapshotHash(snapshot){return sha(Buffer.from(JSON.stringify(snapshot)));}
async function safeWrite(file,bytes,expected){
 if(!DIGEST.test(expected)||sha(bytes)!==expected)throw Error('Confluence download checksum mismatch. Original upload was not restored.');
 const dest=path.resolve(file),root=path.parse(dest).root;
 const parts=path.relative(root,path.dirname(dest)).split(path.sep).filter(Boolean);
 let current=root;
 for(const part of parts){
  current=path.join(current,part);
  const st=await fs.lstat(current).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(st&&(st.isSymbolicLink()||!st.isDirectory()))throw Error('Unsafe source restoration directory.');
  if(!st)await fs.mkdir(current);
 }
 const existing=await fs.lstat(dest).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(existing){
  if(!existing.isFile()||existing.isSymbolicLink())throw Error('Unsafe existing local source file.');
  if(sha(await fs.readFile(dest))!==expected)throw Error('Local document differs from Confluence. Preserved; resolve the conflict manually.');
  return false;
 }
 const tmp=dest+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{await fs.writeFile(tmp,bytes,{flag:'wx',mode:0o600});await fs.rename(tmp,dest);}
 finally{await fs.rm(tmp,{force:true});}
 return true;
}
class ConfluenceSourceVault{
 constructor({registry,projectId,config,token,fetchImpl=fetch}){
  if(!PROJECT.test(String(projectId)))throw Error('Invalid source vault project.');
  this.registry=registry;this.projectId=projectId;this.config=config;this.token=token;
  this.fetch=fetchImpl;this.base=baseConfluence(config);
  this.root=path.dirname(registry.fileFor(projectId));
  this.stateFile=path.join(this.root,'knowledge','confluence-source-vault.json');
  this.auth=(config.get('jira.email')?.trim()?'Basic '+Buffer.from(config.get('jira.email').trim()+':'+token).toString('base64'):'Bearer '+token);
 }
 async localHistory(){
  const data=await fs.readFile(this.stateFile,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
  if(!data)return {};
  const parsed=JSON.parse(data);
  return plain(parsed)&&parsed.spaceId&&parsed.projectId===this.projectId?parsed:{};
 }
 async recordHistory(spaceId,remoteHash){
  const localHash=snapshotHash(await snapshot(this.registry,this.projectId));
  await fs.mkdir(path.dirname(this.stateFile),{recursive:true});
  const tmp=this.stateFile+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{await fs.writeFile(tmp,JSON.stringify({schema:1,projectId:this.projectId,spaceId:String(spaceId),remoteHash,localHash,at:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,this.stateFile);}
  finally{await fs.rm(tmp,{force:true});}
 }
 async page(space,create){
  const title='ATGV · Source Vault · '+space.key+' · '+this.projectId;
  const result=await requestJson(this.base+'/api/v2/pages?space-id='+encodeURIComponent(String(space.id))+'&title='+encodeURIComponent(title)+'&limit=25',
   {token:this.token,basicEmail:this.config.get('jira.email')});
  const exact=(result.results||[]).filter(p=>p.title===title&&String(p.spaceId||space.id)===String(space.id)&&p.status!=='trashed');
  if(exact.length>1)throw Error('Multiple Confluence source vault pages found; resolve duplicates manually.');
  if(exact.length)return exact[0];
  if(!create)return null;
  const created=await writeConfluence(this.config,this.token,{spaceId:space.id,title,
   bodyHtml:'<p>ATGV project source documents, immutable original uploads, and verified project recovery manifest. Do not edit attachment bytes manually.</p>',version:0});
  if(!/^\d+$/.test(String(created?.id||'')))throw Error('Confluence created a source vault without a valid page ID.');
  return created;
 }
 async attachments(pageId){
  const results=[];let start=0;
  for(let index=0;index<200;index++){
   const data=await requestJson(this.base+'/rest/api/content/'+encodeURIComponent(pageId)+'/child/attachment?limit=100&start='+start,
    {token:this.token,basicEmail:this.config.get('jira.email')});
   const batch=Array.isArray(data.results)?data.results:[];
   results.push(...batch);
   if(batch.length<100)return results;
   start+=batch.length;
  }
  throw Error('Source vault has too many attachments to verify in one operation.');
 }
 async requestBinary(url,{method='GET',body=null,headers={},max=LIMIT_BYTES}={}){
  const baseOrigin=new URL(this.base).origin;let next=new URL(url,baseOrigin),redirects=0,auth=true;
  while(true){
   if(next.protocol!=='https:'||(![baseOrigin].includes(next.origin)&&
     !/(^|\.)atlassian\.(?:net|com)$/.test(next.hostname)&&
     !/(^|\.)atl-paas\.net$/.test(next.hostname)))throw Error('Confluence attachment returned an untrusted download location.');
   const response=await this.fetch(next.toString(),{method,body,headers:{
    Accept:'*/*',...(auth?{Authorization:this.auth}:{}),...headers
   },redirect:'manual',signal:AbortSignal.timeout(120000)});
   if([301,302,303,307,308].includes(response.status)){
    if(++redirects>4||method!=='GET')throw Error('Unexpected Confluence attachment redirect.');
    const location=response.headers.get('location');if(!location)throw Error('Confluence redirect has no destination.');
    const dest=new URL(location,next);auth=dest.origin===baseOrigin;next=dest;continue;
   }
   if(!response.ok)throw Error('Confluence attachment '+method+' HTTP '+response.status+'. Check Confluence page attachment permissions.');
   const size=Number(response.headers.get('content-length')||0);
   if(size>max)throw Error('Confluence attachment exceeds the verified download size limit.');
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>max)throw Error('Confluence attachment download is too large.');
   return bytes;
  }
 }
 async upload(pageId,name,bytes){
  const form=new FormData();
  form.append('file',new Blob([bytes]),name);
  const data=await this.requestBinary(this.base+'/rest/api/content/'+encodeURIComponent(pageId)+'/child/attachment',
   {method:'POST',body:form,headers:{'X-Atlassian-Token':'nocheck',Accept:'application/json'},max:1024*1024});
  const value=JSON.parse(data.toString('utf8'));
  const entry=value.results?.find(x=>x.title===name);
  if(!ATTACHMENT_ID.test(String(entry?.id||'')))throw Error('Confluence upload response did not confirm a valid attachment ID for the requested file.');
  return entry;
 }
 async download(pageId,entry,expected){
  if(!ATTACHMENT_ID.test(String(entry?.id||'')))throw Error('Invalid Confluence attachment ID.');
  const bytes=await this.requestBinary(this.base+'/rest/api/content/'+encodeURIComponent(pageId)+'/child/attachment/'+encodeURIComponent(entry.id)+'/download');
  if(expected&&sha(bytes)!==expected)throw Error('Confluence attachment checksum differs from the original bytes; local documents were preserved.');
  return bytes;
 }
 async restore(manifest,remoteHash,space,pageId,attachments,{allowRegister=false,allowUpdate=false,expectedLocalHash=''}={}){
  const result={downloaded:0,restored:false,conflicts:[],uploaded:0};
  const restoreFile=async(file,item,expected)=>{
   const existing=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
   if(existing){
    if(!existing.isFile()||existing.isSymbolicLink())throw Error('Unsafe local file or symbolic link.');
    if(sha(await fs.readFile(file))===expected)return false;
    throw Error('Local bytes differ from verified Confluence source; preserve existing file.');
   }
   return safeWrite(file,await this.download(pageId,item,expected),expected);
  };
  const byName=new Map(attachments.map(x=>[x.title,x]));
  for(const doc of manifest.documents){
   const file=path.join(this.root,'documents','requirements','sources',doc.storedName);
   const item=byName.get(doc.storedName);
   if(!item){result.conflicts.push('Missing Confluence original: '+doc.name);continue;}
   try{if(await restoreFile(file,item,doc.byteDigest))result.downloaded++;}
   catch(e){result.conflicts.push(doc.name+': '+message(e));}
  }
  for(const doc of manifest.files){
   const file=path.join(this.root,'documents',...doc.relative.split('/'));
   const item=byName.get(doc.attachment);
   if(!item){result.conflicts.push('Missing Confluence document: '+doc.relative);continue;}
   try{if(await restoreFile(file,item,doc.byteDigest))result.downloaded++;}
   catch(e){result.conflicts.push(doc.relative+': '+message(e));}
  }
  if(allowRegister&&!result.conflicts.length){
   const current=await brWorkflow.load(this.registry,this.projectId);
   const blank=!current.brs.length&&!current.sourceDocuments.length&&
    !Object.keys(current.synced||{}).length&&!Object.keys(current.pending||{}).length;
   if(!blank&&!allowUpdate)throw Error('Local BR project changed during Confluence restore. Local changes were preserved.');
   if(!blank){
    const latest=await snapshot(this.registry,this.projectId);
    if(!expectedLocalHash||snapshotHash(latest)!==expectedLocalHash||Object.keys(current.pending||{}).length)
     throw Error('Local BR project changed during remote synchronization. Preserved local work.');
   }
   const remote=structuredClone(manifest.register);
   if(remote.brs.some(b=>!/^BR-[0-9]+$/.test(String(b.id||'')))||
     remote.sourceDocuments?.some(x=>!validDocument(x))||
     remote.archivedSources?.some(x=>!validDocument(x))||
     Object.values(remote.synced||{}).some(x=>x?.key&&!/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(String(x.key))))
    throw Error('Untrusted Confluence BR/Jira identity detected. Manual reconciliation required.');
   // Only a verified empty or unchanged local project can adopt remote state.
   // Never revive in-flight Jira updates after switching computers.
   await brWorkflow.write(this.registry,this.projectId,current.revision,next=>{
    Object.assign(next,remote,{pending:{},roleTaskPending:{},exportJobs:{},restartRecovery:null});
    next.events=(next.events||[]).concat({at:new Date().toISOString(),action:'confluence-source-vault-restored',remotePage:String(pageId),remotePendingSkipped:true}).slice(-200);
   });
   const discoveryPath=path.join(this.root,'documents','requirements','discovery-12.json');
   const existing=await fs.readFile(discoveryPath,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
   if(manifest.discovery&&existing!==manifest.discovery){
    const parsed=JSON.parse(manifest.discovery);
    if(!plain(parsed)||!plain(parsed.answers))throw Error('Confluence discovery snapshot is invalid.');
    if(existing&&!allowUpdate)throw Error('Existing Discovery differs from Confluence. Preserved local answers.');
    const tmp=discoveryPath+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{
     await fs.writeFile(tmp,manifest.discovery,{flag:'wx',mode:0o600});
     if(existing){
      const currentText=await fs.readFile(discoveryPath,'utf8');
      if(currentText!==existing)throw Error('Discovery changed during Confluence restore. Local answers preserved.');
     }
     await fs.rename(tmp,discoveryPath);
    }finally{await fs.rm(tmp,{force:true});}
   }
   result.restored=true;
  }
  if(allowRegister&&!result.conflicts.length)await this.recordHistory(space.id,remoteHash);
  return result;
 }
 async sync({mode='both'}={}){
  if(!['both','pull','push'].includes(mode))throw Error('Invalid Confluence vault sync mode.');
  const space=await getConfluenceSpace(this.config,this.token);
  const local=await snapshot(this.registry,this.projectId),localHash=snapshotHash(local);
  let page=await this.page(space,mode!=='pull'&&(local.documents.length>0||local.files.length>0));
  if(!page)return {downloaded:0,uploaded:0,restored:false,conflicts:[],skipped:'No remote source vault'};
  const pageId=String(page.id),items=await this.attachments(pageId),byName=new Map(items.map(x=>[x.title,x]));
  const manifestName='ATGV-project-'+this.projectId+'-source-state.json';
  let manifest=null,remoteHash='';
  if(byName.has(manifestName)){
   const bytes=await this.download(pageId,byName.get(manifestName));
   if(bytes.length>20*1024*1024)throw Error('Confluence source manifest is too large to safely restore.');
   remoteHash=sha(bytes);
   manifest=validateManifest(JSON.parse(bytes.toString('utf8')),this.projectId,space.id);
  }
  const localHistory=await this.localHistory();
  const currentHistory=localHistory.spaceId===String(space.id)?localHistory:{};
  // A truly new project may accept Confluence state. A project whose user
  // intentionally deleted every BR is NOT empty for restore purposes.
  const localEmpty=!local.register?.brs?.length&&!local.register?.sourceDocuments?.length&&
   !local.register?.archivedSources?.length&&!local.register?.sourceHistory?.length&&
   !local.register?.deletedRequirements?.length&&!local.register?.completedCycles?.length&&
   !local.register?.events?.length&&!local.register?.importEpoch&&
   !Object.keys(local.register?.synced||{}).length&&!(local.discovery||'').trim();
  let result={downloaded:0,uploaded:0,restored:false,conflicts:[],skipped:''};
  if(manifest&&mode!=='push'){
   const remoteChanged=!!currentHistory.remoteHash&&currentHistory.remoteHash!==remoteHash;
   const localUnchanged=!!currentHistory.localHash&&currentHistory.localHash===localHash;
   if(localEmpty||remoteChanged&&localUnchanged){
    result=await this.restore(manifest,remoteHash,space,pageId,items,{
     allowRegister:true,allowUpdate:!localEmpty,expectedLocalHash:localHash});
    if(result.restored)return result;
   }else{
    result=await this.restore(manifest,remoteHash,space,pageId,items,{allowRegister:false});
    if(remoteChanged)result.conflicts.push('Remote project revisions changed while this machine also has local edits. Local BR data is preserved for reconciliation.');
    else if(!currentHistory.remoteHash){
     // An incomplete journal is recoverable when remote originals are verified,
     // and the local and remote state are identical after excluding sync-only
     // revision/event noise. This is a read-only bootstrap, not a forced push.
     const verifiedLocal=await snapshot(this.registry,this.projectId);
     if(!result.conflicts.length&&sameProjectContent(verifiedLocal,manifest)){
      await this.recordHistory(space.id,remoteHash);
      result.baselineRecovered=true;
      // Do not fall through to the upload check with the STALE journal read
      // at the start of this operation: that would misidentify a clean match
      // as a conflict because remoteHash hashes the manifest, not a snapshot.
      return result;
     }
     const differences=contentDifferences(verifiedLocal,manifest);
     result.conflicts.push('Confluence contains different '+(differences.join(', ')||'source bytes')+
      '. Both copies are preserved; review these differences before publishing.');
    }
   }
  }
  if(mode==='pull'||result.conflicts.length)return result;
  const latest=await snapshot(this.registry,this.projectId);
  const currentHash=snapshotHash(latest);
  if(remoteHash&&currentHash!==remoteHash&&(!currentHistory.remoteHash||currentHistory.remoteHash!==remoteHash)){
   // Never overwrite data from another machine if the version history is unknown.
   result.conflicts.push('Confluence project manifest differs from this machine. Reopen or manually reconcile before uploading.');
   return result;
  }
  for(const doc of latest.documents){
   if(byName.has(doc.storedName))continue;
   try{
    const bytes=await sourceStore.originalBytes(this.registry,this.projectId,doc);
    await this.upload(pageId,doc.storedName,bytes);result.uploaded++;
   }catch(error){result.conflicts.push('Upload '+doc.name+': '+message(error));}
  }
  for(const doc of latest.files){
   if(byName.has(doc.attachment))continue;
   try{
    const file=path.join(this.root,'documents',...doc.relative.split('/'));
    const bytes=await fs.readFile(file);
    if(sha(bytes)!==doc.byteDigest)throw Error('Local document changed during synchronization.');
    await this.upload(pageId,doc.attachment,bytes);result.uploaded++;
   }catch(error){result.conflicts.push('Upload '+doc.relative+': '+message(error));}
  }
  if(result.conflicts.length)return result; // Manifest always published last.
  const payload={schema:1,projectId:this.projectId,spaceId:String(space.id),updatedAt:new Date().toISOString(),...latest};
  const bytes=Buffer.from(JSON.stringify(payload));
  if(bytes.length>20*1024*1024)throw Error('Project manifest exceeds Confluence sync limit.');
  const hash=sha(bytes);
  if(!remoteHash||currentHistory.localHash!==currentHash){
   await this.upload(pageId,manifestName,bytes);result.uploaded++;
   await this.recordHistory(space.id,hash);
  }else if(!result.conflicts.length)await this.recordHistory(space.id,remoteHash);
  return result;
 }
}
module.exports={ConfluenceSourceVault,validateManifest,isSafeRelative,snapshotHash,sameProjectContent,contentDifferences,validDocument,validAttachmentId:id=>ATTACHMENT_ID.test(String(id??''))};
