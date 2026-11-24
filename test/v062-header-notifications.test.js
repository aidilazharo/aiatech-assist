'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {FIXED_LIBRARY_REPOSITORY}=require('../src/lib/startup-setup');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const a=source.indexOf('function html(webview,{resumeLibrary=false}={}){'),b=source.indexOf('\nasync function dashboardState()',a);
const buildHtml=new Function('vscode','context','FIXED_LIBRARY_REPOSITORY',source.slice(a,b)+'\nreturn html');
const render=buildHtml({Uri:{joinPath:(_,...parts)=>parts.join('/')}},{extensionUri:{}},FIXED_LIBRARY_REPOSITORY);
const html=render({asWebviewUri:u=>u,cspSource:'vscode-resource:'});
test('header has a severity-aware dividing line, version under logo title and a separate accessible notification banner',()=>{
 assert.match(html,/<header class="app-header" id="appHeader" role="banner">/);
 assert.match(html,new RegExp('class="brand-versions">Extension v'+require('../package.json').atgvDisplayVersion.replace(/\./g,'\\.')));
 assert.match(html,/id="headerLibraryVersion"/);
 assert.match(css,/\.top-notification.success\{border-bottom-color:#3fc78d\}/);
 assert.match(css,/\.top-notification.warning,\.top-notification.info\{border-bottom-color:#e7ad46\}/);
 assert.match(css,/\.top-notification.error\{border-bottom-color:#ff5964\}/);
 assert.match(html,/id="topNotification"[^>]*role="status" aria-live="polite"/);
 for(const id of ['topNotificationIcon','topNotificationText','topNotificationAction','topNotificationDismiss'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(ui,/\$\('appHeader'\)\.classList\.add\('hidden'\)/);
 assert.doesNotMatch(ui,/\$\('appHeader'\)\.classList\.remove\('hidden'\)/);
});
test('discovery workflow has no process assignment and upload remains in document section',()=>{
 const start=html.indexOf('<section id="discoveryView"'),end=html.indexOf('<section id="baJiraInventorySection"',start);
 const page=html.slice(start,end);
 assert.doesNotMatch(page,/<h1>Business Requirements<\/h1>/);
 assert.match(page,/id="baStartPanel"/);
 assert.doesNotMatch(page,/id="baOwnerAction"|id="baOwnerStatus"/);
 assert.doesNotMatch(page,/Upload source documents, map evidence to the 12 BA questions/);
 const documents=page.slice(page.indexOf('<section class="source-documents-panel"'),page.indexOf('</section>',page.indexOf('<section class="source-documents-panel"')));
 assert.match(documents,/id="discoveryImport"/);
 assert.match(documents,/id="sourceDocumentCount"/);
 assert.equal((page.match(/id="discoveryImport"/g)||[]).length,1);
 assert.match(ui,/\$\('discoveryImport'\)\.addEventListener\('click',triggerDiscoveryImport\)/);
 assert.doesNotMatch(ui,/\$\('baOwnerAction'\)\.addEventListener/);
});
function mock(){
 const elements=new Map();
 const notifications=[];
 const navigation=[];
 const node=id=>{
  if(!elements.has(id)){
   const states=new Set(id==='topNotification'||id==='topNotificationAction'?['hidden']:[]);
   const events={};
   elements.set(id,{textContent:'',disabled:false,classList:{add:(...names)=>names.forEach(name=>states.add(name)),remove:(...names)=>names.forEach(name=>states.delete(name)),toggle:(name,force)=>{if(force===undefined?states.has(name):!force)states.delete(name);else states.add(name);}},states,events,addEventListener:(name,fn)=>{events[name]=fn;},scrollIntoView(){},click(){notifications.push('click:'+id);}});
  }
  return elements.get(id);
 };
 const first=ui.indexOf('const topNoticeQueue=[]'),last=ui.indexOf('function status(',first);
 assert.ok(first>=0&&last>first);
 const script=ui.slice(first,last)+'\nthis.api={notifyTop,closeTopNotification,topNoticeRoute};';
 const sandbox={$:node,navigate:x=>navigation.push(x),openBAWorkflowStep:()=>{navigation.push('discovery');return true;},setTimeout:()=>1,clearTimeout:()=>{},Date};
 vm.runInNewContext(script,sandbox);
 return {node,notifications,navigation,api:sandbox.api};
}
test('header remains visible when notification appears and dismisses without triggering actions',()=>{
 const {node,api,navigation}=mock();
 api.notifyTop('Ownership synchronized.',{success:true});
 assert.equal(node('topNotification').states.has('hidden'),false);
 assert.equal(node('appHeader').states.has('hidden'),false);
 assert.equal(node('topNotificationText').textContent,'Ownership synchronized.');
 assert.equal(node('topNotificationAction').textContent,'View Ownership');
 assert.deepEqual(navigation,[]);
 node('topNotificationDismiss').events.click();
 assert.equal(node('topNotification').states.has('hidden'),true);
 assert.equal(node('appHeader').states.has('hidden'),false);
 assert.deepEqual(navigation,[]);
});
test('document unchanged notices offer a safe navigation action; AI submission requires a click',()=>{
 const {node,api,navigation,notifications}=mock();
 api.notifyTop('Requirements.pdf has not changed.',{error:true});
 assert.equal(node('topNotificationAction').textContent,'Uploaded Documents');
 assert.deepEqual(navigation,[]);
 node('topNotificationAction').events.click();
 assert.deepEqual(navigation,['discovery']);
 assert.deepEqual(notifications,[]);
 api.notifyTop('Send document to AI for mapping.');
 assert.equal(node('topNotificationAction').textContent,'Send to AI');
 assert.deepEqual(notifications,[]);
});
