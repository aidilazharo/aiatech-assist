'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rag=require('../src/my-work-rag-context');
const read=relative=>fs.readFileSync(path.join(__dirname,'..',relative),'utf8');

test('My Work AI queries the same project-scoped RAG search interface as Knowledge & RAG',()=>{
 const called=[];
 const store={search(query,max){
  called.push({query,max});
  return [
   {docId:'confluence:123',title:'Approved project architecture',provider:'Confluence',url:'https://example.invalid/wiki/123',text:'Current integration uses event-driven payment messages.'},
   {docId:'jira:ABC-12',title:'Payment reconciliation',provider:'Jira',text:'Reconciliation acceptance criteria require auditable evidence.'}
  ];
 }};
 const result=rag.retrieve(store,'What are the payment integration requirements?',4);
 assert.deepEqual(called,[{query:'What are the payment integration requirements?',max:4}]);
 assert.equal(result.sources.length,2);
 assert.match(result.system,/event-driven payment messages/);
 assert.match(result.system,/Reconciliation acceptance criteria/);
 assert.match(result.system,/Cite relevant excerpts using \[1\], \[2\]/);
 assert.match(result.system,/untrusted source data/);
 assert.match(rag.references(result.sources),/\[1\] Approved project architecture \(Confluence\)/);
 assert.match(rag.references(result.sources),/https:\/\/example\.invalid\/wiki\/123/);
});

test('My Work RAG caps query size and sent evidence, and handles an empty index honestly',()=>{
 let searched='';
 const store={search(query,size){searched=query;assert.equal(size,6);
  return [{docId:'x',title:'T'.repeat(1000),provider:'Source',text:'a'.repeat(14000),url:'x'.repeat(900)}];}};
 const long=rag.retrieve(store,'q'.repeat(600),999);
 assert.equal(searched.length,500);
 assert.equal(long.sources[0].excerpt.length,1200);
 assert.equal(long.sources[0].title.length,140);
 assert.equal(long.sources[0].url.length,350);
 const none=rag.retrieve({search(){return [];}},'Requirements');
 assert.equal(none.sources.length,0);
 assert.match(none.system,/No matching indexed project excerpts/);
 assert.match(none.system,/Do not invent project-specific details/);
 assert.equal(rag.references(none.sources),'');
});

test('My Work role chat host uses project index, read-only AI system grounding and project isolation',()=>{
 const src=read('src/lib/runtime/extension-runtime.js');
 assert.match(src,/const myWorkRag=require\('\.\.\/\.\.\/my-work-rag-context'\)/);
 const start=src.indexOf("case 'roleAiChat':{"),end=src.indexOf("case 'roleAiReview':{",start);
 assert.ok(start>=0&&end>start);
 const handler=src.slice(start,end);
 assert.match(handler,/const projectKnowledge=store/);
 assert.match(handler,/myWorkRag\.retrieve\(projectKnowledge,msg\.message,cfg\(\)\.get\('rag.maxChunks',5\)\)/);
 assert.match(handler,/activeProject\?\.id!==projectId\|\|store!==projectKnowledge/);
 assert.match(handler,/askAiSendConsent/);
 assert.match(handler,/aiAnswer\(target,prompt,7000,\{system:rag\.system\+/);
 assert.match(handler,/activityContextText\(activity\)/);
 assert.match(handler,/liveProjectActivity\(projectId\)/);
 assert.match(handler,/myWorkRag\.references\(retrieved\)/);
 assert.match(handler,/myWorkRoleChat\.ask/);
 assert.doesNotMatch(handler,/store\.replace|store\.clear|writeConfluence|updateJira|publish\(/);
});

test('all right-pane pages and dialogs remove duplicate blue breadcrumb components',()=>{
 const js=read('media/start.js'),html=read('src/lib/webview/dashboard-html.js');
 const css=read('media/start.css');
 const start=js.indexOf('function renderWorkspaceBreadcrumbs(){');
 const end=js.indexOf('\nfunction setView(next){',start);
 const handler=js.slice(start,end);
 assert.match(handler,/querySelectorAll\('#contentPane > main, #brEditModal/);
 assert.match(handler,/querySelectorAll\('\.atgv-workspace-breadcrumbs'\)/);
 assert.match(handler,/node=>node\.remove\(\)/);
 assert.match(handler,/root\.classList\.remove\('has-workspace-breadcrumb'\)/);
 assert.doesNotMatch(handler,/document\.createElement\('nav'\)/);
 assert.match(css,/#contentPane \.atgv-workspace-breadcrumbs/);
 assert.match(html,/data-nav="sdlc-roles"[^>]*>[\s\S]{0,100}My Work<\/button>/);
 assert.match(html,/id="myWorkView"/);
 assert.match(html,/id="atgvMyWorkAiChatForm"/);
});
