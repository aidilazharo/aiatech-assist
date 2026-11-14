'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(base,'test/generated/extension-source.txt'),'utf8');
const js=fs.readFileSync(path.join(base,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(base,'media/start.css'),'utf8');
test('dedicated preview is a top-level workspace page rather than nested within My Work',()=>{
 const workspaceStart=host.indexOf('<main id="workView"');
 const workspaceEnd=host.indexOf('  </main>',workspaceStart);
 const preview=host.indexOf('<main id="uxPreviewView"');
 const documents=host.indexOf('<main id="documentsView"');
 assert.ok(workspaceStart>=0&&workspaceEnd>workspaceStart&&preview>workspaceEnd&&documents>preview);
 assert.equal((host.match(/id="uxDesignPreviewPage"/g)||[]).length,1);
 assert.match(host.slice(preview,documents),/id="uxApproveDesign"/);
 assert.match(host.slice(preview,documents),/id="uxRejectDesign"/);
 assert.doesNotMatch(host.slice(workspaceStart,workspaceEnd),/id="uxDesignPreviewPage"/);
 assert.match(js,/setView\('uxPreview'\)/);
 assert.match(js,/view==='uxPreview'\)navigate\('sdlc-roles'\)/);
});
test('six circular steps indicate running stage and completion, with accessible current progress',()=>{
 assert.match(js,/const UX_STAGES=\[/);
 assert.match(js,/step\.classList\.toggle\('running',running\)/);
 assert.match(js,/step\.setAttribute\('aria-current','step'\)/);
 assert.match(js,/indicator\.textContent=running\?'Running…'/);
 assert.match(css,/\.ux-workflow-number\{width:52px;height:52px/);
 assert.match(css,/\.ux-workflow-step\.running \.ux-workflow-number::after/);
 assert.match(css,/@keyframes uxStageSpin/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('removes duplicate role progress only for UI/UX and right-aligns primary action',()=>{
 assert.match(js,/work\.classList\.toggle\('role-ux-designer',roleId==='ux-designer'\)/);
 assert.match(css,/#workView\.role-ux-designer > \.role-overview\{display:none!important\}/);
 assert.match(css,/#workView \.ux-design-actions\{justify-content:flex-end/);
 assert.match(host,/id="uxGenerateUIUX"/);
 assert.doesNotMatch(host,/id="uxGenerateWireframe"/);
});
test('preview hero follows Solution Designs page and keeps review safeguards',()=>{
 assert.match(host,/class="ux-preview-hero"/);
 assert.match(host,/id="uxPreviewVersion"/);
 assert.match(host,/id="uxPreviewMetadata"/);
 assert.match(js,/uxPipeline\.revisionNumber/);
 assert.match(js,/send\('uxPipelineDecide'/);
 assert.match(host,/id="uxRejectReason"/);
 assert.match(js,/if\(!reason\)/);
});
test('release version is 0.2.42',()=>{
 const pkg=require('../package.json');assert.equal(pkg.version,'0.3.49');assert.equal(pkg.atgvDisplayVersion,'0.3.49');
});
