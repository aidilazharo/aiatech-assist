'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('host AI activity signal is reference counted across concurrent calls and failures',async()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 const start=host.indexOf('let aiChatActivityEnd=null;'),end=host.indexOf('let modelStatusCache=',start);
 assert.ok(start>=0&&end>start,'global AI signal must be declared by the extension host');
 const sent=[],pending=[];
 const dashboard={webview:{postMessage:message=>{sent.push(message);return Promise.resolve(true);}}};
 const sendAiText=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));
 const tracker=new Function('dashboard','report','sendAiText','vscode',
  host.slice(start,end)+'return {aiAnswer,active:()=>activeAiRequests};'
 )(dashboard,()=>{},sendAiText,{});
 const first=tracker.aiAnswer({},'question 1',100);
 const second=tracker.aiAnswer({},'question 2',100);
 assert.equal(tracker.active(),2);
 assert.deepEqual(sent.filter(m=>m.type==='atgvAiActivity').map(m=>[m.active,m.count]),[[true,1],[true,2]]);
 pending[0].resolve('answer');
 assert.equal(await first,'answer');
 assert.equal(tracker.active(),1);
 pending[1].reject(new Error('Provider unavailable'));
 await assert.rejects(second,/Provider unavailable/);
 assert.equal(tracker.active(),0);
 assert.deepEqual(sent.filter(m=>m.type==='atgvAiActivity').map(m=>[m.active,m.count]),[[true,1],[true,2],[true,1],[false,0]]);
 assert.match(host,/case 'webviewReady':\{[\s\S]*?publishAiActivity\(\); \/\/ Restore the signal/);
});

test('shared red/CMYK top waveform appears across all app pages only for real AI activity',()=>{
 const css=read('media/atgv-mywork-ai.css');
 const wave=read('media/atgv-mywork-wave-chat.js');
 const ui=read('media/start.js');
 const host=read('src/lib/runtime/extension-runtime.js');
 const chat=read('src/atgv-ai-chat.js');
 for(const selector of [
  'body.atgv-global-ai-active:not(.gate-mode) #appHeader.app-header',
  'body.atgv-global-ai-active:not(.gate-mode) #appHeader #myWorkHeaderWave.mywork-header-wave',
  'body.atgv-global-ai-active:not(.gate-mode) #topNotification.top-notification',
  'body.atgv-global-ai-active:not(.gate-mode) #topNotification #myWorkHeaderWave.mywork-header-wave'
 ])assert.ok(css.includes(selector),selector);
 assert.match(ui,/document\.body\.classList\.contains\('atgv-global-ai-active'\)/);
 assert.match(wave,/msg\.type!=='atgvAiActivity'/);
 assert.match(wave,/classList\.toggle\('atgv-global-ai-active',next\)/);
 assert.match(wave,/window\.ATGVSyncMyWorkHeaderWaveHost\?\.\(\)/);
 assert.match(wave,/\|\|globalAiActive/);
 assert.match(wave,/if\(globalAiActive\)\{[\s\S]*?targetHeight=reduceMotion\?0:Math\.min\(\.17,10\/Math\.max\(h,1\)\)/);
 assert.match(host,/const endAi=beginAiActivity\(\);let result;try\{result=await aiOrchestrator\.run/);
 assert.match(host,/finally\{endAi\(\);\}/);
 assert.match(host,/atgvAiChat\.open\(vscode,\{runtimeRoot:aiRuntimeRoot\(\),onLog:report,onActivity:/);
 assert.match(chat,/signalActivity\(true\)/);
 assert.match(chat,/finally\{pending=false;controller=null;signalActivity\(false\)/);
 assert.match(chat,/panel\.onDidDispose\(\(\)=>\{controller\?\.abort\(\);signalActivity\(false\)/);
 // A mock server or dependency install is not enough to indicate AI activity.
 assert.doesNotMatch(host,/case 'architectCustomStatus':\{[\s\S]{0,900}?beginAiActivity\(/);
});

test('waveform remains on the main header while a global notification appears below it',()=>{
 const ui=read('media/start.js');
 const start=ui.indexOf('function syncMyWorkHeaderWaveHost(){');
 const end=ui.indexOf('function showTopNotification(item){',start);
 assert.ok(start>=0&&end>start);
 const nodes={};
 const parent=name=>({name,appendChild(node){node.parentElement=this;}});
 nodes.appHeader=parent('appHeader');
 nodes.topNotification=parent('topNotification');
 nodes.myWorkHeaderWave={parentElement:nodes.appHeader};
 const doc={body:{classList:{contains:name=>name==='atgv-global-ai-active'}}};
 const make=new Function('$','document','window','topNoticeCurrent',ui.slice(start,end)+'return syncMyWorkHeaderWaveHost;');
 const fakeWindow={addEventListener(){}};
 make(id=>nodes[id],doc,fakeWindow,{type:'info'})();
 assert.equal(nodes.myWorkHeaderWave.parentElement,nodes.appHeader);
 make(id=>nodes[id],doc,fakeWindow,null)();
 assert.equal(nodes.myWorkHeaderWave.parentElement,nodes.appHeader);
});
