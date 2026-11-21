'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {ROLES}=require('../src/sdlc-work');
const {OPTIONAL_ROLES}=require('../src/sdlc-catalog');
const brief=require('../src/my-work-daily-brief');
const chat=require('../src/my-work-role-chat');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const day=new Date(2026,10,21);
const config={jiraConfigured:false,confluenceConfigured:false};

test('all 18 roles get their own unfinished task, not shared PM settings',()=>{
 const roles=[...ROLES,...OPTIONAL_ROLES];
 assert.equal(roles.length,18);
 for(const role of roles){
  const own=role.tasks[0];
  const value=brief.build({roleId:role.id,roleName:role.label,now:day,deadline:'',
   tasks:[{id:own.id,activity:own.label,completed:false}],
   config,assigned:[{jiraKey:'TC-758',status:'In Progress'}]});
  const ownAction=value.todayActions.find(x=>x.id==='checklist:'+own.id);
  assert.equal(ownAction?.label,'Complete '+own.label,role.id);
  if(role.id!=='project-manager'){
   assert.equal(value.todayActions.some(x=>x.target==='project-settings'),false,role.id);
  }
  if(!['software-developer','ux-designer'].includes(role.id))
   assert.equal(value.todayActions.some(x=>x.label==='Review TC-758'),false,role.id);
 }
});
test('completed checklist and Jira issue disappear from refreshed daily tasks',()=>{
 const base={roleId:'software-developer',roleName:'Developer',now:day,
  config:{jiraConfigured:true,confluenceConfigured:true}};
 const pending=brief.build({...base,
  assigned:[{jiraKey:'TC-758',status:'In Progress'}],
  tasks:[{id:'unit',activity:'Unit/component test evidence',completed:false}]});
 assert.equal(pending.todayActions.length,2);
 const complete=brief.build({...base,
  assigned:[{jiraKey:'TC-758',status:'Done'}],
  tasks:[{id:'unit',activity:'Unit/component test evidence',completed:true}]});
 assert.deepEqual(complete.todayActions,[]);
});
test('BA requirements and PM shared Jira coordination remain role-specific',()=>{
 const activity={jiraAvailable:true,risk:{blockers:[{key:'TC-758'}]},
  inProgress:[{key:'TC-758'}]};
 const ba=brief.build({roleId:'business-analyst',roleName:'Business Analyst',
  now:day,activity,config,requirements:[{id:'BR-008',status:'Draft'}]});
 const pm=brief.build({roleId:'project-manager',roleName:'Project Manager',
  now:day,activity,config});
 assert.deepEqual(ba.todayActions.map(x=>x.label),['Continue BR-008']);
 assert.ok(pm.todayActions.some(x=>x.label==='Coordinate blocker TC-758'));
});
test('role chat history expires at local calendar midnight',async()=>{
 let now=new Date(2026,10,21,23,55);
 const clock=()=>now,prompts=[];
 const request=async prompt=>{prompts.push(prompt);return 'Confirmed recommendation.';};
 const options={projectId:'midnight-case',roleId:'solution-architect',clock,request};
 await chat.ask({...options,message:'Old-day private question'});
 await chat.ask({...options,message:'Another question'});
 assert.match(prompts[1],/Old-day private question/);
 now=new Date(2026,10,22,0,0,1);
 await chat.ask({...options,message:'New-day question'});
 assert.doesNotMatch(prompts[2],/Old-day private question/);
 assert.doesNotMatch(prompts[2],/Another question/);
 chat.clear(options.projectId,options.roleId);
});
test('yesterday slow reply cannot be stored in new-day history',async()=>{
 let now=new Date(2026,10,21,23,59,59),resolve;
 const clock=()=>now,slow=new Promise(r=>{resolve=r});
 const options={projectId:'slow-midnight',roleId:'project-manager',clock};
 const started=chat.ask({...options,message:'Sensitive yesterday question',request:async()=>slow});
 now=new Date(2026,10,22,0,0,2);
 resolve('Late reply');
 assert.equal(await started,'Late reply');
 let prompt='';
 await chat.ask({...options,message:'Today question',request:async p=>{prompt=p;return 'Fresh answer'}});
 assert.doesNotMatch(prompt,/Sensitive yesterday question/);
 chat.clear(options.projectId,options.roleId);
});
test('daily task cards and midnight reset replace generic next-action dock',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),wave=read('media/atgv-mywork-wave-chat.js');
 const main=read('media/start.js'),css=read('media/atgv-mywork-ai.css');
 assert.match(html,/id="atgvMyWorkTodayList"/);
 assert.doesNotMatch(html,/id="atgvMyWorkAiNextButton"/);
 assert.match(wave,/function scheduleLocalMidnight/);
 assert.match(wave,/function expireConversationAtMidnight/);
 assert.match(wave,/tasksList\.replaceChildren\(\)/);
 assert.match(wave,/button\.textContent='Go to task'/);
 assert.match(main,/window\.addEventListener\('atgv:mywork-open-task'/);
 assert.match(css,/\.atgv-mywork-ai-task-card/);
});
