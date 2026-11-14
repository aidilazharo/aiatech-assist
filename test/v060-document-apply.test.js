'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const {loadDocument,saveDocumentMarkdown,checksum}=require('../src/document-editor');
const delivery=require('../src/delivery-work');const doc=require('../src/delivery-document');const br=require('../src/br-workflow');
async function fixture(fn){const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-apply-'));try{
 const registry=new ProjectRegistry(ws),project=await registry.create({id:'demo',name:'Demo'});await ensureWorkspaceLibrary(ws);await scaffoldProject(ws,project);
 const root=path.join(ws,'projects','demo');const content={title:'Pricing API',objective:'Publish accurate quotes',scope:'Client requests',acceptanceCriteria:'Quote is validated',features:[]};
 const record={brs:[{id:'BR-001',status:'approved',approvedRevision:1,approvedContent:content}],synced:{'BR-001':{key:'DEV-1',issueType:'Epic',title:'Pricing API'}}};record.synced['BR-001'].hash=checksum(JSON.stringify(br.flattenApproved(record.brs)[0]));
 const roles=[{id:'solution-architect',tasks:[{id:'architecture',label:'Architecture & design',document:'architecture/architecture-design.md'}]}];
 const readiness={handoffs:[{roleId:'solution-architect',items:[{brId:'BR-001',status:'ready',blockers:[]}]}]};
 delivery.activate(root,{projectId:'demo',register:record,readiness,roles});const id=delivery.list(root).items[0].id;
 return await fn({root,registry,record,id,roles,readiness,ws});
}finally{await fs.rm(ws,{recursive:true,force:true});}}
async function approve({root,id},text='Approved design'){
 delivery.start(root,id,'writer');delivery.save(root,id,'writer',{content:text,revision:0,mode:'hybrid'});delivery.submit(root,id,'writer',1);delivery.review(root,id,'independent',{action:'approve',revision:1});
}
test('Approved deliverable updates only its own section and queues synchronization without fabricating completion',()=>fixture(async env=>{
 await approve(env);const before=await loadDocument(env.registry,'demo','solution-architect','architecture');const result=await doc.applyApproved(env.root,env.registry,'demo',env.id,'writer',1);assert.equal(result.unchanged,false);
 const after=await loadDocument(env.registry,'demo','solution-architect','architecture');assert.ok(after.markdown.startsWith(before.markdown.trimEnd()));assert.match(after.markdown,/Approved design/);
 assert.equal(delivery.list(env.root).items[0].status,'approved');
 const second=await doc.applyApproved(env.root,env.registry,'demo',env.id,'writer',1);assert.equal(second.unchanged,true);
 const mem=delivery.open(env.root);assert.equal(mem.operations().some(o=>o.kind==='confluence-doc'),true);mem.close();
}));
test('Other human sections survive application and modified managed section cannot be overwritten',()=>fixture(async env=>{
 await approve(env);await doc.applyApproved(env.root,env.registry,'demo',env.id,'writer',1);
 let current=await loadDocument(env.registry,'demo','solution-architect','architecture');await saveDocumentMarkdown(env.registry,'demo','solution-architect','architecture',current.markdown+'\nHuman appendix retained.\n',current.revision);
 const again=await doc.applyApproved(env.root,env.registry,'demo',env.id,'writer',1);assert.equal(again.unchanged,true);
 current=await loadDocument(env.registry,'demo','solution-architect','architecture');assert.match(current.markdown,/Human appendix retained/);
 await saveDocumentMarkdown(env.registry,'demo','solution-architect','architecture',current.markdown.replace('Approved design','Edited by human'),current.revision);
 await assert.rejects(doc.applyApproved(env.root,env.registry,'demo',env.id,'writer',1),/edited manually/);
}));
test('Unapproved and unauthorized work cannot be applied to role documents',()=>fixture(async env=>{
 delivery.start(env.root,env.id,'writer');delivery.save(env.root,env.id,'writer',{content:'Draft only',revision:0});
 await assert.rejects(doc.applyApproved(env.root,env.registry,'demo',env.id,'writer',1),/approved revision/);
 delivery.submit(env.root,env.id,'writer',1);delivery.review(env.root,env.id,'reviewer',{action:'approve',revision:1});
 await assert.rejects(doc.applyApproved(env.root,env.registry,'demo',env.id,'intruder',1),/Assign to Me/);
}));
test('Stale BR revision must be explicitly rebased after dependencies resolve',()=>fixture(async env=>{
 delivery.start(env.root,env.id,'writer');delivery.save(env.root,env.id,'writer',{content:'Human design for first revision',revision:0});
 env.record.brs[0].approvedRevisions=[{revision:1,content:env.record.brs[0].approvedContent}];env.record.brs[0].approvedRevision=2;env.record.brs[0].approvedContent={...env.record.brs[0].approvedContent,acceptanceCriteria:'Validated and audited'};
 env.record.synced['BR-001'].hash=checksum(JSON.stringify(br.flattenApproved(env.record.brs)[0]));env.readiness.handoffs[0].items[0].brRevision=2;
 delivery.activate(env.root,{projectId:'demo',register:env.record,readiness:env.readiness,roles:env.roles});
 assert.equal(delivery.list(env.root).items[0].status,'stale');assert.equal(delivery.rebase(env.root,env.id,'writer').status,'changes-requested');
 assert.match(delivery.list(env.root).items[0].content,/Human design for first revision/);
}));
