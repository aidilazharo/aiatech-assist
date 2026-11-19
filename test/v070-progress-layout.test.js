'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test','generated','extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media','start.css'),'utf8');
const ui=fs.readFileSync(path.join(root,'media','start.js'),'utf8');
const manifest=require('../package.json');
test('Gantt explanatory sentence is removed and existing timeline remains available',()=>{
 assert.doesNotMatch(html,/Role schedule and recorded progress\. Update role dates in Settings\./);
 assert.match(html,/id="overviewGanttDetails"/);
 assert.match(html,/id="ganttChart"/);
});
test('Uploaded Documents uses the count pill without a redundant green progress track',()=>{
 const start=html.indexOf('class="source-documents-panel"');
 const end=html.indexOf('id="sourceDocuments"',start);
 const section=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(section,/Uploaded documents/);
 assert.match(section,/id="sourceDocumentCount"/);
 assert.doesNotMatch(section,/sourceCapacityProgress|ba-heading-progress/);
 assert.doesNotMatch(ui,/sourceCapacityProgressFill|sourceTrack\.setAttribute/);
});
test('AI Review uses only the shared header progress and retains status messaging',()=>{
 assert.doesNotMatch(html,/id="reviewHeadingProgress"/);
 assert.match(html,/id="baRunning"[^>]*role="status"/);
 assert.match(ui,/\$\('baRunning'\)\.classList\.toggle\('hidden',!baBusyTask\)/);
 assert.match(html,/id="baReviewStageMessage"/);
});
test('Sidebar buttons have thin borders without removing active styling',()=>{
 assert.match(css,/\.sidebar \.nav-item\{border:1px solid rgba\(178,192,211,\.23\)\}/);
 assert.match(css,/\.sidebar \.nav-item\.current\{border-color:rgba\(103,161,240,\.7\)\}/);
});
test('Release metadata is consistent',()=>{
 assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
 assert.equal(manifest.atgvDisplayVersion,manifest.version);
 assert.ok(html.includes("atgvDisplayVersion :'"+manifest.version+"'"));
});
