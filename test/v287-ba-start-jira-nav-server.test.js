'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const progress=require('../media/ba-progress');
const navigate=require('../media/jira-workflow-tables');
const source=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');

test('All Jira Project Items stays on the separate BA overview',()=>{
 assert.match(host,/<section id="baRequirementsOverview"[^>]+>\s*<section id="baJiraInventorySection"/);
 assert.match(source,/setView\(destination==='discovery'\?'discovery':'baOverview'\)/);
 assert.match(source,/view!=='baOverview'\|\|selectedRole!=='business-analyst'/);
 assert.equal((host.match(/id="baJiraInventorySection"/g)||[]).length,1);
});
test('Next Step turns primary blue only once the current milestone is completed',()=>{
 const complete=progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true});
 assert.equal(navigate.getNextStep(complete,'mapping',false)?.key,'review');
 assert.equal(navigate.getNextStep(complete,'review',false)?.key,'generate');
 assert.equal(navigate.getNextStep(complete,'generate',false),null);
 assert.match(source,/nextButton\.dataset\.milestoneState=ready\?'ready':'blocked'/);
 assert.match(css,/#baNextStep\[data-milestone-state="ready"\]:not\(:disabled\)/);
 assert.match(css,/#baNextStep\[data-milestone-state="blocked"\]:disabled/);
});
test('Jira preview, approval, and publication keep type/action labels intact and reserve a wide summary',()=>{
 assert.match(css,/#brJiraChanges,#brJiraApprovalTable,#brJiraPublishedTable/);
 assert.match(css,/\.atgv-datatable-table th:nth-child\(4\)\{width:38%\}/);
 assert.match(css,/\.atgv-datatable-table :is\(th,td\):nth-child\(1\),/);
 assert.match(css,/\.atgv-datatable-table td:nth-child\(3\)\{overflow-wrap:anywhere\}/);
});
test('Server evidence is guarded against stale status responses and wrong commit',()=>{
 assert.match(host,/let architectServerOperationSerial=0/);
 assert.match(host,/if\(serial!==architectServerOperationSerial\|\|activeProject\?\.id!==projectId\)break/);
 assert.match(host,/evidenceIfHealthy\(project,healthyState\)/);
 assert.match(source,/architectServerStatusAccepted=architectServerStatusRequest\+1/);
 assert.match(host,/requestId:msg\.requestId/);
});
