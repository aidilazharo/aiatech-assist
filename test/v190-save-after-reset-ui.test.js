'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
function extract(name){
 const match=source.match(new RegExp('function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
 assert.ok(match,name+' is present');return match[0];
}
function mock(){
 const controls=Object.fromEntries(['architectStackSelect','architectSaveStack','architectResetStack','architectTestStack','architectApproveStack'].map(id=>[id,{value:'',disabled:false,title:''}]));
 const context=vm.createContext({
  activeId:'project-a',techStacks:[{id:'react'},{id:'angular'}],
  architectStackDraft:{projectId:'',stackId:''},architectActionBusy:false,
  $:id=>controls[id]
 });
 vm.runInContext(extract('architectStackSelection')+'\n'+extract('syncArchitectStackButtons'),context);
 return {controls,context,call(name,project){return vm.runInContext(name+'(project)',vm.createContext({...context,project}));}};
}
test('after successful Reset Tech Stack, Save is re-enabled for the retained selection',()=>{
 const {controls,context}=mock();
 const selectedBefore={techStackId:'react',techStackPrepared:{stackId:'react'}};
 assert.equal(vm.runInContext('architectStackSelection(project)',vm.createContext({...context,project:selectedBefore})),'react');
 controls.architectStackSelect.value='react';
 context.architectActionBusy=true;
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project:selectedBefore}));
 assert.equal(controls.architectSaveStack.disabled,true);
 // The reset completes and clears the stack in the project registry, but the
 // architect's pending React selection should survive and be saveable.
 context.architectActionBusy=false;
 const afterReset={techStackId:'',techStackPrepared:null};
 assert.equal(vm.runInContext('architectStackSelection(project)',vm.createContext({...context,project:afterReset})),'react');
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project:afterReset}));
 assert.equal(controls.architectSaveStack.disabled,false);
 assert.equal(controls.architectResetStack.disabled,true);
 assert.equal(controls.architectTestStack.disabled,true);
});
test('after reset, changing selection allows Save; blank selections and active operations do not',()=>{
 const {controls,context}=mock();
 const project={techStackId:'',techStackPrepared:null};
 context.architectStackDraft={projectId:'project-a',stackId:'angular'};
 controls.architectStackSelect.value='angular';
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project}));
 assert.equal(controls.architectSaveStack.disabled,false);
 controls.architectStackSelect.value='';
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project}));
 assert.equal(controls.architectSaveStack.disabled,true);
 controls.architectStackSelect.value='angular';context.architectActionBusy=true;
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project}));
 assert.equal(controls.architectSaveStack.disabled,true);
});
test('selecting another prepared stack offers a confirmed Switch & Save action',()=>{
 const {controls,context}=mock();
 controls.architectStackSelect.value='angular';
 const project={techStackId:'react',techStackPrepared:{stackId:'react'}};
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project}));
 assert.equal(controls.architectSaveStack.disabled,false);
 assert.equal(controls.architectSaveStack.textContent,'Switch & Save Stack');
 assert.match(controls.architectSaveStack.title,/confirm switching/);
});
test('switch action is disabled only while busy and never bypasses the guarded Git reset',()=>{
 const {controls,context}=mock();
 controls.architectStackSelect.value='angular';
 const project={techStackId:'react',techStackPrepared:{stackId:'react',branch:'bootstrap/react-initial'}};
 context.architectActionBusy=true;
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project}));
 assert.equal(controls.architectSaveStack.disabled,true);
 context.architectActionBusy=false;
 vm.runInContext('syncArchitectStackButtons(project)',vm.createContext({...context,project}));
 assert.equal(controls.architectSaveStack.disabled,false);
 const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const handler=host.slice(host.indexOf("case 'architectSaveStack':{"),host.indexOf("case 'architectTestStack':{"));
 assert.match(handler,/resetService\.plan\(\{root,project:priorPrepared,baseBranch\}\)/);
 assert.match(handler,/uiWarning\('Switch technology stack/);
 assert.match(handler,/if\(proceed!==action\).*?break;/);
 assert.match(handler,/resetService\.reset\(\{root,project:priorPrepared,baseBranch,expectedPlan:plan\}\)/);
 assert.match(handler,/techStackGeneration:result\.nextGeneration/);
 assert.match(handler,/orchestrator\.bootstrap\(\{root,stackId:id,generation:preparedProject\.techStackGeneration/);
});
test('dashboard render and response handlers recalculate Save state after reset',()=>{
 assert.match(source,/picker\.value=architectStackSelection\(project\);[\s\S]*?syncArchitectStackButtons\(project\);/);
 assert.match(source,/architectActionBusy=false;renderRoleWork\(\);/);
 assert.match(source,/architectStackSelect'\)\.addEventListener\('change'/);
 assert.match(source,/if\(msg\.type==='architectStackCancelled'\|\|msg\.type==='architectStackError'\)[\s\S]*?syncArchitectStackButtons/);
});
