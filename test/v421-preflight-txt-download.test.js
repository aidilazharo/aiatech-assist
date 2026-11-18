'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const report=require('../src/ba-preflight-report');
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
