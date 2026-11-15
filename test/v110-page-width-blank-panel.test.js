'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const host=read('test/generated/extension-source.txt'), ui=read('media/start.js'), css=read('media/start.css');
const pkg=require('../package.json');

test('v0.1.17 keeps a single ATGV editor view and consistent responsive right-page bounds',()=>{
 assert.equal(pkg.version,'0.3.51');
 assert.equal(pkg.atgvDisplayVersion,'0.3.51');
 assert.match(css,/--atgv-page-content-min:520px/);
 assert.match(css,/--atgv-page-content-max:1200px/);
 assert.match(css,/--atgv-design-list-max:1200px/);
 assert.match(css,/--atgv-design-preview-max:1200px/);
 assert.match(css,/body:not\(\.gate-mode\) \.content-pane > main/);
 assert.match(css,/max-width:var\(--atgv-page-content-max\)!important/);
 assert.match(css,/min-width:min\(var\(--atgv-page-content-min\),100%\)!important/);
 assert.match(css,/\.content-pane > main\.hidden\{display:none!important\}/);
 assert.doesNotMatch(host,/ViewColumn\.Two|editorLayoutTwoColumns/);
});

test('unused diagram editor section is hidden and does not leave a blank bordered block',()=>{
 assert.match(host,/<section id="generatedDesignsSection" class="generated-designs-section hidden">/);
 assert.match(host,/<div id="diagramEditorPanel" class="generated-diagram-editor hidden">/);
 assert.match(css,/#planningView #generatedDesignsSection\.hidden\{display:none!important\}/);
 assert.match(ui,/if\(m\.type==='diagramLoaded'\)\{\s*\$\('generatedDesignsSection'\)\.classList\.remove\('hidden'\);/);
 assert.match(ui,/\$\('diagramEditorPanel'\)\.classList\.add\('hidden'\);\$\('generatedDesignsSection'\)\.classList\.add\('hidden'\)/);
});
