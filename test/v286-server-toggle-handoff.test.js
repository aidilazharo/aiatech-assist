'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const server=require('../src/architect-server');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const root='/tmp/v286-new-project';
const prepared={root,stackId:'react',branch:'bootstrap/react-1'};
function driver({running=true,priorCwd='/tmp/v286-old-project'}={}){
 let live=running,cwd=priorCwd,starts=0,stops=0;
 return {catalogStackConfig:async()=>({previewUrl:'http://127.0.0.1:5173/'}),inspectScripts:async current=>({repo:{root:current,branch:prepared.branch,clean:true,sha:'ab'.repeat(20)},targets:[{relative:'',kind:'npm',installed:true,scripts:['dev']}]}),localLogs:()=>({running:live,cwd,pid:live?1234:null}),runLocal:async()=>{live=true;cwd=root;starts++;},stopLocal:async()=>{live=false;stops++;},counters:()=>({live,cwd,starts,stops})};
}
test('one toggle dispatches both start and stop, reflecting server state',()=>{
 assert.match(host,/id="architectServerToggle"/);assert.doesNotMatch(host,/id="architectStopServer"/);
 assert.match(ui,/architectServerToggle'\)\.addEventListener/);
 assert.match(ui,/running\?'Stop Server':'Run Server'/);
 assert.match(css,/#architectServerToggle\[data-running/);
});
test('handoff requires prior consent, then stops only tracked ATGV process',async()=>{
 const fake=driver();
 await assert.rejects(server.start({root,stackId:'react',prepared,driver:fake}),/different app server/);
 assert.deepEqual(fake.counters(),{live:true,cwd:'/tmp/v286-old-project',starts:0,stops:0});
 const value=await server.start({root,stackId:'react',prepared,driver:fake,allowManagedHandoff:true,openBrowser:async()=>true,effects:{portAvailable:async()=>true,waitForHttp:async()=>{}}});
 assert.equal(value.running,true);assert.match(value.message,/switched from previous ATGV-managed app/);
 assert.deepEqual(fake.counters(),{live:true,cwd:root,starts:1,stops:1});
 await server.stop({root,stackId:'react',driver:fake});assert.equal(fake.counters().stops,2);
});
test('handoff waits for port release, but never kills processes occupying external ports',async()=>{
 const fake=driver();let probes=0;
 await server.start({root,stackId:'react',prepared,driver:fake,allowManagedHandoff:true,openBrowser:async()=>true,effects:{portAvailable:async()=>++probes>=3,waitForPortRelease:async(_url)=>{probes++;return true;},waitForHttp:async()=>{}}});
 assert.deepEqual(fake.counters(),{live:true,cwd:root,starts:1,stops:1});
 const second=driver();await assert.rejects(server.start({root,stackId:'react',prepared,driver:second,allowManagedHandoff:true,effects:{portAvailable:async()=>false,waitForPortRelease:async()=>false}}),/No available localhost port/);
 assert.equal(second.counters().starts,0);assert.equal(second.counters().stops,1);
});
test('server status identifies when a different ATGV-managed server is active',async()=>{
 const status=await server.status({root,stackId:'react',driver:driver()});
 assert.equal(status.running,false);assert.equal(status.otherRunning,true);assert.match(status.message,/ATGV-managed/);
});
