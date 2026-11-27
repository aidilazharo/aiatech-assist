'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {sampleEndpoint,classify,createMonitor,ENDPOINTS,CACHE_MS}=require('../src/network-health');
test('network probes do not send credentials or follow redirects; HTTP errors count as reachable',async()=>{
 let clock=0;
 const result=await sampleEndpoint(ENDPOINTS[0],{now:()=>clock,request:async(url,options)=>{
  assert.equal(url,ENDPOINTS[0]);assert.equal(options.method,'HEAD');assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);
  clock=2300;return {status:403};
 }});
 assert.deepEqual(result,{reachable:true,ms:2300});
 assert.deepEqual(await sampleEndpoint(ENDPOINTS[0],{now:()=>0,request:async()=>{throw Error('network error');}}),{reachable:false,ms:null});
});
test('connection state distinguishes slow, partial failure and unreachable services',()=>{
 const ok=ms=>({reachable:true,ms}),fail={reachable:false,ms:null};
 assert.equal(classify([ok(100),ok(200)]).state,'online');
 assert.equal(classify([ok(2100),ok(3000)]).state,'slow');
 assert.equal(classify([ok(100),ok(3000)]).state,'degraded');
 assert.equal(classify([ok(100),fail]).state,'degraded');
 assert.equal(classify([fail,fail]).state,'unreachable');
});
test('network probe cache and in-flight sharing limit traffic across simultaneous requests',async()=>{
 let clock=0,count=0;
 const check=createMonitor({clock:()=>clock,now:()=>0,request:async()=>{count++;return {status:200};}});
 const results=await Promise.all([check(),check(),check()]);
 assert.equal(results[0].state,'online');assert.equal(count,2);
 await check();assert.equal(count,2);
 clock+=CACHE_MS;await check();assert.equal(count,4);
});
test('webview combines host responsiveness with offline and supported browser speed hints',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','media/start.js'),'utf8');
 const a=ui.indexOf('function networkHealthState('),b=ui.indexOf('function publishNetworkHealth(',a);
 assert.ok(a>=0&&b>a);
 const state=new Function(ui.slice(a,b)+';return networkHealthState;')();
 assert.equal(state('online',false,{}),'offline');
 assert.equal(state('online',true,{downlink:0.6}),'slow');
 assert.equal(state('online',true,{downlink:0}),'online');
 assert.equal(state('online',true,{effectiveType:'2g'}),'slow');
 assert.equal(state('online',true,undefined),'online');
 assert.equal(state('slow',true,{}),'slow');
 assert.equal(state('unreachable',true,{}),'unreachable');
 assert.match(ui,/if\(state==='unknown'\|\|state===networkHealthLastState\)return/);
 assert.match(ui,/setInterval\(requestNetworkHealth,60000\)/);
 assert.match(ui,/window\.addEventListener\('offline'/);
});
