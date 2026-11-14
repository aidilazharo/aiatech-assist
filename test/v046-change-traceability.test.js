'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const requirement=scope=>({title:'Customer onboarding',objective:'Register customer accounts',scope,acceptanceCriteria:'Approved onboarding works',features:[{title:'Signup',description:'Allow registration',stories:[{title:'Accept identity',description:'Check identity'}]}]});
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv46-'));try{const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});return await run(registry);}finally{await fs.rm(root,{recursive:true,force:true});}}
async function initiate(r){let s=await br.load(r,'demo');s=await br.imported(r,'demo',s.revision,{name:'requirements.docx',digest:digest('source')});s=await br.discoverySaved(r,'demo',s.revision,'rev-A');return br.reviewed(r,'demo',s.revision,{discoveryRevision:'rev-A',text:'Reviewed'});}
test('canonical graph links selected document, BR, feature, story and JIRA issues',()=>fixture(async r=>{
 let s=await initiate(r);s=await br.generated(r,'demo',s.revision,{discoveryRevision:'rev-A',requirements:[requirement('All staff')]});
 const ids=s.canonical.records.map(n=>n.id);
 assert.ok(ids.includes('BR-001/F-001/S-001'));
 assert.ok(s.canonical.edges.some(x=>x.relation==='contains'&&x.from==='BR-001'));
 assert.ok(s.canonical.edges.some(x=>x.relation==='proposed-from'&&x.to==='BR-001'));
 assert.equal(s.traceability.coverage.brCount,1);
 s=await br.edit(r,'demo',s.revision,{brId:'BR-001',content:requirement('All staff')});s=await br.approve(r,'demo',s.revision,{brId:'BR-001'});
 const item=br.plan(s)[0];s=await br.recorded(r,'demo',s.revision,{path:item.path,action:item.action,key:'DEMO-20',hash:item.hash});
 assert.ok(s.canonical.records.some(x=>x.id==='JIRA:DEMO-20'));
 assert.ok(s.canonical.edges.some(x=>x.from==='BR-001'&&x.to==='JIRA:DEMO-20'));
}));
test('change impact contains before and after values while approved revision remains immutable',()=>fixture(async r=>{
 let s=await initiate(r);s=await br.generated(r,'demo',s.revision,{discoveryRevision:'rev-A',requirements:[requirement('All staff')]});
 s=await br.edit(r,'demo',s.revision,{brId:'BR-001',content:requirement('All staff')});s=await br.approve(r,'demo',s.revision,{brId:'BR-001'});
 const previous=JSON.stringify(s.brs[0].approvedContent);
 s=await br.discoverySaved(r,'demo',s.revision,'rev-B');s=await br.reviewed(r,'demo',s.revision,{discoveryRevision:'rev-B',text:'Reviewed'});
 s=await br.generated(r,'demo',s.revision,{discoveryRevision:'rev-B',requirements:[requirement('Staff and partners')]});
 assert.equal(JSON.stringify(s.brs[0].approvedContent),previous);
 const change=s.traceability.lastChanges.find(x=>x.id==='BR-001');assert.ok(change);
 assert.deepEqual(change.fieldChanges.find(x=>x.field==='scope'),{field:'scope',before:'All staff',after:'Staff and partners'});
 assert.equal(s.brs[0].status,'draft');
}));
test('legacy registers provide a virtual graph and migrate on the next normal write',()=>fixture(async r=>{
 let s=await initiate(r);
 const file=path.join(path.dirname(r.fileFor('demo')),'documents','requirements','br-register.json');
 const raw=JSON.parse(await fs.readFile(file,'utf8'));delete raw.canonical;delete raw.traceability;delete raw.changeHistory;
 await fs.writeFile(file,JSON.stringify(raw));
 s=await br.load(r,'demo');assert.ok(s.canonical.records.some(x=>x.type==='discovery'));
 s=await br.discoverySaved(r,'demo',s.revision,'rev-B');
 const saved=JSON.parse(await fs.readFile(file,'utf8'));assert.ok(saved.canonical.records.length>0);
}));
test('concurrent stale modifications cannot lose another writer change',()=>fixture(async r=>{
 let s=await initiate(r);
 const result=await Promise.allSettled([br.discoverySaved(r,'demo',s.revision,'R2'),br.discoverySaved(r,'demo',s.revision,'R3')]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(result.filter(x=>x.status==='rejected').length,1);
}));
test('change-impact UI is visible on the BA screen',()=>{
 const html=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const js=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(html,/id="traceImpactChanges"/);assert.match(js,/function renderTraceImpact\(/);
});
