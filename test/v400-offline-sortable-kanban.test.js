'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Module=require('node:module');

const repoRoot=path.join(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(repoRoot,relative),'utf8');

class FakeNode{
 constructor(tag){
  this.tagName=tag.toUpperCase();this.children=[];this.dataset={};
  this.listeners={};this.attributes={};this.textContent='';this.className='';
 }
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(name,listener){this.listeners[name]=listener;}
 append(...items){for(const item of items){this.children.push(item);item.parentNode=this;}}
 replaceChildren(...items){this.children=[];this.append(...items);}
}
function findList(container,status){
 const board=container.children.find(node=>node.className==='atgv-kanban-board');
 return board.children.map(col=>col.children[1]).find(list=>list.dataset.status===status);
}

test('v413: SortableJS is pinned in the verified SDLC Library and absent from VSIX',()=>{
 const lock=require('../src/vendor-library-lock.json');
 assert.equal(lock.version,'1.0.1');
 const item=lock.assets.find(x=>x.path==='sortablejs/sortablejs-1.15.7.min.js');
 assert.ok(item);
 assert.equal(item.bytes,45478);
 assert.equal(item.sha256,'bf4241bc73fef7f11c59a283a69fe8051cdd31c6d8ff5a2b9ba219e7831fcf76');
 for(const name of ['sortablejs-1.15.7.min.js','sortablejs-LICENSE.txt','SORTABLEJS-NOTICE.md'])
  assert.equal(fs.existsSync(path.join(repoRoot,'media/vendor',name)),false);
 assert.doesNotMatch(read('media/atgv-kanban.js'),/https?:\/\/|import\(['"]|require\(['"]sortablejs/);
});
test('v413: verified Library SortableJS loads before Kanban with an offline native fallback',()=>{
 const original=Module._load;let createDashboardHtml;
 try{
  Module._load=function(name,parent,isMain){
   if(name==='vscode')return {Uri:{joinPath:(base,...parts)=>({fsPath:path.join(base.fsPath,...parts)}),file:fsPath=>({fsPath})}};
   return original.call(this,name,parent,isMain);
  };
  ({createDashboardHtml}=require('../src/lib/webview/dashboard-html'));
 }finally{Module._load=original;}
 const ctx=()=>({extensionUri:{fsPath:'/atgv-extension'}});
 const webview={asWebviewUri:uri=>uri.fsPath,cspSource:'vscode-resource:'};
 const html=createDashboardHtml(ctx,()=>({dir:'/verified-sdlc-library'}))(webview);
 const vendor=html.indexOf('src="/verified-sdlc-library/sortablejs/sortablejs-1.15.7.min.js"');
 const kanban=html.indexOf('src="/atgv-extension/media/atgv-kanban.js"');
 assert.ok(vendor>html.indexOf('</head>')&&vendor<kanban,'verified SortableJS must load before Kanban');
 assert.ok(kanban<html.indexOf('src="/atgv-extension/media/start.js"'));
 const missing=createDashboardHtml(ctx,()=>null)(webview);
 assert.ok(!missing.includes('sortablejs-1.15.7.min.js'));
 assert.ok(missing.includes('src="/atgv-extension/media/atgv-kanban.js"'));
 assert.doesNotMatch(html,/https?:\/\/(?:cdn|unpkg|jsdelivr)\./);
});

test('v400: drag-and-drop calls Jira callback, never locally changes Jira status',()=>{
 const previousDocument=global.document, previousSortable=global.Sortable;
 const instances=[],moves=[];
 global.document={createElement:tag=>new FakeNode(tag)};
 global.Sortable={create:(node,options)=>{
  const result={node,options,destroyed:false,destroy(){this.destroyed=true;}};
  instances.push(result);return result;
 }};
 const kanban=require('../media/atgv-kanban');
 const container=new FakeNode('div');
 const items=[
  {key:'TC-712',status:'To Do',type:'Epic',summary:'Person CRUD'},
  {key:'TC-758',status:'In Progress',type:'Story',summary:'Document execution'}
 ];
 try{
  kanban.render(container,items,{onMove:(item,to)=>moves.push([item.key,to])});
  assert.equal(instances.length,4,'one Sortable instance for each workflow column');
  assert.ok(instances.every(x=>x.options.group.name==='atgv-jira-kanban'));
  assert.ok(instances.every(x=>x.options.sort===false),'do not pretend Jira has a durable card rank');
  assert.ok(instances.every(x=>x.options.handle==='.atgv-kanban-grip'));
  const from=findList(container,'To Do'),to=findList(container,'In Progress');
  const card=from.children.find(x=>x.dataset.key==='TC-712');
  const instance=instances.find(x=>x.node===from);
  instance.options.onEnd({item:card,from,to});
  assert.deepEqual(moves,[['TC-712','In Progress']]);
  assert.equal(items[0].status,'To Do','Jira status remains unchanged pending confirmation');
  instance.options.onEnd({item:card,from,to:from});
  assert.equal(moves.length,1,'same-column drops never change Jira');
  kanban.render(container,items,{busy:true});
  assert.ok(instances.slice(0,4).every(x=>x.destroyed),'old listeners are cleaned up');
  assert.ok(instances.slice(4).every(x=>x.options.disabled));
 }finally{
  kanban.destroy();
  if(previousDocument===undefined)delete global.document;else global.document=previousDocument;
  if(previousSortable===undefined)delete global.Sortable;else global.Sortable=previousSortable;
 }
});

test('v400: native HTML5 fallback remains usable when vendor script cannot load',()=>{
 const previousDocument=global.document, previousSortable=global.Sortable;
 global.document={createElement:tag=>new FakeNode(tag)};
 delete global.Sortable;
 const kanban=require('../media/atgv-kanban');
 const container=new FakeNode('div'),moves=[];
 try{
  kanban.render(container,[{key:'TC-712',status:'To Do',type:'Epic',summary:'Person CRUD'}],{
   onMove:(item,to)=>moves.push([item.key,to])
  });
  const from=findList(container,'To Do'),to=findList(container,'In Progress');
  const card=from.children.find(x=>x.dataset.key==='TC-712');
  assert.equal(card.draggable,true);
  const dragData=new Map(),transfer={
   setData:(key,value)=>dragData.set(key,value),
   getData:key=>dragData.get(key)
  };
  card.listeners.dragstart({dataTransfer:transfer});
  to.listeners.drop({preventDefault(){},dataTransfer:transfer});
  assert.deepEqual(moves,[['TC-712','In Progress']]);
 }finally{
  kanban.destroy();
  if(previousDocument===undefined)delete global.document;else global.document=previousDocument;
  if(previousSortable===undefined)delete global.Sortable;else global.Sortable=previousSortable;
 }
});

test('v400: webview startup watches SortableJS failures and keeps permitted Jira transitions',()=>{
 const loader=read('media/library-loader-probe.js');
 const readiness=read('media/webview-asset-boot.js');
 const host=read('src/lib/runtime/extension-runtime.js');
 const ui=read('media/start.js');
 assert.match(loader,/sortablejs-1\\?\.15\\?\.7\\?\.min\\?\.js|sortablejs-1/);
 assert.doesNotMatch(readiness,/Bundled SortableJS could not initialize/);
 assert.match(readiness,/ATGV Kanban controller could not initialize/);
 assert.match(host,/case 'pmJiraTransition'/);
 assert.match(host,/jiraAvailableTransitions\(config,token,key\)/);
 assert.match(host,/jiraMove\(config,token,key,selected.id/);
 assert.match(ui,/queueMicrotask\(\(\)=>\{if\(pmKanbanPending\)renderPMDashboard\(\);\}\)/);
 assert.equal(require('../package.json').version,'0.4.11');
});


test('v400: Project Manager defaults to Jira DataTable and can switch to drag-and-drop Kanban',()=>{
 const original=Module._load;let createDashboardHtml;
 try{
  Module._load=function(name,parent,isMain){
   if(name==='vscode')return {Uri:{joinPath:(base,...parts)=>({fsPath:path.join(base.fsPath,...parts)})}};
   return original.call(this,name,parent,isMain);
  };
  ({createDashboardHtml}=require('../src/lib/webview/dashboard-html'));
 }finally{Module._load=original;}
 const html=createDashboardHtml(()=>({extensionUri:{fsPath:'/atgv-extension'}}),()=>null)({
  asWebviewUri:uri=>uri.fsPath,cspSource:'vscode-resource:'
 });
 for(const id of ['pmJiraWorkspace','pmJiraTableView','pmJiraKanbanView','pmShowTable','pmShowKanban','pmJiraTable','pmKanbanBoard']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'one '+id);
 }
 assert.match(html,/id="pmShowTable"[^>]*aria-pressed="true"/);
 assert.match(html,/id="pmShowKanban"[^>]*aria-pressed="false"/);
 assert.match(html,/id="pmJiraKanbanView" class="hidden"/);
 assert.ok(html.indexOf('id="pmJiraTableView"')<html.indexOf('id="pmJiraKanbanView"'));
 const script=read('media/start.js');
 assert.match(script,/let pmJiraDisplayMode='table'/);
 assert.match(script,/ATGVDataTables\.mount\(grid,matches,/);
 assert.match(script,/setPMJiraView\('table'\)/);
 assert.match(script,/setPMJiraView\('kanban'\)/);
 assert.match(script,/if\(pmJiraDisplayMode==='kanban'&&kanbanRoot/);
});
