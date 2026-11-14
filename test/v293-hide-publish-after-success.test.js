'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
test('hide Publish Jira after success but allow new approved revision',()=>{
 assert.match(ui,/\$\('brJiraSync'\)\.classList\.toggle\('hidden',!brPlanRevision&&\(baPublishedCurrent\(\)\|\|jiraPublishState\.phase==='completed'\)\)/);
 assert.match(ui,/if\(m\.type==='brJiraDone'\)/);
 assert.match(ui,/brPlanRevision=null;brJiraPlanChanges=0;brJiraPreviewApproved=false/);
 assert.match(ui,/renderDiscoverySummary\(\)/);
});
