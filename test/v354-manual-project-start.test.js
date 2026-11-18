'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('first step hides Previous and Search Project alone offers Previous back to Connections',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 assert.match(html,/id="startupPrevious" class="secondary hidden" disabled/);
 assert.match(js,/startupPrevious'\)\.classList\.toggle\('hidden',startupPage===0\)/);
 assert.match(html,/id="gateSearchPrevious"/);
 assert.match(js,/gateSearchPrevious'\)\.addEventListener\('click'/);
 assert.match(js,/startupReturnToConnections=true;startupPage=1;/);
 assert.doesNotMatch(js,/startupReturnToConnections=true;startupPage=1;startupConnectionVerified=false/);
 assert.match(js,/showStartupStep\(required\|\|startupReturnToConnections\)/);
 assert.match(js,/startupReturnToConnections=false;showStartupStep\(false\)/);
});

test('project rows launch without duplicate project-selection confirmation',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),js=read('media/start.js');
 assert.ok(js.includes("gateFinder').classList.toggle('hidden',startupSetupRequired)"));
 assert.ok(js.includes("gateFinder').classList.toggle('hidden',required)"));
 assert.doesNotMatch(html,/id="(?:gateSelection|gatePrimary|gateChange)"/);
 assert.doesNotMatch(js,/gateSelection|gatePrimary|gateChange|gateStepStatus/);
 for(const id of ['gateOpeningError','gateRecovery','gateOffline'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.ok(js.includes("gateOpeningError').textContent=gateError"));
 assert.ok(js.includes("gateRecovery').classList.toggle('hidden',!gateOfflineAvailable)"));
 assert.equal((html.match(/id="gateManual"/g)||[]).length,1);
 assert.ok(js.includes("gateWorkspaceSection').classList.toggle('hidden',!others.length&&!!recentProjects.length)"));
});

test('ATGV start keeps manual discovery available until the webview is ready',async()=>{
 const source=read('src/lib/runtime/extension-runtime.js');
 assert.doesNotMatch(source,/autoLoadWorkspaceProject/);
 assert.doesNotMatch(source,/chooseProject\(projects/);
 assert.match(source,/startupSessionProceedApproved=false/);
 assert.match(source,/required:!startupSessionProceedApproved&&!openingActive/);
 assert.doesNotMatch(source,/if\(startupIsComplete\(\)\)await finishManualProjectDiscovery\(sequence\)/);
 const begin=source.indexOf('async function finishManualProjectDiscovery(sequence){');
 const end=source.indexOf('\nasync function restart(){',begin);
 assert.ok(begin>=0&&end>begin);
 const messages=[];
 const env={startupSequence:11,startupScan:null,activeProject:null,webviewCoreReady:false,
  dashboard:{webview:{postMessage:async msg=>messages.push(msg)}},
  refreshDashboard:async()=>messages.push({type:'refresh'})};
 vm.createContext(env);vm.runInContext(source.slice(begin,end),env);
 await env.finishManualProjectDiscovery(10);
 assert.equal(messages.length,0,'ignore stale startup sequences');
 await env.finishManualProjectDiscovery(11);
 assert.equal(messages.length,0,'wait for stylesheet and controller readiness');
 env.webviewCoreReady=true;
 await env.finishManualProjectDiscovery(11);
 assert.equal(env.startupScan.status,'complete');
 assert.match(env.startupScan.message,/Choose a project/);
 assert.equal(env.activeProject,null);
 assert.deepEqual(messages.map(m=>m.type),['startupScan','refresh']);
});

test('manual project opening remains available alongside guarded automatic resume',()=>{
 const js=read('media/start.js');
 const runtime=read('src/lib/runtime/extension-runtime.js');
 assert.match(js,/action\.addEventListener\('click',\(\)=>launchFromGate\(\{projectId:project\.id\}\)\)/);
 assert.ok(js.includes("button.addEventListener('click',()=>launchFromGate({spaceId:sp.id}))"));
 assert.match(runtime,/case 'openingAuto':\{/);
 assert.match(runtime,/if\(msg\.autoResume\).*requireAutomaticStartup/);
 assert.match(js,/launchFromGate\(\{projectId,autoResume:true\}\)/);
});
