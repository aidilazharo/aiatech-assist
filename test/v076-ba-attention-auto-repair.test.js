'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('all five BA sections live in one equally-spaced panel grid',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const first=html.indexOf('<div class="ba-auto-artifacts">');
 const last=html.indexOf('<div class="ba-auto-actions">',first);
 assert.ok(first>=0&&last>first);
 const panels=html.slice(first,last);
 const ids=['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira','baAutoHistory'];
 let prior=-1;
 for(const id of ids){
  const i=panels.indexOf('id="'+id+'"');
  assert.ok(i>prior, id+' should be a direct panel inside the same grid');
  prior=i;
 }
 const css=read('media/atgv-consistency.css');
 assert.match(css,/--atgv-ba-section-gap:12px/);
 assert.match(css,/\.ba-auto-artifacts\s*\{[\s\S]*?gap:var\(--atgv-ba-section-gap\)/);
 assert.match(css,/#baAutoHistory\{margin:0!important\}/);
 assert.match(css,/\.ba-auto-artifacts > \.ba-auto-artifact > summary/);
});

test('AI resolve action, stop and live status belong to Generated Requirements',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const ui=read('media/ba-automatic-ui.js');
 for(const id of ['baAutoRequirementsToolbar','baAutoResolveStatus','baAutoResolveAttention','baAutoResolveStop']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(ui,/invoke\('baAutoResolveAttention',\{revision:brState\.revision\}\)/);
 assert.match(ui,/invoke\('baStopAttentionResolve'\)/);
 assert.match(ui,/m\.type==='baAutoResolveProgress'/);
 assert.match(ui,/m\.type==='baAutoResolveResult'/);
 assert.match(ui,/aiResolve\.running\|\|state\?\.phase/);
});

test('only current, actively rejected drafts are eligible',()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const a=runtime.indexOf('function currentAttentionFindings('),b=runtime.indexOf('async function resolveBAAttention(',a);
 assert.ok(a>0&&b>a);
 const fn=vm.runInNewContext(runtime.slice(a,b)+'\ncurrentAttentionFindings',{
  baAutomatic:{excludedDraft:(_register,br)=>br.id==='BR-013'}
 });
 const register={baDraftQuality:{excluded:[{id:'BR-013'},{id:'BR-014'},{id:'BR-020'}]},
  brs:[{id:'BR-013',status:'draft'},{id:'BR-014',status:'draft'},
   {id:'BR-020',status:'approved'}]};
 assert.deepEqual(Array.from(fn(register),r=>r.id),['BR-013']);
});

test('AI repair is bounded and does not bypass approval or publish Jira',()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const a=runtime.indexOf('async function resolveBAAttention('),b=runtime.indexOf('async function runBRPreparation(',a);
 assert.ok(a>0&&b>a);
 const worker=runtime.slice(a,b);
 assert.match(worker,/attempt<=2/);
 assert.match(worker,/await requireBAOwner\('ba-discovery'\)/);
 assert.match(worker,/await requireBAOwner\('ba-br-'\+item\.id\)/);
 assert.match(worker,/await assessAutomaticDrafts\(projectId,signal\)/);
 assert.match(worker,/currentAttentionFindings\(checked\)/);
 assert.doesNotMatch(worker,/brWorkflow\.approve\s*\(|brJiraSync\s*\(|publishPreparedBRs\s*\(/);
 assert.match(runtime,/const resolutionIds=options\.autoResolve===true/);
 assert.match(runtime,/const focused=resolutionIds\?\[\.\.\.resolutionIds\]/);
 assert.match(runtime,/const confirmed=automatic\|\|options\.autoResolve===true\?proceed/);
 assert.match(runtime,/case 'baStopAttentionResolve':/);
});

test('literal DoD [ ] text continues as plain text',()=>{
 const jira=read('src/jira-preview-details.js');
 assert.ok(jira.includes("'[ ] '"),'Jira DoD list markers should remain literal text');
 const ui=read('media/ba-automatic-ui.js');
 assert.doesNotMatch(ui,/createElement\('input'\).*type='checkbox'/);
});
