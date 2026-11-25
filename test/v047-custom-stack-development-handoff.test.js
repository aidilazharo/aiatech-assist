'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const gate=require('../src/architect-stack-approval');
const handoff=require('../src/architect-custom-handoff');
const projects=require('../src/projects');
const root=path.resolve('/tmp/atgv-custom-handoff-fixture');
const sha='a'.repeat(40),other='b'.repeat(40),branch='fix/atgv-custom-stack-1ac09a4b85';
const frontend={relative:'ReactTS_Frontend',kind:'npm',framework:'React / Vite',role:'frontend',runnable:true,mockable:true,scripts:['dev','test','build']};
const backend={relative:'NestJS_Backend',kind:'npm',framework:'NestJS',role:'backend',runnable:true,mockApi:true,scripts:['start:dev','test','build']};
function state(){
 const preview={status:'verified',stackId:'custom',root,branch,sha,relative:frontend.relative,
  url:'http://127.0.0.1:5173/',mockOnly:true,at:'2026-11-22T00:00:00.000Z'};
 return {name:'Example',id:'example',techStackId:'custom',techStackCompanionId:'',
  techStackPrepared:{stackId:'custom',root,sha,branch,remotePushed:false,
   previewUrl:preview.url,at:preview.at},
  techStackCustomPreview:preview,techStackValidation:null,techStackApproval:null};
}
function inspection(){return {root,sha,branch,clean:true,targets:[frontend,backend]};}
function driver(){
 const calls=[],checks=[];
 const d={
  localLogs:()=>({running:true,mockPreview:true,head:sha,cwd:path.join(root,frontend.relative),
    relative:frontend.relative,previewUrl:'http://127.0.0.1:5173/'}),
  inspectScripts:async()=>({repo:{root,sha,clean:true},targets:[frontend,backend]}),
  executeLocal:async(_root,{relative,operation})=>{calls.push([relative,operation]);return {passed:true,operation,relative,head:sha,at:'2026-11-22T00:01:00.000Z'};}
 };
 const deps={ensureForTarget:async(_root,target)=>{checks.push(target.relative);}};
 const scanner={scan:async()=>inspection()};
 const http=async()=>({ok:true,status:200,headers:{get:()=>null}});
 return {d,calls,checks,deps,scanner,http};
}
test('ATGV stores synthetic preview only against clean local fix branch and same SHA',()=>{
 const evidence=handoff.previewEvidence(root,{running:true,mockPreview:true,mockDatabase:true,
  sha,branch,relative:frontend.relative,url:'http://127.0.0.1:5173/',inspection:inspection()});
 assert.equal(evidence.mockOnly,true);
 assert.equal(evidence.sha,sha);
 assert.equal(handoff.matches(state()),true);
 for(const corrupt of [
  {branch:'main'},
  {sha:other},
  {clean:false}
 ]){
  const changed={...inspection(),...corrupt};
  assert.throws(()=>handoff.previewEvidence(root,{running:true,mockPreview:true,mockDatabase:true,
   sha,branch,relative:frontend.relative,url:'http://127.0.0.1:5173/',inspection:changed}),/clean, committed/);
 }
 assert.throws(()=>handoff.previewEvidence(root,{running:true,mockPreview:false,mockDatabase:true,
  sha,branch,relative:frontend.relative,url:'http://127.0.0.1:5173/',inspection:inspection()}),/synthetic preview/);
});
test('ProjectRegistry round-trips only SHA-bound Custom Stack metadata, not production server evidence',()=>{
 const p=projects.normalizeProjectInput(state());
 assert.equal(p.techStackPrepared.branch,branch);
 assert.equal(p.techStackCustomPreview.mockOnly,true);
 assert.equal(p.techStackCustomPreview.url,'http://127.0.0.1:5173/');
 assert.equal(p.techStackServerVerification,null);
 assert.equal(projects.normalizeProjectInput({...p,techStackCustomPreview:{...p.techStackCustomPreview,sha:other}},p).techStackCustomPreview,null);
 assert.equal(projects.normalizeProjectInput({...p,techStackId:'react'},p).techStackCustomPreview,null);
});
test('Custom Stack handoff executes real test and build for every runnable app',async()=>{
 const fixture=driver();
 const validation=await handoff.validate(root,{project:state(),driver:fixture.d,deps:fixture.deps,
  scanner:fixture.scanner,http:fixture.http});
 assert.equal(validation.status,'tested');
 assert.equal(validation.scope,'development-mock');
 assert.deepEqual(fixture.calls,[
  ['ReactTS_Frontend','test'],['ReactTS_Frontend','build'],
  ['NestJS_Backend','test'],['NestJS_Backend','build']
 ]);
 assert.deepEqual(fixture.checks,['ReactTS_Frontend','NestJS_Backend']);
 const remote={branch:'tech-stack/custom-v1',sha,remoteVerified:true};
 const signature=handoff.approval(state(),validation,'verified-architect',remote);
 const approved={...state(),techStackPrepared:{...state().techStackPrepared,remotePushed:true},
  techStackValidation:validation,techStackApproval:signature};
 assert.equal(gate.developerAllowed(approved),true);
 assert.equal(gate.requireDeveloperApproval(approved).scope,'development-mock');
 assert.equal(signature.synthetic,true);
 assert.equal(signature.remoteSha,sha);
 assert.equal(signature.limitations.length,3);
 for(const variant of [
  {...approved,techStackPrepared:{...approved.techStackPrepared,remotePushed:false}},
  {...approved,techStackApproval:{...signature,remoteVerified:false}},
  {...approved,techStackApproval:{...signature,sha:other}},
  {...approved,techStackValidation:{...validation,sha:other}},
  {...approved,techStackCustomPreview:{...approved.techStackCustomPreview,sha:other}}
 ])assert.equal(gate.developerAllowed(variant),false);
});
test('Mock preview only cannot approve; stale server or missing backend build blocks before push',async()=>{
 const p=state(),fixture=driver();
 assert.equal(gate.developerAllowed(p),false);
 assert.throws(()=>handoff.approval(p,null,'actor',{sha,branch,remoteVerified:true}),/full Custom Stack/);
 const stopped={...fixture.d,localLogs:()=>({running:false})};
 await assert.rejects(()=>handoff.validate(root,{project:p,driver:stopped,deps:fixture.deps,
  scanner:fixture.scanner,http:fixture.http}),/not running/);
 const brokenScanner={scan:async()=>({...inspection(),targets:[frontend,{...backend,scripts:['start:dev','test']}]})};
 await assert.rejects(()=>handoff.validate(root,{project:p,driver:fixture.d,deps:fixture.deps,
  scanner:brokenScanner,http:fixture.http}),/must provide both test and build/);
 const bad={...fixture.d,executeLocal:async()=>({passed:false,head:sha,logs:'Test suite failed'})};
 await assert.rejects(()=>handoff.validate(root,{project:p,driver:bad,deps:fixture.deps,
  scanner:fixture.scanner,http:fixture.http}),/Test suite failed/);
 assert.throws(()=>handoff.approval(p,{status:'tested',scope:'development-mock',stackId:'custom',
  root,sha,branch,previewUrl:p.techStackCustomPreview.url,targets:[frontend],results:[]},
  'architect',{remoteVerified:true,branch:'tech-stack/custom-v1',sha}),/full Custom Stack/);
});
test('dirty main mock preview permits approval of committed baseline only',async()=>{
 const fixture=driver(),snapshot={...inspection(),branch:'main',clean:false};
 const preview=handoff.localPreviewEvidence(root,{running:true,mockPreview:true,mockDatabase:true,
  sha,branch:'main',relative:frontend.relative,frontendUrl:'http://127.0.0.1:5173/',inspection:snapshot});
 const p=projects.normalizeProjectInput({...state(),techStackPrepared:{...state().techStackPrepared,branch:'main'},
  techStackCustomPreview:preview});
 assert.equal(p.techStackPrepared.branch,'main');assert.equal(p.techStackCustomPreview.status,'local-preview-only');
 assert.equal(p.techStackCustomPreview.localChangesPreserved,true);assert.equal(handoff.matches(p),true);
 const options={project:p,driver:fixture.d,scanner:{scan:async()=>snapshot},http:fixture.http};
 const validation=await handoff.prepareHandoff(root,options);
 assert.equal(validation.status,'baseline-only');assert.deepEqual(validation.results,[]);
 const remote={branch:'tech-stack/custom-v1',sha,remoteVerified:true};
 const signature=handoff.approval(p,validation,'architect',remote);
 assert.equal(signature.previewStatus,'unverified');assert.equal(signature.testStatus,'unverified');
 assert.equal(gate.developerAllowed({...p,techStackPrepared:{...p.techStackPrepared,remotePushed:true},
  techStackValidation:validation,techStackApproval:signature}),true);
 assert.throws(()=>handoff.approval(p,{...validation,status:'preview-verified'},'architect',remote),/full Custom Stack/);
 await assert.rejects(()=>handoff.prepareHandoff(root,{...options,scanner:{scan:async()=>({...snapshot,sha:other})}}),/revision changed/);
 await assert.rejects(()=>handoff.prepareHandoff(root,{...options,driver:{...fixture.d,localLogs:()=>({running:false})}}),/no longer running/);
 assert.equal(projects.normalizeProjectInput({...p,techStackCustomPreview:{...preview,sha:other}},p).techStackCustomPreview,null);
});
test('Host and UI expose a distinct consent-gated custom handoff while catalog gate remains intact',()=>{
 const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const code=host.slice(host.indexOf("case 'architectApproveCustomStack':{"),host.indexOf("case 'architectApproveStack':{"));
 assert.ok(code.startsWith("case 'architectApproveCustomStack':{"));
 assert.match(code,/handoff\.prepareHandoff\(root/);
 assert.match(code,/publishApprovedStack/);
 assert.match(code,/Approve Development Handoff/);
 assert.match(code,/No force-push or merge to main/);
 assert.match(code,/techStackValidation:validation,techStackApproval:signoff/);
 assert.match(host,/const preview=eligible\?handoff\.previewEvidence\(root,result\):localEligible\?handoff\.localPreviewEvidence/);
 assert.match(ui,/architectBegin\(custom\?'architectApproveCustomStack':'architectApproveStack'/);
 assert.match(ui,/handoff\.disabled=architectActionBusy\|\|!mockReady\|\|handedOff/);
 assert.match(ui,/m\.type==='architectCustomHandoffProgress'/);
});
test('Global header waveform remains role-independent across all 18 SDLC roles',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../media/atgv-mywork-ai.css'),'utf8');
 const wave=fs.readFileSync(path.join(__dirname,'../media/atgv-mywork-wave-chat.js'),'utf8');
 const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const roles=[...require('../src/sdlc-work').ROLES,...require('../src/sdlc-catalog').OPTIONAL_ROLES];
 assert.equal(roles.length,18);
 assert.match(wave,/document\.body\.classList\.toggle\('atgv-global-ai-active',next\)/);
 assert.match(css,/body\.atgv-global-ai-active:not\(\.gate-mode\) #appHeader/);
 assert.match(host,/const aiAnswer=async\(target,prompt,maxChars,options=\{\}\)=>/);
 assert.doesNotMatch(wave,/globalAiActive&&selectedRole/);
});
