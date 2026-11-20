'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const styles=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('Step 1 retains history and the milestone but has no redundant hero or nested creation button',()=>{
 assert.match(host,/<section id="baStartPanel" class="ba-start-history-only hidden"/);
 const start=host.indexOf('id="baStartPanel"'),history=host.indexOf('id="baCompletedSection"'),next=host.indexOf('class="source-documents-panel"');
 assert.ok(start<history&&history<next);
 assert.equal((host.match(/id="baNewRequirement"/g)||[]).length,1);
 assert.equal((host.match(/id="baStart"/g)||[]).length,0);
 assert.equal((host.match(/id="baCompletedSection"/g)||[]).length,1);
 assert.doesNotMatch(host,/class="ba-start-create-card"|class="ba-start-header"/);
 assert.match(host,/id="discoveryStepStart"/);
 assert.match(ui,/\$\('baStartPanel'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
});
test('Post-publication shortcuts are inside Step 10, not a floating banner',()=>{
 const start=host.indexOf('id="brJiraPublishStep"'),end=host.indexOf('id="baPostPublishActions"'),close=host.indexOf('id="baCRPanel"');
 assert.ok(start>0&&end>start&&close>end);
 for(const id of ['baStartMyWork','baStartSolutionDesigns','baStartSDLCReadiness'])assert.equal((host.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
});
test('Only the dedicated Jira progress indicator is displayed while publishing',()=>{
 assert.match(ui,/progress\.classList\.toggle\('hidden',!busy\)/);
 assert.match(ui,/statusNode\.classList\.toggle\('hidden',phase==='idle'\|\|busy\)/);
 assert.match(ui,/task==='jiraSync'\|\|task==='generate'/);
 assert.match(styles,/#discoveryView \.jira-publish-status\[data-phase="completed"\]/);
 assert.match(host,/id="brJiraPublishSummary" class="jira-publish-summary hidden"/);
});
test('Published confirmation does not reintroduce the Step 8 summary message',()=>{
 assert.match(ui,/if\(m\.type==='brJiraDone'\)/);
 const done=ui.slice(ui.indexOf("if(m.type==='brJiraDone')"),ui.indexOf("if(m.type==='brJiraDone')")+850);
 assert.match(done,/\$\('brJiraChanges'\)\.classList\.add\('hidden'\)/);
 assert.doesNotMatch(done,/Successfully published and recorded.*textContent/);
});
test('Release metadata retains valid post-v0.1.60 numbering',()=>{
 const pkg=require('../package.json');assert.match(pkg.version,/^\d+\.\d+\.\d+$/);assert.equal(pkg.atgvDisplayVersion,pkg.version);
});
