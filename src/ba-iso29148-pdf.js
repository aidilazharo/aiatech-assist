'use strict';
// Offline, dependency-free A4 Business Requirements Specification PDF.
// Section design is aligned to the BRS information-item guidance in
// ISO/IEC/IEEE 29148:2018 (8.2, 9.2, 9.3). No conformity claim is made.
const crypto=require('node:crypto');
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
function document(spec={}){
 const source=spec.source||{},brs=Array.isArray(spec.requirements)?spec.requirements.filter(x=>x&&!x.archivedFromRestart&&x.status!=='retired'):[];
 const preparedAt=spec.generatedAt&&Number.isFinite(Date.parse(spec.generatedAt))?new Date(spec.generatedAt):new Date();
 const created=preparedAt.toISOString().slice(0,10),fileName=pdfText(source.name||'Source document not recorded');
 const pages=[];let page=null,y=H-M;
 const line=(x1,y1,x2,y2,color=BLUE,width=1)=>page.push(rgb(color)+' RG '+width+' w '+x1.toFixed(2)+' '+y1.toFixed(2)+' m '+x2.toFixed(2)+' '+y2.toFixed(2)+' l S');
 const box=(x,b,w,h,color)=>page.push(rgb(color)+' rg '+[x,b,w,h].map(v=>v.toFixed(2)).join(' ')+' re f');
 const text=(value,x,baseline,size=10,{bold=false,color=DARK}={})=>{
  page.push(rgb(color)+' rg BT /'+(bold?'F2':'F1')+' '+size.toFixed(1)+' Tf 1 0 0 1 '+x.toFixed(2)+' '+baseline.toFixed(2)+' Tm ('+esc(value)+') Tj ET');
 };
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
 newPage();box(M,y-100,RIGHT-M,94,NAVY);
 text('BUSINESS REQUIREMENTS',M+18,y-36,22,{bold:true,color:[1,1,1]});
 text('SPECIFICATION (BRS)',M+18,y-64,18,{bold:true,color:[1,1,1]});
 y-=125;
 paragraph('Structured with reference to ISO/IEC/IEEE 29148:2018. DRAFT — this export is not evidence of ISO certification, stakeholder sign-off or approved implementation.',{muted:true,small:true});
 field('Project ID',spec.projectId||'Not specified');
 field('Source document',fileName.slice(0,70));
 field('Export date (UTC)',created);
 field('BR records',String(brs.length));
 field('Document state','WORKING / HUMAN REVIEW REQUIRED');
 field('Original file SHA-256',valid.test(String(source.byteDigest||''))?source.byteDigest.slice(0,28)+'...':'Not recorded');
 heading('Document control');
 paragraph('Generated from the project repository and validated working-BR evidence. The original uploaded file is not modified. No missing business decision is inferred from an AI recommendation.');
 paragraph('Baseline: '+(source.digest||'Unrecorded')+'. Approval authority, revision baseline and signature are not asserted by this draft.',{small:true,muted:true});
 heading('Contents');
 for(const x of ['1 Business purpose and scope','2 Business overview and stakeholders','3 Business management requirements','4 Business operational requirements','5 Business requirements register and acceptance','6 Traceability, verification and approval','Appendix A - Validated working source text'])paragraph(x,{small:true});
 heading('1 Business purpose and scope');
 heading('1.1 Business purpose',2);
 if(brs.length){for(const br of brs){paragraph(br.id+' - '+(br.title||'Untitled'),{small:true,muted:true});paragraph(br.objective||'Objective not specified.');}}
 else empty('Business requirements have not yet been generated. Refer to the verified working source in Appendix A; Business Analyst must validate the business purpose.');
 heading('1.2 Business scope',2);
 if(brs.length){for(const br of brs){paragraph(br.id+' - '+(br.title||'Untitled'),{small:true,muted:true});paragraph(br.scope||'Scope not specified.');}}
 else empty();
 heading('2 Business overview and stakeholders');
 heading('2.1 Business overview',2);
 paragraph('Source: '+fileName+'. Total current BR records: '+brs.length+'. This section does not replace an approved business architecture or stakeholder analysis.');
 heading('2.2 Major stakeholders',2);empty();
 heading('2.3 Terms, definitions and references',2);
 paragraph('Primary reference: '+fileName+'. Requirements engineering guidance: ISO/IEC/IEEE 29148:2018 (Business Requirements Specification).');
 heading('3 Business management requirements');
 for(const sub of ['3.1 Business environment','3.2 Mission, goals and objectives','3.3 Business model','3.4 Information environment']){
  heading(sub,2);empty('Business Analyst to classify and validate this information from the source and stakeholder decisions. Do not treat technical design defaults as business policy.');
 }
 heading('4 Business operational requirements');
 for(const sub of ['4.1 Business processes','4.2 Business operational policies and rules','4.3 Business operational constraints','4.4 Business operational modes','4.5 Business operational quality','4.6 Business structure']){
  heading(sub,2);empty('See the source-backed requirement records below. Detailed policy or operational mode is pending explicit evidence or stakeholder confirmation.');
 }
 heading('5 Preliminary operational concept of proposed system');
 empty('No proposed operational concept has been approved from the verified source. The Solution Architect and Business Analyst must validate expected actors, workflows, interfaces and operating assumptions.');
 heading('6 Business requirements register and acceptance');
 if(!brs.length)empty('No generated BR records have been saved. This source-backed draft requires mapping, AI review and Business Analyst approval.');
 for(const br of brs){
  heading((br.id||'BR')+' - '+(br.title||'Untitled requirement'));
  field('Status',metadataStatus(br));field('Revision',String(br.revisionNumber||br.approvedRevision||0));
  heading('Business objective',2);paragraph(br.objective||'Not specified.');
  heading('Scope',2);paragraph(br.scope||'Not specified.');
  heading('Acceptance criteria',2);paragraph(br.acceptanceCriteria||'Not specified; validation required.');
  if(br.evidence?.length){
   heading('Source evidence',2);
   for(const ev of br.evidence.slice(0,25))paragraph((ev.sourceName||ev.name||ev.digest||'Recorded evidence')+' '+(ev.excerpt||ev.text||'').slice(0,1200),{small:true});
  }
  for(const [i,feature] of (br.features||[]).entries()){
   heading('Feature '+(i+1)+': '+(feature.title||feature.name||'Unnamed'),2);
   if(feature.description)paragraph(feature.description);
   for(const [j,story] of (feature.stories||[]).entries()){
    paragraph('Story '+(j+1)+': '+(story.title||story.name||story.description||'Not specified'),{small:true});
    if(story.acceptanceCriteria)paragraph('Acceptance: '+story.acceptanceCriteria,{small:true});
   }
  }
 }
 heading('7 Traceability, verification and approval');
 field('Source name',fileName.slice(0,65));
 field('Source digest',valid.test(String(source.digest||''))?source.digest.slice(0,28)+'...':'Not recorded');
 field('Testing','NOT RUN');
 field('BA approval','Required unless verified independently');
 paragraph('Traceability references and acceptance criteria above are records from the active Business Requirements register. This export does not change any Jira status, ownership, approved baseline or approval decision.',{small:true});
 heading('Appendix A - Validated working source text');
 const extracted=sourceSection(spec.workingText);
 if(extracted){paragraph('The following text is drawn from the integrity-checked working BR. Validated spelling corrections may have been applied. The original upload remains unchanged.',{muted:true,small:true});paragraph(extracted,{small:true});}
 else empty('Validated working source text was not available in the requested export. Re-run document preflight and verify the working BR.');
 // Add numbered footers after all pages are known.
 for(const [i,ops] of pages.entries()){
  ops.push(rgb([0.81,0.85,0.89])+' RG .6 w '+M+' 48 m '+RIGHT+' 48 l S');
  const footer='ATGV AIATECH ASSIST  |  BRS WORKING DRAFT  |  '+created+'  |  Page '+(i+1)+' of '+pages.length;
  ops.push(rgb(MUTED)+' rg BT /F1 8 Tf 1 0 0 1 '+M+' 33 Tm ('+esc(footer)+') Tj ET');
 }
 // Serialize a standards-compatible, self-contained PDF with no external files.
 const objects=[null,'<< /Type /Pages /Kids [] /Count 0 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const pageRefs=[];
 for(const ops of pages){
  const content=ops.join('\n')+'\n',streamNum=objects.length+1;
  objects.push('<< /Length '+Buffer.byteLength(content,'latin1')+' >>\nstream\n'+content+'endstream');
  const pageNum=objects.length+1;
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+streamNum+' 0 R >>');
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
module.exports={document,sourceSection,pdfText,wrap};
