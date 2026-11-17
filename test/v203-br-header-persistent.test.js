'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const history=require('../media/completed-br-history');
test('one persistent header action invokes the guarded new BR workflow and auto-upload',()=>{
 assert.equal((host.match(/id="baNewRequirement"/g)||[]).length,1);
 assert.match(host,/id="baNewRequirement"[^>]*>\+ New Business Requirement<\/button>/);
 assert.match(ui,/\$\('baNewRequirement'\)\.addEventListener\('click',beginNewBusinessRequirement\)/);
 assert.match(ui,/send\('startOrRestartBusinessRequirements',\{revision:brState\.revision,openUploadImmediately:true\}\)/);
 assert.match(ui,/\$\('baNewRequirement'\)\.disabled=displayed!=='start'\|\|!activeId\|\|!brState/);
 assert.doesNotMatch(host,/id="baStart"/);
 assert.match(host,/id="baStartPanel" class="ba-start-history-only hidden"/);
});
test('completed requirement evidence remains accessible from Start',()=>{
 assert.match(ui,/\$\('baCompletedSection'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.match(host,/<div id="baCompletedSection" class="ba-completed-flat"/);assert.doesNotMatch(host,/ba-completed-summary|id="baCompletedCount"/);
 assert.match(ui,/details\.dataset\.requirementId=group\.id;details\.dataset\.requirementTarget=target;details\.open=expandedBrIds\.has\(target\)/);
 assert.equal(history.group([{requirements:[{id:'BR-009',title:'Visitor access'}]},{requirements:[{id:'BR-009',title:'Visitor access'}]}]).length,1);
 assert.match(ui,/root\.replaceChildren\(\)/);
});
