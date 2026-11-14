'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const server=require('../src/architect-server');
const reconciliation=require('../src/architect-server-verification');
const gate=require('../src/architect-stack-approval');
const html=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const sha='f'.repeat(40),root=path.resolve('/tmp/atgv246-project'),branch='bootstrap/react-reset-1';
function fakeDriver({live=true,shaValue=sha,branchValue=branch}={}){
 return {catalogStackConfig:async()=>({previewUrl:'http://127.0.0.1:5173/'}),inspectScripts:async()=>({repo:{root,sha:shaValue,branch:branchValue},targets:[{relative:'',scripts:['dev']}]}),localLogs:()=>({running:live,cwd:root})};
}
const project={techStackId:'react',techStackCompanionId:'',techStackPrepared:{root,sha,branch,stackId:'react',companionId:''},techStackValidation:{status:'tested',stackId:'react',companionId:'',sha}};
test('running ATGV-owned healthy application can reconcile absent proof',async()=>{
 const actual=await server.verify({root,stackId:'react',driver:fakeDriver(),effects:{waitForHttp:async(url,check)=>{assert.equal(url,'http://127.0.0.1:5173/');assert.equal(check(),true);}}});
 assert.equal(actual.running,true);assert.equal(actual.healthy,true);assert.equal(actual.sha,sha);assert.equal(actual.branch,branch);
 const proof=reconciliation.evidenceIfHealthy(project,actual);
 assert.ok(proof);assert.equal(gate.serverVerified({...project,techStackServerVerification:proof}),true);
});
test('approval blocks wrong branch, stale commit, stopped process, or failed health',async()=>{
 for(const [driver,healthy] of [[fakeDriver({branchValue:'other'}),true],[fakeDriver({shaValue:'e'.repeat(40)}),true],[fakeDriver({live:false}),false]]){
  const snapshot=await server.verify({root,stackId:'react',driver,effects:{waitForHttp:async()=>{}}});
  assert.equal(snapshot.healthy,healthy);
  assert.equal(reconciliation.evidenceIfHealthy(project,snapshot),null);
 }
 const health=await server.verify({root,stackId:'react',driver:fakeDriver(),effects:{waitForHttp:async()=>{throw Error('HTTP failed');}}});
 assert.equal(health.healthy,false);assert.equal(reconciliation.evidenceIfHealthy(project,health),null);
});
test('circular progress appears above stack selection and animates accessibly',()=>{
 const flow=html.slice(html.indexOf('<div id="architectBootstrap"'),html.indexOf('<div id="architectRequiredComponents"'));
 assert.ok(flow.indexOf('id="architectSaveStage"')<flow.indexOf('id="architectStackSelect"'));
 assert.match(css,/atgvStackCirclePulse/);assert.match(css,/atgvStackCircleCompleted/);assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(ui,/function architectLiveServerReady/);assert.match(ui,/live\.sha===prepared\.sha&&live\.branch===prepared\.branch/);
});
test('host re-verifies server before approval and persists missing proof',()=>{
 const block=html.slice(html.indexOf("case 'architectApproveStack':"),html.indexOf("case 'devCopilotArtifacts':"));
 assert.match(block,/\.verify\(\{root,stackId:project\.techStackId\}\)/);
 assert.match(block,/techStackServerVerification:healthyProof/);
 assert.match(block,/gate\.approval\(verifiedProject/);
});
