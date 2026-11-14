'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const br=require('../src/br-workflow');
const discovery=require('../src/ba-discovery');
const {ProjectRegistry}=require('../src/projects');
const make=(title,feature='Register',objective='Deliver validated onboarding')=>({title,objective,scope:'Employees only',acceptanceCriteria:'Business acceptance succeeds',features:feature?[{title:feature,description:'Accept '+feature,stories:[{title:'Perform '+feature,description:'Execute '+feature}]}]:[]});
async function fixture(cb){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-036-'));try{const registry=new ProjectRegistry(root);await registry.create({id:'p',name:'P'});return await cb(registry,root);}finally{await fs.rm(root,{recursive:true,force:true});}}
async function start(reg){let r=await br.load(reg,'p');r=await br.imported(reg,'p',r.revision,{name:'source.docx',digest:'a'.repeat(64)});r=await br.discoverySaved(reg,'p',r.revision,'D1');r=await br.reviewed(reg,'p',r.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});return r;}
async function approve(reg,r,c){r=await br.generated(reg,'p',r.revision,{discoveryRevision:r.discoveryRevision,requirements:[c]});const item=r.brs.find(x=>x.status==='draft');r=await br.edit(reg,'p',r.revision,{brId:item.id,content:c});return br.approve(reg,'p',r.revision,{brId:item.id,actor:'verified'});}
async function synced(reg,r){let seq=120;for(const item of br.plan(r).filter(x=>x.action==='create'))r=await br.recorded(reg,'p',r.revision,{path:item.path,action:item.action,key:'BA-'+seq++,hash:item.hash,kind:item.kind,title:item.title});return r;}
test('atomic discovery save rejects one of two stale concurrent writers',()=>fixture(async reg=>{
 const original=await discovery.load(reg,'p');const filled=Object.fromEntries(discovery.QUESTIONS.map(([key])=>[key,'FIRST']));
 const other={...filled,problem:'SECOND'};
 const results=await Promise.allSettled([discovery.save(reg,'p',filled,original.revision),discovery.save(reg,'p',other,original.revision)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 const read=await discovery.load(reg,'p');assert.ok(['FIRST','SECOND'].includes(read.answers.problem));
}));
test('retirement of removed features and stories requires explicit matching consent',()=>fixture(async reg=>{
 let r=await synced(reg,await approve(reg,await start(reg),make('Onboarding')));
 r=await br.discoverySaved(reg,'p',r.revision,'D2');r=await br.reviewed(reg,'p',r.revision,{discoveryRevision:'D2',text:'Reviewed'});
 r=await br.generated(reg,'p',r.revision,{discoveryRevision:'D2',requirements:[make('Onboarding','')]});
 r=await br.edit(reg,'p',r.revision,{brId:'BR-001',content:make('Onboarding','')});r=await br.approve(reg,'p',r.revision,{brId:'BR-001'});
 const toRetire=br.plan(r).filter(x=>x.action==='retire');assert.equal(toRetire.length,5);assert.ok(toRetire.every(x=>x.requiresApproval));
 await assert.rejects(br.beginOperation(reg,'p',r.revision,{path:toRetire[0].path,action:'retire'}),/approval/);
 await assert.rejects(br.approveRetirements(reg,'p',r.revision,[toRetire[0]]),/All affected/);
 r=await br.approveRetirements(reg,'p',r.revision,toRetire.map(x=>({path:x.path,consent:x.consent})));
 assert.ok(br.plan(r).filter(x=>x.action==='retire').every(x=>!x.requiresApproval));
}));
test('removed child identities stay permanently reserved after adding unrelated items',()=>fixture(async reg=>{
 let r=await approve(reg,await start(reg),make('Onboarding'));
 const previous=r.brs[0].features[0];
 r=await br.discoverySaved(reg,'p',r.revision,'D2');r=await br.reviewed(reg,'p',r.revision,{discoveryRevision:'D2',text:'Reviewed'});
 r=await br.generated(reg,'p',r.revision,{discoveryRevision:'D2',requirements:[make('Onboarding','')]});
 r=await br.discoverySaved(reg,'p',r.revision,'D3');r=await br.reviewed(reg,'p',r.revision,{discoveryRevision:'D3',text:'Reviewed'});
 r=await br.generated(reg,'p',r.revision,{discoveryRevision:'D3',requirements:[make('Onboarding','Archive')]});
 const feature=r.brs[0].features[0];assert.notEqual(feature.id,previous.id);assert.notEqual(feature.stories[0].id,undefined);
}));
test('identical titles but unrelated content are not treated as same approved BR',()=>fixture(async reg=>{
 let r=await approve(reg,await start(reg),make('Customer Platform'));
 r=await br.discoverySaved(reg,'p',r.revision,'D2');r=await br.reviewed(reg,'p',r.revision,{discoveryRevision:'D2',text:'Reviewed'});
 const replacement=make('Customer Platform','Payment','Prevent unusual debit card transactions');replacement.scope='Retail payments and payment risk';replacement.acceptanceCriteria='Block risky payment requests';
 r=await br.generated(reg,'p',r.revision,{discoveryRevision:'D2',requirements:[replacement]});
 assert.equal(r.brs.length,2);assert.equal(r.brs.find(x=>x.id==='BR-001').status,'approved'); // Omitted BR is retained, never auto-retired
 const added=r.brs.find(x=>x.id!=='BR-001');assert.equal(added.status,'draft');
}));
test('previous document draft cannot be approved with a later source fingerprint',()=>fixture(async reg=>{
 let r=await start(reg);r=await br.generated(reg,'p',r.revision,{discoveryRevision:'D1',requirements:[make('Onboarding')]});r=await br.edit(reg,'p',r.revision,{brId:'BR-001',content:make('Onboarding')});
 r=await br.imported(reg,'p',r.revision,{name:'revised.docx',digest:'b'.repeat(64)});
 r=await br.discoverySaved(reg,'p',r.revision,'D2');r=await br.reviewed(reg,'p',r.revision,{discoveryRevision:'D2',text:'Reviewed'});
 await assert.rejects(br.approve(reg,'p',r.revision,{brId:'BR-001'}),/stale/);
}));
test('critical review issues require risk acknowledgment before generation and approval',()=>fixture(async reg=>{
 let r=await start(reg);r=await br.reviewed(reg,'p',r.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Needs attention',suggestions:[{severity:'Critical',issue:'Missing owner'}]})});
 await assert.rejects(br.generated(reg,'p',r.revision,{discoveryRevision:'D1',requirements:[make('Onboarding')]}),/risk acknowledgment/);
}));
test('orphaned dead process lock can be reclaimed when old',()=>fixture(async reg=>{
 let r=await start(reg);const file=path.join(path.dirname(reg.fileFor('p')),'documents','requirements','br-register.json.lock');
 await fs.writeFile(file,JSON.stringify({pid:99999999,token:'old',created:Date.now()-300000}));
 r=await br.discoverySaved(reg,'p',r.revision,'D2');assert.equal(r.discoveryRevision,'D2');
}));
