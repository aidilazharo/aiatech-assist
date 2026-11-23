'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Start screen does not display extension and library repository URL listing',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 const css=read('media/start.css');
 assert.doesNotMatch(html,/id="startupRepositoryPreview"/);
 for(const label of ['Extension (required)','Library (required)','Extension releases (optional)','Library releases (optional)']){
  assert.equal(js.includes(label),false,label+' remains in visible preview renderer');
 }
 assert.doesNotMatch(js,/\$\('startupRepositoryPreview'\)/);
 assert.doesNotMatch(css,/atgv-repo-preview/);
 // Genuine connection inputs must remain available.
 for(const id of ['startupGithubUrl','startupProjectRepository','startupGithubToken','startupProjectRepositoryPreview','startupTestConnections','startupConnectionProgress'])
  assert.match(html,new RegExp('id="'+id+'"'));
});
test('Start never displays a derived project repository URL but retains connection fields',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 assert.ok(html.includes('id="startupProjectRepositoryPreview" hidden></small>'));
 assert.doesNotMatch(html,/https:\/\/github\.com\/aiamalaysia\/my-fow-technology-app-techassists(?![A-Za-z0-9_-])/);
 const start=js.indexOf('function updateStartupRepositoryPreview(){');
 const end=js.indexOf('\n// Display only the current sequential check.',start);
 assert.ok(start>0&&end>start);
 const nodes={startupProjectRepositoryPreview:{textContent:'old URL',hidden:false}};
 vm.runInNewContext(js.slice(start,end)+'\nupdateStartupRepositoryPreview();',{'$':id=>nodes[id]});
 assert.equal(nodes.startupProjectRepositoryPreview.textContent,'');
 assert.equal(nodes.startupProjectRepositoryPreview.hidden,true);
 assert.match(html,/id="startupProjectRepository"/);
});
