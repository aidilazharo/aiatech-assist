'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const br=require('../src/br-workflow');const {adf}=require('../src/remote-actions');
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-v028-'));try{const registry=new ProjectRegistry(root);const project=await registry.create({id:'cockpit',name:'Cockpit'});await ensureWorkspaceLibrary(root);await scaffoldProject(root,project);return await fn({root,registry});}finally{await fs.rm(root,{force:true,recursive:true});}}
const req=(title='Improve onboarding')=>({title,objective:'Reduce manual work',scope:'For employees only',acceptanceCriteria:'A valid user sees a successful confirmation',features:[{title:'Register user',description:'A valid employee can register',stories:[{title:'Submit data',description:'Validate registration fields'}]}]});
async function reviewed(registry){let r=await br.load(registry,'cockpit');r=await br.imported(registry,'cockpit',r.revision,{name:'requirements.docx',digest:'a'.repeat(64)});r=await br.discoverySaved(registry,'cockpit',r.revision,'revision-1');return br.reviewed(registry,'cockpit',r.revision,{discoveryRevision:'revision-1',text:'Copilot: scope needs confirmation'});}
test('import → save discovery → Copilot review → generate → edit → approve exports immutable markdown',()=>fixture(async({root,registry})=>{
 let r=await br.load(registry,'cockpit');await assert.rejects(br.generated(registry,'cockpit',r.revision,{discoveryRevision:'x',requirements:[req()]}),/Import/);
 r=await reviewed(registry);r=await br.generated(registry,'cockpit',r.revision,{discoveryRevision:'revision-1',requirements:[req(),req('Support account updates')]});
 assert.equal(r.brs.length,2);assert.ok(r.brs.every(b=>b.status==='draft'));
 await assert.rejects(br.approve(registry,'cockpit',r.revision,{brId:'BR-001'}),/Save the BR draft/);
 r=await br.edit(registry,'cockpit',r.revision,{brId:'BR-001',content:req('Improve onboarding and registration')});
 assert.match(await fs.readFile(path.join(root,'projects/cockpit/documents/requirements/draft-brs/BR-001.md'),'utf8'),/Improve onboarding and registration/);
 r=await br.approve(registry,'cockpit',r.revision,{brId:'BR-001'});assert.equal(r.brs[0].status,'approved');
 assert.match(await fs.readFile(path.join(root,'projects/cockpit/documents/requirements/approved-brs/BR-001-revision-1.md'),'utf8'),/registration/);
 assert.equal(br.plan(r).length,6);assert.deepEqual(br.plan(r).slice(0,3).map(i=>i.kind),['Epic','Feature','Story']);assert.equal(br.plan(r).filter(i=>i.kind==='Role').length,3);
 await assert.rejects(br.edit(registry,'cockpit',r.revision,{brId:'BR-001',content:req('Unauthorized edit')}),/locked/);
 await assert.rejects(br.approve(registry,'cockpit',r.revision,{brId:'BR-001'}),/Only a draft/);
}));
test('new import unlocks regeneration while preserving the last approved snapshot for Jira',()=>fixture(async({registry})=>{
 let r=await reviewed(registry);r=await br.generated(registry,'cockpit',r.revision,{discoveryRevision:'revision-1',requirements:[req()]});r=await br.edit(registry,'cockpit',r.revision,{brId:'BR-001',content:req()});r=await br.approve(registry,'cockpit',r.revision,{brId:'BR-001'});
 const paths=br.plan(r).map(i=>i.path);for(const item of br.plan(r)){r=await br.recorded(registry,'cockpit',r.revision,{path:item.path,action:'create',key:'FIN-'+(100+paths.indexOf(item.path)),hash:item.hash,kind:item.kind,title:item.title});}
 assert.equal(br.plan(r).length,0);
 r=await br.imported(registry,'cockpit',r.revision,{name:'v2.pdf',digest:'b'.repeat(64)});
 await assert.rejects(br.edit(registry,'cockpit',r.revision,{brId:'BR-001',content:req('Changed')}),/locked/);
 r=await br.discoverySaved(registry,'cockpit',r.revision,'revision-2');r=await br.reviewed(registry,'cockpit',r.revision,{discoveryRevision:'revision-2',text:'Copilot reviewed v2'});
 r=await br.generated(registry,'cockpit',r.revision,{discoveryRevision:'revision-2',requirements:[req('Improve onboarding')]});
 assert.equal(r.brs[0].status,'approved');assert.equal(br.plan(r).length,0,'unchanged approved snapshots do not trigger changes');
 r=await br.imported(registry,'cockpit',r.revision,{name:'v3.pdf',digest:'c'.repeat(64)});
 r=await br.discoverySaved(registry,'cockpit',r.revision,'revision-3');r=await br.reviewed(registry,'cockpit',r.revision,{discoveryRevision:'revision-3',text:'Copilot reviewed v3'});
 r=await br.generated(registry,'cockpit',r.revision,{discoveryRevision:'revision-3',requirements:[{...req('Improve onboarding'),scope:'Broader scope'}]});
 r=await br.edit(registry,'cockpit',r.revision,{brId:'BR-001',content:{...req(),scope:'Broader scope'}});r=await br.approve(registry,'cockpit',r.revision,{brId:'BR-001'});
 assert.equal(br.plan(r).filter(i=>i.action==='update').length,1);
 r=await br.imported(registry,'cockpit',r.revision,{name:'v4.pdf',digest:'d'.repeat(64)});r=await br.discoverySaved(registry,'cockpit',r.revision,'rev-4');r=await br.reviewed(registry,'cockpit',r.revision,{discoveryRevision:'rev-4',text:'Reviewed'});
 r=await br.retire(registry,'cockpit',r.revision,{brId:'BR-001'});
 assert.ok(br.plan(r).every(i=>i.action==='retire'));
}));
test('rejects stale revisions, malformed AI output, and unapproved Jira sync plans',()=>fixture(async({registry})=>{
 let r=await reviewed(registry);
 assert.throws(()=>br.parseGenerated('not-json'),/JSON/);
 assert.throws(()=>br.validateProposal([{...req(),features:[{title:'x',description:'y',stories:[{title:'',description:'z'}]}]}]),/Required text/);
 const stale=r.revision;r=await br.generated(registry,'cockpit',r.revision,{discoveryRevision:'revision-1',requirements:[req()]});
 assert.equal(br.plan(r).length,0);
 await assert.rejects(br.generated(registry,'cockpit',stale,{discoveryRevision:'revision-1',requirements:[req()]}),/changed/);
}));
