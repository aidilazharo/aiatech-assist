'use strict';
// DOCX is untrusted input. Read only bounded, referenced WordprocessingML
// parts; never resolve external relationships or execute document content.
const zlib=require('node:zlib');
const path=require('node:path');
const {SaxesParser}=require('./vendor/saxes');
const WORD=new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']);
const DRAWING=new Set(['http://schemas.openxmlformats.org/drawingml/2006/main','http://purl.oclc.org/ooxml/drawingml/main']);
const MAX_PART=3*1024*1024,MAX_TOTAL=12*1024*1024,MAX_ENTRIES=10000;
function zipEntries(data){
 if(!Buffer.isBuffer(data)||data.length<40)throw Error('Invalid Word file.');
 let eocd=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('Invalid Word document ZIP directory.');
 const count=data.readUInt16LE(eocd+10),start=data.readUInt32LE(eocd+16),entries=new Map();let cursor=start;
 if(count>MAX_ENTRIES||start>=data.length)throw Error('Invalid Word document directory.');
 for(let i=0;i<count;i++){
  if(cursor+46>data.length||data.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid Word ZIP entry.');
  const method=data.readUInt16LE(cursor+10),compressed=data.readUInt32LE(cursor+20),expanded=data.readUInt32LE(cursor+24),nameLen=data.readUInt16LE(cursor+28),extra=data.readUInt16LE(cursor+30),comment=data.readUInt16LE(cursor+32),offset=data.readUInt32LE(cursor+42);
  if(cursor+46+nameLen+extra+comment>data.length)throw Error('Invalid Word ZIP directory.');
  const name=data.subarray(cursor+46,cursor+46+nameLen).toString('utf8');cursor+=46+nameLen+extra+comment;
  if(entries.has(name))throw Error('Duplicate Word ZIP entry.');
  entries.set(name,{method,compressed,expanded,offset});
 }
 let total=0;
 return function read(name,required=true){
  const item=entries.get(name);if(!item){if(required)throw Error('Word document is missing '+name+'.');return null;}
  const {method,compressed,expanded,offset}=item;
  if(expanded>MAX_PART||compressed>12*1024*1024||(total+=expanded)>MAX_TOTAL)throw Error('Word document text exceeds import limit.');
  if(offset+30>data.length||data.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid Word ZIP local entry.');
  const startData=offset+30+data.readUInt16LE(offset+26)+data.readUInt16LE(offset+28);
  if(startData+compressed>data.length)throw Error('Word ZIP data is truncated.');
  const raw=data.subarray(startData,startData+compressed);
  let out;if(method===0)out=raw;else if(method===8)out=zlib.inflateRawSync(raw,{maxOutputLength:MAX_PART});else throw Error('Unsupported Word document compression.');
  if(out.length!==expanded)throw Error('Word ZIP size mismatch.');
  return out.toString('utf8');
 };
}
function parseXml(xml,handlers={}){
 const parser=new SaxesParser({xmlns:true});
 parser.on('doctype',()=>{throw Error('Word XML document types are not supported.');});
 for(const [event,fn] of Object.entries(handlers))parser.on(event,fn);
 try{parser.write(xml).close();}catch(error){throw Error('Invalid Word document XML: '+String(error.message||error).slice(0,180));}
}
const attr=(node,name)=>Object.values(node.attributes||{}).find(item=>item.local===name)?.value||'';
function wordText(xml,{notes=null}={}){
 let out='',skip=0,capture=0,run=null,root='',inNote=false,noteId='';
 const references={header:new Set(),footer:new Set(),footnote:new Set(),endnote:new Set()},found=new Set();
 const append=value=>{if(run)run.text+=value;else out+=value;};
 parseXml(xml,{
  opentag(node){
   const word=WORD.has(node.uri),drawing=DRAWING.has(node.uri),name=node.local;
   if(!root)root=name;
   if(skip){skip++;return;}
   if(word&&['del','moveFrom','delText','delInstrText'].includes(name)){skip=1;return;}
   if(word&&(name==='footnote'||name==='endnote')&&notes){
    noteId=attr(node,'id');if(!notes.has(noteId)){skip=1;return;}inNote=true;found.add(noteId);append('\n['+(name==='footnote'?'Footnote ':'Endnote ')+noteId+'] ');
   }
   if(word&&name==='r')run={text:'',hidden:false};
   if(word&&run&&['vanish','webHidden'].includes(name)&&!['0','false','off'].includes(attr(node,'val').toLowerCase()))run.hidden=true;
   if(word&&(name==='headerReference'||name==='footerReference')){const id=attr(node,'id');if(id)references[name==='headerReference'?'header':'footer'].add(id);}
   if(word&&(name==='footnoteReference'||name==='endnoteReference')){const id=attr(node,'id');if(id){const type=name==='footnoteReference'?'footnote':'endnote';references[type].add(id);append(' ['+(type==='footnote'?'Footnote ':'Endnote ')+id+'] ');}}
   if(word&&['tab','ptab'].includes(name))append('\t');
   if(word&&['br','cr'].includes(name))append('\n');
   if((word||drawing)&&name==='t')capture++;
  },
  text(value){if(!skip&&capture)append(value);},
  cdata(value){if(!skip&&capture)append(value);},
  closetag(node){
   if(skip){skip--;return;}
   const word=WORD.has(node.uri),drawing=DRAWING.has(node.uri),name=node.local;
   if((word||drawing)&&name==='t')capture=Math.max(0,capture-1);
   if(word&&name==='r'&&run){if(!run.hidden)out+=run.text;run=null;}
   if(word&&['p','tr'].includes(name))out+='\n';
   if(word&&name==='tc')out+='\t';
   if(word&&(name==='footnote'||name==='endnote')&&inNote){inNote=false;noteId='';}
  }
 });
 return {root,text:out.replace(/\r/g,'').replace(/\n[ \t]*\n[ \t]*\n+/g,'\n\n').trim(),references,found};
}
function relationships(xml){
 const entries=new Map();
 if(!xml)return entries;
 parseXml(xml,{opentag(node){
  if(node.local!=='Relationship')return;
  const id=attr(node,'Id'),type=attr(node,'Type').split('/').pop(),target=attr(node,'Target'),mode=attr(node,'TargetMode');
  if(!id||!type||!target||entries.has(id))throw Error('Invalid Word relationship.');
  if(mode&&mode.toLowerCase()!=='internal')return;
  if(!['header','footer','footnotes','endnotes'].includes(type))return;
  const resolved=target.startsWith('/')?path.posix.normalize(target.slice(1)):path.posix.normalize(path.posix.join('word',target));
  if(!resolved.startsWith('word/')||!resolved.endsWith('.xml')||resolved.includes('\\'))throw Error('Unsafe Word document relationship.');
  entries.set(id,{id,type,target:resolved});
 }});
 return entries;
}
function extractDocx(data){
 const read=zipEntries(data),body=wordText(read('word/document.xml'));
 if(body.root!=='document')throw Error('Invalid Word document XML.');
 const refs=body.references,needsRelations=[...Object.values(refs)].some(set=>set.size);
 const rels=relationships(read('word/_rels/document.xml.rels',needsRelations));
 const headers=[],footers=[],notes=[];
 for(const type of ['header','footer'])for(const id of refs[type]){
  const relation=rels.get(id);if(!relation||relation.type!==type)throw Error('Word document '+type+' reference is missing.');
  const value=wordText(read(relation.target)).text;if(value)(type==='header'?headers:footers).push(value);
 }
 for(const type of ['footnote','endnote'])if(refs[type].size){
  const relation=[...rels.values()].find(item=>item.type===type+'s');
  if(!relation)throw Error('Word document '+type+' relationship is missing.');
  const result=wordText(read(relation.target),{notes:refs[type]});
  if([...refs[type]].some(id=>!result.found.has(id)))throw Error('Word document referenced '+type+' is missing.');
  if(result.text)notes.push(result.text);
 }
 const parts=[headers.length?'[Headers]\n'+headers.join('\n\n'):'',body.text,footers.length?'[Footers]\n'+footers.join('\n\n'):'',...notes].filter(Boolean);
 const text=parts.join('\n\n').trim();if(!text)throw Error('No readable text found in this Word file.');return text;
}
// For verifying stored v0.4.17 source digests after upgrading the extractor.
// This is never supplied to AI: it only proves the older stored checksum.
function extractLegacyDocx(data){
 const xml=zipEntries(data)('word/document.xml');
 if(!/<w:document\b/.test(xml))throw Error('Invalid Word document XML.');
 const decode=s=>s.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(_,numeric,entity)=>{
  if(numeric){const n=numeric[0].toLowerCase()==='x'?parseInt(numeric.slice(1),16):parseInt(numeric,10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';}
  return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity.toLowerCase()];
 });
 return decode(xml.replace(/<w:(?:tab|ptab)\b[^>]*\/?\s*>/g,'\t').replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/g,'\n').replace(/<\/w:(?:p|tr)>/g,'\n').replace(/<\/w:tc>/g,'\t').replace(/<[^>]+>/g,'')).replace(/\r/g,'').replace(/\n[ \t]*\n[ \t]*\n+/g,'\n\n').trim();
}
module.exports={extractDocx,extractLegacyDocx};
