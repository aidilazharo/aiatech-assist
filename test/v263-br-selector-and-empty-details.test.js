'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const script=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('only tabs and delivery actions are selection gated; progress remains visible',()=>{
 const developer=html.slice(html.indexOf('<section id="developerTaskDashboard"'),html.indexOf('<div id="developerManualTickets"'));
 assert.match(developer,/id="developerBrDetails" class="developer-br-details"/);
 assert.match(developer,/id="developerBrWorkArea" class="developer-br-work-area hidden"/);
 assert.ok(developer.indexOf('id="developerBrDetails"') < developer.indexOf('id="developerBrSteps"'));
 assert.ok(developer.indexOf('id="developerBrSteps"') < developer.indexOf('id="developerBrSelect"'));
 for(const id of ['developerBrSteps','developerBrStatus','developerBrServerToggle','developerBrOutput','developerDeliveryPanel','developerDeliveryComplete']){
  assert.ok(developer.indexOf('id="'+id+'"') > developer.indexOf('id="developerBrDetails"'),id+' must be inside detail panel');
  assert.ok(developer.indexOf('id="'+id+'"') < developer.indexOf('</div><!-- /developerBrDetails'),id+' must be inside detail panel');
 }
 assert.match(css,/#workView \.developer-br-work-area\.hidden\{display:none!important\}/);
 assert.match(script,/\$\('developerBrDetails'\)\.classList\.remove\('hidden'\)/);
 assert.match(script,/\$\('developerBrWorkArea'\)\.classList\.toggle\('hidden',!hasSelectedBr\)/);
 assert.ok(developer.indexOf('id="developerBrSteps"') < developer.indexOf('id="developerBrWorkArea"'));
 assert.ok(developer.indexOf('id="developerBrServerToggle"') > developer.indexOf('id="developerBrWorkArea"'));
 assert.match(script,/\$\('developerBrProgressCount'\)\.classList\.remove\('hidden'\)/);
 assert.match(script,/\$\('developerBrStart'\)\.parentElement\?\.classList\.remove\('hidden'\)/);
 assert.doesNotMatch(script,/developerBrServerToggle'\)\.parentElement\?\.classList\.toggle\('hidden',!developerBrSelected\)/);
});

test('status appears as colored text inside the select without a second badge or colored dot',()=>{
 assert.match(html,/class="developer-br-picker-row"><select id="developerBrSelect"[\s\S]*?<span id="developerBrChangeBadge"/);
 assert.match(css,/\.developer-br-picker-row\{position:relative;display:block/);
 assert.match(css,/\.developer-br-picker-row \.developer-br-change-badge\{position:absolute;right:35px/);
 assert.match(css,/\.developer-br-picker-row select\{[^}]*padding-right:114px!important/);
 assert.match(script,/const label=\{new:'New',updated:'Updated',cancelled:'Cancelled','in-progress':'In Progress'\}/);
 assert.doesNotMatch(script,/🟢 New|🟠 Updated|🔴 Cancelled|● New/);
});
