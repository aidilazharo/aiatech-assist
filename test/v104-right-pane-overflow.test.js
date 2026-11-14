'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const tab=require('../src/design-tab');
function render(kind,design){
 const item={id:'draft104',number:1,status:'draft',sourceHash:'current',actor:'Designer',at:'2026-10-31T00:00:00Z',design};
 return tab.render({item,kind,isLatest:true,approvedHash:'current',projectId:'project',nonce:'test104'});
}
test('all solution design previews use the internal ATGV right pane and never create a VS Code editor split',()=>{
 const section=host.slice(host.indexOf('async function openSolutionDesignInline('),host.indexOf('async function handleDashboardMessage('));
 assert.ok(section.length>300);
 assert.match(section,/dashboard\?\.webview\.postMessage\(\{type:'designOpenInline',kind,proposalId\}\)/);
 assert.doesNotMatch(host,/createWebviewPanel\('atgvAssist\.designTab'/);
 assert.doesNotMatch(host,/ViewColumn\.Two/);
 assert.doesNotMatch(host,/editorLayoutTwoColumns/);
});
test('database table cards stay within their card and wrap long values rather than overlap adjacent cards',()=>{
 const html=render('database',{title:'Database Design',summary:'Test',entities:[
  {name:'really_long_entity_identifier_that_needs_wrapping',description:'Review',fields:[
   {name:'very_long_external_reference_identifier_that_was_generated_by_ai',type:'NUMERIC(15,2)',key:true,required:true},
   {name:'created_at',type:'TIMESTAMPTZ',required:true}
  ],relationships:[]}
 ],assumptions:[],questions:[]});
 assert.match(html,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,390px\),1fr\)\)/);
 assert.match(html,/table-layout:fixed/);
 assert.match(html,/overflow-wrap:anywhere/);
 assert.match(html,/\.entity-card td code\{font:inherit;white-space:normal/);
 assert.match(html,/very_long_external_reference_identifier_that_was_generated_by_ai/);
 assert.match(html,/NUMERIC\(15,2\)/);
});
test('long generated diagram node titles wrap inside finite SVG node bounds while full aria label survives',()=>{
 const label='Permanent Project Management Office Project Identification and Approval Workflow';
 const html=tab.diagramSvg({nodes:[{id:'node-1',label,x:30,y:35,width:180,height:95}],edges:[]},'UX diagram');
 assert.match(html,/aria-label="Permanent Project Management Office Project Identification and Approval Workflow"/);
 const node=html.match(/<g class="diagram-node"[\s\S]*?<\/g>/)?.[0];
 assert.ok(node);
 assert.ok((node.match(/<text /g)||[]).length>1,'long label must use multiple rows');
 for(const t of node.matchAll(/<text [^>]*>([^<]+)<\/text>/g))assert.ok(t[1].length<26,'row must fit in node');
});
