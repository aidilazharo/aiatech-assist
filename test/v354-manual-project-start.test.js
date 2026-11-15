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
 assert.match(js,/startupReturnToConnections=true;startupPage=1;startupConnectionVerified=false/);
 assert.match(js,/showStartupStep\(required\|\|startupReturnToConnections\)/);
 assert.match(js,/startupReturnToConnections=false;showStartupStep\(false\)/);
});

test('project search and selected project are mutually exclusive; no duplicate open section',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 assert.match(js,/gateFinder'\)\.classList\.toggle\('hidden',startupSetupRequired\|\|selected\)/);
 assert.match(js,/gateSelection'\)\.classList\.toggle\('hidden',startupSetupRequired\|\|!selected\)/);
 assert.match(js,/gateFinder'\)\.classList\.toggle\('hidden',required\|\|!!opening\.candidate\)/);
 assert.match(js,/gateSelection'\)\.classList\.toggle\('hidden',required\|\|!opening\.candidate\)/);
 assert.equal((html.match(/id="gateManual"/g)||[]).length,1,'New Project remains available without a redundant empty Workspace Projects panel');
 assert.match(js,/gateWorkspaceSection'\)\.classList\.toggle\('hidden',!others\.length&&!!recentProjects\.length\)/);
 assert.doesNotMatch(js,/All local projects appear above/);
});

test('ATGV start never automatically opens a saved or sole project',async()=>{
 const source=read('src/lib/runtime/extension-runtime.js');
 assert.doesNotMatch(source,/autoLoadWorkspaceProject/);
 assert.doesNotMatch(source,/chooseProject\(projects/);
 assert.match(source,/if\(startupIsComplete\(\)\)await finishManualProjectDiscovery\(sequence\)/);
 const begin=source.indexOf('async function finishManualProjectDiscovery(sequence){');
 const end=source.indexOf('\nasync function restart(){',begin);
 assert.ok(begin>=0&&end>begin);
 const messages=[];
 const env={startupSequence:11,startupScan:null,activeProject:null,
  dashboard:{webview:{postMessage:async msg=>messages.push(msg)}},
  refreshDashboard:async()=>messages.push({type:'refresh'})};
 vm.createContext(env);vm.runInContext(source.slice(begin,end),env);
 await env.finishManualProjectDiscovery(10);
 assert.equal(messages.length,0,'ignore stale startup sequences');
 await env.finishManualProjectDiscovery(11);
 assert.equal(env.startupScan.status,'complete');
 assert.match(env.startupScan.message,/Choose a project/);
 assert.equal(env.activeProject,null);
 assert.deepEqual(messages.map(m=>m.type),['startupScan','refresh']);
});

test('project is opened only by explicit user action, never as a state or readiness side effect',()=>{
 const js=read('media/start.js');
 const runtime=read('src/lib/runtime/extension-runtime.js');
 assert.match(js,/action\.addEventListener\('click',\(\)=>launchFromGate\(\{projectId:project\.id\}\)\)/);
 assert.match(js,/\$\('gatePrimary'\)\.addEventListener\('click',\(\)=>launchFromGate\(\)\)/);
 assert.match(runtime,/case 'openingAuto':\{/);
 assert.doesNotMatch(runtime,/Auto-opened from local workspace metadata/);
});
