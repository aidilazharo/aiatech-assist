'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../src/jira-mapping-audit');
test('read-only Jira audit rejects changed identities and duplicate mappings',async()=>{
 const register={brs:[{id:'BR-001',approvedContent:{title:'Cats'}}],synced:{'BR-001':{key:'TC-10',issueId:'100'},'BR-001/story':{key:'TC-10',issueId:'100'}}};
 const result=await audit({register,projectKey:'TC',readIssue:async key=>({key,id:'200',fields:{}}),verify:(p,i)=>{if(i.id!==register.synced[p].issueId)throw Error('numeric identity changed');}});
 assert.equal(result.checked,2);assert.equal(result.readOnly,true);
 assert.ok(result.conflicts.some(c=>c.includes('multiple BR paths')));
 assert.ok(result.conflicts.some(c=>c.includes('numeric identity changed')));
});
