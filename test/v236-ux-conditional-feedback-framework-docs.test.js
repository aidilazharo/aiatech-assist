'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const preview=host.slice(host.indexOf('<main id="uxPreviewView"'),host.indexOf('<main id="documentsView"'));
const workspace=host.slice(host.indexOf('<section id="uxDesignWorkspace"'),host.indexOf('<section id="roleJiraWork"'));

test('review field starts hidden, appears below the decision buttons only on disapproval, and is required',()=>{
 assert.match(preview,/id="uxRejectDesign"[^>]*aria-controls="uxReviewActions"[^>]*aria-expanded="false"/);
 assert.match(preview,/id="uxReviewActions" class="ux-review-actions hidden"/);
 assert.ok(preview.indexOf('id="uxReviewActions"')>preview.indexOf('id="uxRejectDesign"'));
 assert.match(preview,/id="uxRejectReason"[^>]*required/);
 assert.match(ui,/if\(\$\('uxReviewActions'\)\.classList\.contains\('hidden'\)\)\{/);
 assert.match(ui,/setUxRejectFeedback\(true\);\$\('uxRejectReason'\)\.focus\(\);return;/);
 assert.match(ui,/if\(!reason\).*?\$\('uxRejectReason'\)\.focus\(\)/);
 assert.match(ui,/setUxRejectFeedback\(false\);\$\('uxApproveDesign'\)/);
 assert.match(ui,/\$\('uxCancelDisapproval'\)\.addEventListener\('click'/);
 assert.match(ui,/decision:'rejected',expectedRevision:uxPipeline\.revision,reason/);
 assert.match(css,/#uxReviewActions\.hidden\{display:none\}/);
});

test('framework docs icon sits immediately to right of dropdown, opens pinned repo catalogue for AIA Qi',()=>{
 assert.match(workspace,/class="ux-framework-picker"><select id="uxDesignFramework"[\s\S]*?<\/select><button id="uxFrameworkDocs"/);
 assert.match(workspace,/aria-label="Show selected design framework style guide in right pane"/);
 assert.match(ui,/\$\('uxFrameworkDocs'\)\.addEventListener\('click',/);assert.match(ui,/send\('uxFrameworkOpenDocs',\{framework:\$\('uxDesignFramework'\)\.value\}\)/);
 assert.match(ui,/function updateUxFrameworkDocs\(\)/);
 assert.match(ui,/updateUxFrameworkDocs\(\);\s*renderUxProgress\(\);/);
 assert.match(host,/case 'uxFrameworkOpenDocs':\{/);
 assert.match(host,/sdlcCatalog\.designComponentCatalog\(workspace,framework\)/);
 assert.match(host,/uxFrameworkCatalogueLoaded/);assert.match(workspace,/id="uxFrameworkRightPane"/);
 assert.match(host,/sdlcCatalog\.designFrameworks\(workspace\)/);
 assert.doesNotMatch(host,/design\.aia\.com\/components/);
 assert.match(css,/#uxFrameworkDocs\{display:inline-flex/);
});
