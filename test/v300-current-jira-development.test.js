'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const ownership=require('../src/br-ownership');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const one=(jiraKey)=>JSON.stringify({criteria:[{description:'Create a person name and show success feedback',acceptance:'When a valid person name is submitted, exactly one record is saved and displayed',jiraKey}]});

test('TDD planner receives BR-published Jira keys and explicitly forbids invented keys',()=>{
 const prompt=tdd.planningPrompt({brId:'BR-009',revision:1,stackId:'react',brText:'Create a person name',source:{files:[],previews:[]},jiraItems:[{path:'BR-009/F-001/S-001/T-002',key:'TC-498',kind:'Subtask',title:'Implement successful creation'}]});
 assert.match(prompt,/TC-498/);
 assert.match(prompt,/most specifically matching Task or Subtask/);
 assert.match(prompt,/never use a shared Epic, Feature, Story or another role's task/);
 assert.match(prompt,/never invent/i);
});
test('TDD parser keeps only verified Jira mapping and saves it with the criterion',()=>{
 const result=tdd.parsePlan(one('TC-498'),['TC-494','TC-498']);
 assert.equal(result[0].jiraKey,'TC-498');
 assert.equal(result[0].id,'AC-01');
 assert.equal(result[0].status,'pending');
 assert.equal(tdd.parsePlan(one('TC-999'),['TC-494','TC-498'])[0].jiraKey,'');
 assert.equal(tdd.parsePlan(one('T-1'),['TC-498'])[0].jiraKey,'');
 assert.equal(tdd.parsePlan(one(''),['TC-498'])[0].jiraKey,'');
});
test('Developer host only maps acceptance criteria to published Jira keys belonging to the selected BR',()=>{
 const host=read('test/generated/extension-source.txt');
 assert.match(host,/const publishedJiraItems=require\('\.\/br-ownership'\)\.roleTree\(register,brId,'software-developer'\)\.entries\.map/);
 assert.match(host,/const approvedJiraKeys=\[\.\.\.new Set\(publishedJiraItems\.map\(row=>row\.key\)\)\];/);
 assert.match(host,/recoveryJiraKeys=new Set\(require\('\.\/br-ownership'\)\.roleTree\(register,brId,'software-developer'\)\.entries\.map\(item=>item\.key\)\)/);
 assert.match(host,/developerTdd\.parsePlan\(planRaw,approvedJiraKeys\)/);
 assert.match(host,/const cycleExtra=\{cycleIndex:cycleIndex\+1,cycleTotal:criteria\.length,criterion:criterion\.description,criterionId:criterion\.id,jiraKey:/);
 assert.match(host,/jiraKey:recoveryJiraKeys\.has\(failed\?\.jiraKey\)\?failed\.jiraKey:''/);
});
test('Developer planning and recovery keys exclude shared parents, specialist tasks and other BRs',()=>{
 const register={brs:[{id:'BR-009',status:'approved',approvedContent:{title:'Create person'}},{id:'BR-0091',status:'approved',approvedContent:{title:'Other BR'}}],synced:{
  'BR-009':{key:'TC-490',kind:'Epic'},
  'BR-009/F-001':{key:'TC-491',kind:'Feature'},
  'BR-009/F-001/S-001':{key:'TC-492',kind:'Story'},
  'BR-009/F-001/S-001/T-002':{key:'TC-498',kind:'Subtask'},
  'BR-009/F-001/S-001/ROLE-UIUX':{key:'TC-499',kind:'Role'},
  'BR-0091':{key:'TC-500',kind:'Epic'},
  'BR-0091/F-001/S-001/T-001':{key:'TC-501',kind:'Task'}
 },roleTaskMappings:{
  'BR-009/F-001/S-001/ROLE-DEVELOPER':{key:'TC-502',roleId:'developer'},
  'BR-009/F-001/S-001/ROLE-UAT':{key:'TC-503',roleId:'uat'}
 }};
 const keys=ownership.roleTree(register,'BR-009','software-developer').entries.map(item=>item.key);
 assert.deepEqual(keys,['TC-498','TC-502']);
 for(const key of keys)assert.equal(tdd.parsePlan(one(key),keys)[0].jiraKey,key);
 for(const key of ['TC-490','TC-491','TC-492','TC-499','TC-500','TC-501','TC-503'])assert.equal(tdd.parsePlan(one(key),keys)[0].jiraKey,'');
 const host=read('test/generated/extension-source.txt');
 const start=host.indexOf('let recoveryJiraKeys=new Set();'),end=host.indexOf('const recoveryEpic=',start);
 assert.ok(start>0&&end>start);
 const recovery=require('node:vm').runInNewContext('(register,brId,require)=>{'+host.slice(start,end)+'return [...recoveryJiraKeys];}');
 const load=name=>{assert.equal(name,'./br-ownership');return ownership;};
 assert.deepEqual([...recovery(register,'BR-009',load)],keys);
 assert.deepEqual([...recovery(register,'BR-404',load)],[]);
});
test('Current Jira issue and active acceptance criterion remain far right in Developer.My Work',()=>{
 const host=read('test/generated/extension-source.txt'),webview=read('media/start.js'),css=read('media/start.css');
 assert.match(host,/class="developer-task-right"/);
 assert.match(host,/id="developerBrCriterionProgress"/);
 assert.doesNotMatch(host,/id="developerBrIssueFound"/);
 assert.match(host,/id="developerBrCurrentJira"/);
 assert.equal((host.match(/id="developerBrIssueStats"/g)||[]).length,1);
 assert.match(webview,/setCurrentDeveloperJira\(\{jiraKey:msg\.jiraKey/);
 assert.match(webview,/label\.textContent=developerBrJiraCriterion\+' · Jira unmapped'/);
 assert.match(css,/\.developer-task-right/);
});
