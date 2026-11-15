'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const defaults=require('../src/lib/startup-setup');
const readiness=require('../src/lib/startup-readiness');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('AIA connection placeholders are exact and validated, not treated as saved credentials',()=>{
 assert.deepEqual(defaults.DEFAULTS,{
  jiraUrl:'https://aiamy-jira-azure.atlassian.net',
  confluenceUrl:'https://aiamy-jira-azure.atlassian.net/wiki',
  email:'user.name@aia.com',
  githubUrl:'https://github.com/aiamalaysia',
  projectRepoUrl:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-cockpit',
  libraryRepoUrl:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills'
 });
 const parsed=defaults.validate(defaults.DEFAULTS);assert.equal(parsed.owner,'aiamalaysia');
 assert.equal(parsed.library.repo,'my-fow-technology-app-techassists-enterprise-skills');
});
test('connection form disallows incorrect service origins, untrusted URL forms and repository owners',()=>{
 const base=defaults.DEFAULTS;
 for(const config of [
  {...base,jiraUrl:'http://aiamy-jira-azure.atlassian.net'},
  {...base,confluenceUrl:'https://other.atlassian.net/wiki'},
  {...base,confluenceUrl:'https://aiamy-jira-azure.atlassian.net/other'},
  {...base,projectRepoUrl:'https://github.com/evil/another'},
  {...base,githubUrl:'https://github.com/aiamalaysia/extra'},
  {...base,libraryRepoUrl:'https://github.com/aiamalaysia/repo?token=BAD'},
  {...base,email:'invalid'}
 ])assert.throws(()=>defaults.validate(config));
});
test('all five technology stacks report real prerequisite status and component details',async()=>{
 const result=await readiness.check({runner:async name=>{
  if(['node','npm','git','npx','dotnet','java'].includes(name))return {stdout:name==='node'?'v22.22.3':name==='dotnet'?'10.0.1':name==='java'?'java version "25.0.1"':'9.0.0'};
  throw Error('not installed');
 }});
 assert.equal(result.stacks.length,5);
 assert.deepEqual(result.stacks.map(s=>s.id),['react','angular','nestjs','dotnet','spring-boot']);
 assert.deepEqual(result.stacks.map(s=>s.ready),[true,true,true,true,false]);
 assert.equal(result.stacks.find(s=>s.id==='spring-boot').components.find(c=>c.id==='maven').installed,false);
});
test('React stack becomes incompatible when an old Node.js version is detected',()=>{
 const out=readiness.assessStack(readiness.STACKS[0],{node:{installed:true,version:'v20.11.0'},npm:{installed:true,version:'10.0'},git:{installed:true,version:'git version 2.5'}});
 assert.equal(out.ready,false);assert.equal(out.components[0].compatible,false);
});
test('start page and branded extension-update modal are separate surfaces',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const ui=read('media/start.js');const css=read('media/start.css');
 assert.match(html,/id="startupSetup" class="atgv-startup-setup"/);
 assert.match(html,/id="startupProceed" disabled/);
 assert.match(html,/id="startupStackGrid"/);
 assert.match(html,/id="extensionUpgradeModal" class="modal-overlay hidden"/);
 assert.match(html,/atgv-upgrade-brand"><img src="\$\{brand\}"/);
 assert.match(ui,/send\('startupReadiness'\)/);assert.match(ui,/send\('startupTestConnections'/);
 assert.match(ui,/send\('startupProceed'/);assert.match(ui,/send\('extensionUpgradeDecision'/);
 assert.match(css,/\.atgv-upgrade-modal/);
 assert.equal((html.match(/id="extensionUpgradeModal"/g)||[]).length,1);
});
test('host requires live Jira, Confluence, GitHub and library checks before saving and proceeding',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.match(host,/await testJiraConnection\(config,atlassian\)/);
 assert.match(host,/\/api\/v2\/spaces\?limit=1/);
 assert.match(host,/await sdlcCatalog\.remoteInfo\(libraryConf,github\)/);
 assert.match(host,/atgvAssist\.startupSetup\.completed/);
 assert.match(host,/startupVerifiedSignature!==sha/);
 assert.match(host,/offerBrandedExtensionUpgrade\(release\)/);
 assert.doesNotMatch(host,/showInformationMessage\(`ATGV v\$\{release\.version\} is available \(installed:/);
});
test('version and AIA email placeholders are consistent',()=>{
 const pkg=require('../package.json');assert.equal(pkg.version,'0.3.51');assert.equal(pkg.atgvDisplayVersion,'0.3.51');
 const html=read('src/lib/webview/dashboard-html.js');
 assert.match(html,/field\('jiraEmail'/);assert.match(html,/user\.name@aia\.com/);
 assert.match(html,/my-fow-technology-app-techassists-enterprise-cockpit/);
});

test('setup host saves no credentials before all five remote access checks succeed',async()=>{
 const vm=require('node:vm');
 const crypto=require('node:crypto');
 const normalized=require('../src/projects').normalizeExtensionSettings;
 const setupText=read('src/lib/runtime/extension-runtime.js');
 const start=setupText.indexOf('async function testAndSaveStartupConnections(message){');
 const end=setupText.indexOf('\nasync function dashboardState()',start);
 assert.ok(start>=0&&end>start);
 const events=[],state=new Map(),secrets=new Map();
 let denyLibrary=false;
 const testContext={
  startupSessionVerified:false,startupVerifiedSignature:'',startupSetup:defaults,
  extensionSettings:{},cfg:()=>({get:()=>undefined}),
  normalizeExtensionSettings:normalized,
  projectConfig:(_p,settings)=>({get:key=>key==='github.apiUrl'?'https://api.github.com':settings[key.split('.')[0]]?.[key.split('.')[1]]||''}),
  validateUrl:s=>s,
  globalSecretKey:k=>'secret-'+k,
  readToken:async()=>undefined,
  storeToken:async (key,identity,token)=>{events.push('stored:'+key);secrets.set(key,{identity,token});},
  testJiraConnection:async()=>{events.push('jira');return {displayName:'Tester'};},
  requestJson:async(url)=>{
   if(url.includes('/api/v2/spaces')){events.push('confluence');return {results:[]};}
   if(url.endsWith('/user')){events.push('github-account');return {login:'tester'};}
   const match=url.match(/\/repos\/([^/]+)\/([^/]+)$/);
   if(match){events.push('github-repo:'+match[2]);return {full_name:match[1]+'/'+match[2]};}
   throw Error('Unexpected URL: '+url);
  },
  sdlcCatalog:{normalizeConfig:c=>c,remoteInfo:async()=>{events.push('library-main');if(denyLibrary)throw Error('Access denied');return {sha:'aabbccdd'};}},
  context:{globalState:{update:async(key,value)=>{events.push('saved:'+key);state.set(key,value);}},secrets:{store:async(key,token)=>{secrets.set(key,token);events.push('stored:'+key);}}},
  scheduleCatalogChecks:()=>{},
  pendingTests:{jira:null,github:null},catalogRemote:null,catalogLastCheck:'',catalogLastError:'',
  sha:value=>crypto.createHash('sha256').update(String(value)).digest('hex'),
 };
 vm.createContext(testContext);vm.runInContext(setupText.slice(start,end),testContext);
 const form=defaults.DEFAULTS;
 denyLibrary=true;
 await assert.rejects(testContext.testAndSaveStartupConnections({settings:form,atlassianToken:'ATL',githubToken:'PAT'}),/Access denied/);
 assert.equal(state.size,0);assert.equal(secrets.size,0);
 denyLibrary=false;
 const accepted=await testContext.testAndSaveStartupConnections({settings:form,atlassianToken:'ATL',githubToken:'PAT'});
 assert.equal(accepted.success,true);
 assert.deepEqual(events.filter(e=>['jira','confluence','github-account','library-main'].includes(e)).slice(-4),['jira','confluence','github-account','library-main']);
 assert.equal(state.get('atgvAssist.extensionSettings').github.repo,'my-fow-technology-app-techassists-enterprise-cockpit');
 assert.equal(state.get('atgvAssist.sdlcCatalog').repositoryUrl,form.libraryRepoUrl);
 assert.equal(state.get('atgvAssist.startupSetup.completed'),undefined,'Testing alone must not mark setup complete. Proceed must do that.');
 assert.equal(secrets.get('secret-atlassian').token,'ATL');
 assert.equal(secrets.get('secret-github').token,'PAT');
 assert.equal(secrets.get('atgvAssist.sdlcCatalogToken'),'PAT');
});
