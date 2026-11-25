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
 assert.ok(!row.includes('id="gateSettings"'));
 assert.ok(row.includes('id="gateGuideHelp"'));
 assert.match(gate,/<span class="gate-product-title"><h1>AIATECH ASSIST<\/h1><small class="gate-brand-versions">Extension v\$\{extensionVersion\}/);
 assert.match(gate,/id="gateLibraryVersion"/);
 assert.doesNotMatch(gate,/<h1>Open a Project<\/h1>/);
 assert.equal((gate.match(/class="gate-identity gate-lead-identity"/g)||[]).length,1);
 assert.match(css,/\.gate-logo\{height:50px;/);
 assert.match(css,/\.gate-top\{display:flex;align-items:center;justify-content:space-between;/);
});
test('extension header retains dynamic version and library version labels',()=>{
 assert.match(host,/class="brand-versions">Extension v\$\{extensionVersion\}/);
 assert.match(host,/id="headerLibraryVersion"/);
});
