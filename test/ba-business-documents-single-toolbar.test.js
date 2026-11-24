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

test('source details and document controls share one responsive title bar',()=>{
 const begin=html.indexOf('id="baAutoDocumentToolbar"');
 const end=html.indexOf('id="baAutoIsoPreflight"',begin);
 assert.ok(begin>=0&&end>begin);
 const toolbar=html.slice(begin,end);
 for(const id of ['baAutoOriginalFiles','baAutoDocumentTools','baAutoDocumentTabs','baPreflightDownload','baWorkingBrDownload',
  'baPreflightRetry','baPreflightSkip','baAutoArtifactSave','baAutoFileActions']){
  assert.equal((toolbar.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.ok(toolbar.indexOf('id="baAutoOriginalFiles"')<toolbar.indexOf('id="baAutoDocumentTabs"'));
 assert.match(css,/#discoveryView #baAutoDocumentToolbar\{[^}]*flex-wrap:wrap/);
 assert.match(css,/#discoveryView \.ba-auto-title-tools\{[^}]*margin-inline-start:auto/);
 assert.match(ui,/info\.append\(name,detail\)/);
 assert.match(ui,/detail\.textContent=\[doc\.version/);
 assert.match(css,/#discoveryView #baAutoDocumentToolbar #baAutoFileActions/);
 assert.match(ui,/item\.append\(info,replace\)/);
 assert.match(ui,/fileToolbar\.append\(actions\)/);
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
 assert.match(ba,/get\('baAutoArtifactSave'\)\.hidden=kind!=='source'/);
 assert.match(ba,/get\('baAutoFormattedDocument'\)/);
 assert.match(html,/id="baAutoPrimaryAction"/);
 assert.match(html,/id="baAutoOverflowMenu"/);
 assert.match(css,/#discoveryView #baAutoDocumentPanel\[hidden\]/);
});

test('existing download, document save and source-delete handlers remain connected',()=>{
 assert.match(ui,/send\('downloadDocumentPreflight',\{projectId:activeId\}\)/);
 assert.match(ui,/send\('downloadISO29148BRPDF',\{projectId:activeId\}\)/);
 assert.match(ui,/requestBRDeletion\(\{target:'active-source',digest:doc\.digest,revision:brState\.revision\}\)/);
 assert.match(ba,/invoke\('baSaveArtifact',\{kind,digest:sourceDigest/);
 assert.equal((html.match(/id="baAutoArtifactSave"/g)||[]).length,1);
});

test('document and Jira views use icon buttons with accessible tooltip labels',()=>{
 const controls=[...html.matchAll(/<(?:button|summary)[^>]+class="ba-auto-title-icon"[^>]*>([^<]*)<\/(?:button|summary)>/g)];
 assert.equal(controls.length,16);
 for(const [tag,icon] of controls){
  assert.match(tag,/aria-label="[^"]+"/);
  assert.match(tag,/title="[^"]+"/);
  assert.match(icon,/\$\{baHeaderIcon\(/);
 }
 assert.match(ba,/primary\.setAttribute\('aria-label',label\)/);
 assert.match(ba,/mark\.toggleAttribute\('hidden',mark\.dataset\.baPrimaryIcon!==icon\)/);
 assert.match(css,/\.ba-auto-title-icon:focus-visible::after\{[^}]*content:attr\(title\)/);
 const start=html.indexOf('<summary class="ba-auto-jira-heading">');
 const end=html.indexOf('</summary>',start);
 const jira=html.slice(start,end);
 const panel=html.slice(start,html.indexOf('</details>',end));
 assert.doesNotMatch(jira,/id="baAutoJiraView"|id="baAutoJiraTabs"/,'table controls must not clutter the section title');
 assert.match(panel,/class="atgv-section-table-toolbar"/);
 assert.match(panel,/id="baAutoJiraView"/);
 assert.match(panel,/id="baAutoJiraTabs"/);
 assert.match(ba,/event\.preventDefault\(\);\s+get\('baAutoJira'\)\.open=true/);
});
