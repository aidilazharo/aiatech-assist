'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {sendAiText}=require('../src/ai-models');
test('Change Proposals and Change Impact start collapsed and retain expandable summaries',()=>{
 const html=read('test/generated/extension-source.txt');
 for(const cls of ['change-proposal-panel','trace-impact-panel']){
  const open=new RegExp(`<details class="${cls}"[^>]*><summary class="section-title atgv-collapsible-title">`);
  assert.match(html,open);
  assert.doesNotMatch(html,new RegExp(`<details class="${cls}"[^>]*\\sopen(?:\\s|>)`));
 }
 assert.match(read('media/start.css'),/\.atgv-collapsible-title:focus-visible|\.atgv-collapsible-title/);
});
test('AI Review uses header buttons with Stop and Skip and no second confirmation button',()=>{
 const html=read('test/generated/extension-source.txt');const js=read('media/start.js');
 assert.match(html,/<button id="discoveryCopilot"[^>]*>Run AI Review<\/button>/);
 assert.match(html,/<button id="baReviewSkip"[^>]*>Skip AI Review<\/button>/);
 assert.doesNotMatch(html,/name="baReviewChoice"|id="discoverySkipReview"|Confirm Skip AI Review/);
 assert.match(js,/running\?'Stop AI Review':\(reviewStopReason\|\|reviewCurrent\)\?'Re-run AI Review':'Run AI Review'/);
 assert.match(js,/send\('stopDiscoveryReview'\)/);
 assert.match(js,/send\('skipDiscoveryReview'\)/);
 assert.match(js,/ba-review-skipped/);
 assert.match(html,/case 'skipDiscoveryReview':\{[\s\S]*?running\.controller\.abort\(\)/);
 assert.doesNotMatch(html,/Continue without AI Review\?/);
});
test('Cancelled AI HTTP generation passes abort signal and refuses response',async()=>{
 const controller=new AbortController();let observed;
 const pending=sendAiText({target:{kind:'ollama',endpoint:'http://localhost:11434',modelId:'test'},prompt:'review',signal:controller.signal,request:async(url,options)=>{
  observed=options.signal;
  await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Stopped'),{name:'AbortError'})),{once:true}));
  return {message:{content:'Ignored'}};
 }});
 assert.equal(observed,controller.signal);controller.abort();
 await assert.rejects(pending,/Stopped/);
});
test('Cancelled VS Code model triggers model cancellation',async()=>{
 const controller=new AbortController();let cancelled=false;
 const vscodeApi={CancellationTokenSource:class {constructor(){this.token={};}cancel(){cancelled=true;}dispose(){}},LanguageModelChatMessage:{User:content=>content}};
 const pending=sendAiText({vscodeApi,target:{kind:'vscode',model:{sendRequest:async()=>{await new Promise(resolve=>setImmediate(resolve));return {text:(async function*(){yield 'draft';})()};}}},prompt:'review',signal:controller.signal});
 controller.abort();await assert.rejects(pending,/stopped/i);assert.equal(cancelled,true);
});
