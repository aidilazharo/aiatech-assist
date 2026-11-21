'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const pdf=require('../src/ba-iso29148-pdf');
const read=relative=>fs.readFileSync(path.join(__dirname,'..',relative),'utf8');
const sha='a'.repeat(64);
const source={name:'GATE Project Approval v1.1.docx',digest:sha,byteDigest:'b'.repeat(64)};
const working=['# Business Requirements','## Draft','Validated spelling correction.','~~~text',
 'Business case from verified source.','Approval rules must be reviewed.','~~~',
 '## Provisional Standards Guidance','Provisional advice is NOT business policy.'].join('\n');
test('ISO 29148 BRS PDF has a valid self-contained cross-reference structure and populated source evidence',()=>{
 const result=pdf.document({projectId:'TC',source,workingText:working,generatedAt:'2026-11-22T06:00:00Z',
  requirements:[{id:'BR-001',status:'draft',title:'Project approval',objective:'Reduce manual approvals',scope:'Review project submissions',acceptanceCriteria:'A reviewer can approve a valid request',
    features:[{title:'Approval',description:'Capture decision',stories:[{title:'Approve request',acceptanceCriteria:'Reason recorded'}]}]}]});
 assert.ok(Buffer.isBuffer(result));
 const content=result.toString('latin1');
 assert.ok(content.startsWith('%PDF-1.4\n'));
 assert.ok(content.trimEnd().endsWith('%%EOF'));
 assert.match(content,/\/Type \/Pages \/Kids \[/);
 assert.match(content,/\/Type \/Font \/Subtype \/Type1 \/BaseFont \/Helvetica/);
 assert.match(content,/BUSINESS REQUIREMENTS/);
 assert.match(content,/ISO\/IEC\/IEEE 29148:2018/);
 assert.match(content,/Project approval/);
 assert.match(content,/Reduce manual approvals/);
 assert.match(content,/Validated spelling correction/);
 assert.match(content,/Business case from verified source/);
 assert.match(content,/DRAFT - PENDING BA APPROVAL/);
 assert.doesNotMatch(content,/APPROVED REVISION 1/);
 const xref=/startxref\n(\d+)\n%%EOF/.exec(content);
 assert.ok(xref,'PDF xref offset must exist');
 assert.equal(content.slice(Number(xref[1]),Number(xref[1])+4),'xref');
 const count=/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/.exec(content);
 assert.ok(count&&Number(count[1])>=1);
 assert.equal(source.name,'GATE Project Approval v1.1.docx');
});
test('long source is preserved across multiple A4 PDF pages without truncation',()=>{
 const repeated=Array.from({length:650},(_,i)=>'Section '+i+': verify the source business condition for the change.').join('\n');
 const sourceText=['# Working BR','## Draft','~~~text',repeated,'~~~'].join('\n');
 assert.equal(pdf.sourceSection(sourceText),repeated);
 const bytes=pdf.document({projectId:'TC',source,workingText:sourceText,requirements:[]});
 const content=bytes.toString('latin1');
 const number=Number(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/.exec(content)?.[1]||0);
 assert.ok(number>=10,'long source should be paginated, not cut off');
 assert.match(content,/Section 649/);
 assert.match(content,/Page 1 of/);
 assert.match(content,/\/MediaBox \[0 0 595\.28 841\.89\]/);
});
test('unsafe markup and literal PDF delimiters are escaped, unsupported glyphs normalized',()=>{
 const normalized=pdf.pdfText('Café — Review (A) \\ B');
 assert.equal(normalized,'Cafe -- Review (A) \\ B');
 const result=pdf.document({projectId:'P(01)',source:{...source,name:'Review (A) \\ B.pdf'},
  requirements:[{id:'BR-002',status:'draft',title:'<script>alert(1)</script> (test)',scope:'User-facing summary'}]});
 const text=result.toString('latin1');
 assert.ok(text.includes('Review \\(A\\) \\\\ B'));
 assert.ok(text.includes('<script>alert\\(1\\)</script>'));
 assert.ok(text.includes('/Type /Catalog'));
});
test('BA source UI removes redundant archive button, defaults preflight collapsed and preserves destructive safety',()=>{
 const ui=read('media/start.js'),html=read('src/lib/webview/dashboard-html.js'),host=read('src/lib/runtime/extension-runtime.js'),css=read('media/start.css');
 const sourceUi=ui.slice(ui.indexOf('function renderSourceDocuments(){'),ui.indexOf('function renderSourceSelection(){'));
 assert.doesNotMatch(sourceUi,/archive.textContent='Remove Source'/);
 assert.match(sourceUi,/remove.textContent='Delete'/);
 assert.match(sourceUi,/requestBRDeletion\(\{target:'active-source'/);
 assert.match(sourceUi,/actions.append\(replace,remove\)/);
 assert.match(html,/<details id="baSourcePreflight"/);
 assert.match(ui,/panel.open=false;panel.dataset.lastPhase=phase/);
 assert.match(css,/summary\.ba-source-preflight-toggle/);
 assert.match(html,/Download ISO 29148 Business Requirements/);
 assert.match(html,/Download Pre-flight Analyst/);
 assert.match(host,/case 'downloadISO29148BRPDF'/);
 assert.match(host,/sourceStore\.originalBytes\(registry,projectId,source\)/);
 assert.match(host,/baWorkingBr\.read\(registry,projectId,evidence\.workingBR\)/);
 assert.match(host,/filters:\{'PDF document':\['pdf'\]\}/);
 assert.match(host,/case 'downloadDocumentPreflight':/);
});
test('BA auto-claims are verified, only unassigned drafts, and never overwrite another owner',()=>{
 const ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
 const helper=host.slice(host.indexOf('async function autoClaimBARequirements('),host.indexOf('async function postAllOwnership(){'));
 assert.match(helper,/br\.status==='draft'/);
 assert.match(helper,/!br\.archivedFromRestart/);
 assert.match(helper,/snapshot\.cached\|\|snapshot\.scope==='local'/);
 assert.match(helper,/record\?\.ownerId\|\|record\?\.pending/);
 assert.match(helper,/action:'claim'/);
 assert.doesNotMatch(helper,/request-transfer|approve-transfer/);
 assert.match(ui,/function maybeAutoAssignBARequirements\(\)/);
 assert.match(ui,/selectedRole!=='business-analyst'/);
 assert.match(ui,/send\('baAutoClaimUnassigned'/);
 assert.match(host,/case 'baAutoClaimUnassigned':/);
 assert.match(host,/postBAOwners\(\)/);
});
test('generated draft confirmation uses rendered paragraphs rather than literal escaped \\n text',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 for(const begin of ["const confirmed=await uiWarning('AI generated ","const approval=await uiWarning('AI prepared "]){
  const first=host.indexOf(begin),last=host.indexOf('{modal:true',first);
  assert.ok(first>=0&&last>first);
  const prompt=host.slice(first,last);
  assert.ok(prompt.includes(String.raw`\n\n`),'should include JS newline escape sequence');
  assert.ok(!prompt.includes(String.raw`\\n\\n`),'literal double-backslash sequences must not appear');
 }
});
