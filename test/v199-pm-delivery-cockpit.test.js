'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const pm=require('../media/pm-delivery');
const inventory=require('../src/jira-project-inventory');
const host=fs.readFileSync(path.join(base,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(base,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(base,'media/start.css'),'utf8');
const example=(key,props={})=>({key,summary:'Work '+key,status:'To Do',created:'2026-11-01T12:00:00Z',...props});

test('Jira inventory exposes actual PM fields from Jira and requests their presence',()=>{
 const input={key:'TC-10',fields:{project:{key:'TC'},summary:'Implementation',status:{name:'Blocked',statusCategory:{key:'indeterminate'}},
    issuetype:{name:'Task'},creator:{displayName:'Author'},assignee:{displayName:'Developer',accountId:'assignee-id'},
    priority:{name:'High'},duedate:'2026-11-04',updated:'2026-11-05T01:00:00Z'}};
 const result=inventory.normalizeIssue(input,'TC');
 assert.equal(result.assignee,'Developer');assert.equal(result.assigneeId,'assignee-id');
 assert.equal(result.priority,'High');assert.equal(result.dueDate,'2026-11-04');
 assert.equal(result.statusCategory,'indeterminate');assert.equal(result.updated,'2026-11-05T01:00:00Z');
 assert.match(fs.readFileSync(path.join(base,'src/jira-project-inventory.js'),'utf8'),/fields:\['project'.*'duedate'.*'resolution'.*'parent'.*'issuelinks'.*'description'\]/);
});

test('Action queue ranks blocked, overdue and due soon, without fabricating missing deadlines',()=>{
 const items=[example('TC-1',{status:'In Progress'}),example('TC-2',{dueDate:'2026-11-03',assignee:'Alice',priority:'Low'}),
  example('TC-3',{status:'Blocked',assignee:'Bob'}),example('TC-4',{dueDate:'2026-11-08',priority:'High'}),
  example('TC-5',{status:'Done',dueDate:'2026-11-01',statusCategory:'done'})];
 const data=pm.analyze(items,'2026-11-05');
 assert.deepEqual(data.queue.map(x=>x.key),['TC-3','TC-2','TC-4']);
 assert.equal(data.open,4);assert.equal(data.completed,1);assert.equal(data.overdue,1);
 assert.equal(data.blocked,1);assert.equal(data.dueSoon,1);assert.equal(data.completionPercent,20);
 assert.equal(pm.state(items[0],'2026-11-05').overdue,false);
 assert.equal(pm.state(items[4],'2026-11-05').overdue,false);
});

test('Workload counts individual assignees and separates unassigned work',()=>{
 const data=pm.analyze([example('TC-1',{assignee:'Dana',assigneeId:'d1'}),
 example('TC-2',{assignee:'Dana',assigneeId:'d1',status:'Blocked'}),
 example('TC-3',{assignee:'Other',assigneeId:'d2',dueDate:'2026-11-04'}),example('TC-4')],'2026-11-05');
 assert.equal(data.workload.find(x=>x.key==='d1').open,2);
 assert.equal(data.workload.find(x=>x.key==='d1').blocked,1);
 assert.equal(data.workload.find(x=>x.key==='unassigned').name,'Unassigned');
 assert.equal(data.workload.find(x=>x.key==='d2').overdue,1);
});

test('Saved role schedules are distinct from Jira delivery status',()=>{
 assert.deepEqual(pm.milestones([{id:'project-manager',label:'Planning',start:'2026-11-01',end:'2026-11-03',progress:60}], '2026-11-05'),
 [{id:'project-manager',label:'Planning',start:'2026-11-01',end:'2026-11-03',percent:60,late:true}]);
 assert.equal(pm.milestones([{id:'qa',progress:100,end:'2026-11-01'}], '2026-11-05')[0].late,false);
 assert.equal(pm.dateOnly('not-a-date'),'');
});

test('PM My Work connects to shared project-scoped Jira scan, DataTables and governance navigation',()=>{
 for(const id of ['pmDailyCockpit','pmMetricCards','pmDataStatus','pmActionQueue','pmDeliveryProgress','pmMilestones','pmWorkload',
  'pmJiraTable','pmJiraFilter','pmAssigneeFilter','pmStatusFilter','pmPriorityFilter','pmDueFilter','pmGovernance','pmGovernanceChecklist'])
   assert.ok(host.includes('id="'+id+'"'),id);
 assert.match(host,/src="\$\{pmDeliveryJs\}"/);
 assert.match(ui,/selectedRole==='project-manager'/);
 assert.match(ui,/function ensurePMJiraInventory\(/);
 assert.match(ui,/function renderPMDashboard\(/);
 assert.match(ui,/jiraInventoryItems/);
 assert.match(ui,/pmJiraTableInstance=ATGVDataTables\.mount/);
 assert.match(ui,/send\('searchProjectJiraInventory'/);
 assert.match(ui,/navigate\('operations'\)/);
 assert.match(css,/#workView\.role-pm-dashboard>#pmDailyCockpit:not\(\.hidden\)/);
 assert.match(css,/#workView \.pm-dashboard-grid/);
});
