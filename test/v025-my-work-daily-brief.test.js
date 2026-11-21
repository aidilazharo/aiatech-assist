'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const brief=require('../src/my-work-daily-brief');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('verified email is used to infer a sensible greeting name without showing an address',()=>{
 assert.equal(brief.guessedName('john.doe+project@example.com'),'John Doe');
 assert.equal(brief.guessedName('aidilazhar@icloud.com'),'Aidilazhar');
 assert.equal(brief.guessedName('admin@example.com','Jordan Smith'),'Jordan Smith');
 assert.equal(brief.guessedName(''),'there');
 const result=brief.build({identity:{email:'zara.lee@company.example'},roleName:'Developer',now:new Date(2026,10,21)});
 assert.match(result.greeting,/Hello, Zara Lee/);
 assert.doesNotMatch(result.greeting,/@/);
});
test('deadline-aware health is conservative about unknown Jira delivery progress',()=>{
 assert.equal(brief.health({deadline:'2026-11-19',today:'2026-11-21',outstanding:2}).code,'at-risk');
 assert.equal(brief.health({deadline:'2026-11-21',today:'2026-11-21'}).code,'at-risk');
 assert.equal(brief.health({deadline:'2026-11-27',today:'2026-11-21',outstanding:3}).code,'watch');
 assert.equal(brief.health({deadline:'2026-12-30',today:'2026-11-21'}).code,'unverified');
 assert.equal(brief.health({deadline:'',today:'2026-11-21'}).code,'unverified');
 assert.equal(brief.health({deadline:'not-a-date',today:'2026-11-21'}).code,'needs-setting');
});
test('other users are deduplicated by Jira ID, do not include current user and are not labeled online',()=>{
 const other=brief.summarizeOtherUsers([
  {id:'self',email:'zara@company.example',name:'Zara Lee',roles:['Developer'],tasks:'TC-1 (To Do)'},
  {id:'other',email:'amira@company.example',name:'Amira',roles:['Project Manager'],tasks:'TC-2 (In Progress)'},
  {id:'other',email:'amira@company.example',name:'Amira',roles:['Project Manager'],tasks:'TC-2 (In Progress)'}
 ],'self','zara@company.example');
 assert.deepEqual(other,[{name:'Amira',roles:['Project Manager'],assignedJira:1}]);
});
test('today's priorities surface missing configuration before work and role-specific Jira tasks',()=>{
 const value=brief.build({
  identity:{email:'john.doe@company.example'},roleId:'business-analyst',roleName:'Business Analyst',
  deadline:'',now:new Date(2026,10,21),
  tasks:[{activity:'Map BR document',completed:false}],
  requirements:[{id:'BR-004',status:'Draft'}],
  config:{jiraConfigured:false,confluenceConfigured:false}
 });
 const labels=value.todayActions.map(x=>x.label);
 assert.deepEqual(labels.slice(0,3),[
  'Verify Jira connection','Verify Confluence synchronization','Set or correct the project deadline'
 ]);
 assert.equal(value.health.code,'unverified');
 assert.equal(value.todayActions.length,4);
});
test('deadline pressure and active role tasks are surfaced without claiming completed team work',()=>{
 const value=brief.build({
  identity:{email:'john.doe@company.example'},
  roleId:'software-developer',roleName:'Developer',deadline:'2026-11-20',now:new Date(2026,10,21),
  tasks:[{activity:'Run unit tests',completed:false}],
  assigned:[{jiraKey:'TC-758',status:'In Progress'}],
  activity:{jiraAvailable:true,inProgress:[{key:'TC-758'}]},
  roster:{rows:[]},config:{jiraConfigured:true,confluenceConfigured:true}
 });
 assert.equal(value.health.code,'at-risk');
 assert.match(value.todayActions[0].label,/recovery/);
 assert.match(value.todayActions[1].label,/TC-758/);
 assert.equal(value.teamSummary,'No other distinct verified members listed');
});
test('My Work next-action button is outside hidden AI response and stays actionable offline',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const start=html.indexOf('id="atgvMyWorkAiContent"'),end=html.indexOf('id="atgvMyWorkAiChatForm"');
 const next=html.indexOf('id="atgvMyWorkAiNextButton"');
 assert.ok(start>=0&&end>start&&next>start&&next<end);
 assert.ok(html.indexOf('id="atgvMyWorkAiConversation"')<next);
 assert.match(html,/id="atgvMyWorkAiNextButton"[^>]*>What to do next<\/button>/);
 const ui=read('media/atgv-mywork-ai.js');
 assert.match(ui,/function renderPersistentNext/);
 assert.match(ui,/button\.disabled=false/);
 assert.match(ui,/navigate\('project-settings'\)/);
 assert.match(ui,/navigate\('projects'\)/);
 assert.match(ui,/byId\('atgvMyWorkAiNextButton'\)\?\.addEventListener\('click',navigateToWork\)/);
});
test('daily brief is based on host-verified account, saved schedule and shared roster, not the chat prompt',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const wave=read('media/atgv-mywork-wave-chat.js');
 assert.match(host,/dailyProject\.schedule\?\.endDate/);
 assert.match(host,/myWorkPresence\.snapshot/);
 assert.match(host,/type:'roleAiDailyBrief'/);
 assert.match(host,/myWorkDailyBrief\.build/);
 assert.match(wave,/renderBrief\(msg\.brief\)/);
 assert.match(wave,/greetingNode\.textContent=/);
 assert.match(wave,/atgv-mywork-ai-team-member/);
 assert.match(wave,/Today’s work/);
});
