'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
test('periodic and navigation dashboard refresh are disabled without losing manual refresh',()=>{
 assert.doesNotMatch(host,/modelStatusPoll=setInterval/);
 assert.match(host,/modelStatusPoll=null/);
 const nav=ui.slice(ui.indexOf('function navigate(destination)'),ui.indexOf('function setView(',ui.indexOf('function navigate(destination)')));
 assert.doesNotMatch(nav,/requestNavigationRefresh\(destination\);/);
 const remote=host.slice(host.indexOf('async function refreshLiveRemoteData('),host.indexOf('async function syncGithub(',host.indexOf('async function refreshLiveRemoteData(')));
 assert.doesNotMatch(remote,/if\(Object\.keys\(results\)\.length\)await refreshDashboard\(\)/);
 assert.match(host,/case 'refresh':if\(!webviewCoreReady\)break;await refreshLiveRemoteData/);
});
test('source-only preflight recovery requires explicit BA consent and retains approval gates',()=>{
 assert.match(html,/id="baPreflightSkip"/);
 assert.match(ui,/send\('skipDiscoveryPreflight'/);
 assert.match(host,/case 'skipDiscoveryPreflight'/);
 assert.match(host,/Continue Source-Only/);
 assert.match(host,/skipAiChecks:msg\.skipAiChecks===true/);
 assert.match(host,/skipAiChecks:true/);
 assert.match(host,/status:'ai-unverified'/);
});
test('Next Step completes an already reviewed AI Review and then enables Generate',()=>{
 assert.match(ui,/const canConfirm=displayed==='review'&&reviewReady&&!reviewFinalized/);
 assert.match(ui,/nextButton\.dataset\.confirmReview=canConfirm\?'true':'false'/);
 assert.match(ui,/if\(\$\('baNextStep'\)\.dataset\.confirmReview==='true'\)/);
 assert.match(ui,/\$\('baReviewFinish'\)\.click\(\)/);
 assert.match(ui,/\['skipReview','confirmReview'\]\.includes\(task\)/);
});
