'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {render,SAMPLE_COUNT}=require('../src/br-deletion-preview');
const {enrich}=require('../src/role-jira-inventory');

test('large BR confirmation displays a few issue keys, while full preview lists every verified issue',()=>{
 const jira=Array.from({length:150},(_,n)=>({kind:'jira',key:`TC-${n+1}`,nodePath:`BR-008/F-001/S-${n+1}`,issueType:'Story',parentKey:'TC-440'}));
 const plan={jira,confluence:[{pageId:'123',title:'Document',brId:'BR-008'}],gitBranches:[]};
 const result=render({plan,job:{results:{}},ids:['BR-008'],exclusiveUploadedSources:[],localOwnership:{keys:jira.map(x=>x.key)},todo:jira});
 assert.ok(result.summary.length<1600);
 assert.match(result.summary,/150/);
 assert.match(result.summary,new RegExp(`\\+${150-SAMPLE_COUNT} more`));
 assert.doesNotMatch(result.summary,/TC-150/);
 assert.match(result.details,/TC-150/);
 assert.match(result.details,/TC-1/);
 assert.match(result.details,/123/);
 assert.equal((result.details.match(/ · Story · /g)||[]).length,150);
});

test('preview excludes already deleted items from remaining count without losing them from full audit',()=>{
 const result=render({plan:{jira:[{key:'TC-1',nodePath:'BR-001',issueType:'Epic'}],confluence:[]},job:{results:{'jira:TC-1':{status:'deleted'}}},ids:['BR-001']});
 assert.match(result.summary,/1 \(0 remaining\)/);
 assert.match(result.details,/already deleted/);
});

test('confirmation dialog contains a clickable full-preview link and host enforces project identity',()=>{
 const ext=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(ext,/id="hostDialogViewDetails" href="#"/);
 assert.match(ext,/case 'hostDialogViewDetails'/);
 assert.match(ext,/item\.projectId!===?\(activeProject\?\.id\|\|null\)/);
 assert.match(ext,/brDeletionPreview\.render/);
 assert.match(ext,/details,detailsLabel:'View Full Deletion Preview'/);
 assert.match(ui,/send\('hostDialogViewDetails'/);
 assert.match(ui,/req\.hasDetails/);
});

test('Jira inventory retains all issue types, while whole BR actions are restricted to verified roots',()=>{
 const reg={brs:[{id:'BR-007',status:'draft'}]};
 const issues=[{key:'TC-1',type:'Epic',summary:'Epic'},{key:'TC-2',type:'Story',summary:'Story'},{key:'TC-3',type:'Sub-task',summary:'Subtask'},{key:'TC-4',type:'Task',summary:'Task'}];
 const out=enrich(issues,reg,'me');
 assert.equal(out.length,4);
 assert.deepEqual(out.map(x=>x.issueType),['Epic','Story','Sub-task','Task']);
 assert.ok(out.every(x=>!x.brRoot));
});

test('catalog accepts renamed bootstrap-5-3 folder with legacy manifest ID only if actual assets exist',()=>{
 const catalog=require('../src/github-sdlc-catalog');
 const prefix='shared/design-systems/bootstrap-5-3/';
 const fields={components:'kit/ai/component-catalog.json',showcase:'kit/showcase.html',css:'kit/css/bootstrap.css',tokens:'kit/tokens.json',license:'LICENSE.md'};
 const manifest={schema:1,version:'1.1.3',roles:['ba'],techStacks:['react'],designSystems:['bootstrap-5.3'],designSystemCatalogs:{'bootstrap-5.3':Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,'shared/design-systems/bootstrap-5.3/'+v]))}};
 const paths=new Set(['roles/ba/SKILL.md','tech-stacks/react/stack.json','tech-stacks/react/scaffold/README.md',prefix+'AI-GUIDANCE.md',...Object.values(fields).map(x=>prefix+x)]);
 assert.deepEqual(catalog.inspectManifest(Buffer.from(JSON.stringify(manifest)),paths).designSystems,['bootstrap-5-3']);
 paths.delete(prefix+'AI-GUIDANCE.md');
 assert.throws(()=>catalog.inspectManifest(Buffer.from(JSON.stringify(manifest)),paths),/Missing design guidance/);
});

test('UI/UX delete action is ticket scoped and protects uploaded reference images',()=>{
 const ext=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const reset=fs.readFileSync(path.join(__dirname,'../src/ux-design-reset.js'),'utf8');
 assert.match(ext,/case 'uxPipelineDelete'/);
 assert.match(ext,/Delete Entire Design/);
 assert.match(ui,/uxDeleteEntireDesign/);
 assert.match(reset,/await projectUX\.retract/);
 assert.match(reset,/GENERATED\.test\(entry\.name\)/);
 assert.doesNotMatch(reset,/reference.*(?:unlink|rm)|await fs\.rm\(folder/);
});

test('deletion preflight does not require Confluence connectivity when no page is linked',async()=>{
 const remote=require('../src/remote-br-deletion');
 const issue={key:'TC-100',fields:{project:{key:'TC'},summary:'Example',description:null,labels:['atgv-'+'0'.repeat(24)],issuetype:{name:'Epic'},parent:null}};
 const {remoteFingerprint}=require('../src/remote-actions');
 const state={revision:'r1',brs:[{id:'BR-001',title:'Example'}],synced:{'BR-001':{key:'TC-100',marker:issue.fields.labels[0],remoteDigest:remoteFingerprint(issue),issueType:'Epic'}},pending:{},changeQueue:[]};
 const config={get:k=>({'jira.projectKey':'TC','jira.baseUrl':'https://example.atlassian.net','confluence.baseUrl':'','jira.email':'x@example.invalid'})[k]||''};
 let spaceCalled=false;
 const plan=await remote.preflight({register:state,brIds:['BR-001'],config,token:'MOCK',projectId:'local',folder:'/tmp/no-confluence',
  readLinks:async()=>({entries:{}}),getSpace:async()=>{spaceCalled=true;throw Error('Should not query missing Confluence space');},
  readJira:async()=>issue,request:async()=>({issues:[],isLast:true})});
 assert.equal(spaceCalled,false);
 assert.equal(plan.confluenceSpaceId,'');
 assert.deepEqual(plan.jira.map(x=>x.key),['TC-100']);
});
