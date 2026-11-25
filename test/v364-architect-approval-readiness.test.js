'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gate=require('../src/architect-stack-approval');
const bootstrap=require('../src/architect-stack-bootstrap');
const root=path.join(__dirname,'..');

function project(){
 const sha='a'.repeat(40),branch='bootstrap/react-initial',folder='/repo';
 const repo={root:folder,sha,clean:true};
 return {repo,project:{
  techStackId:'react',techStackCompanionId:'',
  techStackPrepared:{root:folder,sha,branch,stackId:'react',remotePushed:true},
  techStackValidation:gate.evidence({stackId:'react',repo,results:['test','build','run'].map(operation=>({relative:'',operation,passed:true,head:sha,at:'2026-11-16T00:00:00Z'}))})
 }};
}
test('approval accepts stopped or mismatched server evidence without claiming verification',()=>{
 const {project:p,repo}=project();
 assert.equal(gate.approval(p,repo,'Architect').serverStatus,'unverified');
 p.techStackServerVerification={status:'verified',stackId:'react',companionId:'',root:repo.root,branch:p.techStackPrepared.branch,sha:'b'.repeat(40),at:'2026-11-16T00:00:00Z'};
 assert.equal(gate.approval(p,repo,'Architect').serverStatus,'unverified');
 p.techStackServerVerification.sha=repo.sha;
 assert.equal(gate.approval(p,repo,'Architect').sha,repo.sha);
});
test('Test & Run selects separate free frontend and API ports',async()=>{
 const occupied=new Set([5173,3001]);
 const ports=await bootstrap.chooseAvailableRuntimePorts('http://127.0.0.1:5173/','http://127.0.0.1:3001/',{
  portAvailable:async url=>!occupied.has(Number(new URL(url).port))
 });
 assert.equal(ports.url,'http://127.0.0.1:5174/');
 assert.equal(ports.apiPort,3002);
});
test('Test & Run actually checks HTTP and API identity before issuing test evidence',()=>{
 const src=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 const start=src.indexOf("case 'architectTestStack':{"),end=src.indexOf("case 'architectServerStatus':{",start);
 assert.ok(start>0&&end>start);
 const code=src.slice(start,end);
 assert.match(code,/chooseAvailableRuntimePorts\(previewConfig\.previewUrl/);
 assert.match(code,/developerGit\.runLocal\(root,\{relative:target\.relative,previewUrl,apiPort:options\.apiPort\}\)/);
 assert.match(code,/await startup\.waitForHttp\(previewUrl\|\|info\.previewUrl/);
 assert.match(code,/const passed=verified\.running===true/);
});
test('approval remains actionable and host checks live state or saved verified SHA',()=>{
 const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 const src=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(ui,/const canRequestApproval=!!\(saved&&prepared\?\.remotePushed===true\)/);
 assert.match(ui,/architectApproveStack'\)\.disabled=architectActionBusy\|\|!canRequestApproval\|\|approved/);
 const code=src.slice(src.indexOf("case 'architectApproveStack':{"),src.indexOf("case 'devCopilotArtifacts':{"));
 assert.doesNotMatch(code,/approvalEvidence\(project,serverState\)/);
 assert.doesNotMatch(code,/if\(!serverState\.running\|\|!serverState\.healthy\)throw Error/);
 assert.doesNotMatch(code,/gate\.requireServerVerification/);
 assert.match(code,/gate\.approval\(project,repo,actor\)/);
 assert.match(code,/publishApprovedStack/);
});
