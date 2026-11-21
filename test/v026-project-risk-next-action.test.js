'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {jiraRiskSummary,contextText}=require('../src/project-activity-sync');
const brief=require('../src/my-work-daily-brief');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('recent Jira signals are limited to the selected project and unfinished tasks',()=>{
 const issue=(key,status,fields={})=>({key,fields:{
  summary:'Work item',status:{name:status,statusCategory:{key:'indeterminate'}},
  labels:[],assignee:{displayName:'Owner'},...fields}});
 const risks=jiraRiskSummary([
  issue('TC-10','In Progress',{labels:['blocked'],duedate:'2026-11-20',assignee:null}),
  issue('TC-11','Blocked',{duedate:'2026-11-24'}),
  issue('OTHER-8','Blocked',{duedate:'2026-11-01'}),
  issue('TC-12','Done',{status:{name:'Done',statusCategory:{key:'done'}},duedate:'2026-11-01'}),
  issue('TC-13','To Do',{duedate:'2026-11-19'}),
  {key:'TC-14',fields:{summary:'Limited data',status:{name:'To Do'}}}
 ],'TC',{today:'2026-11-21'});
 assert.deepEqual(risks.blockers.map(x=>x.key),['TC-10','TC-11']);
 assert.deepEqual(risks.overdue.map(x=>x.key),['TC-10','TC-13']);
 assert.deepEqual(risks.unassigned.map(x=>x.key),['TC-10']);
 assert.equal(risks.scanned,4);
 assert.match(contextText({project:'TC',risk:risks}),/risk/);
});

test('project delivery guidance responds to blockers without inventing a forecast',()=>{
 const risk=jiraRiskSummary([{key:'TC-9',fields:{summary:'Blocked integration',
  status:{name:'Blocked',statusCategory:{key:'indeterminate'}},
  labels:[],assignee:null}}],'TC',{today:'2026-11-21'});
 assert.equal(brief.health({deadline:'2026-12-25',today:'2026-11-21',risk,knownWork:true}).code,'watch');
 assert.equal(brief.health({deadline:'2026-11-28',today:'2026-11-21',risk,knownWork:true}).code,'at-risk');
 const out=brief.build({roleId:'project-manager',roleName:'Project Manager',
  deadline:'2026-12-25',now:new Date(2026,10,21),activity:{jiraAvailable:true,risk},
  config:{jiraConfigured:true,confluenceConfigured:true}});
 assert.equal(out.todayActions[0].label,'Review blocker TC-9');
 assert.equal(out.todayActions[0].target,'role-workspace');
 assert.match(out.health.detail,/not a complete project forecast/);
});

test('role task navigation has bounded host-validated destinations',()=>{
 const ui=source('media/atgv-mywork-ai.js');
 assert.match(ui,/\['project-settings','projects','role-workspace','discovery'\]/);
 assert.match(ui,/atgv:mywork-open-task/);
 const br=brief.build({roleId:'business-analyst',roleName:'Business Analyst',
  requirements:[{id:'BR-001',status:'Draft'}],deadline:'2026-12-21',
  config:{jiraConfigured:true,confluenceConfigured:true}});
 assert.equal(br.todayActions[0].target,'discovery');
 assert.equal(brief.build({roleId:'project-manager',config:{jiraConfigured:false}}).todayActions[0].target,'project-settings');
 assert.deepEqual(brief.build({roleId:'qa-engineer',config:{jiraConfigured:false}}).todayActions,[]);
});

test('Confluence roster and role AI fail closed on malformed or stale evidence',()=>{
 assert.match(source('src/confluence-user-database.js'),/property&&!Array\.isArray\(value\.rows\)/);
 assert.match(source('src/lib/runtime/extension-runtime.js'),/refreshLiveRemoteData\(\{reason:'my-work-entry'\}\)/);
 assert.match(source('src/my-work-role-prompts.js'),/bounded recent Jira sample/);
});
