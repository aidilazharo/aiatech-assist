'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const gate=require('../src/architect-stack-approval');
const {normalizeProjectInput}=require('../src/projects');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha='a'.repeat(40);
const prepared={stackId:'react',companionId:'',root:path.resolve(require('node:os').tmpdir(),'test-project'),branch:'bootstrap/react-initial',sha};
const verification={status:'verified',stackId:'react',companionId:'',root:prepared.root,branch:prepared.branch,sha,at:'2026-11-06T02:00:00Z'};
const resultSet=['test','build','run'].map(operation=>({operation,relative:'',head:sha,passed:true,at:'2026-11-06T02:00:00Z'}));
const validated=gate.evidence({stackId:'react',repo:{root:prepared.root,sha,clean:true},results:resultSet});
const project={techStackId:'react',techStackCompanionId:'',techStackPrepared:prepared,techStackValidation:validated};
test('Developer approval accepts a saved revision without server verification',()=>{
 assert.equal(gate.serverVerified(project),false);
 assert.equal(gate.approval(project,{root:prepared.root,sha,clean:true},'Architect').serverStatus,'unverified');
 assert.equal(gate.serverVerified({...project,techStackServerVerification:verification}),true);
 const approved=gate.approval({...project,techStackServerVerification:verification},{root:prepared.root,sha,clean:true},'Architect');
 assert.equal(approved.sha,sha);
 for(const invalid of [{...verification,sha:'b'.repeat(40)},{...verification,root:'/tmp/other'},{...verification,branch:'bootstrap/angular-initial'},{...verification,stackId:'angular'},null]){
  assert.equal(gate.serverVerified({...project,techStackServerVerification:invalid}),false);
 }
});
test('server proof is persisted but invalidated by selected stack change and prepared revision change',()=>{
 const base=normalizeProjectInput({id:'team',name:'Team',techStackId:'react',techStackPrepared:prepared,techStackServerVerification:verification});
 assert.ok(gate.serverVerified(base));
 const renamed=normalizeProjectInput({...base,name:'Updated'},base);
 assert.ok(gate.serverVerified(renamed));
 const switched=normalizeProjectInput({...base,techStackId:'angular'},base);
 assert.equal(switched.techStackServerVerification,null);
 const changed=normalizeProjectInput({...base,techStackPrepared:{...prepared,sha:'b'.repeat(40)}},base);
 assert.equal(changed.techStackServerVerification,null);
 const stopped=normalizeProjectInput({...base,techStackServerVerification:null},base);
 assert.equal(stopped.techStackServerVerification,null);
});
test('Solution Architect markup uses compact three-step tracker and one set of controls',()=>{
 const html=read('test/generated/extension-source.txt');const css=read('media/start.css');
 for(const id of ['architectSaveStage','architectDependenciesStage','architectApproveStage','architectServerToggle','architectApproveStack','architectStackStatusBadge','architectCatalogStatus']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/class="architect-gated-stages architect-stepper"/);
 assert.match(html,/architect-server-actions/);
 assert.match(css,/#242529/);
});
test('approval uses saved Git revision and does not require server verification',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js');
 const block=host.slice(host.indexOf("case 'architectApproveStack':{"),host.indexOf("case 'devCopilotArtifacts':{"));
 assert.doesNotMatch(block,/approvalEvidence\(project,serverState\)/);
 assert.doesNotMatch(block,/gate\.requireServerVerification/);
 assert.match(host,/techStackServerVerification:verification/);
 assert.match(host,/techStackServerVerification:null/);
 assert.match(ui,/const canRequestApproval=!!\(saved&&prepared\?\.remotePushed===true\)/);
 assert.match(ui,/architectApproveStack'\)\.disabled=architectActionBusy\|\|!canRequestApproval\|\|approved/);
 assert.doesNotMatch(block,/if\(!serverState\.running\|\|!serverState\.healthy\)throw Error/);
 assert.match(ui,/architectServerSnapshotProjectId===activeId/);
});
