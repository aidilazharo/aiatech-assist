'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),br=require('../src/br-workflow');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const valid={title:'Project submission',objective:'Project approval',scope:'Portfolio team',acceptanceCriteria:'Authorized submitters can file a project',features:[]};
test('generator accepts a complete single BR object from AI provider',()=>{
 const result=br.parseGenerated(JSON.stringify(valid));
 assert.equal(result.length,1);assert.equal(result[0].title,valid.title);
});
test('generator accepts JSON arrays and alternate plain requirements envelopes without losing BRs',()=>{
 for(const payload of [[valid],{businessRequirements:[valid]},{business_requirements:[valid]},{brs:[valid]},{requirements:[valid]}]){
  const result=br.parseGenerated(JSON.stringify(payload));
  assert.equal(result.length,1);assert.equal(result[0].objective,valid.objective);
 }
});
test('zero count and oversized responses produce actionable structured error, not corrupted BRs',()=>{
 for(const [items,count] of [[[],0],[Array.from({length:26},(_,i)=>({...valid,title:'BR '+i})),26]]){
  assert.throws(()=>br.parseGenerated(JSON.stringify({requirements:items})),error=>{
   assert.equal(error.code,'ATGV_GENERATION_COUNT');assert.equal(error.requirementCount,count);return true;
  });
 }
});
test('incomplete or untrusted model content is never converted to an invented requirement',()=>{
 assert.throws(()=>br.parseGenerated('{}'),/1–25/);
 assert.throws(()=>br.parseGenerated('This is not JSON'),/no complete JSON/i);
 assert.throws(()=>br.parseGenerated(JSON.stringify({title:'Missing required fields'})),/1–25/);
});
test('host provides one source-scoped retry only for zero BR from a confirmed single mapped BR',()=>{
 assert.match(host,/initialFailure\?\.requirementCount===0&&mappedGroups\.length===1&&activeRequirements\.length<=1/);
 assert.match(host,/mergeForDiscovery\(group\.units\.map\(ref=>ref\.answers\),group\.units\)/);
 assert.match(host,/for\(const ref of group\.units\)sources\.push\(await baBrTextPipeline\.read/);
 assert.match(host,/No Business Requirements or Jira issues were changed/);
 assert.match(host,/throw Error\('AI generation failed validation twice:/);
});
