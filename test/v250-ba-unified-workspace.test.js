'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('Business Requirement is embedded once above All Jira Project Items inside BA My Work',()=>{
 const start=host.indexOf('<main id="workView"');
 const end=host.indexOf('<main id="uxPreviewView"',start);
 const work=host.slice(start,end);
 assert.ok(start>=0&&end>start);
 const br=work.indexOf('<section id="discoveryView"');
 const jira=work.indexOf('<section id="baJiraInventorySection"');
 assert.ok(br>0&&jira>br,'BR workflow must precede project Jira inventory');
 assert.equal((host.match(/id="discoveryView"/g)||[]).length,1);
 assert.equal((host.match(/id="baJiraInventorySection"/g)||[]).length,1);
 assert.equal((host.match(/class="workflow-step atgv-milestone"/g)||[]).length,10);
 assert.match(work,/id="baCompletedSection"/);
 assert.match(work,/id="sourceDocuments"/);
 assert.match(work,/id="baDeleteIncomplete"/);
});

test('BA uses the embedded BR route and hides duplicate summary and role progress, other roles keep steps',()=>{
 assert.match(ui,/next==='discovery'\?'workView':next\+'View'/);
 assert.match(ui,/setView\(openWorkspace\?\(baWorkspace\?'discovery':'work'\):'myWork'\)/);
 assert.match(ui,/\$\('discoveryView'\)\.classList\.toggle\('hidden',next!=='discovery'\)/);
 assert.match(css,/#workView\.role-ba-simplified > \.role-overview\{display:none!important\}/);
 assert.match(css,/#workView\.role-ba-simplified #baMyWorkDashboard\{display:none!important\}/);
 assert.doesNotMatch(css,/#workView\s*>\s*\.role-overview\{display:none!important\}/);
 assert.match(host,/id="roleStepButtons"/);
});

test('no open BR shows numbered neutral milestone markers without altering historical approval records',()=>{
 assert.match(ui,/const hasOpenBrCycle=!!brState\?\.restartPending/);
 assert.match(ui,/const idleMilestones=!hasOpenBrCycle/);
 assert.match(ui,/node\.classList\.toggle\('done',!idleMilestones&&step\.complete\)/);
 assert.match(ui,/node\.dataset\.status=idleMilestones\?'idle':step\.state/);
 assert.match(ui,/const milestoneLine=idleMilestones\?0:/);
 assert.match(css,/#discoveryView \.discovery-workflow\.ba-milestones-idle \.workflow-step \.milestone-number\{display:block!important\}/);
 assert.match(css,/#discoveryView \.discovery-workflow\.ba-milestones-idle \.workflow-step \.milestone-tick\{display:none!important\}/);
});
