 'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildImpactPlan}=require('../src/impact-plan');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');

test('impact plan finds linked Jira nodes, API/database designs and manual edit protection',()=>{
 const register={brs:[{id:'BR-1',status:'approved',approvedRevision:3},{id:'BR-2',status:'approved',approvedRevision:2}],synced:{'BR-1':{key:'ABC-1',kind:'Epic'},'BR-1/feature-1':{key:'ABC-2',kind:'Story'},'BR-2':{key:'ABC-3'}},jiraWorkHistory:{'ABC-1':{known:true,started:true,status:'In Progress'}}};
 const designState={designs:{api:[{id:'a',status:'approved',sourceBusinessRequirements:[{id:'BR-1',revision:2}]}],database:[{id:'d',status:'draft',manuallyEdited:true,sourceBusinessRequirements:[{id:'BR-1',revision:2}]}],mockup:[{id:'m',status:'approved',sourceBusinessRequirements:[{id:'BR-2',revision:2}]}]}};
 const plan=buildImpactPlan(register,designState,['BR-1/feature-1']);
 assert.deepEqual(plan.affectedRoots,['BR-1']);assert.equal(plan.requirements.length,1);
 assert.equal(plan.jira.length,2);assert.equal(plan.designs.length,2);
 assert.equal(plan.designs.find(x=>x.kind==='database').action,'human-reconcile');
 assert.equal(plan.designs.find(x=>x.kind==='api').action,'propose-new-draft');
 assert.ok(plan.proposedDownstreamReviews.some(x=>x.includes('test')));
 assert.equal(plan.automatedWritesAllowed,false);assert.equal(plan.requiresHumanReview,true);
});

test('impact plan excludes unrelated requirements, Jira issues and designs',()=>{
 const plan=buildImpactPlan({brs:[{id:'B2'}],synced:{B2:{key:'J2'}}},{designs:{ux:[{id:'x',sourceBusinessRequirements:[{id:'B2'}]}]}},['B1']);
 assert.deepEqual(plan.jira,[]);assert.deepEqual(plan.designs,[]);assert.deepEqual(plan.missingRequirements,['B1']);
});

test('impact planner bounds incoming affected roots',()=>{
 assert.throws(()=>buildImpactPlan({}, {}, Array.from({length:102},(_,i)=>'BR-'+i)),/Too many/);
});

test('UI standardization uses one icon per action without changing disabled states or handlers',()=>{
 const js=read('media/start.js'),css=read('media/start.css');
 assert.match(js,/function atgvDecorateControls\(root=document\)/);
 assert.match(js,/if\(button\.querySelector\('svg,\.atgv-flat-icon,\.ba-flat-icon'\)/);
 assert.match(js,/new MutationObserver\(atgvDecorateSoon\)/);
 assert.match(css,/\.atgv-flat-icon/);assert.match(css,/--atgv-success/);
 assert.match(css,/--atgv-failure/);
});

test('all pages receive inline notice while existing critical notifications are preserved',()=>{
 const js=read('media/start.js');assert.match(js,/function atgvInlineNotice/);
 assert.match(js,/atgvInlineNotice\(statusText,error\)/);
 assert.match(js,/notifyTop\(statusText/);assert.match(js,/region\.setAttribute\('aria-live',error\?'assertive':'polite'\)/);
});

test('design cards expose regeneration as a visible button, draft approvals remain guarded',()=>{
 const js=read('media/start.js');assert.match(js,/atgv-secondary-actions/);
 assert.match(js,/actions\.append\(regen\)/);assert.doesNotMatch(js,/secondary\.append\(secondarySummary,regen\)/);
 assert.match(js,/designDirty/);
 const ext=read('test/generated/extension-source.txt');assert.match(ext,/const groundedImpact=buildImpactPlan\(register,designs,cr\.paths\)/);
 assert.match(ext,/askAiSendConsent/);assert.match(ext,/recordAIChangeImpact/);
});

test('workspace navigation targets unique main pages and rejects nonexistent routes',()=>{
 const host=read('test/generated/extension-source.txt'),client=read('media/start.js');
 const ids=[...host.matchAll(/<main id="([^"]+)"/g)].map(x=>x[1]);
 assert.ok(ids.length>=5);assert.equal(new Set(ids).size,ids.length);
 assert.match(client,/if\(!target\|\|!pages\.includes\(target\)\)/);
 assert.match(client,/for\(const page of pages\)page\.classList\.toggle\('hidden',page!==target\)/);
});

test('current BA milestone does not repeat its own primary Open action or duplicate All filter',()=>{
 const js=read('media/start.js');
 assert.doesNotMatch(js,/id=\"baNextActionButton\"/);
 assert.match(js,/function baGuideRender\(progress,displayed,details\)/);
 assert.doesNotMatch(js,/impact\.append\(brMetric\('All',count,'all'\)/);
 assert.match(js,/\['all','All Business Requirements'\]/);
});
