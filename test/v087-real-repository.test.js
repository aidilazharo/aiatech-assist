'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const brWorkflow=require('../src/br-workflow');
const {createAdapter}=require('../src/ai-change-resolution/atgv-adapter');

test('Full ATGV repository integration persists approved AI edits while retaining approved snapshots and Jira issue links',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-resolution-'));
 const registry={fileFor:id=>path.join(root,id,'project.json')};
 try{
  const id='project01';
  let register=await brWorkflow.load(registry,id);
  register=await brWorkflow.write(registry,id,register.revision,next=>{
   next.brs=[{id:'BR-001',title:'Approval',objective:'Original',scope:'Original business scope',acceptanceCriteria:'Review',features:[],status:'approved',approvedContent:{scope:'Original business scope'},approvedRevision:1,approvedRevisions:[{revision:1,scope:'Original business scope'}]}];
   next.changeQueue=[{id:'CHG-001',targetIds:['BR-001'],field:'scope',status:'pending',origin:'document',value:'Correct business scope'}];
   next.synced={'BR-001':{key:'TEST-123'}};
  });
  const {service,collectFindings}=createAdapter({registry,brWorkflow,authorize:async()=>true,generateModel:async({context})=>({summary:'Evidence grounded correction',changes:[{artifactId:'BR-001',operation:'update',field:'scope',expectedVersion:context.targets[0].expectedVersion,proposedContent:'Correct business scope'}]})});
  const actor={id:'verified-user'};
  await service.ingest(id,await collectFindings(id),actor);
  await service.generate(id,'proposal:CHG-001',actor);
  await service.preview(id,'proposal:CHG-001',actor);
  await service.approve(id,'proposal:CHG-001',actor);
  await service.apply(id,'proposal:CHG-001',actor);
  const after=await brWorkflow.load(registry,id);
  assert.equal(after.brs[0].status,'draft');
  assert.equal(after.brs[0].scope,'Correct business scope');
  assert.equal(after.brs[0].approvedContent.scope,'Original business scope');
  assert.equal(after.synced['BR-001'].key,'TEST-123');
  assert.equal(after.changeQueue[0].status,'accepted');
  assert.equal(after.aiChangeResolutions['proposal:CHG-001'].status,'applied');
  assert.equal(Object.values(after.aiChangeApplyReceipts)[0].success,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
