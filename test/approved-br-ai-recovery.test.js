'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ba=require('../src/ba-automatic-workflow');
const runtime=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const workflow=fs.readFileSync(path.join(__dirname,'../src/br-workflow.js'),'utf8');
const requirement=(id,status='approved')=>({id,status,title:'Verified project requirement '+id,objective:'Deliver a source-backed result',scope:'Existing project scope',acceptanceCriteria:'Measurable acceptance criteria',features:[],approvedContent:{title:'Original approved content'},source:{discoveryRevision:'r'}});
function fixture(){
 const brs=[requirement('BR-011'),requirement('BR-014'),requirement('BR-019')];
 const register={discoveryRevision:'r',importDigest:'d',brs,baDraftQuality:{checked:{},excluded:[]}};
 for(const br of brs){const fingerprint=ba.qualityFingerprint(register,br);register.baDraftQuality.checked[br.id]=fingerprint;register.baDraftQuality.excluded.push({id:br.id,fingerprint,reason:'A source-backed correction is required.'});}
 return register;
}
test('approved findings are visible and owned approved requirements can enter revision repair',()=>{
 const register=fixture();
 const a=runtime.indexOf('function currentAttentionFindings('),b=runtime.indexOf('// Repair only missing roles',a);
 const current=vm.runInNewContext(runtime.slice(a,b)+'\ncurrentAttentionFindings',{baAutomatic:ba});
 assert.deepEqual(Array.from(current(register),r=>r.id),['BR-011','BR-014','BR-019']);
 assert.equal(ba.repairEligible(register,register.brs[0]),true);
 assert.equal(ba.repairEligible(register,{...register.brs[0],archivedFromRestart:true}),false);
 assert.equal(ba.repairEligible(register,{...register.brs[0],dependencyReviewRequired:true}),false);
 assert.equal(ba.repairEligible({...register,changeQueue:[{status:'pending',targetIds:['BR-011/F-001']}]},register.brs[0]),false);
});
test('repair summary includes unowned and unverified requirements; never reports zero for three current findings',()=>{
 const register=fixture(),ids=register.brs.map(x=>x.id);
 assert.equal(ba.repairOutcome(register,ids).resolved,0);
 assert.equal(ba.repairOutcome(register,ids).unresolved.length,3);
 register.baDraftQuality.excluded=register.baDraftQuality.excluded.filter(x=>x.id!=='BR-011');
 delete register.baDraftQuality.checked['BR-014'];
 register.baDraftQuality.excluded=register.baDraftQuality.excluded.filter(x=>x.id!=='BR-014');
 const result=ba.repairOutcome(register,ids);
 assert.equal(result.resolved,1);assert.equal(result.total,3);
 assert.deepEqual(result.unresolved.map(x=>x.id),['BR-014','BR-019']);
 assert.match(result.unresolved[0].reason,/not completed quality verification/);
});
test('selective approved repair uses revision path and cannot overwrite approval or remove existing work',()=>{
 assert.match(workflow,/repairDraft&&existing\.status==='approved'&&unchanged/);
 assert.match(workflow,/AI repair would remove an existing work item/);
 assert.match(workflow,/reason:'Automatic quality repair'/);
 assert.match(workflow,/status:'draft',needsRefresh:true,staleReason:'Revision awaiting approval'/);
 assert.match(runtime,/baAutomatic\.repairEligible\(before,br\)/);
 assert.match(runtime,/baAutomatic\.repairOutcome\(final,findings\.map/);
 assert.match(runtime,/if\(options\.autoResolve!==true\)await requireBAWritableCycle\(register\)/);
});
