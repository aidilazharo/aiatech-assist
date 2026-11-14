'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const workflow=require('../src/br-workflow');
const {createAdapter,collectFindings}=require('../src/ai-change-resolution/atgv-adapter');
const digestA='a'.repeat(64),digestB='b'.repeat(64),digestC='c'.repeat(64);
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v148-'));try{const registry=new ProjectRegistry(root);const project=await registry.create({id:'cockpit',name:'Cockpit'});await ensureWorkspaceLibrary(root);await scaffoldProject(root,project);return await fn(registry);}finally{await fs.rm(root,{recursive:true,force:true});}}
const source=(name,digest,sourceId)=>({name,digest,sourceId,characters:100,version:1});
const br=(id,title,digest,questionRefs=['acceptance'])=>({id,title,objective:title,scope:title,acceptanceCriteria:title+' is approved',status:'approved',features:[],questionRefs,approvedContent:{title},approvedRevision:1,needsRefresh:false,evidence:[{digest,name:digest===digestA?'visitor.pdf':'gate.pdf',verified:true,passage:'Verified acceptance evidence'}]});
function setup(n){n.importEpoch=1;n.importDigest=digestA;n.sourceDocuments=[source('visitor.pdf',digestA,'DOC-VISITOR')];n.sourceVersions={[digestA]:source('visitor.pdf',digestA,'DOC-VISITOR'),[digestB]:source('gate.pdf',digestB,'DOC-GATE')};n.processedSources=[digestA];n.brs=[br('BR-001','GATE financial approval',digestB),br('BR-006','Visitor reception roster',digestA)];n.synced={'BR-001':{key:'TC-10'},'BR-006':{key:'TC-60'}};}
test('new visitor discovery change targets BR-006 only, preserving unrelated GATE approved BR and Jira keys',()=>fixture(async registry=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.write(registry,'cockpit',r.revision,setup);
 r=await workflow.discoverySaved(registry,'cockpit',r.revision,'vis-revision',{answerChanges:[{key:'acceptance',before:'Check-in',after:'Reception records visitor checkout time'}]});
 assert.equal(r.changeQueue.length,1);assert.deepEqual(r.changeQueue[0].targetIds,['BR-006']);assert.equal(r.changeQueue[0].expectedHashes['BR-001'],undefined);
 assert.equal(r.brs[0].status,'approved');assert.equal(r.brs[0].needsRefresh,false);assert.equal(r.brs[1].needsRefresh,true);assert.equal(r.synced['BR-001'].key,'TC-10');assert.equal(r.synced['BR-006'].key,'TC-60');
 assert.deepEqual(collectFindings(r).map(x=>x.affectedArtifacts),[['BR-006']]);
}));
test('legacy discovery proposals targeting every active BR are superseded, never approved automatically',()=>fixture(async registry=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.write(registry,'cockpit',r.revision,n=>{setup(n);n.changeQueue=[{id:'CHG-LEGACY',status:'pending',origin:'discovery',sourceId:'acceptance',field:'acceptanceCriteria',value:'Visitor approved check-in',targetIds:['BR-001','BR-006']}];});
 const before={...r.synced};assert.deepEqual(collectFindings(r),[],'unsafe discovery proposals must never enter AI generation');
 r=await workflow.reconcileDiscoveryTargets(registry,'cockpit');assert.equal(r.changeQueue[0].status,'superseded');assert.equal(r.discoveryTargetReviews.length,1);assert.match(r.discoveryTargetReviews[0].reason,/source-document identity|discovery/i);
 assert.deepEqual(r.synced,before);assert.equal(r.brs[0].status,'approved');assert.equal(r.brs[1].status,'approved');
}));
test('new unrelated document creates no change proposal and no false reconciliation warning',()=>fixture(async registry=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.write(registry,'cockpit',r.revision,n=>{setup(n);n.sourceDocuments=[source('new-equipment.pdf',digestC,'DOC-EQUIPMENT')];n.sourceVersions[digestC]=source('new-equipment.pdf',digestC,'DOC-EQUIPMENT');n.processedSources=[digestC];});
 r=await workflow.discoverySaved(registry,'cockpit',r.revision,'new-evidence',{answerChanges:[{key:'acceptance',before:'',after:'Equipment loans are recorded'}]});
 assert.equal(r.changeQueue.length,0);assert.equal(r.discoveryTargetReviews.length,0);
}));
test('multiple BRs from same source with ambiguous discovery question require manual selection',()=>fixture(async registry=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.write(registry,'cockpit',r.revision,n=>{setup(n);n.brs.push(br('BR-007','Visitor security reporting',digestA));});
 r=await workflow.discoverySaved(registry,'cockpit',r.revision,'new-evidence',{answerChanges:[{key:'acceptance',before:'',after:'Visitor status and security must be tracked'}]});
 assert.equal(r.changeQueue.length,0);assert.match(r.discoveryTargetReviews.at(-1).reason,/Multiple requirements/);
}));
test('AI returns empty plan: actionable no-change explanation rather than invalid proposal',()=>fixture(async registry=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.write(registry,'cockpit',r.revision,setup);
 r=await workflow.discoverySaved(registry,'cockpit',r.revision,'rev',{answerChanges:[{key:'acceptance',before:'old',after:'record visitor checkout'}]});
 const adapter=createAdapter({registry,brWorkflow:workflow,generateModel:async()=>({noChangesRequired:true,changes:[],rationale:'Already covered'}),authorize:async()=>true});
 await adapter.service.ingest('cockpit',collectFindings(r),{id:'Test BA'});
 await assert.rejects(adapter.service.generate('cockpit','proposal:'+r.changeQueue[0].id,{id:'Test BA'}),e=>e.code==='NO_CHANGES');
 const latest=await workflow.load(registry,'cockpit');assert.equal(latest.brs[0].status,'approved');assert.equal(latest.aiChangeResolutions['proposal:'+r.changeQueue[0].id].status,'detected');
}));
test('invalid AI response retries once, with exact scoped identity, without changing Jira',()=>fixture(async registry=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.write(registry,'cockpit',r.revision,setup);
 r=await workflow.discoverySaved(registry,'cockpit',r.revision,'rev',{answerChanges:[{key:'acceptance',before:'old',after:'record visitor checkout'}]});
 let calls=0;const adapter=createAdapter({registry,brWorkflow:workflow,generateModel:async({context})=>{calls++;if(calls===1)return {changes:[]};return {summary:'Visitor change',changes:[{artifactId:'BR-006',operation:'update',field:'acceptanceCriteria',expectedVersion:context.targets[0].expectedVersion,proposedContent:'Visitor check-in and checkout recorded'}]};},authorize:async()=>true});
 await adapter.service.ingest('cockpit',collectFindings(r),{id:'Test BA'});
 const result=await adapter.service.generate('cockpit','proposal:'+r.changeQueue[0].id,{id:'Test BA'});
 assert.equal(calls,2);assert.equal(result.proposal.changes[0].artifactId,'BR-006');
 const latest=await workflow.load(registry,'cockpit');assert.equal(latest.synced['BR-001'].key,'TC-10');assert.equal(latest.synced['BR-006'].key,'TC-60');assert.equal(latest.brs[0].status,'approved');
}));
test('approved AI change applies to visitor BR draft only; GATE and both Jira keys untouched',()=>fixture(async registry=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.write(registry,'cockpit',r.revision,setup);
 r=await workflow.discoverySaved(registry,'cockpit',r.revision,'review-1',{answerChanges:[{key:'acceptance',before:'old',after:'Record visitor checkout'}]});
 const id='proposal:'+r.changeQueue[0].id;
 const adapter=createAdapter({registry,brWorkflow:workflow,generateModel:async({context})=>({summary:'Add checkout acceptance rule',changes:[{artifactId:'BR-006',operation:'update',field:'acceptanceCriteria',expectedVersion:context.targets[0].expectedVersion,proposedContent:'Every visitor checkout is timestamped'}]}),authorize:async()=>true});
 await adapter.service.ingest('cockpit',collectFindings(r),{id:'Business Analyst'});
 await adapter.service.generate('cockpit',id,{id:'Business Analyst'});
 await adapter.service.preview('cockpit',id,{id:'Business Analyst'});
 await adapter.service.approve('cockpit',id,{id:'Business Analyst'});
 await adapter.service.apply('cockpit',id,{id:'Business Analyst'});
 const after=await workflow.load(registry,'cockpit');
 assert.equal(after.brs[0].status,'approved');assert.equal(after.brs[0].acceptanceCriteria,'GATE financial approval is approved');
 assert.equal(after.brs[1].status,'draft');assert.equal(after.brs[1].acceptanceCriteria,'Every visitor checkout is timestamped');
 assert.equal(after.synced['BR-001'].key,'TC-10');assert.equal(after.synced['BR-006'].key,'TC-60');
 assert.equal(after.changeQueue[0].status,'accepted');
}));
