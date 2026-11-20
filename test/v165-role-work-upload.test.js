'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const ui=read('media/start.js'),css=read('media/start.css'),host=read('test/generated/extension-source.txt');

test('main and timeline role selectors display every enabled role in configured order',()=>{
 assert.doesNotMatch(ui,/const VISIBLE_ROLE_IDS=/);
 assert.match(ui,/function visibleRoles\(\)\{const enabled=new Set\(roleSettings\.enabled/);
 assert.match(ui,/role\.id==='ux-designer'\?'UI\/UX Designer'/);
 assert.match(ui,/const picker=\$\('sidebarRole'\),roles=visibleRoles\(\)/);
 assert.match(ui,/for\(const role of visibleRoles\(\)\).*select\.append\(option\)/);
 assert.match(ui,/const isRole=visibleRoles\(\)\.some\(role=>role\.id===destination\)/);
 assert.doesNotMatch(ui,/roleData\.roles=roleData\.roles\.filter\(/);
});

test('Solution Architect and UI/UX My Work show the circle progress section only',()=>{
 assert.match(ui,/const focused=roleId!=='business-analyst'&&roleId!=='software-developer'/);
 assert.match(ui,/classList\.toggle\('role-progress-only',focused\)/);
 assert.match(css,/#workView\.role-progress-only > :not\(\.role-overview\):not\(#architectBootstrap\)\{display:none!important\}/);
 assert.match(css,/#workView\.role-progress-only \.role-activity-metric\{display:none!important\}/);
 assert.doesNotMatch(ui,/roleProgressDetails|Selected step outputs/);
 assert.match(ui,/work\.classList\.toggle\('role-progress-only',focused\)/);
 assert.match(host,/My Work · Progress Steps/);
});

test('Business Analyst upload picker enforces one active document per BR cycle',()=>{
 assert.match(host,/title:replacementDigest\?'Select an updated Word, PDF or Excel workbook':'Upload one Word, PDF or Excel workbook for this Business Requirement',canSelectMany:false/);
 assert.match(host,/if\(prospective\.length>1\)throw Error/);
 assert.match(ui,/Choose one Word, PDF or Excel workbook/);
 assert.match(host,/filters:\{'BRD and Jira Workbook':\['docx','pdf','xlsx'\]\}/);
});

test('per-document deletion remains available after mapping and uses linked BR confirmation',()=>{
 assert.match(ui,/remove\.disabled=!!baBusyTask\|\|!!sourceRemoving\|\|brDeletionBusy\|\|!baCanEdit\('ba-discovery'\)/);
 assert.match(ui,/requestBRDeletion\(\{target:'active-source',digest:doc\.digest,revision:brState\.revision\}\)/);
 assert.match(ui,/remove\.disabled=!!baBusyTask\|\|!!sourceRemoving\|\|brDeletionBusy\|\|!baCanEdit\('ba-discovery'\)/);
 assert.doesNotMatch(ui,/remove\.disabled=[^;]*baMappingComplete\(\)/);
 assert.match(host,/brWorkflow\.activeSourceDeletionImpact\(current,digest\)/);
 assert.match(host,/brWorkflow\.forceDeleteActiveSource/);
 assert.match(host,/await uiWarning\(message,\{modal:true/);
});
