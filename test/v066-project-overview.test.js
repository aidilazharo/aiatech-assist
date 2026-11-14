'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {projectHealth}=require('../src/project-health');
const {ProjectRegistry,normalizeProjectInput}=require('../src/projects');
const root=path.resolve(__dirname,'..');
const extension=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const frontend=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
function work(completed,total=10){return {roles:[{id:'dev',tasks:Array.from({length:total},(_,i)=>({id:'t'+i}))}],progress:{dev:Object.fromEntries(Array.from({length:completed},(_,i)=>['t'+i,true]))}};}
function project(startDate,endDate){return {schedule:{startDate,endDate}};}
test('project status is calculated from dates and actually completed tasks',()=>{
 assert.equal(projectHealth(project('2026-11-01','2026-11-30'),work(0),'2026-10-28').label,'Not Started');
 assert.equal(projectHealth(project('2026-10-01','2026-10-31'),work(10),'2026-10-28').label,'Completed');
 assert.equal(projectHealth(project('2026-10-01','2026-10-31'),work(1),'2026-11-01').label,'Delayed');
 assert.equal(projectHealth(project('2026-10-01','2026-10-31'),work(2),'2026-10-21').label,'At Risk');
 assert.equal(projectHealth(project('2026-10-01','2026-10-31'),work(8),'2026-10-21').label,'On Track');
 assert.equal(projectHealth(project('2026-10-01','2026-10-31'),work(0),'2026-10-02').label,'In Progress');
 assert.equal(projectHealth(project('',''),work(0),'2026-10-28').label,'Not Scheduled');
 assert.equal(projectHealth(project('',''),work(2),'2026-10-28').label,'In Progress');
 assert.equal(projectHealth(project('2026-10-01','2026-10-31'),work(3),'2026-10-10').percent,30);
});
test('project schedule validates dates and remains backward compatible',()=>{
 const old=normalizeProjectInput({id:'demo',name:'Demo'});
 assert.deepEqual(old.schedule,{startDate:'',endDate:''});
 const next=normalizeProjectInput({id:'demo',name:'Demo',schedule:{startDate:'2026-10-01',endDate:'2026-11-01'}},old);
 assert.equal(next.schedule.endDate,'2026-11-01');
 assert.deepEqual(normalizeProjectInput({id:'demo',name:'Demo'},next).schedule,next.schedule);
 assert.throws(()=>normalizeProjectInput({name:'No',schedule:{startDate:'2026-10-15',endDate:'2026-10-14'}}),/precede/);
 assert.throws(()=>normalizeProjectInput({name:'No',schedule:{startDate:'2026-02-30',endDate:'2026-03-10'}}),/valid/);
 assert.throws(()=>normalizeProjectInput({name:'No',schedule:{startDate:'2026-01-01',endDate:''}}),/both/);
});
test('project dates survive registry save and old metadata remains present',async()=>{
 const home=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-066-'));
 try{
  const r=new ProjectRegistry(home),created=await r.create({name:'Portfolio',schedule:{startDate:'2026-10-01',endDate:'2027-04-01'}});
  assert.equal(created.schedule.startDate,'2026-10-01');
  const edited=await r.update(created.id,{name:'Portfolio Updated',schedule:{startDate:'2026-10-05',endDate:'2027-04-12'}});
  const saved=await r.read(created.id);
  assert.equal(saved.schedule.startDate,'2026-10-05');
  assert.equal(saved.schedule.endDate,'2027-04-12');
  assert.equal(saved.id,created.id);
  assert.equal(saved.createdAt,created.createdAt);
  assert.equal(saved.name,edited.name);
 }finally{await fsp.rm(home,{recursive:true,force:true});}
});
test('Gantt is compact, collapsed by default and read-only while bulk dates are edited in Settings',()=>{
 const area=extension.slice(extension.indexOf('<main id="landingView"'),extension.indexOf('<main id="settingsView"'));
 const settings=extension.slice(extension.indexOf('<main id="settingsView"'),extension.indexOf('<main id="projectView"'));
 const planning=extension.slice(extension.indexOf('<main id="planningView"'),extension.indexOf('<div id="timelineModal"'));
 for(const id of ['ganttChart','ganttFallback','overviewGanttDetails','overviewStatus','overviewSchedule','overviewHealthDetail'])assert.match(area,new RegExp('id="'+id+'"'));
 assert.match(area,/<details id="overviewGanttDetails"[^>]*><summary/);
 assert.doesNotMatch(area,/id="openPlanningTimelineModal"|id="openTimelineSource"/);
 assert.match(extension.slice(extension.indexOf('<main id="projectView"'),extension.indexOf('<main id="workView"')),/id="openPlanningTimelineModal"/);
 assert.doesNotMatch(extension,/id="openTimelineSource"/);
 assert.doesNotMatch(planning,/id="ganttChart"|id="ganttFallback"|id="openPlanningTimelineModal"/);
 assert.equal((extension.match(/id="ganttChart"/g)||[]).length,1);
 assert.match(frontend,/if\(destination==='overview'\)\{setView\('landing'\);\$\('overviewGanttDetails'\)\.open=false;send\('loadPlanning'\)/);
 assert.match(frontend,/overviewGanttDetails'\)\.addEventListener\('toggle'/);
 assert.match(frontend,/if\(view==='landing'&&\$\('overviewGanttDetails'\)\.open\)renderGantt/);
 assert.match(css,/\.overview-gantt-compact #ganttChart\{max-height:280px/);
});
test('flat SVG icons and correct border colors for three notification severities',()=>{
 for(const state of ['success','warning','error'])assert.match(css,new RegExp('top-notification\\.'+state));
 assert.match(frontend,/topNotificationIcon'\)\.innerHTML=icons\[severity\]/);
 assert.match(frontend,/stroke-linecap="round"/);
 assert.doesNotMatch(frontend,/topNotificationIcon'\)\.textContent=item\.error/);
});
test('UI exposes dates in project Settings and actual versus expected progress in Overview',()=>{
 assert.match(extension,/id="projectStartDate" type="date"/);
 assert.match(extension,/id="projectEndDate" type="date"/);
 assert.match(frontend,/field\('projectStartDate',p\?\.schedule\?\.startDate/);
 assert.match(frontend,/startDate:read\('projectStartDate'\),endDate:read\('projectEndDate'\)/);
 assert.match(frontend,/h\.expectedPercent/);
 assert.match(css,/\.overview-project-health\{/);
});
test('traceability excludes baseline-only metadata nodes from business change totals',()=>{
 assert.match(frontend,/item\.change==='added'&&\['question','discovery','review','source'\]/);
 assert.match(frontend,/active Business Requirements/);
 assert.match(frontend,/BA_QUESTIONS\.find/);
});
