'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('BA final action and Project Items accessible icon',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 assert.match(html,/id="baAutoBack"[^>]*aria-label="Project Items"><svg/);
 assert.match(html,/id="baAutoPublish"[^>]*>Approved and Publish<\/button>/);
});
test('foreign ownership disables shared actions',()=>{
 const ui=read('media/ba-automatic-ui.js'),host=read('src/lib/runtime/extension-runtime.js');
 assert.ok(ui.includes("Read-Only · Owner: "));
 assert.match(ui,/refresh\.disabled=sharedReadOnly\(\)/);
 assert.match(ui,/publish\.disabled=sharedReadOnly\(\)/);
 assert.match(ui,/edit\.disabled=busy\(\)\|\|!writable/);
 assert.match(host,/await requireBAWritableCycle\(initial\)/);
 assert.match(host,/await requireBAWritableCycle\(register\);\n for\(const id of scope\)await requireBAOwner/);
});
