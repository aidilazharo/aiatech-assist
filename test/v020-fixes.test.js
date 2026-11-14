'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const {loadDocument,saveDocumentMarkdown}=require('../src/document-editor');
const {OwnershipRegistry}=require('../src/ownership');
const {createServer,hash}=require('../service/server');
const {currentUser}=require('../src/companion-client');
const app=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const html=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
async function fixture(fn){const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-020-'));try{const registry=new ProjectRegistry(ws);const project=await registry.create({id:'project',name:'Project'});await ensureWorkspaceLibrary(ws);await scaffoldProject(ws,project);await fn({ws,project,registry});}finally{await fs.rm(ws,{recursive:true,force:true});}}
test('complex Markdown can be edited in-pane and saved losslessly with revision protection',()=>fixture(async({registry})=>{
 const before=await loadDocument(registry,'project','business-analyst','requirements');
 const md='# Business Requirement: <title>\n\n| Name | Value |\n| --- | --- |\n| foo | bar |\n\n```js\nconst n = 2;\n```\n';
 const saved=await saveDocumentMarkdown(registry,'project','business-analyst','requirements',md,before.revision);
 assert.equal(saved.markdown,md);
 const after=await loadDocument(registry,'project','business-analyst','requirements');assert.equal(after.markdown,md);
 await assert.rejects(saveDocumentMarkdown(registry,'project','business-analyst','requirements','stale',before.revision),/changed on disk/);
 await assert.rejects(saveDocumentMarkdown(registry,'project','business-analyst','requirements','x'.repeat(600000),after.revision),/512 KB/);
}));
test('Markdown edit refuses symlink path and cannot leave the project',()=>fixture(async({ws,registry})=>{
 const file=path.join(ws,'projects','project','documents','requirements','business-requirement.md');
 const before=await loadDocument(registry,'project','business-analyst','requirements');
 await fs.rm(file);await fs.symlink(path.join(ws,'.atgv','extension-settings.json'),file);
 await assert.rejects(saveDocumentMarkdown(registry,'project','business-analyst','requirements','# Safe',before.revision),/symlink/);
}));
test('editor rebuilds its entire Quill container and never disables complex Markdown editing',()=>{
 assert.match(app,/const wrapper=\$\('editorWysiwyg'\);wrapper\.replaceChildren\(\)/);
 assert.doesNotMatch(app,/\$\('quillEditor'\)\.replaceChildren\(\)/);
 assert.match(app,/function enterMarkdownMode\(/);
 assert.match(app,/if\(parsed\.complex\|\|typeof Quill!=='function'\)\{\s*enterMarkdownMode\(\)/);
 assert.doesNotMatch(app,/quill\.disable\(\)/);
 assert.match(app,/send\('saveRoleMarkdown'/);
 assert.match(html,/id="docAssign"/);assert.match(html,/id="docMarkdownSource"/);assert.doesNotMatch(html,/id="gateVersion"/);
});
test('local unowned document requires current owner approval before transfer',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-local-owner-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const db=new OwnershipRegistry(path.join(root,'local-ownership.json'));
 const id='business-analyst--requirements';
 let a=await db.act({project:'project',document:id,actor:'alice',action:'claim',expectedRevision:0});assert.equal(a.ownerId,'alice');
 await assert.rejects(db.act({project:'project',document:id,actor:'bob',action:'claim',expectedRevision:1}),/already owned/);
 a=await db.act({project:'project',document:id,actor:'bob',action:'request-transfer',expectedRevision:1});
 assert.equal(a.ownerId,'alice');assert.equal(a.pending.to,'bob');
 await assert.rejects(db.act({project:'project',document:id,actor:'bob',action:'approve-transfer',expectedRevision:2}),/Only the current/);
 a=await db.act({project:'project',document:id,actor:'alice',action:'approve-transfer',expectedRevision:2});assert.equal(a.ownerId,'bob');
});
test('companion service provides identity for assigning the document to me',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-020-svc-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const token='alice-test-token-more-than-twenty';const server=createServer({root,users:{[hash(token)]:{id:'alice',projects:['project']}}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>server.close());
 assert.deepEqual(await currentUser('http://127.0.0.1:'+server.address().port,token),{id:'alice'});
});
