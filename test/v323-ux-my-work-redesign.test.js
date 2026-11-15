'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const js=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
test('UI/UX Designer My Work groups a compact revision header and an accessible six-stage progress panel',()=>{
 const start=host.indexOf('<section id="uxDesignWorkspace"');
 const end=host.indexOf('<aside id="uxFrameworkRightPane"',start);
 const body=host.slice(start,end);
 assert.ok(start>=0&&end>start);
 for(const id of ['uxDesignVersionInfo','uxDesignProgressSummary','uxProgressSteps','uxSelectedTicket','uxDesignFramework','uxGenerateUIUX']){
  assert.ok(body.includes('id="'+id+'"')||id==='uxDesignProgressSummary'&&body.includes('id="uxProgressSummary"'),id);
 }
 assert.ok(body.indexOf('id="uxDesignVersionInfo"')<body.indexOf('id="uxProgressSteps"'));
 assert.ok(body.indexOf('id="uxProgressSteps"')<body.indexOf('id="uxSelectedTicket"'));
 assert.match(body,/ux-design-progress-panel/);
 assert.match(body,/role="status" aria-live="polite">Select a Business Requirement/);
});
test('UI/UX status summary is derived from rendered, verified phase flags, not invented percentages',()=>{
 assert.match(js,/const completed=root\.querySelectorAll\('\.ux-workflow-step\.complete'\)\.length/);
 assert.match(js,/const skipped=root\.querySelectorAll\('\.ux-workflow-step\.skipped'\)\.length/);
 assert.match(js,/uxPipeline\?\.status==='approved'/);
 assert.match(js,/summary\.textContent=uxPipelineBusy/);
 assert.doesNotMatch(js,/uxProgressSummary.*Math\.round/);
 assert.match(js,/root\.append\(current\)/);
 assert.match(js,/meta\.textContent='Generated '/);
 assert.match(js,/meta\.title=meta\.textContent/);
});
test('UI/UX layout uses global design tokens for circle size, color, type and active animation',()=>{
 assert.match(css,/#workView\.role-ux-designer \.ux-design-progress-panel/);
 assert.match(css,/\.ux-workflow-number\{width:var\(--atgv-ui-circle\);height:var\(--atgv-ui-circle\)/);
 assert.match(css,/animation:atgv-ui-active-ring var\(--atgv-ui-pulse-duration\)/);
 assert.match(css,/\.ux-workflow-step\.running \.ux-workflow-number::after\{display:none/);
 assert.match(css,/#workView\.role-ux-designer \.ux-revision-state\[data-status="approved"\]/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('UI/UX framework, approval and reference actions are preserved',()=>{
 for(const id of ['uxFrameworkSync','uxFrameworkDocs','uxUploadReference','uxDeleteEntireDesign','uxApproveDesign','uxRejectDesign','uxReferencePreview'])assert.ok(host.includes('id="'+id+'"'),id);
 for(const name of ['renderUxProgress','renderUxVersionInfo','renderUxFrameworkAvailability','renderUxActions'])assert.match(js,new RegExp('function '+name+'\\('));
 assert.match(require('../package.json').version,/^\d+\.\d+\.\d+$/);
});
