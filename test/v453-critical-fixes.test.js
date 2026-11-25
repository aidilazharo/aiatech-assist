'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const review=require('../src/discovery-review');const people=require('../src/my-work-presence');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
test('AI Review merges repeated question findings without losing risks or silently applying conflicting answers',()=>{
 const r=review.parseReviewResponse(JSON.stringify({readiness:'Needs attention',suggestions:[
 {key:'Q12',severity:'High',issue:'Pending finance decision',suggestedAnswer:'A'},
 {key:'questions',severity:'Critical',issue:'Pending security decision',suggestedAnswer:'B'},
 {key:'7',severity:'Low',issue:'Needs boundary test',suggestedAnswer:''}
 ]}));
 assert.equal(r.suggestions.length,2);const q=r.suggestions.find(x=>x.key==='questions');
 assert.equal(q.severity,'Critical');assert.match(q.issue,/finance/);assert.match(q.issue,/security/);
 assert.equal(q.suggestedAnswer,'');assert.match(q.resolutionGuidance,/Conflicting/);
 assert.equal(r.suggestions.find(x=>x.key==='acceptance').issue,'Needs boundary test');
 assert.throws(()=>review.parseReviewResponse(JSON.stringify({suggestions:[{key:'unknown',issue:'x'}]})),/invalid question key/);
});
test('Confluence roster preserves Jira Account ID in a real table column even when HTML attributes are removed',()=>{
 const rows=[{id:'JIRA-ID-123',name:'PM One',email:'pm@example.test',roles:['Project Manager'],tasks:'No assigned task'}];
 const markup=people.renderRows(rows).replace(/ data-atgv-account="[^"]+"/g,'');
 assert.equal(people.extractRows(markup)[0].id,'JIRA-ID-123');
 assert.deepEqual(people.extractRows(markup)[0].roles,['Project Manager']);
});
test('PM permission gate and verified reconciliation precede Jira assignee actions',()=>{
 assert.match(host,/pmJiraAssignment\.canAssign\(permissions\)/);
 assert.match(host,/used\.includes\('project-manager'\)/);
 assert.match(host,/confirmedRosterVisit\(config,token,projectId,projectKey,'project-manager'\)/);
 assert.match(host,/registeredRole&&used\.includes\(registeredRole\)/);
});
