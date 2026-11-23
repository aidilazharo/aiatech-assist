'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js');

test('startup and project-search screens no longer show Pause automatic opening',()=>{
 assert.doesNotMatch(html,/>Pause automatic opening</i);
 assert.doesNotMatch(html,/id="startupAutoPause"/);
 assert.doesNotMatch(html,/id="gateAutoPause"/);
 assert.doesNotMatch(ui,/startupAutoPause|gateAutoPause/);
 assert.match(html,/id="startupPrevious"/);
 assert.match(html,/id="startupProceed"/);
 assert.match(html,/id="gateSearchPrevious"/);
 assert.doesNotMatch(html,/<button id="gateSearchPrevious"[^>]+(?:\bhidden\b|tabindex="-1")/);
});
test('saved credentials do not auto-advance Start; Next requires explicit click',()=>{
 assert.doesNotMatch(ui,/STARTUP_SCREEN_MS|startupAutoTimer|Automatic opening paused/);
 assert.doesNotMatch(ui,/requestStartupProceed\(true\)|launchFromGate\(\{projectId,autoResume:true\}\)/);
 assert.match(ui,/\$\('startupProceed'\)\.addEventListener\('click'/);
 assert.match(ui,/startupProceedMode='manual'/);
 assert.match(ui,/\$\('gateSearchPrevious'\)\.disabled=gateBusy;/);
});
