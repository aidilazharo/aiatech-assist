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
test("project governance settings remain Project Manager tasks, not Business Analyst tasks",()=>{
 const shared={identity:{email:'john.doe@company.example'},deadline:'',
  now:new Date(2026,10,21),config:{jiraConfigured:false,confluenceConfigured:false}};
 const pm=brief.build({...shared,roleId:'project-manager',roleName:'Project Manager'});
 assert.deepEqual(pm.todayActions.slice(0,3).map(x=>x.label),[
  'Verify Jira connection','Verify Confluence synchronization','Set or correct the project deadline'
 ]);
 const ba=brief.build({...shared,roleId:'business-analyst',roleName:'Business Analyst',
  tasks:[{id:'discovery',activity:'Discovery notes',completed:false}],
  requirements:[{id:'BR-004',status:'Draft'}]});
 assert.deepEqual(ba.todayActions.map(x=>x.label),['Continue BR-004','Complete Discovery notes']);
 assert.equal(ba.health.code,'unverified');
 assert.ok(ba.todayActions.every(x=>x.target!=='project-settings'));
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
 assert.match(value.health.detail,/recovery/);
 assert.ok(value.todayActions.some(item=>/TC-758/.test(item.label)));
 assert.ok(value.todayActions.every(item=>item.target!=='project-settings'));
 assert.equal(value.teamSummary,'No other distinct verified members listed');
});
test('My Work removes standalone checklist cards and Go to task buttons but retains AI conversation',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),wave=read('media/atgv-mywork-wave-chat.js');
 const start=html.indexOf('id="atgvMyWorkAiContent"'),end=html.indexOf('id="atgvMyWorkAiChatForm"');
 const chat=html.indexOf('id="atgvMyWorkAiConversation"');
 assert.ok(start>=0&&end>start&&chat>start&&end>chat);
 assert.doesNotMatch(html,/id="atgvMyWorkAiNextButton"/);
 assert.doesNotMatch(html,/id="atgvMyWorkToday"|id="atgvMyWorkTodayList"/);
 assert.doesNotMatch(wave,/button\.textContent='Go to task'/);
 assert.doesNotMatch(wave,/function renderTasks\(/);
 assert.match(wave,/function renderBrief\(/);
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
 assert.match(wave,/tasksTitle\.textContent='Today/);
});
