'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const progress=require('../media/ba-progress');
const discovery=require('../src/ba-discovery');
const review=require('../src/discovery-review');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');

test('saved partial mapping opens AI Review, while unsaved changes and proposals block navigation',()=>{
 const data={updatedAt:'2026-11-19',revision:'r1',readiness:{filled:11,total:12}};
 const register={discoveryRevision:'r1'};
 const ready=progress.savedAnswersReady(data,register,false,false);
 assert.equal(ready,true);
 const steps=progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:ready,reviewFinalized:false});
 assert.equal(steps.find(step=>step.key==='mapping').complete,true);
 assert.equal(steps.find(step=>step.key==='review').selectable,true);
 assert.equal(steps.find(step=>step.key==='generate').selectable,false);
 assert.equal(progress.savedAnswersReady(data,register,true,false),false);
 assert.equal(progress.savedAnswersReady(data,register,false,true),false);
 assert.equal(progress.savedAnswersReady(data,{discoveryRevision:'old'},false,false),false);
 assert.equal(progress.savedAnswersReady({...data,updatedAt:null},register,false,false),false);
});

test('AI review highlights every unanswered question without inventing answers',()=>{
 const answers=Object.fromEntries(discovery.QUESTIONS.map(([key])=>[key,'Confirmed evidence']));
 answers.stakeholders='';answers.questions='';
 const original={readiness:'Ready',summary:'Looks complete',suggestions:[{key:'problem',severity:'Low',issue:'Clarify',suggestedAnswer:'',resolutionGuidance:''}]};
 const result=review.includeMissingAnswers(original,answers);
 assert.equal(result.readiness,'Needs attention');
 assert.deepEqual(result.suggestions.map(item=>item.key),['problem','stakeholders','questions']);
 for(const item of result.suggestions.slice(1)){assert.equal(item.suggestedAnswer,'');assert.match(item.resolutionGuidance,/Confirm/);}
 assert.equal(original.suggestions.length,1);
 const existing={...original,suggestions:[{key:'questions',severity:'High',issue:'Missing',suggestedAnswer:'',resolutionGuidance:'Ask'}]};
 assert.equal(review.includeMissingAnswers(existing,answers).suggestions.filter(item=>item.key==='questions').length,1);
});

test('retrying an interrupted save retains the changes needed for impact tracking',()=>{
 const old=Object.fromEntries(discovery.QUESTIONS.map(([key])=>[key,'Original']));
 const changed={...old,problem:'Revised problem'};
 const before={revision:'new-answers',answers:changed};
 const saved={revision:'retry-answers',answers:changed};
 const register={discoveryRevision:'old-answers',discoveryAnswers:old};
 assert.deepEqual(discovery.changesForRegistration(before,saved,register),[{key:'problem',before:'Original',after:'Revised problem'}]);
 assert.deepEqual(discovery.changesForRegistration(before,saved,{...register,discoveryRevision:before.revision}),[]);
 assert.deepEqual(discovery.changesForRegistration(before,saved,{...register,discoveryAnswers:{}}),[]);
});

test('an interrupted source selection can be submitted again',()=>{
 const begin=ui.indexOf('function updateSourceSubmitButton(){');
 const end=ui.indexOf('\n// The persistent header action',begin);
 assert.ok(begin>=0&&end>begin);
 const button={dataset:{},classList:{toggle(){}},disabled:false};
 const context={ $:()=>button,baMappingComplete:()=>false,discoveryImportBusy:false,baBusyTask:'',brState:{processedSources:['d'],mappingCompleted:null,sourceDocuments:[{digest:'d'}]},activeId:'project',selectedRole:'business-analyst',sourceSelectedDigests:new Set(['d']),discoveryImportProposal:null,baCanEdit:()=>true };
 vm.runInNewContext(ui.slice(begin,end)+'\nupdateSourceSubmitButton()',context);
 assert.equal(button.dataset.action,'submit');
 assert.equal(button.disabled,false);
 assert.equal(button.textContent,'Submit Selected Documents');
 context.discoveryImportBusy=true;
 vm.runInNewContext('updateSourceSubmitButton()',context);
 assert.equal(button.dataset.action,'processing');
 assert.equal(button.disabled,true);
});

test('Stop Mapping works throughout preflight and mapping but not during commit',()=>{
 const begin=ui.indexOf("$('baStopMapping').addEventListener('click',()=>{");
 const end=ui.indexOf("$('baMappingRetry').addEventListener",begin);
 assert.ok(begin>=0&&end>begin);
 for(const phase of ['preparing','preflight','repair','mapping','committing']){
  let click;const sent=[];
  const context={discoveryImportBusy:true,mappingRunPhase:phase,$:()=>({addEventListener(_event,handler){click=handler;}}),setDiscoveryImportBusy(){},send(type){sent.push(type);}};
  vm.runInNewContext(ui.slice(begin,end),context);click();
  assert.equal(sent.includes('stopDiscoverySourceMapping'),phase!=='committing',phase);
 }
});

test('partial AI reviews cannot generate requirements until all answers are saved',async()=>{
 const begin=host.indexOf('async function generateBusinessRequirements(options={}){');
 const end=host.indexOf('async function verifyRoleDocumentImpactTarget',begin);
 assert.ok(begin>=0&&end>begin);
 const context={requireOpened(){},async requireBAOwner(){},registry:{},activeProject:{id:'p'},discovery:{async load(){return {revision:'r',readiness:{filled:11,total:12}}}},brWorkflow:{async load(){return {sourceDocuments:[{}],importEpoch:1,reviewRevision:'r',discoveryRevision:'r'}}}};
 const generate=vm.runInNewContext(host.slice(begin,end)+'\ngenerateBusinessRequirements',context);
 await assert.rejects(generate(),/Complete and save all 12 discovery answers/);
});
