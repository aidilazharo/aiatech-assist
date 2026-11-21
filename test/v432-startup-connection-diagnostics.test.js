'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const diagnostics=require('../src/lib/startup-diagnostics');
const source=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const html=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');

async function withDir(run){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-connection-diagnostics-'));
 try{return await run(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('connection events persist across reloads and omit unrelated startup checks',()=>withDir(async dir=>{
 await diagnostics.append(dir,{stage:'prerequisite-install',tool:'npm',status:'error',detail:'Not installed'});
 await diagnostics.append(dir,{stage:'connection-check',tool:'Jira API',status:'error',detectionSource:'example.atlassian.net',detail:'Server responded (HTTP 403). Check the account, token and permissions.'});
 await diagnostics.append(dir,{stage:'connection-check',tool:'GitHub API',status:'ok',detectionSource:'api.github.com',detail:'Reachable and verified.'});
 await diagnostics.append(dir,{stage:'connection-result',tool:'Jira, Confluence & GitHub',status:'needs-attention',durationMs:143,detail:'One or more endpoints could not be verified.'});
 const rows=await diagnostics.connectionEvents(dir);
 assert.equal(rows.length,3);
 assert.equal(rows[0].durationMs,143);
 assert.equal(rows[1].tool,'GitHub API');
 assert.equal(rows[2].tool,'Jira API');
 const txt=await diagnostics.connectionReport(dir);
 assert.match(txt,/HTTP 403/);
 assert.match(txt,/Jira API/);
 assert.match(txt,/143 ms/);
 assert.doesNotMatch(txt,/Not installed/);
 assert.deepEqual(await diagnostics.connectionEvents(path.join(dir,'empty')),[]);
}));
test('credentials, email addresses, authenticated URLs and query parameters are redacted',()=>withDir(async dir=>{
 const sensitive='Authorization: Bearer abcDEF123456789XYZ123 github_pat_ABCDEFGHIJKLMNOPQRST account@example.com https://alice:pass@example.com/resource?access_token=abcdefghi';
 await diagnostics.append(dir,{stage:'connection-error',tool:'GitHub API',status:'failed',detail:sensitive});
 const exported=await diagnostics.connectionReport(dir);
 for(const privateText of ['abcDEF123456789XYZ123','github_pat_ABCDEFGHIJKLMNOPQRST','account@example.com','alice:pass','access_token=abcdefghi'])assert.ok(!exported.includes(privateText),privateText);
 assert.match(exported,/REDACTED/);
}));
test('bounded log returns the most recent entries with most recent first',()=>withDir(async dir=>{
 for(let i=0;i<95;i++)await diagnostics.append(dir,{stage:'connection-check',tool:'Service '+i,status:'ok',detail:'Checked'});
 const events=await diagnostics.connectionEvents(dir,{limit:80});
 assert.equal(events.length,80);
 assert.equal(events[0].tool,'Service 94');
 assert.equal(events.at(-1).tool,'Service 15');
}));
test('Start connection setup presents read-only timeline and download button without exposing credentials',()=>{
 for(const id of ['startupConnectionLogPanel','startupConnectionLogCount','startupConnectionLogList','startupConnectionLogRefresh','startupConnectionLogDownload','startupConnectionLogMessage'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Download Logs \(\.txt\)/);
 assert.match(ui,/renderStartupConnectionLog\(message.entries\)/);
 assert.match(ui,/send\('startupGetConnectionLogs'\)/);
 assert.match(ui,/send\('startupDownloadConnectionLogs'\)/);
 assert.match(ui,/detail\.textContent=String\(event\.detail/);
 assert.doesNotMatch(ui,/card\.innerHTML=/);
});
test('connection diagnostics are hidden on the Start screen while internal log export remains available',()=>{
 const css=require('node:fs').readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
 assert.match(html,/<details id="startupConnectionLogPanel"[^>]*\bhidden\b[^>]*>/);
 assert.match(css,/#startupConnectionForm #startupConnectionLogPanel\{display:none!important\}/);
 assert.match(html,/id="startupUnifiedLog"/);
 assert.match(source,/case 'startupDownloadConnectionLogs':/);
 assert.match(source,/case 'startupGetConnectionLogs':/);
});
test('five independent connection checks are logged and export uses host-only storage',()=>{
 assert.match(source,/async function recordStartupConnectionResults\(/);
 assert.match(source,/for\(const check of result\?\.checks\|\|\[\]\)/);
 assert.match(source,/stage:'connection-check'/);
 assert.match(source,/new URL\(String\(check\.url\|\|''\)\)\.hostname/);
 assert.match(source,/await recordStartupConnectionError\(error,'save'\)/);
 assert.match(source,/await recordStartupConnectionError\(error,'check'\)/);
 assert.match(source,/case 'startupGetConnectionLogs':/);
 assert.match(source,/case 'startupDownloadConnectionLogs':/);
 assert.match(source,/startupDiagnostics\.connectionReport\(context\.globalStorageUri\.fsPath\)/);
 assert.match(source,/startupConnectionFailure\(error\)/);
});
