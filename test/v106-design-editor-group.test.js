'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('solution design previews never create or require VS Code editor group 2',()=>{
  const source=read('test/generated/extension-source.txt');
  const dashboard=read('media/start.js');
  const css=read('media/start.css');
  assert.doesNotMatch(source,/ViewColumn\.Two/);
  assert.doesNotMatch(source,/editorLayoutTwoColumns/);
  assert.doesNotMatch(source,/createWebviewPanel\('atgvAssist\.designTab'/);
  assert.doesNotMatch(dashboard,/send\('designOpenTab'/);
  assert.match(dashboard,/designPreview.*classList\.remove\('hidden'\)/);
  assert.match(css,/design-workspace-split/);
  assert.match(css,/design-right-pane/);
});

test('v0.1.07 metadata is consistent',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
  assert.equal(pkg.atgvDisplayVersion,pkg.version);
});
