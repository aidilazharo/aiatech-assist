'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {get,list}=require('../media/user-guide');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const css=read('media/start.css');
const controller=read('media/user-guide-controller.js');

test('guide cards use explicit white background and dark text styling',()=>{
 assert.ok(css.includes('.guide-menu-card{width:min(620px,100%);max-height:min(740px,calc(100vh - 36px));overflow-y:auto;background:#fff;'));
 assert.ok(css.includes('.guide-card{position:fixed;z-index:151;background:#fff;color:#111827;'));
 assert.ok(css.includes('.guide-menu-card .muted,.guide-card .muted{color:#4b5563}'));
});

test('settings can be guided from the start screen and settings route is supported without an opened workspace',()=>{
 const opening=list(['business-analyst'],false).map(g=>g.id);
 assert.ok(opening.includes('start-settings'));
 const settingsGuide=get('start-settings');
 assert.ok(settingsGuide.steps.some(step=>step.selector==='#startupConnectionForm'));
 assert.ok(settingsGuide.steps.some(step=>step.selector==='#roleSettingsSection'));
 assert.ok(controller.includes("if(step.route==='settings'){"));
});

test('my work and business requirement guides are available and target the expected workflow controls',()=>{
 const guides=list(['business-analyst','solution-architect'],true).map(g=>g.id);
 assert.ok(guides.includes('my-work'));
 assert.ok(guides.includes('business-requirement'));
 assert.deepEqual(get('my-work').steps.map(step=>step.selector),['#sidebarRoleTrigger','[data-nav="sdlc-roles"]','#roleChecklist','#handoffList']);
 assert.deepEqual(get('business-requirement').steps.map(step=>step.selector),['#discoveryImport','#discoveryForm','#discoveryCopilot','#brGenerate','#brJiraPreview']);
});
