'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {ROLES,workState,toggleTask,openTaskDocument}=require('../src/sdlc-work');
const rootOfSource=path.resolve(__dirname,'..');
const mockVscode=(opened)=>({Uri:{file:fsPath=>({fsPath})},window:{showTextDocument:async file=>opened.push(file.fsPath)}});
async function fixture(fn){const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-role-'));try{
  const registry=new ProjectRegistry(ws);await registry.ensureRoot();await registry.create({id:'alpha',name:'Alpha'});await registry.create({id:'beta',name:'Beta'});
  const {getRoleSettings,saveRoleSettings}=require('../src/sdlc-catalog');const initial=await getRoleSettings(registry,'alpha');await saveRoleSettings(registry,'alpha',[...initial.enabled,'qa-engineer'],initial.revision);
  await fn({ws,registry});
}finally{await fs.rm(ws,{recursive:true,force:true});}}
test('standard SDLC catalogue includes all built-in role deliverables',()=>{
  for(const id of ['business-analyst','project-manager','solution-architect','software-developer','qa-engineer','release-manager','product-owner','scrum-master','ux-designer','security-engineer','data-engineer','uat-tester','technical-writer','operations-support'])assert.ok(ROLES.some(r=>r.id===id),id);
  assert.equal(ROLES.every(role=>role.tasks.length>=3),true);
  assert.equal(ROLES.every(role=>role.tasks.some(task=>task.document)),true);
});
test('creating a task document uses a template and does not overwrite edits',async()=>fixture(async({ws,registry})=>{
  const opened=[],vscode=mockVscode(opened);
  const file=await openTaskDocument(registry,'alpha','business-analyst','requirements',vscode,rootOfSource);
  assert.ok(file.startsWith(path.join(ws,'projects','alpha')));
  await fs.writeFile(file,'User edited content');
  await openTaskDocument(registry,'alpha','business-analyst','requirements',vscode,rootOfSource);
  assert.equal(await fs.readFile(file,'utf8'),'User edited content');assert.equal(opened.length,2);
}));
test('completion is scoped by project, and documentary completion requires an existing file',async()=>fixture(async({registry})=>{
  await assert.rejects(toggleTask(registry,'alpha','qa-engineer','cases',true),/Create the required document/);
  const state=await workState(registry,'alpha');assert.equal(state.progress['qa-engineer'],undefined);
  await openTaskDocument(registry,'alpha','qa-engineer','cases',mockVscode([]),rootOfSource);
  await toggleTask(registry,'alpha','qa-engineer','cases',true);
  assert.equal((await workState(registry,'alpha')).progress['qa-engineer'].cases,true);
  assert.equal((await workState(registry,'beta')).progress['qa-engineer']?.cases,undefined);
  await toggleTask(registry,'alpha','qa-engineer','cases',false);
  assert.equal((await workState(registry,'alpha')).progress['qa-engineer'].cases,undefined);
}));
test('role and task IDs cannot escape their project or access unknown tasks',async()=>fixture(async({registry})=>{
  await assert.rejects(toggleTask(registry,'alpha','../beta','cases',true),/Unknown SDLC role/);
  await assert.rejects(openTaskDocument(registry,'alpha','qa-engineer','../../evil',mockVscode([]),rootOfSource),/Unknown SDLC task/);
}));
test('refuses to create documents via symlinked project document folders',async()=>fixture(async({ws,registry})=>{
  const external=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-external-'));
  try{
    const docs=path.join(ws,'projects','alpha','documents');await fs.symlink(external,docs,'dir');
    await assert.rejects(openTaskDocument(registry,'alpha','qa-engineer','cases',mockVscode([]),rootOfSource),/symlink/);
  }finally{await fs.rm(external,{recursive:true,force:true});}
}));
