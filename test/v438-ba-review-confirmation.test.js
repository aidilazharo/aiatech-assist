'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
function clickScenario({busy='',importBusy=false,reviewRevision='review-v1',discoveryRevision='review-v1',dirty=false,autosaving=false,filled=12,total=12}={}){
 const commands=[],messages=[],progress=[];
 let handler;
 const button={disabled:false,addEventListener(_event,fn){handler=fn;}};
 const start=ui.indexOf('function confirmSavedBAReview(){');
 const end=ui.indexOf("\n$('baOpenChangeProposal')",start);
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(ui.slice(start,end),{
  $:name=>{assert.equal(name,'baReviewFinish');return button;},
  baBusyTask:busy,discoveryImportBusy:importBusy,
  activeId:'tech-cockpit',selectedRole:'business-analyst',
  brState:{reviewRevision,discoveryRevision},
  discoveryDirty:dirty,discoveryAutosaving:autosaving,
  currentDiscoveryReadiness:()=>({filled,total,missing:[{label:'Open issues'}]}),
  baBusy:(action,message)=>progress.push({action,message}),
  send:(command,payload)=>commands.push({command,payload}),
  status:(message,error)=>messages.push({message,error})
 });
 handler();
 return {commands,messages,progress};
}
test('saved review is submitted even when the UI owner list is temporarily stale',()=>{
 const result=clickScenario();
 assert.equal(result.commands.length,1);
 assert.equal(result.commands[0].command,'confirmDiscoveryReview');
 assert.equal(result.commands[0].payload.discoveryRevision,'review-v1');
 assert.equal(result.progress[0].action,'confirmReview');
});
test('incomplete discovery shows actionable feedback instead of an inert button',()=>{
 const result=clickScenario({filled:11});
 assert.equal(result.commands.length,0);
 assert.match(result.messages[0].message,/11\/12 complete/);
});
test('unsaved edits and in-progress operations cannot confirm a stale review',()=>{
 for(const input of [{dirty:true},{autosaving:true},{busy:'generate'},{importBusy:true},{reviewRevision:'old'}]){
  const result=clickScenario(input);
  assert.equal(result.commands.length,0);
  assert.equal(result.messages[0].error,true);
 }
});
test('visible acknowledgement is enabled independent of cached ownership, while host still verifies',()=>{
 assert.match(ui,/finish\.disabled=baBusyTask==='confirmReview'/);
 assert.doesNotMatch(ui,/finish\.disabled=!!baBusyTask\|\|!mine/);
 assert.match(host,/case 'confirmDiscoveryReview':\{\s*try\{\s*requireOpened\(\);await requireBAOwner\('ba-discovery'\)/);
 assert.match(host,/const actor=await verifiedBAActor\(\)/);
 assert.match(host,/case 'confirmDiscoveryReview':[\s\S]*?acknowledgeRisks:unresolved/);
});
test('confirmation cancellation, failures and success return a UI result to clear busy state',()=>{
 assert.match(host,/baGeneralization\.reviewState\(register,review\)\.flagged/);
 assert.match(host,/type:'baReviewConfirmResult',success:false,/);
 assert.match(host,/type:'baReviewConfirmResult',success:true/);
 assert.match(ui,/if\(m\.type==='baReviewConfirmResult'\)/);
 assert.match(ui,/if\(baBusyTask==='confirmReview'\)baBusy\('',m\.message/);
});
