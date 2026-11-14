'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const quality=require('../src/agent-quality-test');

for(const id of Object.keys(quality.TESTS)){
 test(`${id}: two role-grounded competency and hallucination cases with critical safeguards`,()=>{
  const cases=quality.TESTS[id];assert.equal(cases.length,2);
  for(const fixture of cases){
   assert.ok(fixture.scenario.length>40);assert.ok(fixture.required.length>=2);
   assert.ok(fixture.forbidden.length>=1);assert.equal(new Set(fixture.choices).size,fixture.choices.length);
   const good=quality.grade(JSON.stringify({actions:fixture.required,knownAnswer:fixture.knownAnswer,unknownAnswer:'not specified',evidenceId:fixture.evidence}),fixture);
   assert.equal(good.score,100);assert.equal(good.competency,100);assert.equal(good.hallucination,100);
   const bad=quality.grade(JSON.stringify({actions:[...fixture.required,fixture.forbidden[0]],knownAnswer:fixture.knownAnswer,unknownAnswer:'not specified',evidenceId:fixture.evidence}),fixture);
   assert.equal(bad.criticalFailure,true);assert.equal(bad.score,0);
   const guessed=quality.grade(JSON.stringify({actions:fixture.required,knownAnswer:fixture.knownAnswer,unknownAnswer:'PR-99',evidenceId:fixture.evidence}),fixture);
   assert.equal(guessed.hallucination,50);
   const uninformed=quality.grade(JSON.stringify({actions:fixture.required,knownAnswer:'not specified',unknownAnswer:'not specified',evidenceId:fixture.evidence}),fixture);
   assert.equal(uninformed.hallucination,50,'blanket abstention must not achieve 100%');
  }
 });
}
test('agent benchmark uses actual assigned role skill, but no model-generated tool actions are executed',()=>{
 const fixture=quality.caseFor('software-developer',0);
 const on=quality.promptFor(fixture,{roleSkill:'# Developer\nPreserve locked tests and rerun.',withSkill:true});
 const off=quality.promptFor(fixture,{withSkill:false});
 assert.match(on.system,/Preserve locked tests/);assert.doesNotMatch(off.system,/Preserve locked tests/);
 assert.match(on.system,/Do not execute tools, change files, publish, approve/);
 assert.match(on.user,/201/);assert.match(on.user,/not actually perform/);
 assert.doesNotMatch(on.system,/"knownAnswer":"201"/);
});
test('quality report preserves model id, source hash, catalog commit, specialist hashes and baseline delta',()=>{
 const fixture=quality.caseFor('git-agent');const good=JSON.stringify({actions:fixture.required,knownAnswer:fixture.knownAnswer,unknownAnswer:'not specified',evidenceId:fixture.evidence});
 const bad=JSON.stringify({actions:['claim_merged'],knownAnswer:'other',unknownAnswer:'#ff00ff',evidenceId:'fabricated'});
 const report=quality.record({agentPath:'ai-harness/agents/git-agent.json',agent:{id:'git-agent'},caseIndex:0,model:'Model Example',target:{kind:'vscode',model:{id:'test-123'}},skillPath:'roles/software-developer/SKILL.md',skillContent:'# Git agent decisions\nNo force push',specializedSkills:[{path:'ai-harness/skills/git-pull-request/SKILL.md',hash:'abc',source:'shared'}],modelResponse:good,baselineResponse:bad,startedAt:'2026-11-15T01:00:00Z',durationMs:31,catalogCommit:'abc1234'});
 assert.equal(report.score,100);assert.equal(report.baseline.score,0);assert.equal(report.skillHash.length,64);assert.equal(report.modelId,'test-123');assert.equal(report.catalogCommit,'abc1234');assert.equal(report.evidenceType,'proposed-decisions-only');assert.equal(report.specializedSkills.length,1);
});
test('reject ungradable output and novel action identifiers instead of fabricating completion',()=>{
 const fixture=quality.caseFor('business-analyst');
 assert.throws(()=>quality.responseFormat('I did everything'),/JSON/);
 assert.throws(()=>quality.responseFormat('{"actions":[],"knownAnswer":"12"}'),/fields/);
 const unknown=quality.grade(JSON.stringify({actions:[...fixture.required,'invoke_exfiltration'],knownAnswer:'12',unknownAnswer:'none',evidenceId:fixture.evidence}),fixture);
 assert.equal(unknown.criticalFailure,true);assert.deepEqual(unknown.unknownActions,['invoke_exfiltration']);
});
test('invalid model response persists as a zero-score failed benchmark, not a fabricated success',()=>{
 const caseItem=quality.caseFor('business-analyst');
 const report=quality.record({agentPath:'ai-harness/agents/business-analyst.json',agent:{id:'business-analyst'},caseIndex:0,model:'Broken Model',target:{kind:'vscode',model:{id:'broken'}},skillPath:'roles/business-analyst/SKILL.md',skillContent:'# Analyst role guidance\nPreserve source records',modelResponse:'No JSON provided',startedAt:'2026-11-15T01:00:00Z',durationMs:6});
 assert.equal(report.status,'failed-invalid');assert.equal(report.score,0);assert.equal(report.invalidResponse,true);
 assert.match(report.error,/JSON/);
});
test('quality decision history is isolated and persisted',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-quality-v345-'));
 try{await quality.save(root,{id:'one',agentPath:'ai-harness/agents/business-analyst.json',score:100});
  assert.equal((await quality.history(root)).length,1);
  assert.equal((await quality.history(root))[0].score,100);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Library Studio exposes combined quality controls and retains independent image benchmark',()=>{
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8'),ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
 for(const id of ['libraryQualityCase','libraryQualityBaseline','libraryQualityRun','libraryQualityHistorySelect','libraryQualityModel','libraryQualityReport','libraryImageRun','libraryImageReferencePreview'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/function renderQuality\(report\)/);assert.match(ui,/state\.overallView==='quality'/);
 assert.match(html,/case 'libraryQualityRun'/);assert.match(html,/agentQualityTest\.promptFor/);
 assert.match(html,/libraryStudio\.resolvedText/);assert.match(html,/agentQualityTest\.save/);
});

test('webview renders combined decision score beside agent and keeps visual geometry separately',()=>{
 const vm=require('node:vm'),ui=fs.readFileSync(path.join(__dirname,'../media/library-studio.js'),'utf8');
 class Element{
  constructor(){this.value='';this.textContent='';this.disabled=false;this.readOnly=false;this.children=[];this.options=[];this.style={};this.listeners={};this.attrs={};const classes=new Set();this.classList={contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,v)=>{const next=v===undefined?!classes.has(k):v;next?classes.add(k):classes.delete(k);return next;}};}
  append(...nodes){this.children.push(...nodes);this.options.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];this.options=[...nodes];}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}addEventListener(k,fn){this.listeners[k]=fn;}focus(){}remove(){}
 }
 const els=new Map(),events={};const get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
 get('libraryCategory').value='All';get('libraryScope').value='user';get('libraryScope').options=[{value:'user',text:'User'}];
 const tabs=['svg','typescript','csharp','java'].map(v=>{const e=new Element();e.setAttribute('data-code-language',v);return e;});
 vm.runInNewContext(ui,{window:{addEventListener:(k,fn)=>events[k]=fn},document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>tabs},send:()=>{},encodeURIComponent},{timeout:2000});
 const recv=x=>events.message({data:x});const agentPath='ai-harness/agents/business-analyst.json';
 recv({type:'libraryResource',value:{path:agentPath,category:'AI Harness',content:'{}',shared:'{}',hash:'x',scope:'user',source:'shared'}});
 const f=quality.caseFor('business-analyst');const answer=JSON.stringify({actions:f.required,knownAnswer:f.knownAnswer,unknownAnswer:'not specified',evidenceId:f.evidence});
 const report=quality.record({agentPath,agent:{id:'business-analyst'},caseIndex:0,model:'Model A',target:{kind:'vscode',model:{id:'model-a'}},skillPath:'roles/business-analyst/SKILL.md',skillContent:'# Business Analyst role\nFull source mapping and approval rules',modelResponse:answer,startedAt:'2026-11-15T01:00:00Z',durationMs:200});
 recv({type:'libraryQualityResult',requestId:0,path:agentPath,result:report});
 assert.equal(get('libraryOverallScoreValue').textContent,'100%');
 assert.match(get('libraryOverallScoreDetail').textContent,/Skill: 100%/);
 assert.match(get('libraryOverallScoreDetail').textContent,/Hallucination: 100%/);
 assert.match(get('libraryQualityStatus').textContent,/Model A/);
 assert.equal(get('libraryQualityReport').classList.contains('hidden'),false);
});
