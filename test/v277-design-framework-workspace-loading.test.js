'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const webview=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
test('framework catalog loads without an assigned Jira ticket',()=>{
 assert.match(webview,/send\('uxFrameworkRead',\{key:''\}\)/);
 assert.match(webview,/if\(!uxSelectedKey\)\{send\('uxFrameworkRead',\{key:''\}\);return;\}/);
 assert.match(host,/const key=msg\.key\?developerArtifacts\.safeKey\(msg\.key\):'';/);
});
test('framework picker is gated by actual catalog state rather than Jira selection',()=>{
 assert.match(webview,/\$\('uxDesignFramework'\)\.disabled=!uxFrameworks\.length\|\|uxPipelineBusy/);
 assert.doesNotMatch(webview,/\$\('uxDesignFramework'\)\.disabled=!uxSelectedKey/);
});
test('framework loading errors reach UI and installed catalog activation can run without Jira ticket',()=>{
 assert.match(host,/Design frameworks unavailable:/);
 assert.match(webview,/uxFrameworkLoaded'[\s\S]*?m\.error/);
 assert.match(webview,/send\('uxFrameworkReactivate',\{key:uxSelectedKey\|\|''\}\)/);
});
test('catalog state refresh reloads options with no Jira ticket selected',()=>{
 assert.match(webview,/m\.catalog\?\.installed\?\.sha!==previous&&activeId\)send\('uxFrameworkRead',\{key:uxSelectedKey\|\|''\}\)/);
});
