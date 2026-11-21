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
test('Active project repository URL preview still updates without extra source rows',()=>{
 const js=read('media/start.js');
 const start=js.indexOf('function updateStartupRepositoryPreview(){');
 const end=js.indexOf('\n// Display only the current sequential check.',start);
 assert.ok(start>0&&end>start);
 const nodes={
  startupGithubUrl:{value:'https://github.com/aiamalaysia/'},
  startupProjectRepository:{value:'project-repo'},
  startupProjectRepositoryPreview:{textContent:''}
 };
 const ctx={'$':id=>{
  assert.ok(nodes[id],'Unexpected startup preview lookup: '+id);
  return nodes[id];
 }};
 vm.runInNewContext(js.slice(start,end)+'\nupdateStartupRepositoryPreview();',ctx);
 assert.equal(nodes.startupProjectRepositoryPreview.textContent,'https://github.com/aiamalaysia/project-repo');
 nodes.startupGithubUrl.value='not-a-github-organization';
 vm.runInNewContext(js.slice(start,end)+'\nupdateStartupRepositoryPreview();',ctx);
 assert.equal(nodes.startupProjectRepositoryPreview.textContent,'Enter a valid GitHub organization and project repository.');
});
