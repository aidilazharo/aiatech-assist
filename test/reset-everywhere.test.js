'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {registeredIds,approvedLinks,checkPlanScope,preview}=require('../src/reset-everywhere');
test('Reset uses only BRs present in the trusted current register',()=>{
 assert.deepEqual(registeredIds({brs:[{id:'BR-002'},{id:'BR-001'}],synced:{'BR-001/EPIC-1':{key:'TC-10'}}}),['BR-001','BR-002']);
 assert.throws(()=>registeredIds({brs:[{id:'BR-001'}],synced:{'BR-002':{key:'TC-1'}}}),/Unmapped Jira/);
 assert.throws(()=>registeredIds({brs:[{id:'BR-001'},{id:'BR-001'}]}),/duplicate/);
 assert.throws(()=>registeredIds({brs:Array.from({length:26},(_,i)=>({id:'BR-'+(i+1)}))}),/maximum 25/);
});
test('Reset refuses unlinked Confluence pages and corrupted BR mappings',()=>{
 assert.deepEqual(approvedLinks({entries:{'approved-brs/BR-001.md':{pageId:123},'other/page.md':{pageId:321}}},['BR-001']),[{key:'approved-brs/BR-001.md',pageId:'123'}]);
 assert.throws(()=>approvedLinks({entries:{'approved-brs/BR-005.md':{pageId:55}}},['BR-001']),/Unlinked/);
 assert.throws(()=>approvedLinks({entries:{'approved-brs/BR-001-revision-1.md':{pageId:55}}},['BR-001']),/Unlinked/);
});
test('Reset rejects duplicate remote deletion targets in separate projects',()=>{
 const one={project:{id:'alpha'},ids:['BR-001'],plan:{site:'https://example.atlassian.net',jira:[{key:'TC-1'}],confluence:[{pageId:'11'}]}};
 const two={project:{id:'beta'},ids:['BR-002'],plan:{site:'https://example.atlassian.net',jira:[{key:'TC-1'}],confluence:[]}};
 assert.throws(()=>checkPlanScope([one,two]),/multiple projects/);
 assert.throws(()=>checkPlanScope([one,{...two,plan:{...two.plan,jira:[],confluence:[{pageId:'11'}]}}]),/multiple projects/);
 assert.deepEqual(checkPlanScope([one]),{jira:1,confluence:1});
});
test('Reset preview is explicit about scope, local Git removal and protected remote branches',()=>{
 const text=preview([{project:{id:'alpha',name:'Alpha'},ids:['BR-001'],plan:{site:'https://example.atlassian.net',jira:[{key:'TC-199'}],confluence:[{pageId:'12'}]}}],'/tmp/projectroot/projects');
 assert.match(text,/TC-199/);assert.match(text,/RESET — IRREVERSIBLE/);
 assert.match(text,/LOCAL Git branches/);assert.match(text,/remote branches and pull requests are NOT deleted/);
 assert.match(text,/Uncommitted files/);
});
