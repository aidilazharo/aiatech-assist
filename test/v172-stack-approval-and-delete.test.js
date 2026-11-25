'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const gate=require('../src/architect-stack-approval');
const catalogFixture=require('./catalog-fixture');
const skeleton=require('../src/project-skeleton');
const {ProjectRegistry}=require('../src/projects');
const remote=require('../src/remote-br-deletion');
const root=path.join(__dirname,'..');
const exampleRepo={root:path.resolve(os.tmpdir(),'a-reviewed-repo'),sha:'abc123',clean:true};
const resultSet=relative=>['test','build','run'].map(operation=>({relative,operation,passed:true,head:'abc123',at:'2026-11-04T00:00:00Z'}));
const verification=(stackId='react',companionId='')=>({techStackPrepared:{stackId,companionId,root:exampleRepo.root,sha:exampleRepo.sha,branch:'bootstrap/react-initial'},techStackServerVerification:{status:'verified',stackId,companionId,root:exampleRepo.root,sha:exampleRepo.sha,branch:'bootstrap/react-initial',at:'2026-11-05T12:00:00Z'}});

test('Architect approval requires a saved revision; test evidence remains independently validated',()=>{
 const selected={techStackId:'react',techStackCompanionId:''};
 assert.throws(()=>gate.approval(selected,exampleRepo,'Architect'),/Save the current technology stack/);
 assert.throws(()=>gate.evidence({stackId:'react',repo:exampleRepo,results:resultSet('').slice(0,2)}),/test, build, and run/);
 assert.throws(()=>gate.evidence({stackId:'react',repo:exampleRepo,results:resultSet('').map(r=>r.operation==='run'?{...r,passed:false}:r)}),/must pass/);
 assert.throws(()=>gate.evidence({stackId:'react',repo:{...exampleRepo,clean:false},results:resultSet('')}),/clean Git/);
 assert.throws(()=>gate.evidence({stackId:'react',repo:exampleRepo,results:resultSet('').map(r=>({...r,head:'wrong'}))}),/revision changed/);
 const tested=gate.evidence({stackId:'react',repo:exampleRepo,results:resultSet('')});
 const proof=gate.approval({...selected,...verification(),techStackValidation:tested},exampleRepo,'Architect');
 const untested=gate.approval({...selected,techStackPrepared:verification().techStackPrepared},exampleRepo,'Architect');
 assert.equal(untested.testStatus,'unverified');assert.equal(untested.serverStatus,'unverified');
 assert.equal(proof.status,'approved');assert.equal(proof.sha,'abc123');
 assert.throws(()=>gate.approval({...selected,...verification(),techStackValidation:tested},{...exampleRepo,sha:'changed'},'Architect'),/repository changed/);
 assert.equal(gate.developerAllowed({...selected,techStackApproval:proof}),true);
 assert.throws(()=>gate.requireDeveloperApproval({...selected,techStackApproval:null}),/Solution Architect must/);
});

test('Architect detects invalid companion and requires every target to have all three checks',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-gate-'));
 try{await catalogFixture.activate(workspace);await assert.rejects(skeleton.stackSelection(['react','angular'],workspace),/frontend and one backend/);}finally{await fs.rm(workspace,{recursive:true,force:true});}
 assert.doesNotThrow(()=>gate.selection('react','angular')); // catalog descriptors validate pairing when generating, not the lexical approval gate
 const good=gate.evidence({stackId:'react',companionId:'nestjs',repo:exampleRepo,results:[...resultSet('apps/web'),...resultSet('services/api')]});
 const approved=gate.approval({techStackId:'react',techStackCompanionId:'nestjs',...verification('react','nestjs'),techStackValidation:good},exampleRepo,'Architect');
 assert.equal(approved.companionId,'nestjs');
 assert.equal(gate.developerAllowed({techStackId:'react',techStackCompanionId:'',techStackApproval:approved}),false);
 assert.throws(()=>gate.evidence({stackId:'react',companionId:'nestjs',repo:exampleRepo,results:[...resultSet('apps/web'),...resultSet('services/api').slice(0,2)]}),/Every application target/);
});

test('Project persists stack approval; changing stack invalidates both test evidence and approval',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v172-'));
 try{
  const registry=new ProjectRegistry(workspace);await registry.create({id:'team',name:'Team'});
  let item=await registry.read('team');
  item=await registry.update('team',{...item,techStackId:'react'});
  const repo={...exampleRepo,sha:'a'.repeat(40)};
  const tested=gate.evidence({stackId:'react',repo,results:resultSet('').map(row=>({...row,head:repo.sha}))});
  item=await registry.update('team',{...item,techStackPrepared:{stackId:'react',companionId:'',root:exampleRepo.root,branch:'bootstrap/react-initial',sha:'a'.repeat(40)},techStackValidation:tested});
  item=await registry.update('team',{...item,techStackServerVerification:{status:'verified',stackId:'react',companionId:'',root:exampleRepo.root,branch:'bootstrap/react-initial',sha:'a'.repeat(40),at:'2026-11-05T12:00:00Z'}});
  item=await registry.update('team',{...item,techStackApproval:gate.approval(item,repo,'Solution Architect')});
  const reloaded=await registry.read('team');
  assert.equal(gate.developerAllowed(reloaded),true);
  item=await registry.update('team',{...reloaded,name:'Renamed'});
  assert.equal(gate.developerAllowed(item),true);
  item=await registry.update('team',{...item,techStackId:'nestjs'});
  assert.equal(item.techStackValidation,null);assert.equal(item.techStackApproval,null);
  assert.equal(gate.developerAllowed(await registry.read('team')),false);
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});

test('Delete always routes to Delete Everywhere: no local-only button or live local-only handler',async()=>{
 const ui=await fs.readFile(path.join(root,'media/start.js'),'utf8');
 const host=await fs.readFile(path.join(root,'test/generated/extension-source.txt'),'utf8');
 const archived=ui.slice(ui.indexOf('function renderArchivedSources()'),ui.indexOf('function renderSourceDocuments()'));
 const active=ui.slice(ui.indexOf('function renderSourceDocuments()'),ui.indexOf('function renderSourceSelection()'));
 const completed=ui.slice(ui.indexOf('function appendSnapshot('),ui.indexOf('function renderCompletedBusinessRequirements(')>0?ui.indexOf('function renderCompletedBusinessRequirements('):ui.indexOf('function renderStart'));
 assert.doesNotMatch(archived,/target:'archived-source'/);assert.match(archived,/root\.replaceChildren\(\)/);
 assert.match(active,/target:'active-source'/);
 assert.match(ui,/target:'br',brId:group\.id/);
 for(const cmd of ['forceDeleteArchivedDiscoverySource','forceDeletePublishedBR','deleteUploadedDiscoverySource']){
  assert.doesNotMatch(ui,new RegExp('send\\(\\\''+cmd+'\\\''));
  assert.match(host,new RegExp("case '"+cmd+"':throw Error\\('Delete now means Delete Everywhere"));
 }
 assert.match(host,/DELETE EVERYWHERE/);
 assert.match(host,/remoteBRDeletion\.execute/);
});

test('unpublished BR with no Jira mapping can be preflighted, but published BR with missing trusted mapping is blocked',()=>{
 const config={get(k){return {'jira.projectKey':'TC','jira.baseUrl':'https://test.atlassian.net','jira.email':'test@example.com','confluence.spaceId':'123','confluence.spaceKey':'TCC','confluence.baseUrl':'https://test.atlassian.net/wiki'}[k];}};
 const state={revision:'r1',brs:[{id:'BR-009'}],synced:{},pending:{},completedCycles:[]};
 assert.deepEqual(remote.getJiraRows(state,['BR-009'],config),[]);
 state.completedCycles=[{requirements:[{id:'BR-009',jiraKey:'TC-200',jiraIssues:[{key:'TC-200'}]}]}];
 assert.throws(()=>remote.getJiraRows(state,['BR-009'],config),/trusted mapping|reconcile/i);
});

test('Solution Architect bootstrap remains visible despite progress-only layout',async()=>{
 const css=await fs.readFile(path.join(root,'media/start.css'),'utf8');
 const host=await fs.readFile(path.join(root,'test/generated/extension-source.txt'),'utf8');
 assert.match(css,/#workView\.role-progress-only > :not\(\.role-overview\):not\(#architectBootstrap\)/);
 assert.match(css,/#workView\.role-progress-only > #architectBootstrap:not\(\.hidden\)\{display:block!important\}/);
 assert.match(host,/id="architectStackSelect"/);
 assert.doesNotMatch(host,/id="architectTestStack"/);
 assert.match(host,/id="architectApproveStack"/);
});
