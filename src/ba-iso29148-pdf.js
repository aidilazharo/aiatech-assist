'use strict';
// Offline, dependency-free A4 Business Requirements Specification PDF.
// Section design is aligned to the BRS information-item guidance in
// ISO/IEC/IEEE 29148:2018 (8.2, 9.2, 9.3). No conformity claim is made.
const crypto=require('node:crypto');
const {loadPackagedLogo}=require('./ba-pdf-logo');
const W=595.28,H=841.89,M=48,RIGHT=W-M;
const NAVY=[0.07,0.12,0.20],BLUE=[0.12,0.36,0.69],DARK=[0.16,0.20,0.27],MUTED=[0.39,0.44,0.51];
const valid=/^[a-f0-9]{64}$/;
function pdfText(value){
 const substitutions={'\u2013':'-','\u2014':'--','\u2018':"'",'\u2019':"'",'\u201c':'"','\u201d':'"','\u2022':'*','\u2026':'...','\u00a0':' ','\u2192':'->'};
 return String(value??'').replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u00a0\u2192]/g,x=>substitutions[x])
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ')
  .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g,'?');
}
function esc(v){return pdfText(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function rgb(v){return v.map(x=>x.toFixed(3)).join(' ');}
function wrap(value,limit=99){
 const lines=[];
 for(const para of pdfText(value).replace(/\r/g,'').split('\n')){
  if(!para.trim()){lines.push('');continue;}
  const words=para.replace(/\s+/g,' ').trim().split(' ');
  let line='';
  for(const original of words){
   let token=original;
   while(token.length>limit){
    if(line){lines.push(line);line='';}
    lines.push(token.slice(0,limit));token=token.slice(limit);
   }
   if(!token)continue;
   if(line&&line.length+token.length+1>limit){lines.push(line);line=token;}
   else line+=(line?' ':'')+token;
  }
  if(line)lines.push(line);
 }
 return lines;
}
function sourceSection(working){
 const lines=String(working||'').split(/\r?\n/);
 const at=lines.findIndex(x=>/^~{3,}text\s*$/.test(x.trim()));
 if(at>=0){
  const end=lines.findIndex((v,i)=>i>at&&/^~{3,}\s*$/.test(v.trim()));
  if(end>at)return lines.slice(at+1,end).join('\n');
 }
 return ''; // Only include actual validated source, never infer from guidance.
}
const acronymTokens=new Set(['GATE','AIA','AI','ATGV','IT','API','BR','BRD','BRS','ISO','IEEE','IEC','TBP','EA','EXCO','TRM','CAPEX','OPEX','MYR','USD','RMB','PMO','PIC','RBAC','SST','KPI','ID','UAT','UI','UX','MVP1A','PDF','JIRA','SAP']);
function titleCase(value){
 // Keep literal markup-like source tokens unchanged; they remain safely PDF-escaped.
 if(/[<>]/.test(String(value||'')))return String(value||'').trim();
 const small=new Set(['a','an','the','and','or','of','for','to','in','on','at','by','with']);
 let wordIndex=0;
 return String(value||'').trim().replace(/\s+/g,' ').replace(/\b[A-Za-z][A-Za-z0-9]*\b/g,word=>{
  const first=wordIndex++===0,upper=word.toUpperCase(),lower=word.toLowerCase();
  if(acronymTokens.has(upper))return upper==='MVP1A'?'MVP1a':upper==='JIRA'?'Jira':upper;
  if(/^v\d+$/i.test(word))return 'v'+word.slice(1);
  if(!first&&small.has(lower))return lower;
  return lower.charAt(0).toUpperCase()+lower.slice(1);
 });
}
function documentTitle(name){
 let base=String(name||'').replace(/^.*[\\/]/,'').replace(/\.(?:docx?|pdf|md|txt)$/i,'');
 base=base.replace(/\s+(?:BRD|BRS)(?:\s+Requirements)?(?:\s+Revised)?(?:\s+(?:Version|v)\s*\d+(?:\.\d+)*)?$/i,'');
 base=base.replace(/\s+(?:Requirements\s+)?Revised\s+(?:Version\s*)?v?\d+(?:\.\d+)*$/i,'');
 base=base.replace(/\s+v\d+(?:\.\d+)*$/i,'');
 base=titleCase(base.replace(/[_]+/g,' ').trim());
 if(/^GATE\s+/i.test(base))base=base.replace(/^GATE\s+/,'GATE: ');
 return base||'Business Requirements';
}
function document(spec={}){
 const source=spec.source||{},brs=Array.isArray(spec.requirements)?spec.requirements.filter(x=>x&&!x.archivedFromRestart&&x.status!=='retired'):[];
 const preparedAt=spec.generatedAt&&Number.isFinite(Date.parse(spec.generatedAt))?new Date(spec.generatedAt):new Date();
 const created=preparedAt.toISOString().slice(0,10),fileName=pdfText(source.name||'Source document not recorded');
 const logoImage=loadPackagedLogo();
 const pages=[];let page=null,y=H-M;
 const line=(x1,y1,x2,y2,color=BLUE,width=1)=>page.push(rgb(color)+' RG '+width+' w '+x1.toFixed(2)+' '+y1.toFixed(2)+' m '+x2.toFixed(2)+' '+y2.toFixed(2)+' l S');
 const box=(x,b,w,h,color)=>page.push(rgb(color)+' rg '+[x,b,w,h].map(v=>v.toFixed(2)).join(' ')+' re f');
 const text=(value,x,baseline,size=10,{bold=false,color=DARK}={})=>{
  page.push(rgb(color)+' rg BT /'+(bold?'F2':'F1')+' '+size.toFixed(1)+' Tf 1 0 0 1 '+x.toFixed(2)+' '+baseline.toFixed(2)+' Tm ('+esc(value)+') Tj ET');
 };
 function brandLogo(x,b,size=58){
  box(x,b,size,size,[1,1,1]);
  if(logoImage){
   const scale=Math.min((size-8)/logoImage.width,(size-8)/logoImage.height);
   const w=logoImage.width*scale,h=logoImage.height*scale;
   page.push('q '+w.toFixed(2)+' 0 0 '+h.toFixed(2)+' '+
    (x+(size-w)/2).toFixed(2)+' '+(b+(size-h)/2).toFixed(2)+' cm /Logo Do Q');
  }else{
   box(x+3,b+3,size-6,size-6,NAVY);
   text('AI',x+size*.22,b+size*.41,size*.37,{bold:true,color:[1,1,1]});
   // Branded AI monogram fallback; no downloaded graphics.
   for(const [i,c] of [[0,[.01,.73,.85]],[1,[.84,.11,.51]],[2,[.94,.77,.08]],[3,[.09,.64,.68]]])
    box(x+8+i*(size-16)/4,b+7,(size-20)/4,3.5,c);
  }
 }
 function newPage(){
  page=[];pages.push(page);y=H-79;
  box(0,H-12,W,12,NAVY);box(0,H-16,W,4,BLUE);
  text('ATGV / BUSINESS REQUIREMENTS SPECIFICATION',M,H-42,9,{bold:true,color:NAVY});
  line(M,H-52,RIGHT,H-52,[0.84,0.87,0.91],.6);
 }
 function check(height=22){if(!page||y-height<62)newPage();}
 function heading(value,level=1){
  const size=level===1?15:11.5;
  const lines=wrap(value,level===1?56:73).filter(Boolean);
  check((level===1?44:31)+Math.max(0,lines.length-1)*size*1.25);
  y-=level===1?21:16;
  for(const headingLine of lines){text(headingLine,M,y,size,{bold:true,color:level===1?NAVY:BLUE});y-=size*1.22;}
  if(level===1){y-=4;line(M,y,RIGHT,y,[0.83,0.87,0.91],.65);y-=12;}
  else y-=9;
 }
 function paragraph(value,{indent=0,muted=false,small=false}={}){
  const size=small?8.6:10,step=small?12.2:14.6,max=Math.floor((RIGHT-M-indent)/(size*.53));
  for(const part of wrap(value,Math.max(35,max))){
   check(step+3);if(part)text(part,M+indent,y,size,{color:muted?MUTED:DARK});y-=step;
  }
  y-=5;
 }
 function field(label,value){
  check(29);text(label.toUpperCase(),M,y,8,{bold:true,color:MUTED});
  text(pdfText(value||'Not specified').slice(0,90),M+168,y,9,{color:DARK});y-=24;
 }
 function metadataStatus(br){return br.status==='approved'?'APPROVED REVISION '+(br.approvedRevision||1):'DRAFT - PENDING BA APPROVAL';}
 function empty(textValue){paragraph(textValue||'Not documented in the verified requirements evidence. Requires Business Analyst confirmation.',{muted:true});}
 const displayTitle=documentTitle(source.name||spec.projectId);
 const allApproved=brs.length>0&&brs.every(br=>br.status==='approved');
 const state=allApproved?'REQUIREMENT RECORDS APPROVED':'DRAFT - PENDING BA APPROVAL';
 const validated=sourceSection(spec.workingText);
 newPage();
 box(M,y-135,RIGHT-M,129,NAVY);
 brandLogo(RIGHT-79,y-94,62);
 let titleY=y-30;
 for(const titleLine of wrap(displayTitle,38).filter(Boolean).slice(0,3)){
  text(titleLine,M+16,titleY,17.7,{bold:true,color:[1,1,1]});
  titleY-=22;
 }
 text('BUSINESS REQUIREMENTS SPECIFICATION',M+16,y-113,11,{bold:true,color:[.88,.93,1]});
 y-=154;
 paragraph('ISO/IEC/IEEE 29148:2018 | Business Requirements Specification',{small:true,muted:true});
 field('Project ID',spec.projectId||'Not recorded');
 field('Source document',fileName.slice(0,70));
 field('Issued (UTC)',created);
 field('Requirement records',String(brs.length));
 field('Review status',state);
 heading('Contents');
 for(const section of ['1 Business Requirements Overview','2 Detailed Business Requirements','3 Traceability and Approval']){
  paragraph(section,{small:true});
 }
 if(spec.includeSourceAppendix===true)paragraph('Appendix A - Validated Working Source',{small:true});
 heading('1 Business Requirements Overview');
 if(!brs.length)paragraph('No requirement records have been generated from the verified source.',{muted:true});
 for(const br of brs){
  paragraph((br.id||'BR')+' - '+titleCase(br.title||'Untitled Requirement'),{small:true});
 }
 // Trace the source directly. Never substitute generated policy or analysis
 // text for absent decisions in the actual source document.
 heading('2 Detailed Business Requirements');
 if(!brs.length)paragraph('No requirements available.',{muted:true});
 for(const br of brs){
  heading((br.id||'BR')+' - '+titleCase(br.title||'Untitled Requirement'));
  field('Status',metadataStatus(br));
  field('Revision',String(br.revisionNumber||br.approvedRevision||0));
  if(br.objective){heading('Business Objective',2);paragraph(br.objective);}
  if(br.scope){heading('Scope',2);paragraph(br.scope);}
  if(br.acceptanceCriteria){heading('Acceptance Criteria',2);paragraph(br.acceptanceCriteria);}
  // A source may be cited in several features. List it once per BR.
  const seenEvidence=new Set();
  const evidence=[];
  for(const ev of Array.isArray(br.evidence)?br.evidence:[]){
   const name=String(ev.sourceName||ev.name||ev.digest||'');
   const excerpt=String(ev.excerpt||ev.text||'').trim();
   const key=name+'|'+excerpt;
   if(!key.trim()||seenEvidence.has(key))continue;
   seenEvidence.add(key);
   evidence.push({name,excerpt});
  }
  if(evidence.length){
   heading('Source References',2);
   for(const ev of evidence.slice(0,25)){
    paragraph((ev.name||fileName)+(ev.excerpt?' - '+ev.excerpt.slice(0,500):''),{small:true});
   }
  }
  for(const [i,feature] of (br.features||[]).entries()){
   heading('Feature '+(i+1)+': '+titleCase(feature.title||feature.name||'Unnamed Feature'),2);
   if(feature.description)paragraph(feature.description);
   for(const [j,story] of (feature.stories||[]).entries()){
    paragraph('Story '+(j+1)+': '+titleCase(story.title||story.name||'Untitled Story'),{small:true});
    if(story.description)paragraph(story.description,{small:true});
    if(story.acceptanceCriteria)paragraph('Acceptance Criteria: '+story.acceptanceCriteria,{small:true});
   }
  }
 }
 heading('3 Traceability and Approval');
 field('Source name',fileName.slice(0,65));
 field('Record status',state);
 if(valid.test(String(source.digest||''))){
  paragraph('Source SHA-256: '+source.digest,{small:true});
 }
 if(valid.test(String(source.byteDigest||''))){
  paragraph('Original File SHA-256: '+source.byteDigest,{small:true});
 }
 const pending=brs.filter(br=>br.status!=='approved');
 if(pending.length)paragraph('Pending BA Approval: '+pending.map(br=>br.id).join(', '),{small:true});
 if(spec.includeSourceAppendix===true){
  heading('Appendix A - Validated Working Source');
  if(validated)paragraph(validated,{small:true});
 }
 // Add numbered footers after all pages are known.
 for(const [i,ops] of pages.entries()){
  ops.push(rgb([0.81,0.85,0.89])+' RG .6 w '+M+' 48 m '+RIGHT+' 48 l S');
  const footer='ATGV AIATECH ASSIST  |  ISO 29148 BRS  |  '+created+'  |  Page '+(i+1)+' of '+pages.length;
  ops.push(rgb(MUTED)+' rg BT /F1 8 Tf 1 0 0 1 '+M+' 33 Tm ('+esc(footer)+') Tj ET');
 }
 // Serialize a standards-compatible, self-contained PDF with no external files.
 const objects=[null,'<< /Type /Pages /Kids [] /Count 0 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const pageRefs=[];
 let logoRef=0;
 if(logoImage){
  logoRef=objects.length+1;
  objects.push('<< /Type /XObject /Subtype /Image /Width '+logoImage.width+' /Height '+logoImage.height+
   ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length '+logoImage.data.length+
   ' >>\nstream\n'+logoImage.data.toString('latin1')+'\nendstream');
 }
 for(const ops of pages){
  const content=ops.join('\n')+'\n',streamNum=objects.length+1;
  objects.push('<< /Length '+Buffer.byteLength(content,'latin1')+' >>\nstream\n'+content+'endstream');
  const pageNum=objects.length+1;
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> '+(logoRef?'/XObject << /Logo '+logoRef+' 0 R >> ':'')+'>> /Contents '+streamNum+' 0 R >>');
  pageRefs.push(pageNum+' 0 R');
 }
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
 objects[1]='<< /Type /Pages /Kids ['+pageRefs.join(' ')+'] /Count '+pages.length+' >>';
 let out='%PDF-1.4\n%\xC2\xA5\xC2\xA5\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out,'latin1'));out+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=Buffer.byteLength(out,'latin1');out+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(const n of offsets.slice(1))out+=String(n).padStart(10,'0')+' 00000 n \n';
 out+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R /ID [<'+crypto.createHash('md5').update(out).digest('hex')+'> <'+crypto.createHash('md5').update(out).digest('hex')+'>] >>\nstartxref\n'+xref+'\n%%EOF\n';
 const bytes=Buffer.from(out,'latin1');
 if(!bytes.subarray(0,8).toString('latin1').startsWith('%PDF-1.4'))throw Error('Unable to build a valid PDF header.');
 return bytes;
}
module.exports={document,sourceSection,pdfText,wrap,titleCase,documentTitle};
