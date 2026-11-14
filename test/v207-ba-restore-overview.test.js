'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const completedHistory=require('../media/completed-br-history');
const root=path.resolve(__dirname,'..');
const markup=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('Business Analyst overview keeps three metrics and the workflow shortcut, with no redundant table',()=>{
 const start=markup.indexOf('<section id="baMyWorkDashboard"');
 const end=markup.indexOf('<section id="baJiraInventorySection"',start);
 assert.ok(start>0&&end>start);
 const html=markup.slice(start,end);
 for(const phrase of ['Business Requirements','Review requirements, approvals and action items.','id="baMyWorkOpen"','id="baMyWorkMetrics"'])assert.ok(html.includes(phrase),phrase);
 assert.doesNotMatch(html,/id="baMyWorkItems"|id="baMyWorkFilter"|ba-my-work-toolbar|Business Requirements DataTable/);
 assert.match(css,/\.ba-my-work-metrics\{display:grid;grid-template-columns:repeat\(3/);
 assert.doesNotMatch(html,/Published Jira/);
});

test('Business Analyst overview counts active BR records without mounting a second DataTable',()=>{
 const from=ui.indexOf('function renderBAWorkDashboard(){');
 const to=ui.indexOf("$('baMyWorkOpen').addEventListener",from);
 assert.ok(from>=0&&to>from);
 const source=ui.slice(from,to);
 const metrics={children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);}};
 const nodes={baMyWorkMetrics:metrics};
 const makeNode=()=>({className:'',textContent:'',children:[],append(...children){this.children.push(...children);}});
 const context={
  $:key=>nodes[key],document:{createElement:makeNode},
  activeBusinessRequirements:()=>[
   {id:'BR-001',status:'approved',approvedContent:{title:'Approved'},approvedRevision:1},
   {id:'BR-002',status:'draft',title:'Draft'},
   {id:'BR-003',status:'approved',needsRefresh:true,title:'Needs review'}
  ],
  completedBARecords:()=>[],ATGVCompletedBRHistory:completedHistory,
  ATGVDataTables:{mount(){throw Error('Removed Business Requirements DataTable must not mount');}}
 };
 vm.runInNewContext(source+';this.render=renderBAWorkDashboard;',context);
 context.render();
 assert.deepEqual(metrics.children.map(x=>[x.children[1].textContent,x.children[0].textContent]),[['Total','3'],['Approved','1'],['Action required','2']]);
 context.render();
 assert.deepEqual(metrics.children.map(x=>x.children[0].textContent),['3','1','2']);
});


test('Business Analyst My Work counts immutable approved BR history after a new upload cycle',()=>{
 const from=ui.indexOf('function renderBAWorkDashboard(){');
 const to=ui.indexOf("$('baMyWorkOpen').addEventListener",from);
 const metrics={children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);}};
 const makeNode=()=>({className:'',textContent:'',children:[],append(...children){this.children.push(...children);}});
 const ctx={
  $:key=>key==='baMyWorkMetrics'?metrics:null,document:{createElement:makeNode},
  activeBusinessRequirements:()=>[],
  completedBARecords:()=>[{id:'archived-cycle',requirements:[{id:'BR-005',title:'Operational Performance and Availability',approvedRevision:1}]}],
  ATGVCompletedBRHistory:completedHistory
 };
 vm.runInNewContext(ui.slice(from,to)+';this.render=renderBAWorkDashboard;',ctx);
 ctx.render();
 assert.deepEqual(metrics.children.map(x=>x.children[0].textContent),['1','1','0']);
 // An active revision of the same BR does not inflate the historical count.
 ctx.activeBusinessRequirements=()=>[{id:'BR-005',status:'draft',title:'Revision in progress'}];
 ctx.render();
 // Approved counts the current revision; the archived approval remains in history.
 assert.deepEqual(metrics.children.map(x=>x.children[0].textContent),['1','0','1']);
});
