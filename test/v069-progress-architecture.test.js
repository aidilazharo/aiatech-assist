'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const proposals=require('../src/design-proposals');
const diagram=require('../src/diagram-model');
const dir=path.join(__dirname,'..');
const webview=fs.readFileSync(path.join(dir,'test','generated','extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(dir,'media','start.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'media','start.css'),'utf8');
const sample={title:'Proposed System Architecture',summary:'Illustrative components derived from requirements',diagram:{title:'Proposed Platform',nodes:[{id:'portal',label:'Customer Portal',kind:'component',x:80,y:80},{id:'api',label:'Proposed API',kind:'component',x:390,y:80}],edges:[{id:'request',from:'portal',to:'api',label:'Proposed request'}]},assumptions:['API choice needs review'],questions:['Confirm integration method']};
test('architecture diagram proposals require approved requirements and valid, linked nodes',()=>{
 assert.equal(proposals.KINDS.architecture,'Architecture Diagram');
 assert.throws(()=>proposals.approvedInputs({brs:[]}),/Approve/);
 const input=proposals.approvedInputs({brs:[{id:'BR-123',status:'approved',approvedRevision:2,approvedContent:{title:'Portal',objective:'Manage onboarding',scope:'Users',acceptanceCriteria:'Success',features:[]}}]});
 assert.match(proposals.prompt('architecture',input),/BR-123/);
 const safe=proposals.validate(sample,'architecture');
 assert.equal(safe.diagram.nodes.length,2);assert.equal(safe.diagram.edges[0].to,'api');
 assert.match(proposals.markdown(safe),/Customer Portal/);
 assert.deepEqual(diagram.fromDrawioXml(diagram.toDrawioXml(safe.diagram)).edges.map(e=>e.to),['api']);
 assert.throws(()=>proposals.validate({...sample,diagram:{...sample.diagram,edges:[{from:'api',to:'missing'}]}},'architecture'),/unknown endpoint/);
 assert.throws(()=>proposals.validate({...sample,diagram:{nodes:[],edges:[]}},'architecture'),/1–24 nodes/);
 assert.throws(()=>proposals.validate({...sample,diagram:{nodes:[{id:'bad<script',label:'unsafe'}],edges:[]}},'architecture'),/Invalid diagram element identifier/);
});
test('architecture draft is kept separate from approved or edited project diagram',async()=>{
 const workspace=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-069-'));
 try{
  const registry=new ProjectRegistry(workspace);await registry.create({id:'project',name:'Project'});
  let state=await proposals.load(registry,'project');
  state=await proposals.add(registry,'project',state.revision,{kind:'architecture',approvedHash:'approval-hash',proposal:sample,actor:'Architect'});
  const proposalId=state.designs.architecture[0].id;
  state=await proposals.edit(registry,'project',state.revision,{kind:'architecture',proposalId,content:'Human updated architecture notes'});
  state=await proposals.add(registry,'project',state.revision,{kind:'architecture',approvedHash:'next-approved-hash',proposal:sample,actor:'Architect'});
  assert.equal(state.designs.architecture.length,2);assert.equal(state.designs.architecture[0].content,'Human updated architecture notes');
  const original=await fsp.readFile(path.join(workspace,'projects','project','documents','architecture','system-diagram.drawio'),'utf8').catch(()=>null);
  assert.equal(original,null);
 }finally{await fsp.rm(workspace,{recursive:true,force:true});}
});
test('Overview Gantt uses white schedule bars and full-width standard section',()=>{
 assert.match(css,/#landingView\{max-width:none!important;width:100%/);
 assert.match(css,/#landingView \.overview-timeline\{width:100%;max-width:none;background:var\(--atgv-surface\)/);
 assert.match(css,/--g-bar-color:#fff/);
 assert.match(ui,/column_width:64/);
 assert.match(webview,/id="overviewHealthDetail"[^>]*>Progress is based on completed SDLC tasks/);
 assert.ok(webview.indexOf('id="overviewHealthDetail"')<webview.indexOf('id="overviewStatus"'));
 assert.match(css,/\.sidebar-footer\{background:transparent\}/);
});
test('BA workflow hides future sections until prerequisites and groups saved answers',()=>{
 for(const name of ['discoveryQuestionsPanel','discoveryQuestionsBadge','discoveryStepMap','discoveryReviewPanel'])assert.match(webview,new RegExp('id="'+name+'"'));
 assert.match(ui,/questionsPanel\.classList\.toggle\('hidden'/);
 assert.match(ui,/\.jira-publish-panel'\)\.classList\.toggle\('hidden',!showJira\)/);
 assert.match(ui,/\.jira-inbound-panel'\)\.classList\.toggle\('hidden',!status\.showJiraInbound\|\|!showJira\)/);
 assert.match(ui,/savedDiscovery&&filled===total\?'Ready'/);
 assert.match(ui,/node\.classList\.toggle\('current',!idleMilestones&&step\.key===displayed/);
 assert.match(ui,/renderBAButtons\(\);/);
});
