'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
function makeHarness(){
 const elements={};
 const create=id=>({id,dataset:{},style:{},textContent:'',attributes:{},listeners:{},classList:{set:new Set(['hidden']),add(name){this.set.add(name);},remove(name){this.set.delete(name);},toggle(name,on){if(on)this.add(name);else this.remove(name);},contains(name){return this.set.has(name);}},setAttribute(name,val){this.attributes[name]=val;},addEventListener(event,fn){this.listeners[event]=fn;}});
 for(const id of ['brDeletionProgress','brDeletionProgressText','brDeletionProgressCount','brDeletionDismiss','brDeletionFill','brDeletionTrack'])elements[id]=create(id);
 const actions=[{disabled:false}];let nextId=0;const timers=new Map();
 const context={activeId:'projectA',document:{querySelectorAll:()=>actions},$:(id)=>elements[id],setTimeout:(fn,delay)=>{const id=++nextId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);
 const start=ui.indexOf('let brDeletionBusy=false;'),end=ui.indexOf('const JIRA_INVENTORY_PAGE_SIZE',start);
 assert.ok(start>=0&&end>start,'find scoped progress controller');
 vm.runInContext(ui.slice(start,end),context);
 const runTimer=()=>{const [id,item]=timers.entries().next().value||[];if(!id)return null;timers.delete(id);item.fn();return item.delay;};
 return {elements,actions,context,timers,runTimer,show:(...args)=>vm.runInContext(`showBRDeletionProgress(${args.map(a=>JSON.stringify(a)).join(',')})`,context),hide:()=>vm.runInContext('hideBRDeletionProgress()',context)};
}
test('deletion panel exposes a real dismiss button and scoped styling',()=>{
 assert.match(host,/id="brDeletionDismiss" type="button"/);
 assert.match(css,/\.br-deletion-dismiss\.hidden\{display:none!important\}/);
});
test('deletion success is visible then auto-hides after three seconds',()=>{
 const h=makeHarness();h.show('running','Removing Jira issues...',1,2);
 assert.equal(h.elements.brDeletionProgress.classList.contains('hidden'),false);
 assert.equal(h.elements.brDeletionDismiss.classList.contains('hidden'),true);
 assert.equal(h.actions[0].disabled,true);
 assert.equal(h.timers.size,0);
 h.show('completed','Deletion completed',1,1);
 assert.equal(h.elements.brDeletionProgress.classList.contains('hidden'),false);
 assert.equal(h.elements.brDeletionDismiss.classList.contains('hidden'),false);
 assert.equal(h.actions[0].disabled,false);
 assert.equal(h.runTimer(),3000);
 assert.equal(h.elements.brDeletionProgress.classList.contains('hidden'),true);
 assert.equal(h.elements.brDeletionProgress.dataset.phase,'idle');
});
test('deletion failure persists until the user dismisses it',()=>{
 const h=makeHarness();h.show('failed','Deletion failed: permissions missing');
 assert.equal(h.timers.size,0);
 assert.equal(h.elements.brDeletionProgress.classList.contains('hidden'),false);
 h.elements.brDeletionDismiss.listeners.click();
 assert.equal(h.elements.brDeletionProgress.classList.contains('hidden'),true);
});
test('new progress cancels stale completion auto-hide, and cancellation auto-hides',()=>{
 const h=makeHarness();h.show('completed','Done');
 assert.equal(h.timers.size,1);
 h.show('preparing','Checking affected records');
 assert.equal(h.timers.size,0);
 assert.equal(h.runTimer(),null);
 assert.equal(h.elements.brDeletionProgress.classList.contains('hidden'),false);
 h.show('cancelled','Cancelled');
 assert.equal(h.runTimer(),1500);
 assert.equal(h.elements.brDeletionProgress.classList.contains('hidden'),true);
});
