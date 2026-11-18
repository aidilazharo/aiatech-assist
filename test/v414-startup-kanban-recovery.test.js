'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const setup=require('../src/lib/startup-setup');

test('v414: fixed Library source and project repository moves out of Start',()=>{
 const parsed=setup.validate({...setup.DEFAULTS,projectRepoUrl:'https://github.com/evil/ignored',libraryRepoUrl:'https://github.com/evil/ignored'});
 assert.equal(parsed.libraryRepoUrl,'https://github.com/aidilazharo/tech-stacks-skills');
 assert.equal(parsed.project,undefined);
 const html=read('src/lib/webview/dashboard-html.js');
 const start=html.slice(html.indexOf('<form id="startupConnectionForm"'),html.indexOf('</form>',html.indexOf('<form id="startupConnectionForm"')));
 assert.doesNotMatch(start,/id="startupProjectRepo"|id="startupLibraryRepo"/);
 assert.doesNotMatch(start,/id="startupLibraryZipUpload"|id="startupLibraryZipStatus"|atgv-library-source-label/);
 assert.match(html,/id="projectGithubRepositoryUrl"/);
 const ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
 assert.match(ui,/projectGithubRepositoryUrl'\)\.value/);
 assert.match(host,/repositoryUrl:startupSetup.FIXED_LIBRARY_REPOSITORY/);
 assert.doesNotMatch(host,/for\(const repo of \[data.project\]\)/);
});

test('v414: rendered SortableJS closes its script tag before loading the Kanban controller',()=>{
 const old=Module._load;let createDashboardHtml;
 try{
  Module._load=function(name,parent,isMain){
   if(name==='vscode')return {Uri:{joinPath:(base,...parts)=>({fsPath:path.join(base.fsPath,...parts)}),file:fsPath=>({fsPath})}};
   return old.call(this,name,parent,isMain);
  };
  ({createDashboardHtml}=require('../src/lib/webview/dashboard-html'));
 }finally{Module._load=old;}
 const html=createDashboardHtml(()=>({extensionUri:{fsPath:'/atgv-extension'}}),()=>({dir:'/verified-library'}))({
  asWebviewUri:uri=>uri.fsPath,cspSource:'vscode-resource:'
 });
 const a='<script src="/verified-library/sortablejs/sortablejs-1.15.7.min.js"></script>';
 const b='<script src="/atgv-extension/media/atgv-kanban.js"></script>';
 assert.ok(html.includes(a+b),'complete SortableJS closing tag must separate independent scripts');
 assert.ok(html.indexOf(b)<html.indexOf('</head>'),'controller loads in head');
 const boot=read('media/webview-asset-boot.js');
 assert.match(boot,/Optional Kanban controller unavailable/);
 assert.doesNotMatch(boot,/\['ATGV Kanban controller could not initialize'\]/);
 const ui=read('media/start.js');
 assert.match(ui,/if\(mode==='kanban'&&\(!window.ATGVKanban/);
});
