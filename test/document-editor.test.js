'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {ROLES}=require('../src/sdlc-work');
const {scaffoldProject,ensureWorkspaceLibrary}=require('../src/tech-stacks');
const {loadDocument,saveDocument,parseDelta}=require('../src/document-editor');
async function fixture(fn){const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-editor-'));try{
  const registry=new ProjectRegistry(ws);const project=await registry.create({id:'project',name:'Project'});
  const {getRoleSettings,saveRoleSettings}=require('../src/sdlc-catalog');const initial=await getRoleSettings(registry,'project');await saveRoleSettings(registry,'project',[...initial.enabled,'qa-engineer'],initial.revision);
  await ensureWorkspaceLibrary(ws);await scaffoldProject(ws,project);
  await fn({ws,registry,project});
}finally{await fs.rm(ws,{recursive:true,force:true});}}
test('explicit project initialization scaffolds placeholders for every role',()=>fixture(async({ws})=>{
  for(const role of ROLES)for(const task of role.tasks.filter(t=>t.document)){
    const file=path.join(ws,'projects','project','documents',task.document);
    const content=await fs.readFile(file,'utf8');assert.ok(content.length>0,role.id+'/'+task.id);
  }
}));
test('initialization never overwrites user-authored role documents',()=>fixture(async({ws,project})=>{
  const file=path.join(ws,'projects','project','documents','requirements','business-requirement.md');
  await fs.writeFile(file,'# My custom document\n');
  await scaffoldProject(ws,project);
  assert.equal(await fs.readFile(file,'utf8'),'# My custom document\n');
}));
test('Quill Delta saves Markdown and rejects stale source revisions',()=>fixture(async({registry})=>{
  const a=await loadDocument(registry,'project','business-analyst','requirements');
  const result=await saveDocument(registry,'project','business-analyst','requirements',
    {ops:[{insert:'Business requirements'},{insert:'\n',attributes:{header:1}},{insert:'Write acceptance criteria',attributes:{bold:true}},{insert:'\n'}]},a.revision);
  assert.equal(result.markdown,'# Business requirements\n**Write acceptance criteria**\n');
  await assert.rejects(saveDocument(registry,'project','business-analyst','requirements',{ops:[{insert:'Oops\n'}]},a.revision),/changed on disk/);
}));
test('Quill document changes remain confined to selected project and expected role',()=>fixture(async({registry})=>{
  await assert.rejects(loadDocument(registry,'project','../test','requirements'),/Unknown SDLC role/);
  await assert.rejects(loadDocument(registry,'project','business-analyst','../secrets'),/Not a role document/);
  assert.throws(()=>parseDelta({ops:[{insert:{image:'data:x'}}]}),/Only text/);
  assert.throws(()=>parseDelta({ops:[{insert:'a'.repeat(512001)}]}),/Only text|512 KB/);
}));
test('document editor refuses to follow symlinked files',()=>fixture(async({ws,registry})=>{
  const file=path.join(ws,'projects','project','documents','testing','test-cases.md');
  const external=path.join(ws,'outside.md');await fs.writeFile(external,'Outside');await fs.rm(file);
  await fs.symlink(external,file);
  await assert.rejects(loadDocument(registry,'project','qa-engineer','cases'),/symlinks/);
}));
test('Markdown formatter handles headings, lists, quotations and inline emphasis',()=>{
  const result=parseDelta({ops:[{insert:'Plan'},{insert:'\n',attributes:{header:2}},
    {insert:'Review'},{insert:'\n',attributes:{list:'bullet'}},
    {insert:'Important',attributes:{italic:true}},{insert:'\n',attributes:{blockquote:true}}]});
  assert.equal(result,'## Plan\n- Review\n> *Important*\n');
});
