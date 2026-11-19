'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const control=require('../src/jira-change-control');const workflow=require('../src/br-workflow');const {ProjectRegistry}=require('../src/projects');
const read=require('node:fs').readFileSync;
const base={title:'Account routing',objective:'Route new accounts',scope:'New accounts only',acceptanceCriteria:'Routes are accurate',features:[]};
async function fixture(run){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aia118-'));try{
 const reg=new ProjectRegistry(dir);await reg.create({id:'demo',name:'Demo'});
 let current=await workflow.load(reg,'demo');
 current=await workflow.write(reg,'demo',current.revision,next=>{
  next.brs.push({id:'BR-001',...base,approvedContent:base,approvedRevision:1,status:'approved',needsRefresh:false});
  next.synced['BR-001']={key:'AIA-42',kind:'Epic',hash:'old-hash',title:'Account routing'};
 });return await run(reg,current);
}finally{await fs.rm(dir,{force:true,recursive:true});}}
test('Jira work status detects reopened issues from the full changelog',()=>{
 const issue={fields:{status:{name:'To Do',statusCategory:{key:'new'}}}};
 const full={complete:true,entries:[{field:'status',fromString:'In Progress',toString:'To Do'}]};
 const state=control.workHistory(issue,full);assert.equal(state.known,true);assert.equal(state.started,true);
});
test('Jira current in-progress and completed issue states count as started',()=>{
 for(const key of ['indeterminate','done'])assert.equal(control.workHistory({fields:{status:{statusCategory:{key},name:'Custom'}}},{complete:true,entries:[]}).started,true);
});
test('missing or incomplete Jira changelog fails closed',()=>{
 const issue={fields:{status:{name:'To Do',statusCategory:{key:'new'}}}};
 assert.equal(control.workHistory(issue,{complete:false,entries:[]}).known,false);
 assert.equal(control.workHistory(issue,null).started,true);
 assert.equal(control.workHistory({fields:{status:{name:'Custom'}}},{complete:true,entries:[]}).known,false);
});
test('changed Jira work requires CR, while untouched Jira issue can be updated before work starts',async()=>fixture(async(_reg,state)=>{
 const items=workflow.plan(state);assert.ok(items.some(i=>i.action==='update'));
 const before=await control.assessPlan(state,items,async()=>({known:true,started:false,reason:'Not started'}));
 assert.equal(before.blocked.length,0);
 const after=await control.assessPlan(state,items,async()=>({known:true,started:true,reason:'In progress'}));
 assert.equal(after.blocked.length,1);assert.equal(after.blocked[0].path,'BR-001');
}));
test('unknown Jira work history remains blocked even with an approved CR',async()=>fixture(async(reg,state)=>{
 const items=workflow.plan(state);
 state=await workflow.createChangeRequest(reg,'demo',state.revision,{paths:['BR-001'],reason:'Business rule must change',actor:'Alice'});
 state=await workflow.decideChangeRequest(reg,'demo',state.revision,{crId:state.changeRequests[0].id,decision:'approve',actor:'Bob'});
 const unknown=await control.assessPlan(state,items,async()=>({known:false,started:true,reason:'Cannot read history'}));
 assert.equal(unknown.blocked.length,1);
 const allowed=await control.assessPlan(state,items,async()=>({known:true,started:true,reason:'Started'}));
 assert.equal(allowed.blocked.length,0);assert.equal(allowed.protection[0].crId,state.changeRequests[0].id);
}));
test('CR approval needs a different reviewer and an unchanged change plan',async()=>fixture(async(reg,state)=>{
 state=await workflow.createChangeRequest(reg,'demo',state.revision,{paths:['BR-001'],reason:'New statutory policy to implement',actor:'Alice'});
 const id=state.changeRequests[0].id;
 await assert.rejects(workflow.decideChangeRequest(reg,'demo',state.revision,{crId:id,decision:'approve',actor:'Alice'}),/Independent/);
 state=await workflow.decideChangeRequest(reg,'demo',state.revision,{crId:id,decision:'approve',actor:'Bob'});
 assert.equal(state.changeRequests[0].state,'approved');
 const acceptedHash=workflow.plan(state).find(x=>x.path==='BR-001').hash;
 state=await workflow.write(reg,'demo',state.revision,next=>{next.synced['BR-001'].hash=acceptedHash;});
 state=await workflow.finishChangeRequest(reg,'demo',state.revision,{paths:['BR-001'],actor:'Jira'});
 assert.equal(state.changeRequests[0].state,'implemented');
 state=await workflow.decideChangeRequest(reg,'demo',state.revision,{crId:id,decision:'close',actor:'Alice'});
 assert.equal(state.changeRequests[0].state,'closed');
}));
test('a changed Jira plan invalidates unapproved CR impact assessment',async()=>fixture(async(reg,state)=>{
 state=await workflow.createChangeRequest(reg,'demo',state.revision,{paths:['BR-001'],reason:'Change request for routing details',actor:'Alice'});
 const id=state.changeRequests[0].id;
 state=await workflow.write(reg,'demo',state.revision,next=>{next.brs[0].approvedContent={...base,objective:'Changed and approved by a separate process'};});
 await assert.rejects(workflow.decideChangeRequest(reg,'demo',state.revision,{crId:id,decision:'approve',actor:'Bob'}),/plan changed/i);
}));
test('work-start evidence persists across extension reloads',async()=>fixture(async(reg,state)=>{
 state=await workflow.recordJiraWorkHistory(reg,'demo',state.revision,{protection:[{issues:[{key:'AIA-42',known:true,started:true,status:'In Progress'}]}],blocked:[]});
 const reloaded=await workflow.load(reg,'demo');assert.equal(reloaded.jiraWorkHistory['AIA-42'].started,true);
 state=await workflow.recordJiraWorkHistory(reg,'demo',reloaded.revision,{protection:[{issues:[{key:'AIA-42',known:true,started:false,status:'To Do'}]}],blocked:[]});
 assert.equal(state.jiraWorkHistory['AIA-42'].started,true);
}));
test('BR screen supports CR panel, selective drafts, live status and manual Discovery saves',()=>{
 const host=read(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');const ui=read(path.join(__dirname,'../media/start.js'),'utf8');
 for(const id of ['baCRPanel','baCRList','baCRForm','brGenerateAffected','baJiraRefreshStatus'])assert.ok(host.includes('id="'+id+'"'),id);
 for(const cmd of ['brChangeRequestCreate','brChangeRequestDecision','brJiraRefreshWorkStates'])assert.ok(host.includes("case '"+cmd+"'"),cmd);
 assert.match(host,/jiraProtectionAssessment/);assert.match(host,/await jiraPreflight\(/);
 assert.doesNotMatch(ui,/scheduleDiscoveryAutosave\(\)/);assert.doesNotMatch(ui,/autosave:true/);assert.match(ui,/discoveryAutosaveSnapshot/);
 assert.doesNotMatch(ui,/editorLayoutTwoColumns|ViewColumn\.Two/);
});
test('selective regeneration updates only targeted BR drafts',async()=>fixture(async(reg,state)=>{
 state=await workflow.write(reg,'demo',state.revision,next=>{
  next.importEpoch=1;next.importName='source.pdf';next.importDigest='a'.repeat(64);
  next.discoveryRevision='D1';next.reviewRevision='D1';next.reviewText=JSON.stringify({readiness:'Ready'});
  next.brs[0].status='draft';next.brs[0].source={discoveryRevision:'D1'};
  next.brs.push({id:'BR-002',title:'Unrelated rules',objective:'Old',scope:'Unrelated',acceptanceCriteria:'Old criteria',features:[],status:'approved',approvedContent:{title:'Unrelated rules',objective:'Old',scope:'Unrelated',acceptanceCriteria:'Old criteria',features:[]},needsRefresh:false});
 });
 const original=JSON.stringify(state.brs[1]);
 state=await workflow.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[{...base,objective:'Updated route'}],targetBrIds:['BR-001']});
 assert.equal(JSON.stringify(state.brs.find(x=>x.id==='BR-002')),original);
 assert.equal(state.brs.find(x=>x.id==='BR-001').objective,'Updated route');
}));
