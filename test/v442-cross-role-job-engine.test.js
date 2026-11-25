'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const os=require('node:os'),path=require('node:path'),fs=require('node:fs/promises');
const {DurableWorkflowEngine,retryRecoverable,category,fingerprint}=require('../src/atgv-job-engine');
async function sandbox(t,{preferSqlite=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-workflow-'));
 const engines=[];
 const openEngine=(options={})=>{
  const engine=new DurableWorkflowEngine({root,preferSqlite,...options});
  engines.push(engine);
  return engine;
 };
 const cleanup=async()=>{
  // All handles must close before unlinking SQLite/WAL files on Windows.
  // Attempt every close, but never hide a close or deletion failure.
  const errors=[];
  for(const engine of [...engines].reverse()){
   try{await engine.pending;engine.close();}catch(error){errors.push(error);}
  }
  if(errors.length)throw new AggregateError(errors,'Failed to close workflow journals');
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 };
 t.after(cleanup);
 const engine=openEngine();
 return {root,engine,openEngine,cleanup};
}
test('v442: durable job metadata is restored without storing BR content or secrets',async t=>{
 const {root,engine,openEngine}=await sandbox(t);
 const sample='BR-001 confidential approval data';
 const begin=await engine.begin('tech-cockpit',{command:'processDiscoverySources',inputHash:fingerprint(sample),
  metadata:{brId:'BR-001',totalUnits:3,completedUnits:0}});
 await engine.checkpoint('tech-cockpit',begin.id,{step:'mapped_section_1',inputHash:fingerprint('part 1'),outputHash:fingerprint('response 1'),percent:33});
 const state=await engine.list('tech-cockpit');
 assert.equal(state.length,1);
 assert.equal(state[0].progress,33);
 assert.equal(state[0].steps.mapped_section_1.outputHash,fingerprint('response 1'));
 const saved=await fs.readFile(path.join(root,'atgv-workflows-tech-cockpit.json'),'utf8');
 assert.doesNotMatch(saved,/confidential approval data|response 1/);
 const restarted=openEngine({preferSqlite:false});
 await restarted.recover('tech-cockpit');
 const recovered=await restarted.list('tech-cockpit');
 assert.equal(recovered[0].status,'interrupted');
 assert.equal(recovered[0].steps.mapped_section_1.outputHash,state[0].steps.mapped_section_1.outputHash);
 assert.equal(recovered[0].retryable,true);
 const planned=await restarted.requestRetry('tech-cockpit',begin.id,{inputHash:fingerprint(sample)});
 assert.equal(planned.phase,'ready-to-resume');
 restarted.close();
});
test('v442: previously attempted Jira writes can never be automatically replayed',async t=>{
 const {engine}=await sandbox(t);
 const started=await engine.begin('tech-cockpit',{command:'brJiraSync',inputHash:fingerprint('approved-plan')});
 assert.equal(started.kind,'write');
 const records=await engine.recover('tech-cockpit');
 assert.equal(records[0].status,'reconcile-required');
 await assert.rejects(engine.requestRetry('tech-cockpit',started.id),/reconciliation|unsafe|Verify external/);
 assert.equal(category('pmJiraSetAssignee').kind,'write');
 assert.equal(category('architectPublish').kind,'write');
 assert.equal(category('catalogPull').kind,'install');
 assert.equal(category('brJiraPreview').kind,'read');
});
test('v442: isolated AI stages checkpoint results and only retry transient errors',async t=>{
 const {engine}=await sandbox(t);
 let calls=0;
 const result=await engine.runStages('tech-cockpit',{command:'generateBusinessRequirements',inputHash:fingerprint('source'),
  stages:[{id:'extract',inputHash:fingerprint('input 1'),execute:async()=>{calls++;if(calls===1)throw Object.assign(Error('Rate limited'),{status:429});return {count:4};}},
   {id:'validate',inputHash:fingerprint('input 2'),execute:async()=>({reviewRequired:true})}],
  retry:{baseDelayMs:1,maxAttempts:2}});
 assert.equal(calls,2);
 assert.equal(result.results.length,2);
 const [job]=await engine.list('tech-cockpit');
 assert.equal(job.status,'completed');
 assert.equal(job.progress,100);
 assert.ok(job.steps.extract);
 assert.ok(job.steps.validate);
 await assert.rejects(retryRecoverable(async()=>{}, {kind:'write'}),/cannot be automatically retried/);
});
test('v442: failure does not mark a stage complete and malformed results do not bypass gates',async t=>{
 const {engine}=await sandbox(t);
 await assert.rejects(engine.runStages('tech-cockpit',{command:'processDiscoverySources',inputHash:fingerprint('x'),
  stages:[{id:'map',inputHash:fingerprint('x'),execute:async()=>{throw Error('schema mismatch');}}],retry:{maxAttempts:1}}),/schema mismatch/);
 const [job]=await engine.list('tech-cockpit');
 assert.equal(job.status,'failed');
 assert.equal(Object.keys(job.steps).length,0);
 await assert.rejects(engine.begin('tech-cockpit',{command:'processDiscoverySources',inputHash:'private document content'}),/digest/);
 await assert.rejects(engine.begin('../bad',{command:'processDiscoverySources'}),/Invalid workflow project/);
});
test('v442: Symlinked journal directory and files are rejected',async t=>{
 const source=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-job-real-'));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-job-link-'));
 let journal,good;
 t.after(async()=>{
  try{journal?.close();}finally{good?.close();}
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  await fs.rm(source,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 });
 await fs.symlink(source,path.join(root,'link'),process.platform==='win32'?'junction':'dir');
 journal=new DurableWorkflowEngine({root:path.join(root,'link'),preferSqlite:false});
 await assert.rejects(journal.init(),/Unsafe workflow journal directory/);
 good=new DurableWorkflowEngine({root,preferSqlite:false});
 await good.init();
 const file=path.join(root,'atgv-workflows-demo.json');
 await fs.writeFile(path.join(source,'data.json'),'{}');
 await fs.symlink(path.join(source,'data.json'),file);
 await assert.rejects(good.list('demo'),/Unsafe workflow journal file/);
});
test('v442: SQLite journal persists across extension process instances when available',async t=>{
 const {root,engine,openEngine,cleanup}=await sandbox(t,{preferSqlite:true});
 const job=await engine.begin('tech-cockpit',{command:'uxPipelineGenerate',inputHash:fingerprint('ux-input')});
 await engine.finish('tech-cockpit',job.id);
 assert.ok(['sqlite','atomic-json'].includes(engine.mode));
 const sqlite=engine.mode==='sqlite';
 engine.close();
 const reopened=openEngine({preferSqlite:true});
 const jobs=await reopened.list('tech-cockpit');
 assert.equal(jobs[0].id,job.id);
 assert.equal(jobs[0].status,'completed');
 if(sqlite)assert.equal(reopened.mode,'sqlite');
 // Exercise the exact cleanup in the test body as well as the after hook.
 // A Windows sharing violation must fail this regression, not be ignored.
 await cleanup();
 assert.equal(engine.db,null);
 assert.equal(reopened.db,null);
 await assert.rejects(fs.stat(root),{code:'ENOENT'});
});
test('v442: all role/workspace commands use one journal with no unguarded replay',()=>{
 const fsSync=require('node:fs'),root=path.resolve(__dirname,'..');
 const runtime=fsSync.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 const ui=fsSync.readFileSync(path.join(root,'media/start.js'),'utf8');
 const html=fsSync.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
 assert.match(runtime,/atgvJobJournal\(\)\.begin/);
 assert.match(runtime,/atgvJobJournal\(\)\.finish/);
 assert.match(runtime,/atgvJobCheckpoint\(run\.projectId,'processDiscoverySources'/);
 for(const command of ['processDiscoverySources','architectCustomRun','uxPipelineGenerate','developerBrRun','pmJiraTransition','catalogPull','syncDocuments'])
  assert.match(runtime,new RegExp(command));
 assert.match(html,/id="atgvJobsButton"/);
 assert.match(html,/id="atgvJobsDialog"/);
 assert.match(ui,/function renderAtgvJobs\(/);
 assert.match(ui,/retryWorkflowJob/);
});

test('v442: resumed AI workflow restores only independently verified completed stages',async t=>{
 const {engine}=await sandbox(t);
 const inputHash=fingerprint('unchanged model + source + prompt version');
 let firstStage=0,lastStage=0;
 const localArtifact={reviewed:true,requirement:'BR-001'};
 const stageOne={id:'evidence',inputHash:fingerprint('evidence-v1'),
  execute:async()=>{firstStage++;return localArtifact;},
  restore:async()=>localArtifact};
 const stageTwo={id:'review',inputHash:fingerprint('review-v1'),
  execute:async()=>{lastStage++;if(lastStage===1)throw Error('Provider unavailable');return {approved:false,reviewRequired:true};}};
 await assert.rejects(engine.runStages('tech-cockpit',{command:'processDiscoverySources',inputHash,
  stages:[stageOne,stageTwo],retry:{maxAttempts:1}}),/Provider unavailable/);
 const [failed]=await engine.list('tech-cockpit');
 assert.equal(failed.status,'failed');assert.equal(firstStage,1);
 const done=await engine.runStages('tech-cockpit',{command:'processDiscoverySources',inputHash,
  resumeJobId:failed.id,stages:[stageOne,stageTwo],retry:{maxAttempts:1}});
 assert.deepEqual(done.restored,['evidence']);
 assert.equal(firstStage,1,'persisted artifact must avoid redundant AI calls');
 assert.equal(lastStage,2);
 assert.equal((await engine.list('tech-cockpit'))[0].status,'completed');
});
test('v442: changed source evidence blocks replay and modified stored artifact fails closed',async t=>{
 const {engine}=await sandbox(t);
 const inputHash=fingerprint('source-1'),artifact={id:'one'};
 const rows=[{id:'extract',inputHash:fingerprint('source-A'),execute:async()=>artifact,restore:async()=>({id:'tampered'})},
  {id:'review',inputHash:fingerprint('source-B'),execute:async()=>{throw Error('Retry later');}}];
 await assert.rejects(engine.runStages('tech-cockpit',{command:'generateBusinessRequirements',inputHash,stages:rows,retry:{maxAttempts:1}}),/Retry later/);
 const [record]=await engine.list('tech-cockpit');
 await assert.rejects(engine.runStages('tech-cockpit',{command:'generateBusinessRequirements',inputHash:fingerprint('changed source'),
  resumeJobId:record.id,stages:rows,retry:{maxAttempts:1}}),/changed/);
 await assert.rejects(engine.runStages('tech-cockpit',{command:'generateBusinessRequirements',inputHash,
  resumeJobId:record.id,stages:rows,retry:{maxAttempts:1}}),/changed or is incomplete/);
 const [failed]=await engine.list('tech-cockpit');
 assert.equal(failed.status,'failed');
});

test('v442: ATGV Workspace runs independent resumable source reviews and non-replayable PR publication',()=>{
 const fsSync=require('node:fs'),root=path.resolve(__dirname,'..');
 const source=fsSync.readFileSync(path.join(root,'src/repo-sync-workspace.js'),'utf8');
 const runtime=fsSync.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(source,/onWorkflowEvent=async\(\)=>null/);
 assert.match(source,/workspacePrepareSync/);
 assert.match(source,/workspacePublishSync/);
 assert.match(source,/if\(workflowJobId\)try\{await onWorkflowEvent\(\{type:'finish'/);
 assert.match(runtime,/const workspaceJournalContexts=new Map\(\)/);
 assert.match(runtime,/onWorkflowEvent:async event=>/);
 assert.equal(category('workspacePrepareSync').kind,'read');
 assert.equal(category('workspacePublishSync').kind,'write');
});
