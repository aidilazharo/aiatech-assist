'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const os=require('node:os'),path=require('node:path'),fs=require('node:fs/promises');
const {DurableWorkflowEngine,retryRecoverable,category,fingerprint}=require('../src/atgv-job-engine');
async function sandbox(t,{preferSqlite=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-workflow-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const engine=new DurableWorkflowEngine({root,preferSqlite});
 t.after(()=>engine.close());
 return {root,engine};
}
test('v442: durable job metadata is restored without storing BR content or secrets',async t=>{
 const {root,engine}=await sandbox(t);
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
 const restarted=new DurableWorkflowEngine({root,preferSqlite:false});
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
 t.after(()=>Promise.all([fs.rm(source,{recursive:true,force:true}),fs.rm(root,{recursive:true,force:true})]));
 await fs.symlink(source,path.join(root,'link'),'dir');
 const journal=new DurableWorkflowEngine({root:path.join(root,'link'),preferSqlite:false});
 await assert.rejects(journal.init(),/Unsafe workflow journal directory/);
 const good=new DurableWorkflowEngine({root,preferSqlite:false});
 t.after(()=>good.close());
 await good.init();
 const file=path.join(root,'atgv-workflows-demo.json');
 await fs.writeFile(path.join(source,'data.json'),'{}');
 await fs.symlink(path.join(source,'data.json'),file);
 await assert.rejects(good.list('demo'),/Unsafe workflow journal file/);
});
test('v442: SQLite journal persists across extension process instances when available',async t=>{
 const {root,engine}=await sandbox(t,{preferSqlite:true});
 const job=await engine.begin('tech-cockpit',{command:'uxPipelineGenerate',inputHash:fingerprint('ux-input')});
 await engine.finish('tech-cockpit',job.id);
 assert.ok(['sqlite','atomic-json'].includes(engine.mode));
 const sqlite=engine.mode==='sqlite';
 engine.close();
 const reopened=new DurableWorkflowEngine({root,preferSqlite:true});
 t.after(()=>reopened.close());
 const jobs=await reopened.list('tech-cockpit');
 assert.equal(jobs[0].id,job.id);
 assert.equal(jobs[0].status,'completed');
 if(sqlite)assert.equal(reopened.mode,'sqlite');
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
