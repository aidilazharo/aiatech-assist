'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {sha}=require('../src/utils');
const workflow=require('../src/br-workflow');
const checks=require('../src/jira-field-preflight');
const automatic=require('../src/ba-automatic-workflow');
const resets=require('../src/ba-jira-republish');
const pipeline=require('../src/ba-br-md-pipeline');
const working=require('../src/ba-working-br');
const {QUESTIONS}=require('../src/ba-discovery');
const hostFile=path.join(__dirname,'../src/lib/runtime/extension-runtime.js');

function hostFunction(source,name,next,context){
 const start=source.indexOf(name),end=source.indexOf(next,start+name.length);
 assert.ok(start>=0&&end>start);
 return vm.runInNewContext('('+source.slice(start,end).trim()+')',context);
}

const paragraphs={
 problem:'Employees need to register approved visitors.',
 targetProcess:'Employees submit the visitor and receive a check-in reference.',
 scope:'Reception manages approved visits.',
 acceptance:'Given an approved visitor, submitting creates a check-in reference.',
 questions:'No open decisions'
};
const edited={title:'Visitor check-in',objective:paragraphs.problem,scope:paragraphs.scope,acceptanceCriteria:paragraphs.acceptance,features:[]};

async function registerFixture(t){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-ba-auto-'));
 t.after(()=>fs.rm(folder,{force:true,recursive:true}));
 const registry={fileFor:id=>path.join(folder,id,'project.json')};
 const state=await workflow.load(registry,'demo');
 const register=await workflow.write(registry,'demo',state.revision,next=>{
  next.importEpoch=1;next.importDigest='1'.repeat(64);next.importName='Visitor Check-in BRD v2.pdf';
  next.discoveryRevision='discovery';next.reviewRevision='discovery';
  next.discoveryAnswers=automatic.mappedAnswers(paragraphs);
  next.reviewText=JSON.stringify({readiness:'Ready',suggestions:[]});
 });
 return {registry,register};
}

test('automatic preparation executes the three preparatory stages and pauses before Jira writes',async()=>{
 const calls=[];
 await automatic.run('source',{
  prepareSource:async()=>calls.push('verify source'),
  developRequirements:async()=>calls.push('save BR drafts'),
  prepareJira:async()=>calls.push('inspect Jira'),
  progress:async stage=>calls.push(stage)
 });
 assert.deepEqual(calls,['source','verify source','requirements','save BR drafts','jira','inspect Jira']);
 const controller=new AbortController();
 const rerun=[];
 await assert.rejects(automatic.run('requirements',{
  prepareSource:async()=>assert.fail('source should stay current'),
  developRequirements:async()=>{rerun.push('requirements');controller.abort();},
  prepareJira:async()=>assert.fail('stopped before Jira'),
  progress:async()=>{},signal:controller.signal
 }),{name:'AbortError'});
 assert.deepEqual(rerun,['requirements']);
});

test('a source-supported draft is previewable without recording approval until the user publishes',async t=>{
 const {registry,register}=await registerFixture(t);
 const draft=await workflow.generated(registry,'demo',register.revision,{discoveryRevision:'discovery',requirements:[edited],actor:'BA',automatic:true});
 assert.equal(draft.brs[0].status,'draft');
 assert.ok(draft.brs[0].draftSavedAt);
 assert.match(draft.brs[0].jiraPlacement,/Create an Epic for Visitor check-in/);
 assert.equal(draft.brs[0].approvedContent,null);
 assert.equal(workflow.plan(draft).length,0);
 const candidate=workflow.projectPreparedJira(draft);
 const plan=workflow.plan(candidate);
 assert.equal(plan[0].action,'create');
 assert.equal((await workflow.load(registry,'demo')).brs[0].status,'draft');
 const fields=checks.planFields(plan[0],[{id:'customfield_10011',name:'Acceptance Criteria',schema:{type:'string',custom:'textarea'},operations:['set']}],
  {approvedBR:candidate.brs[0].approvedContent});
 assert.ok(fields.extraFields.customfield_10011);
 assert.doesNotMatch(fields.description,/Definition of done/,'DoD cannot be invented without an approved project policy');
 const saved=await workflow.approvePreparedJira(registry,'demo',draft.revision,{
  actor:'verified BA',publication:{roots:[],rows:[]},expectedPlan:sha(JSON.stringify(plan))
 });
 assert.equal(saved.brs[0].status,'approved');
 assert.equal(saved.brs[0].approval.actor,'verified BA');
 assert.deepEqual(workflow.plan(saved),plan);
});

test('a manual BR edit preserves the published Jira key and updates the proposed placement',async t=>{
 const {registry,register}=await registerFixture(t);
 let state=await workflow.write(registry,'demo',register.revision,next=>{
  next.brs=[{id:'BR-001',...edited,approvedContent:edited,status:'approved',approvedRevision:1,needsRefresh:false}];
  next.synced={'BR-001':{key:'TC-42',hash:'previous'}};
 });
 const jiraPlacement='Group with the Reception Operations workstream.';
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content:{...edited,title:'Visitor arrival registration',jiraPlacement},automatic:true});
 assert.equal(state.brs[0].status,'draft');
 assert.equal(state.brs[0].approvedContent.title,edited.title);
 assert.equal(state.brs[0].baManualFields.title,'Visitor arrival registration');
 const candidate=workflow.projectPreparedJira(state);
 const items=workflow.plan(candidate);
 assert.equal(items[0].key,'TC-42');
 assert.equal(state.brs[0].baManualFields.jiraPlacement,jiraPlacement);
 assert.ok(items[0].description.includes(jiraPlacement));
 assert.deepEqual(workflow.changedPublishedBRs(state,candidate,items),['BR-001']);
});

test('editable source evidence is separate and still carries the verified upload identity',async t=>{
 const {registry,register}=await registerFixture(t);
 const original='A system records a visitor.';
 const revised='A system records a preapproved visitor.';
 const sourceDigest=sha(original);
 const src={name:'visitor.pdf',digest:sourceDigest,characters:original.length,storedName:sourceDigest+'.pdf'};
 let state=await workflow.write(registry,'demo',register.revision,next=>{next.sourceDocuments=[src];});
 const ref=await working.store(registry,'demo',sourceDigest,revised);
 state=await workflow.saveSourceArtifact(registry,'demo',state.revision,{sourceDigest,kind:'source',ref});
 assert.equal(state.sourceDocuments[0].digest,sourceDigest);
 await assert.rejects(pipeline.prepare(registry,'demo',{...src,text:revised}),/Verified original/);
 const units=await pipeline.prepare(registry,'demo',{...src,text:revised},{editedTextDigest:ref.digest});
 assert.equal(units[0].sourceDigest,sourceDigest);
 assert.equal(await pipeline.read(registry,'demo',units[0]),revised);
 assert.match(automatic.isoDocument(src.name,state,'Validated source text'),/ISO\/IEC\/IEEE 29148/);
});

test('retains user Discovery edits and identifies unresolved material facts',()=>{
 const answers=automatic.mappedAnswers(paragraphs,{scope:'Reception and security'});
 assert.equal(Object.keys(answers).length,QUESTIONS.length);
 assert.equal(answers.scope,'Reception and security');
 assert.equal(answers.data,automatic.missing);
 assert.deepEqual(automatic.publicationIssues({discoveryAnswers:answers,discoveryRevision:'x',reviewRevision:'x'}),[]);
 const corrected=automatic.applyGroundedReview(answers,{suggestions:[{key:'scope',suggestedAnswer:'Reception and security with a 100% SLA.'}]});
 assert.equal(corrected.scope,'Reception and security');
 const blocked=automatic.mappedAnswers({...paragraphs,questions:'Who can approve high-risk visits?'});
 const open={discoveryAnswers:blocked,discoveryRevision:'x',reviewRevision:'x'};
 assert.deepEqual(automatic.publicationIssues(open),[]);
 assert.match(automatic.sourceNotes(open).join(' '),/question 12/);
});

test('republish previews and moves only linked started or completed work of changed BRs',async()=>{
 const register={synced:{
  'BR-001':{key:'TC-1'},'BR-001/F-001':{key:'TC-2'},'BR-001/F-001/S-001':{key:'TC-3'},'BR-002':{key:'TC-4'}
 }};
 const status=(name,id,category)=>({name,id,statusCategory:{key:category}});
 const remote=new Map([
  ['TC-1',status('In Progress','3','indeterminate')],['TC-2',status('Done','4','done')],['TC-3',status('To Do','1','new')],['TC-4',status('In Progress','3','indeterminate')]
 ]);
 const moves=[];
 const io={
  read:async key=>({key,fields:{status:remote.get(key),updated:'version'}}),
  verify:(path,issue)=>assert.equal(register.synced[path].key,issue.key),
  transitions:async()=>[{id:'21',to:'To Do'}],
  move:async(key,id)=>{moves.push([key,id]);remote.set(key,status('To Do','1','new'));}
 };
 const {rows,blocked}=await resets.preview(register,['BR-001'],io);
 assert.deepEqual(blocked,[]);
 assert.deepEqual(rows.map(row=>row.key),['TC-1','TC-2']);
 assert.deepEqual(moves,[]);
 for(const row of rows)await resets.apply(row,io);
 await resets.apply(rows[0],io);
 assert.deepEqual(moves,[['TC-1','21'],['TC-2','21']]);
 assert.equal(remote.get('TC-4').name,'In Progress');
 const unavailable=await resets.preview(register,['BR-002'],{...io,transitions:async()=>[]});
 assert.deepEqual(unavailable.blocked,[]);
 assert.deepEqual(unavailable.rows,[]);
 assert.match(unavailable.skipped[0].message,/TC-4 has no available transition/);
 assert.equal(remote.get('TC-4').name,'In Progress');
 const mixed=await resets.preview(register,['BR-001','BR-002'],{...io,transitions:async key=>key==='TC-4'?[]:[{id:'21',to:'To Do'}]});
 assert.equal(mixed.blocked.length,0);assert.equal(mixed.skipped.length,1);
 const denied=await resets.preview(register,['BR-002'],{...io,transitions:async()=>{throw Error('HTTP 403');}});
 assert.match(denied.blocked[0],/HTTP 403/);assert.equal(denied.skipped.length,0);
 const wrong=await resets.preview(register,['BR-002'],{...io,verify:()=>{throw Error('identity mismatch');}});
 assert.match(wrong.blocked[0],/identity mismatch/);assert.equal(wrong.skipped.length,0);
});

test('a changed BR draft checks Jira links against its published parent hierarchy',async()=>{
 const host=await fs.readFile(hostFile,'utf8');
 const story='BR-001/F-001/S-001';
 const task=story+'/T-001';
 const register={brs:[{id:'BR-001',status:'draft',needsRefresh:true,jiraHierarchyVersion:2,
  approvedContent:{...edited,features:[{id:'F-001',title:'Registration',stories:[{id:'S-001',title:'Register a visitor',tasks:[{id:'T-001',title:'Show check-in reference'}]}]}]}
 }],synced:{'BR-001':{key:'TC-1'},'BR-001/F-001':{key:'TC-2'},[story]:{key:'TC-3'},[task]:{key:'TC-4'}}};
 const verify=hostFunction(host,'function verifyLinkedJiraIdentity(','async function jiraProtectionAssessment(',{
  brWorkflow:workflow,jiraScopedMarker:()=> 'trusted-marker',validProjectKey:()=> 'TC'
 });
 const config={get:()=> 'TC'};
 const issue=(key,parent)=>({key,fields:{project:{key:'TC'},labels:['trusted-marker'],parent:{key:parent}}});
 verify(register,config,story,issue('TC-3','TC-1'));
 verify(register,config,task,issue('TC-4','TC-3'));
 assert.throws(()=>verify(register,config,story,issue('TC-3','TC-2')),/parent relationship changed/);
});

test('the preparation bridge clears the busy state for both ready and failed previews',async()=>{
 const host=await fs.readFile(hostFile,'utf8');
 const messages=[],statuses=new Map();
 let fail=false;
 const run=hostFunction(host,'async function runBRPreparation(','function requireBAWorkspace(',{
  AbortController,baAutomatic:automatic,activeProject:{id:'demo'},baPreparationRun:null,jiraSyncBusy:false,baPublishIntent:false,
  registry:{},brWorkflow:{load:async()=>({sourceDocuments:[{}],revision:'expected',synced:{}})},
  requireOpened:()=>{},requireBAOwner:async()=>{},requireBAWritableCycle:async()=>{},brPreparationStage:()=> 'jira',brPreparationTitle:()=> 'Visitor check-in',assessAutomaticDrafts:async()=>{},
  prepareBRJiraPreview:async()=>{if(fail)throw Error('Jira preview could not be built');return {revision:'expected',changes:[{}],reopenRows:[],conflicts:[]};},
  baPreparationSessions:statuses,postBAPreparation:async(id,state)=>{statuses.set(id,state);},
  dashboard:{webview:{postMessage:async message=>messages.push(message)}}
 });
 await run('jira');
 assert.equal(statuses.get('demo').phase,'ready');
 assert.equal(messages.at(-1).task,'preparation');
 assert.equal(messages.at(-1).done,true);
 assert.equal(messages.at(-1).failed,false);
 fail=true;
 await run('jira');
 assert.equal(statuses.get('demo').phase,'draft');
 assert.equal(messages.at(-1).done,true);
 assert.equal(messages.at(-1).failed,true);
});

test('build renders four steps and puts collapsible artifacts and skill on the BA page',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/ba-automatic-ui.js'),'utf8');
 assert.equal((host.match(/data-ba-auto-stage="/g)||[]).length,4);
 for(const id of ['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira'])assert.match(host,new RegExp('<details id="'+id+'"'));
 assert.match(host,/Refresh Affected Artifacts/);
 assert.match(host,/baAutoSkillSlot/);
 assert.doesNotMatch(host,/AI verifies and generalizes the uploaded source|<span>READINESS<\/span>/);
 assert.match(ui,/ATGVDataTables\.mount/);
 assert.match(ui,/setBusinessRequirementsActivity/);
});

test('Jira preview projects eligible requirements while reporting other BRs that need attention',async t=>{
 const {registry,register}=await registerFixture(t);
 const draft=await workflow.generated(registry,'demo',register.revision,{discoveryRevision:'discovery',requirements:[edited],actor:'BA',automatic:true});
 const blocked={...draft.brs[0],id:'BR-002',title:'Review visitor access',draftSavedAt:null};
 const mixed={...draft,brs:[draft.brs[0],blocked]};
 const blockers=[];
 const candidate=workflow.projectPreparedJira(mixed,{blockers});
 assert.deepEqual(workflow.plan(candidate).map(row=>row.path),['BR-001']);
 assert.match(blockers[0],/BR-002: Save the BR draft/);
 assert.equal(mixed.brs[0].status,'draft');
 assert.equal(candidate.brs[1].status,'draft');
 assert.throws(()=>workflow.projectPreparedJira(mixed),/Save the BR draft/);
});

test('an all-flagged BR still gets a verified preview and approval, while failed Jira checks block publishing',async t=>{
 const {registry,register}=await registerFixture(t);
 const draft=await workflow.generated(registry,'demo',register.revision,{discoveryRevision:'discovery',requirements:[edited],actor:'BA',automatic:true});
 const flagged=await workflow.write(registry,'demo',draft.revision,next=>{
  next.sourceConflicts=[{id:'source-conflict',brId:'BR-001'}];
  next.discoveryAnswers.scope=automatic.missing;
  const fingerprint=automatic.qualityFingerprint(next,next.brs[0]);
  next.baDraftQuality={checked:{'BR-001':fingerprint},excluded:[{id:'BR-001',fingerprint,reason:'Visitor rules need clarification.'}]};
 });
 const host=await fs.readFile(hostFile,'utf8');
 const diagnostics=[];
 let inventoryFailure=true;
 const target={config:{get:key=>key==='jira.projectKey'?'TC':''},token:'test-token'};
 const prepare=hostFunction(host,'async function prepareBRJiraPreview(','async function syncApprovedBRs(',{
  requireOpened:()=>{},activeProject:{id:'demo'},registry,brWorkflow:workflow,baAutomatic:automatic,sha,path,
  dashboard:{webview:{postMessage:async()=>{}}},jiraPreviewFieldPlans:{},jiraPreviewFieldMetadata:new Map(),approvedJiraPreviewRevision:null,jiraPreviewValidation:null,
  ensureJiraPreviewTarget:async()=>target,validProjectKey:key=>key,baseAtlassian:()=> 'https://example.atlassian.net',
  jiraDuplicates:{fetchProjectIssues:async()=>{if(inventoryFailure)throw Error('HTTP 429');return [];}},
  baJiraDraftIds:{plan:()=>[]},jiraIssueTypes:async()=>[{id:'10017',name:'Epic'}],
  prePublishIdentityGuard:async(_r,_c,_t,_changes,inventory)=>{assert.deepEqual(inventory,[]);return {safe:true};},
  formatIdentityConflicts:()=>[],jiraPreflight:async(_r,_c,_t,_items,_progress,{inventory})=>{assert.deepEqual(inventory,[]);return [];},
  jiraPreviewDetails:require('../src/jira-preview-details'),jiraTemplateKnowledge:{load:async()=>null},
  jiraIssueFieldMetadata:async()=>[{id:'summary',name:'Summary',required:true,schema:{type:'string'},operations:['set']}],
  jiraFieldPreflight:checks,atgvJobSafeError:error=>error.message,recordBAProcess:async event=>diagnostics.push(event)
 });
 const blocked=await prepare({automatic:true});
 assert.equal(blocked.rows.length,1);
 assert.equal(blocked.rows[0].path,draft.brs[0].id);
 assert.equal(blocked.changes[0].action,'create');
 assert.equal(blocked.verifiedAt,0);
 assert.equal(blocked.checkedCount,0);
 assert.match(blocked.conflicts[0],/Read Jira issue inventory: HTTP 429/);
 assert.equal(diagnostics[0].action,'verify-work-items');
 inventoryFailure=false;
 const ready=await prepare({automatic:true,qualityWarning:'Draft quality review: model timed out'});
 assert.equal(ready.conflicts.length,0);
 assert.match(ready.sourceNotes.join('\n'),/BR-001 · Visitor rules need clarification/);
 assert.match(ready.sourceNotes.join('\n'),/Discovery needs more detail/);
 assert.match(ready.sourceNotes.join('\n'),/conflicting rules/);
 assert.match(ready.sourceNotes.join('\n'),/model timed out/);
 assert.ok(ready.verifiedAt>0);
 assert.ok(ready.fieldPlans[draft.brs[0].id].schema);
 assert.equal(ready.checkedCount,1);
 assert.equal((await workflow.load(registry,'demo')).brs[0].status,'draft');
 let confirm=false;
 const published=[];
 const publish=hostFunction(host,'async function publishPreparedBRs(','async function prepareBRJiraPreview(',{
  requireBAWorkspace:()=>{},activeProject:{id:'demo'},registry,brWorkflow:workflow,sha,
  baPreparationRun:null,baAttentionRun:null,jiraSyncBusy:false,approvedJiraPreviewRevision:null,approvedJiraPreviewBinding:null,
  baPreparationSessions:new Map([['demo',{phase:'ready',preview:ready}]]),jiraPreviewFieldPlans:ready.fieldPlans,
  effectiveConfig:()=>target.config,baseAtlassian:()=>ready.site,validProjectKey:key=>key,
  requireBAOwner:async()=>{},requireBAWritableCycle:async()=>{},verifiedBAActor:async()=>'BA',
  uiWarning:async(_title,options,action)=>{
   assert.match(options.detail,/BR-001 · Visitor rules need clarification/);
   return confirm?action:undefined;
  },
  postBAPreparation:async()=>{},getAtlassianToken:async()=>target.token,baJiraRepublish:resets,
  reopenServices:()=>({}),brPreparationTitle:()=>edited.title,
  syncApprovedBRs:async revision=>{
   const approved=await workflow.load(registry,'demo');
   assert.equal(approved.revision,revision);
   const [item]=workflow.plan(approved);
   published.push(item.path);
   await workflow.recorded(registry,'demo',revision,{...item,key:'TC-42'});
  }
 });
 await publish({projectId:'demo',revision:flagged.revision});
 assert.deepEqual(published,[]);
 assert.equal((await workflow.load(registry,'demo')).brs[0].status,'draft');
 confirm=true;
 await publish({projectId:'demo',revision:flagged.revision});
 const saved=await workflow.load(registry,'demo');
 assert.equal(saved.brs[0].status,'approved');
 assert.deepEqual(published,['BR-001']);
 assert.equal(saved.synced['BR-001'].key,'TC-42');
 assert.equal(saved.sourceConflictDecisions['source-conflict'],undefined);
});

test('automatic identity verification checks all markers from the completed inventory',async()=>{
 const host=await fs.readFile(hostFile,'utf8');
 const marker='atgv-'+'a'.repeat(24);
 const verify=hostFunction(host,'async function jiraPreflight(','async function prePublishIdentityGuard(',{
  jiraScopedMarker:()=>marker,jiraFindIssueByMarker:async()=>assert.fail('complete Jira inventory replaces per-item lookups')
 });
 const work=[{action:'create',path:'BR-001'}],config={};
 const matched={key:'TC-1',fields:{labels:[marker]}};
 const one=await verify({},config,'test-token',work,undefined,{automatic:true,inventory:[matched]});
 assert.equal(one.linkCandidates[0].key,'TC-1');
 const duplicates=await verify({},config,'test-token',work,undefined,{automatic:true,inventory:[matched,{...matched,key:'TC-2'}]});
 assert.match(duplicates[0],/same identity marker \(TC-1, TC-2\)/);
 assert.equal(duplicates.linkCandidates.length,0);
});
