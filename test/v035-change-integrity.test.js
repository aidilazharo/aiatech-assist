'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const br=require('../src/br-workflow');
const {ProjectRegistry}=require('../src/projects');
const req=(title,features=[['Register','Accept registration'],['Search','Find existing accounts']])=>({title,objective:'Deliver validated onboarding',scope:'Employees only',acceptanceCriteria:'Business acceptance succeeds',features:features.map(([t,d])=>({title:t,description:d,stories:[{title:'User action '+t,description:'Execute '+d}]}))});
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-035-'));try{const registry=new ProjectRegistry(root);await registry.create({id:'p',name:'P'});return await run(registry);}finally{await fs.rm(root,{recursive:true,force:true});}}
async function begin(registry){let r=await br.load(registry,'p');r=await br.imported(registry,'p',r.revision,{name:'v1.docx',digest:'a'.repeat(64)});r=await br.discoverySaved(registry,'p',r.revision,'D1');return br.reviewed(registry,'p',r.revision,{discoveryRevision:'D1',text:'Reviewed'});}
async function approved(registry,r,items){r=await br.generated(registry,'p',r.revision,{discoveryRevision:r.discoveryRevision,requirements:items});for(const record of r.brs.filter(b=>b.status==='draft')){r=await br.edit(registry,'p',r.revision,{brId:record.id,content:record});r=await br.approve(registry,'p',r.revision,{brId:record.id});}return r;}
test('feature reorder and independent story ordering preserve permanent Jira identities',()=>fixture(async registry=>{
 let r=await approved(registry,await begin(registry),[req('Onboarding')]);
 const initial=br.plan(r),paths=initial.map(x=>x.path);
 for(const [index,item] of initial.entries())r=await br.recorded(registry,'p',r.revision,{path:item.path,action:item.action,key:'APP-'+(100+index),hash:item.hash,kind:item.kind,title:item.title});
 r=await br.discoverySaved(registry,'p',r.revision,'D2');r=await br.reviewed(registry,'p',r.revision,{discoveryRevision:'D2',text:'Reviewed changed discovery'});
 r=await br.generated(registry,'p',r.revision,{discoveryRevision:'D2',requirements:[req('Onboarding',[['Search','Find existing accounts'],['Register','Accept registration']])]});
 assert.equal(r.brs[0].status,'approved');assert.deepEqual(br.plan(r),[]);
 assert.deepEqual(br.flattenApproved(r.brs).map(i=>i.path).sort(),paths.sort());
}));
test('revised discovery isolates modified BR; prior Jira remains protected pending individual approval',()=>fixture(async registry=>{
 let r=await approved(registry,await begin(registry),[req('Onboarding'),req('Claims')]);
 const initial=br.plan(r);
 for(const [index,item] of initial.entries())r=await br.recorded(registry,'p',r.revision,{path:item.path,action:item.action,key:'APP-'+(100+index),hash:item.hash,kind:item.kind,title:item.title});
 r=await br.discoverySaved(registry,'p',r.revision,'D2');assert.equal(br.plan(r).length,0);
 r=await br.reviewed(registry,'p',r.revision,{discoveryRevision:'D2',text:'Reviewed'});
 const modified=req('Onboarding');modified.scope='Employees and contractors';
 r=await br.generated(registry,'p',r.revision,{discoveryRevision:'D2',requirements:[modified,req('Claims')]});
 assert.equal(r.impact.filter(x=>x.change==='modified').length,1);
 assert.equal(r.impact.filter(x=>x.change==='unchanged').length,1);
 assert.equal(r.brs[0].status,'draft');assert.equal(r.brs[1].status,'approved');
 assert.deepEqual(br.plan(r),[]);
 r=await br.edit(registry,'p',r.revision,{brId:'BR-001',content:modified});r=await br.approve(registry,'p',r.revision,{brId:'BR-001'});
 assert.deepEqual(br.plan(r).map(x=>x.path),['BR-001']);assert.equal(br.plan(r)[0].action,'update');
}));
test('removed BR is never retired silently and requires explicit confirmation',()=>fixture(async registry=>{
 let r=await approved(registry,await begin(registry),[req('Onboarding'),req('Claims')]);
 for(const [index,item] of br.plan(r).entries())r=await br.recorded(registry,'p',r.revision,{path:item.path,action:item.action,key:'APP-'+(100+index),hash:item.hash,kind:item.kind,title:item.title});
 r=await br.discoverySaved(registry,'p',r.revision,'D2');r=await br.reviewed(registry,'p',r.revision,{discoveryRevision:'D2',text:'Reviewed'});
 r=await br.generated(registry,'p',r.revision,{discoveryRevision:'D2',requirements:[req('Onboarding')]});
 assert.equal(r.brs[1].status,'approved');assert.equal(br.plan(r).length,0);
 await assert.rejects(br.keep(registry,'p',r.revision,{brId:'BR-002'}),/No proposed retirement/);
 // A human explicitly initiates retirement; AI omission alone leaves Jira untouched.
 r=await br.generated(registry,'p',r.revision,{discoveryRevision:'D2',requirements:[req('Onboarding')]});
 r=await br.retire(registry,'p',r.revision,{brId:'BR-002'});
 assert.equal(br.plan(r).filter(x=>x.action==='retire').length,11);
 assert.equal(br.plan(r).at(-1).path,'BR-002');
}));
test('identical uploads rejected and uncertain creates are not repeated',()=>fixture(async registry=>{
 let r=await begin(registry);
 await assert.rejects(br.imported(registry,'p',r.revision,{name:'same.pdf',digest:'a'.repeat(64)}),/identical/);
 r=await br.generated(registry,'p',r.revision,{discoveryRevision:'D1',requirements:[req('Onboarding')]});r=await br.edit(registry,'p',r.revision,{brId:'BR-001',content:req('Onboarding')});r=await br.approve(registry,'p',r.revision,{brId:'BR-001'});
 const item=br.plan(r)[0];r=await br.beginOperation(registry,'p',r.revision,{path:item.path,action:item.action,hash:item.hash});
 r=await br.markAttempt(registry,'p',r.revision,{path:item.path});
 await assert.rejects(br.markAttempt(registry,'p',r.revision,{path:item.path}),/manual reconciliation/);
 r=await br.recorded(registry,'p',r.revision,{path:item.path,action:'create',key:'APP-101',hash:item.hash});
 assert.equal(r.pending[item.path],undefined);
}));
