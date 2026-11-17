'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const workflow=require('../src/br-workflow');
const details=require('../src/jira-preview-details');
const {adf,jiraCreateIssue}=require('../src/remote-actions');

async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-jira-preview-'));
 try{
  const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});
  let state=await workflow.load(registry,'demo');
  state=await workflow.write(registry,'demo',state.revision,next=>{
   const content={title:'Visitor registration',objective:'Register visitors',scope:'Reception',acceptanceCriteria:'Visitor receives confirmation',features:[{id:'F-1',title:'Register',description:'Register a visitor',stories:[{id:'S-1',title:'Submit registration',description:'Submit visitor information',tasks:[{id:'T-1',title:'Validate input',description:'Validate required fields'}]}]}]};
   next.brs=[{id:'BR-001',...content,status:'approved',approvedContent:content,approvedRevision:1}];
  });
  return await run({registry,state});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}

test('Jira details are persisted in the planned description and locked by its hash',()=>fixture(async({registry,state})=>{
 const before=workflow.plan(state),story=before.find(x=>x.kind==='Story');
 const approved=JSON.stringify(state.brs[0].approvedContent);
 const next=await workflow.saveJiraIssueDetails(registry,'demo',state.revision,{path:story.path,hash:story.hash,acceptanceCriteria:'Given valid data\nWhen submitted\nThen confirm',definitionOfDone:'Tests pass\nDocumentation updated',actor:'BA'});
 const changed=workflow.plan(next).find(x=>x.path===story.path);
 assert.notEqual(changed.hash,story.hash);
 assert.match(changed.description,/Acceptance criteria:\nGiven valid data/);
 assert.match(changed.description,/Definition of done:\nTests pass/);
 assert.deepEqual(changed.jiraDetails,{acceptanceCriteria:'Given valid data\nWhen submitted\nThen confirm',definitionOfDone:'Tests pass\nDocumentation updated'});
 assert.equal(JSON.stringify(next.brs[0].approvedContent),approved);
 assert.match(JSON.stringify(adf(changed.description)),/Definition of done/);
 const persisted=await workflow.load(registry,'demo');assert.equal(workflow.plan(persisted).find(x=>x.path===story.path).hash,changed.hash);
 await assert.rejects(workflow.saveJiraIssueDetails(registry,'demo',state.revision,{path:story.path,hash:story.hash,acceptanceCriteria:'x',definitionOfDone:''}),/changed/);
 await assert.rejects(workflow.saveJiraIssueDetails(registry,'demo',persisted.revision,{path:story.path,hash:story.hash,acceptanceCriteria:'x',definitionOfDone:''}),/preview changed/i);
}));

test('BR changes require the saved Jira details to be reviewed again',()=>fixture(async({registry,state})=>{
 const issue=workflow.plan(state).find(x=>x.kind==='Story');
 let next=await workflow.saveJiraIssueDetails(registry,'demo',state.revision,{path:issue.path,hash:issue.hash,acceptanceCriteria:'Validate email',definitionOfDone:'Tests pass'});
 next=await workflow.write(registry,'demo',next.revision,n=>{n.brs[0].approvedContent.scope='New approved scope';n.brs[0].scope='New approved scope';n.brs[0].approvedRevision=2;});
 const stale=workflow.plan(next).find(x=>x.path===issue.path);
 assert.equal(stale.staleJiraDetails.acceptanceCriteria,'Validate email');
 assert.doesNotMatch(stale.description,/Acceptance criteria:\nValidate email/);
 const reviewed=await workflow.saveJiraIssueDetails(registry,'demo',next.revision,{path:stale.path,hash:stale.hash,...stale.staleJiraDetails});
 const current=workflow.plan(reviewed).find(x=>x.path===issue.path);
 assert.equal(current.staleJiraDetails,undefined);assert.match(current.description,/Acceptance criteria:\nValidate email/);
}));

test('empty details preserve existing plan format and invalid values fail',()=>fixture(async({registry,state})=>{
 const issue=workflow.plan(state).find(x=>x.kind==='Story');
 assert.deepEqual(details.applyDetails(issue,{acceptanceCriteria:'',definitionOfDone:''}),issue);
 assert.throws(()=>details.normalizeDetails({acceptanceCriteria:'x'.repeat(5001)}),/5000/);
 await assert.rejects(workflow.saveJiraIssueDetails(registry,'demo',state.revision,{path:issue.path,hash:issue.hash,acceptanceCriteria:{bad:true},definitionOfDone:''}),/plain text/);
}));

test('preview issue types follow Jira project capabilities and existing mappings',()=>{
 const types=[{name:'Epic',subtask:false},{name:'Story',subtask:false},{name:'Sub-task',subtask:true}];
 assert.equal(details.issueType({action:'create',kind:'Feature'},types),'Story');
 assert.equal(details.issueType({action:'create',kind:'Story',issueLevel:'standard'},types),'Story');
 assert.equal(details.issueType({action:'create',kind:'Task'},types),'Sub-task');
 assert.equal(details.issueType({action:'update',kind:'Story'},types,{issueType:'Bug'}),'Bug');
 assert.equal(details.issueType({action:'create',kind:'Task'},[]),'');
});

test('the planned criteria and done sections reach the Jira create payload',()=>fixture(async({registry,state})=>{
 const issue=workflow.plan(state).find(x=>x.kind==='Story');
 state=await workflow.saveJiraIssueDetails(registry,'demo',state.revision,{path:issue.path,hash:issue.hash,acceptanceCriteria:'Email is valid',definitionOfDone:'Automated tests pass'});
 const planned=workflow.plan(state).find(x=>x.path===issue.path);
 const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'test@example.test','jira.projectKey':'TC'})[key]||''};
 const old=global.fetch;let sent;
 try{
  global.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,status:201,json:async()=>({key:'TC-10'})};};
  await jiraCreateIssue(config,'token',{summary:planned.title,description:planned.description,issueType:'Story',issueTypes:[{id:'10001',name:'Story',subtask:false}]});
 }finally{global.fetch=old;}
 const text=sent.fields.description.content.map(p=>(p.content||[]).map(x=>x.text).join('')).join('\n');
 assert.equal(text,planned.description);assert.match(text,/Email is valid/);assert.match(text,/Automated tests pass/);
}));

test('preview displays exact issue fields and sends reviewed details; approval view is read-only',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const from=source.indexOf('function jiraDetailsButton('),to=source.indexOf('function renderJiraPublishedItems(',from);
 assert.ok(from>0&&to>from);
 function node(tag){const classes=new Set(['hidden']);return {tag,children:[],listeners:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(k,fn){this.listeners[k]=fn;},scrollIntoView(){}};}
 const panels={brJiraDetailsPanel:node('section'),brJiraApprovalDetails:node('section')},messages=[];
 const run=new Function('document','$','send','baBusy','brState','jiraPreviewIssueTypes','jiraPreviewProject','brPlanRevision','baBusyTask',source.slice(from,to)+';return {renderJiraIssueDetails};');
 const ui=run({createElement:node},id=>panels[id],(command,payload)=>messages.push({command,payload}),()=>{},
  {brs:[{id:'BR-001',approvedContent:{acceptanceCriteria:'Approved BR criterion'}}]}, {'BR-001/F-1':'Story'},'TC','revision-1','');
 const item={path:'BR-001/F-1',kind:'Feature',action:'create',title:'Register',description:'Actual Jira body',hash:'abc',jiraDetails:{acceptanceCriteria:'Saved criterion',definitionOfDone:'Saved done'}};
 ui.renderJiraIssueDetails(item);
 function all(root){return [root,...root.children.flatMap(all)];}
 const preview=all(panels.brJiraDetailsPanel),text=preview.map(x=>x.textContent||'').join(' ');
 assert.match(text,/Actual Jira body/);assert.match(text,/Approved BR criterion/);assert.match(text,/Story/);
 const inputs=preview.filter(x=>x.tag==='textarea');assert.equal(inputs[0].value,'Saved criterion');inputs[1].value='Updated done';
 preview.find(x=>x.textContent==='Save Jira details & refresh preview').listeners.click();
 assert.equal(messages[0].command,'brJiraSaveDetails');assert.equal(messages[0].payload.definitionOfDone,'Updated done');assert.equal(messages[0].payload.hash,'abc');
 ui.renderJiraIssueDetails(item,true);
 const approval=all(panels.brJiraApprovalDetails);assert.ok(approval.filter(x=>x.tag==='textarea').every(x=>x.readOnly));
 assert.equal(approval.some(x=>x.textContent==='Save Jira details & refresh preview'),false);
});
