'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
function segment(source,first,last){
 const start=source.indexOf(first),end=source.indexOf(last,start);
 assert.ok(start>=0&&end>start,first);
 return source.slice(start,end);
}
function fixture(){
 const sent=[],opened=[],screens=[],nodes=new Map();
 const element=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',focus(){this.focused=true;}});
  return nodes.get(id);
 };
 const create=new Function('$','send','launchFromGate','showStartupStep',[
  "let startupProceedMode='',startupPrereqRequested=false,startupFormInitialized=false,startupPage=0,startupScanComplete=true,startupVerifying=false,startupInstallingModule='',startupConnectionVerified=false,startupConnectionEditSnapshot=null,startupConnectionHealthError=false,startupConnectionCheckPending=false,startupReturnToConnections=false;",
  "let gateBusy=false,gateError='',workspaceOpened=false,opening={phase:'search'}; const extensionSettings={};",
  "const startupFieldMap={githubUrl:'startupGithubUrl'};const startupPayload=()=>({email:'saved'});",
  "function renderStartupPage(){}function resetStartupConnectionChecks(){}function updateStartupRepositoryPreview(){}function updateHeaderUserName(){}function startupScanPercent(){}function renderStartupScanPlaceholders(){}",
  segment(ui,'function requestStartupReadiness(){','function renderStartupStackReadiness('),
  "function receive(message){",
  segment(ui," if(message.type==='startupProceedResult'","\n});"),
  "}",
  "return {renderStartupConfig,requestStartupProceed,receive};"
 ].join('\n'));
 const api=create(element,(command,data)=>sent.push({command,...data}),data=>opened.push(data),show=>screens.push(show));
 return {api,sent,opened,screens,element};
}
const verified={required:true,verified:true,prerequisitesVerified:true};
test('verified startup waits for a manual Next click and never auto-logs in',()=>{
 const x=fixture();x.api.renderStartupConfig(verified);x.api.renderStartupConfig(verified);
 assert.deepEqual(x.sent,[{command:'startupReadiness'}],'saved verification must still scan the first screen, but cannot auto-proceed');
 assert.deepEqual(x.screens,[true,true],'Start screen stays visible');
 x.api.requestStartupProceed();
 assert.deepEqual(x.sent,[{command:'startupReadiness'},{command:'startupProceed',settings:{email:'saved'}}]);
 x.api.receive({type:'startupProceedResult',success:true,projectId:'p1'});
 assert.deepEqual(x.screens,[true,true,false]);
 assert.deepEqual(x.opened,[],'even a response containing projectId must not auto-open');
 assert.equal(x.element('gateQuery').focused,true);
});
test('manual Next enters project search without choosing a remembered project',()=>{
 const x=fixture();x.api.renderStartupConfig(verified);
 assert.deepEqual(x.sent,[{command:'startupReadiness'}],'the prerequisite screen must always scan first');
 x.api.requestStartupProceed();
 x.api.receive({type:'startupProceedResult',success:true,projectId:''});
 assert.deepEqual(x.opened,[]);
 assert.deepEqual(x.screens,[true,false]);
});
test('missing verification keeps setup available and manual Next shows an error',()=>{
 const x=fixture();x.api.renderStartupConfig({...verified,prerequisitesVerified:false});
 assert.deepEqual(x.sent,[{command:'startupReadiness'}]);
 assert.deepEqual(x.screens,[true]);
 const y=fixture();y.api.renderStartupConfig({...verified,verified:false});
 assert.deepEqual(y.sent,[{command:'startupReadiness'}],'verification state must not skip prerequisite scanning');
 assert.deepEqual(y.screens,[true]);
 const z=fixture();z.api.renderStartupConfig(verified);
 z.api.requestStartupProceed();
 z.api.receive({type:'startupProceedResult',success:false,verified:false,message:'Saved credentials changed.'});
 assert.deepEqual(z.opened,[]);
 assert.deepEqual(z.screens,[true,true]);
 assert.equal(z.element('startupProceedInfo').textContent,'Saved credentials changed.');
});
test('legacy previously-opened project helper is isolated from manual Start flow',()=>{
 const saved={'atgvAssist.activeProject':'p1','atgvAssist.recentProjects':['p1','obsolete']};
 const state={get:(key,fallback)=>saved[key]??fallback};
 const create=new Function('context','getWorkspace','vscode','startupIsComplete',segment(host,
  'const STARTUP_PREREQUISITES_KEY=','// Keep the verification proof')+
  '\nreturn {startupPrerequisitesVerified,previouslyOpenedStartupProject};');
 const vscode={workspace:{isTrusted:true}};
 const {startupPrerequisitesVerified,previouslyOpenedStartupProject}=create(
  {workspaceState:state},()=>({uri:{toString:()=> 'file:///test'}}),vscode,()=>true);
 assert.equal(startupPrerequisitesVerified(),true,'legacy completed setup can resume');
 const p1={id:'p1'},p2={id:'p2'};
 assert.equal(previouslyOpenedStartupProject([p1]),p1,'a previously opened project needs no selected stack');
 assert.equal(previouslyOpenedStartupProject([p1,p2]),null);
 assert.equal(previouslyOpenedStartupProject([p2]),null);
 assert.equal(previouslyOpenedStartupProject([]),null);
 saved['atgvAssist.startupPrerequisites']={workspace:'file:///other',verified:true};
 assert.equal(startupPrerequisitesVerified(),false);
 saved['atgvAssist.startupPrerequisites']={workspace:'file:///test',verified:false};
 assert.equal(startupPrerequisitesVerified(),false);
 saved['atgvAssist.startupPrerequisites'].verified=true;
 assert.equal(startupPrerequisitesVerified(),true);
 vscode.workspace.isTrusted=false;
 assert.equal(startupPrerequisitesVerified(),false);
});
