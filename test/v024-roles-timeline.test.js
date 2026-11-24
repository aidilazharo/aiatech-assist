'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {ROLES,workState}=require('../src/sdlc-work');
const {getRoleSettings,saveRoleSettings,loadProjectRoles}=require('../src/sdlc-catalog');
const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const {readTimeline,saveRoleTimeline}=require('../src/planning');
const {loadDocument}=require('../src/document-editor');
async function fixture(fn){const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v024-'));try{
  const registry=new ProjectRegistry(ws),project=await registry.create({id:'demo',name:'Demo'});
  await ensureWorkspaceLibrary(ws);await scaffoldProject(ws,project);
  return await fn({ws,registry,project});
}finally{await fs.rm(ws,{recursive:true,force:true});}}
test('standard SDLC catalogue has predefined roles, without a create-role UI',()=>{
 const html=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const script=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.ok(ROLES.length>=14);
 for(const id of ['security-engineer','product-owner','data-engineer','ux-designer','uat-tester'])assert.ok(ROLES.some(x=>x.id===id));
 assert.doesNotMatch(html,/id="showRoleCreator"|id="roleCreator"|id="newRoleName"/);
 assert.doesNotMatch(html,/Locally stored timeline and diagram documents\. Remote synchronization is separate\./);
 assert.doesNotMatch(script,/Select a project to continue\./);
 assert.match(html,/id="roleSettingsForm"/);assert.match(html,/id="roleTimelineForm"/);
});
test('role settings are project scoped, preserve documents, prevent stale saves and last-role disable',()=>fixture(async({registry,ws})=>{
  const before=await getRoleSettings(registry,'demo');
  assert.equal(before.roles.length,ROLES.length+4);assert.deepEqual(before.enabled,['business-analyst','project-manager','solution-architect','ux-designer','software-developer','uat-tester']);assert.deepEqual(before.order.slice(0,6),before.enabled);
  const doc=await loadDocument(registry,'demo','business-analyst','requirements');
  const enabled=before.enabled.filter(x=>x!=='business-analyst');
  const after=await saveRoleSettings(registry,'demo',enabled,before.revision);
  assert.equal(after.enabled.includes('business-analyst'),false);
  assert.equal((await loadProjectRoles(registry,'demo')).some(r=>r.id==='business-analyst'),false);
  assert.equal((await workState(registry,'demo')).roles.some(r=>r.id==='business-analyst'),false);
  await assert.rejects(saveRoleSettings(registry,'demo',before.enabled,before.revision),/changed/i);
  await assert.rejects(saveRoleSettings(registry,'demo',[],after.revision),/at least one/i);
  assert.equal(await fs.readFile(path.join(ws,'projects/demo/documents/requirements/business-requirement.md'),'utf8'),doc.markdown);
  await saveRoleSettings(registry,'demo',before.enabled,after.revision);
  assert.equal((await loadDocument(registry,'demo','business-analyst','requirements')).markdown,doc.markdown);
}));
test('fresh timeline defaults to seven inclusive calendar days per role',()=>fixture(async({registry})=>{
 const tl=await readTimeline(registry,'demo');
 assert.equal(tl.tasks.length,6);
 for(const t of tl.tasks){const days=Math.round((Date.parse(t.end+'T00:00:00Z')-Date.parse(t.start+'T00:00:00Z'))/86400000);assert.equal(days,6,t.id);}
 assert.match(tl.revision,/^[a-f0-9]{64}$/);
}));
test('role timeline edits immediately update chart data and reject stale revisions',()=>fixture(async({registry})=>{
 const roles=await getRoleSettings(registry,'demo');await saveRoleSettings(registry,'demo',[...roles.enabled,'qa-engineer'],roles.revision);
 const initial=await readTimeline(registry,'demo');
 const saved=await saveRoleTimeline(registry,'demo','qa-engineer',{start:'2026-11-04',end:'2026-11-10',progress:65},initial.revision);
 assert.deepEqual(saved.tasks.find(t=>t.id==='qa-engineer'),{...initial.tasks.find(t=>t.id==='qa-engineer'),start:'2026-11-04',end:'2026-11-10',progress:65});
 assert.deepEqual((await readTimeline(registry,'demo')).tasks.find(t=>t.id==='qa-engineer'),saved.tasks.find(t=>t.id==='qa-engineer'));
 await assert.rejects(saveRoleTimeline(registry,'demo','qa-engineer',{start:'2026-11-06',end:'2026-11-13',progress:50},initial.revision),/changed/i);
 await assert.rejects(saveRoleTimeline(registry,'demo','qa-engineer',{start:'2026-11-12',end:'2026-11-10',progress:50},saved.revision),/valid dates/i);
 await assert.rejects(saveRoleTimeline(registry,'demo','qa-engineer',{start:'2026-11-04',end:'2026-11-10',progress:101},saved.revision),/0–100/i);
}));
test('disabled roles cannot edit timeline but previous work is preserved',()=>fixture(async({registry})=>{
 let s=await getRoleSettings(registry,'demo');s=await saveRoleSettings(registry,'demo',[...s.enabled,'qa-engineer'],s.revision);
 const prev=await readTimeline(registry,'demo'),before=prev.tasks.find(t=>t.id==='qa-engineer');
 await saveRoleSettings(registry,'demo',s.enabled.filter(x=>x!=='qa-engineer'),s.revision);
 const active=await readTimeline(registry,'demo');assert.equal(active.tasks.some(t=>t.id==='qa-engineer'),false);
 await assert.rejects(saveRoleTimeline(registry,'demo','qa-engineer',{start:'2026-11-01',end:'2026-11-07',progress:0},active.revision),/not enabled/i);
 s=await getRoleSettings(registry,'demo');await saveRoleSettings(registry,'demo',ROLES.map(x=>x.id),s.revision);
 assert.deepEqual((await readTimeline(registry,'demo')).tasks.find(t=>t.id==='qa-engineer'),before);
}));
