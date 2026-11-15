'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const root=path.join(__dirname,'..');
const entry=fs.readFileSync(path.join(root,'src/extension.js'),'utf8');
const runtime=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
const renderer=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
test('0.3.52 entry point delegates to packaged internal runtime instead of containing monolithic SDLC implementation',()=>{
 assert.ok(entry.split('\n').length<10);
 assert.match(entry,/module\.exports=require\('\.\/lib\/runtime\/extension-runtime'\)/);
 assert.match(runtime,/function activate\(ctx\)/);
 assert.match(runtime,/async function handleDashboardMessage\(msg\)/);
 assert.match(runtime,/const html=createDashboardHtml\(\(\)=>context,\(\)=>installedVendorAssets\)/);
 assert.doesNotMatch(runtime,/function html\(webview/);
 assert.match(renderer,/function html\(webview/);
});
test('dashboard renderer obtains current extension context, vendor asset availability, and version',()=>{
 const mockVscode={Uri:{joinPath:(root,...items)=>[root.fsPath,...items].join('/'),file:file=>({fsPath:file})}};
 const previous=Module._load;
 let createDashboardHtml;
 try{
  Module._load=function(request,parent,isMain){return request==='vscode'?mockVscode:previous.call(this,request,parent,isMain);};
  ({createDashboardHtml}=require('../src/lib/webview/dashboard-html'));
 }finally{Module._load=previous;}
 let context={extensionUri:{fsPath:'/extension-A'}};
 const render=createDashboardHtml(()=>context,()=>null);
 const webview={asWebviewUri:value=>typeof value==='string'?value:value.fsPath,cspSource:'vscode-resource:'};
 const first=render(webview);
 assert.match(first,/v0\.3\.52/);
 assert.match(first,/id="appHeader"/);
 assert.match(first,/\/extension-A\/media\/start\.js/);
 assert.match(first,/name="atgv-vendor-libs" content="missing"/);
 context={extensionUri:{fsPath:'/extension-B'}};
 const second=render(webview,{resumeLibrary:true});
 assert.match(second,/\/extension-B\/media\/start\.js/);
 assert.match(second,/name="atgv-resume-library" content="yes"/);
});
test('source-based regression index is generated from active modules and preserves the original HTML position',()=>{
 const legacy=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
 assert.ok(legacy.indexOf('function html(webview')<legacy.indexOf('async function loadRemoteLinks'));
 assert.ok(legacy.includes('async function handleDashboardMessage(msg)'));
 assert.ok(legacy.includes('id="appHeader"'));
});
