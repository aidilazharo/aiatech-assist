'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const ba=read('media/ba-automatic-ui.js');
const ui=read('media/start.js');
const css=read('media/start.css');

test('one horizontal toolbar owns all Business Documents actions',()=>{
 const begin=html.indexOf('id="baAutoDocumentToolbar"');
 const end=html.indexOf('id="baAutoIsoPreflight"',begin);
 assert.ok(begin>=0&&end>begin);
 const toolbar=html.slice(begin,end);
 for(const id of ['baAutoDocumentTabs','baPreflightDownload','baWorkingBrDownload',
  'baPreflightRetry','baPreflightSkip','baAutoArtifactSave','baAutoFileActions']){
  assert.equal((toolbar.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(css,/#discoveryView #baAutoDocumentToolbar\{[\s\S]*?flex-wrap:nowrap/);
 assert.match(css,/#discoveryView #baAutoDocumentToolbar\{[\s\S]*?overflow-x:auto/);
 assert.match(css,/#discoveryView #baAutoDocumentToolbar #baAutoFileActions/);
 assert.match(ui,/fileToolbar\.append\(actions\);item\.append\(selector,info\)/);
 assert.match(ui,/fileToolbar\.replaceChildren\(\)/);
});

test('four tabs select one visible content panel without losing unsaved edits',()=>{
 for(const kind of ['iso','source','original','preflight'])
  assert.match(html,new RegExp('data-ba-document="'+kind+'"'));
 assert.match(html,/id="baAutoDocumentTabs"[^>]+role="tablist"/);
 assert.match(html,/id="baAutoIsoPreflight"[^>]+role="tabpanel"/);
 assert.match(html,/id="baAutoDocumentPanel"[^>]+role="tabpanel"/);
 assert.match(ba,/get\('baAutoIsoPreflight'\)\.hidden=!preflight/);
 assert.match(ba,/get\('baAutoDocumentPanel'\)\.hidden=preflight/);
 assert.match(ba,/setAttribute\('aria-selected',String\(selected\)\)/);
 assert.match(ba,/if\(artifactDirty\(\)\)\{get\('baAutoArtifactStatus'\)/);
 assert.match(ba,/\['ArrowRight','ArrowLeft','Home','End'\]/);
 assert.match(ba,/kind==='preflight'/);
 assert.match(ba,/get\('baAutoArtifactSave'\)\.hidden=preflight\|\|kind==='original'/);
 assert.match(css,/#discoveryView #baAutoDocumentPanel\[hidden\]/);
});

test('existing download, document save and source-delete handlers remain connected',()=>{
 assert.match(ui,/send\('downloadDocumentPreflight',\{projectId:activeId\}\)/);
 assert.match(ui,/send\('downloadISO29148BRPDF',\{projectId:activeId\}\)/);
 assert.match(ui,/requestBRDeletion\(\{target:'active-source',digest:doc\.digest,revision:brState\.revision\}\)/);
 assert.match(ba,/invoke\('baSaveArtifact',\{kind,digest:sourceDigest/);
 assert.equal((html.match(/id="baAutoArtifactSave"/g)||[]).length,1);
});
