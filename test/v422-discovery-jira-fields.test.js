'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {planFields,MISSING}=require('../src/jira-field-preflight');
const {safeExtraFields,jiraIssueFieldMetadata,jiraCreateIssue,jiraUpdateIssue}=require('../src/remote-actions');
const importer=require('../src/discovery-import');
const {QUESTIONS}=require('../src/ba-discovery');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'test@example.test','jira.projectKey':'TC'})[key]||''};

test('large discovery merges keep the screenshot 5,569-character business rules intact',()=>{
 const empty=()=>Object.fromEntries(QUESTIONS.map(([key])=>[key,'']));
 const first={...empty(),businessRules:'A'.repeat(3000)},second={...empty(),businessRules:'B'.repeat(2567)};
 const merged=importer.mergeMappingAnswers([first,second]);
 assert.equal(merged.businessRules.length,5569);
 assert.equal(merged.businessRules,'A'.repeat(3000)+'\n\n'+'B'.repeat(2567));
 assert.equal(importer.MAX_SECTION_ANSWER_LENGTH,5000);
});
test('Jira metadata maps known BR fields and uses safe placeholder for unsupported text',()=>{
 const meta=[
  {id:'summary',name:'Summary',required:true,schema:{type:'string'}},
  {id:'customfield_10101',name:'Acceptance Criteria',required:true,schema:{type:'string'}},
  {id:'customfield_10102',name:'Definition of Done',schema:{type:'string',custom:'com.atlassian.jira.plugin.system.customfieldtypes:textarea'}},
  {id:'customfield_10103',name:'Custom Free Text',schema:{type:'string'}},
  {id:'customfield_10104',name:'Risk Score',required:true,schema:{type:'number'}},
  {id:'assignee',name:'Assignee',required:false,schema:{type:'user'}}
 ];
 const item={title:'Create visitor',description:'Visitor workflow',jiraDetails:{definitionOfDone:'Tests pass'}};
 const plan=planFields(item,meta,{approvedBR:{acceptanceCriteria:'Visitor confirmed'}});
 assert.equal(plan.extraFields.customfield_10101,'Visitor confirmed');
 assert.match(JSON.stringify(plan.extraFields.customfield_10102),/Tests pass/);
 assert.equal(plan.extraFields.customfield_10103,MISSING);
 assert.equal(plan.extraFields.customfield_10104,undefined);
 assert.equal(plan.fields.find(x=>x.id==='customfield_10104').display,MISSING);
 assert.equal(plan.blocking.length,1);
 assert.match(plan.blocking[0],/Risk Score/);
});
test('Jira edits retain existing unsupported values rather than overwrite',()=>{
 const meta=[{id:'customfield_12000',name:'Non-text selection',required:true,schema:{type:'option'}},
 {id:'customfield_12001',name:'Free Text',schema:{type:'string'},operations:['set']}];
 const existing={fields:{customfield_12000:{value:'Approved'},customfield_12001:'Existing note'}};
 const plan=planFields({title:'Update',description:'Updated'},meta,{existing});
 assert.equal(plan.fields[0].status,'preserved');
 assert.equal(plan.fields[1].status,'preserved');
 assert.deepEqual(plan.extraFields,{});
 assert.deepEqual(plan.blocking,[]);
});
test('Jira API writer allows text/ADF custom fields but forbids unrelated writes',()=>{
 assert.deepEqual(safeExtraFields({customfield_12001:MISSING}),{customfield_12001:MISSING});
 assert.throws(()=>safeExtraFields({status:'Done'}),/Unsafe Jira field ID/);
 assert.throws(()=>safeExtraFields({customfield_12001:100}),/Unsupported Jira field value/);
});
test('Jira create/edit metadata is fetched per issue type and source issue',async()=>{
 const old=global.fetch,paths=[];
 try{
  global.fetch=async(uri)=>{
   paths.push(String(uri));
   const fields=String(uri).includes('editmeta')?{summary:{name:'Summary',required:true,schema:{type:'string'}}}:null;
   const body=fields?{fields}:{fields:[{fieldId:'customfield_11001',name:'Acceptance Criteria',schema:{type:'string'}}],isLast:true};
   return {ok:true,status:200,json:async()=>body};
  };
  const create=await jiraIssueFieldMetadata(config,'token',{issueTypeId:'10001'});
  const edit=await jiraIssueFieldMetadata(config,'token',{key:'TC-123'});
  assert.equal(create[0].name,'Acceptance Criteria');
  assert.equal(edit[0].name,'Summary');
  assert.ok(paths.some(v=>v.includes('/issuetypes/10001')));
  assert.ok(paths.some(v=>v.includes('/TC-123/editmeta')));
 }finally{global.fetch=old;}
});
test('Jira create and update payloads include only validated custom fields',async()=>{
 const old=global.fetch,requests=[];
 try{
  global.fetch=async(uri,opt)=>{
   requests.push({uri:String(uri),data:JSON.parse(opt.body)});
   return {ok:true,status:201,json:async()=>({key:'TC-57'})};
  };
  await jiraCreateIssue(config,'token',{summary:'New',description:'Approved',issueType:'Story',issueTypes:[{id:'10001',name:'Story',subtask:false}],extraFields:{customfield_10103:MISSING}});
  await jiraUpdateIssue(config,'token',{key:'TC-57',summary:'Updated',extraFields:{customfield_10103:'Accepted'}});
  assert.equal(requests[0].data.fields.customfield_10103,MISSING);
  assert.equal(requests[1].data.fields.customfield_10103,'Accepted');
 }finally{global.fetch=old;}
});
test('Jira preview uses per-issue modal with all metadata fields and an evidence notice',()=>{
 const ui=read('media/start.js'),html=read('src/lib/webview/dashboard-html.js'),runtime=read('src/lib/runtime/extension-runtime.js');
 assert.match(html,/id="brJiraIssueModal"/);
 assert.match(html,/id="brJiraIssueModalClose"/);
 assert.match(ui,/function closeJiraIssuePreview\(/);
 assert.match(ui,/All available Jira fields/);
 assert.match(runtime,/jiraIssueFieldMetadata\(/);
 assert.match(runtime,/jiraPreviewFieldPlans\[item.path\]/);
 assert.match(runtime,/extraFields:fieldPlan.extraFields/);
 assert.match(read('src/jira-field-preflight.js'),/Information not available in the approved Business Requirements document/);
});
