'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const impact=require('../src/design-impact-plan');
const control=require('../src/jira-change-control');
const workflow=require('../src/br-workflow');
const {ProjectRegistry}=require('../src/projects');
const fixture=async fn=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv119-'));
 try{const reg=new ProjectRegistry(dir);await reg.create({id:'test',name:'Test'});return await fn(reg,await workflow.load(reg,'test'));}
 finally{await fs.rm(dir,{recursive:true,force:true});}
};
const approved=(id,rev=2)=>({id,approvedRevision:rev,status:'approved',needsRefresh:false});
const revision=(brRefs,overrides={})=>({id:'revision',number:1,status:'approved',sourceBusinessRequirements:brRefs,...overrides});
test('impacted plan only regenerates outdated provenance and preserves unrelated design',()=>{
 const register={brs:[approved('BR-001'),approved('BR-002',1)]};
 const designs={designs:{api:[revision([{id:'BR-001',revision:1}])],database:[revision([{id:'BR-002',revision:1}])],mockup:[revision([{id:'BR-001',revision:1}],{status:'draft',manuallyEdited:true})]}};
 const plan=impact.plan(register,designs);
 assert.deepEqual(plan.candidates.map(x=>x.kind),['api']); // Unrelated BR-002 cannot regenerate a design with no recorded dependency
 assert.equal(plan.skipped.find(x=>x.kind==='mockup').reason,'Manually edited draft; review before regenerating');
 assert.equal(plan.skipped.find(x=>x.kind==='database').reason,'Source requirements unchanged');
 assert.equal(plan.requiresApproval,true);
});
test('impact regeneration accepts only eligible unique kinds and rejects unknown selections',()=>{
 const state={candidates:[{kind:'api'},{kind:'database'}]};
 assert.deepEqual(impact.assertSelection(state,['api']),['api']);
 assert.throws(()=>impact.assertSelection(state,['api','api']),/unique/);
 assert.throws(()=>impact.assertSelection(state,['ux']),/changed/);
 assert.throws(()=>impact.assertSelection(state,[]),/1–6/);
});
test('latest manually edited draft must never be silently regenerated',()=>{
 const plan=impact.plan({brs:[approved('BR-001')]},{designs:{api:[revision([{id:'BR-001',revision:1}],{status:'draft',manuallyEdited:true})]}});
 assert.equal(plan.candidates.length,0);
 assert.equal(plan.skipped.find(x=>x.kind==='api').reason.includes('Manually edited'),true);
});
test('approved CR remains bound to its complete plan fingerprint',()=>{
 const item={path:'BR-001',action:'update',key:'AIA-11',hash:'expected'};
 const reg={synced:{'BR-001':{key:'AIA-11'}},changeRequests:[{id:'CR-123',state:'approved',planHash:'different-plan',actions:[{path:'BR-001',action:'update',hash:'expected'}]}]};
 assert.equal(control.activeApproval(reg,item,control.binding([item])),null);
 reg.changeRequests[0].planHash=control.binding([item]);
 assert.equal(control.activeApproval(reg,item,control.binding([item])).id,'CR-123');
});
test('approved CR may link a Jira ticket idempotently and cannot be rebound',async()=>fixture(async(reg,record)=>{
 let current=await workflow.write(reg,'test',record.revision,next=>next.changeRequests.push({id:'CR-DEMO',state:'approved',paths:['BR-001'],history:[],createdBy:'Alice',reason:'Valid reason'}));
 current=await workflow.linkJiraChangeRequest(reg,'test',current.revision,{crId:'CR-DEMO',key:'AIA-100',url:'https://jira.example.org/browse/AIA-100',actor:'Bob'});
 assert.equal(current.changeRequests[0].jiraIssue.key,'AIA-100');
 const history=current.changeRequests[0].history.length;
 current=await workflow.linkJiraChangeRequest(reg,'test',current.revision,{crId:'CR-DEMO',key:'AIA-100',url:'https://jira.example.org/browse/AIA-100',actor:'Bob'});
 assert.equal(current.changeRequests[0].history.length,history);
 await assert.rejects(workflow.linkJiraChangeRequest(reg,'test',current.revision,{crId:'CR-DEMO',key:'AIA-101',url:'https://jira.example.org/browse/AIA-101',actor:'Bob'}),/already linked/);
}));
test('unapproved CR cannot link a Jira ticket',async()=>fixture(async(reg,record)=>{
 const current=await workflow.write(reg,'test',record.revision,next=>next.changeRequests.push({id:'CR-DEMO',state:'impact-assessed',paths:[],history:[]}));
 await assert.rejects(workflow.linkJiraChangeRequest(reg,'test',current.revision,{crId:'CR-DEMO',key:'AIA-100',url:'https://jira.example.org/browse/AIA-100',actor:'Bob'}),/Only an approved/);
}));
test('host routes and UI preserve human consent, progress, and safe change plans',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const css=await fs.readFile(path.join(__dirname,'../media/start.css'),'utf8');
 for(const name of ['designRegenerateAffected','brChangeRequestPublishTicket','brJiraRefreshWorkStates'])assert.ok(host.includes("case '"+name+"'"));
 assert.match(host,/designImpactPlan\.assertSelection/);
 assert.match(host,/jiraFindIssueByMarker\(config,token,marker\)/);
 assert.match(host,/await uiWarning\(`Create a Jira Task/);
 assert.match(ui,/designBatchPending/);
 assert.match(ui,/baInlineStatus/);
 assert.match(ui,/brGenerate'\)\.classList\.toggle\('hidden',staleDrafts\.length>0\|\|generatingDone\)/);
 assert.match(css,/\.ba-inline-status\[data-status="error"\]/);
});
