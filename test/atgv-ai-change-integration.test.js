'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAdapter,collectFindings,sourceFingerprint,locate}=require('../src/ai-change-resolution/atgv-adapter');

function fixture(){
 let counter=1;
 let state={revision:'r1',importDigest:'evidence-sha',discoveryRevision:'12-answers',brs:[{id:'BR-001',status:'approved',title:'Approval',objective:'Existing objective',scope:'Existing scope',acceptanceCriteria:'Review is required',features:[],approvedContent:{scope:'Existing scope'},approvedRevisions:[{revision:1,scope:'Existing scope'}],approvedRevision:1}],changeQueue:[{id:'CHG-001',status:'pending',targetIds:['BR-001'],field:'scope',value:'Change approval rules',origin:'document'}],sourceConflicts:[],sourceConflictDecisions:{},roleImpacts:[],inboundJira:[],synced:{'BR-001':{key:'TEST-123'}},aiChangeResolutions:{}};
 const brWorkflow={
  load:async()=>structuredClone(state),
  write:async(_r,_id,expected,mutation)=>{
   assert.equal(state.revision,expected,'BR revision comparison must prevent stale writes');
   const next=structuredClone(state);delete next.revision;
   await mutation(next);
   state={...next,revision:'r'+(++counter)};
   return structuredClone(state);
  }
 };
 const events={};
 const adapter=createAdapter({registry:{},brWorkflow,authorize:async({action})=>events.block!==action,generateModel:async({context,instructions})=>({summary:'Resolve conflicting scope',rationale:'Evidence-based correction',risk:'Needs BA approval',dependencies:['TEST-123'],changes:[{artifactId:'BR-001',operation:'update',field:'scope',expectedVersion:context.targets[0].expectedVersion,proposedContent:'Clarified approval rule'+(instructions?' '+instructions:''),reason:'Reconcile approved evidence'}]})});
 return {adapter,events,read:()=>structuredClone(state),replace:x=>{state=x}};
}
const actor={id:'verified-ba'};
async function ingest(f){await f.adapter.service.ingest('project',await f.adapter.collectFindings('project'),actor);}

test('ATGV adapter detects existing pending change proposals with stable provenance',async()=>{
 const f=fixture();await ingest(f);
 const issue=(await f.adapter.service.snapshot('project'))[0];
 assert.equal(issue.id,'proposal:CHG-001');
 assert.equal(issue.affectedArtifacts[0],'BR-001');
 assert.equal(issue.sourceFingerprint,sourceFingerprint(f.read(),issue.id));
});

test('ATGV proposed changes move approved requirements to draft without modifying approved snapshots or Jira',async()=>{
 const f=fixture();await ingest(f);
 const service=f.adapter.service,id='proposal:CHG-001';
 await service.generate('project',id,actor);await service.preview('project',id,actor);await service.approve('project',id,actor);await service.apply('project',id,actor);
 const state=f.read(),br=state.brs[0];
 assert.equal(br.status,'draft');
 assert.equal(br.scope,'Clarified approval rule');
 assert.equal(br.approvedContent.scope,'Existing scope');
 assert.equal(br.approvedRevisions[0].scope,'Existing scope');
 assert.equal(state.synced['BR-001'].key,'TEST-123');
 assert.equal(state.changeQueue[0].status,'accepted');
 assert.equal(state.aiChangeResolutions[id].status,'applied');
 assert.equal(Object.values(state.aiChangeApplyReceipts)[0].publishedToJira,false);
});

test('ATGV preview is read-only and reflects old and new fields',async()=>{
 const f=fixture();await ingest(f);const service=f.adapter.service,id='proposal:CHG-001';
 await service.generate('project',id,actor);
 const preview=await service.preview('project',id,actor);
 assert.equal(preview.preview.diff[0].before,'Existing scope');
 assert.equal(preview.preview.diff[0].after,'Clarified approval rule');
 assert.equal(f.read().brs[0].scope,'Existing scope');
});

test('AI cannot introduce destructive actions or modify unrelated Business Requirements',async()=>{
 const f=fixture();await ingest(f);
 const r=f.read(),issue=(await f.adapter.service.snapshot('project'))[0],v=f.adapter.workflow;
 await assert.rejects(()=>v.preview({projectId:'project',issue,plan:{changes:[{artifactId:'BR-001',operation:'remove',field:'scope'}]}}),/cannot create, delete/);
 await assert.rejects(()=>v.preview({projectId:'project',issue,plan:{changes:[{artifactId:'BR-999',operation:'update',field:'scope',proposedContent:'bad',expectedVersion:'sha'}]}}),/outside the issue scope/);
 assert.deepEqual(f.read().brs,r.brs);
});

test('ATGV apply blocks approved resolution when original evidence changes',async()=>{
 const f=fixture();await ingest(f);const id='proposal:CHG-001',service=f.adapter.service;
 await service.generate('project',id,actor);await service.preview('project',id,actor);await service.approve('project',id,actor);
 const change=f.read();change.brs[0].scope='Updated by other user';f.replace(change);
 await assert.rejects(()=>service.apply('project',id,actor),x=>x.code==='STALE_SOURCE');
 assert.equal(f.read().changeQueue[0].status,'pending');
});

test('Source contradiction requires AI preview and approval before its review marker changes',async()=>{
 const f=fixture(),r=f.read();r.changeQueue=[];r.sourceConflicts=[{id:'CON-01',brId:'BR-001',excerptA:'Rule A',excerptB:'Rule B'}];f.replace(r);
 await ingest(f);const id='evidence:CON-01',service=f.adapter.service;
 await service.generate('project',id,actor);await service.preview('project',id,actor);
 assert.equal(f.read().sourceConflictDecisions['CON-01'],undefined);
 await service.approve('project',id,actor);await service.apply('project',id,actor);
 assert.equal(f.read().sourceConflictDecisions['CON-01'],true);
});

test('Reject / regeneration is permitted but accepted proposal must be previewed again',async()=>{
 const f=fixture();await ingest(f);const id='proposal:CHG-001',service=f.adapter.service;
 await service.generate('project',id,actor);await service.preview('project',id,actor);await service.approve('project',id,actor);
 await service.generate('project',id,actor,'after feedback');
 await assert.rejects(()=>service.apply('project',id,actor),x=>x.code==='APPROVAL_REQUIRED');
 assert.equal(f.read().brs[0].status,'approved');
});

test('Ingest excludes resolved source records after application and preserves audit history',async()=>{
 const f=fixture();await ingest(f);const id='proposal:CHG-001',service=f.adapter.service;
 await service.generate('project',id,actor);await service.preview('project',id,actor);await service.approve('project',id,actor);await service.apply('project',id,actor);
 assert.equal((await f.adapter.collectFindings('project')).length,0);
 assert.equal(f.read().events.at(-1).action,'ai-change-resolution-applied');
});
