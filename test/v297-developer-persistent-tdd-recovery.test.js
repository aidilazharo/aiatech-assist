'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const tdd=require('../src/developer-tdd');

async function temp(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-tdd-recovery-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return root;
}
test('v297 keeps a durable per-BR latest record and independent per-run history',async t=>{
 const root=await temp(t);
 const record=tdd.newRecord({projectId:'ABC',brId:'BR-009',revision:1,branch:'feature/first',worktree:'/tmp/first'});
 record.status='needs-attention';record.lastFailedCriterion='AC-07';
 record.repairHistory.push(tdd.safeRepairEvent({runId:record.runId,brId:'BR-009',phase:'green',outcome:'failed',criterion:'AC-07',message:'expected 1, got 2'}));
 await tdd.saveRecord(root,record);
 assert.deepEqual((await tdd.loadRecord(root,'ABC','BR-009')).repairHistory,record.repairHistory);
 const previousId=record.runId;
 record.previousRunId=previousId;record.runId=crypto.randomUUID();record.retryCount=1;
 record.repairHistory.push(tdd.safeRepairEvent({runId:record.runId,brId:'BR-009',phase:'repair',outcome:'passed',criterion:'AC-07',message:'fixed duplicate submission'}));
 await tdd.saveRecord(root,record);
 const historyFolder=path.join(root,'developer-tdd-evidence','ABC','runs');
 const files=await fs.readdir(historyFolder);
 assert.equal(files.length,2);
 assert.equal((await tdd.loadRecord(root,'ABC','BR-009')).repairHistory.length,2);
 assert.ok(files.some(f=>f.includes(previousId)));
});
test('v297 saves append-only diagnostic history with basic credential redaction',async t=>{
 const root=await temp(t);
 await tdd.appendRepairEvent(root,'ABC','BR-009',{runId:'run-1',criterion:'AC-07',phase:'repair',outcome:'failed',message:'Bearer SECRETXYZ got 2 results',model:'auto'});
 await tdd.appendRepairEvent(root,'ABC','BR-009',{runId:'run-2',criterion:'AC-07',phase:'repair',outcome:'passed',message:'exactly one submit',model:'manual'});
 const history=await fs.readFile(tdd.recordPath(root,'ABC','BR-009').replace(/\.json$/,'.repair-history.jsonl'),'utf8');
 const rows=history.trim().split('\n').map(JSON.parse);
 assert.equal(rows.length,2);assert.equal(rows[1].outcome,'passed');
 assert.ok(!history.includes('SECRETXYZ'));
});
test('v297 recovery rejects any changed or missing checkpointed source file',async t=>{
 const root=await temp(t),tree=path.join(root,'tree');await fs.mkdir(tree);
 await fs.writeFile(path.join(tree,'App.jsx'),'export default function App() {return null;}');
 await fs.mkdir(path.join(tree,'tests'));await fs.writeFile(path.join(tree,'tests','ac07.test.js'),'test("one",()=>{})');
 const checkpoint=await tdd.captureCheckpoint(tree,['App.jsx','tests/ac07.test.js']);
 assert.equal(await tdd.verifyCheckpoint(tree,checkpoint),true);
 await fs.writeFile(path.join(tree,'App.jsx'),'tampered');
 await assert.rejects(tdd.verifyCheckpoint(tree,checkpoint),/changed/);
 await fs.rm(path.join(tree,'App.jsx'));
 await assert.rejects(tdd.verifyCheckpoint(tree,checkpoint),/absent|unsafe/);
});
test('v297 cannot checkpoint symlinks, paths outside worktree or missing files',async t=>{
 const root=await temp(t),tree=path.join(root,'tree');await fs.mkdir(tree);
 await fs.writeFile(path.join(tree,'safe.js'),'ok');
 await fs.symlink(path.join(tree,'safe.js'),path.join(tree,'link.js'));
 await assert.rejects(tdd.captureCheckpoint(tree,['link.js']),/unsafe/);
 const outside=path.join(root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'file.js'),'secret');await fs.symlink(outside,path.join(tree,'linked-dir'));
 await assert.rejects(tdd.captureCheckpoint(tree,['linked-dir/file.js']),/escapes/);
 await assert.rejects(tdd.captureCheckpoint(tree,['../outside.js']),/Unsafe/);
});
test('v297 extension wires resume, model selection, locked tests and diagnostics into UI',async()=>{
 const [host,view]=await Promise.all([
  fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8'),
  fs.readFile(path.join(__dirname,'../media/start.js'),'utf8')]);
 assert.match(host,/developerTdd\.verifyCheckpoint\(/);
 assert.match(host,/storedTdd\.worktree/);
 assert.match(host,/failedCriterionIndex/);
 assert.match(host,/developerTdd\.appendRepairEvent\(/);
 assert.match(host,/if\(resuming&&cycleIndex<failedCriterionIndex\)continue;/);
 assert.match(host,/developerBrRecoveryInfo/);
 assert.doesNotMatch(view,/developerBrChangeRecoveryModel/);
 assert.match(view,/openModelPicker/);
 assert.match(view,/developerBrRecoveryHistory/);
});

test('v297 classifies duplicate UI/API effects for targeted repair',()=>{
 const diagnosis=tdd.diagnoseGreenFailure('AssertionError: expected [ <span></span>, <span></span> ] to have a length of 1 but got 2');
 assert.equal(diagnosis.kind,'duplicate-effect');
 assert.match(diagnosis.advice,/double-submission|duplicate/);
});
