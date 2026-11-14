'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('preflight failures have a single detailed panel with local Retry Mapping action',()=>{
 assert.match(host,/id="baSourcePreflight"/);
 assert.match(host,/id="baPreflightRetry"/);
 assert.match(ui,/function hasDedicatedPreflightRecovery\(\)/);
 assert.match(ui,/panel\.classList\.toggle\('hidden',!retry\|\|hasDedicatedPreflightRecovery\(\)\)/);
 assert.match(ui,/\$\('baPreflightRetry'\)\.addEventListener\('click',retryDiscoveryMapping\)/);
 assert.match(ui,/isPreflight\?'Document preflight needs attention\. See the findings below\.'/);
 assert.match(css,/#baPreflightRetry/);
});
test('preflight failures are not sent again as a global notification',()=>{
 const handler=host.slice(host.indexOf("case 'processDiscoverySources':"),host.indexOf("case 'stopDiscoverySourceMapping':"));
 assert.match(handler,/discoveryImportFailed',phase,message:e\.message/);
 assert.match(handler,/\['preflight','repair'\]\.includes\(phase\)/);
 assert.match(handler,/else throw e;/);
 assert.match(host,/error\.phase=run\.phase/);
});
test('preflight resolved warnings are not repeated below the recommended default',()=>{
 assert.match(ui,/const resolvedIssues=new Set/);
 assert.match(ui,/!resolvedIssues\.has\(String\(x\.detail\|\|''\)\.trim\(\)\.toLowerCase\(\)\)/);
 assert.match(ui,/mappingFailurePhase=isPreflight\?'preflight':''/);
 assert.match(ui,/summary:hasDetailedFindings&&previous\.summary\?previous\.summary:mappingFailureMessage/);
});
