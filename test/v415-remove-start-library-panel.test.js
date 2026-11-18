'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v415: Start has only account connection fields, no SDLC Library panel, upload icon or status',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const start=html.slice(html.indexOf('<form id="startupConnectionForm"'),html.indexOf('</form>',html.indexOf('<form id="startupConnectionForm"'))+7);
 assert.ok(start.startsWith('<form'),'Start connection form exists');
 for(const id of ['startupJiraUrl','startupConfluenceUrl','startupEmail','startupAtlassianToken','startupGithubUrl','startupGithubToken'])
  assert.ok(start.includes('id="'+id+'"'),id+' retained');
 for(const id of ['startupLibraryRepo','startupProjectRepo','startupLibraryZipUpload','startupLibraryZipStatus'])
  assert.ok(!start.includes('id="'+id+'"'),id+' removed');
 assert.doesNotMatch(start,/atgv-library-source-label|atgv-startup-library-upload-row|Managed by ATGV|Offline ZIP/);
 assert.match(html,/id="projectGithubRepositoryUrl"/,'project GitHub URL remains in Project Settings');
});
test('v415: webview initializes without references to removed elements',()=>{
 const ui=read('media/start.js'),css=read('media/start.css');
 assert.doesNotMatch(ui,/startupLibraryZipUpload|startupLibraryZipStatus|STARTUP_LIBRARY_REPO/);
 assert.doesNotMatch(css,/startupLibraryZipStatus|atgv-startup-library-upload-row/);
 assert.doesNotMatch(ui,/if\(message\.type==='offlineLibraryZipResult'\)/);
});
test('v415: Library source and optional offline ZIP import remain in trusted host',()=>{
 const setup=require('../src/lib/startup-setup');
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.equal(setup.FIXED_LIBRARY_REPOSITORY,'https://github.com/aidilazharo/tech-stacks-skills');
 assert.match(host,/case 'importLibraryZip':/);
 assert.match(host,/offlineLibrary\.importZip/);
 assert.match(host,/releaseRepositoryUrl:releaseUpdater\.PINNED_RELEASE_URL/);
 assert.match(host,/libraryReleaseUrl:libraryReleaseUpdater\.LATEST_URL/);
 assert.equal(require('../package.json').version,'0.4.16');
});
test('v415: rendered Start HTML does not inject the removed Library block',()=>{
 const previous=Module._load;let createDashboardHtml;
 try{
  Module._load=function(name,parent,isMain){
   if(name==='vscode')return {Uri:{joinPath:(base,...parts)=>({fsPath:path.join(base.fsPath,...parts)}),file:fsPath=>({fsPath})}};
   return previous.call(this,name,parent,isMain);
  };
  ({createDashboardHtml}=require('../src/lib/webview/dashboard-html'));
 }finally{Module._load=previous;}
 const html=createDashboardHtml(()=>({extensionUri:{fsPath:'/atgv-extension'}}),()=>null)({
  asWebviewUri:uri=>uri.fsPath,cspSource:'vscode-resource:'
 });
 const start=html.slice(html.indexOf('<form id="startupConnectionForm"'),html.indexOf('</form>',html.indexOf('<form id="startupConnectionForm"')));
 assert.doesNotMatch(start,/SDLC Library|startupLibraryZip|Managed by ATGV|Offline ZIP/);
 assert.match(start,/Jira, Confluence &amp; GitHub connections/);
});
