'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
const webview=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const begin=host.indexOf("case 'libraryUpdateDecision':{");
const end=host.indexOf("case 'checkSoftwareUpdates':{",begin);
const section=host.slice(begin,end);

async function invoke(msg,{pending=new Map(),active=null,busy=false}={}){
 assert.ok(begin>0&&end>begin,'Actual host library decision handlers must be found.');
 const posted=[],started=[];
 const dashboard={webview:{postMessage:async update=>{posted.push(update);return true;}}};
 const code="let activeLibraryUpdatePullRequestId=active;\n"+
   "async function handleDashboardMessage(command){started.push(command);}\n"+
   "switch(msg.command){\n"+section+"\n}\n"+
   "return {posted,started,active:activeLibraryUpdatePullRequestId};";
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('msg','pendingLibraryUpdateOffers','dashboard','catalogBusy','active','posted','started',code);
 return run(msg,pending,dashboard,busy,active,posted,started);
}
test('Pull Library immediately acknowledges and dispatches the actual catalog command',async()=>{
 let resolved=null;
 const pending=new Map([['pull-1',{timer:null,resolve:value=>{resolved=value;}}]]);
 const data=await invoke({command:'libraryUpdateDecision',requestId:'pull-1',action:'Pull Library'},{pending});
 assert.equal(resolved,'Pull Library');
 assert.equal(pending.size,0);
 assert.deepEqual(data.started,[{command:'catalogPull'}]);
 assert.equal(data.active,'pull-1');
 assert.equal(data.posted.length,1);
 assert.equal(data.posted[0].type,'libraryUpdateProgress');
 assert.equal(data.posted[0].requestId,'pull-1');
 assert.equal(data.posted[0].stage,'running');
 assert.equal(data.posted[0].percent,1);
 assert.match(data.posted[0].message,/extension host received/i);
});
test('Expired offers report a failure instead of leaving a permanent 0% indicator',async()=>{
 const data=await invoke({command:'libraryUpdateDecision',requestId:'old-offer',action:'Pull Library'});
 assert.equal(data.started.length,0);
 assert.equal(data.posted.length,1);
 assert.equal(data.posted[0].stage,'failed');
 assert.equal(data.posted[0].requestId,'old-offer');
 assert.match(data.posted[0].message,/no longer active/i);
});
test('Retry uses a valid command but cannot launch stale or concurrent requests',async()=>{
 const good=await invoke({command:'libraryUpdateRetry',requestId:'active-pull'},{active:'active-pull'});
 assert.deepEqual(good.started,[{command:'catalogPull'}]);
 assert.equal(good.posted[0].stage,'running');
 const stale=await invoke({command:'libraryUpdateRetry',requestId:'old-pull'},{active:'active-pull'});
 assert.equal(stale.started.length,0);
 assert.equal(stale.posted[0].stage,'failed');
 const busy=await invoke({command:'libraryUpdateRetry',requestId:'active-pull'},{active:'active-pull',busy:true});
 assert.equal(busy.started.length,0);
 assert.match(busy.posted[0].message,/still running/i);
});
test('Later dismisses without publishing; background checker cannot duplicate direct pull',async()=>{
 let resolved=null;
 const pending=new Map([['cancel-1',{timer:null,resolve:v=>{resolved=v;}}]]);
 const result=await invoke({command:'libraryUpdateDecision',requestId:'cancel-1',action:'Later'},{pending});
 assert.equal(resolved,'Later');
 assert.equal(result.started.length,0);
 const startCheck=host.indexOf('async function checkLibraryRelease(');
 const endCheck=host.indexOf('async function checkSoftwareUpdates(',startCheck);
 assert.ok(startCheck>0&&endCheck>startCheck);
 const checker=host.slice(startCheck,endCheck);
 assert.doesNotMatch(checker,/handleDashboardMessage\(\{type:'catalogPull'/);
 assert.match(checker,/if\(answer==='Pull Library'&&!dashboard\)/);
 assert.match(checker,/handleDashboardMessage\(\{command:'catalogPull'\}\)/);
 assert.match(webview,/send\('libraryUpdateDecision',\{requestId,action:'Pull Library'\}\)/);
});
