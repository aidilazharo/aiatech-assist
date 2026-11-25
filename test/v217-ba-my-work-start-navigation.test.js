'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');

test('My Work opens the Business Requirements overview without restarting',()=>{
 const snippet=ui.slice(ui.indexOf("$('baMyWorkOpen').addEventListener"),ui.indexOf('function applyFocusedRoleLayout'));
 assert.match(snippet,/navigate\('ba-overview'\)/);
 assert.doesNotMatch(snippet,/startOrRestartBusinessRequirements/);
});

test('My Work Business Requirements panel is visually flattened while metrics remain',()=>{
 assert.match(css,/#workView\.role-ba-simplified \.ba-my-work-dashboard\{\s*border:0;box-shadow:none;border-radius:0;background:transparent/);
 assert.match(host,/id="baMyWorkMetrics"/);
 assert.match(host,/id="baMyWorkOpen"/);
});

test('Upload and Mapping suppress the duplicate footer; later next-step actions remain',()=>{
 assert.match(ui,/navigation\.classList\.toggle\('hidden',displayed==='start'\)/);assert.match(ui,/const previousDefinition=nextIndex>0\?progress\[nextIndex-1\]:null/);
 assert.match(ui,/nextButton.dataset.nextStep=next\?\.key\|\|''/);
 assert.match(host,/id="baNextStep"/);
});
