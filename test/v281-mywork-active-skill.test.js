'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const roleSkill=require('../src/role-skill-identifier');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('role catalog SKILL.md without metadata uses the real verified path, never an invented ba.standard alias',()=>{
 const actual=fs.readFileSync(path.join(root,'test/fixtures/catalog/roles/business-analyst/SKILL.md'),'utf8');
 assert.deepEqual(roleSkill.describe('business-analyst',actual),{id:'roles/business-analyst/SKILL.md',source:'roles/business-analyst/SKILL.md',explicit:false});
});
test('catalog explicitly naming ba.standard displays its ID without changing its safe path',()=>{
 const markdown='---\nid: ba.standard\nname: Business Analyst\n---\n# Business Analyst';
 assert.deepEqual(roleSkill.describe('business-analyst',markdown),{id:'ba.standard',source:'roles/business-analyst/SKILL.md',explicit:true});
 assert.equal(roleSkill.describe('ux-designer','---\nskill_id: "ux.standard"\n---\n# UX').id,'ux.standard');
 assert.equal(roleSkill.describe('business-analyst','---\nid: ../../private-key\n---\n# BA').explicit,false);
 assert.throws(()=>roleSkill.describe('../../bad','# BA'),/Invalid/);
});
test('My Work shows a catalog driven acronym dropdown, not a static Skill badge',()=>{
 const start=ui.indexOf('function catalogRoleAcronym('),end=ui.indexOf('\nfunction renderRoleWork(){',start);
 assert.ok(start>0&&end>start);
 const element=()=>({textContent:'',value:'',disabled:false,children:[],dataset:{},title:'',attrs:{},
   append(node){this.children.push(node)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attrs[k]=v},addEventListener(){}});
 const host=element(),role=element(),select=element();
 const catalogState={installed:{version:'1.1.2',sha:'a'.repeat(40)},roleSkillOptions:{
  'business-analyst':[{id:'ba.standard',source:'roles/business-analyst/SKILL.md',label:'ba.standard',default:true},{id:'ba.agile',source:'roles/business-analyst/skills/agile.md',label:'ba.agile',default:false}],
  'software-developer':[{id:'roles/software-developer/SKILL.md',source:'roles/software-developer/SKILL.md',label:'standard',default:true}]
 },roleSkillSelections:{'business-analyst':'ba.agile'}};
 const ctx={selectedRole:'business-analyst',activeId:'test-project',catalogState,$:(id)=>({workSkill:host,workSkillRole:role,workSkillSelect:select})[id],document:{createElement:element},send:()=>{}};
 vm.runInNewContext(ui.slice(start,end),ctx);
 vm.runInNewContext('renderRoleSkillHeader()',ctx);
 assert.equal(role.textContent,'BA');assert.equal(select.value,'ba.agile');assert.equal(select.children.length,2);assert.equal(select.disabled,false);
 assert.equal(select.children[0].textContent,'ba.standard');assert.equal(select.children[1].textContent,'ba.agile');
 ctx.selectedRole='software-developer';vm.runInNewContext('renderRoleSkillHeader()',ctx);
 assert.equal(role.textContent,'DEV');assert.equal(select.children.length,1);assert.equal(select.children[0].textContent,'standard');
 ctx.selectedRole='solution-architect';vm.runInNewContext('renderRoleSkillHeader()',ctx);
 assert.equal(role.textContent,'SA');assert.equal(select.disabled,true);assert.equal(select.children[0].textContent,'Not loaded');
 ctx.catalogState.roleSkillOptions['solution-architect']=[{id:'sa.standard',source:'roles/solution-architect/SKILL.md',label:'sa.standard',default:true}];
 vm.runInNewContext('renderRoleSkillHeader()',ctx);assert.equal(select.value,'sa.standard');assert.equal(select.disabled,false);
 assert.equal(vm.runInNewContext("catalogRoleAcronym('ux-designer')",ctx),'UX');
 assert.match(ui,/catalogState=state;\s*if\(typeof syncRequiredLibraryGate==='function'\)queueMicrotask\(syncRequiredLibraryGate\);\s*renderRoleSkillHeader\(\)/);
 assert.match(ui,/send\('selectRoleSkill',\{roleId:selectedRole,skillId:select.value\}\)/);
});
test('My Work has acronym and select at the far right without the visible word Skill',()=>{
 assert.match(host,/id="workSkillRole"[^>]*>BA<\/span>/);
 assert.match(host,/id="workSkillSelect"[^>]*aria-label="BA catalog role variant"/);
 assert.doesNotMatch(host,/class="atgv-work-skill-label">Skill<\/span>/);
 assert.match(host,/case 'selectRoleSkill':/);
 assert.match(host,/roleSkillSelections/);
 assert.match(host,/workspaceState.update\(roleSkillSelectionKey\(activeProject.id,roleId\),skillId\)/);
 assert.match(css,/#workView\.role-software-developer > \.work-head\{display:flex!important;/);
 assert.match(css,/#workView > \.work-head \.atgv-work-skill\{margin-left:auto;/);
 assert.match(css,/#workView \.atgv-work-skill-select/);
});
