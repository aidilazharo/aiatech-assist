'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const report=require('../src/ba-preflight-report');
const preflight=require('../src/ba-document-preflight');
const digest='a'.repeat(64);
const source=[{digest,name:'GATE Project Initiation and Project Approval BRD Revised v1.1.docx'}];
const result=(n)=>({ready:n!==3,summary:'Checked section '+n,applied:[],skipped:[],
 resolutions:[{category:'keyboard',standard:'WCAG 2.2 AA',issue:'Keyboard navigation not specified',resolution:'Provide accessible focus',rationale:'Support native keys',provisional:true}],
 issues:[{severity:n===3?'blocker':'warning',category:'contradiction',detail:'CAPEX Project Code example conflict '+n,suggestion:'Confirm business rule'}]});
test('preflight TXT export contains every section and retry, including unresolved conflicts',()=>{
 const s=report.create('TC',source);
 report.capture(s,{digest,sourceName:source[0].name,section:1,totalSections:3,attempt:1,report:result(1)});
 report.capture(s,{digest,sourceName:source[0].name,section:2,totalSections:3,attempt:1,report:result(2)});
 report.capture(s,{digest,sourceName:source[0].name,section:3,totalSections:3,attempt:2,report:result(3)});
 report.finish(s,{state:'blocked',error:'Cross-section business rule conflict requires clarification'});
 const text=report.format(s,{generatedAt:'2026-11-19T00:00:00Z'});
 assert.match(text,/DOCUMENT: GATE Project Initiation/);
 assert.match(text,/Section 1\/3 - Attempt 1\/2/);
 assert.match(text,/Section 2\/3 - Attempt 1\/2/);
 assert.match(text,/Section 3\/3 - Attempt 2\/2/);
 assert.match(text,/Processing state: BLOCKED/);
 assert.match(text,/UNRESOLVED|business rule conflict/i);
 assert.match(text,/CAPEX Project Code example conflict 3/);
 assert.match(text,/WCAG 2\.2 AA/);
 assert.match(text,/PROVISIONAL/);
 assert.match(text,/Original uploaded file: UNCHANGED/);
});
test('download unavailable before any findings, and source identities are validated',()=>{
 const s=report.create('TC',source);
 assert.throws(()=>report.format(s),/No completed preflight findings/);
 assert.throws(()=>report.capture(s,{digest:'b'.repeat(64),report:result(1)}),/Unrecognized/);
});
test('saved results can be exported after a reload with a truthful bounded-summary notice',()=>{
 const session=report.fromSaved('TC',source,[{digest,status:'ready',summary:'All mapped',checkedAt:'2026-11-18T00:00:00Z',issues:result(1).issues,resolutions:result(1).resolutions,applied:[]}]);
 const txt=report.format(session);
 assert.match(txt,/saved bounded preflight evidence/);
 assert.match(txt,/bounded summary/);
 assert.match(txt,/Saved aggregate summary/);
 assert.match(txt,/All mapped/);
 assert.equal(report.fromSaved('TC',source,[{digest:'b'.repeat(64)}]),null);
});
test('report compares original and updated working text and preserves proposed changes after reload',()=>{
 const original='Add namme using keyboard. The limit is 100 characters.';
 const parsed=preflight.parse(JSON.stringify({status:'ready',summary:'Checked',edits:[
  {before:'Add namme',after:'Add name',reason:'Spelling'},
  {before:'100 characters',after:'200 characters',reason:'Suggested new limit'}
 ],issues:[{severity:'warning',category:'keyboard',detail:'Keyboard behavior needs clarification',sourceExcerpt:'using keyboard',suggestion:'Use native keyboard semantics'}]}),original);
 assert.equal(parsed.effectiveText,'Add name using keyboard. The limit is 100 characters.');
 const docs=[{...source[0],byteDigest:'b'.repeat(64)}];
 const session=report.create('TC',docs);
 report.capture(session,{digest,sourceName:docs[0].name,section:1,totalSections:1,attempt:1,report:parsed});
 report.finish(session,{state:'completed'});
 const txt=report.format(session);
 assert.match(txt,/CORRECTIONS AND CHANGES BASED ON THE ORIGINAL DOCUMENT/);
 assert.match(txt,/Original file SHA-256: b{64}/);
 assert.match(txt,/Original text: Add namme/);
 assert.match(txt,/Working text after correction: Add name/);
 assert.match(txt,/Used in the working BR sent to mapping/);
 assert.match(txt,/Verified original text: 100 characters/);
 assert.match(txt,/Proposed replacement: 200 characters/);
 assert.match(txt,/Status: NOT APPLIED/);
 assert.match(txt,/Original excerpt: using keyboard/);
 assert.match(txt,/PROVISIONAL MAPPING GUIDANCE/);
 const saved=report.fromSaved('TC',docs,[preflight.evidence(parsed,digest)]);
 const restored=report.format(saved);
 for(const expected of ['Add namme','Add name','100 characters','200 characters','using keyboard'])assert.ok(restored.includes(expected),expected);
});
test('unverified AI quotations are not reported as source evidence',()=>{
 const parsed=preflight.parse(JSON.stringify({status:'ready',summary:'Checked',edits:[],issues:[{severity:'warning',category:'keyboard',detail:'Missing keyboard rules',sourceExcerpt:'fabricated quotation',suggestion:'Use standard keys'}]}),'No relevant quotation exists.');
 assert.equal(parsed.issues[0].sourceExcerpt,'');
 assert.equal(parsed.resolutions[0].sourceExcerpt,'');
 const s=report.create('TC',source);report.capture(s,{digest,sourceName:source[0].name,section:1,totalSections:1,attempt:1,report:parsed});report.finish(s,{state:'blocked'});
 const txt=report.format(s);
 assert.match(txt,/No verified quotation available/);
 assert.doesNotMatch(txt,/fabricated quotation/);
 assert.match(txt,/completion of mapping is not confirmed|mapping from this check is not confirmed/i);
});
test('saved multi-section report retains corrections beyond the aggregate preview limit',()=>{
 const parts=[];
 for(let section=0;section<2;section++){
  const lines=Array.from({length:10},(_,i)=>`Item ${section*10+i} namme`);
  parts.push(preflight.parse(JSON.stringify({status:'ready',summary:'Checked',edits:lines.map(before=>({before,after:before.replace('namme','name'),reason:'Spelling'})),issues:[]}),lines.join('\n')));
 }
 const combined={status:'ready',summary:'Checked',applied:parts.flatMap(part=>part.applied).slice(0,12),skipped:[],issues:[],resolutions:[],sections:parts};
 const saved=preflight.evidence(combined,digest);
 const txt=report.format(report.fromSaved('TC',source,[saved]));
 assert.match(txt,/RECORDED WORKING-TEXT CORRECTIONS: 20/);
 assert.match(txt,/Original text: Item 19 namme/);
 assert.match(txt,/Working text after correction: Item 19 name/);
});
test('download filename is Windows-safe and has a TXT extension',()=>{
 assert.equal(report.filename('TC','GATE Project Initiation and Project Approval BRD Revised v1.1.docx'),'ATGV-Preflight-TC-GATE-Project-Initiation-and-Project-Approval-BRD-Revised-v1.1.txt');
 assert.match(report.filename('T|C','../bad<name>?.pdf'),/^ATGV-Preflight-T-C-bad-name-.txt$|^ATGV-Preflight-T-C-bad-name.txt$/);
});

test('BA panel exposes TXT download; host captures checked sections and exports via VS Code',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'..');
 const markup=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
 const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
 assert.match(markup,/id="baPreflightDownload"[^>]*disabled/);
 assert.match(markup,/Download Pre-flight \(\.txt\)/);
 assert.match(ui,/\$\('baPreflightDownload'\)\.addEventListener\('click'/);
 assert.match(ui,/send\('downloadDocumentPreflight',\{projectId:activeId\}\)/);
 assert.match(ui,/reportAvailable:true/);
 assert.match(ui,/discoveryPreflightDownloadResult/);
 assert.match(host,/case 'downloadDocumentPreflight':/);
 assert.match(host,/baPreflightReports\.capture\(/);
 assert.match(host,/baPreflightReports\.fromSaved\(/);
 assert.match(host,/baPreflightReports\.format\(/);
 assert.match(host,/vscode\.workspace\.fs\.writeFile\(destination,Buffer\.from\(content,'utf8'\)\)/);
 assert.match(css,/#discoveryView #baPreflightDownload/);
});
