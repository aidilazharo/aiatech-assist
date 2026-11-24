'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('catalog verifies direct backend in addition to frontend and exposes actual allocated port',()=>{
 const source=read('src/architect-server.js');
 assert.match(source,/backendUrl\(entry\)/);
 assert.match(source,/await verifyBackend\(driver\.localLogs\(\),driver,effects,60000\)/);
 assert.match(source,/await verifyBackend\(driver\.localLogs\(\),driver,effects,3500\)/);
});
test('both views expose separate frontend and backend controls with host verification',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
 for(const id of ['architectOpenFrontend','architectOpenBackend','architectCustomOpenPreview','architectCustomOpenBackend','architectCustomMode'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(ui,/apiReachable===true/);
 assert.match(host,/case 'architectOpenServerEndpoint'/);
 assert.match(host,/state\.running\|\|!state\.healthy\|\|!endpoint/);
 assert.match(host,/fullStackMode=msg\.fullStackMode==='preview'\?'preview':'live'/);
});
test('real mode never silently downgrades when backend config or startup fails',()=>{
 const live=require('../src/architect-custom-fullstack');
 const pair={frontend:{},backend:{}};
 assert.throws(()=>live.modeForPair(pair,false,'live'),/requires/);
 assert.equal(live.modeForPair(pair,true,'live'),'live');
 assert.equal(live.modeForPair(pair,true,'preview'),'preview');
});
