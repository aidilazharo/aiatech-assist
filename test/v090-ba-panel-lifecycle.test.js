'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../media/ba-automatic-ui.js'),'utf8').replace(/\r\n/g,'\n');
const begin=ui.indexOf('function resetWorkflowPanels(){');
const end=ui.indexOf('// A verified automatic Jira projection',begin);
assert.ok(begin>=0&&end>begin);
const source=ui.slice(begin,end);
const ids=['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira','baAutoHistory'];
function fixture(){const nodes=Object.fromEntries(ids.map(id=>[id,{open:true,hidden:true,dataset:{status:'not-started'}}]));const context={get:id=>nodes[id],dirty:()=>context.unsaved,unsaved:false};vm.createContext(context);vm.runInContext(source,context);return {nodes,context};}
test('all five panels remain visible, initially collapsed',()=>{const {nodes,context}=fixture();for(const id of ids){context.setReadyPanel(id,'not-started');assert.equal(nodes[id].hidden,false);assert.equal(nodes[id].open,false);}});
test('clean completion collapses only the completed panel',()=>{const {nodes,context}=fixture();for(const id of ids){context.setReadyPanel(id,'in-progress');nodes[id].open=true;}context.setReadyPanel(ids[0],'ready');assert.equal(nodes[ids[0]].open,false);assert.equal(nodes[ids[1]].open,true);});
test('dirty editor remains open, and ready panel can be reopened',()=>{const {nodes,context}=fixture();context.setReadyPanel(ids[0],'in-progress');nodes[ids[0]].open=true;context.unsaved=true;context.setReadyPanel(ids[0],'ready');assert.equal(nodes[ids[0]].open,true);context.unsaved=false;context.setReadyPanel(ids[0],'ready');assert.equal(nodes[ids[0]].open,true);});
test('reset closes five panels without hiding or mutating status',()=>{const {nodes,context}=fixture();for(const id of ids){context.setReadyPanel(id,'in-progress');nodes[id].open=true;}context.resetWorkflowPanels();for(const id of ids){assert.equal(nodes[id].open,false);assert.equal(nodes[id].hidden,false);assert.equal(nodes[id].dataset.status,'in-progress');}});
test('project and page navigation only collapse panels when edits are saved',()=>{
 assert.ok(ui.includes('if(requestedProject!==activeId){\n   if(!dirty())resetWorkflowPanels();'));
 const start=ui.indexOf("window.addEventListener('atgv:viewchange',");
 const end=ui.indexOf("window.addEventListener('message',",start);
 assert.ok(start>=0&&end>start);
 for(const unsaved of [false,true]){
  const {nodes,context}=fixture();
  let onViewChange,active=true,renders=0;
  Object.assign(context,{
   unsaved,requestedProject:'demo',active:()=>active,render:()=>{renders++;},
   window:{addEventListener(event,handler){
    assert.equal(event,'atgv:viewchange');
    onViewChange=handler;
   }}
  });
  vm.runInContext(ui.slice(start,end),context);
  onViewChange();
  assert.equal(context.requestedProject,'demo');
  for(const id of ids)assert.equal(nodes[id].open,true,id);
  active=false;
  onViewChange();
  assert.equal(context.requestedProject,'');
  for(const id of ids)assert.equal(nodes[id].open,unsaved,id);
  assert.equal(renders,2);
 }
});
