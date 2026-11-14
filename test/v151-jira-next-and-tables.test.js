'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const helper=require('../media/jira-workflow-tables');
const progress=require('../media/ba-progress');
const extension=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const client=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
function allDone(){return progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true,generated:true,totalBrs:1,savedBrs:1,allApproved:true,jiraPreview:true,jiraApproved:true,published:true});}
test('next step navigation only offers the immediate next completed-to-ready milestone',()=>{
 const p=allDone();
 assert.deepEqual(helper.getNextStep(p,'jiraPreview',false),{key:'jiraApprove',label:'Approve Preview',index:8});
 assert.deepEqual(helper.getNextStep(p,'jiraApprove',false),{key:'publish',label:'Publish Jira',index:9});
 assert.equal(helper.getNextStep(p,'publish',false),null);
 assert.equal(helper.getNextStep(p,'jiraApprove',true),null);
 const partial=progress.derive({started:true,hasSources:true,mappingDone:false});
 assert.deepEqual(helper.getNextStep(partial,'upload',false),{key:'mapping',label:'Map & Save 12',index:2});
 assert.deepEqual(helper.getNextStep(partial,'start',false),{key:'upload',label:'Upload',index:1});
});
test('publication table never treats preview rows as confirmed or leaks historical BRs',()=>{
 const synced={'BR-001':{key:'TC-1',title:'Historic Epic'},'BR-007':{key:'TC-170',title:'Existing Epic'}};
 const plan=[{path:'BR-007',kind:'Epic',action:'update',title:'Visitor registration',key:'TC-170'},{path:'BR-007/F-001',kind:'Feature',action:'create',title:'Visitor features'}];
 let rows=helper.publishedRows({plan,confirmed:{},synced,activeIds:['BR-007']});
 assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.status),['Awaiting confirmation','Awaiting confirmation']);
 rows=helper.publishedRows({plan,confirmed:{'BR-007':{key:'TC-170',action:'update'}},synced,activeIds:['BR-007']});
 assert.equal(rows[0].status,'Confirmed');assert.equal(rows[1].status,'Awaiting confirmation');
 assert.equal(rows[1].key,'—');
 const restored=helper.publishedRows({synced,activeIds:['BR-007']});
 assert.deepEqual(restored.map(r=>r.path),['BR-007']);
 assert.equal(restored[0].key,'TC-170');
});
test('a completed plan without persisted Jira confirmation is never falsely marked completed',()=>{
 const rows=helper.publishedRows({plan:[{path:'BR-002',action:'create',kind:'Epic',title:'Missing'}],confirmed:{},synced:{},completed:true});
 assert.equal(rows[0].status,'Needs reconciliation');
});
test('frontend includes navigation button, steps 8/9 tables and step 10 published table',()=>{
 for(const id of ['baNextStep','brJiraApprovalTable','brJiraPublishedTable'])assert.match(extension,new RegExp('id="'+id+'"'));
 assert.match(extension,/jira-workflow-tables\.js/);
 assert.match(client,/ATGVJiraWorkflowTables\.getNextStep\(progress,displayed/);
 assert.match(client,/function renderJiraApprovalTable\(/);
 assert.match(client,/function renderJiraPublishedItems\(/);
 assert.match(client,/ATGVDataTables\.mount\(box,/);
 assert.match(css,/\.ba-next-step-row/);
});
test('Jira confirmation is joined by BR path only after reported persistence',()=>{
 assert.match(client,/Number\(m\.confirmed\)>Number\(previous\.confirmed\)/);
 assert.match(client,/jiraPublicationConfirmed\.set\(m\.currentPath/);
 assert.match(client,/jiraPublicationPlan=jiraPlanForCR\.map/);
 assert.match(client,/renderJiraPublishedItems\(\)/);
});
