'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const css=read('media/start.css'),ui=read('media/start.js'),markup=read('test/generated/extension-source.txt');

test('wide monitors use centered capped shell without affecting smaller viewports',()=>{
 assert.match(css,/\.app-layout\{width:100%;max-width:1560px;margin-inline:auto\}/);
 assert.match(css,/\.app-layout\{flex:0 1 auto;height:calc\(100dvh - 64px\);max-height:980px;/);
 assert.match(css,/body\.gate-mode \.app-layout\{height:100dvh;max-height:1044px\}/);
 assert.match(css,/body\{align-items:center;justify-content:center\}/);
 assert.ok(markup.includes('class="app-layout"'));
});
test('start page settings and guide remain beside logo and aligned in same header row',()=>{
 const gate=markup.slice(markup.indexOf('<main id="gateView"'),markup.indexOf('<main id="settingsView"'));
 const identity=gate.indexOf('class="gate-identity gate-lead-identity"');
 const settings=gate.indexOf('id="gateSettings"'),guide=gate.indexOf('id="gateGuideHelp"');
 const alert=gate.indexOf('id="gateFolderAlert"');
 assert.ok(identity>0&&identity<settings&&settings<guide&&guide<alert);
 assert.ok(css.includes('.gate-top .gate-header-actions{flex:0 0 auto;align-self:center;margin-left:auto}'));
 assert.ok(css.includes('@media(max-width:680px){.gate-top{gap:12px;'));
});
test('all built-in roles including technical lead have distinct muted charcoal backgrounds and preserve accents',()=>{
 const palette=ui.slice(ui.indexOf('const roleNavColors='),ui.indexOf('function applyRoleNavigationTheme'));
 const entries=[...palette.matchAll(/'([a-z-]+)':\['(#[0-9a-f]{6})','(#[0-9a-f]{6})'\]/g)];
 assert.equal(entries.length,18);
 assert.equal(new Set(entries.map(e=>e[2])).size,18);
 for(const [,role,bg,accent] of entries){
  const [r,g,b]=[bg.slice(1,3),bg.slice(3,5),bg.slice(5,7)].map(n=>parseInt(n,16));
  assert.ok(Math.max(r,g,b)-Math.min(r,g,b)<=16,`${role}: background is too saturated: ${bg}`);
  assert.ok(r>=35&&g>=35&&b>=35&&r<65&&g<65&&b<65,`${role}: background is outside readable charcoal tones`);
  assert.notEqual(bg,accent);
 }
 assert.match(css,/\.sidebar\{background:var\(--role-pane-bg,#2a3035\);transition/);
 assert.match(css,/\.sidebar-footer\{background:var\(--role-pane-bg,#2a3035\)\}/);
 assert.match(css,/\.sidebar \.nav-item\.current\{background:color-mix\(in srgb,var\(--role-nav-accent/);
});
