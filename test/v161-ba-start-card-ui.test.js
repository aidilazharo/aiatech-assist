'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('Start intro card and count removed, history remains and is default collapsed',()=>{
 const start=host.slice(host.indexOf('<section id="baStartPanel"'),host.indexOf('<section class="source-documents-panel"'));
 assert.doesNotMatch(start,/ba-start-header|ba-start-create-card|ba-start-history-metric|baStartPublishedCount/);
 assert.match(start,/id="baCompletedSection"/);
 assert.equal((host.match(/id="baNewRequirement"/g)||[]).length,1);
 assert.equal((host.match(/id="baStart"/g)||[]).length,0);
 assert.doesNotMatch(start,/<details id="baCompletedSection"[^>]* open/);
});
test('New BR starts from toolbar; history remains Start-only and dark gray',()=>{
 assert.match(ui,/\$\('baNewRequirement'\)\.addEventListener\('click',beginNewBusinessRequirement\)/);
 assert.doesNotMatch(ui,/\$\('baStart'\)/);
 assert.doesNotMatch(ui,/baStartPublishedCount|baStartGuidance/);
 assert.match(ui,/displayed!=='start'/);
 assert.match(css,/#discoveryView \.ba-start-history-only\{background:transparent/);
 assert.match(css,/#discoveryView \.ba-completed-flat\{background:transparent/);
});
