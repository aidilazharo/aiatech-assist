'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const crypto=require('node:crypto');
const os=require('node:os');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const store=require('../src/source-store');
test('v252: Jira action is in BR heading, after Approved revision, never in snapshot body',()=>{
 const section=ui.slice(ui.indexOf('for(const group of grouped){'),ui.indexOf('// Change-only publication'));
 assert.ok(section.indexOf("heading.append(brElement('span','ba-completed-br-meta'")<section.indexOf('heading.append(viewJira)'));
 assert.match(section,/openBRJiraInventory\(group\.id\)/);
 assert.doesNotMatch(ui.slice(ui.indexOf('function appendSnapshot('),ui.indexOf('for(const group of grouped){')),/card\.append\(viewJira\)/);
 assert.match(section,/event\.stopPropagation\(\)/);
});
test('v252: actions are icon-only with exact tooltips and remain right aligned',()=>{
 for(const item of ["iconAction('refresh','Regenerate Jira Tasks')","iconAction('link','Reconcile Jira Links')","iconAction('trash','Delete Business Requirement',true)"])assert.ok(ui.includes(item));
 assert.match(css,/\.ba-completed-actionbar\{[^}]*justify-content:flex-end/);
 assert.match(ui,/send\('brRoleTaskRepairPreview'/);
 assert.match(ui,/send\('reconcileBRJiraLinks'/);
 assert.match(ui,/send\('deleteBREverywhere'/);
});
test('v252: approved requirement / discovery answers are keyboard-accessible tabs',()=>{
 assert.match(ui,/setAttribute\('role','tablist'\)/);
 assert.match(ui,/setAttribute\('role','tabpanel'\)/);
 assert.match(ui,/setAttribute\('role','tab'\)/);
 assert.match(ui,/selectEvidenceTab\(/);
 assert.match(ui,/activeEvidenceTabs\.get\(tabKey\)/);
 assert.match(ui,/ArrowLeft','ArrowRight','Home','End/);
});
test('v252: source click requests registered original download only',()=>{
 assert.match(ui,/send\('downloadBRSourceDocument',\{brId:br.id,sourceDigest:source.digest\}\)/);
 assert.match(host,/case 'downloadBRSourceDocument':/);
 assert.match(host,/sourceStore\.originalBytes\(registry,activeProject\.id,source\)/);
 assert.match(host,/vscode\.window\.showSaveDialog/);
 assert.match(host,/vscode\.workspace\.fs\.writeFile\(destination,original\)/);
});
test('v252: original source bytes are SHA256-verified, reject tampering and traversal',async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-v252-'));
 try{
  const registry={fileFor:()=>path.join(base,'registry.json')};
  const data=Buffer.from('%PDF-1.7\n% original source bytes\n');
  const digest='a'.repeat(64),byteDigest=crypto.createHash('sha256').update(data).digest('hex');
  const entry={name:'example.pdf',digest,byteDigest,storedName:digest+'.pdf'};
  const folder=path.join(base,'documents','requirements','sources');
  await fsp.mkdir(folder,{recursive:true});await fsp.writeFile(path.join(folder,entry.storedName),data);
  assert.deepEqual(await store.originalBytes(registry,'one',entry),data);
  await assert.rejects(store.originalBytes(registry,'one',{...entry,storedName:'../../secret.pdf'}),/unavailable/i);
  await assert.rejects(store.originalBytes(registry,'one',{...entry,byteDigest:''}),/checksum/);
  await fsp.writeFile(path.join(folder,entry.storedName),Buffer.from('tampered'));
  await assert.rejects(store.originalBytes(registry,'one',entry),/integrity/);
 }finally{await fsp.rm(base,{recursive:true,force:true});}
});
