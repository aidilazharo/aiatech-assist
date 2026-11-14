'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tab=require('../src/design-tab');
const source=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const webview=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const info={id:'d1',number:1,status:'draft',sourceHash:'latest',design:{title:'Example Design',summary:'Review',screens:[{name:'Main',purpose:'Test',components:['Submit button','Email input'],interactions:['Save']}],flows:['Start'],assumptions:[],questions:[]}};
const render=(kind,design=info.design)=>tab.render({item:{...info,design},kind,isLatest:true,approvedHash:'latest',projectId:'p1',nonce:'n1'});
const dag={title:'System',nodes:[{id:'one',label:'Frontend',x:50,y:50,width:230,height:90},{id:'two',label:'Backend',x:360,y:50,width:230,height:90}],edges:[{from:'one',to:'two',label:'REST'}]};
test('every design category has dedicated, safe visual editor tab',()=>{
 const scenarios={design:info.design,ux:info.design,mockup:info.design,prototype:info.design,architecture:{title:'Architecture',summary:'Review',diagram:dag},api:{title:'API',summary:'Review',endpoints:[{method:'GET',path:'/items',operation:'List items',request:'',response:'Items',authorization:'Auth'}]},database:{title:'DB',summary:'Review',entities:[{name:'items',description:'Records',fields:[{name:'id',type:'INTEGER',key:true,required:true}],relationships:[]}]}};
 for(const [kind,design] of Object.entries(scenarios)){
  const html=render(kind,design);
  assert.match(html,/<main class="layout">/);
  assert.match(html,/script-src 'nonce-n1'/);
  assert.match(html,/function\(\)\{'use strict';const vscode=acquireVsCodeApi/);
  assert.match(html,/Edit Structured Design/);
  assert.match(html,/Approve Design/);
  assert.ok(html.length>4500,kind+' must have meaningful preview');
 }
 assert.match(render('design'),/Design System/);
 assert.match(render('ux'),/User Journey & Navigation Flow/);
 assert.match(render('mockup'),/mock-browser/);
 assert.match(render('prototype'),/data-screen-next/);
 assert.match(render('architecture',{title:'Architecture',diagram:dag}),/designSvg/);
 assert.match(render('api',scenarios.api),/OpenAPI JSON/);
 assert.match(render('database',scenarios.database),/Generated SQL schema/);
});
test('all design reviews stay inside the ATGV webview and do not create VS Code preview panels',()=>{
 assert.doesNotMatch(webview,/send\('designOpenTab'/);
 assert.match(webview,/Render inside ATGV's own right-side preview pane/);
 assert.match(source,/case 'designOpenTab':/);
 assert.match(source,/openSolutionDesignInline/);
 assert.doesNotMatch(source,/createWebviewPanel\('atgvAssist\.designTab'/);
 assert.doesNotMatch(source,/ViewColumn\.Two/);
});
test('protect HTML and revision identity before opening tabs',()=>{
 assert.equal(tab.escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
 const unsafe=render('mockup',{...info.design,title:'<img src=x onerror=alert(1)>'});
 assert.doesNotMatch(unsafe,/<img src=x onerror/);
 assert.match(unsafe,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(source,/if\(!designProposals\.KINDS\[kind\]\|\|typeof proposalId!==\'string\'\)throw Error\(\'Invalid design preview request\.\'\)/);
});
