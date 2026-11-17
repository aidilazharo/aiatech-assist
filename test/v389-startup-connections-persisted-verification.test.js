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
 const saved=setup.DEFAULTS,library={repositoryUrl:saved.libraryRepoUrl};
 const env={
  saved:JSON.parse(JSON.stringify(saved)),
  tokens:{atlassian:'ATL',github:'GIT'},
  secrets:new Map(),
  verified:false,
  extensionSettings:{
   jira:{baseUrl:saved.jiraUrl,email:saved.email},
   confluence:{baseUrl:saved.confluenceUrl},
   github:{owner:'aiamalaysia',repo:'my-fow-technology-app-techassists-enterprise-cockpit'}
  }
 };
 const sandbox={
  startupSetup:setup,sha:hash,context:{secrets:{
   get:async k=>env.secrets.get(k),
   store:async(k,v)=>env.secrets.set(k,v)
  }},
  extensionSettings:env.extensionSettings,
  startupSessionVerified:false,startupVerifiedSignature:'',startupSessionProceedApproved:false,
  catalogConfig:()=>library,getWorkspace:()=>null,
  globalSecretKey:x=>x,globalCredentialEndpoint:kind=>({kind}),
  readToken:async(kind)=>env.tokens[kind],
  sdlcCatalog:{activeRoot:async()=>({})},report:()=>{}
 };
 const start=runtime.indexOf("const STARTUP_VERIFIED_SECRET='atgvAssist.startupConnections.verified';");
 const end=runtime.indexOf('async function testAndSaveStartupConnections(message){',start);
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
 assert.equal(status.saved.projectRepoUrl,setup.DEFAULTS.projectRepoUrl);
 assert.equal(x.sandbox.startupSessionVerified,true);
 assert.equal(x.sandbox.startupVerifiedSignature,x.signature);
 assert.ok(await x.stored());
});
test('Changed endpoint, revoked token, missing catalog PAT or altered proof cannot bypass verification',async()=>{
 const x=hostFixture();
 const ok=await x.stored();assert.ok(ok);
 x.env.extensionSettings.github.repo='changed';
 assert.equal(await x.stored(),null,'changed project repo invalidates saved proof');
 x.env.extensionSettings.github.repo='my-fow-technology-app-techassists-enterprise-cockpit';
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

function webviewFixture(){
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
  "const startupFieldMap={jiraUrl:'startupJiraUrl',confluenceUrl:'startupConfluenceUrl',email:'startupEmail',githubUrl:'startupGithubUrl',projectRepoUrl:'startupProjectRepo',libraryRepoUrl:'startupLibraryRepo'};",
  "let startupSetupRequired=true,startupPage=0,startupVerifying=false,startupInstallingModule='',startupConnectionVerified=false,startupScanComplete=true,startupFormInitialized=false,startupReturnToConnections=false,startupPrereqRequested=false;",
  ui.slice(a,z),
  "return {renderStartupConfig,renderStartupPage,getPage:()=>startupPage,isVerified:()=>startupConnectionVerified};"
 ].join('\n');
 const create=new Function('$','updateHeaderUserName','extensionSettings','startupScanPercent','renderStartupScanPlaceholders','send',source);
 return {find,sent,client:create(find,()=>{}, {jira:{}},()=>{},()=>{},(command,extra)=>sent.push({command,...extra}))};
}
test('Verified settings restore locked fields, hidden Test & Save and enabled Next: Search Project',()=>{
 const {find,client}=webviewFixture();
 client.renderStartupConfig({required:true,verified:true,saved:setup.DEFAULTS,defaults:setup.DEFAULTS});
 assert.equal(client.isVerified(),true);
 assert.equal(client.getPage(),1);
 assert.equal(find('startupProceed').textContent,'Next: Search Project →');
 assert.equal(find('startupProceed').disabled,false);
 assert.equal(find('startupTestConnections').disabled,true);
 assert.equal(find('startupTestConnections').classList.contains('hidden'),true);
 for(const id of ['startupJiraUrl','startupConfluenceUrl','startupEmail','startupAtlassianToken','startupGithubUrl','startupGithubToken','startupProjectRepo','startupLibraryRepo','startupLibraryZipUpload'])
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
