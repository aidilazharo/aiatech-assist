'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const one=(jiraKey)=>JSON.stringify({criteria:[{description:'Create a person name and show success feedback',acceptance:'When a valid person name is submitted, exactly one record is saved and displayed',jiraKey}]});

test('TDD planner receives BR-published Jira keys and explicitly forbids invented keys',()=>{
 const prompt=tdd.planningPrompt({brId:'BR-009',revision:1,stackId:'react',brText:'Create a person name',source:{files:[],previews:[]},jiraItems:[{path:'BR-009/F-001/S-001/T-002',key:'TC-498',kind:'Subtask',title:'Implement successful creation'}]});
 assert.match(prompt,/TC-498/);
 assert.match(prompt,/most specifically matching Task or Subtask/);
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
 assert.match(host,/const publishedJiraItems=Object\.entries\(register\.synced/);
 assert.match(host,/nodePath===brId\|\|nodePath\.startsWith\(brId\+'\/'\)/);
 assert.match(host,/developerTdd\.parsePlan\(planRaw,approvedJiraKeys\)/);
 assert.match(host,/const cycleExtra=\{cycleIndex:cycleIndex\+1,cycleTotal:criteria\.length,criterion:criterion\.description,criterionId:criterion\.id,jiraKey:/);
 assert.match(host,/jiraKey:recoveryJiraKeys\.has\(failed\?\.jiraKey\)\?failed\.jiraKey:''/);
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
