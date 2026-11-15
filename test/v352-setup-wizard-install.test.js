'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const setup=require('../src/lib/startup-setup');
const installer=require('../src/lib/startup-install');
const projects=require('../src/projects');
const clients=require('../src/clients');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Confluence Cloud site base URL is canonicalized to /wiki even when Jira uses another Cloud site',()=>{
 const data=setup.validate({...setup.DEFAULTS,jiraUrl:'https://aidilazharo.atlassian.net',confluenceUrl:'https://aiamy-jira-azure.atlassian.net'});
 assert.equal(data.confluenceUrl,'https://aiamy-jira-azure.atlassian.net/wiki');
 const data2=setup.validate({...data,confluenceUrl:'https://aiamy-jira-azure.atlassian.net/wiki/'});
 assert.equal(data2.confluenceUrl,data.confluenceUrl);
 for(const bad of ['https://other.example.com/wiki','https://other.atlassian.net/notwiki','http://other.atlassian.net/wiki']){
  assert.throws(()=>setup.validate({...data,confluenceUrl:bad}));
 }
});
test('Existing extension settings support separate trusted Atlassian Cloud domains without allowing arbitrary hosts',()=>{
 const saved=projects.normalizeExtensionSettings({jira:{baseUrl:'https://aidilazharo.atlassian.net'},confluence:{baseUrl:'https://aiamy-jira-azure.atlassian.net'}});
 assert.equal(saved.confluence.baseUrl,'https://aiamy-jira-azure.atlassian.net/wiki');
 const effective=projects.projectConfig(null,saved);
 assert.equal(clients.baseConfluence(effective),'https://aiamy-jira-azure.atlassian.net/wiki');
 assert.throws(()=>projects.normalizeExtensionSettings({jira:{baseUrl:'https://aidilazharo.atlassian.net'},confluence:{baseUrl:'https://not-atlassian.example.com'}}),/trusted Atlassian Cloud/);
});
test('Only allowlisted module IDs are used by host installers, no webview shell commands',()=>{
 assert.throws(()=>installer.plan('node && rm -rf /','win32'),/Unknown/);
 assert.throws(()=>installer.plan('../node','win32'),/Unknown/);
 const windows=installer.plan('dotnet','win32');
 assert.equal(windows.command,'winget');
 assert.deepEqual(windows.args.slice(0,3),['install','--id','Microsoft.DotNet.SDK.10']);
 assert.equal(windows.shell,false);
 const java=installer.plan('java','win32');
 assert.ok(java.args.includes('EclipseAdoptium.Temurin.25.JDK'));
 const angular=installer.plan('angular','win32');
 assert.equal(angular.command,'npm.cmd');assert.equal(angular.shell,true);
 assert.deepEqual(angular.args,['install','--global','@angular/cli']);
 assert.equal(installer.plan('maven','win32').command,'','no unverified Windows Maven package identifier should be executed');
 assert.ok(installer.plan('maven','win32').guideUrl.startsWith('https://maven.apache.org/'));
 assert.equal(installer.plan('maven','darwin').command,'brew');
 assert.equal(installer.plan('git','linux').command,'','Linux system-level changes require instructions instead of automatic sudo');
});
test('Installer reports actual running state and subprocess completion, never a fictional percentage',async()=>{
 const steps=[];
 const spawnImpl=(command,args,opts)=>{
  assert.equal(command,'winget');assert.equal(opts.shell,false);
  const process=new EventEmitter();process.stdout=new EventEmitter();process.stderr=new EventEmitter();
  queueMicrotask(()=>{process.stdout.emit('data',Buffer.from('Downloading installer\n'));process.emit('close',0,null);});
  process.kill=()=>{};
  return process;
 };
 const done=await installer.install('dotnet',{platform:'win32',spawnImpl,onProgress:x=>steps.push(x),timeoutMs:3000});
 assert.equal(done.status,'complete');assert.equal(done.id,'dotnet');
 assert.equal(steps[0].status,'running');
 assert.equal('percent' in steps[0],false);
});
test('Wizard replaces headings with separate Previous/Next navigation, Refresh in prerequisites header, and installer progress',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),js=read('media/start.js'),css=read('media/start.css');
 assert.match(html,/id="startupComputerCard"/);assert.match(html,/id="startupPrevious"/);assert.match(html,/id="startupProceed" disabled>Next/);
 assert.match(html,/atgv-startup-section-title.*Technology stack prerequisites.*id="startupRefresh"/);
 assert.doesNotMatch(html,/Recheck Computer|Computer &amp; Connection Readiness|1\. Computer|2\. Connections|3\. Search Project/);
 assert.match(js,/startupPage===0\?\!startupScanComplete:\!startupConnectionVerified/);
 assert.match(js,/startupPage=1;renderStartupPage\(\)/);
 assert.match(js,/send\('startupInstallModule'/);
 assert.match(js,/startupModuleProgress/);
 assert.match(css,/\.atgv-module-progress/);
});
test('Installer is gated by explicit user approval and emits progress after a trusted command was chosen',()=>{
 const runtime=read('src/lib/runtime/extension-runtime.js');
 assert.match(runtime,/case 'startupInstallModule'/);
 assert.match(runtime,/startupInstall\.plan\(id\)/);
 assert.match(runtime,/offerBrandedPrerequisiteInstall\(plan\)/);
 assert.match(runtime,/pendingPrerequisiteInstallOffers/);
 assert.match(runtime,/case 'startupPrerequisiteDecision':/);
 assert.match(runtime,/plan\.command/);
 assert.match(runtime,/startupInstall\.install\(id/);
 assert.match(runtime,/status:'error'/);
});

test('Start connections are compact two-per-row without the introductory paragraph',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),css=read('media/start.css');
 const form=html.match(/<form id="startupConnectionForm"[\s\S]*?<\/form>/)?.[0];
 assert.ok(form,'onboarding connection form must exist');
 assert.match(form,/class="form-grid atgv-startup-connection-grid"/);
 assert.doesNotMatch(form,/Suggested AIA values are provided below|Existing saved settings are retained|Jira and Confluence use the same Atlassian account and API token/);
 const fields=[...form.matchAll(/<div class="field(?: full)?"><label for="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(fields,[
  'startupJiraUrl','startupConfluenceUrl',
  'startupEmail','startupAtlassianToken',
  'startupGithubUrl','startupGithubToken',
  'startupProjectRepo','startupLibraryRepo',
 ]);
 assert.doesNotMatch(form,/class="field full"/);
 assert.match(css,/#startupConnectionForm \.atgv-startup-connection-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:740px\)\{#startupConnectionForm \.atgv-startup-connection-grid\{grid-template-columns:minmax\(0,1fr\)/);
});
