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
 assert.match(html,/id="gateAutoMessage"/);
});
test('automatic opening remains safe, with cancellation on manual navigation and failed checks',()=>{
 assert.match(ui,/function stopStartupAuto\(message='Automatic opening paused\.'\)/);
 assert.match(ui,/if\(startupAutoTimer\)clearTimeout\(startupAutoTimer\)/);
 assert.match(ui,/function beginStartupAuto\(stage\)/);
 assert.match(ui,/if\(stage==='project'\)/);
 assert.match(ui,/launchFromGate\(\{projectId,autoResume:true\}\)/);
 assert.match(ui,/if\(!selection\.autoResume&&startupAutoEnabled\)stopStartupAuto/);
 assert.match(ui,/startupPermissions\.ok/);
 assert.match(ui,/startupConnectionVerified/);
 assert.match(ui,/startupPrerequisiteDetails'\)\.addEventListener\('toggle'/);
});
