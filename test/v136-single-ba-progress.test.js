'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('only one visible main Business Requirements progress meter while processing',()=>{
 const host=read('test/generated/extension-source.txt'),css=read('media/start.css'),ui=read('media/start.js');
 assert.equal((host.match(/id="baRunning"/g)||[]).length,1);
 assert.equal((host.match(/id="baRunningText"/g)||[]).length,1);
 assert.doesNotMatch(host,/id="reviewHeadingProgress"|id="reviewHeadingProgressFill"/);
 assert.doesNotMatch(ui,/reviewHeadingProgress|reviewHeadingProgressFill/);
 assert.match(css,/#discoveryView:has\(#baRunning:not\(\.hidden\)\) #brGenerationProgress \.ba-stage-track/);
 assert.match(host,/id="jiraStageProgress"[^>]+role="progressbar"/); // Dedicated confirmed Jira progress in Step 10
 assert.match(host,/id="baReviewStageMessage"/);
});

test('Change Source Documents is absent; source stages and header Restart remain',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js');
 assert.doesNotMatch(host,/id="sourceChangeActions"|id="baRestartSources"|Change Source Documents/);
 assert.doesNotMatch(ui,/baRestartSources|sourceChangeActions|showSourceChange/);
 assert.match(host,/id="baNewRequirement"/);
 assert.match(ui,/startOrRestartBusinessRequirements/);
 assert.match(ui,/const showSources=displayed==='upload'/);
 assert.match(ui,/\$\('discoveryImport'\)\.disabled=sourceLocked/);
});
