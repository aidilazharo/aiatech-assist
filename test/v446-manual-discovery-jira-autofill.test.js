'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
const {planFields,MISSING}=require('../src/jira-field-preflight');

function saveHarness(){
 let disk={revision:'r1',answers:{questions:'Pending approval decision',scope:'Scope defined'}};
 let register={revision:'br1',discoveryRevision:'r1',discoveryAnswers:{...disk.answers}};
 let fileWrites=0,registryWrites=0,linkShouldFail=false;
 const events=[];
 const discovery={
  QUESTIONS:[['questions'],['scope']],
  load:async()=>disk,
  save:async(_,__,answers)=>{fileWrites++;disk={revision:'r'+(fileWrites+1),answers:{...answers}};return disk;},
  changesForRegistration:()=>[{key:'questions',before:'Pending approval decision',after:'NONE'}]
 };
 const brWorkflow={
  load:async()=>register,
  discoverySaved:async(_,__,___,revision,details)=>{
   registryWrites++;
   if(linkShouldFail)throw Error('Simulated temporary BR register lock');
   register={revision:'br'+(registryWrites+1),discoveryRevision:revision,discoveryAnswers:{...details.answers}};
   return register;
  }
 };
 const start=host.indexOf("case 'saveDiscovery':{");
 const end=host.indexOf("case 'generateBusinessRequirements':",start);
 assert.ok(start>=0&&end>start);
 const context={
  discovery,brWorkflow,registry:{},activeProject:{id:'demo'},
  requireOpened:()=>{},requireBAOwner:async()=>{},
  dashboard:{webview:{postMessage:async item=>events.push(item)}},
  refreshDashboard:async()=>{},notice:async()=>{},
 };
 const save=vm.runInNewContext('(async function(msg){switch(msg.command){'+host.slice(start,end)+'default:break;}})',context);
 return {save,events,getDisk:()=>disk,getRegister:()=>register,getWrites:()=>({fileWrites,registryWrites}),setLinkFailure:v=>{linkShouldFail=v;}};
}
test('manual Save reuses a persisted file when workflow linking fails and is explicitly retried',async()=>{
 const h=saveHarness();
 h.setLinkFailure(true);
 await assert.rejects(h.save({command:'saveDiscovery',revision:'r1',answers:{questions:'NONE',scope:'Scope defined'}}),/workflow could not be updated/);
 assert.equal(h.getDisk().answers.questions,'NONE');
 assert.equal(h.getWrites().fileWrites,1);
 assert.equal(h.events.at(-1).linkPending,true);
 h.setLinkFailure(false);
 await h.save({command:'saveDiscovery',revision:h.getDisk().revision,answers:{questions:'NONE',scope:'Scope defined'}});
 assert.equal(h.getWrites().fileWrites,1,'retry must not rewrite an already saved Discovery file');
 assert.equal(h.getRegister().discoveryRevision,h.getDisk().revision);
 assert.ok(h.events.some(item=>item.type==='brUpdated'));
});
test('identical manually saved answers do not create a new revision or invalidate the BR review',async()=>{
 const h=saveHarness();
 await h.save({command:'saveDiscovery',revision:'r1',answers:{questions:'Pending approval decision',scope:'Scope defined'}});
 assert.deepEqual(h.getWrites(),{fileWrites:0,registryWrites:0});
});
test('stale Discovery revisions are rejected without overwriting edited files',async()=>{
 const h=saveHarness();
 await assert.rejects(h.save({command:'saveDiscovery',revision:'old',answers:{questions:'NONE',scope:'Scope defined'}}),/changed on disk/);
 assert.equal(h.getWrites().fileWrites,0);
});
test('automatic Discovery save messages are rejected by the host even from stale webviews',async()=>{
 const h=saveHarness();
 await assert.rejects(h.save({command:'saveDiscovery',revision:'r1',autosave:true,answers:{questions:'NONE',scope:'Scope defined'}}),/Automatic Discovery saving is disabled/);
 assert.equal(h.getWrites().fileWrites,0);
});
test('Discovery questions cannot schedule an unrequested background write',()=>{
 assert.doesNotMatch(ui,/function scheduleDiscoveryAutosave\(/);
 assert.doesNotMatch(ui,/autosave:true/);
 assert.match(ui,/Unsaved changes · click Save 12 Questions to save manually/);
 assert.match(ui,/Save not completed: /);
 assert.match(ui,/Save partially completed · Retry manually/);
 assert.match(host,/importDiscovery\|saveDiscovery\|processDiscoverySources/);
});
test('all Jira fields have reviewable values or missing-evidence markers without fabricated values',()=>{
 const item={title:'Finance approval',description:'Approve a charge code'};
 const meta=[
  {id:'summary',name:'Summary',required:true,schema:{type:'string'}},
  {id:'description',name:'Description',required:true,schema:{type:'string'}},
  {id:'customfield_11000',name:'Custom Business Notes',schema:{type:'string'}},
  {id:'customfield_11001',name:'Acceptance Criteria',schema:{type:'string'}},
  {id:'customfield_11002',name:'Unspecified Date',schema:{type:'date'}},
  {id:'customfield_11003',name:'Risk Option',required:true,schema:{type:'option'}},
  {id:'assignee',name:'Assignee',schema:{type:'user'}}
 ];
 const plan=planFields(item,meta,{approvedBR:{acceptanceCriteria:'When approved, create the code'}});
 assert.equal(plan.fields.length,meta.length);
 assert.equal(plan.fields.every(field=>field.display.length>0),true);
 assert.equal(plan.extraFields.customfield_11000,undefined);
 assert.equal(plan.fields.find(field=>field.id==='customfield_11000').status,'missing-evidence');
 assert.equal(plan.extraFields.customfield_11001,'When approved, create the code');
 assert.equal(plan.extraFields.customfield_11002,undefined);
 assert.equal(plan.extraFields.customfield_11003,undefined);
 assert.equal(plan.autofillSummary.total,meta.length);
 assert.equal(plan.autofillSummary.textPlaceholders,0);
 assert.equal(plan.autofillSummary.missingEvidence,1);
 assert.ok(plan.autofillSummary.previewOnly>=2);
 assert.match(plan.blocking.join(' '),/Risk Option/);
});
