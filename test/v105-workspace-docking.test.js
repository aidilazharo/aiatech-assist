'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const design=fs.readFileSync(path.join(root,'src/design-tab.js'),'utf8');
const pkg=require('../package.json');
const dock=host.slice(host.indexOf('async function openSolutionDesignInline('),host.indexOf('async function handleDashboardMessage('));
test('ATGV stays in one VS Code editor group and owns an internal left-list/right-preview layout',()=>{
 assert.match(dock,/openSolutionDesignInline/);
 assert.match(dock,/designOpenInline/);
 assert.doesNotMatch(host,/workbench\.action\.editorLayoutTwoColumns/);
 assert.doesNotMatch(host,/ViewColumn\.Two/);
 assert.doesNotMatch(host,/createWebviewPanel\('atgvAssist\.designTab'/);
 assert.match(css,/#planningView \.design-workspace-split\{display:grid;grid-template-columns:minmax\(330px,420px\) minmax\(0,1fr\)/);
 assert.match(css,/#planningView \.design-right-pane\{[\s\S]*?text-align:left/);
});
test('header and navigation have fixed dimensions even when VS Code editor group is narrow',()=>{
 assert.match(css,/--atgv-header-fixed-height:76px/);
 assert.match(css,/max-height:var\(--atgv-header-fixed-height\);flex:0 0 var\(--atgv-header-fixed-height\)/);
 assert.match(css,/--atgv-sidebar-fixed-width:220px/);
 assert.match(css,/max-width:var\(--atgv-sidebar-fixed-width\);flex:0 0 var\(--atgv-sidebar-fixed-width\)/);
 assert.match(css,/@media\(max-width:670px\)\{[\s\S]*?body:not\(\.gate-mode\) \.sidebar/);
 assert.match(css,/body:not\(\.gate-mode\) \.sidebar-scroll\{flex:1 1 auto;min-height:0;overflow-y:auto/);
});
test('workspace main and design tabs align left without centered width restriction',()=>{
 assert.match(css,/\.content-pane main\.narrow\{[\s\S]*?margin-left:0;margin-right:0;text-align:left/);
 assert.match(css,/body:not\(\.gate-mode\) \.app-layout\{[\s\S]*?max-width:none/);
 assert.match(design,/max-width:none;margin:0;text-align:left\}\.section-heading/);
 assert.deepEqual([pkg.version,pkg.atgvDisplayVersion],['0.3.50','0.3.50']);
});
