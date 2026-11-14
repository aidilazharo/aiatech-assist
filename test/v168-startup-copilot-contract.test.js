'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');

test('Startup uses the assigned Jira list, not a dashboard singleton',()=>{
 const start=fs.readFileSync(path.join(root,'media','start.js'),'utf8');
 const extension=fs.readFileSync(path.join(root,'test','generated','extension-source.txt'),'utf8');
 assert.doesNotMatch(start,/ATGVDeveloperCopilot\?\.create|ATGVDeveloperCopilot\?\.connect/);
 assert.match(start,/function loadAssignedJiraTasks/);
 assert.match(start,/function renderAssignedJiraTasks/);
 assert.match(extension,/case 'devCopilotTasks'/);
});
