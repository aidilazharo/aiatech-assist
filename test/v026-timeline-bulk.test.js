'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),fsSync=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const {readTimeline,saveRoleTimeline,saveBulkRoleTimelines}=require('../src/planning');
const {getRoleSettings,saveRoleSettings}=require('../src/sdlc-catalog');
async function fixture(callback){
  const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v026-'));
  try{
    const registry=new ProjectRegistry(ws),project=await registry.create({id:'schedules',name:'Schedules'});
    await ensureWorkspaceLibrary(ws);await scaffoldProject(ws,project);
    return await callback({ws,registry});
  }finally{await fs.rm(ws,{recursive:true,force:true});}
}
function allUpdates(timeline){return timeline.tasks.map(t=>({roleId:t.id,start:t.start,end:t.end,progress:t.progress}));}
test('bulk timeline saves all enabled role dates with one revision and preserves dependencies',()=>fixture(async({ws,registry})=>{
  const initial=await readTimeline(registry,'schedules'),updates=allUpdates(initial);
  updates[0]={...updates[0],start:'2026-11-02',end:'2026-11-15',progress:45};
  updates[1]={...updates[1],start:'2026-11-17',end:'2026-11-23',progress:20};
  const saved=await saveBulkRoleTimelines(registry,'schedules',updates,initial.revision);
  assert.equal(saved.tasks[0].start,'2026-11-02');assert.equal(saved.tasks[0].end,'2026-11-15');
  assert.equal(saved.tasks[1].progress,20);
  assert.equal(saved.tasks[1].dependencies,initial.tasks[1].dependencies);
  const disk=JSON.parse(await fs.readFile(path.join(ws,'projects/schedules/sdlc/timeline.json'),'utf8'));
  assert.equal(disk.tasks.length,initial.tasks.length);
  await assert.rejects(saveBulkRoleTimelines(registry,'schedules',updates,initial.revision),/changed/i);
}));
test('bulk timeline rejects malformed, incomplete, duplicated or out-of-range edits without changing file',()=>fixture(async({registry})=>{
  const initial=await readTimeline(registry,'schedules'),valid=allUpdates(initial);
  const rejects=[
    valid.slice(1),
    valid.map((entry,index)=>index===1?{...entry,roleId:valid[0].roleId}:entry),
    valid.map((entry,index)=>index===1?{...entry,roleId:'unknown-role'}:entry),
    valid.map((entry,index)=>index===1?{...entry,start:'2026-12-30',end:'2026-12-01'}:entry),
    valid.map((entry,index)=>index===1?{...entry,progress:101}:entry),
    valid.map((entry,index)=>index===1?{...entry,progress:22.5}:entry),
  ];
  for(const updates of rejects){
    await assert.rejects(saveBulkRoleTimelines(registry,'schedules',updates,initial.revision));
    assert.equal((await readTimeline(registry,'schedules')).revision,initial.revision);
  }
}));
test('bulk timeline preserves disabled role data and refuses updating a disabled role',()=>fixture(async({registry})=>{
  const initial=await readTimeline(registry,'schedules');
  const first=initial.tasks[0];
  const saved=await saveRoleTimeline(registry,'schedules',first.id,{start:'2026-10-30',end:'2026-11-05',progress:42},initial.revision);
  const settings=await getRoleSettings(registry,'schedules');
  await saveRoleSettings(registry,'schedules',settings.enabled.filter(id=>id!==first.id),settings.revision);
  const after=await readTimeline(registry,'schedules');
  assert.equal(after.tasks.some(t=>t.id===first.id),false);
  await assert.rejects(saveBulkRoleTimelines(registry,'schedules',allUpdates(saved),after.revision),/every enabled role/i);
  const rest=allUpdates(after);
  rest[0].progress=55;
  await saveBulkRoleTimelines(registry,'schedules',rest,after.revision);
  const newSettings=await getRoleSettings(registry,'schedules');
  await saveRoleSettings(registry,'schedules',settings.enabled,newSettings.revision);
  const restored=await readTimeline(registry,'schedules');
  assert.equal(restored.tasks.find(t=>t.id===first.id).progress,42);
}));
test('timeline UI restricts bulk date editing to Settings and retains revision safe host dispatch',()=>{
  const ui=fsSync.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
  const html=fsSync.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
  assert.doesNotMatch(ui,/on_click:task=>/);
  assert.match(html,/id="settingsRoleScheduleHeading"/);
  for(const id of ['roleTimelineDuration','bulkTimelineModal','bulkTimelineRows','bulkTimelineSave'])assert.match(html,new RegExp('id="'+id+'"'));
  for(const action of ['saveBulkRoleTimelines','bulkTimelineSaved','timelineEndFromDuration','timelineDuration'])assert.match(ui,new RegExp(action));
  assert.match(html,/case 'saveBulkRoleTimelines'/);
});
