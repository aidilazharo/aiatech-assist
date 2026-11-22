'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('prerequisite summary starts collapsed and contains one grid for every check',()=>{
 const begin=html.indexOf('<details id="startupPrerequisiteDetails"'),end=html.indexOf('</details>',begin);
 assert.ok(begin>=0&&end>begin);
 const section=html.slice(begin,end);
 assert.doesNotMatch(section.slice(0,section.indexOf('>')),/\sopen(?:\s|=|>)/);
 assert.match(section,/<summary class="atgv-tool-scan-status">/);
 for(const id of ['startupScanToolPercent','startupScanToolName','startupPermissionChecks','startupConnectionChecks','startupStackGrid','startupCopilotCard'])assert.ok(section.includes('id="'+id+'"'),id);
 assert.match(section,/<div class="atgv-startup-stack-grid">/);
 assert.match(css,/\.atgv-startup-permissions\{display:contents\}/);
 assert.match(css,/\.startup-stack-grid-items\{display:contents\}/);
 assert.match(css,/\.atgv-startup-prerequisites>\.atgv-tool-scan-status\{display:flex;align-items:center;justify-content:center/);
 assert.match(css,/\.atgv-startup-stack-grid details\.atgv-permission-row\{margin:0\}/,'permission cards must not inherit the global details margin');
 assert.match(css,/\.atgv-permission-row:not\(\[open\]\)>\.atgv-permission-step\{height:100%\}/,'closed permission cards fill the same grid row as technology cards');
});

test('permission cards keep concise labels, accessible details and their open state during updates',()=>{
 function node(tag){return {tag,children:[],dataset:{},attributes:{},className:'',style:{},open:false,textContent:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attributes[k]=v;},querySelectorAll(){return this.children.filter(item=>item.open&&item.className==='atgv-permission-row');}};}
 const checks=node('div'),document={createElement:node};
 const ring=ui.slice(ui.indexOf('function startupRing('),ui.indexOf('function updateStartupStackProgress('));
 const rows=ui.slice(ui.indexOf('function renderStartupPermissionRows('),ui.indexOf('function renderStartupPermissions('));
 const context={document,$:()=>checks,updateStartupIssueSummary(){}};
 vm.runInNewContext(ring+'\n'+rows,context);
 const input=[{id:'workspace',label:'VS Code workspace',ok:true,detail:'Trust verified'},{id:'folders',label:'Workspace and project folders',ok:false,detail:'Cannot write to project folder'}];
 context.renderStartupPermissionRows(input);
 assert.equal(checks.children.length,2);
 const [workspace,folders]=checks.children;
 assert.equal(workspace.tag,'details');assert.equal(workspace.children[0].tag,'summary');
 assert.equal(workspace.children[0].children[0].textContent,'Workspace');
 assert.equal(folders.children[0].children.at(-1).textContent,'Needs attention');
 assert.equal(folders.children[1].textContent,'Cannot write to project folder');
 folders.open=true;context.renderStartupPermissionRows(input);
 assert.equal(checks.children[1].open,true);
});

test('collapsed summary still reports checks that need attention',()=>{
 const start=ui.indexOf('function updateStartupIssueSummary('),end=ui.indexOf('function startupRing(',start);
 const message={},copilot={dataset:{progressState:'error'}};
 const context={$:id=>id==='startupScanSummaryIssues'?message:copilot,startupPermissions:{checks:[{ok:true},{ok:false}]},startupPermissionProgress:new Map(),startupConnectionCheckResults:new Map(),startupScanComplete:true,startupStackData:{stacks:[{ready:true},{ready:false}]}};
 vm.runInNewContext(ui.slice(start,end)+'\nupdateStartupIssueSummary()',context);
 assert.equal(message.textContent,'2 checks need attention');
 context.startupPermissions={checks:[{ok:true}]};context.startupStackData={stacks:[{ready:true}]};copilot.dataset.progressState='complete';
 vm.runInNewContext('updateStartupIssueSummary()',context);
 assert.equal(message.textContent,'');
});

test('Previous opens prerequisite checks on demand from the connection step',()=>{
 const start=ui.indexOf("$('startupPrevious').addEventListener"),end=ui.indexOf("$('startupEmail').addEventListener",start);
 assert.ok(start>=0&&end>start);
 let previous,requested=0,rendered=0,focused=0;
 const elements={
  startupPrevious:{addEventListener(_type,handler){previous=handler;}},
  startupPrerequisiteDetails:{open:true},
  startupRefresh:{focus(){focused++;}}
 };
 const context={$:id=>elements[id],startupPage:1,startupVerifying:false,startupInstallingModule:'',
  startupProceedMode:'manual',requestStartupReadiness(){requested++;},renderStartupPage(){rendered++;}};
 vm.runInNewContext(ui.slice(start,end),context);
 previous();
 assert.equal(context.startupPage,1,'wait while navigation is already pending');
 context.startupProceedMode='';
 previous();
 assert.equal(context.startupPage,0);
 assert.equal(elements.startupPrerequisiteDetails.open,false);
 assert.equal(requested,1);assert.equal(rendered,1);assert.equal(focused,1);
});
