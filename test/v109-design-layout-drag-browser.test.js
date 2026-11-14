'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const css=read('media/start.css'),ui=read('media/start.js'),host=read('test/generated/extension-source.txt');
const {validate}=require('../src/design-proposals');const {erd}=require('../src/design-artifacts');
test('v0.1.17 equal header and notification heights, bounded cards and internal preview',()=>{
 assert.match(css,/--atgv-shell-row-height:76px/);assert.match(css,/\.app-header,body:not\(\.gate-mode\) \.top-notification/);
 assert.match(css,/--atgv-design-list-max:1120px/);assert.match(css,/--atgv-design-preview-max:1440px/);
 assert.match(css,/\.design-kind-panel\{width:100%/);assert.doesNotMatch(host,/ViewColumn\.Two|editorLayoutTwoColumns/);
});
test('diagram nodes can drag inside ATGV preview; saving uses structured design approval flow',()=>{
 assert.match(ui,/group\.addEventListener\('pointerdown'/);assert.match(ui,/group\.addEventListener\('pointermove'/);
 assert.match(ui,/redrawEdges\(\)/);assert.match(ui,/designSavePositions/);assert.match(ui,/send\('designEditStructured'/);
 assert.match(host,/id="designSavePositions"/);
});
test('only Screen Mockups can open a full interactive browser website',()=>{
 assert.doesNotMatch(host,/case 'designOpenVisualBrowser':/);
 assert.match(host,/if\(msg.kind!=='mockup'\)throw Error/);
 assert.match(ui,/classList\.toggle\('hidden',kind!=='mockup'\)/);
 assert.match(ui,/send\('designOpenMockupBrowser'/);
});
test('database node positions survive normalization and are used in editable draw.io export',()=>{
 const draft={title:'Database',summary:'draft',entities:[{name:'projects',description:'',fields:[{name:'id',type:'UUID',key:true,required:true}],relationships:[]}],layout:{projects:{x:324,y:215}}};
 const normalized=validate(draft,'database');assert.deepEqual(normalized.layout.projects,{x:324,y:215});
 const diagram=erd(normalized);assert.equal(diagram.nodes[0].x,324);assert.equal(diagram.nodes[0].y,215);
 assert.throws(()=>validate({...draft,layout:{projects:{x:Infinity,y:42}}},'database'),/coordinates/);
});
