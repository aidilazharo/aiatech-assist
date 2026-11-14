'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const view=host.slice(host.indexOf('<section id="developerTaskDashboard"'),host.indexOf('<div id="developerManualTickets"'));

test('Developer Tasks follows the reference from nine progress steps to BR picker, live status, tabs and delivery',()=>{
 const ids=['developerBrSteps','developerBrSelect','developerBrStart','developerBrStatus','developerBrOutput','developerDeliveryPanel'];
 const positions=ids.map(id=>view.indexOf(`id="${id}"`));
 assert.ok(positions.every(position=>position>=0));
 assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
 assert.equal((view.match(/class="developer-workflow-step[^\"]*developer-br-stage/g)||[]).length,9);
});

test('current verified Jira issue and current AC progress are aligned with the live activity row, not a duplicate header',()=>{
 const live=view.slice(view.indexOf('class="developer-br-live-status"'),view.indexOf('id="developerBrWorkArea"'));
 assert.match(live,/class="developer-br-activity-message"/);
 assert.match(live,/class="developer-br-live-meta"/);
 for(const id of ['developerBrCurrentJira','developerBrIssueStats','developerBrCriterionProgress']){
  assert.match(live,new RegExp('id="'+id+'"'));
  assert.equal((view.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(css,/\.developer-br-live-meta/);
 assert.match(css,/@container \(max-width:820px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('a resumed run stays in repair while loading issues; a failed retry re-requests its recovery state',()=>{
 assert.match(host,/await progress\(resuming\?'repair':'analyze','Development issue counts loaded from saved repair history\.'/);
 assert.match(client,/if\(developerBrSelected&&\!developerBrPreviewOnly\)send\('developerBrRecoveryInfo',\{brId:developerBrSelected\}\);/);
 assert.match(client,/developerBrFailedAt='green'/);
 assert.match(client,/Recovery ready: /);
});
