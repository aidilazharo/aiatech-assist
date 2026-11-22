'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {ProjectRegistry}=require('../src/projects');
const flow=require('../src/br-workflow');
const remote=require('../src/remote-br-deletion');
const root=path.join(__dirname,'..');
const host=fsSync.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
const ui=fsSync.readFileSync(path.join(root,'media/start.js'),'utf8');
const hash=n=>String(n).repeat(64);
const source=(n,name)=>({name,digest:hash(n),storedName:hash(n)+'.pdf',byteDigest:hash(n)});
async function project(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-cycle-delete-'));
 try{const registry=new ProjectRegistry(dir);await registry.create({id:'demo',name:'Demo'});return await fn({registry,dir});}
 finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('force deleting an empty cycle does not resurrect archived sources or remove historic BRs',()=>project(async({registry})=>{
 let state=await flow.load(registry,'demo');
 state=await flow.addSources(registry,'demo',state.revision,[source('a','old.pdf')]);
 state=await flow.write(registry,'demo',state.revision,next=>{
  next.brs=[{id:'BR-001',title:'Historic',status:'approved',approvedContent:{title:'Historic'}}];
  next.synced={'BR-001':{key:'TC-100'}};
 });
 state=await flow.startOrRestart(registry,'demo',state.revision,{actor:'BA'});
 assert.equal(state.sourceDocuments.length,0);assert.equal(state.archivedSources.length,1);
 state=await flow.forceDeleteInProgressCycle(registry,'demo',state.revision,{actor:'BA',expectedBrIds:[],expectedSourceDigests:[],expectedJiraKeys:[]});
 const reload=await flow.load(registry,'demo');
 assert.equal(reload.sourceDocuments.length,0);assert.equal(reload.restartPending,false);assert.equal(reload.restartRecovery,null);
 assert.equal(reload.archivedSources.length,1);assert.equal(reload.brs[0].id,'BR-001');assert.equal(reload.synced['BR-001'].key,'TC-100');
}));
test('force deletion removes all current BRs and sources while retaining historical shared evidence',()=>project(async({registry})=>{
 let state=await flow.load(registry,'demo');
 state=await flow.write(registry,'demo',state.revision,next=>{
  next.sourceDocuments=[source('a','shared.pdf'),source('b','new.pdf')];next.restartPending=true;
  next.brs=[
   {id:'BR-001',title:'Draft 1',status:'draft',evidence:[{digest:hash('a'),verified:true}]},
   {id:'BR-002',title:'Draft 2',status:'draft',evidence:[{digest:hash('b'),verified:true}]},
   {id:'BR-003',title:'Previous',status:'approved',archivedFromRestart:true,approvedContent:{title:'Previous'},evidence:[{digest:hash('a'),verified:true}]}
  ];
  next.synced={'BR-001':{key:'TC-101'},'BR-002':{key:'TC-102'},'BR-003':{key:'TC-103'}};
  next.jiraWorkHistory={'TC-101':{status:'Open'},'TC-102':{status:'Open'},'TC-103':{status:'Done'}};
  next.discoveryAnswers={problem:'old current-cycle answer'};
 });
 const impact=flow.inProgressDeletionImpact(state);
 assert.deepEqual(impact.requirements.map(x=>x.id),['BR-001','BR-002']);
 assert.equal(impact.sources.find(x=>x.digest===hash('a')).shared,true);
 assert.equal(impact.sources.find(x=>x.digest===hash('b')).shared,false);
 const updated=await flow.forceDeleteInProgressCycle(registry,'demo',state.revision,{actor:'BA',expectedBrIds:['BR-001','BR-002'],expectedSourceDigests:[hash('a'),hash('b')],expectedJiraKeys:['TC-101','TC-102'],remoteDeletionJobId:'11111111-1111-1111-1111-111111111111'});
 assert.deepEqual(updated.brs.map(x=>x.id),['BR-003']);assert.equal(updated.sourceDocuments.length,0);
 assert.deepEqual(updated.archivedSources.map(x=>x.digest),[hash('a')]);
 assert.equal(updated.synced['BR-003'].key,'TC-103');assert.equal(updated.synced['BR-001'],undefined);
 assert.equal(updated.jiraWorkHistory['TC-101'],undefined);assert.equal(updated.jiraWorkHistory['TC-103'].status,'Done');
 assert.equal(updated.restartPending,false);assert.deepEqual(updated.discoveryAnswers,{});
}));
test('stale scope or pending Jira operations cannot be forced past verification',()=>project(async({registry})=>{
 let state=await flow.load(registry,'demo');
 state=await flow.write(registry,'demo',state.revision,next=>{
  next.sourceDocuments=[source('a','a.pdf')];next.restartPending=true;
  next.brs=[{id:'BR-001',title:'Draft',status:'draft'}];next.pending={'BR-001/F-1':{action:'create'}};
 });
 assert.throws(()=>remote.assertRegister(state,['BR-001']),/Pending Jira/);
 await assert.rejects(flow.forceDeleteInProgressCycle(registry,'demo',state.revision,{expectedBrIds:[],expectedSourceDigests:[hash('a')],expectedJiraKeys:[]}),/scope|changed/i);
 await assert.rejects(flow.forceDeleteInProgressCycle(registry,'demo',state.revision,{expectedBrIds:['BR-001'],expectedSourceDigests:[hash('a')],expectedJiraKeys:[]}),/pending/i);
 const after=await flow.load(registry,'demo');assert.equal(after.revision,state.revision);assert.equal(after.brs.length,1);
}));
test('old registers without a sourceDocuments field still restore legacy source history',()=>project(async({registry})=>{
 let state=await flow.load(registry,'demo');
 state=await flow.write(registry,'demo',state.revision,next=>{next.importEpoch=1;next.sourceHistory=[{action:'sources-selected',documents:[source('b','legacy.pdf')]}];});
 const file=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','br-register.json');
 const raw=JSON.parse(await fs.readFile(file,'utf8'));delete raw.sourceDocuments;await fs.writeFile(file,JSON.stringify(raw));
 assert.equal((await flow.load(registry,'demo')).sourceDocuments[0].name,'legacy.pdf');
}));
test('the empty-cycle Delete Everywhere path works without a live Jira identity',()=>project(async({registry})=>{
 let state=await flow.load(registry,'demo');state=await flow.startOrRestart(registry,'demo',state.revision,{actor:'BA'});
 const events=[],notices=[],updates=[];
 const context={
  requireOpened(){},remoteBRDeletionBusy:false,activeProject:{id:'demo'},registry,
  requireBAOwner:async()=>({actor:'local-ba'}),requireVerifiedBRDeletionOwner:async ids=>{assert.equal(ids.length,0);},
  verifiedBAActor:async()=>{throw Error('Should not require online identity for empty cycle');},
  uiWarning:async(_text,_opts,action)=>action,
  dashboard:{webview:{postMessage:async message=>events.push(message)}},
  brWorkflow:flow,remoteBRDeletion:remote,
  context:{workspaceState:{update:async(key,value)=>updates.push({key,value})}},
  discovery:{load:async()=>({revision:'D1'}),save:async()=>({answers:{},revision:'D2'})},
  documentPreflightSessions:new Map(),refreshDashboard:async()=>{},report(){},notice:async message=>notices.push(message)
 };
 const begin=host.indexOf('async function deleteBREverywhere('),end=host.indexOf('/** Reconcile saved HTTP 404',begin);
 assert.ok(begin>0&&end>begin);
 vm.createContext(context);vm.runInContext(host.slice(begin,end),context);
 await context.deleteBREverywhere({target:'in-progress',revision:state.revision});
 assert.equal((await flow.load(registry,'demo')).restartPending,false);
 assert.ok(events.some(row=>row.type==='brDeletedEverywhere'&&row.target==='in-progress'));
 assert.ok(events.some(row=>row.type==='brDeletionProgress'&&row.phase==='completed'));
 assert.match(notices[0],/deleted/i);assert.equal(updates[0].value.length,0);
}));
test('the Start card sends all in-progress work to the unified deletion path',()=>{
 const begin=ui.indexOf("$('baDeleteIncomplete').addEventListener('click'"),end=ui.indexOf('// v0.1.21:',begin);
 let click;const sent=[];const button={disabled:false,addEventListener(_event,fn){click=fn;}};
 const context={$:()=>button,brState:{revision:'R1',sourceDocuments:[],brs:[],restartPending:true},activeId:'demo',requestBRDeletion:value=>sent.push(value)};
 vm.runInNewContext(ui.slice(begin,end),context);click();
 assert.equal(sent.length,1);assert.equal(sent[0].target,'in-progress');assert.equal(sent[0].revision,'R1');
});
test('force deletion handles multiple current drafts and reports incomplete cleanup',()=>project(async({registry})=>{
 let state=await flow.load(registry,'demo');
 state=await flow.write(registry,'demo',state.revision,next=>{
  next.sourceDocuments=[source('a','draft.pdf')];next.restartPending=true;
  next.brs=[{id:'BR-001',title:'Draft 1',status:'draft'},{id:'BR-002',title:'Draft 2',status:'draft'}];
 });
 const events=[],notices=[];
 const context={
  requireOpened(){},remoteBRDeletionBusy:false,activeProject:{id:'demo'},registry,path,
  requireBAOwner:async()=>({actor:'ba'}),requireVerifiedBRDeletionOwner:async()=>{},verifiedBAActor:async()=> 'ba',
  uiWarning:async(_text,_opts,action)=>action,uiInput:async({placeHolder})=>placeHolder,
  dashboard:{webview:{postMessage:async message=>events.push(message)}},brWorkflow:flow,remoteBRDeletion:remote,
  DocumentSync:class{async read(){return {entries:{}};}},
  brArtifactCleanup:{ownership:()=>({keys:[],stories:[]}),cleanup:async()=>({removed:[]})},
  sourceStore:{removeStored:async()=>{throw Error('Locked file');}},baMappingCheckpoint:{remove:async()=>{}},
  projectEffortRegister:{removeBRTaskEstimates:async()=>{}},aiRoot:()=>'/tmp',
  context:{workspaceState:{update:async()=>{}}},discovery:{load:async()=>({revision:'D1'}),save:async()=>({answers:{},revision:'D2'})},
  documentPreflightSessions:new Map(),refreshDashboard:async()=>{},report(){},notice:async message=>notices.push(message)
 };
 const begin=host.indexOf('async function deleteBREverywhere('),end=host.indexOf('/** Reconcile saved HTTP 404',begin);
 vm.createContext(context);vm.runInContext(host.slice(begin,end),context);
 await context.deleteBREverywhere({target:'in-progress',revision:state.revision});
 const after=await flow.load(registry,'demo');assert.equal(after.brs.length,0);assert.equal(after.sourceDocuments.length,0);
 assert.ok(events.some(row=>row.type==='brDeletionProgress'&&row.phase==='failed'&&/Locked file/.test(row.message)));
 assert.match(notices[0],/Cleanup needs attention/);
}));
