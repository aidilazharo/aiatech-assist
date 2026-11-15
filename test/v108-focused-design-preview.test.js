'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const pkg=require('../package.json');

test('v0.1.17 uses one focused design preview inside ATGV, not a second VS Code editor group',()=>{
 assert.equal(pkg.version,'0.3.53');assert.equal(pkg.atgvDisplayVersion,'0.3.53');
 assert.doesNotMatch(host,/ViewColumn\.Two|editorLayoutTwoColumns|createWebviewPanel\('atgvAssist\.designTab'/);
 for(const id of ['designPreviewKind','designPreviewTitle','designPreviewSummary','designPreviewMeta','designClosePreview','designVisualTitle','designProductFoundation','designScreenTabs','designScreenMockups','designOpenMockupBrowser']){
  assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'single mounted control '+id);
 }
 assert.match(css,/#planningView\.design-preview-open \.design-list-pane\{display:none!important/);
 assert.match(css,/#planningView\.design-preview-open \.design-workspace-split\{display:block!important/);
 assert.match(css,/#planningView\.design-preview-open \.design-right-pane\{display:block/);
 assert.match(ui,/designListScrollTop/);
 assert.match(host,/Back to Solution Designs/);
});

test('preview widths are bounded and responsive, keeping navigation and left alignment',()=>{
 assert.match(css,/--atgv-design-preview-min:520px/);
 assert.match(css,/--atgv-design-preview-max:1440px/);
 assert.match(css,/min-width:min\(var\(--atgv-design-preview-min\),100%\)/);
 assert.match(css,/max-width:var\(--atgv-design-preview-max\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/body:not\(\.gate-mode\) \.sidebar\{/);
 assert.match(css,/design-right-pane\{[^}]*text-align:left/);
});

test('screen mockups have one screen at a time, keyboard accessible screen tabs and simulated actions',()=>{
 assert.match(host,/role="tablist" aria-label="Preview screens"/);
 assert.match(ui,/tab\.setAttribute\('role','tab'\)/);
 assert.match(ui,/tab\.setAttribute\('aria-selected',String\(index===i\)\)/);
 assert.match(ui,/tabs\.replaceChildren\(\)/);
 assert.match(ui,/Simulated action: /);
 assert.match(ui,/No information was saved or submitted/);
 assert.match(ui,/renderProductFoundations\(kind,last\)/);
 assert.match(css,/design-mockup-components\{display:grid/);
 assert.match(css,/design-screen-tabs\{display:flex/);
});
