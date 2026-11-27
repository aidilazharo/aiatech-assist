'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const script=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('v0.2.57 header stage pill is visually hidden but stage data remains available',()=>{
  assert.match(html,/id="workStage" class="pill hidden" aria-hidden="true"/);
  assert.match(script,/\$\('workStage'\)\.textContent=role\.stage/);
});

test('v0.2.57 Project Settings main section is a closed-by-default expandable panel',()=>{
  assert.match(html,/<details class="editor project-settings-panel" id="projectSettingsPanel"><summary/);
  assert.match(html,/<span id="formTitle">Project Settings<\/span><\/summary>/);
  assert.match(html,/<div class="project-settings-panel-body">[\s\S]*?<form id="projectForm">/);
  assert.match(script,/function collapseProjectSettings\(\)\{const panel=\$\('projectSettingsPanel'\);if\(panel\)panel\.open=false/);
  assert.match(script,/if\(returnToOpenProjectTab\)\{setView\('project'\);\}/);
});

test('v0.2.57 removes old progress panel for Solution Architect and Developer without removing project stack work',()=>{
  assert.match(script,/classList\.toggle\('role-solution-architect',architect\)/);
  assert.match(script,/classList\.toggle\('role-software-developer',roleId==='software-developer'\)/);
  assert.match(css,/#workView\.role-solution-architect > \.role-overview/);
  assert.match(css,/#workView\.role-software-developer > \.role-overview/);
  assert.match(html,/id="architectBootstrap"/);
});

test('v0.2.57 removes Developer legacy summary cards but preserves persisted role metrics',()=>{
  assert.match(css,/#workView\.role-software-developer > \.role-insight-grid\{display:none!important\}/);
  assert.match(script,/\$\('roleDocsReady'\)\.textContent=/);
  assert.match(script,/\$\('roleRemaining'\)\.textContent=/);
  assert.match(script,/\$\('roleNext'\)\.textContent=/);
});

test('v0.2.57 Developer circles appear right below the Developer Tasks heading and above ticket selector',()=>{
  const start=html.indexOf('id="developerTaskDashboard"');
  const end=html.indexOf('id="uxDesignWorkspace"',start);
  assert.ok(start>=0&&end>start);
  const panel=html.slice(start,end);
  const heading=panel.indexOf('<h2>Developer Tasks</h2>');
  const circles=panel.indexOf('id="developerWorkflowSteps"');
  const selector=panel.indexOf('id="developerAssignedTickets"');
  assert.ok(heading>=0&&circles>heading&&selector>circles);
  assert.doesNotMatch(panel,/Select a ticket to see implementation artifacts, progress, and completion evidence\./);
  assert.match(panel,/id="developerWorkflowStatus"/);
});
