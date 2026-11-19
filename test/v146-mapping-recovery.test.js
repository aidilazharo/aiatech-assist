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
 const checkpoints=opts.checkpoints||new Map(),secrets=opts.secrets||new Map();
 const digest='a'.repeat(64);
 const register={revision:7,sourceDocuments:[{name:'visitor.pdf',digest}]};
 const sandbox={
  AbortController,Map,Set,Error,Array,JSON,Number,Object,String,Date,crypto:require('node:crypto'),
  setTimeout:opts.setTimeout||setTimeout,clearTimeout,
  activeDiscoveryMappingRun:null,activeProject:{id:'tc'},registry:opts.registry||{},
  cfg:()=>({get:()=>false}),
  requireOpened(){},async requireBAOwner(){},async recordBAProcess(){},
  brWorkflow:{async load(){return register;},async commitSourceMapping(_r,_id,revision,changes){
   assert.equal(revision,7);assert.deepEqual([...changes.digests],[digest]);commits++;
   if(opts.failFirstCommit&&commits===1)throw Error('Simulated commit interruption');
   events.push({type:'commit'});return {revision:8,mappingCompleted:{proposals:changes.proposals}};
  }},
  async activeAiTarget(){return {label:'Test model'};},
  async roleSkillPrompt(){return opts.roleSkill||'';},
  sourceStore:{async read(){return {name:'visitor.pdf',digest,text:opts.sourceText||'Requirements'}}},
  discoveryImport:{...discoveryModule,createMappingPrompt(doc){return opts.realPrompt?discoveryModule.createMappingPrompt(doc):'Map'},parseMappingResponse(answer){return JSON.parse(answer)}},
  baBrTextPipeline:{
   async prepare(_registry,_id,source){
    const parts=discoveryModule.splitDocumentText(source.text,12000);
    return parts.map((text,i)=>({text,filename:'BR001-P'+(i+1)+'.txt',digest:require('../src/ba-br-txt-pipeline').sha(text),
      sourceDigest:source.digest,brIndex:1,partIndex:i+1,parts:parts.length,characters:text.length}));
   },
   mergeForDiscovery(parts){return discoveryModule.mergeMappingAnswers(parts);}
  },

  baDocumentPreflight,
  baSourceSelectionGuard:require('../src/ba-source-selection-guard'),
  baLargeDocumentRecovery:require('../src/ba-large-document-recovery'),
  baTimeoutSimplified:require('../src/ba-timeout-simplified'),
  async uiWarning(){return undefined;},
  baPreflightReports:require('../src/ba-preflight-report'),
  baWorkingBr:{...require('../src/ba-working-br'),async store(_registry,_project,sourceDigest){return {filename:'test.md',digest:'f'.repeat(64),sourceDigest}}},
  documentPreflightSessions:new Map(),
  successfulSourceMappings:new Map(),
  report(){},context:{secrets:{get:async key=>secrets.get(key),store:async(key,value)=>secrets.set(key,value)},workspaceState:{update:async()=>{}}},
  baMappingCheckpoint:opts.checkpointBackend||{
   fresh:(meta,sections)=>({schema:1,...meta,sectionLengths:sections.map(x=>x.length),preflight:{},mapping:{},cross:{}}),
   load:async(_registry,_project,meta)=>{const value=checkpoints.get(meta.sourceDigest);return value&&value.revision===meta.revision&&value.textDigest===meta.textDigest&&value.modelDigest===meta.modelDigest?JSON.parse(JSON.stringify(value)):null;},
   save:async(_registry,_project,value)=>checkpoints.set(value.sourceDigest,JSON.parse(JSON.stringify(value))),
   remove:async(_registry,_project,digest)=>checkpoints.delete(digest)
  },
  sha:require('../src/utils').sha,
  aiAnswer:(target,prompt,limit,settings)=>{
   if(String(prompt).includes('automated Business Analyst source-document quality checker')){
    if(opts.preflightAnswer)return opts.preflightAnswer(target,prompt,limit,settings);
    return Promise.resolve(JSON.stringify((typeof opts.preflightResponse==='function'?opts.preflightResponse(prompt):opts.preflightResponse)||{status:'ready',summary:'Checked',edits:[],issues:[]}));
   }
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
test('mapping receives the corrected working BR and the report records the change',async()=>{
 const opts={sourceText:'Please add namme once.',realPrompt:true,preflightResponse:{status:'ready',summary:'Checked',edits:[{before:'add namme',after:'add name',reason:'Spelling'}],issues:[]}};
 const prompts=[];const t=mappingHarness(async(_target,prompt)=>{prompts.push(prompt);return '{"problem":"Add name"}';},opts);
 await t.processMapping(t.request);
 assert.equal(prompts.length,1);
 assert.match(prompts[0],/Please add name once\./);
 assert.doesNotMatch(prompts[0],/Please add namme once\./);
 const text=require('../src/ba-preflight-report').format(t.sandbox.documentPreflightSessions.get('tc'));
 assert.match(text,/Original text: add namme/);
 assert.match(text,/Working text after correction: add name/);
 assert.match(text,/Used in the working BR sent to mapping/);
});
test('retry does not reuse mapping from a different AI-updated working copy',async()=>{
 const opts={sourceText:'Please add namme once.',realPrompt:true,failFirstCommit:true,preflightResponse:{status:'ready',summary:'Checked',edits:[{before:'add namme',after:'add name',reason:'Spelling'}],issues:[]}};
 const prompts=[];const t=mappingHarness(async(_target,prompt)=>{prompts.push(prompt);return '{"problem":"Add name"}';},opts);
 await assert.rejects(t.processMapping(t.request),/Simulated commit interruption/);
 opts.preflightResponse={status:'ready',summary:'Checked',edits:[],issues:[]};
 opts.roleSkill='Updated Business Analyst guidance';
 await t.processMapping(t.request);
 assert.equal(prompts.length,2);
 assert.match(prompts[0],/Please add name once\./);
 assert.match(prompts[1],/Please add namme once\./);
});
test('mapping completes each TXT unit before the next and never commits a later blocked unit',async()=>{
 let mappingCalls=0;
 const opts={sourceText:'A'.repeat(30000)+'\nSECOND SECTION: permissions conflict.',preflightResponse:prompt=>prompt.includes('SECOND SECTION')?
  {status:'needs-input',summary:'Conflict',edits:[],issues:[{severity:'blocker',category:'contradiction',detail:'Permissions conflict over access',suggestion:'Ask the owner'}]}:
  {status:'ready',summary:'Checked',edits:[],issues:[]}};
 const t=mappingHarness(async()=>{mappingCalls++;return '{"problem":"A"}';},opts);
 await assert.rejects(t.processMapping(t.request),/clarification before mapping/);
 assert.ok(mappingCalls>=1,'earlier verified TXT units may map but no partial result is committed');
 assert.equal(t.commits,0);
});
test('invalid AI mapping is retried once before a complete proposal is committed',async()=>{
 let calls=0;
 const t=mappingHarness(async()=>++calls===1?'not JSON':'{"problem":"Register visitors"}');
 await t.processMapping(t.request);
 assert.equal(calls,2);
 assert.equal(t.commits,1);
 assert.ok(t.events.some(row=>row.phase==='mapping'&&/Recovering|Retrying/.test(row.message)));
});
test('three invalid mappings leave the register unchanged after bounded automatic recovery',async()=>{
 let calls=0;
 const t=mappingHarness(async()=>{calls++;return 'not JSON';});
 await assert.rejects(t.processMapping(t.request),/could not recover safely after 3 attempt/);
 assert.equal(calls,3);
 assert.equal(t.commits,0);
 assert.equal(t.events.some(row=>row.type==='discoveryImportResult'),false);
});
test('per-source AI timeouts do not commit partial discovery or Jira changes',async()=>{
 const t=mappingHarness((_target,_prompt,_limit,{signal})=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true});
 }),{setTimeout:(callback)=>setTimeout(callback,20)});
 await assert.rejects(t.processMapping(t.request),/could not recover safely after 3 attempt/);
 assert.equal(t.commits,0);
 assert.equal(t.events.some(x=>x.type==='discoveryImportResult'),false);
});
test('slow preflight retries the same immutable TXT unit without changing source coverage',async()=>{
 let preflightCalls=0;const sourceText='A'.repeat(8000)+' end';
 const opts={sourceText,setTimeout:callback=>setTimeout(callback,15),preflightAnswer:()=>{
  if(++preflightCalls===1)return new Promise(()=>{}); // Simulate a provider that ignores cancellation.
  return Promise.resolve(JSON.stringify({status:'ready',summary:'Checked',edits:[],issues:[]}));
 }};
 const t=mappingHarness(async(_target,prompt)=>String(prompt).includes('Review mapped business claims')?
  '{"status":"consistent","conflicts":[]}':'{"problem":"A requirement"}',opts);
 await t.processMapping(t.request);
 assert.ok(preflightCalls>=2);assert.equal(t.commits,1);
 assert.ok(!t.events.some(row=>/Retrying this section in smaller parts/.test(row.message||'')));
 const report=t.sandbox.documentPreflightSessions.get('tc');
 assert.ok(report.entries.length>=1);assert.ok(report.entries.every(entry=>entry.totalSections===1));
});
test('repeated preflight timeouts stop safely after a bounded retry',async()=>{
 let calls=0;
 const t=mappingHarness(async()=>'{"problem":"Unexpected mapping"}',{sourceText:'short requirement',setTimeout:callback=>setTimeout(callback,15),preflightAnswer:()=>{calls++;return new Promise(()=>{});}});
 await assert.rejects(t.processMapping(t.request),/AI preflight could not complete after 3 recovery attempts/);
 assert.equal(calls,3);assert.equal(t.commits,0);
 assert.ok(t.events.some(row=>/Recovering AI preflight/.test(row.message||'')));
 assert.equal(t.events.some(row=>row.type==='discoveryImportResult'),false);
});
test('stopping during preflight aborts without retrying or saving',async()=>{
 let calls=0;
 const t=mappingHarness(async()=>'{"problem":"Unexpected mapping"}',{preflightAnswer:()=>{calls++;return new Promise(()=>{});}});
 const completion=t.processMapping(t.request);
 await waitFor(()=>calls===1);t.sandbox.activeDiscoveryMappingRun.controller.abort();
 await assert.rejects(completion,{name:'AbortError'});
 assert.equal(calls,1);assert.equal(t.commits,0);
});
test('completed preflight sections resume after a later timeout and extension restart',async()=>{
 const checkpoints=new Map();let firstCalls=0;
 const text='A'.repeat(12000)+'B'.repeat(8000);
 const first=mappingHarness(async()=>'{"problem":"unexpected"}',{checkpoints,sourceText:text,setTimeout:callback=>setTimeout(callback,10),preflightAnswer:()=>{
  firstCalls++;return firstCalls===1?Promise.resolve('{"status":"ready","summary":"Checked","edits":[],"issues":[]}'):new Promise(()=>{});
 }});
 await assert.rejects(first.processMapping(first.request),/AI preflight could not complete after 3 recovery attempts/);
 assert.ok(checkpoints.size);assert.equal(first.commits,0);
 let resumedPreflights=0;
 const second=mappingHarness(async(_target,prompt)=>String(prompt).includes('Review mapped business claims')?'{"status":"consistent","conflicts":[]}':'{"problem":"A requirement"}',{checkpoints,sourceText:text,preflightAnswer:()=>{resumedPreflights++;return Promise.resolve('{"status":"ready","summary":"Checked","edits":[],"issues":[]}');}});
 await second.processMapping(second.request);
 assert.equal(second.commits,1);assert.ok(second.events.some(row=>/Resuming: using saved AI preflight/.test(row.message||'')));
 assert.ok(resumedPreflights>0);assert.equal(checkpoints.size,0);
});
test('a fully processed section resumes after a commit interruption without another AI request',async()=>{
 const checkpoints=new Map();let firstMappings=0;
 const first=mappingHarness(async()=>{firstMappings++;return '{"problem":"Register visitors"}';},{checkpoints,failFirstCommit:true});
 await assert.rejects(first.processMapping(first.request),/Simulated commit interruption/);
 assert.equal(firstMappings,1);assert.ok(checkpoints.size);
 let calls=0;
 const second=mappingHarness(async()=>{calls++;throw Error('Mapping should have resumed');},{checkpoints,preflightAnswer:()=>{calls++;throw Error('Preflight should have resumed');}});
 await second.processMapping(second.request);
 assert.equal(calls,0);assert.equal(second.commits,1);assert.equal(checkpoints.size,0);
 assert.ok(second.events.some(row=>/Resuming: using completed AI mapping/.test(row.message||'')));
});
test('authenticated on-disk checkpoints resume across fresh extension sessions',async()=>{
 const fsAsync=require('node:fs/promises'),os=require('node:os');
 const dir=await fsAsync.mkdtemp(path.join(os.tmpdir(),'atgv-mapping-resume-integration-'));
 try{
  const {ProjectRegistry}=require('../src/projects'),registry=new ProjectRegistry(dir);
  await registry.create({id:'tc',name:'Test'});
  const backend=require('../src/ba-mapping-checkpoint'),secrets=new Map();
  const first=mappingHarness(async()=>'{"problem":"Visitor registration"}',{registry,secrets,checkpointBackend:backend,failFirstCommit:true});
  await assert.rejects(first.processMapping(first.request),/Simulated commit interruption/);
  let calls=0;
  const second=mappingHarness(async()=>{calls++;throw Error('Unexpected AI mapping');},{registry,secrets,checkpointBackend:backend,preflightAnswer:()=>{calls++;throw Error('Unexpected AI preflight');}});
  await second.processMapping(second.request);
  assert.equal(calls,0);assert.equal(second.commits,1);
 }finally{await fsAsync.rm(dir,{recursive:true,force:true});}
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
