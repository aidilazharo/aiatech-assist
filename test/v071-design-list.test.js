'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'test','generated','extension-source.txt'),'utf8');
const js=fs.readFileSync(path.join(base,'media','start.js'),'utf8');
const css=fs.readFileSync(path.join(base,'media','start.css'),'utf8');
const manifest=require('../package.json');
test('Design revisions are consolidated inside expandable workflow sections',()=>{
 assert.match(html,/id="designCards"/);
 assert.doesNotMatch(html,/Generated Designs &amp; Diagrams/);
 assert.doesNotMatch(html,/id="generatedDesignList"/);
 assert.match(html,/id="diagramEditorPanel" class="generated-diagram-editor hidden"/);
 assert.match(js,/document.createElement\('details'\);panel.className='design-kind-panel'/);
 assert.match(js,/document.createElement\('summary'\);summary.className='design-kind-summary'/);
 assert.match(js,/design-revision-row/);
 assert.match(js,/for\(const item of \[\.\.\.history\]\.reverse\(\)\)/);
 assert.match(js,/openDesignPreview\(kind,item.id\)/);
 assert.match(js,/readOnly=readonly/);
 assert.match(css,/\.design-kind-panel/);
});
test('Diagram editing opens from a generated architecture draft and does not overwrite without save',()=>{
 assert.match(js,/pendingArchitectureImport=designState\?\.designs\?\.architecture/);
 assert.match(js,/\$\('diagramEditorPanel'\)\.classList\.remove\('hidden'\)/);
 assert.match(js,/\$\('closeDiagramEditor'\)\.addEventListener/);
 assert.match(js,/send\('saveDiagram'/);
});
test('Overview Gantt explanatory text remains removed',()=>{
 assert.doesNotMatch(html,/Role schedule and recorded progress\. Update role dates in Settings\./);
 assert.match(html,/id="overviewGanttDetails"/);
});
test('Version metadata updated',()=>{
 assert.equal(manifest.version,'0.3.55');
 assert.equal(manifest.atgvDisplayVersion,'0.3.55');
});
