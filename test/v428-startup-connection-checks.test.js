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
  "let startupConnectionCheckSequence=0,startupConnectionCheckPending=false,startupConnectionHealthError=false;const startupConnectionCheckResults=new Map();",
  "const STARTUP_CONNECTION_CHECK_LABELS=[['jira','Jira API'],['confluence','Confluence API'],['github','GitHub account'],['organization','GitHub organization'],['extension','Extension · read required / write optional'],['library','Library · read required / write optional'],['extension-releases','Extension releases · optional'],['library-releases','Library releases · optional']];function updateStartupIssueSummary(){}",
  "let startupProceedMode='',startupStackData=null,gateBusy=false,gateError='',workspaceOpened=false,opening={phase:'search'};",
  segment('function startupRing(', 'function updateStartupStackProgress('),
  segment('function startupPayload(){','function renderStartupPermissionRows('),
  segment('function renderStartupPage(){','function renderStartupStackReadiness('),
  segment('function invalidateStartupConnection(){',"for(const id of Object.values(startupFieldMap))"),
  segment("$('startupConnectionForm').addEventListener('submit'", "$('startupProceed').addEventListener('click'"),
  'function receive(message){',
  segment(" if(message.type==='startupConnectionCheck'", " if(message.type==='startupProceedResult'"),
  '}',
  'return {renderStartupConfig,renderStartupPage,toggleStartupConnectionEdit,checkSavedStartupConnections,receive,isVerified:()=>startupConnectionVerified};'
 ].join('\n');
 const document={createElement:tag=>({tag,dataset:{},style:{},children:[],textContent:'',attributes:{},open:false,
  setAttribute(name,value){this.attributes[name]=value;},append(...children){this.children.push(...children);}})};
 const create=new Function('$','document','read','send','updateHeaderUserName','extensionSettings','startupScanPercent','renderStartupScanPlaceholders',source);
 return {node,sent,page:create(node,document,id=>node(id).value,(type,extra)=>sent.push({type,...extra}),()=>{},{jira:{}},()=>{},()=>{})};
}
const config={required:true,verified:true,saved:{jiraUrl:'https://example.atlassian.net',email:'person@example.com',githubUrl:'https://github.com/aiamalaysia',projectRepository:'my-fow-technology-app-techassists'},defaults:setup.DEFAULTS};
test('Verified connection settings expose a manual read-only test',()=>{
 const token=html.indexOf('id="startupGithubToken"'),button=html.indexOf('id="startupEditConnections"');
 assert.ok(token>0&&button>token&&button<html.indexOf('</div>',token));
 const {node,sent,page}=pageFixture();
 page.renderStartupConfig(config);
 assert.equal(sent.length,0,'saved checks are only run on request');
 assert.equal(node('startupConnectionChecks').children.length,0,'idle checks must not appear in the interface');
 assert.equal(node('startupConnectionProgress').children.length,0,'progress is hidden until a check starts');
 assert.equal(node('startupTestSavedConnections').classList.contains('hidden'),false);
 page.checkSavedStartupConnections();
 assert.equal(sent.at(-1).type,'startupCheckConnections');
 assert.deepEqual(Object.keys(sent.at(-1).settings).sort(),['email','githubUrl','jiraUrl','projectRepository']);
 assert.equal(node('startupEditConnections').textContent,'Edit');
 assert.equal(node('startupEditConnections').classList.contains('hidden'),false);
 assert.equal(node('startupJiraUrl').disabled,true);
});
test('Editing invalidates an in-flight test, keeps edits through stale state and restores saved fields on cancel',()=>{
 const {node,sent,page}=pageFixture();
 page.renderStartupConfig(config);
 page.checkSavedStartupConnections();
 const staleRequest=sent.at(-1).requestId;
 page.toggleStartupConnectionEdit();
 assert.equal(page.isVerified(),false);
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
 assert.equal(sent.length,2,'cancel does not repeat a network test');
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
test('A failed connection test remains visible across state refreshes',()=>{
 const {node,sent,page}=pageFixture();page.renderStartupConfig(config);page.checkSavedStartupConnections();
 const request=sent.at(-1);page.receive({type:'startupConnectionHealthResult',requestId:request.requestId,success:false,checks:[{id:'confluence',label:'Confluence API',state:'error',message:'Server responded (HTTP 404).',url:'https://example.atlassian.net/wiki/api/v2/spaces'}]});
 page.renderStartupConfig(config);
 assert.match(node('startupConnectionMessage').textContent,/connections need attention/i);
 assert.match(node('startupConnectionChecks').children[0].children[1].textContent,/HTTP 404/);
 assert.equal(node('startupConnectionChecks').children[0].children[0]._atgvProgress.number.textContent,'!');
});
test('checks display sequentially and each successful check disappears immediately',()=>{
 const {node,sent,page}=pageFixture();page.renderStartupConfig(config);page.checkSavedStartupConnections();
 const request=sent.at(-1),receive=(check)=>page.receive({type:'startupConnectionCheck',requestId:request.requestId,check});
 const jira={id:'jira',label:'Jira API',state:'pending',message:'Checking…'};
 receive(jira);
 assert.equal(node('startupConnectionProgress').children.length,1);
 assert.equal(node('startupConnectionProgress').children[0].children[0].children[0].textContent,'Jira API');
 assert.equal(node('startupConnectionChecks').children.length,1);
 assert.equal(node('startupConnectionChecks').children[0].tag,'details');
 receive({...jira,state:'ok',message:'Reachable and verified.'});
 assert.equal(node('startupConnectionProgress').children.length,0,'successful check should vanish');
 assert.equal(node('startupConnectionChecks').children.length,0,'successful check should vanish from prerequisites');
 const confluence={id:'confluence',label:'Confluence API',state:'pending',message:'Checking…'};
 receive(confluence);
 assert.equal(node('startupConnectionProgress').children.length,1);
 assert.equal(node('startupConnectionProgress').children[0].children[0].children[0].textContent,'Confluence API');
 receive({...confluence,state:'ok',message:'Reachable and verified.'});
 assert.equal(node('startupConnectionProgress').children.length,0);
 const github={id:'github',label:'GitHub account',state:'error',message:'HTTP 403'};
 receive(github);
 assert.equal(node('startupConnectionProgress').children.length,1,'failed check is retained for troubleshooting');
 assert.equal(node('startupConnectionChecks').children.length,1);
 assert.match(node('startupConnectionChecks').children[0].children[1].textContent,/HTTP 403/);
 receive({...github,state:'ok',message:'Reachable and verified.'});
 assert.equal(node('startupConnectionProgress').children.length,0,'repaired check is hidden');
 assert.equal(node('startupConnectionChecks').children.length,0);
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
  startupSavedConnectionFields:()=>setup.DEFAULTS,
  testJiraConnection:async()=>{events.push('jira');if(failures.jira)throw failures.jira;return {displayName:'Tester'};},
  requestJson:async url=>{
   const id=url.includes('/api/v2/spaces')?'confluence':url.endsWith('/user')?'github':url.includes('/users/')?'organization':url.includes('/releases?')?'releases':url.includes('/repos/')?'library':'jira-probe';
   events.push(id);if(failures[id])throw failures[id];
   if(id==='confluence')return {results:[]};
   if(id==='github')return {login:'tester'};
   if(id==='organization')return {login:'aiamalaysia'};
   if(id==='releases')return [];
   if(id==='library'){
    const match=url.match(/\/repos\/([^/]+)\/([^/]+)$/);
    if(!match)throw Error('Unexpected GitHub repository resource '+url);
    return {full_name:match[1]+'/'+match[2],permissions:{pull:!failures.readDenied,push:!failures.readonly}};
   }
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
 assert.equal(result.success,false);assert.equal(result.checks.length,8);assert.equal(h.progress.length,16);
 for(const id of ['jira','confluence','github','organization','library'])assert.ok(h.events.includes(id),id);
 assert.match(result.checks.find(x=>x.id==='jira').message,/HTTP 401/);
 assert.match(result.checks.find(x=>x.id==='confluence').message,/HTTP 404/);
 assert.match(result.checks.find(x=>x.id==='github').message,/Cannot connect/);
 assert.equal(result.checks.find(x=>x.id==='organization').state,'ok');
 assert.deepEqual(h.writes,[]);assert.doesNotMatch(JSON.stringify(result),/test-atl|test-git/);
});
test('Read-only connection test uses saved credentials without storing settings or tokens',async()=>{
 const h=hostFixture();
 const result=await h.context.testAndSaveStartupConnections({settings:setup.DEFAULTS},{save:false,onProgress:item=>h.progress.push(item)});
 assert.equal(result.success,true);assert.equal(result.checks.length,8);
 assert.ok(result.checks.every(check=>check.state==='ok'));
 assert.deepEqual(h.writes,[]);assert.equal(h.context.startupSessionVerified,true);
 assert.equal(h.context.startupVerifiedSignature,'old');
});


test('GitHub read-only PAT is sufficient to save all required connections',async()=>{
 const h=hostFixture({readonly:true});
 const result=await h.run();
 assert.equal(result.success,true,result.message);
 assert.ok(h.writes.includes('setting'),'a read-only PAT must not block saving settings');
 for(const key of ['extension','library']){
  const row=result.checks.find(check=>check.id===key);
  assert.equal(row.state,'ok');
  assert.match(row.message,/read verified/i);
  assert.match(row.message,/write access is optional/i);
 }
 assert.ok(!h.events.includes('releases'),'source checks do not query release assets');
});
test('Repository read denial remains a blocking error',async()=>{
 const h=hostFixture({readDenied:true});
 const result=await h.run();
 assert.equal(result.success,false);
 for(const key of ['extension','library']){
  const row=result.checks.find(check=>check.id===key);
  assert.equal(row.state,'error');
  assert.match(row.message,/read|permission/i);
 }
 assert.deepEqual(h.writes,[]);
});
test('Optional release checks can fail without blocking read-only source access',async()=>{
 const h=hostFixture({readonly:true,releases:new Error('HTTP 403 release download not allowed')});
 const result=await h.run();
 assert.equal(result.success,true,result.message);
 assert.equal(result.checks.find(check=>check.id==='extension-releases').state,'error');
 assert.equal(result.checks.find(check=>check.id==='library-releases').state,'error');
 assert.equal(result.checks.find(check=>check.id==='extension').state,'ok');
 assert.equal(result.checks.find(check=>check.id==='library').state,'ok');
});
