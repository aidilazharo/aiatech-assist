'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const setup=require('../src/lib/startup-setup');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const runtime=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');

function pageFixture(){
 const nodes=new Map(),sent=[];
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set();
   nodes.set(id,{id,value:'',textContent:'',className:'',disabled:false,dataset:{},children:[],attrs:{},events:{},
    classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
    setAttribute(name,value){this.attrs[name]=value;},focus(){this.focused=true;},
    addEventListener(name,fn){this.events[name]=fn;},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},
    querySelectorAll(){return this.children.filter(child=>child.open);}
   });
  }
  return nodes.get(id);
 };
 const segment=(start,end)=>{const a=ui.indexOf(start),b=ui.indexOf(end,a);assert.ok(a>=0&&b>a,start);return ui.slice(a,b);};
 const source=[
  "const startupFieldMap={jiraUrl:'startupJiraUrl',email:'startupEmail',githubUrl:'startupGithubUrl',projectRepository:'startupProjectRepository'};",
  "let startupSetupRequired=true,startupPage=1,startupVerifying=false,startupInstallingModule='',startupConnectionVerified=false,startupConnectionEditSnapshot=null,startupScanComplete=true,startupFormInitialized=false,startupReturnToConnections=false,startupPrereqRequested=true,startupOpenStackId='',startupCopilotModalOpen=false;",
  "let startupConnectionCheckSequence=0,startupConnectionCheckPending=false,startupConnectionHealthStarted=false,startupConnectionHealthError=false;const startupConnectionCheckResults=new Map();",
  "const STARTUP_CONNECTION_CHECK_LABELS=[['jira','Jira API'],['confluence','Confluence API'],['github','GitHub account'],['organization','GitHub organization'],['extension','Extension · read/write/releases'],['library','Library · read/write/releases'],['extension-releases','Extension releases · optional'],['library-releases','Library releases · optional']];function updateStartupIssueSummary(){}",
  "let startupAutoNotice='',startupAutoEnabled=false,startupAutoProject=null,startupAutoStage='';let gateBusy=false,gateError='',workspaceOpened=false,opening={phase:'search'};",
  "function stopStartupAuto(){startupAutoEnabled=false;} function beginStartupAuto(){}",
  segment('function startupRing(', 'function updateStartupStackProgress('),
  segment('function startupPayload(){','function renderStartupPermissionRows('),
  segment('function renderStartupPage(){','function renderStartupStackReadiness('),
  segment('function invalidateStartupConnection(){',"for(const id of Object.values(startupFieldMap))"),
  segment("$('startupConnectionForm').addEventListener('submit'", "$('startupProceed').addEventListener('click'"),
  'function receive(message){',
  segment(" if(message.type==='startupConnectionCheck'", " if(message.type==='startupProceedResult')"),
  '}',
  'return {renderStartupConfig,renderStartupPage,toggleStartupConnectionEdit,receive,setAuto:v=>startupAutoEnabled=v,isAuto:()=>startupAutoEnabled,isVerified:()=>startupConnectionVerified};'
 ].join('\n');
 const document={createElement:tag=>({tag,dataset:{},style:{},children:[],textContent:'',attributes:{},open:false,
  setAttribute(name,value){this.attributes[name]=value;},append(...children){this.children.push(...children);}})};
 const create=new Function('$','document','read','send','updateHeaderUserName','extensionSettings','startupScanPercent','renderStartupScanPlaceholders',source);
 return {node,sent,page:create(node,document,id=>node(id).value,(type,extra)=>sent.push({type,...extra}),()=>{},{jira:{}},()=>{},()=>{})};
}
const config={required:true,verified:true,saved:{jiraUrl:'https://example.atlassian.net',email:'person@example.com',githubUrl:'https://github.com/aiamalaysia',projectRepository:'my-fow-technology-app-techassists'},defaults:setup.DEFAULTS};
test('Edit is below the GitHub token field and verified startup checks run automatically',()=>{
 const token=html.indexOf('id="startupGithubToken"'),button=html.indexOf('id="startupEditConnections"');
 assert.ok(token>0&&button>token&&button<html.indexOf('</div>',token));
 const {node,sent,page}=pageFixture();
 page.renderStartupConfig(config);
 assert.equal(sent.at(-1).type,'startupCheckConnections');
 assert.deepEqual(Object.keys(sent.at(-1).settings).sort(),['email','githubUrl','jiraUrl','projectRepository']);
 assert.equal(node('startupConnectionChecks').children.length,8);
 assert.equal(node('startupConnectionChecks').children[0].tag,'details');
 assert.equal(node('startupConnectionChecks').children[0].children[0]._atgvProgress.number.textContent,'0%');
 assert.equal(node('startupEditConnections').textContent,'Edit');
 assert.equal(node('startupEditConnections').classList.contains('hidden'),false);
 assert.equal(node('startupJiraUrl').disabled,true);
});
test('Editing stops automatic opening, keeps edits through stale state, and cancel restores values and clears tokens',()=>{
 const {node,sent,page}=pageFixture();
 page.renderStartupConfig(config);
 const staleRequest=sent.at(-1).requestId;
 page.setAuto(true);page.toggleStartupConnectionEdit();
 assert.equal(page.isAuto(),false);assert.equal(page.isVerified(),false);
 assert.equal(node('startupProceed').disabled,true);
 assert.equal(node('startupTestConnections').disabled,false);
 for(const id of ['startupJiraUrl','startupEmail','startupAtlassianToken','startupGithubUrl','startupProjectRepository','startupGithubToken'])assert.equal(node(id).disabled,false,id);
 node('startupJiraUrl').value='https://other.atlassian.net';node('startupAtlassianToken').value='temporary-atl';
 node('startupGithubToken').value='temporary-git';
 page.renderStartupConfig(config);
 page.receive({type:'startupConnectionHealthResult',requestId:staleRequest,success:true});
 assert.equal(page.isVerified(),false);assert.equal(node('startupJiraUrl').value,'https://other.atlassian.net');
 node('startupConnectionForm').events.submit({preventDefault(){}});
 const attempt=sent.at(-1);
 assert.equal(attempt.type,'startupTestConnections');assert.equal(attempt.settings.jiraUrl,'https://other.atlassian.net');
 assert.equal(attempt.atlassianToken,'temporary-atl');assert.equal(attempt.githubToken,'temporary-git');
 page.toggleStartupConnectionEdit();assert.equal(page.isVerified(),false,'cannot cancel while a save is in flight');
 page.receive({type:'startupConnectionsResult',requestId:attempt.requestId,success:false,message:'Cannot connect'});
 assert.equal(node('startupGithubToken').value,'temporary-git');
 page.toggleStartupConnectionEdit();
 assert.equal(node('startupJiraUrl').value,config.saved.jiraUrl);
 assert.equal(node('startupAtlassianToken').value,'');assert.equal(node('startupGithubToken').value,'');
 assert.equal(page.isVerified(),true);assert.equal(node('startupProceed').disabled,false);
 assert.equal(sent.at(-1).type,'startupCheckConnections');
});
test('Successful re-verification clears tokens and locks all edited fields',()=>{
 const {node,sent,page}=pageFixture();page.renderStartupConfig(config);page.toggleStartupConnectionEdit();
 node('startupEmail').value='new@example.com';node('startupAtlassianToken').value='new-secret';node('startupGithubToken').value='new-git';
 node('startupConnectionForm').events.submit({preventDefault(){}});
 const request=sent.at(-1);page.receive({type:'startupConnectionsResult',requestId:request.requestId,success:true,message:'Verified',checks:[]});
 assert.equal(page.isVerified(),true);assert.equal(node('startupEmail').value,'new@example.com');
 assert.equal(node('startupAtlassianToken').value,'');assert.equal(node('startupGithubToken').value,'');
 assert.equal(node('startupEmail').disabled,true);assert.equal(node('startupEditConnections').textContent,'Edit');
 assert.equal(node('startupProceed').disabled,false);
});
test('A failed background health check remains visible across state refreshes',()=>{
 const {node,sent,page}=pageFixture();page.renderStartupConfig(config);
 const request=sent.at(-1);page.receive({type:'startupConnectionHealthResult',requestId:request.requestId,success:false,checks:[{id:'confluence',label:'Confluence API',state:'error',message:'Server responded (HTTP 404).',url:'https://example.atlassian.net/wiki/api/v2/spaces'}]});
 page.renderStartupConfig(config);
 assert.match(node('startupConnectionMessage').textContent,/connections need attention/i);
 assert.match(node('startupConnectionChecks').children[1].children[1].textContent,/HTTP 404/);
 assert.equal(node('startupConnectionChecks').children[1].children[0]._atgvProgress.number.textContent,'!');
});
test('connection cards show success and keep their details open during updates',()=>{
 const {node,sent,page}=pageFixture();page.renderStartupConfig(config);const request=sent.at(-1);
 node('startupConnectionChecks').children[0].open=true;
 page.receive({type:'startupConnectionCheck',requestId:request.requestId,check:{id:'jira',label:'Jira API',state:'ok',message:'Reachable and verified.',url:'https://example.atlassian.net/rest/api/3/myself'}});
 const card=node('startupConnectionChecks').children[0];
 assert.equal(card.open,true);assert.equal(card.children[0]._atgvProgress.number.textContent,'100%');
 assert.equal(card.children[0].children.at(-1).textContent,'Ready');
 assert.match(card.children[1].textContent,/example\.atlassian\.net/);
});

function hostFixture(failures={}){
 const events=[],writes=[],progress=[];
 const normalized=require('../src/projects').normalizeExtensionSettings;
 const context={
  startupSessionVerified:true,startupVerifiedSignature:'old',startupSetup:setup,extensionSettings:{},
  cfg:()=>({get:()=>undefined}),normalizeExtensionSettings:normalized,
  projectConfig:(_p,settings)=>({get:key=>key==='github.apiUrl'?'https://api.github.com':settings[key.split('.')[0]]?.[key.split('.')[1]]||''}),
  validateUrl:s=>s,globalSecretKey:k=>k,readToken:async k=>k==='atlassian'?'saved-atl':'saved-git',
  storeToken:async()=>writes.push('token'),
  testJiraConnection:async()=>{events.push('jira');if(failures.jira)throw failures.jira;return {displayName:'Tester'};},
  requestJson:async url=>{
   const id=url.includes('/api/v2/spaces')?'confluence':url.endsWith('/user')?'github':url.includes('/users/')?'organization':url.includes('/repos/')?'library':'jira-probe';
   events.push(id);if(failures[id])throw failures[id];
   if(id==='confluence')return {results:[]};
   if(id==='github')return {login:'tester'};
   if(id==='organization')return {login:'aiamalaysia'};
   if(id==='library')return {full_name:'aidilazharo/tech-stacks-skills'};
   return {};
  },
  sdlcCatalog:{normalizeConfig:c=>c,remoteInfo:async()=>({sha:'1234567890123456789012345678901234567890'})},
  context:{globalState:{update:async()=>writes.push('setting')},secrets:{store:async()=>writes.push('secret')}},
  scheduleCatalogChecks:()=>{},pendingTests:{},catalogRemote:null,catalogLastCheck:'',catalogLastError:'',
  sha:value=>crypto.createHash('sha256').update(String(value)).digest('hex')
 };
 const a=runtime.indexOf('function startupConnectionFailure('),b=runtime.indexOf('\nasync function dashboardState()',a);
 assert.ok(a>0&&b>a);vm.createContext(context);vm.runInContext(runtime.slice(a,b),context);
 return {context,events,writes,progress,run:(options={})=>context.testAndSaveStartupConnections({settings:setup.DEFAULTS,atlassianToken:'test-atl',githubToken:'test-git'},{...options,onProgress:item=>progress.push(item)})};
}
test('All service checks complete after multiple failures, with meaningful safe diagnostics and no writes',async()=>{
 const network=Object.assign(new Error('fetch failed'),{cause:{code:'ENOTFOUND'}});
 const h=hostFixture({jira:new Error('HTTP 401 bad token test-atl'),confluence:new Error('HTTP 404 no access'),github:network});
 const result=await h.run();
 assert.equal(result.success,false);assert.equal(result.checks.length,5);assert.equal(h.progress.length,5);
 for(const id of ['jira','confluence','github','organization','library'])assert.ok(h.events.includes(id),id);
 assert.match(result.checks.find(x=>x.id==='jira').message,/HTTP 401/);
 assert.match(result.checks.find(x=>x.id==='confluence').message,/HTTP 404/);
 assert.match(result.checks.find(x=>x.id==='github').message,/Cannot connect/);
 assert.equal(result.checks.find(x=>x.id==='organization').state,'ok');
 assert.deepEqual(h.writes,[]);assert.doesNotMatch(JSON.stringify(result),/test-atl|test-git/);
});
test('Automatic connection health check uses saved credentials without changing settings or tokens',async()=>{
 const h=hostFixture();
 const result=await h.context.testAndSaveStartupConnections({settings:setup.DEFAULTS},{save:false,onProgress:item=>h.progress.push(item)});
 assert.equal(result.success,true);assert.equal(result.checks.length,5);
 assert.ok(result.checks.every(check=>check.state==='ok'));
 assert.deepEqual(h.writes,[]);assert.equal(h.context.startupSessionVerified,true);
 assert.equal(h.context.startupVerifiedSignature,'old');
});
