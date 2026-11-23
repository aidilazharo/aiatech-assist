'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const setup=require('../src/lib/startup-setup');
const runtime=read('src/lib/runtime/extension-runtime.js');
const ui=read('media/start.js');
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');

function hostFixture(){
 const saved=setup.DEFAULTS,library={repositoryUrl:setup.FIXED_LIBRARY_REPOSITORY};
 const env={
  saved:JSON.parse(JSON.stringify(saved)),
  tokens:{atlassian:'ATL',github:'GIT'},
  secrets:new Map(),
  verified:false,
  extensionSettings:{
   jira:{baseUrl:saved.jiraUrl,email:saved.email},
   confluence:{baseUrl:saved.jiraUrl+'/wiki'},
   github:{owner:'aiamalaysia',repo:saved.projectRepository}
  }
 };
 const sandbox={
  startupSetup:setup,sha:hash,context:{secrets:{
   get:async k=>env.secrets.get(k),
   store:async(k,v)=>env.secrets.set(k,v)
  }},
  extensionSettings:env.extensionSettings,
  startupSessionVerified:false,startupVerifiedSignature:'',startupSessionProceedApproved:false,
  openingLocked:false,openingFlow:{phase:'search'},activeProject:null,
  catalogConfig:()=>library,getWorkspace:()=>null,
  globalSecretKey:x=>x,globalCredentialEndpoint:kind=>({kind}),
  readToken:async(kind)=>env.tokens[kind],
  sdlcCatalog:{activeRoot:async()=>({})},report:()=>{}
 };
 const start=runtime.indexOf("const STARTUP_VERIFIED_SECRET='atgvAssist.startupConnections.verified';");
 const end=runtime.indexOf('async function testAndSaveStartupConnections(message,',start);
 assert.ok(start>0&&end>start);
 vm.createContext(sandbox);
 vm.runInContext(runtime.slice(start,end),sandbox);
 const fields=env.saved;
 env.secrets.set('atgvAssist.sdlcCatalogToken','GIT');
 const signature=hash(JSON.stringify(setup.validate(fields)));
 env.secrets.set('atgvAssist.startupConnections.verified',JSON.stringify({
  signature,tokenDigest:hash('ATL'+'\\0'+'GIT')
 }));
 return {env,sandbox,signature,async stored(){return sandbox.storedStartupVerification();},async state(){return sandbox.startupStatus();}};
}
test('Saved successful Test & Save verification restores across VS Code restart and enables Proceed',async()=>{
 const x=hostFixture(),status=await x.state();
 assert.equal(status.verified,true);
 assert.equal(status.required,true);
 assert.equal(status.saved.projectRepoUrl,undefined,'project URL does not belong to Start connections');
 assert.equal(x.sandbox.startupSessionVerified,true);
 assert.equal(x.sandbox.startupVerifiedSignature,x.signature);
 assert.ok(await x.stored());
});
test('Saved Atlassian verification remains valid when no GitHub PAT is configured',async()=>{
 const x=hostFixture();
 x.env.tokens.github=undefined;
 x.env.secrets.set('atgvAssist.sdlcCatalogToken','');
 x.env.secrets.set('atgvAssist.startupConnections.verified',JSON.stringify({
  signature:x.signature,tokenDigest:hash('ATL'+'\\0'+'')
 }));
 assert.ok(await x.stored(),'GitHub token absence must not invalidate verified Jira and Confluence credentials');
 const status=await x.state();
 assert.equal(status.verified,true);
 assert.equal(status.required,true,'user must still press Next manually');
});
test('Changed endpoint, revoked token, missing catalog PAT or altered proof cannot bypass verification',async()=>{
 const x=hostFixture();
 const ok=await x.stored();assert.ok(ok);
 x.env.extensionSettings.github.owner='changed';
 assert.equal(await x.stored(),null,'changed GitHub account owner invalidates saved proof');
 x.env.extensionSettings.github.owner='aiamalaysia';
 x.env.extensionSettings.github.repo='changed';
 assert.equal(await x.stored(),null,'project repository changes invalidate account setup verification');
 x.env.extensionSettings.github.repo=setup.DEFAULTS.projectRepository;
 x.env.tokens.github='GIT-CHANGED';
 assert.equal(await x.stored(),null,'changed PAT invalidates saved proof');
 x.env.tokens.github='GIT';
 x.env.secrets.delete('atgvAssist.sdlcCatalogToken');
 assert.equal(await x.stored(),null,'missing library PAT invalidates saved proof');
 x.env.secrets.set('atgvAssist.sdlcCatalogToken','GIT');
 x.env.secrets.set('atgvAssist.startupConnections.verified','not-json');
 assert.equal(await x.stored(),null,'corrupted proof must fail closed');
 x.env.secrets.delete('atgvAssist.startupConnections.verified');
 assert.equal((await x.state()).verified,false,'unverified config cannot silently re-enable Proceed');
 assert.equal(x.sandbox.startupSessionVerified,false);
});

function webviewFixture(startPage=0){
 const nodes=new Map(),sent=[];
 const find=id=>{
  if(!nodes.has(id)){
   const classes=new Set();
   nodes.set(id,{value:'',disabled:false,textContent:'',className:'',classes,
    classList:{toggle:(cls,on)=>on?classes.add(cls):classes.delete(cls),contains:cls=>classes.has(cls)},
    focus(){},setAttribute(){},
    addEventListener(){},reportValidity(){return true;}
   });
  }
  return nodes.get(id);
 };
 const a=ui.indexOf('function renderStartupPage(){');
 const z=ui.indexOf('function renderStartupStackReadiness(',a);
 assert.ok(a>0&&z>a);
 const source=[
  "const startupFieldMap={jiraUrl:'startupJiraUrl',email:'startupEmail',githubUrl:'startupGithubUrl',projectRepository:'startupProjectRepository'};",
  "let startupSetupRequired=true,startupPage="+startPage+",startupVerifying=false,startupInstallingModule='',startupConnectionVerified=false,startupConnectionEditSnapshot=null,startupScanComplete=true,startupFormInitialized=false,startupReturnToConnections=false,startupPrereqRequested=false,startupOpenStackId='',startupCopilotModalOpen=false; let gateBusy=false,gateError='',workspaceOpened=false,opening={phase:'search'};",
  "let startupProceedMode='',startupConnectionHealthError=false,startupConnectionCheckPending=false; function resetStartupConnectionChecks(){}",
  'function updateStartupRepositoryPreview(){}',
  ui.slice(a,z),
  "return {renderStartupConfig,renderStartupPage,getPage:()=>startupPage,isVerified:()=>startupConnectionVerified,setOpening:p=>opening={phase:p},setGateBusy:v=>gateBusy=v,setGateError:v=>gateError=v};"
 ].join('\n');
 const create=new Function('$','updateHeaderUserName','extensionSettings','startupScanPercent','renderStartupScanPlaceholders','send',source);
 return {find,sent,client:create(find,()=>{}, {jira:{}},()=>{},()=>{},(command,extra)=>sent.push({command,...extra}))};
}
test('Verified settings still open the prerequisite page first and retain locked saved connection fields',()=>{
 const {find,client}=webviewFixture(1);
 client.renderStartupConfig({required:true,verified:true,saved:setup.DEFAULTS,defaults:setup.DEFAULTS});
 assert.equal(client.isVerified(),true);
 assert.equal(client.getPage(),0,'ATGV: Start must not skip Technology stack prerequisites');
 assert.equal(find('startupProceed').textContent,'Next: Search Project →');
 assert.equal(find('startupProceed').disabled,false);
 assert.equal(find('startupPrevious').disabled,true,'Previous is unavailable on the first screen');
 assert.equal(find('startupComputerCard').classList.contains('hidden'),false);
 assert.equal(find('startupConnectionForm').classList.contains('hidden'),true);
 assert.equal(find('startupTestSavedConnections').disabled,false);
 assert.equal(find('startupTestSavedConnections').classList.contains('hidden'),false);
 assert.equal(find('startupTestConnections').disabled,true);
 assert.equal(find('startupTestConnections').classList.contains('hidden'),true);
 for(const id of ['startupJiraUrl','startupEmail','startupAtlassianToken','startupGithubUrl','startupProjectRepository','startupGithubToken'])
  assert.equal(find(id).disabled,true,id);
 assert.match(find('startupConnectionMessage').textContent,/already verified and saved/);
});
test('Unverified settings keep Test & Save available and Search Project unavailable',()=>{
 const {find,client}=webviewFixture();
 client.renderStartupConfig({required:true,verified:false,saved:setup.DEFAULTS,defaults:setup.DEFAULTS});
 assert.equal(client.isVerified(),false);
 assert.equal(client.getPage(),0);
 assert.equal(find('startupTestConnections').classList.contains('hidden'),false);
 assert.equal(find('startupTestConnections').disabled,false);
 assert.equal(find('startupJiraUrl').disabled,false);
});

test('session startup flag cannot redisplay credential wizard during an opening or opened project',async()=>{
 const x=hostFixture();
 assert.equal((await x.state()).required,true,'brand new Start screen still requests setup');
 for(const phase of ['selected','tested','initialized','open']){
  x.sandbox.openingFlow.phase=phase;
  assert.equal((await x.state()).required,false,'never redirect during '+phase);
 }
 x.sandbox.openingFlow.phase='search';
 x.sandbox.openingLocked=true;
 assert.equal((await x.state()).required,false,'project resolution also suppresses setup screen');
 x.sandbox.openingLocked=false;
 x.sandbox.activeProject={id:'demo'};
 assert.equal((await x.state()).required,false,'already activated project cannot return to credentials');
 x.sandbox.activeProject=null;
 assert.equal((await x.state()).required,true,'fresh Start screen can still display onboarding');
});
test('stale startup state never overlays Open Project progress, success or a retryable error',()=>{
 const {find,client}=webviewFixture();
 const config={required:true,verified:true,saved:setup.DEFAULTS,defaults:setup.DEFAULTS};
 client.renderStartupConfig(config);
 assert.equal(find('startupSetup').classList.contains('hidden'),false,'initial onboarding is visible');
 client.setGateBusy(true);
 client.renderStartupConfig(config);
 assert.equal(find('startupSetup').classList.contains('hidden'),true,'opening progress must stay visible');
 assert.equal(find('gateFinder').classList.contains('hidden'),false);
 client.setGateBusy(false);client.setOpening('selected');
 client.renderStartupConfig(config);
 assert.equal(find('startupSetup').classList.contains('hidden'),true,'selected project retains search screen');
 client.setOpening('open');
 client.renderStartupConfig(config);
 assert.equal(find('startupSetup').classList.contains('hidden'),true,'opened project must not show credentials');
 client.setOpening('search');client.setGateError('Jira project access denied');
 client.renderStartupConfig(config);
 assert.equal(find('startupSetup').classList.contains('hidden'),true,'failed opening retains actionable error');
 client.setGateError('');
 client.renderStartupConfig(config);
 assert.equal(find('startupSetup').classList.contains('hidden'),false,'new search may intentionally start onboarding');
});
test('intermediate opening state refresh never resets user-visible progress',()=>{
 const ui=read('media/start.js');
 assert.match(ui,/if\(opening\.phase==='open'\|\|\(opening\.phase==='search'&&prior!=='search'\)\)gateBusy=false/);
 assert.match(ui,/if\(gateBusy\)\{document\.body\.classList\.add\('gate-mode'\);renderGate\(\);\}/);
 assert.match(ui,/const openingInProgress=gateBusy\|\|!!gateError\|\|workspaceOpened/);
});
