'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const audit=require('../src/jira-mapping-audit');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const workflow=fs.readFileSync(path.join(__dirname,'../src/br-workflow.js'),'utf8');
const state=()=>({brs:[{id:'BR-001',approvedContent:{title:'Requirement'}}],synced:{
 'BR-001':{key:'TC-1',issueId:'1001'},
 'BR-001/F-001':{key:'TC-2',issueId:'1002',parentIssueId:'1001'}
}});
const jira=new Map([
 ['TC-1',{id:'1001',key:'TC-1',fields:{parent:null}}],
 ['TC-2',{id:'1002',key:'TC-2',fields:{parent:{id:'1001',key:'TC-1'}}}]
]);
const verify=(register,path,remote)=>{
 const expected=register.synced[path];
 assert.equal(remote.key,expected.key,'saved Jira key must still resolve');
 if(expected.issueId)assert.equal(remote.id,expected.issueId,'permanent Jira identity must match');
 if(path.includes('/'))assert.equal(remote.fields.parent?.key,register.synced['BR-001'].key,'parent key must match');
 if(expected.parentIssueId)assert.equal(remote.fields.parent?.id,expected.parentIssueId,'permanent parent ID must match');
};
const readIssue=async key=>structuredClone(jira.get(key));
test('audits an existing Epic and child without modifying mappings',async()=>{
 const register=state(),snapshot=JSON.stringify(register);
 const result=await audit.audit({register,projectKey:'TC',readIssue,verify:(path,issue)=>verify(register,path,issue)});
 assert.deepEqual(result.conflicts,[]);
 assert.equal(result.checked,2);assert.equal(result.verified[1].parentIssueId,'1001');
 assert.equal(JSON.stringify(register),snapshot);assert.equal(result.readOnly,true);
});
test('detects changed parent relationships, including parent key and numeric ID drift',async()=>{
 const register=state();
 const result=await audit.audit({register,projectKey:'TC',
  readIssue:async key=>key==='TC-2'?{id:'1002',key:'TC-2',fields:{parent:{key:'TC-9',id:'1009'}}}:jira.get(key),
  verify:(path,issue)=>verify(register,path,issue)});
 assert.equal(result.conflicts.length,1);assert.match(result.conflicts[0],/parent key must match/);
});
test('detects numeric identity reuse even when issue key appears unchanged',async()=>{
 const register=state();
 const result=await audit.audit({register,projectKey:'TC',
  readIssue:async key=>key==='TC-1'?{id:'9999',key:'TC-1',fields:{parent:null}}:jira.get(key),
  verify:(path,issue)=>verify(register,path,issue)});
 assert.equal(result.conflicts.length,1);assert.match(result.conflicts[0],/permanent Jira identity/);
});
test('duplicate local issue keys and numeric IDs cannot silently pass',async()=>{
 const register=state();register.synced['BR-001/F-001'].key='TC-1';
 register.synced['BR-001/F-001'].issueId='1001';
 const result=await audit.audit({register,projectKey:'TC',readIssue,verify:()=>{}});
 assert.ok(result.conflicts.some(v=>v.includes('multiple BR paths')));
 assert.ok(result.conflicts.some(v=>v.includes('numeric ID')));
});
test('Jira 404 remains ambiguous and does not unlink local mappings',async()=>{
 const register=state(),snapshot=JSON.stringify(register);
 const result=await audit.audit({register,projectKey:'TC',
  readIssue:async key=>{if(key==='TC-2')throw Error('HTTP 404');return jira.get(key);},
  verify:()=>{}});
 assert.ok(result.conflicts.some(v=>v.includes('deleted or not visible')));
 assert.equal(JSON.stringify(register),snapshot);
});
test('historical archived cycles are not audited as active mappings',async()=>{
 const register=state();register.brs[0].archivedFromRestart=true;
 const result=await audit.audit({register,projectKey:'TC',readIssue:()=>assert.fail('historical issue read'),verify:()=>{}});
 assert.equal(result.checked,0);
});
test('published and preview paths both use the audit; numeric IDs are retained in the register',()=>{
 assert.match(source,/jiraMappingAudit\.audit\(\{register,projectKey:targetKey/);
 assert.match(source,/jiraMappingAudit\.audit\(\{register:state,projectKey:/);
 assert.match(source,/verifyLinkedJiraIdentity\(state,config,item\.path,current\)/);
 assert.match(source,/issueId:remote\?\.id,parentIssueId:remote\?\.fields\?\.parent\?\.id/);
 assert.match(workflow,/async function recorded\([^]*?issueId,parentIssueId/);
 assert.match(workflow,/Jira numeric issue identity changed for/);
});
