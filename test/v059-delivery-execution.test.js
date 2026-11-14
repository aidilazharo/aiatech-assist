'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const work=require('../src/delivery-work');
const brWorkflow=require('../src/br-workflow');
const {checksum}=require('../src/document-editor');
const approved={title:'Claim submission',objective:'Allow claim submission',scope:'Customers',acceptanceCriteria:'Request is validated',features:[{id:'F-001',title:'Claims',stories:[{id:'S-001',title:'Submit claim'},{id:'S-002',title:'Track claim'}]}]};
function register(revision=1,synced=true){const result={brs:[{id:'BR-001',status:'approved',approvedRevision:revision,approvedContent:{...approved,acceptanceCriteria:revision===1?'Request is validated':'Request is validated and audited'},approvedRevisions:revision>1?[{revision:1,content:approved}]:[]}],synced:synced?{'BR-001':{key:'CLAIM-1',kind:'Epic',issueType:'Epic',title:'Claims Epic'},'BR-001/F-001':{key:'CLAIM-2',kind:'Feature',issueType:'Story',title:'Claims Feature'},'BR-001/F-001/S-001':{key:'CLAIM-3',kind:'Story',issueType:'Sub-task',title:'Submit claim'},'BR-001/F-001/S-002':{key:'CLAIM-4',kind:'Story',issueType:'Sub-task',title:'Track claim'}}:{},revision:revision};for(const item of brWorkflow.flattenApproved(result.brs))if(result.synced[item.path])result.synced[item.path].hash=checksum(JSON.stringify(item));return result;}
const roles=[{id:'solution-architect',label:'Solution Architect',tasks:[{id:'design',label:'Solution design',document:'architecture/design.md'}]},{id:'software-developer',label:'Developer',tasks:[{id:'implementation',label:'Implementation',document:'development/implementation.md'},{id:'unit',label:'Test evidence',document:'testing/unit-results.md'}]},{id:'custom-role',label:'Project specialist',tasks:[{id:'evidence',label:'Actual specialist evidence'}]}];
const readiness={handoffs:roles.map(x=>({roleId:x.id,items:[{id:x.id+'-BR-001',roleId:x.id,brId:'BR-001',brRevision:1,status:'ready',blockers:[]}]}))};
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-delivery-'));try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('Approved and published BR activates role-specific JIRA tasks once with project custom role',()=>fixture(async root=>{
 const first=work.activate(root,{projectId:'claims',register:register(),readiness,roles});assert.equal(first.created,6);
 assert.equal(work.activate(root,{projectId:'claims',register:register(),readiness,roles}).created,0);
 const all=work.list(root).items;assert.equal(all.length,6);assert.equal(all.filter(x=>x.role_id==='software-developer').length,4);
 assert.deepEqual(new Set(all.filter(x=>x.role_id==='software-developer').map(x=>x.jira_key)),new Set(['CLAIM-3','CLAIM-4']));
 assert.equal(all.find(x=>x.role_id==='solution-architect').jira_key,'CLAIM-2');assert.equal(all.find(x=>x.role_id==='custom-role').jira_key,'CLAIM-1');
 assert.equal(all.every(x=>x.status==='ready'),true);
}));
test('Unpublished BRs cannot activate issue-level work',()=>fixture(async root=>{
 assert.equal(work.activate(root,{projectId:'claims',register:register(1,false),readiness,roles}).created,0);
 assert.equal(work.list(root).items.length,0);
}));
test('Work sessions persist and draft saves use optimistic concurrency checks',()=>fixture(async root=>{
 work.activate(root,{projectId:'claims',register:register(),readiness,roles});const id=work.list(root).items.find(x=>x.role_id==='solution-architect').id;
 assert.throws(()=>work.start(root,id,''),/Assign to Me/);
 const started=work.start(root,id,'person-a');assert.equal(started.status,'in-progress');assert.equal(work.start(root,id,'person-a').sessionId,started.sessionId);
 assert.throws(()=>work.start(root,id,'person-b'),/owned by another/);
 const first=work.save(root,id,'person-a',{content:'# Design\n\nManual notes',revision:0,mode:'hybrid'});assert.equal(first.draft_revision,1);
 assert.throws(()=>work.save(root,id,'person-a',{content:'Stale overwrite',revision:0}),/newer revision/);
 assert.throws(()=>work.save(root,id,'person-b',{content:'Unauthorized',revision:1}),/authorization/);
 assert.equal(work.context(root,id,register()).item.content,'# Design\n\nManual notes');
}));
test('AI proposals remain distinct; manual text is not silently overwritten and stale proposals cannot apply',()=>fixture(async root=>{
 work.activate(root,{projectId:'claims',register:register(),readiness,roles});const id=work.list(root).items.find(x=>x.role_id==='solution-architect').id;work.start(root,id,'person-a');
 work.save(root,id,'person-a',{content:'Human-written architecture choice',revision:0});
 const prop=work.suggestion(root,id,'person-a',{content:'Proposed design only',sources:['BR-001 r1'],assumptions:['Assumption: caching permitted'],questions:['Which region?'],nextAction:'Confirm location'});
 assert.equal(prop.item.status,'needs-input');assert.equal(work.context(root,id,register()).item.content,'Human-written architecture choice');
 work.save(root,id,'person-a',{content:'Revised manually',revision:1});
 assert.throws(()=>work.resolveSuggestion(root,id,'person-a',prop.suggestionId,'accept'),/Draft changed/);
 const newProp=work.suggestion(root,id,'person-a',{content:'A revised proposal',sources:[],assumptions:[],questions:[]});
 work.resolveSuggestion(root,id,'person-a',newProp.suggestionId,'accept');
 assert.match(work.context(root,id,register()).item.content,/Revised manually/);
 assert.match(work.context(root,id,register()).item.content,/A revised proposal/);
}));
test('Submitting requires content; approval requires a distinct reviewer; completion requires approved revision',()=>fixture(async root=>{
 work.activate(root,{projectId:'claims',register:register(),readiness,roles});const id=work.list(root).items.find(x=>x.role_id==='solution-architect').id;work.start(root,id,'owner');
 assert.throws(()=>work.submit(root,id,'owner',0),/Save document content/);
 const saved=work.save(root,id,'owner',{content:'Architecture proposal',revision:0});
 assert.equal(work.submit(root,id,'owner',saved.draft_revision).status,'in-review');
 assert.throws(()=>work.review(root,id,'owner',{action:'approve',revision:1}),/independent/);
 assert.throws(()=>work.review(root,id,'reviewer',{action:'changes-requested',revision:0,remarks:'Revise'}),/no longer awaiting/);
 assert.equal(work.review(root,id,'reviewer',{action:'approve',revision:1}).status,'approved');
 assert.equal(work.complete(root,id,'owner',1).status,'completed');
 assert.throws(()=>work.complete(root,id,'owner',1),/required for completion/);
}));
test('Human execution requires actual evidence references before completion',()=>fixture(async root=>{
 work.activate(root,{projectId:'claims',register:register(),readiness,roles});const id=work.list(root).items.find(x=>x.role_id==='custom-role').id;work.start(root,id,'owner');
 work.save(root,id,'owner',{content:'Actual manual work note',revision:0,mode:'manual'});work.submit(root,id,'owner',1);work.review(root,id,'reviewer',{action:'approve',revision:1});
 assert.throws(()=>work.complete(root,id,'owner',1),/evidence reference/);
}));
test('Approved BR revision changes mark existing work stale without destroying historical drafts',()=>fixture(async root=>{
 work.activate(root,{projectId:'claims',register:register(),readiness,roles});const id=work.list(root).items.find(x=>x.role_id==='solution-architect').id;work.start(root,id,'owner');work.save(root,id,'owner',{content:'Human design based on r1',revision:0});
 const changed={handoffs:readiness.handoffs.map(x=>({...x,items:x.items.map(y=>({...y,brRevision:2}))}))};
 const result=work.activate(root,{projectId:'claims',register:register(2),readiness:changed,roles});assert.ok(result.stale>0);
 const current=work.context(root,id,register(2)).item;assert.equal(current.status,'stale');assert.equal(current.content,'Human design based on r1');
 assert.throws(()=>work.start(root,id,'owner'),/blocked/);
}));
test('Missing prerequisites block work and capture actionable reasons',()=>fixture(async root=>{
 const blocked={handoffs:readiness.handoffs.map(x=>({...x,items:x.items.map(y=>({...y,status:'blocked',blockers:['Architecture review pending']}))}))};
 work.activate(root,{projectId:'claims',register:register(),readiness:blocked,roles});const item=work.list(root).items[0];assert.equal(item.status,'blocked');assert.deepEqual(item.blockers,['Architecture review pending']);
}));
test('Workbench is part of the current extension and supports narrow layouts',async()=>{
 const extension=await fs.readFile(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');const ui=await fs.readFile(path.join(__dirname,'..','media','start.js'),'utf8');const css=await fs.readFile(path.join(__dirname,'..','media','start.css'),'utf8');
 for(const id of ['deliveryWorkspace','deliveryQueue','deliveryWorkbench','deliveryContent','deliverySuggestions','deliverySubmit','deliveryApprove'])assert.ok(extension.includes('id="'+id+'"'));
 assert.match(ui,/function renderDeliveryWorkbench/);assert.match(css,/@media\(max-width:1080px\)/);
});
