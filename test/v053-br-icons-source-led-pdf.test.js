'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const pdf=require('../src/ba-iso29148-pdf');
const logo=require('../src/ba-pdf-logo');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('PDF title is derived from actual GATE source filename with correct domain capitalization',()=>{
 assert.equal(pdf.documentTitle('GATE Project Initiation and Project Approval BRD Requirements Revised v1.1.docx'),
  'GATE: Project Initiation and Project Approval');
 assert.equal(pdf.titleCase('Post-Approval Dates, TBP, and Finance Charge-Code Completion'),
  'Post-Approval Dates, TBP, and Finance Charge-Code Completion');
 assert.equal(pdf.titleCase('BR-005 Approval Package Versioning and Sequential Approvals'),
  'BR-005 Approval Package Versioning and Sequential Approvals');
 assert.equal(pdf.titleCase('capex and opex for EXCO, with EA, and TBP'), 'CAPEX and OPEX for EXCO, with EA, and TBP');
 assert.equal(pdf.documentTitle('GATE project approval v1.1.docx'),'GATE: Project Approval');
});

test('default BRS excludes explanatory filler and the full repeated source appendix',()=>{
 const name='GATE Project Initiation and Project Approval BRD Requirements Revised v1.1.docx';
 const src='~~~text\nThe source contains a validated business decision.\n~~~';
 const document=pdf.document({projectId:'TC',source:{name,digest:'a'.repeat(64)},workingText:src,
  generatedAt:'2026-11-22T00:00:00Z',
  requirements:[{id:'BR-004',status:'draft',revisionNumber:0,title:'cost, benefit, and delivery planning',
   objective:'Capture implementation costs, benefits and delivery planning.',
   scope:'CAPEX/OPEX, approved cost workings, and delivery milestones.',
   acceptanceCriteria:'Given valid cost inputs, totals are calculated.',
   evidence:[{sourceName:name},{sourceName:name}],
   features:[{title:'Implementation cost',description:'Show CAPEX and OPEX separately',
    stories:[{title:'Capture costs',acceptanceCriteria:'Only approved cost methods are used'}]}]}]});
 const raw=document.toString('latin1');
 assert.match(raw,/GATE: Project Initiation and Project Approval/);
 assert.match(raw,/BUSINESS REQUIREMENTS SPECIFICATION/);
 assert.match(raw,/BR-004 - Cost, Benefit, and Delivery Planning/);
 assert.match(raw,/Capture implementation costs, benefits and delivery planning/);
 assert.match(raw,/Only approved cost methods are used/);
 assert.match(raw,/DRAFT - PENDING BA APPROVAL/);
 assert.match(raw,/Source SHA-256: a{64}/);
 assert.doesNotMatch(raw,/Business Analyst to classify and validate/);
 assert.doesNotMatch(raw,/See the source-backed requirement records below/);
 assert.doesNotMatch(raw,/DRAFT -- this export is not evidence/);
 assert.doesNotMatch(raw,/The source contains a validated business decision/);
 assert.doesNotMatch(raw,/Appendix A - Validated Working Source/);
 // Packaged image mark or vector AI glyph must be visible in every generated PDF.
 assert.ok(raw.includes('/Logo Do')||raw.includes('(AI)'));
});

test('source appendix remains available only by explicit opt-in',()=>{
 const source='~~~text\nValidated working source passage remains preserved.\n~~~';
 const pdfText=pdf.document({projectId:'TC',source:{name:'GATE Requirements.docx'},
  workingText:source,includeSourceAppendix:true,requirements:[]}).toString('latin1');
 assert.match(pdfText,/Appendix A - Validated Working Source/);
 assert.match(pdfText,/Validated working source passage remains preserved/);
});

test('packaged ATGV AI mark uses a safe embedded PNG XObject or a vector fallback',()=>{
 function chunk(type,data){
  const out=Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length,0);out.write(type,4,'ascii');data.copy(out,8);
  return out;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);
 header[8]=8;header[9]=6;
 const bytes=Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,0,0,128]))),
  chunk('IEND',Buffer.alloc(0))
 ]);
 const decoded=logo.decodePng(bytes);
 assert.equal(decoded.width,1);assert.equal(decoded.height,1);
 assert.deepEqual([...zlib.inflateSync(decoded.data)],[255,127,127]);
 const candidate=logo.loadPackagedLogo();
 assert.ok(candidate===null||candidate.data.length>0);
});

test('BR details use compact icon actions with native and accessible tooltips',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),css=read('media/start.css');
 for(const id of ['baTransferOpen','baRequirementModalClose']){
  const tag=new RegExp('<button[^>]+id="'+id+'"[^>]*>');
  const match=html.match(tag)?.[0];
  assert.ok(match,'Missing '+id);
  assert.match(match,/class="[^"]*ba-br-icon-action/);
  assert.match(match,/aria-label=/);
  assert.match(match,/title=/);
  assert.match(match,/data-tooltip=/);
 }
 assert.match(ui,/function baIconAction\(node,icon,tooltip\)/);
 assert.match(ui,/ba-jira-only-delete','🗑'/);
 assert.match(ui,/ba-view-br-answers'\),'▤'/);
 assert.match(ui,/ba-view-jira'\),'↗'/);
 assert.match(ui,/ba-recover-confluence'\),'↺'/);
 assert.match(ui,/send\('deleteJiraOnlyBROwned'/);
 assert.match(ui,/send\('recoverJiraOnlyBR'/);
 assert.match(css,/\.ba-br-icon-action:focus-visible/);
});
