'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('v0.1.07 keeps Solution Design review entirely inside the ATGV webview',()=>{
 assert.doesNotMatch(host,/ViewColumn\.Two|editorLayoutTwoColumns|atgvAssist\.designTab/);
 assert.match(ui,/Review this design in the ATGV right-side preview pane/);
 assert.match(ui,/Open Full Website in Browser/);
 assert.match(ui,/planningView'\)\.classList\.add\('design-preview-open'\)/);
 assert.match(css,/#planningView \.design-workspace-split/);
 assert.match(css,/#planningView \.design-right-pane/);
});
