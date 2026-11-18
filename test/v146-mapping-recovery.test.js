'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const baDocumentPreflight=require('../src/ba-document-preflight');
const discoveryModule=require('../src/discovery-import');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const html=host;
function mappingHarness(aiAnswer,opts={}){
 const events=[];let commits=0;
 const digest='a'.repeat(64);
 const register={revision:7,sourceDocuments:[{name:'visitor.pdf',digest}]};
 const sandbox={
  AbortController,Map,Set,Error,Array,JSON,Number,Object,String,Date,
  setTimeout:opts.setTimeout||setTimeout,clearTimeout,
  activeDiscoveryMappingRun:null,activeProject:{id:'tc'},registry:{},
  requireOpened(){},async requireBAOwner(){},
  brWorkflow:{async load(){return register;},async commitSourceMapping(_r,_id,revision,changes){
   assert.equal(revision,7);assert.deepEqual([...changes.digests],[digest]);commits++;
   events.push({type:'commit'});return {revision:8,mappingCompleted:{proposals:changes.proposals}};
  }},
  async activeAiTarget(){return {label:'Test model'};},
  async roleSkillPrompt(){return '';},
  sourceStore:{async read(){return {name:'visitor.pdf',text:'Requirements'}}},
  discoveryImport:{...discoveryModule,createMappingPrompt(){return 'Map'},parseMappingResponse(answer){return JSON.parse(answer)}},
  baDocumentPreflight,
  successfulSourceMappings:new Map(),
  aiAnswer:(target,prompt,limit,settings)=>{
   if(String(prompt).includes('automated Business Analyst source-document quality checker'))return Promise.resolve(JSON.stringify({status:'ready',summary:'Checked',edits:[],issues:[]}));
   return aiAnswer(target,prompt,limit,settings);
  }, dashboard:{webview:{async postMessage(msg){events.push(msg)}}}
 };
 const start=host.indexOf('const SOURCE_MAPPING_AI_TIMEOUT_MS=');
 const end=host.indexOf('async function removeDiscoverySource(',start);
 assert.ok(start>0&&end>start);
 const processMapping=vm.runInNewContext(host.slice(start,end)+'\nprocessSelectedDiscoverySources',sandbox);
 return {processMapping,sandbox,events,get commits(){return commits},request:{digests:[digest],revision:7}};
}
async function waitFor(fn){for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out waiting for simulated mapping event');}
test('mapping stop aborts provider request and never writes partial answers',async()=>{
 const t=mappingHarness((_target,_prompt,_limit,{signal})=>new Promise((_resolve,reject)=>{
  if(signal.aborted)reject(Object.assign(Error('stopped'),{name:'AbortError'}));
  signal.addEventListener('abort',()=>reject(Object.assign(Error('stopped'),{name:'AbortError'})),{once:true});
 }));
 const completion=t.processMapping(t.request);
 await waitFor(()=>t.events.some(x=>x.phase==='mapping'));
 assert.equal(t.sandbox.activeDiscoveryMappingRun.phase,'mapping');
 t.sandbox.activeDiscoveryMappingRun.controller.abort();
 await assert.rejects(completion,{name:'AbortError'});
 assert.equal(t.commits,0);
 assert.equal(t.events.some(x=>x.type==='discoveryImportResult'),false);
 assert.equal(t.sandbox.activeDiscoveryMappingRun,null);
});
test('successful mapping publishes proposals only after atomic register commit',async()=>{
 const t=mappingHarness(async()=>'{"problem":"Register visitors"}');
 await t.processMapping(t.request);
 assert.equal(t.commits,1);
 const order=t.events.map(x=>x.type);
 assert.ok(order.indexOf('commit')>=0);
 assert.ok(t.events.some(row=>row.phase==='preflight'));
 assert.ok(t.events.some(row=>row.type==='discoverySourcePreflight'));
 assert.ok(order.indexOf('commit')<order.indexOf('discoveryImportResult'));
 assert.ok(order.indexOf('discoveryImportResult')<order.indexOf('discoveryImportDone'));
 assert.equal(t.sandbox.activeDiscoveryMappingRun,null);
});
test('per-source AI timeouts do not commit partial discovery or Jira changes',async()=>{
 const t=mappingHarness((_target,_prompt,_limit,{signal})=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true});
 }),{setTimeout:(callback)=>setTimeout(callback,20)});
 await assert.rejects(t.processMapping(t.request),/timed out after 180 seconds/);
 assert.equal(t.commits,0);
 assert.equal(t.events.some(x=>x.type==='discoveryImportResult'),false);
});
test('restart notice dismissal works with const queue and the exact screenshot message',()=>{
 const begin=ui.indexOf('function dismissObsoleteBARestartNotice(){');
 const end=ui.indexOf('\nfunction atgvInlineNotice(',begin);
 assert.ok(begin>=0&&end>begin);
 const noticed={message:'Business Requirements restarted. 1 previous source document(s) archived; approved revisions and published Jira remain preserved. Upload a new source to begin.'};
 const other={message:'Other message'};
 const inline={textContent:noticed.message,classList:{added:[],add(x){this.added.push(x)}}};
 const context={
  topNoticeCurrent:noticed,closeTopNotification(){context.closures++;},closures:0,
  $(){return inline}
 };
 const script='const topNoticeQueue=[{message:'+JSON.stringify(noticed.message)+'},{message:"Other message"}];\n'+ui.slice(begin,end)+'\ndismissObsoleteBARestartNotice();\n({queue:topNoticeQueue,inlineHidden:'+"inline.classList.added.includes('hidden')"+'})';
 context.inline=inline;
 const result=vm.runInNewContext(script,context);
 assert.deepEqual(Array.from(result.queue,x=>x.message),[other.message]);
 assert.equal(result.inlineHidden,true);
 assert.equal(inline.textContent,'');
});
test('completed history appears only on Start and mapping exposes Stop/Retry',()=>{
 assert.match(ui,/\$\('baCompletedSection'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.match(html,/id="baStopMapping"/);
 assert.match(html,/id="baMappingRetry"/);
 assert.match(ui,/send\('stopDiscoverySourceMapping'\)/);
 assert.match(host,/case 'stopDiscoverySourceMapping'/);
 assert.doesNotMatch(ui,/topNoticeQueue=topNoticeQueue\.filter\(/);
});
