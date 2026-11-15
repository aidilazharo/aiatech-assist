'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const from = source.indexOf('async function start(options={})');
const until = source.indexOf('\nasync function notice(',from);
assert.ok(from>=0&&until>from);
const functionSource = source.slice(from,until);

test('each ATGV Start internal reopen reloads webview HTML, not just reveals the old DOM',async()=>{
 const events=[];
 const webview={postMessage:async message=>{events.push(['send',message.type]);return true;},set html(value){events.push(['html',value]);},get html(){return undefined;}};
 const panel={webview,reveal:()=>events.push(['reveal'])};
 let serial=0;
 const env={
  ready:Promise.resolve(),vscode:{ViewColumn:{One:1},Uri:{joinPath:()=>({}),file:()=>({})}},dashboard:panel,
  focusAtgvWorkspace:async()=>events.push(['focus']),
  prepareVendorAssets:async()=>null,installedVendorAssets:null,context:{extensionUri:{}},
  openingGeneration:0,openingFlow:{reset:()=>{}},openingOffline:false,
  discoveredSpaces:[],discoveredJiraProjects:[],approvedJiraPreviewRevision:null,
  approvedJiraPreviewBinding:null,activationEpoch:0,activeProject:null,store:null,
  tree:{refresh:()=>{}},startupSequence:0,startupScan:null,
  html:()=>`<html>ATGV fresh ${++serial}</html>`,
  refreshDashboard:async()=>events.push(['refresh']),
  autoLoadWorkspaceProject:async seq=>events.push(['load',seq]),
  startupIsComplete:()=>true,startupSessionVerified:false,startupVerifiedSignature:'',
  report:()=>{}
 };
 vm.createContext(env);
 vm.runInContext(functionSource,env);
 await env.start({skipReload:true});
 await env.start({skipReload:true});
 assert.deepEqual(events.filter(([name])=>name==='html').map(x=>x[1]),[
  '<html>ATGV fresh 1</html>', '<html>ATGV fresh 2</html>'
 ]);
 assert.equal(events.filter(([name])=>name==='reveal').length,2);
 assert.equal(events.filter(([name])=>name==='refresh').length,2);
 assert.deepEqual(events.filter(([name])=>name==='load').map(x=>x[1]),[1,2]);
 assert.equal(events.some(([name,type])=>name==='send'&&type==='openingStart'),false,
   'A fresh webview must not receive an obsolete partial-reset message');
});

test('new ATGV webview panel is created with fresh HTML and one message handler',()=>{
 assert.match(functionSource,/dashboard=vscode\.window\.createWebviewPanel\(/);
 assert.match(functionSource,/dashboard\.webview\.html=html\(dashboard\.webview\)/);
 assert.equal((functionSource.match(/dashboard\.webview\.onDidReceiveMessage\(/g)||[]).length,1);
});
