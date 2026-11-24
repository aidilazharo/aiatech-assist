'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('delete action is outside the overflow and retains existing confirmation handler',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),start=read('media/start.js'),ui=read('media/ba-automatic-ui.js');
 assert.ok(html.indexOf('id="baAutoDeleteAction"')>html.indexOf('</details>',html.indexOf('id="baAutoOverflowMenu"')));
 assert.ok(start.includes('deleteToolbar.append(remove)'));
 assert.ok(start.includes("requestBRDeletion({target:'active-source'"));
 assert.ok(ui.includes('[data-br-delete-action="true"]'));
});
test('AI repair operates on owned current draft revisions and does not auto-approve',()=>{
 const ui=read('media/ba-automatic-ui.js'),runtime=read('src/lib/runtime/extension-runtime.js'),workflow=read('src/br-workflow.js');
 assert.ok(ui.includes("br.status==='draft'&&baCanEdit('ba-br-'+br.id)"));
 assert.ok(runtime.includes("owned.has('ba-br-'+row.id)"));
 assert.ok(runtime.includes('repairDraft:options.autoResolve===true'));
 assert.ok(workflow.includes('previous=repairDraft?existing:existing.approvedContent||existing'));
 assert.ok(workflow.includes('if(existing.approvedContent&&!repairDraft)'));
});
