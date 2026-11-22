'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planFields}=require('../src/jira-field-preflight');
const {safeExtraFields,adf}=require('../src/remote-actions');
const {editorField,schemaFingerprint}=require('../src/jira-field-values');
const {save}=require('../src/jira-item-editor');
const br=require('../src/br-workflow');
const {workbook}=require('../src/ba-workbook-memory');

const field=(id,name,type,extra={})=>({id,name,schema:{type},operations:['set'],...extra});
const criteria=field('customfield_10001','Acceptance Criteria','string',{schema:{type:'string',custom:'jira:textarea'}});
const dod=field('customfield_10002','Definition of Done','string',{schema:{type:'string',custom:'jira:textarea'}});
const risk=field('customfield_10003','Risk Score','number',{required:true});
const priority=field('priority','Priority','priority',{allowedValues:[{id:'2',name:'High'},{id:'3',name:'Medium'}]});
const due=field('duedate','Due Date','date');
const description=field('description','Description','string');
const story={path:'BR-001/F-001/S-001',kind:'Story',title:'Save the record',description:'A verified user saves the record.\nRisk Score: 3.5\nPriority: High\nDue Date: 2026-12-02',
 issueChecks:{acceptanceCriteria:'Given a verified user, when they save, then the record appears.',definitionOfDone:'[ ] Verify that saved records can be reopened.'}};

test('BA generation uses workbook-derived guidance and preserves issue-level checks',()=>{
 const prompt=br.promptForGeneration({scope:'Save records'});
 assert.match(prompt,/TRM_Application_Req\.xlsx/);
 assert.match(prompt,/Given \/ When \/ Then/);
 assert.match(prompt,/current project evidence/);
 assert.ok(!prompt.includes('99%'));
 assert.equal(workbook.sheets.length,5);
 const output=br.validateProposal([{title:'Records',objective:'Save records',scope:'Records',acceptanceCriteria:'The record is saved',
  features:[{title:'Storage',description:'Storage feature',stories:[{title:story.title,description:story.description,...story.issueChecks}]}]}]);
 const items=br.flattenApproved([{id:'BR-001',status:'approved',approvedContent:output[0]}]);
 assert.deepEqual(items.find(item=>item.kind==='Story').issueChecks,story.issueChecks);
});

test('Jira planning maps AC and DoD and encodes supported values against the live schema',()=>{
 const plan=planFields(story,[description,criteria,dod,risk,priority,due]);
 assert.deepEqual(plan.blocking,[]);
 assert.deepEqual(plan.extraFields.customfield_10001,adf(story.issueChecks.acceptanceCriteria));
 assert.deepEqual(plan.extraFields.customfield_10002,adf(story.issueChecks.definitionOfDone));
 assert.equal(plan.extraFields.customfield_10003,3.5);
 assert.deepEqual(plan.extraFields.priority,{id:'2'});
 assert.equal(plan.extraFields.duedate,'2026-12-02');
 assert.equal(plan.description,story.description);
 assert.deepEqual(safeExtraFields(plan.extraFields,[criteria,dod,risk,priority,due]),plan.extraFields);
});

test('missing or too-short dedicated fields keep the full checks in Description',()=>{
 const longCriteria='Given a verified user, when they save a record, then the record is visible. '.repeat(7);
 const plan=planFields({...story,issueChecks:{...story.issueChecks,acceptanceCriteria:longCriteria}},[
  description,field('customfield_11000','AC','string')
 ]);
 assert.match(plan.extraFields.customfield_11000,/issue description/);
 assert.ok(plan.description.includes(longCriteria));
 assert.match(plan.description,/Definition of done/);
});

test('Jira metadata and manual inputs decide which structured values can be published',()=>{
 const noRisk={...story,description:'Risk Score: TBD'};
 const missing=planFields(noRisk,[risk,priority]);
 assert.equal(missing.blocking.length,1);
 assert.ok(!Object.hasOwn(missing.extraFields,'customfield_10003'));
 assert.equal(missing.fields[0].editor.id,'customfield_10003');
 const override=planFields({...noRisk,jiraDetails:{fieldValues:{customfield_10003:'0',priority:'3'}}},[risk,priority]);
 assert.deepEqual(override.blocking,[]);
 assert.equal(override.extraFields.customfield_10003,0);
 assert.deepEqual(override.extraFields.priority,{id:'3'});
 const renamed={...priority,name:'Release priority'};
 assert.notEqual(schemaFingerprint([priority]),schemaFingerprint([renamed]));
 assert.notEqual(schemaFingerprint([priority]),schemaFingerprint([{...priority,allowedValues:[]}]));
 assert.equal(editorField(priority,{id:'2'}).value,'2');
});

test('live Jira editor rechecks metadata, keeps an unchanged description, and verifies written fields',async()=>{
 const key='TC-42';
 const config={get:name=>({'jira.projectKey':'TC','jira.baseUrl':'https://example.atlassian.net','jira.email':'test@example.test'})[name]};
 let issue={key,fields:{project:{key:'TC'},updated:'v1',summary:'Save the record',description:adf('Existing text'),status:{name:'To Do'}}};
 const args={config,token:'test',key,expectedUpdated:'v1',read:async()=>issue};
 const draft={summary:issue.fields.summary,description:'Existing text',fieldValues:{priority:'2',customfield_10002:'[ ] Tests are recorded.'}};
 const writes=[];
 const result=await save({...args,draft,metadata:async()=>[priority,dod],request:async(_url,req)=>{
  writes.push(req.data.fields);
  issue={key,fields:{...issue.fields,...req.data.fields,updated:'v2'}};
 }});
 assert.deepEqual(writes,[{priority:{id:'2'},customfield_10002:adf('[ ] Tests are recorded.')}]);
 assert.equal(result.summaryOrDescriptionChanged,false);
 assert.deepEqual(result.editedFieldIds,['priority','customfield_10002']);
 await assert.rejects(save({...args,expectedUpdated:'v2',draft,metadata:async()=>[dod],request:async()=>assert.fail('field drift must block writes')}),/no longer editable/);
});
