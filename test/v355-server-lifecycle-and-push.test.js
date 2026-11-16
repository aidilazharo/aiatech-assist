'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const validation=require('../src/architect-server-verification');
const gate=require('../src/architect-stack-approval');
const {describePushFailure}=require('../src/architect-stack-bootstrap');
const root=path.join(__dirname,'..');
const sha='c'.repeat(40), branch='migration/react-catalog-1-1-12-123456789abc';
const project=()=>({id:'project',techStackId:'react',techStackCompanionId:'',
 techStackPrepared:{root:'/sample',branch,sha,stackId:'react',remotePushed:true},
 techStackValidation:{status:'tested',stackId:'react',sha,companionId:''}});
const running={running:true,healthy:true,sha,branch,url:'http://127.0.0.1:5173/'};
test('server readiness remains verified after a deliberate Stop Server for the unchanged SHA',()=>{
 const p=project(),proof=validation.evidenceIfHealthy(p,running);p.techStackServerVerification=proof;
 assert.ok(proof);assert.equal(gate.serverVerified(p),true);
 assert.deepEqual(validation.retainVerifiedEvidence(p,{running:false,message:'App server stopped.'}),proof);
 assert.equal(validation.retainVerifiedEvidence({...p,techStackPrepared:{...p.techStackPrepared,sha:'f'.repeat(40)}},{running:false}),null);
 assert.equal(validation.retainVerifiedEvidence({...p,techStackValidation:null},{running:false}),null);
});
test('auto-start launches only the selected saved/tested revision after Test & Run',async()=>{
 let runningNow=false,started=0;
 const p=project();
 const result=await validation.startAfterSuccessfulTest({project:p,
  verify:async()=>runningNow?running:{running:false,healthy:false},
  start:async()=>{started++;runningNow=true;}});
 assert.equal(started,1);assert.equal(result.started,true);assert.equal(result.proof.sha,sha);
 assert.equal(gate.serverVerified({...p,techStackServerVerification:result.proof}),true);
});
test('auto-start reuses healthy process and never takes over an existing unmanaged one',async()=>{
 let started=0;
 const p=project();
 const reused=await validation.startAfterSuccessfulTest({project:p,verify:async()=>running,start:async()=>{started++;}});
 assert.ok(reused.proof);assert.equal(reused.started,false);
 const occupied=await validation.startAfterSuccessfulTest({project:p,
  verify:async()=>({running:false,otherRunning:true}),start:async()=>{started++;}});
 assert.equal(occupied.proof,null);assert.equal(started,0);
 assert.match(occupied.state.message,/No process was stopped/);
});
test('auto-start refuses mismatched, unpushed, or untested revisions',async()=>{
 let started=0;
 for(const p of [
  {...project(),techStackPrepared:{...project().techStackPrepared,remotePushed:false}},
  {...project(),techStackValidation:{...project().techStackValidation,sha:'e'.repeat(40)}},
  {...project(),techStackValidation:null}
 ]){
  const result=await validation.startAfterSuccessfulTest({project:p,verify:async()=>running,start:async()=>{started++;}});
  assert.equal(result.proof,null);assert.equal(result.started,false);
 }
 assert.equal(started,0);
});
test('rejected Git push reports specific destination and repair guidance, never force-pushes',()=>{
 const access=describePushFailure(Error('remote: HTTP 403 permission denied'),branch,'main');
 assert.match(access.message,/Could not push the verified ATGV branch migration\//);
 assert.match(access.message,/permission/);assert.match(access.message,/main was not modified/);
 const rules=describePushFailure(Error('remote: GH013 repository rule violation'),branch);
 assert.match(rules.message,/organization ruleset/);
 const diverged=describePushFailure(Error('non-fast-forward'),branch);
 assert.match(diverged.message,/never force-push/);
});
test('UI has red Stop Server and persistent pinned-SHA approval readiness',()=>{
 const js=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
 const runtime=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(js,/function architectServerRequirementReady\(project,stackId\)/);
 assert.match(js,/proof\.sha===prepared\.sha&&proof\.branch===prepared\.branch/);
 assert.match(js,/'server','Application server',[^\n]*architectServerRequirementReady\(project,stackId\)/);
 assert.match(js,/\['server','push'\]\.includes\(id\)\?actual/);
 assert.match(js,/toggle\.classList\.toggle\('atgv-stop-server',running\)/);
 assert.match(js,/toggle\.textContent=architectServerBusy\?\(running\?'Stopping Server/);
 assert.match(css,/#workView #architectServerToggle\[data-running="true"\][^\n]*background:#b52636/);
 const stop=runtime.slice(runtime.indexOf("case 'architectStopServer':{"),runtime.indexOf("case 'architectApproveStack':{"));
 assert.doesNotMatch(stop,/techStackServerVerification:null/);
 const status=runtime.slice(runtime.indexOf("case 'architectServerStatus':{"),runtime.indexOf("case 'architectRunServer':{"));
 assert.match(status,/retainVerifiedEvidence/);
 const approve=runtime.slice(runtime.indexOf("case 'architectApproveStack':{"),runtime.indexOf("case 'architectApproveStack':{")+3500);
 assert.match(approve,/approvalEvidence\(project,serverState\)/);
 assert.doesNotMatch(approve,/!serverState\.running\|\|!serverState\.healthy/);
 const tests=runtime.slice(runtime.indexOf("case 'architectTestStack':{"),runtime.indexOf("case 'architectServerStatus':{"));
 assert.match(tests,/startAfterSuccessfulTest/);
});
