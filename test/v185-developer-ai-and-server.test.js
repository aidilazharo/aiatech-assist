'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const server=require('../src/architect-server');
function fakeDriver({running=false,cwd='/tmp/atgv-repo',branch='bootstrap/react-initial',installed=true,port=true}={}){
 let active=running,starts=0,stops=0;
 return {
  catalogStackConfig:async()=>({previewUrl:'http://127.0.0.1:5173/'}),
  inspectScripts:async inspectedRoot=>({repo:{root:inspectedRoot,branch,clean:true},targets:[{relative:'',kind:'npm',installed,scripts:['dev','build','test']}]}),
  localLogs:()=>({running:active,cwd}),
  runLocal:async()=>{active=true;starts++;},stopLocal:async()=>{active=false;stops++;},
  counters:()=>({starts,stops,active})
 };
}
const prepared={root:'/tmp/atgv-repo',stackId:'react',branch:'bootstrap/react-initial'};
test('AI Development button sends a real copilot start request, not Jira refresh',()=>{
 const js=read('media/start.js');
 assert.match(js,/\$\('developerTaskRefresh'\)\.addEventListener\('click',startDeveloperAi\)/);
 assert.match(js,/send\('devCopilotStart',\{key,base:project\.techStackPrepared\.branch\}\)/);
 assert.doesNotMatch(js,/\$\('developerTaskRefresh'\)\.addEventListener\('click',\(\)=>loadRoleJiraIssues/);
 for(const type of ['devCopilotAI','devCopilotStartResult','devCopilotStartError','devCopilotStartCancelled'])assert.ok(js.includes(type));
});
test('Developer branch starts from the saved GitHub bootstrap branch and validates assignment',()=>{
 const host=read('test/generated/extension-source.txt'),scope=host.split("case 'devCopilotStart':{")[1].split("case 'devRepositoryStatus':{")[0];
 assert.match(scope,/const base=prepared\.branch/);
 assert.match(scope,/createBranch\(folder,key,\{summary,base\}\)/);
 assert.match(scope,/issue\.fields\?\.assignee\?\.accountId!==self\.accountId/);
 assert.match(scope,/devCopilotStartCancelled/);
});
test('Architect controls expose server state through one Run/Stop toggle',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js'),css=read('media/start.css');
 for(const cmd of ['architectRunServer','architectStopServer','architectServerStatus']){
  assert.match(host,new RegExp("case '"+cmd+"':"));assert.ok(ui.includes(cmd));
 }
 assert.match(host,/id="architectServerToggle"/);assert.doesNotMatch(host,/id="architectStopServer"/);assert.match(ui,/architectServerSnapshot\.running\?'architectStopServer':'architectRunServer'/);
 assert.match(css,/#workView \.architect-simple-top/);
 assert.match(css,/#workView \.architect-simple-actions button\{min-height:32px/);
});
test('Server starts only on the prepared branch and opens healthy localhost preview',async()=>{
 const driver=fakeDriver();let opened='';
 const result=await server.start({root:'/tmp/atgv-repo',stackId:'react',prepared,driver,
  openBrowser:async url=>(opened=url,true),effects:{portAvailable:async()=>true,waitForHttp:async()=>{}}});
 assert.equal(result.running,true);assert.equal(opened,'http://127.0.0.1:5173/');assert.equal(driver.counters().starts,1);
 await server.stop({root:'/tmp/atgv-repo',stackId:'react',driver});
 assert.equal(driver.counters().stops,1);
});
test('Server reuses its owned process and does not launch twice',async()=>{
 const driver=fakeDriver({running:true});
 await server.start({root:'/tmp/atgv-repo',stackId:'react',prepared,driver,openBrowser:async()=>true,effects:{waitForHttp:async()=>{}}});
 assert.equal(driver.counters().starts,0);
});
test('Server refuses a different project process, missing dependencies, or wrong branch',async()=>{
 const other=fakeDriver({running:true,cwd:'/tmp/other'});
 await assert.rejects(server.stop({root:'/tmp/atgv-repo',stackId:'react',driver:other}),/Another project owns/);
 await assert.rejects(server.start({root:'/tmp/atgv-repo',stackId:'react',prepared,driver:other}),/different app server/);
 await assert.rejects(server.start({root:'/tmp/atgv-repo',stackId:'react',prepared,driver:fakeDriver({installed:false})}),/Dependencies are missing/);
 const previewDriver=fakeDriver({branch:'feature/tc-296',cwd:'/tmp/atgv-architect-preview'});
 const result=await server.start({root:'/tmp/atgv-repo',stackId:'react',prepared,driver:previewDriver,openBrowser:async()=>true,effects:{prepareWorktree:async()=>({root:'/tmp/atgv-architect-preview'}),waitForHttp:async()=>{},portAvailable:async()=>true}});
 assert.match(result.message,/isolated approved-revision preview/);
 assert.equal(previewDriver.counters().starts,1);
 await server.stop({root:'/tmp/atgv-repo',stackId:'react',driver:previewDriver});
});
test('Server chooses another port when the configured one is occupied and stops only its failed launches',async()=>{
 const driver=fakeDriver();
 let opened='';
 const started=await server.start({root:'/tmp/atgv-repo',stackId:'react',prepared,driver,openBrowser:async url=>(opened=url,true),
  effects:{portAvailable:async url=>!url.includes(':5173/'),waitForHttp:async()=>{}}});
 assert.equal(opened,'http://127.0.0.1:5174/');
 assert.equal(started.url,opened);
 assert.match(started.message,/alternate available port selected/);
 assert.deepEqual(driver.counters(),{starts:1,stops:0,active:true});
 assert.equal((await server.verify({root:'/tmp/atgv-repo',stackId:'react',driver,effects:{waitForHttp:async()=>{}}})).url,opened);
 await server.stop({root:'/tmp/atgv-repo',stackId:'react',driver});
 await assert.rejects(server.start({root:'/tmp/atgv-repo',stackId:'react',prepared,driver,effects:{portAvailable:async()=>true,waitForHttp:async()=>{throw Error('unhealthy');}}}),/unhealthy/);
 assert.deepEqual(driver.counters(),{starts:2,stops:2,active:false});
});
test('Server status is scoped to the selected checkout',async()=>{
 const other=fakeDriver({running:true,cwd:'/tmp/other'});
 assert.equal((await server.status({root:'/tmp/atgv-repo',stackId:'react',driver:other})).running,false);
});
