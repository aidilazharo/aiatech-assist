'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('media/start.css');
const html=read('src/lib/webview/dashboard-html.js');
const js=read('media/start.js');
const start=css.indexOf('/* v0.0.48 — Business Documents:');
const layout=css.slice(start);
function rule(selector){
 const p=layout.indexOf(selector+'{');
 assert.ok(p>=0,'Missing scoped Business Documents rule: '+selector);
 return layout.slice(p+selector.length+1,layout.indexOf('}',p));
}
test('Business Documents file cards separate selection, long filenames and independent actions',()=>{
 assert.ok(start>0);
 assert.match(rule('#discoveryView #baAutoOriginalFiles .source-document-row'),
  /display:grid;grid-template-columns:22px minmax\(0,1fr\) auto/);
 assert.match(rule('#discoveryView #baAutoOriginalFiles .source-document-info'),
  /grid-column:2;min-width:0;max-width:100%/);
 assert.match(rule('#discoveryView #baAutoOriginalFiles .source-document-info strong'),
  /overflow-wrap:anywhere;white-space:normal/);
 assert.match(rule('#discoveryView #baAutoOriginalFiles .source-document-info small'),
  /overflow-wrap:anywhere;white-space:normal/);
 assert.match(rule('#discoveryView #baAutoOriginalFiles .source-document-actions'),
  /grid-column:3;display:flex;flex-wrap:wrap/);
 assert.match(rule('#discoveryView #baAutoOriginalFiles .source-document-actions button'),
  /min-height:36px/);
 assert.match(js,/item\.append\(selector,info,actions\)/);
 assert.match(js,/replace\.setAttribute\('aria-label','Replace & Reprocess'\)/);
 assert.match(js,/replace\.append\(sourceActionIcon\('replace'\)\)/);
 assert.match(js,/remove\.setAttribute\('aria-label','Delete source document'\)/);
 assert.match(js,/remove\.append\(sourceActionIcon\('delete'\)\)/);
 assert.match(css,/@media\(max-width:850px\)\{/);
 assert.match(css,/@media\(max-width:500px\)\{/);
 assert.match(layout,/#discoveryView #baAutoOriginalFiles \.source-document-actions\{[\s\S]*?grid-column:1\/-1\}/);
});
test('ISO BRD downloads have equal height and never share the analysis scrollport',()=>{
 assert.match(rule('#discoveryView #baAutoIsoPreflightActions'),/display:grid;grid-template-columns:repeat\(2,minmax\(0,245px\)\)/);
 const buttons=layout.slice(layout.indexOf('#discoveryView #baAutoIsoPreflightActions button,'),layout.indexOf('}',layout.indexOf('#discoveryView #baAutoIsoPreflightActions button,'))+1);
 assert.match(buttons,/min-height:38px/);
 assert.match(buttons,/justify-content:center;align-items:center/);
 assert.match(rule('#discoveryView #baAutoIsoPreflight[hidden]'),/display:none!important/);
 assert.match(rule('#discoveryView #baAutoIsoPreflight .ba-source-preflight-body'),
  /max-height:clamp\(170px,30vh,310px\)/);
 assert.match(rule('#discoveryView #baAutoIsoPreflight .ba-source-preflight-body'),
  /overflow-y:auto;overflow-x:hidden/);
 assert.match(rule('#discoveryView #baSourcePreflightFindings li'),
  /line-height:1\.6;white-space:normal/);
 assert.match(html,/id="baAutoIsoPreflightActions"/);
 assert.match(html,/<details id="baSourcePreflight"/);
 assert.match(html,/id="baPreflightDownload"/);
 assert.match(html,/id="baWorkingBrDownload"/);
 assert.ok(html.indexOf('id="baAutoIsoPreflightActions"')<html.indexOf('id="baSourcePreflight"'));
});
test('Document textarea has independent height, readable line spacing and unclipped save footer',()=>{
 assert.match(rule('#discoveryView textarea#baAutoArtifactText'),/height:clamp\(290px,42vh,560px\)/);
 assert.match(rule('#discoveryView textarea#baAutoArtifactText'),/overflow:auto;line-height:1\.65/);
 assert.match(rule('#discoveryView #baAutoArtifactLabel'),/display:block;min-width:0;margin:16px 0 9px/);
 assert.match(rule('#discoveryView #baAutoSourceEditor > .ba-auto-inline'),/flex-wrap:wrap;gap:10px/);
 assert.match(rule('#discoveryView #baAutoArtifactStatus'),/overflow-wrap:anywhere/);
 assert.match(rule('#discoveryView #baAutoArtifactSave'),/min-height:38px;min-width:138px/);
 assert.match(html,/textarea id="baAutoArtifactText" rows="11"/);
 assert.match(html,/id="baAutoArtifactSave" disabled/);
 assert.match(js,/panel\.open=false;panel\.dataset\.lastPhase=phase/);
 // This change is styling only: approval and source repair handlers remain untouched.
 assert.match(js,/send\('downloadISO29148BRPDF',\{projectId:activeId\}\)/);
});
