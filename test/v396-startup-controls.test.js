'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('startup Copilot setup reports availability, progress, success and retry',()=>{
 const ui=read('media/start.js'),from=ui.indexOf('function setStartupCopilotStatus('),to=ui.indexOf('function startupScanPercent(',from);
 assert.ok(from>=0&&to>from);
 const nodes={startupCopilotStatus:{},startupCopilotSetup:{}};
 const create=new Function('$',"let startupCopilotBusy=false;"+ui.slice(from,to)+';return {set:setStartupCopilotStatus,render:renderStartupCopilotReadiness};');
 const controls=create(id=>nodes[id]);controls.render({installed:false,compatible:true});
 assert.equal(nodes.startupCopilotSetup.disabled,false);assert.match(nodes.startupCopilotStatus.textContent,/not installed/);
 controls.set('working','Installing…');controls.render({installed:false,compatible:true});
 assert.equal(nodes.startupCopilotSetup.disabled,true);assert.equal(nodes.startupCopilotStatus.textContent,'Installing…');
 controls.set('error','Network unavailable');assert.equal(nodes.startupCopilotSetup.disabled,false);assert.equal(nodes.startupCopilotSetup.textContent,'Retry Setup');
 controls.render({installed:true,compatible:true,version:'1.0.34'});assert.equal(nodes.startupCopilotSetup.disabled,true);assert.match(nodes.startupCopilotStatus.textContent,/Sign in to Copilot CLI/);
 controls.render({installed:false,compatible:false});assert.equal(nodes.startupCopilotSetup.disabled,true);assert.match(nodes.startupCopilotStatus.textContent,/Update VS Code/);
});

test('startup Copilot action installs only when needed and reports trust errors',async()=>{
 const host=read('src/lib/runtime/extension-runtime.js'),from=host.indexOf("      case 'startupSetupCopilot':"),to=host.indexOf("      case 'startupExportUnifiedLog':",from);
 assert.ok(from>=0&&to>from);
 const create=new Function('copilotRepairSdk','vscode','context','dashboard','invalidateModelStatus','report',
  "let startupCopilotSetupRunning=false;return async function(msg){switch(msg.command){"+host.slice(from,to)+"}};");
 let installed=false,installs=0,invalidations=0;const posts=[];
 const sdk={installed:async()=>installed,install:async(_root,{onProgress})=>{installs++;await onProgress('Downloading SDK…');installed=true;}};
 const vscode={workspace:{isTrusted:true}},dashboard={webview:{postMessage:async message=>posts.push(message)}};
 const run=create(sdk,vscode,{globalStorageUri:{fsPath:'/storage'}},dashboard,()=>invalidations++,()=>{});
 await run({command:'startupSetupCopilot'});
 assert.equal(installs,1);assert.equal(invalidations,1);assert.deepEqual(posts.map(x=>x.status),['working','working','ready']);assert.match(posts.at(-1).message,/Sign in to Copilot CLI/);
 posts.length=0;await run({command:'startupSetupCopilot'});assert.equal(installs,1);assert.equal(posts[0].status,'ready');
 installed=false;vscode.workspace.isTrusted=false;posts.length=0;await run({command:'startupSetupCopilot'});
 assert.equal(installs,1);assert.equal(posts[0].status,'error');assert.match(posts[0].message,/trusted/);
});

test('issue-report icons sit beside the guide and send the relevant screen',()=>{
 const markup=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js');
 for(const [id,guide] of [['reportIssue','guideHelp'],['gateReportIssue','gateGuideHelp']]){
  const button=markup.match(new RegExp('<button id="'+id+'"[^>]*>'))?.[0];
  assert.ok(button?.includes('aria-label="Report an issue"'));assert.ok(button.includes('title="Report an Issue"'));
  assert.ok(markup.indexOf('id="'+id+'"')<markup.indexOf('id="'+guide+'"'));
 }
 const start=ui.indexOf("for(const id of ['reportIssue','gateReportIssue'])"),end=ui.indexOf('\n',start);assert.ok(start>=0&&end>start);
 const handlers={},sent=[];new Function('$','send','view',ui.slice(start,end))(id=>({addEventListener:(_event,fn)=>handlers[id]=fn}),(command,payload)=>sent.push({command,...payload}),'overview');
 handlers.reportIssue();handlers.gateReportIssue();
 assert.deepEqual(sent,[{command:'openIssueReport',screen:'overview'},{command:'openIssueReport',screen:'start'}]);
});
