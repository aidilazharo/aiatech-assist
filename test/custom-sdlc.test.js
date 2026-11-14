'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {createProjectRole,loadProjectRoles}=require('../src/sdlc-catalog');
const {workState,toggleTask}=require('../src/sdlc-work');
const {loadDocument,saveDocument}=require('../src/document-editor');
const {createTimeline,readTimeline,readDiagram,saveDiagramModel}=require('../src/planning');
const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
async function fixture(cb){const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-custom-'));try{
  const registry=new ProjectRegistry(ws),project=await registry.create({id:'omega',name:'Omega'});
  await ensureWorkspaceLibrary(ws);await scaffoldProject(ws,project);await cb({ws,registry,project});
}finally{await fs.rm(ws,{force:true,recursive:true});}}
test('legacy custom SDLC roles stay readable and editable',()=>fixture(async({ws,registry})=>{
  const role=await createProjectRole(registry,'omega',{label:'Compliance Specialist',stage:'Compliance Review',documents:'Threat Model\nSecurity Assessment'});
  assert.equal(role.tasks.length,2);assert.equal(role.id,'compliance-specialist');
  assert.ok((await loadProjectRoles(registry,'omega')).some(r=>r.id===role.id));
  assert.ok((await fs.readFile(path.join(ws,'projects/omega/sdlc/processes/compliance-review.json'),'utf8')).includes('Compliance Review'));
  const document=await loadDocument(registry,'omega','compliance-specialist','threat-model');assert.match(document.markdown,/Threat Model/);
  const result=await saveDocument(registry,'omega','compliance-specialist','threat-model',{ops:[{insert:'Threat review\n'}]},document.revision);
  assert.match(result.markdown,/Threat review/);
  await toggleTask(registry,'omega','compliance-specialist','threat-model',true);
  const state=await workState(registry,'omega');assert.equal(state.progress['compliance-specialist']['threat-model'],true);
  await assert.rejects(createProjectRole(registry,'omega',{label:'Compliance Specialist',documents:'Dup'}),/exists/);
}));
test('SDLC role definitions cannot traverse project files or use symlinks',()=>fixture(async({ws,registry})=>{
  const safeRole=await createProjectRole(registry,'omega',{label:'Bad Role',documents:'../escape'});
  assert.equal(safeRole.tasks[0].document,'custom/bad-role/escape.md');
  const folder=path.join(ws,'projects/omega/sdlc/roles');await fs.symlink('/etc/hosts',path.join(folder,'evil.json'));
  await assert.rejects(loadProjectRoles(registry,'omega'),/regular file/);
}));
test('project Gantt and architecture files are local, editable and preserve author edits',()=>fixture(async({registry,ws,project})=>{
  const initial=await readTimeline(registry,'omega');assert.ok(initial.tasks.length>=6);
  const file=path.join(ws,'projects/omega/sdlc/timeline.json');await fs.writeFile(file,JSON.stringify({tasks:[{id:'a',name:'New phase',start:'2026-11-01',end:'2026-11-05',progress:20}] }));
  await createTimeline(registry,'omega');await scaffoldProject(ws,project);
  assert.ok((await readTimeline(registry,'omega')).tasks.some(t=>t.name==='New phase'));
  const old=await readDiagram(registry,'omega');assert.equal(old.editable,true);
  const changed={...old.model,title:'Architecture Update',nodes:[{id:'api',label:'API',x:50,y:80,width:160,height:65}],edges:[]};
  const saved=await saveDiagramModel(registry,'omega',changed,old.revision);assert.equal((await readDiagram(registry,'omega')).model.title,'Architecture Update');
  await assert.rejects(saveDiagramModel(registry,'omega',old.model,old.revision),/changed on disk/);
  assert.match(saved.revision,/^[a-f0-9]{64}$/);
}));
test('HTML shell points to local vendor files, not external CDN',()=>{
  const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
  assert.ok(!source.includes('cdn.jsdelivr.net'));assert.match(source,/catalogVendorLibraries\.install/);assert.doesNotMatch(source,/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(source,/frame-src \$\{webview.cspSource\}/);
  assert.match(source,/diagram-canvas\.js/);
});
