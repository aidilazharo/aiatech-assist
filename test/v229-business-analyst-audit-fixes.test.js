'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const read=require('node:fs').readFileSync;
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const workflow=require('../src/br-workflow');
const history=require('../media/completed-br-history');
const root=path.join(__dirname,'..');
const front=read(path.join(root,'media/start.js'),'utf8');
const host=read(path.join(root,'test/generated/extension-source.txt'),'utf8');
const source=read(path.join(root,'src/br-workflow.js'),'utf8');
const proposal={title:'Device request',objective:'Accountable loan operations',scope:'Internal staff',acceptanceCriteria:'Correct account records',features:[]};
const mk=(n)=>({id:'BR-'+String(n).padStart(3,'0'),title:'Requirement '+n,approvedRevision:1,jiraKey:'TC-'+n,jiraIssues:[]});
const cycle=(n)=>({id:'CYCLE-'+n,requirements:[mk(n)],sources:[],discoveryAnswers:{}});
const fixture=async fn=>{const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v229-'));try{const registry=new ProjectRegistry(home);await registry.create({id:'demo',name:'Demo'});return await fn(registry);}finally{await fs.rm(home,{recursive:true,force:true});}};

test('Action Required shared predicate covers drafts and all review flags',()=>{
 const cases=[
  [{status:'draft',needsRefresh:false},true],
  [{status:'retire-proposed'},true],
  [{status:'approved',needsRefresh:true},true],
  [{status:'approved',externalReviewRequired:true},true],
  [{status:'approved',roleReviewRequired:true},true],
  [{status:'approved',dependencyReviewRequired:true},true],
  [{status:'approved'},false],
  [{status:'draft',approvedContent:proposal},true]
 ];
 for(const [br,expected] of cases){assert.equal(history.requiresAttention(br),expected,JSON.stringify(br));assert.equal(history.currentlyApproved(br),!expected);}
 assert.match(front,/const needsAction=ATGVCompletedBRHistory\.requiresAttention\(br\)/);
 assert.match(front,/brActiveFilter==='pending'&&ATGVCompletedBRHistory\.requiresAttention\(br\)/);
});

test('51-cycle migration includes the oldest approved BR without duplicating current snapshots',()=>{
 const stored=Array.from({length:51},(_,i)=>({id:mk(i+1).id,title:mk(i+1).title,status:'approved',archivedFromRestart:true,approvedContent:proposal,approvedRevision:1}));
 const register={brs:stored,synced:{}};
 const records=Array.from({length:50},(_,i)=>cycle(51-i));
 const resolved=history.recover(records,register),grouped=history.group(resolved);
 assert.equal(grouped.length,51);
 assert.equal(grouped.find(item=>item.id==='BR-001').snapshots.length,1);
 assert.equal(grouped.find(item=>item.id==='BR-051').snapshots.length,1);
 assert.equal(resolved.at(-1).id,'recovered-history');
});

test('published identity index retains older revisions and keeps newest revision first',()=>{
 const index=[{...mk(1),approvedRevision:1},{...mk(1),approvedRevision:2}];
 const grouped=history.group(history.recover([{id:'latest',requirements:[{...mk(1),approvedRevision:3}]}],{completedIndex:index,brs:[]}));
 assert.deepEqual(grouped[0].snapshots.map(snapshot=>snapshot.br.approvedRevision),[3,1,2]);
 assert.match(source,/next\.completedIndex=\(next\.completedIndex\|\|\[\]\)\.concat/);
 assert.match(source,/next\.completedIndex=\(next\.completedIndex\|\|\[\]\)\.filter\(row=>!wanted\.has\(row\.id\)\)/);
});

test('discovery saved indicators are truthful, distinct from local editing state',()=>{
 for(const [inputs,want] of [
  [{filled:0,total:12},'Not started'],
  [{filled:7,total:12},'7 of 12 answered'],
  [{filled:12,total:12},'Answers complete · Save to continue'],
  [{filled:12,total:12,saved:true},'Saved · Ready'],
  [{filled:12,total:12,saved:true,unsaved:true},'Unsaved changes']
 ])assert.equal(history.discoveryStatus(inputs),want);
 assert.match(front,/ATGVCompletedBRHistory\.discoveryStatus\(details\)/);
 assert.match(front,/saved:savedDiscovery,filled,total/);
});

test('rerender keeps expanded completed BR IDs and keeps rows collapsed initially',()=>{
 assert.match(front,/const expandedBrIds=new Set\(\[\.\.\.root\.querySelectorAll\('details\.ba-completed-br-section\[open\]'\)\]/);
 assert.match(front,/details\.open=expandedBrIds\.has\(group\.id\)/);
});

test('confirmed generation risk includes actor, source fingerprint and finding snapshot',()=>fixture(async registry=>{
 let s=await workflow.load(registry,'demo');
 s=await workflow.imported(registry,'demo',s.revision,{name:'requirement.pdf',digest:'a'.repeat(64)});
 s=await workflow.discoverySaved(registry,'demo',s.revision,'rev-1');
 s=await workflow.reviewed(registry,'demo',s.revision,{discoveryRevision:'rev-1',text:JSON.stringify({readiness:'Needs attention',suggestions:[{key:'security',severity:'Critical',issue:'Missing controls'}]})});
 s=await workflow.generated(registry,'demo',s.revision,{discoveryRevision:'rev-1',requirements:[proposal],riskAccepted:true,actor:'Verified BA'});
 assert.equal(s.reviewRiskAccepted.by,'Verified BA');
 assert.equal(s.reviewRiskAccepted.sourceFingerprint,'a'.repeat(64));
 assert.equal(s.reviewRiskAccepted.findings.length,1);
 assert.equal(s.reviewRiskAccepted.decision,'Continue with Risks');
 assert.ok(s.reviewRiskAccepted.at);
 assert.match(host,/actor:await verifiedBAActor\(\)/);
}));

test('interrupted reset is journaled, safely retryable and non-destructive to approved/Jira records',()=>fixture(async registry=>{
 let s=await workflow.load(registry,'demo');
 s=await workflow.write(registry,'demo',s.revision,next=>{next.brs=[{id:'BR-001',status:'approved',title:proposal.title,approvedContent:proposal,approvedRevision:1}];next.synced={'BR-001':{key:'TC-101',kind:'Epic',hash:'abc'}};});
 s=await workflow.startOrRestart(registry,'demo',s.revision,{actor:'Verified BA'});
 assert.equal(s.restartRecovery.pending,true);
 assert.equal(s.synced['BR-001'].key,'TC-101');
 await assert.rejects(workflow.repairRestart(registry,'demo',{clearDiscovery:async()=>{throw Error('Injected discovery write failure');}}),/Injected discovery/);
 s=await workflow.load(registry,'demo');assert.equal(s.restartRecovery.pending,true);
 const repaired=await workflow.repairRestart(registry,'demo',{clearDiscovery:async()=>{}});
 assert.equal(repaired.repaired,true);
 assert.equal(repaired.register.restartRecovery.pending,false);
 assert.equal(repaired.register.synced['BR-001'].key,'TC-101');
 assert.equal(repaired.register.brs[0].archivedFromRestart,true);
 const repeated=await workflow.repairRestart(registry,'demo',{clearDiscovery:async()=>{throw Error('Unexpected call');}});
 assert.equal(repeated.repaired,false);
}));

test('v0.2.42 source, UI and metadata references are coherent',()=>{
 const pkg=require('../package.json');assert.equal(pkg.version,'0.3.50');assert.equal(pkg.atgvDisplayVersion,'0.3.50');
 assert.match(host,/brWorkflow\.repairRestart\(/);
 assert.match(host,/Restart recovery requires manual review|Discovery changed after restart/);
});
