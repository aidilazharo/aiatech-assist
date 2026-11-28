'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {roleId}=require('../src/project-artifacts');
test('all configured role display names retain their diagnostic role identity',()=>{
 const pairs=[['Business Analyst','business-analyst'],['Project Manager','project-manager'],['Solution Architect','solution-architect'],['UI/UX Designer','ux-designer'],['Developer','software-developer'],['QA Engineer','qa-engineer'],['UAT Tester','uat-tester'],['Product Owner','product-owner'],['Security Engineer','security-engineer'],['Data Engineer / DBA','data-engineer'],['Technical Writer','technical-writer'],['Release / DevOps','release-manager'],['Operations / Support','operations-support'],['Technical Lead','technical-lead'],['Scrum Master','scrum-master'],['Business Owner / Approver','business-owner'],['AI / ML Engineer','ai-ml-engineer'],['Compliance / Risk Officer','compliance-officer']];
 for(const [label,id] of pairs){assert.equal(roleId(label),id,label);assert.equal(roleId(id),id,id);assert.equal(roleId(' '+label.toUpperCase()+' '),id,label);}
});
test('legacy aliases and custom role slugs remain stable; unsafe paths are not accepted',()=>{
 for(const [label,id] of [['BA','business-analyst'],['ui-ux-designer','ux-designer'],['Workspace','shared'],['Setup','shared'],['ATGV','shared'],['custom-reviewer','custom-reviewer'],['../private','shared'],['unknown display label','shared'],['','shared']])assert.equal(roleId(label),id,label);
});
