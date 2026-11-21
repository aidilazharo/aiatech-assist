'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const profiles=require('../src/my-work-role-prompts').ROLES;

function inlineNoticeFor(pane){
 const begin=source.indexOf('function atgvInlineNotice(message,error=false){');
 const end=source.indexOf('\n// Unified, truthful per-process progress display',begin);
 assert.ok(begin>=0&&end>begin,'Inline notice handler must exist');
 let created=0;
 const document={
  querySelector:()=>pane,
  createElement:()=>{created++;return {textContent:'',dataset:{},classList:{toggle(){}},setAttribute(){}};}
 };
 const factory=new Function('document','$','atgvSeverity',source.slice(begin,end)+'\nreturn atgvInlineNotice;');
 return {notice:factory(document,()=>null,()=> 'warning'),created:()=>created};
}

test('AI-only My Work never renders duplicate Confluence warning below the global notification',()=>{
 let removed=0;
 const pane={id:'myWorkView',querySelector:selector=>{
  assert.equal(selector,'.atgv-page-feedback');
  return {remove(){removed++;}};
 },insertBefore(){throw Error('No inline warning allowed in My Work');}};
 const handler=inlineNoticeFor(pane);
 handler.notice('Confluence source synchronization needs review: Confluence contains different Business Requirements, source documents.',true);
 assert.equal(handler.created(),0);
 assert.equal(removed,1);
 handler.notice('Another actionable status',false);
 assert.equal(handler.created(),0);
 assert.equal(removed,2);
});

test('the global warning, ownership route and Confluence conflict protections are retained',()=>{
 assert.match(source,/function notifyTop\(message,/);
 assert.match(source,/topNoticeRoute\(content,error,route\)/);
 assert.match(source,/View Ownership/);
 assert.match(source,/if\(next==='myWork'\)target\.querySelector\?\.\('\.atgv-page-feedback'\)\?\.remove\(\)/);
 assert.match(html,/id="topNotification"/);
 assert.match(html,/id="myWorkView"/);
 assert.match(html,/id="atgvMyWorkAiChatForm"/);
 assert.match(source,/if\(pane\.id==='discoveryView'\)/);
 assert.equal(Object.keys(profiles).length,18);
});

test('non-error progress remains available on other role pages',()=>{
 let inserted=0;
 const pane={id:'planningView',querySelector:()=>null,querySelectorAll:()=>[],
  insertBefore(){inserted++;},append(){inserted++;},firstChild:null};
 const {notice,created}=inlineNoticeFor(pane);
 notice('Overview updated',false);
 assert.equal(created(),1);
 assert.equal(inserted,1);
});

test('Overview omits redundant inline statuses, leaving global notices intact',()=>{
 let removed=0;
 const pane={id:'landingView',querySelector:()=>({remove(){removed++;}}),
   insertBefore(){throw Error('Overview may not add an inline banner');}};
 const {notice,created}=inlineNoticeFor(pane);
 notice('Confluence sync needs review',true);
 notice('Overview updated',false);
 assert.equal(created(),0);
 assert.equal(removed,2);
});
