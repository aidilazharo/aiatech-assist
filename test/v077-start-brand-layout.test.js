'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const host=read('test/generated/extension-source.txt'),css=read('media/start.css');
test('start page displays logo, title, version, settings and guide on a single aligned row',()=>{
 const gateStart=host.indexOf('<main id="gateView"');
 const gateEnd=host.indexOf('<main id="settingsView"',gateStart);
 const gate=host.slice(gateStart,gateEnd);
 const row=gate.match(/<div class="gate-top">([\s\S]*?)<\/div><\/div>/)?.[1]||'';
 assert.ok(row.includes('class="gate-identity gate-lead-identity"'));
 assert.ok(row.includes('id="gateSettings"'));
 assert.ok(row.includes('id="gateGuideHelp"'));
 assert.match(gate,/<span class="gate-product-title"><h1>AIATECH ASSIST<\/h1><small>v\$\{extensionVersion\}<\/small><\/span>/);
 assert.doesNotMatch(gate,/<h1>Open a Project<\/h1>/);
 assert.equal((gate.match(/class="gate-identity gate-lead-identity"/g)||[]).length,1);
 assert.match(css,/\.gate-logo\{height:50px;/);
 assert.match(css,/\.gate-top\{display:flex;align-items:center;justify-content:space-between;/);
});
test('version is updated and retained in extension header',()=>{
 const manifest=JSON.parse(read('package.json'));
 assert.equal(manifest.version,'0.3.52');
 assert.equal(manifest.atgvDisplayVersion,'0.3.52');
 assert.match(host,/class="brand-version">v\$\{extensionVersion\}/);
});
