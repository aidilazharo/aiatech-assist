'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const sync=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {collectProjectKnowledge}=require('../src/knowledge-workspace');
const root=path.resolve(__dirname,'..');
const extension=sync.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=sync.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=sync.readFileSync(path.join(root,'media/start.css'),'utf8');
test('Workspace RAG indexes nested project documents and knowledge while ignoring excluded paths',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-rag-'));
 try{
  await fs.mkdir(path.join(dir,'documents','requirements'),{recursive:true});
  await fs.mkdir(path.join(dir,'knowledge'),{recursive:true});
  await fs.mkdir(path.join(dir,'documents','node_modules'),{recursive:true});
  await fs.writeFile(path.join(dir,'documents','requirements','br.md'),'Acceptance criteria: verified account');
  await fs.writeFile(path.join(dir,'knowledge','decision.txt'),'Decision ADR-007');
  await fs.writeFile(path.join(dir,'documents','node_modules','secret.md'),'not indexed');
  const docs=await collectProjectKnowledge(dir,{limit:5,maxBytes:300});
  assert.equal(docs.length,2);
  assert.ok(docs.some(d=>d.title==='documents/requirements/br.md'));
  assert.ok(docs.some(d=>d.title==='knowledge/decision.txt'));
  assert.ok(docs.every(d=>d.provider==='Workspace'&&!d.text.includes('not indexed')));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Workspace RAG does not follow symlinks, skips oversized docs and enforces limits',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-rag-sec-'));
 try{
  await fs.mkdir(path.join(dir,'documents'),{recursive:true});
  await fs.writeFile(path.join(dir,'documents','large.md'),'X'.repeat(500));
  await fs.writeFile(path.join(dir,'documents','small.md'),'test');
  await fs.symlink(path.join(dir,'documents','small.md'),path.join(dir,'documents','linked.md'));
  const docs=await collectProjectKnowledge(dir,{limit:1,maxBytes:150});
  assert.equal(docs.length,1);
  assert.equal(docs[0].title,'documents/small.md');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Knowledge sync can run while locally opened, preserves offline cache on remote failure, and reports provider status',()=>{
 assert.match(extension,/case 'sync':requireOpened\(\)/);
 assert.doesNotMatch(extension,/case 'sync':requireOnline\(\)/);
 assert.match(extension,/const docs=await knowledgeWorkspace\.collectProjectKnowledge/);
 assert.match(extension,/catch\(e\)\{errors\.push\(\{source:name,message:e\.message\}\)/);
 assert.match(extension,/if\(connected&&openingOffline\)\{openingOffline=false/);
 assert.match(ui,/m\.type==='knowledgeSyncResult'/);
 assert.match(ui,/m\.type==='knowledgeSyncProgress'/);
});
test('RAG consent checkbox is removed and the role menu participates in sidebar layout',()=>{
 assert.doesNotMatch(extension,/id="ragConsent"/);
 assert.match(css,/\.rag-consent-row\{display:flex!important/);
 assert.match(css,/\.role-picker-menu\{position:static/);
 assert.match(css,/\.sidebar-footer:has\(\.role-picker-menu:not\(\.hidden\)\)/);
});
test('No process-level ownership; individual BR editing still requires its owner',()=>{
 assert.doesNotMatch(extension,/<div class="discovery-page-head">[^<]*<h1>Business Requirement<\/h1><div class="ba-owner-toolbar"/);
 assert.match(extension,/if\(documentId==='ba-discovery'\)\{/);
 assert.match(extension,/if\(!enabled\.enabled\.includes\('business-analyst'\)\)/);
 assert.match(extension,/if\(!snapshot\.me\|\|!record\?\.ownerId\|\|record\.ownerId!==snapshot\.me\)/);
 assert.match(extension,/Only Business Requirement documents can be assigned ownership/);
 assert.match(ui,/documentId==='ba-discovery'\)return !!activeId&&selectedRole==='business-analyst'/);
 assert.doesNotMatch(ui,/values\.set\('ba-discovery'/);
});
test('Business Analyst My Work restores requirements overview alongside Jira inventory',()=>{
 const start=extension.indexOf('<main id="workView"');
 const part=extension.slice(start,extension.indexOf('<section id="pmDailyCockpit"',start));
 assert.match(part,/<h1 id="workTitle">Business Analyst<\/h1>/);
 assert.match(part,/id="baMyWorkDashboard"/);
 assert.match(part,/id="baJiraInventorySection"/);
 assert.doesNotMatch(part,/id="workDescription"/);
 assert.equal((extension.match(/id="rolePercent"/g)||[]).length,1);
});
