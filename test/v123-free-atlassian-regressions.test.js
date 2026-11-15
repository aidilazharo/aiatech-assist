'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resolveJiraIssueType,jiraCreateIssue}=require('../src/remote-actions');
const {writeConfluence}=require('../src/clients');
const {buildImpactPlan}=require('../src/impact-plan');
const {plan,assertSelection}=require('../src/design-impact-plan');
const types=[{id:'10016',name:'Subtask',subtask:true},{id:'10017',name:'Epic',subtask:false},{id:'10018',name:'Story',subtask:false},{id:'10020',name:'Task',subtask:false}];
const config={get(key){return ({'jira.baseUrl':'https://example-org.atlassian.net','jira.email':'test@example.invalid','jira.projectKey':'TC','confluence.baseUrl':'https://example-org.atlassian.net/wiki','confluence.parentPageId':''})[key]??'';}};
async function withFetch(response,fn){const old=global.fetch;global.fetch=response;try{return await fn();}finally{global.fetch=old;}}
const ok=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
test('Jira TC Subtask and Sub-task both resolve using the metadata child flag',()=>{
 assert.equal(resolveJiraIssueType(types,'Subtask').id,'10016');
 assert.equal(resolveJiraIssueType(types,'Sub-task').id,'10016');
 assert.equal(resolveJiraIssueType(types,'Story').id,'10018');
 assert.equal(resolveJiraIssueType(types,'Epic').id,'10017');
 assert.throws(()=>resolveJiraIssueType([{id:'x',name:'Subtask',subtask:false}],'Subtask'),/unavailable/);
 assert.throws(()=>resolveJiraIssueType(types,'Feature'),/unavailable/);
});
test('Jira create uses real Free-project Subtask issue type metadata and validated parent',async()=>{
 const seen=[];
 await withFetch(async (url,options)=>{
  seen.push({url:String(url),method:options.method,body:options.body?JSON.parse(options.body):null});
  return ok(String(url).includes('issuetypes')?{issueTypes:types}:{key:'TC-999'});
 },async()=>{
  const created=await jiraCreateIssue(config,'dummy-test-token',{issueType:'Subtask',parentKey:'TC-1',summary:'Disposable child'});
  assert.equal(created.key,'TC-999');
  assert.equal(seen[1].body.fields.issuetype.id,'10016');
  assert.equal(seen[1].body.fields.parent.key,'TC-1');
 });
});
test('Jira subtasks never silently create orphaned work',async()=>{
 let writes=0;
 await withFetch(async()=>{writes++;return ok({issueTypes:types});},async()=>{
  await assert.rejects(jiraCreateIssue(config,'dummy-test-token',{issueType:'Subtask',summary:'No parent'}),/requires an existing parent/);
 });
 assert.equal(writes,1);
});
test('Confluence Free creates an ordinary space-visible page without private restrictions',async()=>{
 const seen=[];
 await withFetch(async (url,options)=>{seen.push({url:String(url),method:options.method,body:JSON.parse(options.body)});return ok({id:'5341987',version:{number:1}});},async()=>{
  const result=await writeConfluence(config,'dummy-test-token',{spaceId:'4882442',title:'ATGV disposable test',bodyHtml:'<p>Test</p>',version:0});
  assert.equal(result.id,'5341987');
 });
 const body=seen[0].body;
 assert.equal(seen[0].method,'POST');
 assert.equal(body.spaceId,'4882442');
 assert.equal(body.status,'current');
 assert.equal(JSON.stringify(body).includes('private'),false);
 assert.equal(JSON.stringify(body).includes('restriction'),false);
});
test('Confluence version 2 write uses compare-and-set version 3, with no unsafe fallback',async()=>{
 let sent=null;
 await withFetch(async (_url,options)=>{sent=JSON.parse(options.body);return ok({id:'5341987',version:{number:3}});},()=>writeConfluence(config,'token',{pageId:'5341987',title:'Test',bodyHtml:'<p>v3</p>',version:2}));
 assert.equal(sent.version.number,3);
 await assert.rejects(writeConfluence(config,'token',{pageId:'5341987',title:'Test',bodyHtml:'<p>v3</p>',version:undefined}),/trusted Confluence page version/);
});
test('Confluence 409 conflict refuses overwrite and provides recovery direction',async()=>{
 await withFetch(async()=>new Response('Version conflict',{status:409}),async()=>{
  await assert.rejects(writeConfluence(config,'token',{pageId:'5341987',title:'Test',bodyHtml:'<p>new</p>',version:2}),/Confluence version conflict.*Refresh/);
 });
});
test('Confluence Free 403 error is actionable and does not auto-request private access',async()=>{
 await withFetch(async()=>new Response('Insufficient permissions',{status:403}),async()=>{
  await assert.rejects(writeConfluence(config,'token',{spaceId:'4882442',title:'Test',bodyHtml:'<p>new</p>'}),/ordinary page/);
 });
});
test('impact assessment flags linked manual edits and preserves unrelated designs',()=>{
 const state={brs:[{id:'BR-1',approvedRevision:2,status:'approved'},{id:'BR-2',approvedRevision:1,status:'approved'}],synced:{'BR-1':{key:'TC-1'}},canonical:{edges:[]}};
 const designs={designs:{database:[{id:'db1',number:1,status:'draft',manuallyEdited:true,sourceBusinessRequirements:[{id:'BR-1',revision:1}]}],ux:[{id:'ux1',number:1,status:'approved',sourceBusinessRequirements:[{id:'BR-2',revision:1}]}]}};
 const assessment=buildImpactPlan(state,designs,['BR-1']);
 assert.deepEqual(assessment.designs.map(x=>x.kind),['database']);
 assert.equal(assessment.designs[0].action,'human-reconcile');
 const regen=plan(state,designs,{brIds:['BR-1']});
 assert.deepEqual(regen.candidates,[]);
 assert.match(regen.skipped.find(x=>x.kind==='database').reason,/Manually edited/);
 assert.throws(()=>assertSelection(regen,['ux']),/selection changed/);
});
test('verified Jira Free protections do not claim Jira-side lock enforcement',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(src,/Jira Free may allow direct edits to In Progress and Done issues/);
 assert.match(src,/scanExternalJira\(\{quiet:true\}\)/);
 assert.match(src,/remoteFingerprint\(current\)!==previous\.remoteDigest/);
 assert.match(src,/no trusted Jira retirement baseline/);
 assert.match(src,/Jira retirement blocked: missing trusted baseline/);
 const pkg=require('../package.json');assert.equal(pkg.version,'0.3.51');assert.equal(pkg.atgvDisplayVersion,'0.3.51');
});
