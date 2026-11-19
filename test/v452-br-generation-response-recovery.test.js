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
test('no BR count cap: 26 and 200 generated requirements are accepted without truncation',()=>{
 for(const count of [26,200]){
  const items=Array.from({length:count},(_,i)=>({...valid,title:'BR '+i}));
  const parsed=br.parseGenerated(JSON.stringify({requirements:items}));
  assert.equal(parsed.length,count);
  assert.equal(parsed[count-1].title,'BR '+(count-1));
 }
});
test('zero requirements cannot be saved or transformed into a fake BR',()=>{
 assert.throws(()=>br.parseGenerated(JSON.stringify({requirements:[]})),error=>{
  assert.equal(error.code,'ATGV_GENERATION_COUNT');assert.equal(error.requirementCount,0);return true;
 });
});
test('incomplete or untrusted model content is never converted to an invented requirement',()=>{
 assert.throws(()=>br.parseGenerated('{}'),/at least one valid business requirement/);
 assert.throws(()=>br.parseGenerated('This is not JSON'),/no complete JSON/i);
 assert.throws(()=>br.parseGenerated(JSON.stringify({title:'Missing required fields'})),/at least one valid business requirement/);
});
test('host provides one source-scoped retry only for zero BR from a confirmed single mapped BR',()=>{
 assert.match(host,/initialFailure\?\.requirementCount===0&&mappedGroups\.length===1&&activeRequirements\.length<=1/);
 assert.match(host,/mergeForDiscovery\(group\.units\.map\(ref=>ref\.answers\),group\.units\)/);
 assert.match(host,/for\(const ref of group\.units\)sources\.push\(await baBrTextPipeline\.read/);
 assert.match(host,/No Business Requirements or Jira issues were changed/);
 assert.match(host,/throw Error\('AI generation failed validation twice:/);
});

test('before saving any number of drafts, host prompts Continue or Cancel and preserves existing Jira on cancellation',()=>{
 const segment=host.slice(host.indexOf('async function generateBusinessRequirements(options={})'),host.indexOf('async function verifyRoleDocumentImpactTarget('));
 assert.doesNotMatch(segment,/mappedGroups\.length>25/);
 assert.match(segment,/const count=proposed\.length/);
 assert.match(segment,/await uiWarning\('AI generated '\+count\.toLocaleString/);
 assert.match(segment,/if\(confirmed!==proceed\)/);
 assert.match(segment,/const updated=await brWorkflow\.generated/);
 assert.match(segment,/No Jira writes occur until the revised BRs are reviewed/);
 assert.match(segment,/for\(const \[index,group\] of mappedGroups\.entries\(\)\)/);
});
