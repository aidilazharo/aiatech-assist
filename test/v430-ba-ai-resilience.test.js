'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const preflight=require('../src/ba-document-preflight');

test('Uploaded documents count pill replaces green progress track',()=>{
 assert.doesNotMatch(html,/id="sourceCapacityProgress(?:Fill)?"/);
 assert.match(html,/id="sourceDocumentCount"/);
 assert.doesNotMatch(ui,/sourceCapacityProgressFill/);
});

test('missing BA policies receive only provisional, evidence-conscious guidance',()=>{
 const issues=[
  {category:'ambiguity',severity:'warning',detail:'The document does not provide measurable acceptance criteria for project initiation and approval.'},
  {category:'ambiguity',severity:'warning',detail:'RBAC roles, permissions, and authorization precedence are undefined.'},
  {category:'ambiguity',severity:'warning',detail:'The document does not specify audit records for project approval.'}
 ];
 const source='Project initiation and project approval are in scope.';
 const result=preflight.parse(JSON.stringify({status:'needs-input',summary:'Review details',edits:[],issues}),source);
 assert.equal(result.ready,true);
 assert.equal(result.effectiveText,source);
 for(const kind of ['acceptance','rbac','audit'])assert.ok(result.resolutions.some(x=>x.category===kind&&x.provisional===true),kind);
 assert.ok(result.resolutions.every(x=>/propos|draft|open|source|decision|policy/i.test(x.resolution)));
 assert.equal(preflight.industryStandardResolution({category:'contradiction',detail:'RBAC permission rules conflict for approvers.'}),null);
 assert.equal(preflight.industryStandardResolution({category:'contradiction',detail:'The BR contradicts retention obligations.'}),null);
});

test('timeout on one AI request does not abort the parent mapping run',async()=>{
 const a=host.indexOf('function recoverableSourceAIError(');
 const b=host.indexOf('async function processSelectedDiscoverySources(',a);
 assert.ok(a>0&&b>a);
 const context={AbortController,Promise,Error,setTimeout,clearTimeout,
  SOURCE_PREFLIGHT_AI_TIMEOUT_MS:25,SOURCE_MAPPING_AI_TIMEOUT_MS:25,
  aiAnswer:async()=>new Promise(()=>{})};
 vm.createContext(context);
 vm.runInContext(host.slice(a,b)+'\nthis.requestAI=requestSourceAI;this.recoverable=recoverableSourceAIError;this.fallback=trySourceAIFallback;',context);
 const parent=new AbortController(),run={controller:parent,recoveryTarget:null,useRecovery:false};
 await assert.rejects(()=>context.requestAI({kind:'vscode'},'Prompt',run,{maxChars:200,timeoutMs:12}),/timed out/);
 assert.equal(parent.signal.aborted,false,'global mapping run must remain active');
 assert.equal(context.recoverable({code:'ATGV_SOURCE_AI_TIMEOUT'}),true);
 assert.equal(context.recoverable({message:'Invalid JSON'}),true);
 assert.equal(context.recoverable({message:'Invalid project permissions'}),false);
});

test('Copilot rescue is opt-in, uses installed SDK and can return to selected provider',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.contributes.configuration.properties['atgvAssist.ai.useCopilotSdkForBaRecovery'].default,false);
 assert.match(host,/cfg\(\)\.get\('ai\.useCopilotSdkForBaRecovery',false\)/);
 assert.match(host,/copilotRepairSdk\.installed\(context\.globalStorageUri\.fsPath\)/);
 assert.match(host,/kind:'copilot-sdk',name:'Copilot SDK recovery'/);
 const context={};
 vm.createContext(context);
 const start=host.indexOf('function recoverableSourceAIError('),end=host.indexOf('async function requestSourceAI(',start);
 vm.runInContext(host.slice(start,end)+'\nthis.recover=trySourceAIFallback;',context);
 const run={useRecovery:false,recoveryTarget:{kind:'copilot-sdk'}};
 assert.equal(context.recover(run,{code:'ATGV_SOURCE_AI_TIMEOUT'}),true);
 assert.equal(run.useRecovery,true);
 assert.equal(context.recover(run,{message:'Copilot authentication unavailable'}),true);
 assert.equal(run.useRecovery,false);
 assert.equal(run.recoveryTarget,null);
});

test('real BA conflicts still require human decision, without falsely claiming tests passed',()=>{
 const result=preflight.parse(JSON.stringify({status:'needs-input',edits:[],issues:[
  {severity:'blocker',category:'contradiction',detail:'The same approver is both explicitly prohibited and required from approving the identical request.'}
 ]}),'Approve or reject project initiation.');
 assert.equal(result.ready,false);
 assert.ok(result.blockers.length);
 assert.match(host,/ATGV_BUSINESS_CONFLICT/);
 assert.match(host,/Saved section mappings remain available for Resume AI Mapping/);
});
