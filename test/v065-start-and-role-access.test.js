'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const policy=require('../src/role-connection-policy');

test('ATGV: Start always displays Technology stack prerequisites before saved connection steps',()=>{
 const ui=read('media/start.js');
 const host=read('src/lib/runtime/extension-runtime.js');
 const beginning=ui.slice(ui.indexOf('function renderStartupConfig(config){'),ui.indexOf('function renderStartupStackReadiness(',ui.indexOf('function renderStartupConfig(config){')));
 assert.match(beginning,/startupPage=0/);
 assert.doesNotMatch(beginning,/if\(config\.prerequisitesVerified\)\s*\{\s*startupPage=1/);
 assert.match(beginning,/if\(required&&startupPage===0\)requestStartupReadiness\(\)/);
 assert.match(host,/startupSessionProceedApproved=false/);
 assert.match(ui,/send\('startupProceed'/);
});
test('permission alert has a permanent red border, distinct from transient notices',()=>{
 const css=read('media/start.css');
 const html=read('src/lib/webview/dashboard-html.js');
 assert.match(css,/\.atgv-role-credential-banner\{[^}]*border:1px solid #ff5964;border-bottom:3px solid #ff5964/);
 assert.match(html,/id="roleCredentialBanner"/);
 assert.match(html,/id="roleCredentialSettings"/);
 assert.doesNotMatch(html,/roleCredentialDismiss/);
});
function probeHarness({projectKeys=true,jiraRead=true,jiraWrite=true,confluenceCreate=true,opsShape='dedicated',githubWrite=false}={}){
 const host=read('src/lib/runtime/extension-runtime.js');
 const start=host.indexOf('async function roleConnectionAccess(roleId){');
 const end=host.indexOf('\nasync function dashboardState(){',start);
 assert.ok(start>0&&end>start);
 const calls=[];
 const config={jira:{projectKey:projectKeys?'TC':'',baseUrl:'https://example.atlassian.net',email:'test@example.com'},
  confluence:{spaceKey:projectKeys?'TCC':'',baseUrl:'https://example.atlassian.net/wiki'},
  github:{owner:'org',repo:'project'}};
 const sandbox={
  openingFlow:{phase:'open'},activeProject:{id:'project-1'},
  effectiveConfig:()=>({get:k=>config[k.split('.')[0]]?.[k.split('.')[1]]||''}),
  getAtlassianToken:async()=>{calls.push('atlassian-token');return 'test-token';},
  getConfluenceSpace:async()=>{calls.push('get-space');return {id:'123',key:'TCC'};},
  baseAtlassian:()=> 'https://example.atlassian.net',
  baseConfluence:()=> 'https://example.atlassian.net/wiki',
  getGithubToken:async()=> 'github-token',
  testGithubConnection:async()=>({authenticated:true,permissions:{pull:true,push:githubWrite}}),
  githubRepoInfo:()=>({owner:'org',repo:'project',route:'https://api.github.com/repos/org/project'}),
  requestJson:async url=>{
   calls.push(url);
   if(url.includes('/mypermissions'))return {permissions:{
    BROWSE_PROJECTS:{havePermission:jiraRead},CREATE_ISSUES:{havePermission:jiraWrite}}};
   if(url.endsWith('/operations')){
    if(opsShape==='fallback')throw Error('HTTP 404');
    return {operations:[{operation:confluenceCreate?'create':'read',targetType:'page'}]};
   }
   if(url.includes('include-operations'))return {id:'123',key:'TCC',operations:{results:[{operation:confluenceCreate?'create':'read',targetType:'page'}]}};
   if(url.includes('api.github.com'))return {full_name:'org/project',permissions:{pull:true,push:githubWrite}};
   throw Error('Unexpected request: '+url);
  },
  canCreatePage:require('../src/project-connection-validation').canCreatePage,
  roleConnectionPolicy:policy,
  report:()=>{},startupConnectionFailure:e=>String(e.message||e)
 };
 vm.createContext(sandbox);vm.runInContext(host.slice(start,end),sandbox);
 return {check:sandbox.roleConnectionAccess,calls};
}
test('missing Jira/Confluence project mappings produce setup guidance, not fabricated permission denial',async()=>{
 const {check,calls}=probeHarness({projectKeys:false});
 const result=await check('business-analyst');
 assert.equal(result.ready,false);
 assert.deepEqual(Array.from(result.issues).slice(0,2),[
  'Set the Jira Project Key in Project Settings','Set the Confluence Space Key in Project Settings']);
 assert.equal(calls.some(x=>String(x).includes('/mypermissions')||String(x).includes('/spaces/')),false);
 assert.equal(result.capabilities.githubRead,true);
});
test('verified Jira, Confluence and GitHub read removes BA alert; Developer also requires GitHub write',async()=>{
 const {check,calls}=probeHarness();
 const analyst=await check('business-analyst');
 assert.equal(analyst.ready,true);
 assert.deepEqual(Array.from(analyst.issues),[]);
 assert.equal(calls.some(x=>String(x).endsWith('/operations')),true);
 const developer=await check('developer');
 assert.equal(developer.ready,false);
 assert.deepEqual(Array.from(developer.missing),['GitHub write']);
});
test('Confluence include-operations fallback verifies without write operations',async()=>{
 const {check,calls}=probeHarness({opsShape:'fallback',githubWrite:true});
 const result=await check('developer');
 assert.equal(result.ready,true);
 assert.ok(calls.some(x=>String(x).includes('include-operations')));
});
test('actual Jira and Confluence permission denial remains visible and cannot unblock remote actions',async()=>{
 const {check}=probeHarness({jiraRead:true,jiraWrite:false,confluenceCreate:false});
 const result=await check('business-analyst');
 assert.equal(result.ready,false);
 assert.ok(result.issues.some(x=>x.includes('Jira Create Issues')));
 assert.ok(result.issues.some(x=>x.includes('Confluence Create Page')));
 assert.deepEqual(Array.from(result.missing),['Jira write','Confluence write']);
});
