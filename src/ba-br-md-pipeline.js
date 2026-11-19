'use strict';
// Immutable, source-preserving BR Markdown units. Never infer extra BR boundaries.
// Markdown files are a processing cache; the original PDF/DOCX remains authoritative.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const importer=require('./discovery-import');
const {QUESTIONS,MAX_ANSWER_LENGTH,noOpenDecisions}=require('./ba-discovery');
const DIGEST=/^[a-f0-9]{64}$/;
const MAX_UNITS=64;
const UNIT_CHARS=12000;
const sha=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
const headingPattern=/^(?:[ \t]*#{1,4}[ \t]*)?(?:BR[ \t._-]*[0-9]{1,4}(?:\.[0-9]+)?|Business[ \t]+Requirements?[ \t]*(?:(?:No\.?|Number|ID)[ \t]*)?[:#._-]?[ \t]*[0-9]{1,4})[ \t]*[:.)(\-–— \t]*(?:[^\r\n]*)/gim;
function split(text,{maxChars=UNIT_CHARS}={}){
 if(typeof text!=='string'||!text.trim())throw Error('BR text extraction must contain readable source.');
 if(!Number.isSafeInteger(maxChars)||maxChars<2000||maxChars>28000)throw Error('Invalid BR text section size.');
 const heads=[...text.matchAll(headingPattern)].filter(match=>match[0].trim().length>3);
 // A single heading is not enough evidence of multiple independently scoped BRs.
 const starts=heads.length>1?heads.map(match=>match.index):[0];
 const groups=starts.map((start,i)=>({start:i===0?0:start,end:starts[i+1]??text.length}));
 const units=[];
 for(const [brIndex,group] of groups.entries()){
  const chunk=text.slice(group.start,group.end);
  const parts=importer.splitDocumentText(chunk,maxChars);
  for(const [partIndex,part] of parts.entries()){
   if(!part)continue;
   units.push({brIndex:brIndex+1,partIndex:partIndex+1,parts:parts.length,
    text:part,digest:sha(part),characters:part.length});
   if(units.length>MAX_UNITS)throw Error('Document requires more than '+MAX_UNITS+' verified text sections. Split the original into smaller documents; nothing was discarded.');
  }
 }
 if(!units.length||units.map(u=>u.text).join('')!==text)throw Error('BR text extraction lost original source characters.');
 return units;
}
async function directory(registry,id,{create=false,legacy=false}={}){
 const root=path.dirname(registry.fileFor(id));
 const parts=[root,path.join(root,'documents'),path.join(root,'documents','requirements'),path.join(root,'documents','requirements',legacy?'br-text':'br-markdown')];
 for(const part of parts){
  let st=await fs.lstat(part).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!st&&create){
   try{await fs.mkdir(part,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
   st=await fs.lstat(part);
  }
  if(!st){if(!create)return null;throw Error('BR Markdown directory unavailable.');}
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe BR Markdown directory.');
 }
 return parts.at(-1);
}

function name(sourceDigest,unit){
 return sourceDigest+'-BR'+String(unit.brIndex).padStart(3,'0')+'-P'+String(unit.partIndex).padStart(2,'0')+'-'+unit.digest+'.md';
}
function legacyName(sourceDigest,unit){return name(sourceDigest,unit).replace(/\.md$/,'.txt');}
function validRef(ref){
 return !!ref&&DIGEST.test(String(ref.sourceDigest||''))&&DIGEST.test(String(ref.digest||''))&&
  Number.isInteger(ref.brIndex)&&ref.brIndex>0&&ref.brIndex<=MAX_UNITS&&
  Number.isInteger(ref.partIndex)&&ref.partIndex>0&&ref.partIndex<=MAX_UNITS&&
  Number.isInteger(ref.parts)&&ref.parts>0&&ref.parts<=MAX_UNITS&&
  Number.isInteger(ref.characters)&&ref.characters>0&&ref.characters<=UNIT_CHARS&&
  (ref.filename===name(ref.sourceDigest,ref)||ref.filename===legacyName(ref.sourceDigest,ref));
}
// Markdown wrapper is deterministic. Extraction is recovered exactly, including whitespace.
function markdownParts(ref){
 const prefix='# Business Requirement BR-'+String(ref.brIndex).padStart(3,'0')+'\n\n'+
  '> Source-preserving ATGV extraction. Not yet reviewed or approved. Original DOCX/PDF remains authoritative.\n\n'+
  '- **Source SHA-256:** '+ref.sourceDigest+'\n'+
  '- **Extracted unit SHA-256:** '+ref.digest+'\n'+
  '- **Continuation:** '+ref.partIndex+' of '+ref.parts+'\n'+
  '- **Original extracted characters:** '+ref.characters+'\n\n'+
  '## Verbatim extracted source\n\n';
 return {prefix,suffix:'\n\n<!-- ATGV_MD_UNIT_END:'+ref.digest+' -->\n'};
}
function encodeMarkdown(ref,text){
 const {prefix,suffix}=markdownParts(ref);return prefix+text+suffix;
}
function decodeMarkdown(ref,content){
 const {prefix,suffix}=markdownParts(ref);
 if(!content.startsWith(prefix)||!content.endsWith(suffix))
  throw Error('BR Markdown structure or provenance changed. Re-extract the original document.');
 const text=content.slice(prefix.length,content.length-suffix.length);
 if(sha(text)!==ref.digest||text.length!==ref.characters)
  throw Error('BR Markdown content changed. Re-extract the original document.');
 return text;
}
async function writeChecked(file,content){
 try{await fs.writeFile(file,content,{flag:'wx',mode:0o600});}
 catch(error){if(error.code!=='EEXIST')throw error;}
 const st=await fs.lstat(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>100000||sha(await fs.readFile(file,'utf8'))!==sha(content))
  throw Error('BR Markdown integrity check failed; original source is unchanged.');
}
async function removeLegacyForSource(registry,id,sourceDigest){
 const dir=await directory(registry,id,{legacy:true});
 if(!dir)return;
 for(const filename of await fs.readdir(dir)){
  if(!filename.startsWith(sourceDigest+'-BR')||!/^[a-f0-9]{64}-BR\d{3}-P\d{2}-[a-f0-9]{64}\.txt$/.test(filename))continue;
  const file=path.join(dir,filename),st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe legacy BR TXT file.');
  await fs.unlink(file);
 }
}
async function prepare(registry,id,source){
 if(!source||!DIGEST.test(String(source.digest||''))||sha(source.text)!==source.digest)
  throw Error('Verified original source text is required to prepare BR Markdown.');
 const units=split(source.text),dir=await directory(registry,id,{create:true});
 const result=[];
 for(const unit of units){
  const ref={sourceDigest:source.digest,digest:unit.digest,brIndex:unit.brIndex,
   partIndex:unit.partIndex,parts:unit.parts,characters:unit.characters,filename:name(source.digest,unit)};
  await writeChecked(path.join(dir,ref.filename),encodeMarkdown(ref,unit.text));
  result.push({...ref,text:unit.text});
 }
 if(result.map(x=>x.text).join('')!==source.text)throw Error('BR Markdown units do not cover the complete original.');
 // Old TXT units are retired only after all Markdown replacements pass integrity checks.
 await removeLegacyForSource(registry,id,source.digest);
 return result;
}
async function read(registry,id,ref){
 if(!validRef(ref))throw Error('Invalid BR Markdown reference.');
 const target={...ref,filename:name(ref.sourceDigest,ref)};
 const dir=await directory(registry,id),file=dir&&path.join(dir,target.filename);
 const st=file?await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)):null;
 if(!st&&ref.filename===legacyName(ref.sourceDigest,ref)){
  // Read once and migrate saved v0.4.39 mapping references, preserving their hashes and answers.
  const oldDir=await directory(registry,id,{legacy:true});
  const oldFile=oldDir&&path.join(oldDir,ref.filename);
  const oldStat=oldFile?await fs.lstat(oldFile).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)):null;
  if(!oldStat||!oldStat.isFile()||oldStat.isSymbolicLink()||oldStat.size>100000)
   throw Error('Legacy BR section is missing. Re-extract the original document.');
  const raw=await fs.readFile(oldFile,'utf8');
  if(sha(raw)!==ref.digest||raw.length!==ref.characters)
   throw Error('Legacy BR section integrity check failed.');
  const mdDir=await directory(registry,id,{create:true});
  await writeChecked(path.join(mdDir,target.filename),encodeMarkdown(target,raw));
  await fs.unlink(oldFile);
  return raw;
 }
 if(!st||!st.isFile()||st.isSymbolicLink()||st.size>100000)
  throw Error('Unsafe or missing BR Markdown file.');
 return decodeMarkdown(target,await fs.readFile(file,'utf8'));
}
// Full per-unit answers are stored in the mapping register. The standard
// 12-question discovery UI is a bounded INDEX when the combined text is >5k.
function mergeForDiscovery(answers,units){
 try{return importer.mergeMappingAnswers(answers);}
 catch(error){
  if(!/safety limit/.test(String(error.message)))throw error;
 }
 const merged={};
 for(const [key] of QUESTIONS){
  const values=[],seen=new Set();
  for(let i=0;i<answers.length;i++){
   const value=String(answers[i]?.[key]||'').trim();
   if(!value)continue;
   if(key==='questions'&&noOpenDecisions(value))continue;
   const fingerprint=value.replace(/\s+/g,' ').toLowerCase();
   if(seen.has(fingerprint))continue;
   seen.add(fingerprint);values.push({value,ref:units[i]});
  }
  const full=values.map(x=>x.value).join('\n\n');
  if(full.length<=MAX_ANSWER_LENGTH){
   merged[key]=full||(key==='questions'&&answers.some(x=>noOpenDecisions(x?.questions))?'NONE':'');
   continue;
  }
  const suffix='\n\n[SUMMARY ONLY: full source-backed answers are preserved per BR Markdown file in the mapping register. Review all BR sections before approval.]';
  const budget=MAX_ANSWER_LENGTH-suffix.length;
  const excerpts=[];
  let remaining=budget;
  for(const item of values){
   const prefix='['+item.ref.filename+'] ';
   if(prefix.length+45>remaining)break;
   const take=Math.min(item.value.length,Math.min(700,remaining-prefix.length-25));
   excerpts.push(prefix+item.value.slice(0,take)+(take<item.value.length?' [continued in saved BR mapping]':''));
   remaining=budget-excerpts.join('\n\n').length;
  }
  merged[key]=excerpts.join('\n\n').slice(0,budget)+suffix;
 }
 return merged;
}
function groups(proposals){
 const ordered=[],byKey=new Map();
 for(const proposal of proposals||[]){
  for(const ref of proposal.units||[]){
   if(!validRef(ref))throw Error('Invalid saved BR Markdown reference.');
   const key=ref.sourceDigest+':'+ref.brIndex;
   if(!byKey.has(key)){
    const group={sourceDigest:ref.sourceDigest,brIndex:ref.brIndex,sourceName:proposal.filename,units:[]};
    byKey.set(key,group);ordered.push(group);
   }
   byKey.get(key).units.push(ref);
  }
 }
 for(const group of ordered){
  group.units.sort((a,b)=>a.partIndex-b.partIndex);
  if(group.units.some((unit,i)=>unit.partIndex!==i+1||unit.parts!==group.units.length))
   throw Error('Saved BR Markdown parts are incomplete or out of order.');
 }
 return ordered;
}

async function removeForSource(registry,id,sourceDigest){
 if(!DIGEST.test(String(sourceDigest||'')))throw Error('Invalid source digest.');
 const dir=await directory(registry,id);
 if(dir)for(const filename of await fs.readdir(dir)){
  if(!filename.startsWith(sourceDigest+'-BR')||!/^[a-f0-9]{64}-BR\d{3}-P\d{2}-[a-f0-9]{64}\.md$/.test(filename))continue;
  const file=path.join(dir,filename),st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe BR Markdown file.');
  await fs.unlink(file);
 }
 await removeLegacyForSource(registry,id,sourceDigest);
}
module.exports={MAX_UNITS,UNIT_CHARS,sha,split,prepare,read,validRef,mergeForDiscovery,groups,removeForSource,encodeMarkdown,decodeMarkdown};
