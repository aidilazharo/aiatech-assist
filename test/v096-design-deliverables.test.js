'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const designs=require('../src/design-proposals');
const artifacts=require('../src/design-artifacts');
const sourceHash='approved-requirements-2026';
const sample={
 design:{title:'Product design',summary:'Requirements',tokens:{colors:{primary:'#003399'}},screens:[{name:'Home',purpose:'Overview',components:['Search field','Save button'],interactions:['Submit search']}],flows:[],assumptions:[],questions:[]},
 ux:{title:'User journey',summary:'Requirements',screens:[{name:'Log in',purpose:'Authenticate',components:['Email field'],interactions:['Continue']},{name:'Dashboard',purpose:'Overview',components:['List'],interactions:['Open item']}],flows:['Log in → Dashboard'],assumptions:[],questions:[]},
 mockup:{title:'Screen designs',summary:'Proposed screens',screens:[{name:'<script>alert(1)</script>',purpose:'Overview',components:['Email input','Save button'],interactions:['Save']}],flows:[],assumptions:[],questions:[]},
 architecture:{title:'System',summary:'Proposed',diagram:{title:'Architecture',nodes:[{id:'client',label:'Client'},{id:'server',label:'Server'}],edges:[{id:'e1',from:'client',to:'server',label:'HTTP'}]},assumptions:[],questions:[]},
 api:{title:'API',summary:'Proposed',endpoints:[{method:'GET',path:'/customers',operation:'List customers',request:'',response:'Customers',authorization:'Bearer'}],assumptions:[],questions:[]},
 database:{title:'Database',summary:'Proposed',entities:[{name:'customers',fields:[{name:'id',type:'UUID',required:true,key:true},{name:'name',type:'VARCHAR(120)',required:true,key:false}],relationships:[]},{name:'orders',fields:[{name:'id',type:'UUID',required:true,key:true},{name:'customer_id',type:'UUID',required:true,key:false}],relationships:[{target:'customers',field:'customer_id',targetField:'id',cardinality:'many-to-one'}]}],assumptions:[],questions:[]}
};
test('six design categories produce real machine-readable technical artifacts',()=>{
 for(const [kind,source] of Object.entries(sample)){
  const files=artifacts.outputFiles(kind,source);
  assert.ok(files['design-specification.md']);assert.ok(files['design-specification.json']);
  assert.ok(Object.keys(files).length>2,kind);
  for(const body of Object.values(files))assert.ok(body.length>20,kind);
 }
 const api=JSON.parse(artifacts.outputFiles('api',sample.api)['openapi.json']);assert.equal(api.openapi,'3.1.0');assert.ok(api.paths['/customers'].get.responses['200']);
 const sql=artifacts.outputFiles('database',sample.database)['schema.sql'];assert.match(sql,/PRIMARY KEY/);assert.match(sql,/FOREIGN KEY/);
 assert.match(artifacts.outputFiles('ux',sample.ux)['user-flows.drawio'],/<mxfile/);
 const branch={...sample.ux,diagram:{title:'Branching flow',nodes:[{id:'login',label:'Log in'},{id:'decision',label:'Approved?'},{id:'dashboard',label:'Dashboard'}],edges:[{from:'login',to:'decision',label:'Submit'},{from:'decision',to:'dashboard',label:'Yes'}]}};assert.match(artifacts.outputFiles('ux',branch)['user-flows.drawio'],/Approved\?/);
 assert.match(artifacts.outputFiles('architecture',sample.architecture)['architecture.drawio'],/<mxGraphModel/);
 const mock=artifacts.outputFiles('mockup',sample.mockup)['screen-mockups.html'];assert.equal((mock.match(/<script>/g)||[]).length,1);assert.match(mock,/&lt;script&gt;/);assert.match(mock,/Content-Security-Policy/);
 assert.match(artifacts.outputFiles('design',sample.design)['design-tokens.json'],/#003399/);
});
test('type and identifier validation prevents unsafe or non-runnable SQL exports',()=>{
 const source=structuredClone(sample.database);source.entities[0].fields[0].type='TEXT; DROP TABLE x';assert.throws(()=>artifacts.outputFiles('database',source),/Unsupported SQL type/);
 const bad=structuredClone(sample.database);bad.entities[0].name='customers;drop';assert.throws(()=>artifacts.outputFiles('database',bad),/SQL generation requires/);
});
test('approval, structured edits, immutable snapshots, stale BR gates, and artifact export',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-design-096-'));
 try{
  const registry=new ProjectRegistry(temp);await registry.create({id:'example',name:'Example'});
  let state=await designs.load(registry,'example');
  state=await designs.add(registry,'example',state.revision,{kind:'database',approvedHash:sourceHash,proposal:sample.database,actor:'AI',sourceBusinessRequirements:[{id:'BR-3',revision:4}]});
  const proposalId=state.designs.database.at(-1).id;
  assert.throws(()=>artifacts.checkReady({...state.designs.database[0],kind:'database'},sourceHash),/Approve/);
  state=await designs.edit(registry,'example',state.revision,{kind:'database',proposalId,content:'Human-only Markdown change'});
  await assert.rejects(designs.approve(registry,'example',state.revision,{kind:'database',proposalId,approvedHash:sourceHash,actor:'Architect'}),/out of sync/);
  state=await designs.editStructured(registry,'example',state.revision,{kind:'database',proposalId,proposal:sample.database});
  await assert.rejects(designs.approve(registry,'example',state.revision,{kind:'database',proposalId,approvedHash:'different',actor:'Architect'}),/changed/);
  state=await designs.approve(registry,'example',state.revision,{kind:'database',proposalId,approvedHash:sourceHash,actor:'Architect'});
  assert.equal(state.designs.database[0].status,'approved');
  await assert.rejects(designs.editStructured(registry,'example',state.revision,{kind:'database',proposalId,proposal:sample.database}),/latest draft/);
  const item={...state.designs.database[0],kind:'database'};
  await assert.rejects(artifacts.exportToProject(registry,'example',item,'stale'),/changed/);
  const result=await artifacts.exportToProject(registry,'example',item,sourceHash);
  assert.ok(result.files.includes('schema.sql'));assert.ok(result.files.includes('database-erd.drawio'));assert.ok(result.files.includes('manifest.json'));
  const manifest=JSON.parse(await fs.readFile(path.join(result.directory,'manifest.json'),'utf8'));
  assert.equal(manifest.status,'approved');assert.deepEqual(manifest.sourceBusinessRequirements,[{id:'BR-3',revision:4}]);
  assert.ok((await fs.readFile(path.join(result.directory,'schema.sql'),'utf8')).includes('CREATE TABLE'));
  const repeated=await artifacts.exportToProject(registry,'example',item,sourceHash);assert.equal(repeated.alreadyExported,true);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('webview offers structured draft editing, approval and artifact export',async()=>{
 const host=await fs.readFile(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'..','media','start.js'),'utf8');
 for(const id of ['designTechnicalPreview','designStructuredText','designApprove','designExport','designDeliverableList'])assert.match(host,new RegExp('id="'+id+'"'));
 for(const action of ['designEditStructured','designApprove','designExport','designOpenArtifacts']){assert.match(host,new RegExp("case '"+action+"'"));assert.match(ui,new RegExp("send\\('"+action+"'"));}
});
