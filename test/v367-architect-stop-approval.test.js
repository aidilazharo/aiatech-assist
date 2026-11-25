'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const approval=require('../src/architect-stack-approval');
const verification=require('../src/architect-server-verification');
const root=path.join(__dirname,'..');
const sha='a'.repeat(40),branch='migration/react-catalog-1-1-14-07bbe5e6',dir='/work/tech-cockpit';
function preparedProject(){
 const repo={root:dir,sha,clean:true};
 const results=['test','build','run'].map(operation=>({relative:'',operation,passed:true,head:sha,at:'2026-11-16T00:00:00.000Z'}));
 return {techStackId:'react',techStackCompanionId:'',
  techStackPrepared:{root:dir,branch,sha,stackId:'react',remotePushed:true},
  techStackValidation:approval.evidence({stackId:'react',repo,results})};
}
const live={running:true,healthy:true,sha,branch,url:'http://127.0.0.1:5173/'};
test('a stopped process permits approval only with previous verified HTTP smoke check for the saved SHA',()=>{
 const p=preparedProject();
 const evidence=verification.evidenceIfHealthy(p,live);
 assert.equal(evidence.sha,sha);
 p.techStackServerVerification=evidence;
 const selected=verification.approvalEvidence(p,{running:false,healthy:false,message:'App server stopped'});
 assert.equal(selected.source,'saved');
 assert.deepEqual(selected.proof,evidence);
 const signoff=approval.approval({...p,techStackServerVerification:selected.proof},{root:dir,sha,clean:true},'Architect');
 assert.equal(signoff.status,'approved');
 assert.equal(signoff.sha,sha);
});
test('live server health always takes priority over cached verification',()=>{
 const p=preparedProject();p.techStackServerVerification=verification.evidenceIfHealthy(p,live);
 const selected=verification.approvalEvidence(p,live);
 assert.equal(selected.source,'live');
 for(const state of [
  {...live,healthy:false},
  {...live,sha:'b'.repeat(40)},
  {...live,branch:'other-branch'},
  {...live,url:'https://not-local.example'},
  {running:true,healthy:false,message:'Unmanaged process uses application port'}
 ])assert.throws(()=>verification.approvalEvidence(p,state),/running application is not HTTP healthy/);
});
test('approval refuses a stopped application without matching saved verification',()=>{
 const p=preparedProject();
 assert.throws(()=>verification.approvalEvidence(p,{running:false}),/No successful HTTP smoke verification/);
 const evidence=verification.evidenceIfHealthy(p,live);
 for(const stale of [
  {...p,techStackServerVerification:{...evidence,sha:'b'.repeat(40)}},
  {...p,techStackServerVerification:{...evidence,branch:'main'}},
  {...p,techStackServerVerification:{...evidence,root:'/other/workspace'}},
  {...p,techStackServerVerification:{...evidence,stackId:'angular'}},
  {...p,techStackPrepared:{...p.techStackPrepared,sha:'f'.repeat(40)},techStackServerVerification:evidence},
  {...p,techStackPrepared:{...p.techStackPrepared,remotePushed:false},techStackServerVerification:evidence},
  {...p,techStackValidation:null,techStackServerVerification:evidence}
 ])assert.throws(()=>verification.approvalEvidence(stale,{running:false}),/verif|tested and pushed/i);
});
test('unknown server state cannot silently approve using cached proof',()=>{
 const p=preparedProject();p.techStackServerVerification=verification.evidenceIfHealthy(p,live);
 for(const state of [{},{healthy:false},null])assert.throws(()=>verification.approvalEvidence(p,state),/Unable to determine/);
});
test('host and webview approve the saved revision independently of optional server evidence',()=>{
 const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 const block=host.slice(host.indexOf("case 'architectApproveStack':{"),host.indexOf("case 'devCopilotArtifacts':{"));
 assert.match(ui,/Test and server checks are informational/);
 assert.doesNotMatch(ui,/Restart before approval/);
 assert.match(ui,/const canRequestApproval=!!\(saved&&prepared\?\.remotePushed===true\)/);
 assert.doesNotMatch(block,/approvalEvidence\(project,serverState\)/);
 assert.doesNotMatch(block,/gate\.requireServerVerification/);
 assert.match(block,/gate\.approval\(project,repo,actor\)/);
 assert.match(block,/publishApprovedStack/);
 assert.doesNotMatch(block,/if\(!serverState\.running\|\|!serverState\.healthy\)/);
});
