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
  baAutomatic:{hasQualityFinding:(_register,br)=>br.id==='BR-013'}
 });
 const register={baDraftQuality:{excluded:[{id:'BR-013'},{id:'BR-014'},{id:'BR-020'}]},
  brs:[{id:'BR-013',status:'draft'},{id:'BR-014',status:'draft'},
   {id:'BR-020',status:'approved'}]};
 assert.deepEqual(Array.from(fn(register),r=>r.id),['BR-013']);
});

test('AI repair is bounded and does not bypass approval or publish Jira',()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const a=runtime.indexOf('async function repairMissingDraftTaskRoles('),b=runtime.indexOf('async function runBRPreparation(',a);
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
 const requirementView=ui.slice(ui.indexOf('function renderRequirements('),ui.indexOf('function renderJira('));
 assert.ok(requirementView.length>0);
 assert.doesNotMatch(requirementView,/createElement\('input'\).*type='checkbox'/);
});

test('automatic preparation invokes repair before preparing Jira, without a webview scheduler',()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const ui=read('media/ba-automatic-ui.js');
 const a=runtime.indexOf('prepareJira:async()=>{'),b=runtime.indexOf('const currentState=await current()',a);
 const prepare=runtime.slice(a,b);
 assert.ok(a>0&&b>a);
 assert.ok(prepare.indexOf('await repairAutomaticBAFindings(')>-1);
 assert.ok(prepare.indexOf('await repairAutomaticBAFindings(')<prepare.indexOf('await prepareBRJiraPreview('));
 assert.doesNotMatch(ui,/scheduleRecovery\(\)/);
 assert.match(runtime,/await runBRPreparation\('jira',\{repairReport:report\}\)/);
});

test('automatic role repair preserves existing roles, skips foreign and approved work, and falls back to PM triage',async()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 const a=runtime.indexOf('async function repairMissingDraftTaskRoles('),b=runtime.indexOf('async function repairAutomaticBAFindings(',a);
 const rows=[
  {path:'BR-001/T-001',title:'Implement API',kind:'Task',action:'create',hash:'a'},
  {path:'BR-001/T-002',title:'Coordinate unclear task',kind:'Task',action:'create',hash:'b'},
  {path:'BR-001/T-003',title:'Manual role',kind:'Task',action:'create',roleLabel:'atgv-role-ux-designer'},
  {path:'BR-002/T-001',title:'Foreign',kind:'Task',action:'create'},
  {path:'BR-003/T-001',title:'Approved',kind:'Task',action:'create'}
 ];
 const register={revision:'r',pending:{},brs:[{id:'BR-001',status:'draft'},{id:'BR-002',status:'draft'},{id:'BR-003',status:'approved'}]};
 const saved=[];
 const fn=vm.runInNewContext(runtime.slice(a,b)+'\nrepairMissingDraftTaskRoles',{
  require:()=>({roleChoices:()=>[],normalizeRole:x=>x==='software-developer'?x:''}),
  activeProject:{id:'p'},registry:{},brWorkflow:{load:async()=>register,projectPreparedJira:x=>x,plan:()=>rows,
   saveJiraIssueDetails:async(_r,_p,_v,item)=>{saved.push(item);rows.find(x=>x.path===item.path).roleLabel='atgv-role-'+item.roleId;return register;}},
  requireBAOwner:async()=>({actor:'me'}),activeAiTarget:async()=>({}),
  aiAnswer:async(_target,prompt)=>prompt.includes('Implement API')?'{"roleId":"software-developer","quote":"Implement API"}':'{"roleId":"","quote":""}',
  parseAIChangeResolutionJson:JSON.parse,dashboard:null,recordBAProcess:async()=>{},atgvJobSafeError:e=>e.message
 });
 const result=await fn('p',new Set(['ba-br-BR-001','ba-br-BR-003']),new AbortController().signal,()=>{});
 assert.deepEqual(saved.map(x=>[x.path,x.roleId]),[['BR-001/T-001','software-developer'],['BR-001/T-002','project-manager']]);
 assert.equal(result.fixed,2);assert.equal(result.remaining,0);assert.equal(result.warnings.length,1);
});

test('automatic projection supplies the same provisional role for preview and approval without editing the draft',()=>{
 const code=read('src/br-workflow.js');
 const a=code.indexOf('function projectPreparedJira('),b=code.indexOf('async function renumberDrafts(',a);
 const state={brs:[{id:'BR-015',status:'draft',title:'Initiation'},{id:'BR-016',status:'draft',title:'Other'}],pending:{'BR-015/T-002':{}},synced:{},jiraIssueDetails:{}};
 const tasks=[{path:'BR-015/T-001',kind:'Task',action:'create'},{path:'BR-015/T-002',kind:'Task',action:'create'},{path:'BR-015/T-003',kind:'Task',action:'create',roleLabel:'atgv-role-software-developer'}];
 const project=vm.runInNewContext(code.slice(a,b)+'\nprojectPreparedJira',{
  structuredClone,approveRecord:(register,id)=>{const row=register.brs.find(x=>x.id===id);row.status='approved';row.approvedContent={title:row.title};},
  digest:x=>JSON.stringify(x),plan:()=>tasks,jiraPreviewDetails:{normalizeDetails:x=>x}
 });
 const preview=project(state,{blockers:[]}),approval=project(state,{actor:'BA'});
 assert.equal(preview.jiraIssueDetails['BR-015/T-001'].roleId,'project-manager');
 assert.equal(preview.jiraIssueDetails['BR-015/T-001'].automaticRoleTriage,true);
 assert.deepEqual(preview.jiraIssueDetails,approval.jiraIssueDetails);
 assert.equal(Object.keys(project(state,{roleFallback:false}).jiraIssueDetails).length,0);
 assert.equal(Object.keys(state.jiraIssueDetails).length,0);
 assert.equal(Object.keys(preview.jiraIssueDetails).length,1);
});
