'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {sha}=require('../src/utils');
const auto=require('../src/ba-automatic-workflow');
const ids=require('../src/ba-jira-draft-ids');
const workflow=require('../src/br-workflow');

const source={problem:'Employees need to submit projects to the portfolio team.',scope:'Project intake and portfolio routing.',
 targetProcess:'A new submission reaches the portfolio review queue.',acceptance:'A valid project is assigned a unique tracking ID.',questions:'Does the workshop run before or during drafting?'};
const intake={title:'Route submitted projects',objective:source.problem,scope:source.scope,
 acceptanceCriteria:'Given a valid project request, submitting assigns a tracking ID and creates a review item.',features:[{
  title:'Project intake',description:'Route project submissions.',stories:[{title:'Track submissions',description:'See the assigned portfolio queue.',tasks:[{
   title:'Confirm the project delivery owner',description:'Record the confirmed project owner on the tracking record.',roleId:'project-manager'
  }]}]
 }]};
const sequencing={title:'Enforce workshop sequencing',objective:'The workshop must finish before drafting starts.',
 scope:'Architecture discovery workshops.',acceptanceCriteria:'Block all drafting until the workshop is complete.',features:[]};

async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-ba-overview-'));
 t.after(()=>fs.rm(directory,{force:true,recursive:true}));
 const registry={fileFor:id=>path.join(directory,id,'project.json')};
 const initial=await workflow.load(registry,'test');
 const register=await workflow.write(registry,'test',initial.revision,next=>{
  next.importEpoch=1;next.importDigest=sha('document');next.importName='Project intake.pdf';
  next.discoveryRevision='revision';next.reviewRevision='revision';next.discoveryAnswers=auto.mappedAnswers(source);
  next.mappingCompleted={preflights:[{issues:[{severity:'blocker',category:'contradiction',detail:'The source describes both parallel and sequential workshops.'}]}]};
 });
 const drafts=await workflow.generated(registry,'test',register.revision,{discoveryRevision:'revision',requirements:[intake,sequencing],automatic:true,actor:'BA'});
 return {registry,drafts};
}

test('review findings stay visible while the BA publishes both flagged and clean drafts and later updates the same Epic',async t=>{
 const {registry,drafts}=await fixture(t);
 const input=drafts.brs.map(auto.draftForReview),concerns=auto.sourceConcerns(drafts);
 const verdict={id:'BR-002',quote:'The workshop must finish before drafting starts.',reason:'Unresolved conflict.',conflict:0};
 assert.throws(()=>auto.parseQuality(JSON.stringify({excluded:[{id:'BR-001',quote:'No such source statement.',reason:'Unsupported',conflict:0}]}),input,concerns),/specific draft statement/);
 const runtime=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const start=runtime.indexOf('async function assessAutomaticDrafts('),end=runtime.indexOf('async function runBRPreparation(',start);
 assert.ok(start>=0&&end>start);
 let calls=0;
 const assess=vm.runInNewContext('('+runtime.slice(start,end).trim()+')',{
  registry,brWorkflow:workflow,baAutomatic:auto,activeProject:{id:'test'},dashboard:null,
  activeAiTarget:async()=>({}),roleSkillPrompt:async()=>'',
  aiAnswer:async(_target,prompt)=>{calls++;return JSON.stringify({excluded:prompt.includes('"id":"BR-002","title"')&&prompt.includes(verdict.quote)?[verdict]:[]});}
 });
 const {signal}=new AbortController();
 await assess('test',signal);
 await assess('test',signal);
 assert.equal(calls,2);
 const reviewed=await workflow.load(registry,'test');
 assert.deepEqual(auto.publicationIssues(reviewed),[]);
 assert.match(auto.sourceNotes(reviewed).join(' '),/question 12/);
 assert.match(auto.sourceNotes(reviewed).join(' '),/BR-002/);
 const changes=workflow.plan(workflow.projectPreparedJira(reviewed));
 assert.deepEqual([...new Set(changes.map(row=>row.path.split('/')[0]))],['BR-001','BR-002']);
 assert.match(auto.isoDocument('Project intake.pdf',reviewed,''),/BR-002 · Enforce workshop sequencing/);
 assert.equal(reviewed.brs[1].status,'draft');
 assert.equal(changes.find(row=>row.title==='Confirm the project delivery owner').roleId,'project-manager');
 const after=await workflow.approvePreparedJira(registry,'test',reviewed.revision,{
  actor:'BA',expectedPlan:sha(JSON.stringify(changes)),publication:{roots:[],rows:[]}
 });
 assert.equal(after.brs.find(br=>br.id==='BR-002').status,'approved');
 const epic=changes.find(row=>row.path==='BR-002');
 await workflow.recorded(registry,'test',after.revision,{...epic,key:'TC-42'});
 await assess('test',signal);
 const published=await workflow.load(registry,'test');
 assert.match(auto.sourceNotes(published).join(' '),/BR-002/);
 assert.equal(calls,2);
 await workflow.edit(registry,'test',published.revision,{brId:'BR-002',actor:'BA',automatic:true,
  content:{...sequencing,objective:'The BA records the agreed workshop schedule.',acceptanceCriteria:'The agreed schedule is available for review.'}});
 await assess('test',signal);
 const corrected=await workflow.load(registry,'test');
 assert.equal(corrected.baDraftQuality.excluded.length,0);
 const update=workflow.plan(workflow.projectPreparedJira(corrected)).find(row=>row.path===epic.path);
 assert.equal(update.action,'update');
 assert.equal(update.key,'TC-42');
 assert.match(auto.invalidDraft({...intake,acceptanceCriteria:'TBD'}),/acceptance criteria/);
});

test('unrelated Jira markers get fresh local identifiers without adopting or changing Jira issues',async t=>{
 const {registry,drafts}=await fixture(t);
 const marker=nodePath=>'atgv-'+sha(nodePath).slice(0,24);
 const inventory=[{key:'TC-761',fields:{summary:'BR-001: Person Name CRUD Interface',issuetype:{name:'Epic'},labels:[marker('BR-001')]}},
  {key:'TC-712',fields:{summary:'BR-012: Person Name CRUD',issuetype:{name:'Epic'},labels:[]}}];
 const changes=workflow.plan(workflow.projectPreparedJira(drafts));
 const renumber=ids.plan(drafts,changes,inventory,marker);
 assert.deepEqual(renumber,[{id:'BR-001',replacement:'BR-013'}]);
 assert.deepEqual(ids.plan(drafts,changes,[{...inventory[0],fields:{...inventory[0].fields,summary:'BR-001: Route submitted projects'}}],marker),[]);
 assert.deepEqual(ids.plan({...drafts,pending:{'BR-001/F-001':{action:'create'}}},changes,inventory,marker),[]);
 const revised=await workflow.renumberDrafts(registry,'test',drafts.revision,renumber);
 assert.equal(revised.brs[0].id,'BR-013');
 assert.equal(revised.brs[0].features[0].id,drafts.brs[0].features[0].id);
 assert.deepEqual(revised.synced,{});
 const repaired=await workflow.repairPendingExports(registry,'test');
 assert.equal(repaired.failures.length,0);
 assert.ok(workflow.plan(workflow.projectPreparedJira(repaired.register)).some(row=>row.path.startsWith('BR-013/')));
});

test('the project overview and four-stage workflow use separate views and share the top bar wave',async()=>{
 const root=path.join(__dirname,'..');
 const [html,ui,controller,css]=await Promise.all(['src/lib/webview/dashboard-html.js','media/ba-automatic-ui.js','media/start.js','media/start.css']
  .map(file=>fs.readFile(path.join(root,file),'utf8')));
 assert.match(html,/<section id="baRequirementsOverview"[\s\S]*id="baUncompletedPanel"[\s\S]*id="baJiraInventorySection"/);
 assert.doesNotMatch(html,/id="baAutoAI(?:Status)?"/);
 assert.match(controller,/discoveryView'\)\.classList\.toggle\('hidden',next!=='discovery'/);
 assert.match(controller,/baRequirementsOverview'\)\?\.classList\.toggle\('hidden',next!=='baOverview'/);
 assert.match(ui,/label:'Role',sortable:!hierarchy/);
 assert.match(ui,/classList\.toggle\('atgv-ba-ai-active',showingBusinessRequirements\)/);
 assert.match(ui,/setBusinessRequirementsActivity\?\.\(aiWorking\)/);
 assert.match(ui,/setBusinessRequirementsVisible\?\.\(showingBusinessRequirements\)/);
 assert.match(html,/data-ba-jira-view="list"[\s\S]*data-ba-jira-view="hierarchy"/);
 assert.match(css,/data-state="running"[^\n]*animation:ba-stage-spin/);
});
