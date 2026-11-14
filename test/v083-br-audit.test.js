'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const source=require('node:fs');
const workflow=require('../src/br-workflow');
const {ProjectRegistry}=require('../src/projects');
const read=name=>source.readFileSync(path.join(__dirname,'..',name),'utf8');
const requirement={title:'Portfolio routing',objective:'Route to correct lead',scope:'All portfolios',acceptanceCriteria:'Routing is correct',features:[]};
async function fixture(run){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv83-'));
 try{
  const reg=new ProjectRegistry(home);await reg.create({id:'demo',name:'Demo'});
  let state=await workflow.load(reg,'demo');
  state=await workflow.imported(reg,'demo',state.revision,{name:'a.pdf',digest:'d'.repeat(64)});
  state=await workflow.discoverySaved(reg,'demo',state.revision,'D1');
  state=await workflow.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
  state=await workflow.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[requirement]});
  return await run(reg,state);
 }finally{await fs.rm(home,{recursive:true,force:true});}
}
test('bulk conflict rejection uses a single revision and preserves BR data',()=>fixture(async(reg,state)=>{
 state=await workflow.propose(reg,'demo',state.revision,{origin:'br',field:'objective',value:'Choose lead A',targetIds:['BR-001']},'BA');
 state=await workflow.propose(reg,'demo',state.revision,{origin:'br',field:'objective',value:'Choose lead B',targetIds:['BR-001']},'BA');
 const conflicts=workflow.proposalConflicts(state);
 assert.equal(conflicts.length,1);
 assert.equal(conflicts[0].proposalIds.length,2);
 const before=JSON.stringify(state.brs);
 state=await workflow.rejectConflictingProposals(reg,'demo',state.revision,{proposalIds:conflicts[0].proposalIds,actor:'BA'});
 assert.equal(workflow.proposalConflicts(state).length,0);
 assert.equal(state.changeQueue.filter(x=>x.status==='pending').length,0);
 assert.equal(state.changeDecisions.length,2);
 assert.equal(JSON.stringify(state.brs),before);
 assert.equal(state.events.at(-1).action,'conflicting-proposals-rejected');
}));
test('bulk conflict rejection refuses to reject unrelated, stale, or duplicate IDs',()=>fixture(async(reg,state)=>{
 state=await workflow.propose(reg,'demo',state.revision,{origin:'br',field:'objective',value:'A',targetIds:['BR-001']},'BA');
 state=await workflow.propose(reg,'demo',state.revision,{origin:'br',field:'objective',value:'B',targetIds:['BR-001']},'BA');
 const stale=state.revision;
 const ids=workflow.proposalConflicts(state)[0].proposalIds;
 await assert.rejects(workflow.rejectConflictingProposals(reg,'demo',state.revision,{proposalIds:[ids[0],ids[0]]}),/Invalid conflict/);
 await assert.rejects(workflow.rejectConflictingProposals(reg,'demo',state.revision,{proposalIds:['fake']}),/Conflict list has changed/);
 state=await workflow.rejectConflictingProposals(reg,'demo',state.revision,{proposalIds:ids,actor:'BA'});
 await assert.rejects(workflow.rejectConflictingProposals(reg,'demo',stale,{proposalIds:ids,actor:'BA'}),/changed/);
}));
test('BR operation progress avoids duplicate banners, tracks completion, and blocks generation with open drafts',()=>{
 const ui=read('media/start.js'),markup=read('test/generated/extension-source.txt'),css=read('media/start.css');
 assert.match(ui,/\$\('baRunning'\)\.classList\.toggle\('hidden',!baBusyTask\)/);
 assert.match(ui,/else \$\('brGenerationProgress'\)\?\.classList\.add\('hidden'\)/);
 assert.match(ui,/brGenerate:!!baBusyTask\|\|!mine\|\|!\(brState\?\.sourceDocuments\|\|\[\]\)\.length\|\|!reviewGood\|\|freshDraftPending\|\|generatingDone/);
 assert.match(markup,/id="brRejectConflicting"/);
 assert.match(ui,/send\('brRejectConflictingProposals'/);
 assert.match(css,/\.ba-process-btn\.ba-completed:disabled/);
});
test('Jira approval uses current validated preview while publish still verifies remote state',()=>{
 const host=read('test/generated/extension-source.txt');
 assert.match(host,/jiraPreviewValidation=conflicts\.length\?null:/);
 assert.match(host,/Date\.now\(\)-jiraPreviewValidation\.verifiedAt<300000/);
 const approve=host.slice(host.indexOf("case 'brJiraApprove':"),host.indexOf("case 'brApproveRetirements':"));
 assert.doesNotMatch(approve,/jiraPreflight\(/);
 const publish=host.slice(host.indexOf('async function syncApprovedBRs('),host.indexOf('async function handleDashboardMessage('));
 assert.match(publish,/await jiraPreflight\(/);
});
