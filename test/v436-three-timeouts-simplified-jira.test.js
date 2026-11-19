'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const simple=require('../src/ba-timeout-simplified');
const recovery=require('../src/ba-large-document-recovery');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
test('never prompt before three actual timeouts and do not count other errors',async()=>{
 const run={controller:new AbortController()},prompts=[];
 const ask=async p=>{prompts.push(p);return true;};
 assert.equal(await simple.registerTimeout(run,Error('Network is down'),ask),false);
 assert.equal(run.aiTimeoutFailures,undefined);
 for(let i=1;i<=2;i++)assert.equal(await simple.registerTimeout(run,{code:'ATGV_SOURCE_AI_TIMEOUT'},ask),false);
 assert.equal(prompts.length,0);
 assert.equal(await simple.registerTimeout(run,{code:'ATGV_SOURCE_AI_TIMEOUT'},ask),true);
 assert.equal(prompts.length,1);
 assert.equal(prompts[0].failures,3);
 assert.match(prompts[0].message,/BA approval and Jira safeguards/);
 assert.equal(await simple.registerTimeout(run,{code:'ATGV_SOURCE_AI_TIMEOUT'},ask),true);
 assert.equal(prompts.length,1);
});
test('declining skip keeps QA gates; only one prompt occurs per run',async()=>{
 const run={controller:new AbortController()},calls=[];
 for(let i=0;i<5;i++)await simple.registerTimeout(run,{code:'ATGV_SOURCE_AI_TIMEOUT'},async p=>{calls.push(p);return false;});
 assert.equal(run.skipAiChecks,undefined);
 assert.equal(calls.length,1);
});
test('user cancellation does not trigger skip prompt',async()=>{
 const controller=new AbortController();controller.abort();
 const run={controller},calls=[];
 assert.equal(await simple.registerTimeout(run,{code:'ATGV_SOURCE_AI_TIMEOUT'},async x=>{calls.push(x);return true;}),false);
 assert.equal(calls.length,0);
});
test('only simplified opted-in preflight evidence activates source-only BR drafts',()=>{
 assert.equal(simple.isSimplifiedEvidence({mappingCompleted:{preflights:[{summary:simple.MARKER+'; BA review'}]}}),true);
 assert.equal(simple.isSimplifiedEvidence({mappingCompleted:{preflights:[{summary:'AI timed out and recovered without user opt-in'}]}}),false);
});
test('simple proposal uses literal source evidence; no claimed AI testing and no Jira autopublish',()=>{
 const text=['GATE requirements','GATE-FR-001 The project requester shall create the initiation form.',
  'GATE-FR-002 Only a valid project approver shall approve the request.',
  'GATE-FR-003 The application shall record an audit event.'].join('\n');
 const out=simple.simpleProposal({name:'GATE-BRD.docx',text});
 assert.equal(out.length,1);
 assert.match(out[0].title,/simplified review draft/);
 assert.match(out[0].acceptanceCriteria,/NOT VERIFIED/);
 assert.match(out[0].acceptanceCriteria,/No project or integration tests/);
 assert.ok(out[0].features[0].stories.length>=3);
 assert.ok(out[0].features[0].stories.some(x=>x.description.includes('GATE-FR-002')));
 assert.ok(out[0].features[0].stories.every(x=>x.tasks.length===1));
 assert.throws(()=>simple.simpleProposal({name:'bad',text:'Hello'}),/No identifiable source requirements/);
});
test('runtime includes explicit opt-in recovery but never bypasses BR approval and Jira publish gates',()=>{
 assert.match(host,/baTimeoutSimplified\.registerTimeout/);
 assert.match(host,/run\.skipAiChecks/);
 assert.match(host,/baTimeoutSimplified\.isSimplifiedEvidence\(register\)/);
 assert.match(host,/if\(!review\.skipped\)throw Error/);
 assert.match(host,/brWorkflow\.generated\(registry,activeProject\.id,register\.revision/);
 assert.match(host,/Create Simple Draft/);
 assert.match(host,/no tests were run/i);
 assert.match(host,/Publish Jira/);
 assert.equal(recovery.attempts('mapping',true,false),3);
});
