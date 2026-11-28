'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const tokens=JSON.parse(read('design-system/atgv-ui-theme.json'));
const theme=read('media/atgv-ui-theme.css'),shared=read('media/atgv-consistency.css'),css=read('media/start.css');
test('shared compact control tokens have one canonical owner',()=>{
 assert.equal(tokens.spacing.controlHeightPx,32);
 assert.equal(tokens.spacing.cardRadiusPx,6);
 assert.equal(tokens.spacing.controlRadiusPx,4);
 assert.match(theme,/--atgv-ui-control-height: 32px/);
 assert.match(theme,/--atgv-ui-control-radius: 4px/);
 assert.equal((shared.match(/--atgv-consistency-control-height:/g)||[]).length,1);
 assert.match(shared,/--atgv-consistency-control-height:var\(--atgv-ui-control-height\)/);
});
test('overview linear progress does not inherit circular sizing or animation',()=>{
 assert.match(theme,/overview-phase-ring:not\(\.overview-phase-linear\)::before/);
 assert.match(theme,/overview-phase\[data-state="in-progress"\] \.overview-phase-ring:not\(\.overview-phase-linear\)::after/);
 assert.doesNotMatch(theme,/#landingView \.overview-phase-ring(?!:not\(\.overview-phase-linear\))(?=[, :{])/g);
 assert.match(theme,/overview-phase-grid\{[^}]*repeat\(auto-fit,minmax\(min\(100%,130px\),1fr\)\)/);
 assert.match(shared,/overview-phase-ring\.overview-phase-linear::before\{[^}]*inset:auto 0 0;height:4px/);
});
test('designer preview uses theme-adaptive chrome and width-safe gallery',()=>{
 assert.match(css,/\.ux-preview-hero\{padding:12px 16px;border:1px solid var\(--atgv-ui-line\)/);
 assert.match(css,/\.ux-design-preview\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,320px\),1fr\)\)/);
 assert.match(css,/\.ux-preview-context\{[^}]*background:var\(--atgv-ui-surface\)/);
 assert.match(css,/\.ux-preview-footer \.br-danger\{[^}]*color:var\(--atgv-ui-error\)/);
 assert.match(css,/\.ux-flow-viewport\{height:clamp\(240px,52vh,460px\)/);
 assert.match(css,/\.ux-visual-image\{[^}]*background:#e8eef7/);
});
